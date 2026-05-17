use std::collections::HashSet;

// ── Git Status ─────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct GitStatus {
    pub branch: String,
    pub changes: Vec<GitChange>,
}

#[derive(serde::Serialize)]
pub struct GitChange {
    pub path: String,
    pub status: String,
}

#[tauri::command]
pub async fn git_status(path: String) -> Result<GitStatus, String> {
    let branch = tokio::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to get git branch: {}", e))?;

    let branch_name = if branch.status.success() {
        String::from_utf8_lossy(&branch.stdout).trim().to_string()
    } else {
        "unknown".to_string()
    };

    let status_output = tokio::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to get git status: {}", e))?;

    let output_str = String::from_utf8_lossy(&status_output.stdout);
    let changes: Vec<GitChange> = output_str
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let status = line.get(0..2).unwrap_or("  ").trim().to_string();
            let file_path = line.get(3..).unwrap_or("").to_string();
            GitChange { path: file_path, status }
        })
        .collect();

    Ok(GitStatus { branch: branch_name, changes })
}

#[tauri::command]
pub async fn git_stage(path: String, file_path: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["add", &file_path])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to stage: {}", e))?;
    if output.status.success() {
        Ok(format!("Staged {}", file_path))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn git_unstage(path: String, file_path: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["reset", "--", &file_path])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to unstage: {}", e))?;
    if output.status.success() {
        Ok(format!("Unstaged {}", file_path))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn git_commit(path: String, message: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to commit: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn git_diff(path: String, file_path: String, staged: bool) -> Result<String, String> {
    let mut args = vec!["diff"];
    if staged { args.push("--cached"); }
    args.push("--");
    args.push(&file_path);
    let output = tokio::process::Command::new("git")
        .args(&args)
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to get diff: {}", e))?;
    let result = String::from_utf8_lossy(&output.stdout).to_string();
    if result.is_empty() {
        Ok("(no diff)".to_string())
    } else {
        Ok(result)
    }
}

#[tauri::command]
pub async fn git_push(path: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["push"])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to push: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

// ── Git: Branch management ──────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct GitBranch {
    pub name: String,
    pub current: bool,
}

#[tauri::command]
pub async fn git_branches(path: String) -> Result<Vec<GitBranch>, String> {
    let output = tokio::process::Command::new("git")
        .args(["branch"])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to list branches: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let out = String::from_utf8_lossy(&output.stdout);
    Ok(out.lines().filter(|l| !l.is_empty()).map(|l| {
        let current = l.starts_with('*');
        let name = l[2..].trim().to_string();
        GitBranch { name, current }
    }).collect())
}

#[tauri::command]
pub async fn git_create_branch(path: String, name: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["branch", &name])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to create branch: {}", e))?;
    if output.status.success() {
        Ok(format!("Created branch '{}'", name))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn git_switch_branch(path: String, name: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["checkout", &name])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to switch branch: {}", e))?;
    if output.status.success() {
        Ok(format!("Switched to '{}'", name))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn git_delete_branch(path: String, name: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["branch", "-d", &name])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to delete branch: {}", e))?;
    if output.status.success() {
        Ok(format!("Deleted branch '{}'", name))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

// ── Git: Stash management ────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct GitStashEntry {
    pub index: usize,
    pub description: String,
}

#[tauri::command]
pub async fn git_stash_push(path: String, message: String) -> Result<String, String> {
    let mut args = vec!["stash", "push"];
    if !message.is_empty() {
        args.push("-m");
        args.push(&message);
    }
    let output = tokio::process::Command::new("git")
        .args(&args)
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to stash: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn git_stash_pop(path: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["stash", "pop"])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to pop stash: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn git_stash_list(path: String) -> Result<Vec<GitStashEntry>, String> {
    let output = tokio::process::Command::new("git")
        .args(["stash", "list"])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to list stashes: {}", e))?;
    let out = String::from_utf8_lossy(&output.stdout);
    Ok(out.lines().filter(|l| !l.is_empty()).enumerate().map(|(i, l)| {
        let desc = if let Some(pos) = l.find(':') {
            l[pos+1..].trim().to_string()
        } else {
            l.to_string()
        };
        GitStashEntry { index: i, description: desc }
    }).collect())
}

#[tauri::command]
pub async fn git_stash_show(path: String, index: usize) -> Result<String, String> {
    let ref_str = format!("stash@{{{}}}", index);
    let output = tokio::process::Command::new("git")
        .args(["stash", "show", "-p", &ref_str])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to show stash: {}", e))?;
    let result = String::from_utf8_lossy(&output.stdout).to_string();
    if result.is_empty() {
        Ok("(empty stash)".to_string())
    } else {
        Ok(result)
    }
}

#[tauri::command]
pub async fn git_stash_drop(path: String, index: usize) -> Result<String, String> {
    let ref_str = format!("stash@{{{}}}", index);
    let output = tokio::process::Command::new("git")
        .args(["stash", "drop", &ref_str])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to drop stash: {}", e))?;
    if output.status.success() {
        Ok(format!("Dropped stash@{{{}}}", index))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

// ── Git: Blame ───────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct GitBlameEntry {
    pub commit: String,
    pub author: String,
    pub date: String,
    pub line: usize,
    pub content: String,
}

#[tauri::command]
pub async fn git_blame(path: String, file_path: String) -> Result<Vec<GitBlameEntry>, String> {
    let output = tokio::process::Command::new("git")
        .args(["blame", "--porcelain", "--", &file_path])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to blame: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let out = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();
    let mut current_commit = String::new();
    let mut current_author = String::new();
    let mut current_time = String::new();
    let mut current_line = 0usize;
    let mut in_header = false;

    for line in out.lines() {
        if line.is_empty() { continue; }

        if line.starts_with('\t') {
            entries.push(GitBlameEntry {
                commit: current_commit.clone(),
                author: current_author.clone(),
                date: current_time.clone(),
                line: current_line,
                content: line[1..].to_string(),
            });
            in_header = false;
            continue;
        }

        if line.len() >= 40 && line.chars().take(40).all(|c| c.is_ascii_hexdigit()) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                current_commit = parts[0].to_string();
                current_line = parts[1].parse().unwrap_or(0);
                in_header = true;
                current_author.clear();
                current_time.clear();
            }
            continue;
        }

        if in_header {
            if let Some(val) = line.strip_prefix("author ") {
                current_author = val.trim().to_string();
            } else if let Some(val) = line.strip_prefix("author-time ") {
                current_time = val.trim().to_string();
            }
        }
    }

    Ok(entries)
}

// ── Git: Pull / Fetch ────────────────────────────────────────────────

#[tauri::command]
pub async fn git_pull(path: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["pull"])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to pull: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn git_fetch(path: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["fetch"])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to fetch: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

// ── Git: Stage hunk (interactive staging) ─────────────────────────────

#[tauri::command]
pub async fn git_stage_hunk(path: String, patch: String) -> Result<String, String> {
    let tmp = std::env::temp_dir().join(format!("hunk_{}.patch", std::process::id()));
    std::fs::write(&tmp, &patch).map_err(|e| format!("Failed to write patch: {}", e))?;

    let output = tokio::process::Command::new("git")
        .args(["apply", "--cached", tmp.to_str().unwrap()])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to apply hunk: {}", e))?;

    let _ = std::fs::remove_file(&tmp);

    if output.status.success() {
        Ok("Hunk staged".to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

// ── Git: Log ─────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct GitLogEntry {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[tauri::command]
pub async fn git_log(path: String, max_count: Option<usize>) -> Result<Vec<GitLogEntry>, String> {
    let count = max_count.unwrap_or(50).to_string();
    let output = tokio::process::Command::new("git")
        .args(["log", "--oneline", format!("--format=%H|%an|%ad|%s").as_str(), "--date=short", format!("-{}", count).as_str()])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to get log: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let out = String::from_utf8_lossy(&output.stdout);
    Ok(out.lines().filter(|l| !l.is_empty()).map(|l| {
        let parts: Vec<&str> = l.splitn(4, '|').collect();
        GitLogEntry {
            hash: parts.first().unwrap_or(&"").to_string(),
            author: parts.get(1).unwrap_or(&"").to_string(),
            date: parts.get(2).unwrap_or(&"").to_string(),
            message: parts.get(3).unwrap_or(&"").to_string(),
        }
    }).collect())
}

#[derive(serde::Serialize)]
pub struct GitLogGraphEntry {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub graph: String,
}

#[tauri::command]
pub async fn git_log_graph(path: String, max_count: Option<usize>) -> Result<Vec<GitLogGraphEntry>, String> {
    let count = max_count.unwrap_or(50).to_string();
    let output = tokio::process::Command::new("git")
        .args(["log", "--graph", "--oneline", "--all", format!("--format=%H|%an|%ad|%s").as_str(), "--date=short", format!("-{}", count).as_str()])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to get graph log: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let out = String::from_utf8_lossy(&output.stdout);
    // Parse graph prefix before the first alphanumeric hash character
    Ok(out.lines().filter(|l| !l.is_empty()).map(|l| {
        let content = l.trim_start();
        let graph_prefix = &l[..l.len() - content.len()];
        let parts: Vec<&str> = content.splitn(4, '|').collect();
        GitLogGraphEntry {
            hash: parts.first().unwrap_or(&"").to_string(),
            author: parts.get(1).unwrap_or(&"").to_string(),
            date: parts.get(2).unwrap_or(&"").to_string(),
            message: parts.get(3).unwrap_or(&"").to_string(),
            graph: graph_prefix.to_string(),
        }
    }).collect())
}

// ── Git: Discard changes ───────────────────────────────────────────────

#[tauri::command]
pub async fn git_discard(path: String, file_path: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["checkout", "--", &file_path])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to discard: {}", e))?;
    if output.status.success() {
        Ok(format!("Discarded changes in {}", file_path))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

// ── Git: Remote management ───────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct GitRemote {
    pub name: String,
    pub url: String,
}

#[tauri::command]
pub async fn git_remote_list(path: String) -> Result<Vec<GitRemote>, String> {
    let output = tokio::process::Command::new("git")
        .args(["remote", "-v"])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to list remotes: {}", e))?;
    let out = String::from_utf8_lossy(&output.stdout);
    let mut remotes = Vec::new();
    let mut seen = HashSet::new();
    for line in out.lines().filter(|l| !l.is_empty()) {
        let parts: Vec<&str> = line.splitn(2, '\t').collect();
        if parts.len() == 2 {
            let name = parts[0].to_string();
            let url = parts[1].split_whitespace().next().unwrap_or("").to_string();
            if seen.insert(name.clone()) {
                remotes.push(GitRemote { name, url });
            }
        }
    }
    Ok(remotes)
}

#[tauri::command]
pub async fn git_remote_add(path: String, name: String, url: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["remote", "add", &name, &url])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to add remote: {}", e))?;
    if output.status.success() {
        Ok(format!("Added remote '{}' -> {}", name, url))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn git_remote_remove(path: String, name: String) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(["remote", "remove", &name])
        .current_dir(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to remove remote: {}", e))?;
    if output.status.success() {
        Ok(format!("Removed remote '{}'", name))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
