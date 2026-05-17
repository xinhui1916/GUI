use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;
use crate::{AppState, TerminalInstance};

// ── Terminal management ──────────────────────────────────────────────────

#[tauri::command]
pub async fn spawn_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
    shell: Option<String>,
) -> Result<String, String> {
    let id = state.term_counter.fetch_add(1, Ordering::Relaxed);
    let id_str = format!("term-{}", id);

    let work_dir = path.unwrap_or_else(|| {
        std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".to_string())
    });

    let shell_cmd = shell.unwrap_or_else(|| "cmd.exe".to_string());
    let mut child = tokio::process::Command::new(&shell_cmd)
        .current_dir(&work_dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn terminal: {}", e))?;

    let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    // Store stdin handle
    {
        let mut terms = state.terminals.lock().unwrap();
        terms.insert(id_str.clone(), TerminalInstance { stdin: Some(stdin) });
    }

    let app_clone = app.clone();
    let term_id = id_str.clone();
    // Read stdout in background
    tauri::async_runtime::spawn(async move {
        use tokio::io::AsyncBufReadExt;
        let reader = tokio::io::BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone.emit("terminal-output", serde_json::json!({
                "terminal_id": term_id,
                "data": line,
            }));
        }
    });

    let app_clone2 = app.clone();
    let term_id2 = id_str.clone();
    // Read stderr in background
    tauri::async_runtime::spawn(async move {
        use tokio::io::AsyncBufReadExt;
        let reader = tokio::io::BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone2.emit("terminal-output", serde_json::json!({
                "terminal_id": term_id2,
                "data": line,
            }));
        }
    });

    Ok(id_str)
}

#[tauri::command]
pub async fn write_stdin(
    state: State<'_, AppState>,
    terminal_id: String,
    input: String,
) -> Result<(), String> {
    let stdin_opt = {
        let mut terms = state.terminals.lock().unwrap();
        terms.get_mut(&terminal_id)
            .and_then(|t| t.stdin.take())
    };
    match stdin_opt {
        Some(mut stdin) => {
            stdin.write_all(input.as_bytes()).await.map_err(|e| format!("Write error: {}", e))?;
            stdin.flush().await.map_err(|e| format!("Flush error: {}", e))?;
            // Return stdin handle
            let mut terms = state.terminals.lock().unwrap();
            if let Some(term) = terms.get_mut(&terminal_id) {
                term.stdin = Some(stdin);
            }
            Ok(())
        }
        None => {
            // Put back None
            let terms = state.terminals.lock().unwrap();
            if !terms.contains_key(&terminal_id) {
                return Err("Terminal not found".to_string());
            }
            Err("Terminal stdin closed".to_string())
        }
    }
}

#[tauri::command]
pub fn kill_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
) -> Result<(), String> {
    let mut terms = state.terminals.lock().unwrap();
    terms.remove(&terminal_id);
    Ok(())
}
