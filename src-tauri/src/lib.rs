use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

struct AppConfig {
    api_key: String,
    base_url: String,
    model: String,
}

struct SessionData {
    cancel: Arc<AtomicBool>,
}

struct AppState {
    config: AppConfig,
    sessions: Mutex<HashMap<String, SessionData>>,
}

fn load_config() -> Result<AppConfig, String> {
    if let Ok(api_key) = std::env::var("ANTHROPIC_AUTH_TOKEN") {
        let base_url = std::env::var("ANTHROPIC_BASE_URL")
            .unwrap_or_else(|_| "https://api.deepseek.com/anthropic".to_string());
        let model = std::env::var("ANTHROPIC_MODEL")
            .unwrap_or_else(|_| "deepseek-v4-flash".to_string());
        return Ok(AppConfig { api_key, base_url: base_url.trim_end_matches('/').to_string(), model });
    }

    let settings_path = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(|p| format!("{}\\.claude\\settings.json", p))
        .map_err(|_| "Cannot find home directory".to_string())?;

    let content = std::fs::read_to_string(&settings_path).map_err(|_| {
        format!("Cannot read API config: check {}", settings_path)
    })?;

    let settings: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))?;
    let env = settings.get("env").ok_or_else(|| "No env block in settings".to_string())?;

    let api_key = env.get("ANTHROPIC_AUTH_TOKEN").and_then(|v| v.as_str()).ok_or_else(|| "ANTHROPIC_AUTH_TOKEN not found".to_string())?.to_string();
    let base_url = env.get("ANTHROPIC_BASE_URL").and_then(|v| v.as_str()).unwrap_or("https://api.deepseek.com/anthropic").trim_end_matches('/').to_string();
    let model = env.get("ANTHROPIC_MODEL").and_then(|v| v.as_str()).unwrap_or("deepseek-v4-flash").to_string();

    Ok(AppConfig { api_key, base_url, model })
}

// ── Tool definitions ──────────────────────────────────────────────

const SYSTEM_PROMPT: &str = "You are Claude Code Desktop, a helpful AI assistant running in a desktop application. You can help with coding, file management, software engineering, research, analysis, creative tasks, and general questions. Your responses are concise, professional, and well-structured. When asked about your underlying model, honestly state that you are powered by the DeepSeek V4 Flash model.

You have access to tools that let you execute shell commands, read/write files, search code, and fetch web pages. Use these tools when needed to help the user. When you use a tool, explain what you're doing briefly.";

fn tool_definitions() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "name": "Bash",
            "description": "Execute a shell command. Use this to run CLI tools, scripts, or any shell operation.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "The shell command to execute" }
                },
                "required": ["command"]
            }
        }),
        serde_json::json!({
            "name": "Read",
            "description": "Read the contents of a file. Returns file content or an error if the file doesn't exist.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "file_path": { "type": "string", "description": "Absolute path to the file" }
                },
                "required": ["file_path"]
            }
        }),
        serde_json::json!({
            "name": "Write",
            "description": "Write content to a file, overwriting if it exists. Creates parent directories if needed.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "file_path": { "type": "string", "description": "Absolute path to the file" },
                    "content": { "type": "string", "description": "Content to write" }
                },
                "required": ["file_path", "content"]
            }
        }),
        serde_json::json!({
            "name": "Glob",
            "description": "Search for files matching a glob pattern (e.g. 'src/**/*.ts').",
            "input_schema": {
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "description": "Glob pattern to match" },
                    "path": { "type": "string", "description": "Directory to search in (optional)" }
                },
                "required": ["pattern"]
            }
        }),
        serde_json::json!({
            "name": "Grep",
            "description": "Search for a pattern in files. Returns matching lines with file names.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "description": "Regex pattern to search for" },
                    "path": { "type": "string", "description": "File or directory to search (optional)" },
                    "glob": { "type": "string", "description": "Optional file glob filter (e.g. '*.rs')" }
                },
                "required": ["pattern"]
            }
        }),
        serde_json::json!({
            "name": "WebFetch",
            "description": "Fetch a URL and return its content as text/markdown.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "URL to fetch" }
                },
                "required": ["url"]
            }
        }),
        serde_json::json!({
            "name": "WebSearch",
            "description": "Search the web for current information. Returns text results. Use this to get recent news, weather, or any up-to-date information.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "The search query string" }
                },
                "required": ["query"]
            }
        }),
    ]
}

// ── HTML stripping helper ───────────────────────────────────────────

fn strip_html(html: &str) -> String {
    let s: String = html.chars().collect();
    let bytes = s.as_bytes();
    let n = bytes.len();
    let mut out = String::with_capacity(n);
    let mut i = 0;

    while i < n {
        if bytes[i] == b'<' {
            let tag_start = i + 1;
            let mut tag_end = tag_start;
            while tag_end < n && bytes[tag_end] != b'>' && bytes[tag_end] != b' ' && bytes[tag_end] != b'\n' {
                tag_end += 1;
            }
            let tag_name: String = bytes[tag_start..tag_end].iter().map(|&b| b as char).collect();
            let lower = tag_name.to_lowercase();

            // Skip script/style entirely
            if lower == "script" || lower == "style" {
                let close = format!("</{}>", lower);
                let close_b = close.as_bytes();
                while i < n {
                    if i + close_b.len() <= n && &bytes[i..i+close_b.len()] == close_b {
                        i += close_b.len();
                        break;
                    }
                    i += 1;
                }
                continue;
            }

            // Block-level tags → newline
            let block = ["br", "/p", "/div", "/li", "/tr", "hr", "/table", "/h1", "/h2", "/h3", "/h4", "/h5", "/h6"];
            if block.iter().any(|b| lower == *b) && !out.ends_with('\n') {
                out.push('\n');
            }

            // Skip to end of tag
            while i < n && bytes[i] != b'>' { i += 1; }
            if i < n { i += 1; }
            continue;
        }
        out.push(bytes[i] as char);
        i += 1;
    }

    // Decode HTML entities
    let out = out.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");

    // Collapse whitespace
    let mut final_out = String::with_capacity(out.len());
    let mut prev_nl = false;
    let mut prev_sp = false;
    for c in out.chars() {
        match c {
            '\n' => { if !prev_nl { final_out.push('\n'); } prev_nl = true; prev_sp = false; }
            ' ' | '\t' => { if !prev_nl && !prev_sp { final_out.push(' '); } prev_sp = true; }
            _ => { final_out.push(c); prev_nl = false; prev_sp = false; }
        }
    }

    final_out.trim().to_string()
}

fn urlencode(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 3);
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            b' ' => result.push_str("+"),
            _ => result.push_str(&format!("%{:02X}", byte)),
        }
    }
    result
}

// ── Tool execution ────────────────────────────────────────────────

async fn execute_bash(command: &str) -> String {
    let output = tokio::process::Command::new("bash")
        .arg("-c")
        .arg(command)
        .output()
        .await;
    match output {
        Ok(out) => {
            let mut result = String::new();
            if !out.stdout.is_empty() {
                result.push_str(&String::from_utf8_lossy(&out.stdout));
            }
            if !out.stderr.is_empty() {
                if !result.is_empty() { result.push_str("\n"); }
                result.push_str(&String::from_utf8_lossy(&out.stderr));
            }
            if result.is_empty() {
                result.push_str(&format!("(exited with code {})", out.status.code().unwrap_or(-1)));
            }
            result
        }
        Err(e) => format!("Failed to execute command: {}", e),
    }
}

async fn execute_read(file_path: &str) -> String {
    match tokio::fs::read_to_string(file_path).await {
        Ok(content) => content,
        Err(e) => format!("Error reading file: {}", e),
    }
}

async fn execute_write(file_path: &str, content: &str) -> String {
    if let Some(parent) = std::path::Path::new(file_path).parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    match tokio::fs::write(file_path, content).await {
        Ok(()) => format!("Wrote {} bytes to {}", content.len(), file_path),
        Err(e) => format!("Error writing file: {}", e),
    }
}

async fn execute_glob(pattern: &str, path: Option<&str>) -> String {
    let search_path = path.unwrap_or(".");
    let result = std::panic::catch_unwind(|| {
        let matches = glob::glob(&format!("{}/{}", search_path.trim_end_matches('/'), pattern))
            .map_err(|e| format!("Invalid glob pattern: {}", e));
        match matches {
            Ok(entries) => {
                let paths: Vec<String> = entries
                    .filter_map(|e| e.ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                if paths.is_empty() {
                    "No matches found".to_string()
                } else {
                    paths.join("\n")
                }
            }
            Err(e) => e,
        }
    });
    match result {
        Ok(r) => r,
        Err(_) => "Glob search failed (pattern may be invalid)".to_string(),
    }
}

async fn execute_grep(pattern: &str, path: Option<&str>, glob_filter: Option<&str>) -> String {
    let mut cmd = tokio::process::Command::new("rg");
    cmd.arg("-n");
    if let Some(g) = glob_filter {
        cmd.arg("--glob").arg(g);
    }
    cmd.arg(pattern);
    if let Some(p) = path {
        cmd.arg(p);
    }
    let output = cmd.output().await;
    match output {
        Ok(out) => {
            if out.stdout.is_empty() && !out.stderr.is_empty() {
                String::from_utf8_lossy(&out.stderr).to_string()
            } else {
                String::from_utf8_lossy(&out.stdout).to_string()
            }
        }
        Err(e) => format!("Grep failed: {}", e),
    }
}

async fn execute_web_fetch(url: &str) -> String {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Client error: {}", e));
    match client {
        Ok(c) => {
            match c.get(url).send().await {
                Ok(resp) => {
                    let status = resp.status();
                    match resp.text().await {
                        Ok(text) => {
                            // Strip HTML tags for a basic text view
                            let cleaned = strip_html(&text);
                            // Truncate very long responses
                            let max_len = 10000;
                            let body = if cleaned.len() > max_len {
                                format!("{}...\n[Response truncated at {} chars]", &cleaned[..max_len], max_len)
                            } else {
                                cleaned
                            };
                            format!("HTTP {}:\n{}", status, body)
                        }
                        Err(e) => format!("HTTP {} - Read error: {}", status, e),
                    }
                }
                Err(e) => format!("Request failed: {}", e),
            }
        }
        Err(e) => e,
    }
}

async fn execute_web_search(query: &str) -> String {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build();
    match client {
        Ok(c) => {
            let url = format!("https://lite.duckduckgo.com/lite/?q={}", urlencode(query));
            match c.get(&url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .send()
                .await
            {
                Ok(resp) => {
                    let _status = resp.status();
                    let html = resp.text().await.unwrap_or_default();
                    let text = strip_html(&html);
                    // Take first 3000 chars of meaningful content
                    let text = text.trim();
                    let max = 3000;
                    let body = if text.len() > max {
                        format!("{}...\n[Truncated]", &text[..max])
                    } else {
                        text.to_string()
                    };
                    if body.is_empty() {
                        format!("(no results for: {})", query)
                    } else {
                        format!("Search results for \"{}\":\n{}", query, body)
                    }
                }
                Err(e) => format!("Search request failed: {}", e),
            }
        }
        Err(e) => format!("Client error: {}", e),
    }
}

#[derive(Clone)]
struct ToolUse {
    id: String,
    name: String,
    input: serde_json::Value,
}

async fn execute_tool(tool: &ToolUse) -> String {
    match tool.name.as_str() {
        "Bash" => {
            let cmd = tool.input.get("command").and_then(|v| v.as_str()).unwrap_or("");
            execute_bash(cmd).await
        }
        "Read" => {
            let path = tool.input.get("file_path").and_then(|v| v.as_str()).unwrap_or("");
            execute_read(path).await
        }
        "Write" => {
            let path = tool.input.get("file_path").and_then(|v| v.as_str()).unwrap_or("");
            let content = tool.input.get("content").and_then(|v| v.as_str()).unwrap_or("");
            execute_write(path, content).await
        }
        "Glob" => {
            let pattern = tool.input.get("pattern").and_then(|v| v.as_str()).unwrap_or("");
            let path = tool.input.get("path").and_then(|v| v.as_str());
            execute_glob(pattern, path).await
        }
        "Grep" => {
            let pattern = tool.input.get("pattern").and_then(|v| v.as_str()).unwrap_or("");
            let path = tool.input.get("path").and_then(|v| v.as_str());
            let glob = tool.input.get("glob").and_then(|v| v.as_str());
            execute_grep(pattern, path, glob).await
        }
        "WebFetch" => {
            let url = tool.input.get("url").and_then(|v| v.as_str()).unwrap_or("");
            execute_web_fetch(url).await
        }
        "WebSearch" => {
            let query = tool.input.get("query").and_then(|v| v.as_str()).unwrap_or("");
            execute_web_search(query).await
        }
        _ => format!("Unknown tool: {}", tool.name),
    }
}

// ── SSE content block parsing ─────────────────────────────────────

#[derive(Default)]
struct BlockAccum {
    block_type: String,
    id: String,
    name: String,
    text: String,
    input_json: String,
}

/// Parse one SSE stream and return accumulated content blocks + stop_reason.
async fn parse_sse_stream(
    response: reqwest::Response,
    cancel: &AtomicBool,
    app: &AppHandle,
    session_id: &str,
) -> Result<(Vec<BlockAccum>, String), String> {
    use tokio_stream::StreamExt;
    let mut stream = response.bytes_stream();
    let mut buf = String::new();
    let mut current_event = String::new();
    let mut current_data = String::new();
    let mut blocks: Vec<BlockAccum> = Vec::new();
    let mut stop_reason = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        if cancel.load(Ordering::Relaxed) {
            return Ok((blocks, "cancelled".to_string()));
        }

        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim_end_matches('\r').to_string();
            buf = buf[pos + 1..].to_string();

            if line.starts_with("event: ") {
                current_event = line[7..].to_string();
            } else if line.starts_with("data: ") {
                current_data = line[6..].to_string();
            } else if line.is_empty() && !current_data.is_empty() {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&current_data) {
                    match current_event.as_str() {
                        "content_block_start" => {
                            let idx = data.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                            let btype = data.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            // Extend blocks list if needed
                            while blocks.len() <= idx {
                                blocks.push(BlockAccum::default());
                            }
                            blocks[idx].block_type = btype.clone();
                            if btype == "tool_use" {
                                blocks[idx].id = data.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                blocks[idx].name = data.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                if let Some(input) = data.get("input") {
                                    blocks[idx].input_json = input.to_string();
                                }
                            }
                        }
                        "content_block_delta" => {
                            let idx = data.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                            while blocks.len() <= idx {
                                blocks.push(BlockAccum::default());
                            }
                            if let Some(text) = data.pointer("/delta/text").and_then(|v| v.as_str()) {
                                blocks[idx].block_type = "text".to_string();
                                blocks[idx].text.push_str(text);
                                // Stream text to frontend
                                let _ = app.emit("claude-chunk", serde_json::json!({
                                    "session_id": session_id,
                                    "text": text,
                                }));
                            }
                            if let Some(partial) = data.pointer("/delta/partial_json").and_then(|v| v.as_str()) {
                                blocks[idx].block_type = "tool_use".to_string();
                                blocks[idx].input_json.push_str(partial);
                            }
                        }
                        "content_block_stop" => {
                        }
                        "message_delta" => {
                            if let Some(reason) = data.pointer("/delta/stop_reason").and_then(|v| v.as_str()) {
                                stop_reason = reason.to_string();
                            }
                        }
                        "error" => {
                            let err_text = data.get("error").and_then(|v| v.as_str()).unwrap_or(&current_data);
                            return Err(err_text.to_string());
                        }
                        _ => {}
                    }
                }
                current_event.clear();
                current_data.clear();
            }
        }
    }

    Ok((blocks, stop_reason))
}

// ── Main tool loop ────────────────────────────────────────────────

const MAX_TOOL_ROUNDS: u32 = 20;

#[tauri::command]
async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    messages: Vec<serde_json::Value>,
    workspace_context: Option<String>,
) -> Result<(), String> {
    let config = AppConfig {
        api_key: state.config.api_key.clone(),
        base_url: state.config.base_url.clone(),
        model: state.config.model.clone(),
    };

    // Ensure session exists for cancellation
    let cancel = {
        let mut sessions = state.sessions.lock().unwrap();
        let entry = sessions.entry(session_id.clone()).or_insert(SessionData {
            cancel: Arc::new(AtomicBool::new(false)),
        });
        entry.cancel.clone()
    };

    let client = reqwest::Client::new();
    let tools = tool_definitions();
    let mut msgs = messages;
    let mut round = 0u32;

    loop {
        round += 1;

        // Check cancellation before each API call
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }

        // Limit tool rounds to prevent infinite loops
        if round > MAX_TOOL_ROUNDS {
            let _ = app.emit("claude-chunk", serde_json::json!({
                "session_id": session_id,
                "text": "\n\n[已达到最大工具调用次数限制]",
            }));
            let _ = app.emit("claude-done", serde_json::json!({"session_id": session_id}));
            return Ok(());
        }

        let system = match &workspace_context {
            Some(ctx) if !ctx.is_empty() => format!("{}\n\n## Current Project (Workspace)\n{}", SYSTEM_PROMPT, ctx),
            _ => SYSTEM_PROMPT.to_string(),
        };
        let body = serde_json::json!({
            "model": config.model,
            "system": system,
            "messages": msgs,
            "stream": true,
            "max_tokens": 4096,
            "tools": tools,
        });

        let response = client
            .post(format!("{}/v1/messages", config.base_url))
            .header("x-api-key", &config.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("API request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API {}: {}", status, body));
        }

        // Parse SSE stream
        let (blocks, stop_reason) = parse_sse_stream(response, &cancel, &app, &session_id).await?;

        if stop_reason == "cancelled" {
            return Ok(());
        }

        // Extract tool_use blocks
        let tool_uses: Vec<ToolUse> = blocks.iter()
            .filter(|b| b.block_type == "tool_use")
            .map(|b| {
                let input: serde_json::Value = serde_json::from_str(&b.input_json).unwrap_or(serde_json::Value::Null);
                ToolUse {
                    id: b.id.clone(),
                    name: b.name.clone(),
                    input,
                }
            })
            .collect();

        if tool_uses.is_empty() && (stop_reason != "tool_use") {
            // Final text response — done
            let _ = app.emit("claude-done", serde_json::json!({"session_id": session_id}));
            return Ok(());
        }

        if tool_uses.is_empty() && stop_reason == "tool_use" {
            // Shouldn't happen, but just in case
            let _ = app.emit("claude-done", serde_json::json!({"session_id": session_id}));
            return Ok(());
        }

        // Build assistant content block from accumulated blocks
        let mut assistant_content: Vec<serde_json::Value> = Vec::new();
        for block in &blocks {
            if block.block_type == "text" && !block.text.is_empty() {
                assistant_content.push(serde_json::json!({
                    "type": "text",
                    "text": block.text,
                }));
            } else if block.block_type == "tool_use" {
                let input: serde_json::Value = serde_json::from_str(&block.input_json).unwrap_or(serde_json::Value::Null);
                assistant_content.push(serde_json::json!({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": input,
                }));
            }
        }

        // Execute tools and emit info to frontend
        let mut tool_results: Vec<serde_json::Value> = Vec::new();
        for tool in &tool_uses {
            let _ = app.emit("claude-chunk", serde_json::json!({
                "session_id": session_id,
                "text": format!("\n\n[使用工具: {}]\n", tool.name),
            }));

            let result = execute_tool(tool).await;

            // Truncate very long tool results
            let truncated = if result.len() > 5000 {
                format!("{}...\n[Results truncated at 5000 chars]", &result[..5000])
            } else {
                result
            };

            let _ = app.emit("claude-chunk", serde_json::json!({
                "session_id": session_id,
                "text": format!("{}\n\n", truncated),
            }));

            tool_results.push(serde_json::json!({
                "type": "tool_result",
                "tool_use_id": tool.id,
                "content": truncated,
            }));
        }

        // Add assistant + tool results to message history and continue the loop
        msgs.push(serde_json::json!({
            "role": "assistant",
            "content": assistant_content,
        }));
        msgs.push(serde_json::json!({
            "role": "user",
            "content": tool_results,
        }));
    }
}

#[tauri::command]
async fn cancel_message(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&session_id) {
        session.cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let entries =
        std::fs::read_dir(&path).map_err(|e| format!("Failed to read dir: {}", e))?;
    let mut files: Vec<FileEntry> = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" || name == "target" {
            continue;
        }
        files.push(FileEntry {
            is_dir: entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
            name,
            path: entry.path().to_string_lossy().to_string(),
        });
    }
    files.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(files)
}

fn collect_tree(path: &std::path::Path, prefix: &str, depth: usize, max_depth: usize) -> String {
    if depth > max_depth { return String::new(); }
    let mut out = String::new();
    let entries = match std::fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return out,
    };
    let mut items: Vec<(bool, String)> = Vec::new();
    for entry in entries {
        let entry = match entry { Ok(e) => e, Err(_) => continue };
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" || name == "target" || name == ".next" || name == "dist" || name == "build" || name == ".git" {
            continue;
        }
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        items.push((is_dir, name));
    }
    items.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    for (i, (is_dir, name)) in items.iter().enumerate() {
        let is_last = i == items.len() - 1;
        let connector = if is_last { "└── " } else { "├── " };
        let suffix = if *is_dir { "/" } else { "" };
        out.push_str(&format!("{}{}{}{}\n", prefix, connector, name, suffix));
        if *is_dir && depth < max_depth {
            let child_prefix = format!("{}{}", prefix, if is_last { "    " } else { "│   " });
            out.push_str(&collect_tree(&path.join(name), &child_prefix, depth + 1, max_depth));
        }
    }
    out
}

#[tauri::command]
async fn read_workspace_context(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("路径不存在".to_string());
    }
    if !p.is_dir() {
        return Err("路径不是目录".to_string());
    }

    let mut ctx = String::new();
    let project_name = p.file_name().map(|n| n.to_string_lossy()).unwrap_or(std::borrow::Cow::Borrowed("unknown"));
    ctx.push_str(&format!("**Project**: {}\n\n", project_name));

    // Read CLAUDE.md
    let claude_path = p.join("CLAUDE.md");
    if claude_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&claude_path) {
            ctx.push_str("**Project Instructions (CLAUDE.md)**:\n");
            ctx.push_str(&content);
            ctx.push('\n');
        }
    }

    // Read package.json
    let pkg_path = p.join("package.json");
    if pkg_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&pkg_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                ctx.push_str("**Package Info**:\n");
                if let Some(name) = json.get("name").and_then(|v| v.as_str()) {
                    ctx.push_str(&format!("- Name: {}\n", name));
                }
                if let Some(desc) = json.get("description").and_then(|v| v.as_str()) {
                    ctx.push_str(&format!("- Description: {}\n", desc));
                }
                if let Some(scripts) = json.get("scripts").and_then(|v| v.as_object()) {
                    ctx.push_str("- Scripts:\n");
                    for (k, _) in scripts.iter().take(10) {
                        ctx.push_str(&format!("  - `{}`\n", k));
                    }
                }
                ctx.push('\n');
            }
        }
    }

    // Read Cargo.toml
    let cargo_path = p.join("Cargo.toml");
    if cargo_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&cargo_path) {
            ctx.push_str("**Cargo Project**:\n");
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("name = ") || trimmed.starts_with("version = ") || trimmed.starts_with("description = ") || trimmed.starts_with("edition = ") {
                    ctx.push_str(&format!("- {}\n", trimmed));
                }
            }
            ctx.push('\n');
        }
    }

    // Directory tree
    ctx.push_str("**Directory Structure**:\n\n```\n");
    ctx.push_str(&collect_tree(p, "", 0, 2));
    ctx.push_str("```\n\n");

    // Git branch
    match tokio::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&path)
        .output()
        .await
    {
        Ok(out) => {
            let branch = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !branch.is_empty() && !branch.contains("fatal") {
                ctx.push_str(&format!("**Git Branch**: `{}`\n", branch));
            }
        }
        Err(_) => {}
    }

    Ok(ctx)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = load_config().expect("Failed to load API config");

    tauri::Builder::default()
        .manage(AppState {
            config,
            sessions: Mutex::new(HashMap::new()),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_message,
            cancel_message,
            list_directory,
            read_workspace_context
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
