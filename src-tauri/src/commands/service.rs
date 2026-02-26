/// 服务管理命令 (macOS launchd)
use std::process::Command;

use crate::models::types::ServiceStatus;

const SERVICES: &[(&str, &str)] = &[
    ("ai.openclaw.gateway", "OpenClaw Gateway"),
    ("com.openclaw.guardian.watch", "健康监控 (60s)"),
    ("com.openclaw.guardian.backup", "配置备份 (3600s)"),
    ("com.openclaw.watchdog", "看门狗 (120s)"),
];

#[tauri::command]
pub fn get_services_status() -> Result<Vec<ServiceStatus>, String> {
    let output = Command::new("launchctl")
        .arg("list")
        .output()
        .map_err(|e| format!("执行 launchctl 失败: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();

    for (label, desc) in SERVICES {
        let mut status = ServiceStatus {
            label: label.to_string(),
            pid: None,
            running: false,
            description: desc.to_string(),
        };

        // 解析 launchctl list 输出: PID\tStatus\tLabel
        for line in stdout.lines() {
            if line.contains(label) {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 3 {
                    if let Ok(pid) = parts[0].trim().parse::<u32>() {
                        status.pid = Some(pid);
                        status.running = true;
                    }
                }
                break;
            }
        }
        results.push(status);
    }

    Ok(results)
}

fn plist_path(label: &str) -> String {
    let home = dirs::home_dir().unwrap_or_default();
    format!(
        "{}/Library/LaunchAgents/{}.plist",
        home.display(),
        label
    )
}

#[tauri::command]
pub fn start_service(label: String) -> Result<(), String> {
    let path = plist_path(&label);
    Command::new("launchctl")
        .args(["load", &path])
        .output()
        .map_err(|e| format!("启动失败: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn stop_service(label: String) -> Result<(), String> {
    let path = plist_path(&label);
    Command::new("launchctl")
        .args(["unload", &path])
        .output()
        .map_err(|e| format!("停止失败: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn restart_service(label: String) -> Result<(), String> {
    let path = plist_path(&label);
    let _ = Command::new("launchctl")
        .args(["unload", &path])
        .output();
    std::thread::sleep(std::time::Duration::from_millis(500));
    Command::new("launchctl")
        .args(["load", &path])
        .output()
        .map_err(|e| format!("重启失败: {e}"))?;
    Ok(())
}
