mod lsp;
use lsp::LspManager;
mod dap;
use dap::DapManager;
mod git;
mod fs;
mod terminal;
mod config;
mod api;
mod diagnostics;
mod watcher;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, State};
use tokio::sync::oneshot;

use crate::config::AppConfig;

// ── Shared types ─────────────────────────────────────────────────────────

pub(crate) struct SessionData {
    pub(crate) cancel: Arc<AtomicBool>,
    pub(crate) cli_child: Option<Arc<Mutex<Option<tokio::process::Child>>>>,
}

pub(crate) struct TerminalInstance {
    pub(crate) stdin: Option<tokio::process::ChildStdin>,
}

pub(crate) struct AppState {
    pub(crate) config: AppConfig,
    pub(crate) http_client: reqwest::Client,
    pub(crate) sessions: Mutex<HashMap<String, SessionData>>,
    pub(crate) term_counter: AtomicU64,
    pub(crate) terminals: Mutex<HashMap<String, TerminalInstance>>,
    pub(crate) pending_permissions: Mutex<HashMap<String, oneshot::Sender<bool>>>,
    pub(crate) workspace_mtimes: Mutex<HashMap<String, std::time::SystemTime>>,
    pub(crate) lsp_manager: LspManager,
    pub(crate) dap_manager: DapManager,
}

// ── Snippets ─────────────────────────────────────────────────────────────

fn snippets_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Cannot find home directory".to_string())?;
    let dir = std::path::Path::new(&home).join(".claude");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    Ok(dir.join("snippets.json"))
}

#[tauri::command]
fn read_snippets() -> Result<String, String> {
    let path = snippets_path()?;
    if !path.exists() {
        return Ok("[]".to_string());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read snippets: {}", e))
}

#[tauri::command]
fn write_snippets(content: String) -> Result<(), String> {
    // Validate JSON
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    let path = snippets_path()?;
    std::fs::write(&path, &content).map_err(|e| format!("Failed to write snippets: {}", e))
}

// ── LSP Integration ────────────────────────────────────────────────────

#[tauri::command]
async fn lsp_start_server(
    app: AppHandle,
    state: State<'_, AppState>,
    language: String,
    workspace: String,
) -> Result<String, String> {
    state.lsp_manager.start_server(app, &language, &workspace).await
}

#[tauri::command]
async fn lsp_stop_server(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    state.lsp_manager.stop_server(&server_id).await;
    Ok(())
}

#[tauri::command]
async fn lsp_request(
    state: State<'_, AppState>,
    server_id: String,
    method: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    state.lsp_manager.send_request(&server_id, &method, params).await
}

#[tauri::command]
async fn lsp_notification(
    state: State<'_, AppState>,
    server_id: String,
    method: String,
    params: serde_json::Value,
) -> Result<(), String> {
    state.lsp_manager.send_notification(&server_id, &method, params).await
}

#[tauri::command]
async fn lsp_check_servers() -> Vec<serde_json::Value> {
    let mut results = Vec::new();
    for lang in lsp::get_supported_languages() {
        let available = lsp::detect_server(lang)
            .map(|(cmd, _)| lsp::check_command_exists(cmd))
            .unwrap_or(false);
        results.push(serde_json::json!({
            "language": lang,
            "available": available,
        }));
    }
    results
}

// ── Extension Installer ───────────────────────────────────────────────────

#[tauri::command]
async fn install_extension(
    state: State<'_, AppState>,
    vsix_url: String,
    extension_name: String,
) -> Result<serde_json::Value, String> {
    // Try download with browser-like headers for better compatibility
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;
    let response = client
        .get(&vsix_url)
        .send()
        .await
        .map_err(|e| format!("下载扩展失败 (请检查网络连接): {}", e))?;
    let total = response.content_length().unwrap_or(0);
    let bytes = response.bytes()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "找不到用户目录")?;
    let ext_dir = std::path::Path::new(&home)
        .join(".claude-desktop")
        .join("extensions")
        .join(&extension_name);
    std::fs::create_dir_all(&ext_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    let reader = std::io::Cursor::new(&bytes[..]);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("无效的 VSIX 包: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("读取压缩包失败: {}", e))?;
        let out_path = ext_dir.join(file.name());
        if file.name().ends_with('/') {
            std::fs::create_dir_all(&out_path).map_err(|e| format!("创建目录失败: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
            }
            let mut outfile = std::fs::File::create(&out_path)
                .map_err(|e| format!("创建文件失败: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("写入文件失败: {}", e))?;
        }
    }

    let pkg_path = ext_dir.join("extension").join("package.json");
    let pkg_content = std::fs::read_to_string(&pkg_path)
        .map_err(|_| "扩展包缺少 extension/package.json".to_string())?;
    let pkg: serde_json::Value = serde_json::from_str(&pkg_content)
        .map_err(|e| format!("解析 package.json 失败: {}", e))?;

    let name = pkg.get("name").and_then(|v| v.as_str()).unwrap_or(&extension_name);
    let display_name = pkg.get("displayName").and_then(|v| v.as_str()).unwrap_or(name);
    let version = pkg.get("version").and_then(|v| v.as_str()).unwrap_or("0.0.0");
    let description = pkg.get("description").and_then(|v| v.as_str()).unwrap_or("");
    let author = pkg.get("publisher").and_then(|v| v.as_str()).unwrap_or("");
    let main_js = pkg.get("main").and_then(|v| v.as_str()).unwrap_or("");
    let main_path = if !main_js.is_empty() { format!("extension/{}", main_js) } else { String::new() };
    let activation_events = pkg.get("activationEvents")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>());

    let manifest = serde_json::json!({
        "name": name, "displayName": display_name, "version": version,
        "description": description, "author": author,
        "publisher": pkg.get("publisher"),
        "main": main_path, "path": ext_dir.to_string_lossy(), "enabled": true,
        "engines": pkg.get("engines"), "categories": pkg.get("categories"),
        "contributes": pkg.get("contributes"),
        "activationEvents": activation_events,
    });

    let manifest_str = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("序列化清单失败: {}", e))?;
    std::fs::write(ext_dir.join("manifest.json"), &manifest_str)
        .map_err(|e| format!("写入清单失败: {}", e))?;

    Ok(manifest)
}

#[tauri::command]
async fn install_extension_from_data(
    state: State<'_, AppState>,
    data: String,
    extension_name: String,
) -> Result<serde_json::Value, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("解码数据失败: {}", e))?;

    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "找不到用户目录")?;
    let ext_dir = std::path::Path::new(&home)
        .join(".claude-desktop")
        .join("extensions")
        .join(&extension_name);
    std::fs::create_dir_all(&ext_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    let reader = std::io::Cursor::new(&bytes[..]);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("无效的 VSIX 包: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("读取压缩包失败: {}", e))?;
        let out_path = ext_dir.join(file.name());
        if file.name().ends_with('/') {
            std::fs::create_dir_all(&out_path).map_err(|e| format!("创建目录失败: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
            }
            let mut outfile = std::fs::File::create(&out_path)
                .map_err(|e| format!("创建文件失败: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("写入文件失败: {}", e))?;
        }
    }

    let pkg_path = ext_dir.join("extension").join("package.json");
    let pkg_content = std::fs::read_to_string(&pkg_path)
        .map_err(|_| "扩展包缺少 extension/package.json".to_string())?;
    let pkg: serde_json::Value = serde_json::from_str(&pkg_content)
        .map_err(|e| format!("解析 package.json 失败: {}", e))?;

    let name = pkg.get("name").and_then(|v| v.as_str()).unwrap_or(&extension_name);
    let display_name = pkg.get("displayName").and_then(|v| v.as_str()).unwrap_or(name);
    let version = pkg.get("version").and_then(|v| v.as_str()).unwrap_or("0.0.0");
    let description = pkg.get("description").and_then(|v| v.as_str()).unwrap_or("");
    let author = pkg.get("publisher").and_then(|v| v.as_str()).unwrap_or("");
    let main_js = pkg.get("main").and_then(|v| v.as_str()).unwrap_or("");
    let main_path = if !main_js.is_empty() { format!("extension/{}", main_js) } else { String::new() };
    let activation_events = pkg.get("activationEvents")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>());

    let manifest = serde_json::json!({
        "name": name, "displayName": display_name, "version": version,
        "description": description, "author": author,
        "publisher": pkg.get("publisher"),
        "main": main_path, "path": ext_dir.to_string_lossy(), "enabled": true,
        "engines": pkg.get("engines"), "categories": pkg.get("categories"),
        "contributes": pkg.get("contributes"),
        "activationEvents": activation_events,
    });

    let manifest_str = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("序列化清单失败: {}", e))?;
    std::fs::write(ext_dir.join("manifest.json"), &manifest_str)
        .map_err(|e| format!("写入清单失败: {}", e))?;

    Ok(manifest)
}

// ── DAP Integration ────────────────────────────────────────────────────

#[tauri::command]
async fn dap_start_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    state.dap_manager.start_session(app, &session_id, &command, args, cwd.as_deref()).await
}

#[tauri::command]
async fn dap_stop_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    state.dap_manager.stop_session(&session_id).await;
    Ok(())
}

#[tauri::command]
async fn dap_send_request(
    state: State<'_, AppState>,
    session_id: String,
    command: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    state.dap_manager.send_request(&session_id, &command, args).await
}

#[tauri::command]
async fn dap_send_request_raw(
    state: State<'_, AppState>,
    session_id: String,
    command: String,
    args: serde_json::Value,
) -> Result<u64, String> {
    state.dap_manager.send_request_raw(&session_id, &command, args).await
}

// ── Application entry ─────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = config::load_config().expect("Failed to load API config");

    tauri::Builder::default()
        .manage(AppState {
            http_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(60))
                .build()
                .expect("Failed to create HTTP client"),
            config,
            sessions: Mutex::new(HashMap::new()),
            term_counter: AtomicU64::new(0),
            terminals: Mutex::new(HashMap::new()),
            pending_permissions: Mutex::new(HashMap::new()),
            workspace_mtimes: Mutex::new(HashMap::new()),
            lsp_manager: LspManager::new(),
            dap_manager: DapManager::new(),
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
            // api module
            api::send_message,
            api::send_message_cli,
            api::cancel_message,
            api::respond_tool_permission,
            api::check_claude_installed,
            api::compress_context,
            // fs module
            fs::list_directory,
            fs::read_workspace_context,
            fs::refresh_workspace_context,
            fs::open_in_editor,
            fs::format_code,
            fs::create_file,
            fs::create_directory,
            fs::rename_path,
            fs::delete_path,
            fs::write_file,
            fs::read_file,
            fs::read_file_base64,
            fs::run_task,
            fs::search_in_files,
            fs::replace_in_files,
            fs::read_tasks_json,
            fs::get_file_history,
            // terminal module
            terminal::spawn_terminal,
            terminal::write_stdin,
            terminal::kill_terminal,
            // git module
            git::git_status,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            git::git_diff,
            git::git_push,
            git::git_branches,
            git::git_create_branch,
            git::git_switch_branch,
            git::git_delete_branch,
            git::git_stash_push,
            git::git_stash_pop,
            git::git_stash_list,
            git::git_stash_show,
            git::git_stash_drop,
            git::git_blame,
            git::git_pull,
            git::git_fetch,
            git::git_log,
            git::git_log_graph,
            git::git_stage_hunk,
            git::git_discard,
            git::git_remote_list,
            git::git_remote_add,
            git::git_remote_remove,
            // lib module (defined in this file)
            read_snippets,
            write_snippets,
            install_extension,
            install_extension_from_data,
            lsp_start_server,
            lsp_stop_server,
            lsp_request,
            lsp_notification,
            lsp_check_servers,
            dap_start_session,
            dap_stop_session,
            dap_send_request,
            dap_send_request_raw,
            // watcher module
            watcher::start_file_watcher,
            watcher::stop_file_watcher,
            // diagnostic module
            diagnostics::run_diagnostic,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
