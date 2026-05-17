use base64::Engine as _;
use crate::AppState;
use tauri::State;

// ── File listing ────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
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

// ── Workspace context ───────────────────────────────────────────────────

#[tauri::command]
pub async fn read_workspace_context(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("路径不存在".to_string());
    }
    if !p.is_dir() {
        return Err("路径不是目录".to_string());
    }
    read_workspace_context_inner(path).await
}

#[tauri::command]
pub async fn refresh_workspace_context(
    state: State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err("路径不存在或不是目录".to_string());
    }

    // Check key files for modification time changes
    let key_files = ["CLAUDE.md", "package.json", "Cargo.toml"];
    let mut _changed = false;
    {
        let mut mtimes = state.workspace_mtimes.lock().unwrap();
        for fname in &key_files {
            let fpath = p.join(fname);
            if let Ok(meta) = std::fs::metadata(&fpath) {
                if let Ok(mtime) = meta.modified() {
                    let key = format!("{}/{}", path.trim_end_matches('/'), fname);
                    if let Some(prev) = mtimes.get(&key) {
                        if *prev != mtime {
                            _changed = true;
                        }
                    }
                    mtimes.insert(key, mtime);
                }
            }
        }
    }

    // Re-read the full context
    read_workspace_context_inner(path).await
}

async fn read_workspace_context_inner(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    let mut ctx = String::new();
    let project_name = p.file_name().map(|n| n.to_string_lossy()).unwrap_or(std::borrow::Cow::Borrowed("unknown"));
    ctx.push_str(&format!("**Project**: {}\n\n", project_name));

    let claude_path = p.join("CLAUDE.md");
    if claude_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&claude_path) {
            ctx.push_str("**Project Instructions (CLAUDE.md)**:\n");
            ctx.push_str(&content);
            ctx.push('\n');
        }
    }

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

    ctx.push_str("**Directory Structure**:\n\n```\n");
    ctx.push_str(&collect_tree(p, "", 0, 2));
    ctx.push_str("```\n\n");

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

// ── Editor / Format ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_in_editor(path: String) -> Result<(), String> {
    let status = std::process::Command::new("code")
        .arg(&path)
        .status()
        .map_err(|e| format!("Failed to open editor: {}", e))?;
    if !status.success() {
        return Err("Editor process exited with error".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn format_code(path: String, content: String) -> Result<String, String> {
    // Try prettier first for formatting
    let output = tokio::process::Command::new("npx")
        .args(["prettier", "--stdin-filepath", &path])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    match output {
        Ok(mut child) => {
            use tokio::io::AsyncWriteExt;
            if let Some(mut stdin) = child.stdin.take() {
                stdin.write_all(content.as_bytes()).await.map_err(|_| "stdin write error".to_string())?;
                drop(stdin);
            }
            let out = child.wait_with_output().await.map_err(|e| format!("Format error: {}", e))?;
            if out.status.success() {
                let formatted = String::from_utf8_lossy(&out.stdout).to_string();
                if !formatted.is_empty() {
                    return Ok(formatted);
                }
            }
            // Fallback: return stderr message but still return original content
            Err(String::from_utf8_lossy(&out.stderr).to_string())
        }
        Err(_) => Err("Prettier not found. Install with: npm install -g prettier".to_string()),
    }
}

// ── File operations ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| format!("Failed to create directories: {}", e))?;
    }
    tokio::fs::write(&path, &content).await.map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| format!("Failed to create directories: {}", e))?;
    }
    tokio::fs::write(&path, "").await.map_err(|e| format!("Failed to create file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    tokio::fs::create_dir_all(&path).await.map_err(|e| format!("Failed to create directory: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    tokio::fs::rename(&old_path, &new_path).await.map_err(|e| format!("Failed to rename: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_path(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.is_dir() {
        tokio::fs::remove_dir_all(&path).await.map_err(|e| format!("Failed to delete directory: {}", e))?;
    } else {
        tokio::fs::remove_file(&path).await.map_err(|e| format!("Failed to delete file: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path).await.map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<String, String> {
    let data = tokio::fs::read(&path).await.map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

#[tauri::command]
pub async fn run_task(path: String, command: String) -> Result<String, String> {
    let output = tokio::process::Command::new("cmd")
        .args(["/C", &command])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to run task: {}", e))?;
    let mut result = String::new();
    if !output.stdout.is_empty() {
        result.push_str(&String::from_utf8_lossy(&output.stdout));
    }
    if !output.stderr.is_empty() {
        if !result.is_empty() { result.push('\n'); }
        result.push_str(&String::from_utf8_lossy(&output.stderr));
    }
    if result.is_empty() {
        result = format!("(exited with code {})", output.status.code().unwrap_or(-1));
    }
    Ok(result)
}

// ── Tasks JSON ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn read_tasks_json(path: String) -> Result<String, String> {
    let tasks_path = std::path::Path::new(&path).join(".vscode").join("tasks.json");
    if !tasks_path.exists() {
        return Ok("{}".to_string());
    }
    tokio::fs::read_to_string(&tasks_path).await.map_err(|e| format!("Failed to read tasks.json: {}", e))
}

// ── File history ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_file_history(path: String, max_count: Option<usize>) -> Result<Vec<serde_json::Value>, String> {
    let max = max_count.unwrap_or(50);
    let mut entries = Vec::new();
    let base = std::path::Path::new(&path);
    if !base.exists() {
        return Ok(entries);
    }
    let mut walk = tokio::fs::read_dir(base).await.map_err(|e| format!("Failed to read directory: {}", e))?;
    let mut files = Vec::new();
    while let Ok(Some(entry)) = walk.next_entry().await {
        let path = entry.path();
        if path.is_file() {
            if let Ok(metadata) = entry.metadata().await {
                if let Ok(modified) = metadata.modified() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        let elapsed = std::time::SystemTime::now()
                            .duration_since(modified)
                            .unwrap_or_default()
                            .as_secs();
                        files.push((elapsed, name.to_string(), path.to_string_lossy().to_string()));
                    }
                }
            }
        }
    }
    files.sort_by_key(|(elapsed, _, _)| *elapsed);
    for (elapsed, name, full_path) in files.into_iter().take(max) {
        entries.push(serde_json::json!({
            "name": name,
            "path": full_path,
            "modified_ago": elapsed,
        }));
    }
    Ok(entries)
}

// ── Search / Replace ────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct SearchMatch {
    pub file: String,
    pub line: usize,
    pub column: usize,
    pub content: String,
}

#[tauri::command]
pub async fn search_in_files(path: String, query: String) -> Result<Vec<SearchMatch>, String> {

    let query_lower = query.to_lowercase();
    let ignore_dirs = [".git", "node_modules", "target", ".next", "dist", "build", ".cache", ".claude"];

    let result = tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        let mut stack = vec![std::path::PathBuf::from(&path)];

        while let Some(dir) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if !ignore_dirs.contains(&name) && !name.starts_with('.') {
                        stack.push(p);
                    }
                } else if p.is_file() {
                    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                    if ["png", "jpg", "jpeg", "gif", "webp", "ico", "woff", "woff2", "ttf", "eot", "svg"].contains(&ext.as_str()) {
                        continue;
                    }
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        for (i, line) in content.lines().enumerate() {
                            if line.to_lowercase().contains(&query_lower) {
                                let col = line.to_lowercase().find(&query_lower).unwrap_or(0);
                                results.push(SearchMatch {
                                    file: p.to_string_lossy().to_string(),
                                    line: i + 1,
                                    column: col + 1,
                                    content: line.to_string(),
                                });
                                if results.len() >= 500 { return results; }
                            }
                        }
                    }
                }
            }
        }
        results
    }).await.map_err(|e| format!("Search error: {}", e))?;

    Ok(result)
}

#[derive(serde::Serialize)]
pub struct ReplaceResult {
    pub file: String,
    pub count: usize,
}

fn replace_insensitive(text: &str, query: &str, replacement: &str) -> String {
    let query_lower = query.to_lowercase();
    let text_chars: Vec<char> = text.chars().collect();
    let query_chars: Vec<char> = query_lower.chars().collect();
    let mut result = String::new();
    let mut i = 0;
    while i < text_chars.len() {
        if i + query_chars.len() <= text_chars.len() {
            let slice: String = text_chars[i..i + query_chars.len()].iter().collect();
            if slice.to_lowercase() == query_lower {
                result.push_str(replacement);
                i += query_chars.len();
                continue;
            }
        }
        result.push(text_chars[i]);
        i += 1;
    }
    result
}

#[tauri::command]
pub async fn replace_in_files(path: String, query: String, replacement: String) -> Result<Vec<ReplaceResult>, String> {
    let ignore_dirs = [".git", "node_modules", "target", ".next", "dist", "build", ".cache", ".claude"];

    let result = tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        let mut stack = vec![std::path::PathBuf::from(&path)];

        while let Some(dir) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if !ignore_dirs.contains(&name) && !name.starts_with('.') {
                        stack.push(p);
                    }
                } else if p.is_file() {
                    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                    if ["png", "jpg", "jpeg", "gif", "webp", "ico", "woff", "woff2", "ttf", "eot", "svg"].contains(&ext.as_str()) {
                        continue;
                    }
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        if content.to_lowercase().contains(&query.to_lowercase()) {
                            let new_content = replace_insensitive(&content, &query, &replacement);
                            let count = content.to_lowercase().matches(&query.to_lowercase()).count();
                            if count > 0 {
                                let _ = std::fs::write(&p, &new_content);
                                results.push(ReplaceResult {
                                    file: p.to_string_lossy().to_string(),
                                    count,
                                });
                            }
                        }
                    }
                }
            }
        }
        results
    }).await.map_err(|e| format!("Replace error: {}", e))?;

    Ok(result)
}
