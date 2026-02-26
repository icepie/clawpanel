mod commands;
mod models;

use commands::{config, logs, memory, service};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // 配置
            config::read_openclaw_config,
            config::write_openclaw_config,
            config::read_mcp_config,
            config::write_mcp_config,
            config::get_version_info,
            // 服务
            service::get_services_status,
            service::start_service,
            service::stop_service,
            service::restart_service,
            // 日志
            logs::read_log_tail,
            logs::search_log,
            // 记忆文件
            memory::list_memory_files,
            memory::read_memory_file,
            memory::write_memory_file,
        ])
        .run(tauri::generate_context!())
        .expect("启动 ClawPanel 失败");
}
