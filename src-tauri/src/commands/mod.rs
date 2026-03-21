use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::RwLock;
use std::time::Duration;

pub mod agent;
pub mod assistant;
pub mod config;
pub mod device;
pub mod extensions;
pub mod logs;
pub mod memory;
pub mod messaging;
pub mod pairing;
pub mod service;
pub mod skills;
pub mod update;

/// 默认 OpenClaw 配置目录（ClawPanel 自身配置始终在此）
fn default_openclaw_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".openclaw")
}

/// 获取 OpenClaw 配置目录
/// 优先使用 clawpanel.json 中的 openclawDir 自定义路径，不存在则回退默认 ~/.openclaw
pub fn openclaw_dir() -> PathBuf {
    // 直接读 clawpanel.json（始终在默认目录下），避免循环依赖
    let config_path = default_openclaw_dir().join("clawpanel.json");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(custom) = v.get("openclawDir").and_then(|d| d.as_str()) {
                let p = PathBuf::from(custom);
                if !custom.is_empty() && p.exists() {
                    return p;
                }
            }
        }
    }
    default_openclaw_dir()
}

fn panel_config_path() -> PathBuf {
    // ClawPanel 自身配置始终在默认目录，不随 openclawDir 变化
    default_openclaw_dir().join("clawpanel.json")
}

fn read_panel_config_value() -> Option<serde_json::Value> {
    std::fs::read_to_string(panel_config_path())
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
}

pub fn configured_proxy_url() -> Option<String> {
    let value = read_panel_config_value()?;
    let raw = value
        .get("networkProxy")
        .and_then(|entry| {
            if let Some(obj) = entry.as_object() {
                obj.get("url").and_then(|v| v.as_str())
            } else {
                entry.as_str()
            }
        })?
        .trim()
        .to_string();
    if raw.is_empty() {
        None
    } else {
        Some(raw)
    }
}

fn should_bypass_proxy_host(host: &str) -> bool {
    let lower = host.trim().to_ascii_lowercase();
    if lower.is_empty() || lower == "localhost" || lower.ends_with(".local") {
        return true;
    }
    if let Ok(ip) = lower.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
            IpAddr::V6(v6) => {
                v6.is_loopback() || v6.is_unique_local() || v6.is_unicast_link_local()
            }
        };
    }
    false
}

/// 构建 HTTP 客户端，use_proxy=true 时走用户配置的代理
pub fn build_http_client(
    timeout: Duration,
    user_agent: Option<&str>,
) -> Result<reqwest::Client, String> {
    build_http_client_opt(timeout, user_agent, true)
}

/// 构建模型请求用的 HTTP 客户端
/// 默认不走代理；用户在面板设置中开启 proxyModelRequests 后才走代理
pub fn build_http_client_no_proxy(
    timeout: Duration,
    user_agent: Option<&str>,
) -> Result<reqwest::Client, String> {
    let use_proxy = read_panel_config_value()
        .and_then(|v| v.get("networkProxy")?.get("proxyModelRequests")?.as_bool())
        .unwrap_or(false);
    build_http_client_opt(timeout, user_agent, use_proxy)
}

fn build_http_client_opt(
    timeout: Duration,
    user_agent: Option<&str>,
    use_proxy: bool,
) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().timeout(timeout).gzip(true);
    if let Some(ua) = user_agent {
        builder = builder.user_agent(ua);
    }
    if use_proxy {
        if let Some(proxy_url) = configured_proxy_url() {
            let proxy_value = proxy_url.clone();
            builder = builder.proxy(reqwest::Proxy::custom(move |url| {
                let host = url.host_str().unwrap_or("");
                if should_bypass_proxy_host(host) {
                    None
                } else {
                    Some(proxy_value.clone())
                }
            }));
        }
    }
    builder.build().map_err(|e| e.to_string())
}

pub fn apply_proxy_env(cmd: &mut std::process::Command) {
    if let Some(proxy_url) = configured_proxy_url() {
        cmd.env("HTTP_PROXY", &proxy_url)
            .env("HTTPS_PROXY", &proxy_url)
            .env("http_proxy", &proxy_url)
            .env("https_proxy", &proxy_url)
            .env("NO_PROXY", "localhost,127.0.0.1,::1")
            .env("no_proxy", "localhost,127.0.0.1,::1");
    }
}

pub fn apply_proxy_env_tokio(cmd: &mut tokio::process::Command) {
    if let Some(proxy_url) = configured_proxy_url() {
        cmd.env("HTTP_PROXY", &proxy_url)
            .env("HTTPS_PROXY", &proxy_url)
            .env("http_proxy", &proxy_url)
            .env("https_proxy", &proxy_url)
            .env("NO_PROXY", "localhost,127.0.0.1,::1")
            .env("no_proxy", "localhost,127.0.0.1,::1");
    }
}

/// 缓存 enhanced_path 结果，避免每次调用都扫描文件系统
/// 使用 RwLock 替代 OnceLock，支持运行时刷新缓存
static ENHANCED_PATH_CACHE: RwLock<Option<String>> = RwLock::new(None);

/// Tauri 应用启动时 PATH 可能不完整：
/// - macOS 从 Finder 启动时 PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin
/// - Windows 上安装 Node.js 到非默认路径、或安装后未重启进程
///
/// 补充 Node.js / npm 常见安装路径
pub fn enhanced_path() -> String {
    // 先尝试读缓存
    if let Ok(guard) = ENHANCED_PATH_CACHE.read() {
        if let Some(ref cached) = *guard {
            return cached.clone();
        }
    }
    // 缓存为空，重新构建
    let path = build_enhanced_path();
    if let Ok(mut guard) = ENHANCED_PATH_CACHE.write() {
        *guard = Some(path.clone());
    }
    path
}

/// 刷新 enhanced_path 缓存，使新设置的 Node.js 路径立即生效（无需重启应用）
pub fn refresh_enhanced_path() {
    let new_path = build_enhanced_path();
    if let Ok(mut guard) = ENHANCED_PATH_CACHE.write() {
        *guard = Some(new_path);
    }
}

fn build_enhanced_path() -> String {
    let home = dirs::home_dir().unwrap_or_default();

    // 读取用户自定义 Node.js 路径（复用已有函数，只读一次文件）
    let custom_path = read_panel_config_value()
        .and_then(|v| v.get("nodePath")?.as_str().map(String::from));

    #[cfg(target_os = "macos")]
    {
        let current = std::env::var("PATH").unwrap_or_default();

        // nvm: 使用 NVM_DIR 环境变量（兼容自定义位置），默认 ~/.nvm
        let nvm_dir = std::env::var("NVM_DIR")
            .ok()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join(".nvm"));

        let mut extra: Vec<String> = vec![
            nvm_dir.join("current/bin").to_string_lossy().to_string(),
            format!("{}/.volta/bin", home.display()),
            format!("{}/.nodenv/shims", home.display()),
            format!("{}/n/bin", home.display()),
            format!("{}/.npm-global/bin", home.display()),
            "/usr/local/bin".into(),
            "/opt/homebrew/bin".into(),
        ];

        if let Ok(prefix) = std::env::var("NPM_CONFIG_PREFIX") {
            extra.push(format!("{}/bin", prefix));
        }

        // 枚举 nvm 所有已安装版本（兼容无 current 符号链接的情况）
        let nvm_versions = nvm_dir.join("versions/node");
        if nvm_versions.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
                for entry in entries.flatten() {
                    extra.push(entry.path().join("bin").to_string_lossy().to_string());
                }
            }
        }

        // fnm
        let fnm_dir = std::env::var("FNM_DIR")
            .ok()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share/fnm"));
        if fnm_dir.join("node-versions").is_dir() {
            if let Ok(entries) = std::fs::read_dir(fnm_dir.join("node-versions")) {
                for entry in entries.flatten() {
                    let bin = entry.path().join("installation/bin");
                    if bin.is_dir() {
                        extra.push(bin.to_string_lossy().to_string());
                    }
                }
            }
        }

        collect_path_unix(&custom_path, &extra, &current)
    }

    #[cfg(target_os = "linux")]
    {
        let current = std::env::var("PATH").unwrap_or_default();

        let nvm_dir = std::env::var("NVM_DIR")
            .ok()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join(".nvm"));

        let mut extra: Vec<String> = vec![
            nvm_dir.join("current/bin").to_string_lossy().to_string(),
            format!("{}/.volta/bin", home.display()),
            format!("{}/.nodenv/shims", home.display()),
            format!("{}/n/bin", home.display()),
            format!("{}/.npm-global/bin", home.display()),
            format!("{}/.local/bin", home.display()),
            "/usr/local/bin".into(),
            "/usr/bin".into(),
            "/snap/bin".into(),
        ];

        if let Ok(prefix) = std::env::var("NPM_CONFIG_PREFIX") {
            extra.push(format!("{}/bin", prefix));
        }

        let nvm_versions = nvm_dir.join("versions/node");
        if nvm_versions.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
                for entry in entries.flatten() {
                    extra.push(entry.path().join("bin").to_string_lossy().to_string());
                }
            }
        }

        let fnm_dir = std::env::var("FNM_DIR")
            .ok()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share/fnm"));
        if fnm_dir.join("node-versions").is_dir() {
            if let Ok(entries) = std::fs::read_dir(fnm_dir.join("node-versions")) {
                for entry in entries.flatten() {
                    let bin = entry.path().join("installation/bin");
                    if bin.is_dir() {
                        extra.push(bin.to_string_lossy().to_string());
                    }
                }
            }
        }

        // nodesource / 手动安装
        let nodejs_lib = std::path::Path::new("/usr/local/lib/nodejs");
        if nodejs_lib.is_dir() {
            if let Ok(entries) = std::fs::read_dir(nodejs_lib) {
                for entry in entries.flatten() {
                    let bin = entry.path().join("bin");
                    if bin.is_dir() {
                        extra.push(bin.to_string_lossy().to_string());
                    }
                }
            }
        }

        collect_path_unix(&custom_path, &extra, &current)
    }

    #[cfg(target_os = "windows")]
    {
        let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
        let pf86 =
            std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".into());
        let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let appdata = std::env::var("APPDATA").unwrap_or_default();

        // 从注册表读取最新 PATH 并展开 %VAR% 变量
        let current = read_windows_path_from_registry()
            .map(|p| expand_env_vars_windows(&p))
            .unwrap_or_else(|| std::env::var("PATH").unwrap_or_default());

        // NVM_SYMLINK / NVM_HOME / FNM_DIR 也从注册表读，避免进程快照问题
        let nvm_symlink = read_windows_user_env("NVM_SYMLINK")
            .or_else(|| std::env::var("NVM_SYMLINK").ok());
        let nvm_home = read_windows_user_env("NVM_HOME")
            .or_else(|| std::env::var("NVM_HOME").ok());
        let fnm_dir_reg = read_windows_user_env("FNM_DIR")
            .or_else(|| std::env::var("FNM_DIR").ok());

        let mut extra: Vec<String> = vec![];

        // 1. NVM_SYMLINK（nvm-windows 活跃版本符号链接）—— 最高优先级
        if let Some(ref sym) = nvm_symlink {
            if std::path::Path::new(sym).is_dir() {
                extra.push(sym.clone());
            }
        }

        // 2. NVM_HOME —— 枚举所有已安装版本
        if let Some(ref nvm_home) = nvm_home {
            if let Ok(entries) = std::fs::read_dir(nvm_home) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() && p.join("node.exe").exists() {
                        extra.push(p.to_string_lossy().to_string());
                    }
                }
            }
        }

        // 3. %APPDATA%\nvm（nvm-windows 默认）—— 枚举版本子目录
        if !appdata.is_empty() {
            let nvm_dir = std::path::Path::new(&appdata).join("nvm");
            if nvm_dir.is_dir() {
                extra.push(nvm_dir.to_string_lossy().to_string());
                if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() && p.join("node.exe").exists() {
                            extra.push(p.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }

        // 4. volta
        extra.push(format!(r"{}\.volta\bin", home.display()));

        // 5. fnm —— 枚举版本目录
        let fnm_base = fnm_dir_reg
            .as_deref()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| {
                // fnm 默认: %LOCALAPPDATA%\fnm
                if !localappdata.is_empty() {
                    std::path::Path::new(&localappdata).join("fnm")
                } else {
                    std::path::Path::new(&appdata).join("fnm")
                }
            });
        let fnm_versions = fnm_base.join("node-versions");
        if fnm_versions.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&fnm_versions) {
                for entry in entries.flatten() {
                    let inst = entry.path().join("installation");
                    if inst.is_dir() && inst.join("node.exe").exists() {
                        extra.push(inst.to_string_lossy().to_string());
                    }
                }
            }
        }

        // 6. npm 全局
        if !appdata.is_empty() {
            extra.push(format!(r"{}\npm", appdata));
        }

        // 7. 系统默认 Node.js 安装路径
        extra.push(format!(r"{}\nodejs", pf));
        extra.push(format!(r"{}\nodejs", pf86));
        if !localappdata.is_empty() {
            extra.push(format!(r"{}\Programs\nodejs", localappdata));
        }

        // 8. 扫描常见盘符
        for drive in &["C", "D", "E", "F"] {
            extra.push(format!(r"{}:\nodejs", drive));
            extra.push(format!(r"{}:\Node", drive));
            extra.push(format!(r"{}:\Program Files\nodejs", drive));
        }

        let mut parts: Vec<&str> = vec![];
        if let Some(ref cp) = custom_path {
            parts.push(cp.as_str());
        }
        for p in &extra {
            if std::path::Path::new(p).exists() {
                parts.push(p.as_str());
            }
        }
        if !current.is_empty() {
            parts.push(&current);
        }
        parts.join(";")
    }
}

/// Unix 路径合并：自定义路径 → extra → 系统 PATH，去重保留顺序
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn collect_path_unix(custom: &Option<String>, extra: &[String], current: &str) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut parts: Vec<String> = vec![];

    let mut push = |s: &str| {
        if !s.is_empty() && seen.insert(s.to_string()) {
            parts.push(s.to_string());
        }
    };

    if let Some(ref cp) = custom {
        push(cp.as_str());
    }
    for p in extra {
        push(p.as_str());
    }
    for seg in current.split(':') {
        push(seg);
    }
    parts.join(":")
}

/// Windows: 展开路径字符串中的 %VARNAME% 环境变量引用
#[cfg(target_os = "windows")]
fn expand_env_vars_windows(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let mut var_name = String::new();
            let mut found_close = false;
            for inner in chars.by_ref() {
                if inner == '%' {
                    found_close = true;
                    break;
                }
                var_name.push(inner);
            }
            if found_close && !var_name.is_empty() {
                if let Ok(val) = std::env::var(&var_name) {
                    result.push_str(&val);
                } else {
                    // 变量不存在，原样保留
                    result.push('%');
                    result.push_str(&var_name);
                    result.push('%');
                }
            } else {
                result.push('%');
                result.push_str(&var_name);
            }
        } else {
            result.push(c);
        }
    }
    result
}

/// Windows: 从注册表用户 Environment 键读取指定环境变量
#[cfg(target_os = "windows")]
fn read_windows_user_env(name: &str) -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(r"Environment", KEY_READ)
        .ok()?
        .get_value(name)
        .ok()
}

/// 从 Windows 注册表读取最新的 PATH 环境变量
/// 合并系统 PATH（HKLM）和用户 PATH（HKCU），绕过进程启动时的快照
#[cfg(target_os = "windows")]
fn read_windows_path_from_registry() -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let sys_key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(
            r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
            KEY_READ,
        )
        .ok();
    let user_key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(r"Environment", KEY_READ)
        .ok();

    let sys_path: String = sys_key
        .as_ref()
        .and_then(|k| k.get_value("Path").ok())
        .unwrap_or_default();
    let user_path: String = user_key
        .as_ref()
        .and_then(|k| k.get_value("Path").ok())
        .unwrap_or_default();

    let combined = match (sys_path.is_empty(), user_path.is_empty()) {
        (true, true) => return None,
        (true, false) => user_path,
        (false, true) => sys_path,
        (false, false) => format!("{};{}", sys_path, user_path),
    };
    Some(combined)
}
