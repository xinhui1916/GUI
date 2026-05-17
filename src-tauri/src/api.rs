use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::oneshot;
use tokio_stream::StreamExt;
use crate::{AppState, SessionData};

#[cfg(target_os = "windows")]
#[allow(unused_imports)]
use std::os::windows::process::CommandExt;

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
            "name": "Edit",
            "description": "Edit a file by finding and replacing text. Use this for targeted edits instead of rewriting entire files.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "file_path": { "type": "string", "description": "Absolute path to the file to edit" },
                    "old_string": { "type": "string", "description": "The exact text to find (must be unique)" },
                    "new_string": { "type": "string", "description": "The replacement text" }
                },
                "required": ["file_path", "old_string", "new_string"]
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

async fn execute_edit(file_path: &str, old_string: &str, new_string: &str) -> String {
    let content = match tokio::fs::read_to_string(file_path).await {
        Ok(c) => c,
        Err(e) => return format!("Error reading file {}: {}", file_path, e),
    };
    match content.find(old_string) {
        Some(pos) => {
            let before = &content[..pos];
            let after = &content[pos + old_string.len()..];
            let new_content = format!("{}{}{}", before, new_string, after);
            match tokio::fs::write(file_path, &new_content).await {
                Ok(()) => format!("Edited {}: replaced {} chars with {} chars", file_path, old_string.len(), new_string.len()),
                Err(e) => format!("Error writing file: {}", e),
            }
        }
        None => format!("Error: Could not find old_string in {}. The text must match exactly.", file_path),
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
        "Edit" => {
            let path = tool.input.get("file_path").and_then(|v| v.as_str()).unwrap_or("");
            let old = tool.input.get("old_string").and_then(|v| v.as_str()).unwrap_or("");
            let new = tool.input.get("new_string").and_then(|v| v.as_str()).unwrap_or("");
            execute_edit(path, old, new).await
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
                            if let Some(usage) = data.get("usage") {
                                let _ = app.emit("claude-usage", serde_json::json!({
                                    "session_id": session_id,
                                    "usage": usage,
                                }));
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

/// Simplified SSE parser — extracts only text content (no tool_use blocks).
async fn parse_sse_text(response: reqwest::Response) -> Result<String, String> {
    let mut stream = response.bytes_stream();
    let mut buf = String::new();
    let mut current_event = String::new();
    let mut current_data = String::new();
    let mut result = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

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
                        "content_block_delta" => {
                            if let Some(text) = data.pointer("/delta/text").and_then(|v| v.as_str()) {
                                result.push_str(text);
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

    if result.is_empty() {
        Err("No content generated".to_string())
    } else {
        Ok(result)
    }
}

// ── System prompt builder ────────────────────────────────────────────

fn build_system_prompt(workspace_context: Option<&str>, custom_prompt: Option<&str>) -> String {
    let mut s = SYSTEM_PROMPT.to_string();
    if let Some(ctx) = workspace_context {
        if !ctx.is_empty() {
            s.push_str(&format!("\n\n## Current Project (Workspace)\n{}", ctx));
        }
    }
    if let Some(cp) = custom_prompt {
        if !cp.is_empty() {
            s.push_str(&format!("\n\n## Custom Instructions\n{}", cp));
        }
    }
    s
}

/// Execute a single tool call and return the result string.
fn make_tool_result(tool: &ToolUse, _result: &str, truncated: &str) -> serde_json::Value {
    serde_json::json!({
        "type": "tool_result",
        "tool_use_id": tool.id,
        "content": truncated,
    })
}

/// Truncate long tool results to 5000 chars.
fn truncate_result(result: &str) -> String {
    if result.len() > 5000 {
        format!("{}...\n[Results truncated at 5000 chars]", &result[..5000])
    } else {
        result.to_string()
    }
}

// ── Main tool loop ────────────────────────────────────────────────

const MAX_TOOL_ROUNDS: u32 = 20;

#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    messages: Vec<serde_json::Value>,
    workspace_context: Option<String>,
    model: Option<String>,
    custom_prompt: Option<String>,
    project_api_key: Option<String>,
    project_base_url: Option<String>,
) -> Result<(), String> {
    let api_key = project_api_key.as_deref().unwrap_or(&state.config.api_key);
    let base_url = project_base_url.as_deref().unwrap_or(&state.config.base_url);
    let effective_model = model.unwrap_or_else(|| state.config.model.clone());

    // Ensure session exists for cancellation
    let cancel = {
        let mut sessions = state.sessions.lock().unwrap();
        let entry = sessions.entry(session_id.clone()).or_insert(SessionData {
            cancel: Arc::new(AtomicBool::new(false)),
            cli_child: None,
        });
        entry.cancel.clone()
    };

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

        let system = build_system_prompt(workspace_context.as_deref(), custom_prompt.as_deref());
        let body = serde_json::json!({
            "model": effective_model,
            "system": system,
            "messages": msgs,
            "stream": true,
            "max_tokens": 4096,
            "tools": tools,
        });

        let response = state.http_client
            .post(format!("{}/v1/messages", base_url))
            .header("x-api-key", api_key)
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
            // Permission check for Bash/Write/Read/Edit (ask user before executing)
            if tool.name == "Bash" || tool.name == "Write" || tool.name == "Read" || tool.name == "Edit" {
                let (tx, rx) = oneshot::channel::<bool>();
                {
                    let mut perms = state.pending_permissions.lock().unwrap();
                    perms.insert(session_id.clone(), tx);
                }

                let detail = match tool.name.as_str() {
                    "Bash" => tool.input.get("command").and_then(|v| v.as_str()).unwrap_or(""),
                    "Write" | "Read" | "Edit" => tool.input.get("file_path").and_then(|v| v.as_str()).unwrap_or(""),
                    _ => "",
                };

                let _ = app.emit("tool-permission-request", serde_json::json!({
                    "session_id": session_id,
                    "tool_name": tool.name,
                    "detail": detail,
                    "input": tool.input,
                }));

                // Wait for user response with 60s timeout
                let allowed = tokio::time::timeout(Duration::from_secs(60), rx).await;
                let _ = state.pending_permissions.lock().unwrap().remove(&session_id);
                let _ = app.emit("tool-permission-done", serde_json::json!({
                    "session_id": session_id,
                }));

                match allowed {
                    Ok(Ok(true)) => { /* proceed */ }
                    _ => {
                        let denied_msg = if allowed.is_err() || matches!(&allowed, Err(_)) {
                            "[操作已超时或取消]".to_string()
                        } else {
                            "[用户拒绝了操作]".to_string()
                        };
                        let _ = app.emit("claude-chunk", serde_json::json!({
                            "session_id": session_id,
                            "text": format!("\n\n{}", denied_msg),
                        }));
                        tool_results.push(serde_json::json!({
                            "type": "tool_result",
                            "tool_use_id": tool.id,
                            "content": denied_msg,
                        }));
                        continue;
                    }
                }
            }

            let _ = app.emit("claude-chunk", serde_json::json!({
                "session_id": session_id,
                "text": format!("\n\n[使用工具: {}]\n", tool.name),
            }));

            let result = match tokio::time::timeout(Duration::from_secs(60), execute_tool(tool)).await {
                Ok(r) => r,
                Err(_) => format!("[工具执行超时: {} 超过 60s]", tool.name),
            };

            let truncated = truncate_result(&result);

            let _ = app.emit("tool-execution", serde_json::json!({
                "session_id": session_id,
                "tool_name": tool.name,
                "tool_input": tool.input,
                "output": truncated,
            }));

            let _ = app.emit("claude-chunk", serde_json::json!({
                "session_id": session_id,
                "text": format!("{}\n\n", truncated),
            }));

            tool_results.push(make_tool_result(tool, &result, &truncated));
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

// ── Claude CLI backend ───────────────────────────────────────────────

#[tauri::command]
pub async fn send_message_cli(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    message: String,
    history: Vec<serde_json::Value>,
    workspace_context: Option<String>,
    custom_prompt: Option<String>,
    _model: Option<String>,
) -> Result<(), String> {
    // Build flat prompt from all parts
    let mut prompt = String::with_capacity(65536);
    prompt.push_str("System:\n");
    prompt.push_str(SYSTEM_PROMPT);
    prompt.push('\n');

    if let Some(ref ctx) = workspace_context {
        if !ctx.is_empty() {
            prompt.push_str("\nWorkspace Context:\n");
            prompt.push_str(ctx);
            prompt.push('\n');
        }
    }

    if let Some(ref cp) = custom_prompt {
        if !cp.is_empty() {
            prompt.push_str("\nCustom Instructions:\n");
            prompt.push_str(cp);
            prompt.push('\n');
        }
    }

    // Format conversation history
    if !history.is_empty() {
        prompt.push_str("\nConversation:\n");
        for msg in &history {
            let role = match msg.get("role").and_then(|v| v.as_str()) {
                Some("assistant") => "Assistant",
                _ => "User",
            };
            let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let truncated = if content.len() > 5000 {
                format!("{}...\n[content truncated at 5000 chars]", &content[..5000])
            } else {
                content.to_string()
            };
            prompt.push_str(&format!("{}: {}\n\n", role, truncated));
        }
    }

    // Add current message
    prompt.push_str(&format!("User: {}\n\nAssistant:", message));

    // Safety truncate for very long prompts
    if prompt.len() > 80000 {
        prompt.truncate(80000);
        prompt.push_str("\n\n[Prompt truncated due to length]\n\nAssistant:");
    }

    // Ensure session exists for cancellation
    let cancel = {
        let mut sessions = state.sessions.lock().unwrap();
        let entry = sessions.entry(session_id.clone()).or_insert(SessionData {
            cancel: Arc::new(AtomicBool::new(false)),
            cli_child: None,
        });
        entry.cancel.clone()
    };

    // Spawn claude CLI process (pipe prompt via stdin to avoid cmd line length limits)
    #[cfg(target_os = "windows")]
    let spawn_result = {
        let mut c = tokio::process::Command::new("cmd");
        c.args(["/c", "claude", "--bare", "-p", "--verbose",
            "--output-format", "stream-json", "--include-partial-messages"]);
        c.creation_flags(0x08000000); // CREATE_NO_WINDOW — no console popup
        c.stdin(std::process::Stdio::piped())
         .stdout(std::process::Stdio::piped())
         .stderr(std::process::Stdio::null())
         .spawn()
    };
    #[cfg(not(target_os = "windows"))]
    let spawn_result = {
        tokio::process::Command::new("claude")
            .args(["--bare", "-p", "--verbose",
                "--output-format", "stream-json", "--include-partial-messages"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
    };
    let mut child = spawn_result.map_err(|e| format!("Failed to spawn claude CLI: {}", e))?;

    // Write prompt to stdin and close it
    if let Some(mut stdin) = child.stdin.take() {
        let prompt_clone = prompt.clone();
        tokio::spawn(async move {
            let _ = stdin.write_all(prompt_clone.as_bytes()).await;
            let _ = stdin.shutdown().await;
        });
    }

    let stdout = child.stdout.take().ok_or("No stdout from claude CLI")?;

    // Store child handle for cancellation
    let child_handle = Arc::new(std::sync::Mutex::new(Some(child)));
    {
        let mut sessions = state.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(&session_id) {
            session.cli_child = Some(child_handle);
        }
    }

    let app_clone = app.clone();
    let sid = session_id.clone();
    let cancel_flag = cancel.clone();

    // Read and parse stdout stream in background task
    tauri::async_runtime::spawn(async move {
        use tokio::io::AsyncBufReadExt;
        let reader = tokio::io::BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut emitted_done = false;

        while let Ok(Some(line)) = lines.next_line().await {
            if cancel_flag.load(Ordering::Relaxed) {
                break;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                let type_str = json.get("type").and_then(|v| v.as_str()).unwrap_or("");

                match type_str {
                    "stream_event" => {
                        // Text delta is at event.delta.text (nested inside stream_event.event)
                        if let Some(text) = json.pointer("/event/delta/text").and_then(|v| v.as_str()) {
                            // Only emit text_delta, skip thinking_delta
                            if let Some(dtype) = json.pointer("/event/delta/type").and_then(|v| v.as_str()) {
                                if dtype == "text_delta" {
                                    let _ = app_clone.emit("claude-chunk", serde_json::json!({
                                        "session_id": sid,
                                        "text": text,
                                    }));
                                }
                            }
                        }
                    }
                    "assistant" => {
                        // Extract usage from message.usage (not top-level)
                        // Don't emit done here — multiple assistant events per stream
                        if let Some(msg) = json.get("message") {
                            if let Some(usage) = msg.get("usage") {
                                let _ = app_clone.emit("claude-usage", serde_json::json!({
                                    "session_id": sid,
                                    "usage": usage,
                                }));
                            }
                        }
                    }
                    "error" => {
                        let err_text = json.get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown error from claude CLI");
                        let _ = app_clone.emit("claude-error", serde_json::json!({
                            "session_id": sid,
                            "error": err_text,
                        }));
                        emitted_done = true;
                        let _ = app_clone.emit("claude-done", serde_json::json!({"session_id": sid}));
                    }
                    "result" => {
                        // Final event — emit usage and done
                        if let Some(usage) = json.get("usage") {
                            let _ = app_clone.emit("claude-usage", serde_json::json!({
                                "session_id": sid,
                                "usage": usage,
                            }));
                        }
                        if !emitted_done {
                            emitted_done = true;
                            let _ = app_clone.emit("claude-done", serde_json::json!({"session_id": sid}));
                        }
                    }
                    _ => {}
                }
            }
        }

        // Ensure done is emitted if stream ended without it
        if !emitted_done && !cancel_flag.load(Ordering::Relaxed) {
            let _ = app_clone.emit("claude-done", serde_json::json!({"session_id": sid}));
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn check_claude_installed() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let output = {
        let mut c = tokio::process::Command::new("cmd");
        c.args(["/c", "claude", "--version"]);
        c.creation_flags(0x08000000);
        c.output().await
    };
    #[cfg(not(target_os = "windows"))]
    let output = {
        tokio::process::Command::new("claude")
            .arg("--version")
            .output()
            .await
    };
    let output = output.map_err(|_| "claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code".to_string())?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if version.is_empty() {
            Err("claude CLI returned empty version".to_string())
        } else {
            Ok(version)
        }
    } else {
        Err("claude CLI not found".to_string())
    }
}

#[tauri::command]
pub async fn cancel_message(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&session_id) {
        session.cancel.store(true, Ordering::Relaxed);

        // Kill CLI child process if running
        if let Some(child_arc) = session.cli_child.take() {
            if let Ok(mut guard) = child_arc.lock() {
                if let Some(mut child) = guard.take() {
                    let _ = child.start_kill();
                    // child drops here, killing the process
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn respond_tool_permission(
    state: State<'_, AppState>,
    session_id: String,
    allowed: bool,
) -> Result<(), String> {
    let sender = state.pending_permissions.lock().unwrap().remove(&session_id);
    if let Some(tx) = sender {
        let _ = tx.send(allowed);
    }
    Ok(())
}

#[tauri::command]
pub async fn compress_context(
    state: State<'_, AppState>,
    messages: Vec<serde_json::Value>,
) -> Result<String, String> {
    let system = "You are a conversation summarizer. Your task is to summarize the key information from the following conversation concisely. Preserve technical details, decisions, code references, file paths, and important context. Keep the summary under 500 words. Focus on what would be useful for continuing the conversation.";

    let body = serde_json::json!({
        "model": state.config.model,
        "system": system,
        "messages": messages,
        "max_tokens": 1024,
    });

    let response = state.http_client
        .post(format!("{}/v1/messages", state.config.base_url))
        .header("x-api-key", &state.config.api_key)
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

    parse_sse_text(response).await
}
