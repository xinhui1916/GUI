use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use std::process::Stdio;
use tokio::process::Command;
use tokio::sync::{oneshot, Mutex};
use tauri::{AppHandle, Emitter};

const REQUEST_TIMEOUT_SECS: u64 = 30;
const INIT_TIMEOUT_SECS: u64 = 15;

// ── LspManager ───────────────────────────────────────────────────────

pub struct LspManager {
    servers: Arc<Mutex<HashMap<String, LspServerState>>>,
}

struct LspServerState {
    stdin: tokio::process::ChildStdin,
    next_id: AtomicU64,
    pending: Arc<std::sync::Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
    #[allow(dead_code)]
    capabilities: Value,
}

impl LspManager {
    pub fn new() -> Self {
        LspManager {
            servers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start a language server for the given language in the given workspace.
    /// Returns a server ID of the form `{language}@{workspace}`.
    pub async fn start_server(
        &self,
        app: AppHandle,
        language: &str,
        workspace: &str,
    ) -> Result<String, String> {
        let key = format!("{}@{}", language, workspace);

        // Already running
        {
            let servers = self.servers.lock().await;
            if servers.contains_key(&key) {
                return Ok(key);
            }
        }

        let (cmd, args) =
            detect_server(language).ok_or_else(|| {
                format!(
                    "No LSP server available for language '{}'. \
                     Install one (e.g. npm install -g typescript-language-server)",
                    language
                )
            })?;

        if !check_command_exists(cmd) {
            return Err(format!(
                "Language server '{}' not found on PATH. \
                 Install it first (e.g. npm install -g {}).",
                cmd, cmd
            ));
        }

        let mut child = Command::new(cmd)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn {}: {}", cmd, e))?;

        let stdin = child.stdin.take().ok_or("No stdin from child process")?;
        let stdout = child.stdout.take().ok_or("No stdout from child process")?;

        let pending: Arc<std::sync::Mutex<HashMap<u64, oneshot::Sender<Value>>>> =
            Arc::new(std::sync::Mutex::new(HashMap::new()));
        let pending_clone = pending.clone();
        let app_clone = app.clone();

        // Background reader — dispatches responses to pending requests
        // and emits diagnostics/showMessage events to the frontend.
        tauri::async_runtime::spawn(async move {
            read_loop(stdout, pending_clone, app_clone).await;
        });

        let mut state = LspServerState {
            stdin,
            next_id: AtomicU64::new(1),
            pending,
            capabilities: Value::Null,
        };

        // ── Initialize handshake ──────────────────────────────────────
        let init_id = state.next_id.fetch_add(1, Ordering::Relaxed);
        let init_params = serde_json::json!({
            "processId": null,
            "clientInfo": { "name": "claude-desktop", "version": "1.0" },
            "capabilities": {
                "textDocument": {
                    "definition": { "dynamicRegistration": true, "linkSupport": true },
                    "references": { "dynamicRegistration": true },
                    "hover": {
                        "dynamicRegistration": true,
                        "contentFormat": ["markdown", "plaintext"]
                    },
                    "completion": {
                        "dynamicRegistration": true,
                        "completionItem": {
                            "snippetSupport": true,
                            "commitCharactersSupport": true,
                            "documentationFormat": ["markdown", "plaintext"]
                        }
                    },
                    "codeAction": {
                        "dynamicRegistration": true,
                        "codeActionLiteralSupport": {
                            "codeActionKind": {
                                "valueSet": [
                                    "quickfix", "refactor", "refactor.extract",
                                    "refactor.inline", "refactor.rewrite",
                                    "source", "source.organizeImports"
                                ]
                            }
                        },
                        "isPreferredSupport": true
                    },
                    "diagnostic": {
                        "dynamicRegistration": true,
                        "relatedDocumentSupport": true
                    },
                    "documentSymbol": { "dynamicRegistration": true },
                    "formatting": { "dynamicRegistration": true }
                },
                "workspace": {
                    "didChangeConfiguration": { "dynamicRegistration": true },
                    "workspaceFolders": true
                }
            },
            "workspaceFolders": [{
                "uri": path_to_uri(workspace),
                "name": workspace
                    .rsplit('\\').next()
                    .or_else(|| workspace.rsplit('/').next())
                    .unwrap_or("workspace")
            }],
            "rootUri": path_to_uri(workspace),
        });

        let init_msg = serde_json::json!({
            "jsonrpc": "2.0",
            "id": init_id,
            "method": "initialize",
            "params": init_params,
        });

        let (tx, rx) = oneshot::channel();
        state.pending.lock().unwrap().insert(init_id, tx);

        write_message(&mut state.stdin, &init_msg).await?;

        let response = tokio::time::timeout(Duration::from_secs(INIT_TIMEOUT_SECS), rx)
            .await
            .map_err(|_| "LSP initialize timed out".to_string())?
            .map_err(|_| "LSP initialize channel closed".to_string())?;

        if let Some(err) = response.get("error") {
            return Err(format!("LSP initialize error: {}", err));
        }

        state.capabilities = response
            .get("result")
            .and_then(|r| r.get("capabilities"))
            .cloned()
            .unwrap_or(Value::Null);

        // ── Send initialized notification ─────────────────────────────
        let notif = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "initialized",
            "params": {},
        });
        write_message(&mut state.stdin, &notif).await?;

        self.servers.lock().await.insert(key.clone(), state);
        Ok(key)
    }

    /// Stop a language server by its server ID.
    pub async fn stop_server(&self, server_id: &str) {
        let server = { self.servers.lock().await.remove(server_id) };
        if let Some(mut server) = server {
            let shutdown = serde_json::json!({
                "jsonrpc": "2.0",
                "id": 9999u64,
                "method": "shutdown",
                "params": {},
            });
            let _ = write_message(&mut server.stdin, &shutdown).await;
            let exit = serde_json::json!({
                "jsonrpc": "2.0",
                "method": "exit",
                "params": {},
            });
            let _ = write_message(&mut server.stdin, &exit).await;
        }
    }

    /// Send a JSON-RPC request and wait for the response.
    pub async fn send_request(
        &self,
        server_id: &str,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        // Phase 1: Set up the pending channel (locked briefly)
        let id;
        let rx;
        {
            let mut servers = self.servers.lock().await;
            let server = servers
                .get_mut(server_id)
                .ok_or_else(|| "LSP server not found".to_string())?;
            id = server.next_id.fetch_add(1, Ordering::Relaxed);
            let (tx, rx_ch) = oneshot::channel();
            server.pending.lock().unwrap().insert(id, tx);
            rx = rx_ch;
        }

        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        // Phase 2: Write to stdin (locked briefly for each write)
        let write_result: Result<(), String> = {
            let mut servers = self.servers.lock().await;
            let server = servers
                .get_mut(server_id)
                .ok_or_else(|| "LSP server not found".to_string())?;
            write_message(&mut server.stdin, &msg).await
        };
        write_result?;

        // Phase 3: Wait for response (no lock held)
        let response = tokio::time::timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS), rx)
            .await
            .map_err(|_| format!("LSP request '{}' timed out", method))?
            .map_err(|_| format!("LSP request '{}' channel error", method))?;

        if let Some(error) = response.get("error") {
            return Err(format!("LSP error: {}", error));
        }

        Ok(response.get("result").cloned().unwrap_or(Value::Null))
    }

    /// Send a JSON-RPC notification (fire-and-forget, no response).
    pub async fn send_notification(
        &self,
        server_id: &str,
        method: &str,
        params: Value,
    ) -> Result<(), String> {
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });

        let mut servers = self.servers.lock().await;
        let server = servers
            .get_mut(server_id)
            .ok_or_else(|| "LSP server not found".to_string())?;
        write_message(&mut server.stdin, &msg).await
    }
}

// ── Language Server Detection ────────────────────────────────────────

/// Map a language identifier to the command + args needed to start an LSP server.
pub(crate) fn detect_server(language: &str) -> Option<(&'static str, &'static [&'static str])> {
    match language {
        "typescript" | "javascript" | "typescriptreact" | "javascriptreact" => {
            Some(("typescript-language-server", &["--stdio"]))
        }
        "python" => Some(("pyright-langserver", &["--stdio"])),
        "rust" => Some(("rust-analyzer", &[])),
        "json" | "jsonc" => Some(("vscode-json-languageserver", &["--stdio"])),
        "html" => Some(("vscode-html-languageserver", &["--stdio"])),
        "css" | "scss" | "less" => Some(("vscode-css-languageserver", &["--stdio"])),
        "go" => Some(("gopls", &[])),
        "yaml" => Some(("yaml-language-server", &["--stdio"])),
        "markdown" => Some(("marksman", &[])),
        "sh" | "shellscript" | "bash" | "zsh" => Some(("bash-language-server", &["start"])),
        _ => None,
    }
}

pub(crate) fn check_command_exists(cmd: &str) -> bool {
    let which = if cfg!(windows) { "where" } else { "which" };
    std::process::Command::new(which)
        .arg(cmd)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub(crate) fn get_supported_languages() -> Vec<&'static str> {
    vec![
        "typescript", "javascript", "typescriptreact", "javascriptreact",
        "python", "rust", "json", "jsonc", "html", "css", "scss", "less",
        "go", "yaml", "markdown", "sh", "bash", "shellscript",
    ]
}

// ── URI helpers ──────────────────────────────────────────────────────

/// Convert a file system path to a `file://` URI.
pub(crate) fn path_to_uri(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    if normalized.starts_with('/') {
        format!("file://{}", normalized)
    } else {
        format!("file:///{}", normalized)
    }
}

// ── JSON-RPC transport ───────────────────────────────────────────────

/// Write a JSON-RPC message to stdin using Content-Length framing.
async fn write_message(
    stdin: &mut tokio::process::ChildStdin,
    msg: &Value,
) -> Result<(), String> {
    let body =
        serde_json::to_string(msg).map_err(|e| format!("Serialize error: {}", e))?;
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    stdin
        .write_all(header.as_bytes())
        .await
        .map_err(|e| format!("Write header error: {}", e))?;
    stdin
        .write_all(body.as_bytes())
        .await
        .map_err(|e| format!("Write body error: {}", e))?;
    stdin
        .flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;
    Ok(())
}

/// Read one JSON-RPC message from stdout using Content-Length framing.
async fn read_message(
    reader: &mut BufReader<tokio::process::ChildStdout>,
) -> Result<Value, String> {
    let mut content_length: Option<usize> = None;

    loop {
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("Failed to read header: {}", e))?;

        if line.is_empty() {
            return Err("LSP connection closed".to_string());
        }

        let trimmed = line.trim();

        if trimmed.is_empty() {
            break; // end of headers
        }

        if let Some(len_str) = trimmed.strip_prefix("Content-Length: ") {
            content_length = len_str.trim().parse().ok();
        }
    }

    let len = content_length.ok_or("Missing Content-Length header")?;

    if len > 100_000_000 {
        return Err(format!("LSP message too large: {} bytes", len));
    }

    let mut body = vec![0u8; len];
    reader
        .read_exact(&mut body)
        .await
        .map_err(|e| format!("Failed to read body: {}", e))?;

    serde_json::from_slice(&body).map_err(|e| format!("Invalid JSON: {}", e))
}

/// Background task: reads from stdout and dispatches responses/events.
async fn read_loop(
    stdout: tokio::process::ChildStdout,
    pending: Arc<std::sync::Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
    app: AppHandle,
) {
    let mut reader = BufReader::new(stdout);

    loop {
        let msg = match read_message(&mut reader).await {
            Ok(msg) => msg,
            Err(_) => break,
        };

        // Response to one of our requests
        if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
            let mut p = pending.lock().unwrap();
            if let Some(tx) = p.remove(&id) {
                let _ = tx.send(msg);
                continue;
            }
        }

        // Server-to-client notifications
        if let Some(method) = msg.get("method").and_then(|v| v.as_str()) {
            match method {
                "textDocument/publishDiagnostics" => {
                    let _ = app.emit(
                        "lsp-diagnostics",
                        msg.get("params").cloned().unwrap_or(Value::Null),
                    );
                }
                "window/showMessage" => {
                    let _ = app.emit(
                        "lsp-show-message",
                        msg.get("params").cloned().unwrap_or(Value::Null),
                    );
                }
                "window/logMessage" => {
                    let params = msg.get("params");
                    let message = params
                        .and_then(|p| p.get("message").and_then(|v| v.as_str()))
                        .unwrap_or("");
                    log::info!("[LSP] {}", message);
                }
                _ => {}
            }
        }
    }
}
