/// 配置读写命令
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

use crate::models::types::VersionInfo;

fn openclaw_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".openclaw")
}

#[tauri::command]
pub fn read_openclaw_config() -> Result<Value, String> {
    let path = openclaw_dir().join("openclaw.json");
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取配置失败: {e}"))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("解析 JSON 失败: {e}"))
}

#[tauri::command]
pub fn write_openclaw_config(config: Value) -> Result<(), String> {
    let path = openclaw_dir().join("openclaw.json");
    // 备份
    let bak = openclaw_dir().join("openclaw.json.bak");
    let _ = fs::copy(&path, &bak);
    // 写入
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(&path, json)
        .map_err(|e| format!("写入失败: {e}"))
}

#[tauri::command]
pub fn read_mcp_config() -> Result<Value, String> {
    let path = openclaw_dir().join("mcp.json");
    if !path.exists() {
        return Ok(Value::Object(Default::default()));
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取 MCP 配置失败: {e}"))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("解析 JSON 失败: {e}"))
}

#[tauri::command]
pub fn write_mcp_config(config: Value) -> Result<(), String> {
    let path = openclaw_dir().join("mcp.json");
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(&path, json)
        .map_err(|e| format!("写入失败: {e}"))
}

#[tauri::command]
pub fn get_version_info() -> Result<VersionInfo, String> {
    // 从 openclaw.json 的 meta.lastTouchedVersion 读取
    let config = read_openclaw_config()?;
    let current = config
        .get("meta")
        .and_then(|m| m.get("lastTouchedVersion"))
        .and_then(|v| v.as_str())
        .map(String::from);

    Ok(VersionInfo {
        current,
        latest: None,
        update_available: false,
    })
}
