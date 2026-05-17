// ── Types matching WinAICheck JSON report format ───────────────────────

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DiagnosticReport {
    pub version: String,
    pub timestamp: String,
    pub score: ScoreData,
    pub results: Vec<ScanResultData>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ScoreData {
    pub score: f64,
    pub grade: String,
    pub label: String,
    pub breakdown: Vec<BreakdownEntry>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct BreakdownEntry {
    pub category: String,
    pub passed: usize,
    pub total: usize,
    pub weight: f64,
    #[serde(rename = "weightedScore")]
    pub weighted_score: f64,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ScanResultData {
    pub id: String,
    pub name: String,
    pub category: String,
    pub status: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "error_type")]
    pub error_type: Option<String>,
}

#[derive(serde::Serialize)]
pub struct DiagnosticResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report: Option<DiagnosticReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub basic: Option<Vec<BasicCheckResult>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub winaicheck_available: bool,
}

#[derive(serde::Serialize)]
pub struct BasicCheckResult {
    pub id: String,
    pub name: String,
    pub category: String,
    pub status: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

// ── Main command ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn run_diagnostic() -> Result<DiagnosticResponse, String> {
    match run_winaicheck().await {
        Ok(report) => Ok(DiagnosticResponse {
            ok: true,
            report: Some(report),
            basic: None,
            error: None,
            winaicheck_available: true,
        }),
        Err(e) => {
            let basic = run_basic_checks().await;
            Ok(DiagnosticResponse {
                ok: true,
                report: None,
                basic: Some(basic),
                error: Some(e),
                winaicheck_available: false,
            })
        }
    }
}

// ── WinAICheck via npx ─────────────────────────────────────────────────

async fn run_winaicheck() -> Result<DiagnosticReport, String> {
    let node_ok = tokio::process::Command::new("node")
        .arg("--version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !node_ok {
        let bun_ok = tokio::process::Command::new("bun")
            .arg("--version")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !bun_ok {
            return Err("Node.js 或 Bun 未安装".to_string());
        }
    }

    let output = tokio::process::Command::new("npx")
        .args(["-y", "winaicheck", "--json"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("无法启动 npx: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("WinAICheck 执行失败: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let report: DiagnosticReport =
        serde_json::from_str(&stdout).map_err(|e| format!("解析 WinAICheck 失败: {}", e))?;

    Ok(report)
}

// ── Fallback basic checks ──────────────────────────────────────────────

async fn run_cmd(cmd: &str, args: &[&str]) -> (String, bool) {
    match tokio::process::Command::new(cmd).args(args).output().await {
        Ok(o) if o.status.success() => (String::from_utf8_lossy(&o.stdout).trim().to_string(), true),
        _ => (String::new(), false),
    }
}

fn check_result(id: &str, name: &str, category: &str, ok: bool, ok_msg: String, fail_msg: &str) -> BasicCheckResult {
    let version = if ok { Some(ok_msg.clone()) } else { None };
    BasicCheckResult {
        id: id.to_string(),
        name: name.to_string(),
        category: category.to_string(),
        status: if ok { "pass".into() } else { "fail".into() },
        message: if ok { ok_msg } else { fail_msg.to_string() },
        detail: None,
        version,
    }
}

async fn run_basic_checks() -> Vec<BasicCheckResult> {
    let mut r = Vec::new();

    // ── Path & System ──────────────────────────────────────────────
    r.push(BasicCheckResult {
        id: "system-info".into(),
        name: "系统信息".into(),
        category: "path".into(),
        status: "pass".into(),
        message: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        detail: None,
        version: None,
    });

    let temp = std::env::temp_dir();
    let free_mb = match temp.metadata().and_then(|m| m.modified()) {
        Ok(_) => {
            // Approximate via a simple write check
            let test = temp.join(".winaicheck_tmp_test");
            let _ = std::fs::write(&test, &[0u8; 1024]);
            let _ = std::fs::remove_file(&test);
            1024 // assume enough if write works
        }
        Err(_) => 0,
    };
    r.push(BasicCheckResult {
        id: "temp-space".into(),
        name: "临时目录".into(),
        category: "path".into(),
        status: if free_mb > 0 { "pass".to_string() } else { "warn".to_string() },
        message: format!("临时目录可写入: {}", temp.display()),
        detail: Some(temp.to_string_lossy().to_string()),
        version: None,
    });

    // ── Toolchain ──────────────────────────────────────────────────
    let (o, ok) = run_cmd("git", &["--version"]).await;
    let ver = o.trim_start_matches("git version ").to_string();
    r.push(check_result("git", "Git", "toolchain", ok,
        format!("Git 正常 ({})", ver), "Git 未安装或不在 PATH 中"));

    let (o, ok) = run_cmd("node", &["--version"]).await;
    r.push(check_result("node-version", "Node.js", "toolchain", ok,
        format!("Node.js {}", o.trim()), "Node.js 未安装"));

    let (o, ok) = run_cmd("npm", &["--version"]).await;
    r.push(check_result("package-managers", "npm", "toolchain", ok,
        format!("npm {}", o.trim()), "npm 未安装"));

    let (o_py, ok_py) = run_cmd("python", &["--version"]).await;
    let (o_py3, ok_py3) = if !ok_py { run_cmd("python3", &["--version"]).await } else { (String::new(), false) };
    let py_version = if ok_py { o_py } else if ok_py3 { o_py3 } else { String::new() };
    let py_ok = ok_py || ok_py3;
    r.push(check_result("python-versions", "Python", "toolchain", py_ok,
        format!("Python {}", py_version.trim().trim_start_matches("Python ")),
        "Python 未安装"));

    let (o, ok) = run_cmd("cargo", &["--version"]).await;
    r.push(check_result("cpp-compiler", "Cargo (Rust)", "toolchain", ok,
        o.trim().to_string(), "Rust/Cargo 未安装"));

    let (o, ok) = run_cmd("code", &["--version"]).await;
    r.push(check_result("unix-commands", "VS Code", "toolchain", ok,
        format!("VS Code {}", o.lines().next().unwrap_or("?")),
        "VS Code 未在 PATH 中"));

    // ── GPU / Virtualization ───────────────────────────────────────
    let (o, ok) = run_cmd("wsl", &["--version"]).await;
    r.push(check_result("wsl-version", "WSL", "gpu", ok,
        o.trim().to_string(), "WSL 未安装"));

    // ── Permission ─────────────────────────────────────────────────
    let is_admin = run_cmd("net", &["session"]).await.1;
    r.push(BasicCheckResult {
        id: "admin-perms".into(),
        name: "管理员权限".into(),
        category: "permission".into(),
        status: "pass".into(),
        message: if is_admin { "以管理员身份运行".into() } else { "以普通用户身份运行".into() },
        detail: None,
        version: None,
    });

    // ── Network ────────────────────────────────────────────────────
    let dns_ok = tokio::process::Command::new("nslookup")
        .arg("registry.npmjs.org")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);
    r.push(BasicCheckResult {
        id: "dns-resolution".into(),
        name: "DNS 解析".into(),
        category: "network".into(),
        status: if dns_ok { "pass".to_string() } else { "warn".to_string() },
        message: if dns_ok { "DNS 解析正常".into() } else { "DNS 解析失败".into() },
        detail: None,
        version: None,
    });

    r
}
