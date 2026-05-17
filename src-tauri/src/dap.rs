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

const DAP_TIMEOUT_SECS: u64 = 30;

// ── DapManager ───────────────────────────────────────────────────────

pub struct DapManager {
    sessions: Arc<Mutex<HashMap<String, DapSession>>>,
}

struct DapSession {
    stdin: tokio::process::ChildStdin,
    seq: AtomicU64,
    pending: Arc<std::sync::Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
}

impl DapManager {
    pub fn new() -> Self {
        DapManager {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start a debug adapter process using the given command + args.
    /// Returns a session ID.
    pub async fn start_session(
        &self,
        app: AppHandle,
        session_id: &str,
        command: &str,
        args: Vec<String>,
        cwd: Option<&str>,
    ) -> Result<(), String> {
        {
            let sessions = self.sessions.lock().await;
            if sessions.contains_key(session_id) {
                return Ok(()); // already running
            }
        }

        let mut cmd = Command::new(command);
        cmd.args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn debug adapter: {}", e))?;

        let stdin = child.stdin.take().ok_or("No stdin")?;
        let stdout = child.stdout.take().ok_or("No stdout")?;

        let pending: Arc<std::sync::Mutex<HashMap<u64, oneshot::Sender<Value>>>> =
            Arc::new(std::sync::Mutex::new(HashMap::new()));
        let pending_clone = pending.clone();
        let app_clone = app.clone();
        let sid = session_id.to_string();

        tauri::async_runtime::spawn(async move {
            dap_read_loop(stdout, pending_clone, app_clone, &sid).await;
        });

        let session = DapSession {
            stdin,
            seq: AtomicU64::new(1),
            pending,
        };

        self.sessions.lock().await.insert(session_id.to_string(), session);
        Ok(())
    }

    /// Send a DAP request and wait for the matching response.
    pub async fn send_request(
        &self,
        session_id: &str,
        command: &str,
        args: Value,
    ) -> Result<Value, String> {
        let seq;
        let rx;
        {
            let mut sessions = self.sessions.lock().await;
            let session = sessions
                .get_mut(session_id)
                .ok_or_else(|| "DAP session not found".to_string())?;
            seq = session.seq.fetch_add(1, Ordering::Relaxed);
            let (tx, rx_ch) = oneshot::channel();
            session.pending.lock().unwrap().insert(seq, tx);
            rx = rx_ch;
        }

        let msg = serde_json::json!({
            "seq": seq,
            "type": "request",
            "command": command,
            "arguments": args,
        });

        {
            let mut sessions = self.sessions.lock().await;
            let session = sessions
                .get_mut(session_id)
                .ok_or_else(|| "DAP session not found".to_string())?;
            dap_write_message(&mut session.stdin, &msg).await?;
        }

        let response = tokio::time::timeout(Duration::from_secs(DAP_TIMEOUT_SECS), rx)
            .await
            .map_err(|_| format!("DAP request '{}' timed out", command))?
            .map_err(|_| format!("DAP request '{}' channel error", command))?;

        if !response.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            let msg = response
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown error");
            return Err(format!("DAP error: {}", msg));
        }

        Ok(response.get("body").cloned().unwrap_or(Value::Null))
    }

    /// Send a DAP request without waiting for response (fire-and-forget).
    pub async fn send_request_raw(
        &self,
        session_id: &str,
        command: &str,
        args: Value,
    ) -> Result<u64, String> {
        let seq;
        {
            let mut sessions = self.sessions.lock().await;
            let session = sessions
                .get_mut(session_id)
                .ok_or_else(|| "DAP session not found".to_string())?;
            seq = session.seq.fetch_add(1, Ordering::Relaxed);
        }

        let msg = serde_json::json!({
            "seq": seq,
            "type": "request",
            "command": command,
            "arguments": args,
        });

        {
            let mut sessions = self.sessions.lock().await;
            let session = sessions
                .get_mut(session_id)
                .ok_or_else(|| "DAP session not found".to_string())?;
            dap_write_message(&mut session.stdin, &msg).await?;
        }

        Ok(seq)
    }

    /// End a debug session.
    pub async fn stop_session(&self, session_id: &str) {
        let session = { self.sessions.lock().await.remove(session_id) };
        if let Some(mut session) = session {
            let msg = serde_json::json!({
                "seq": session.seq.fetch_add(1, Ordering::Relaxed),
                "type": "request",
                "command": "disconnect",
                "arguments": { "terminateDebuggee": true },
            });
            let _ = dap_write_message(&mut session.stdin, &msg).await;
        }
    }
}

// ── DAP transport ────────────────────────────────────────────────────

async fn dap_write_message(
    stdin: &mut tokio::process::ChildStdin,
    msg: &Value,
) -> Result<(), String> {
    let body = serde_json::to_string(msg).map_err(|e| e.to_string())?;
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    stdin.write_all(header.as_bytes()).await.map_err(|e| e.to_string())?;
    stdin.write_all(body.as_bytes()).await.map_err(|e| e.to_string())?;
    stdin.flush().await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn dap_read_message(
    reader: &mut BufReader<tokio::process::ChildStdout>,
) -> Result<Value, String> {
    let mut content_length: Option<usize> = None;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).await.map_err(|e| e.to_string())?;
        if line.is_empty() {
            return Err("DAP connection closed".to_string());
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some(len_str) = trimmed.strip_prefix("Content-Length: ") {
            content_length = len_str.trim().parse().ok();
        }
    }
    let len = content_length.ok_or("Missing Content-Length")?;
    if len > 100_000_000 {
        return Err(format!("Message too large: {} bytes", len));
    }
    let mut body = vec![0u8; len];
    reader.read_exact(&mut body).await.map_err(|e| e.to_string())?;
    serde_json::from_slice(&body).map_err(|e| e.to_string())
}

async fn dap_read_loop(
    stdout: tokio::process::ChildStdout,
    pending: Arc<std::sync::Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
    app: AppHandle,
    session_id: &str,
) {
    let mut reader = BufReader::new(stdout);
    let sid = session_id.to_string();

    loop {
        let msg = match dap_read_message(&mut reader).await {
            Ok(m) => m,
            Err(_) => break,
        };

        let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");

        match msg_type {
            "response" => {
                if let Some(req_seq) = msg.get("request_seq").and_then(|v| v.as_u64()) {
                    let mut p = pending.lock().unwrap();
                    if let Some(tx) = p.remove(&req_seq) {
                        let _ = tx.send(msg);
                        continue;
                    }
                }
            }
            "event" => {
                let event_name = msg.get("event").and_then(|v| v.as_str()).unwrap_or("");
                let body = msg.get("body").cloned().unwrap_or(Value::Null);
                let _ = app.emit("dap-event", serde_json::json!({
                    "session_id": sid,
                    "event": event_name,
                    "body": body,
                }));
            }
            _ => {}
        }
    }

    // Session ended
    let _ = app.emit("dap-event", serde_json::json!({
        "session_id": sid,
        "event": "terminated",
        "body": null,
    }));
}
