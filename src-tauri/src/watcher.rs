use notify::Watcher;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

fn watchers() -> &'static Mutex<HashMap<String, notify::RecommendedWatcher>> {
    static WATCHERS: OnceLock<Mutex<HashMap<String, notify::RecommendedWatcher>>> =
        OnceLock::new();
    WATCHERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn stop_flags() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static FLAGS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    FLAGS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Start watching a directory recursively for file changes.
/// Emits `file-changed` Tauri events with `{ paths: string[] }` payload.
#[tauri::command]
pub fn start_file_watcher(app: AppHandle, path: String) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<notify::Event, notify::Error>>();

    let mut watcher = notify::RecommendedWatcher::new(tx, notify::Config::default())
        .map_err(|e| format!("Watcher init error: {:?}", e))?;

    watcher
        .watch(std::path::Path::new(&path), notify::RecursiveMode::Recursive)
        .map_err(|e| format!("Watch start error: {:?}", e))?;

    let app_clone = app.clone();
    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_clone = stop_flag.clone();

    // Store stop flag (overwrite any existing one for this path)
    stop_flags()
        .lock()
        .unwrap()
        .insert(path.clone(), stop_flag);

    // Spawn a std::thread since notify's receiver is synchronous
    std::thread::Builder::new()
        .name("fs-watcher".into())
        .spawn(move || {
            let debounce = std::time::Duration::from_millis(400);
            let mut last_emit = std::time::Instant::now();
            let mut pending_paths: Vec<String> = Vec::new();

            loop {
                match rx.recv_timeout(std::time::Duration::from_millis(200)) {
                    Ok(Ok(event)) => {
                        // Skip access events (metadata reads, atime changes)
                        if matches!(event.kind, notify::EventKind::Access(_)) {
                            continue;
                        }
                        for p in &event.paths {
                            let s = p.to_string_lossy().to_string();
                            if !pending_paths.contains(&s) {
                                pending_paths.push(s);
                            }
                        }

                        if last_emit.elapsed() >= debounce {
                            pending_paths.sort();
                            let _ = app_clone.emit(
                                "file-changed",
                                serde_json::json!({ "paths": pending_paths }),
                            );
                            pending_paths.clear();
                            last_emit = std::time::Instant::now();
                        }
                    }
                    Ok(Err(e)) => {
                        eprintln!("[watcher] error: {:?}", e);
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        // Flush pending events if debounce elapsed
                        if !pending_paths.is_empty() && last_emit.elapsed() >= debounce {
                            pending_paths.sort();
                            let _ = app_clone.emit(
                                "file-changed",
                                serde_json::json!({ "paths": pending_paths }),
                            );
                            pending_paths.clear();
                            last_emit = std::time::Instant::now();
                        }
                        // Check stop flag
                        if stop_clone.load(Ordering::Relaxed) {
                            // Flush remaining
                            if !pending_paths.is_empty() {
                                let _ = app_clone.emit(
                                    "file-changed",
                                    serde_json::json!({ "paths": pending_paths }),
                                );
                            }
                            break;
                        }
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        })
        .map_err(|e| format!("Thread spawn error: {:?}", e))?;

    // Store watcher to keep it alive (the internal notify thread)
    watchers().lock().unwrap().insert(path, watcher);

    Ok(())
}

/// Stop watching a directory.
#[tauri::command]
pub fn stop_file_watcher(path: String) -> Result<(), String> {
    // Drop the watcher (stops the internal notify thread)
    watchers().lock().unwrap().remove(&path);
    // Signal the receiver thread to stop
    if let Some(flag) = stop_flags().lock().unwrap().remove(&path) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}
