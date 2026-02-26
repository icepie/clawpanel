/// 日志读取命令
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

fn log_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".openclaw")
        .join("logs")
}

fn log_path(log_name: &str) -> PathBuf {
    let filename = match log_name {
        "gateway" => "gateway.log",
        "gateway-err" => "gateway.err.log",
        "guardian" => "guardian.log",
        "guardian-backup" => "guardian-backup.log",
        "config-audit" => "config-audit.jsonl",
        _ => "gateway.log",
    };
    log_dir().join(filename)
}

#[tauri::command]
pub fn read_log_tail(log_name: String, lines: usize) -> Result<String, String> {
    let path = log_path(&log_name);
    if !path.exists() {
        return Ok(String::new());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取日志失败: {e}"))?;

    let all_lines: Vec<&str> = content.lines().collect();
    let start = if all_lines.len() > lines {
        all_lines.len() - lines
    } else {
        0
    };

    Ok(all_lines[start..].join("\n"))
}

#[tauri::command]
pub fn search_log(
    log_name: String,
    query: String,
    max_results: usize,
) -> Result<Vec<String>, String> {
    let path = log_path(&log_name);
    if !path.exists() {
        return Ok(vec![]);
    }

    let file = fs::File::open(&path)
        .map_err(|e| format!("打开日志失败: {e}"))?;
    let reader = BufReader::new(file);
    let query_lower = query.to_lowercase();

    let results: Vec<String> = reader
        .lines()
        .filter_map(|l| l.ok())
        .filter(|l| l.to_lowercase().contains(&query_lower))
        .take(max_results)
        .collect();

    Ok(results)
}
