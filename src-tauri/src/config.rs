// ── AppConfig ──────────────────────────────────────────────────────────

pub struct AppConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

pub fn load_config() -> Result<AppConfig, String> {
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
