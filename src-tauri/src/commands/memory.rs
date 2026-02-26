/// 记忆文件管理命令
use std::fs;
use std::path::PathBuf;

fn openclaw_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".openclaw")
}

fn memory_dir(category: &str) -> PathBuf {
    match category {
        "memory" => openclaw_dir().join("workspace").join("memory"),
        "archive" => openclaw_dir().join("workspace-memory"),
        "core" => openclaw_dir().join("workspace"),
        _ => openclaw_dir().join("workspace").join("memory"),
    }
}

#[tauri::command]
pub fn list_memory_files(category: String) -> Result<Vec<String>, String> {
    let dir = memory_dir(&category);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut files = Vec::new();
    collect_files(&dir, &dir, &mut files, &category)?;
    files.sort();
    Ok(files)
}

fn collect_files(
    base: &PathBuf,
    dir: &PathBuf,
    files: &mut Vec<String>,
    category: &str,
) -> Result<(), String> {
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("读取目录失败: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // core 类别只读根目录的 .md 文件
            if category != "core" {
                collect_files(base, &path, files, category)?;
            }
        } else {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if matches!(ext, "md" | "txt" | "json" | "jsonl") {
                let rel = path.strip_prefix(base)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| path.to_string_lossy().to_string());
                files.push(rel);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn read_memory_file(path: String) -> Result<String, String> {
    // 安全检查：路径不能包含 ..
    if path.contains("..") {
        return Err("非法路径".to_string());
    }

    // 尝试在各个记忆目录下查找
    let candidates = [
        memory_dir("memory").join(&path),
        memory_dir("archive").join(&path),
        memory_dir("core").join(&path),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return fs::read_to_string(candidate)
                .map_err(|e| format!("读取失败: {e}"));
        }
    }

    Err(format!("文件不存在: {path}"))
}

#[tauri::command]
pub fn write_memory_file(path: String, content: String) -> Result<(), String> {
    if path.contains("..") {
        return Err("非法路径".to_string());
    }

    let candidates = [
        memory_dir("memory").join(&path),
        memory_dir("archive").join(&path),
        memory_dir("core").join(&path),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return fs::write(candidate, &content)
                .map_err(|e| format!("写入失败: {e}"));
        }
    }

    // 默认写入 memory 目录
    let target = memory_dir("memory").join(&path);
    if let Some(parent) = target.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&target, &content)
        .map_err(|e| format!("写入失败: {e}"))
}
