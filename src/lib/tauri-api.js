/**
 * Tauri API 封装层
 * 开发阶段用 mock 数据，Tauri 环境用 invoke
 */

const isTauri = !!window.__TAURI__

async function invoke(cmd, args = {}) {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    return tauriInvoke(cmd, args)
  }
  // 开发模式 mock
  return mockInvoke(cmd, args)
}

// Mock 数据，方便纯浏览器开发调试
function mockInvoke(cmd, args) {
  const mocks = {
    get_services_status: () => [
      { label: 'ai.openclaw.gateway', pid: 54284, running: true, description: 'OpenClaw Gateway' },
      { label: 'com.openclaw.guardian.watch', pid: 54301, running: true, description: '健康监控 (60s)' },
      { label: 'com.openclaw.guardian.backup', pid: null, running: false, description: '配置备份 (3600s)' },
      { label: 'com.openclaw.watchdog', pid: 54320, running: true, description: '看门狗 (120s)' },
    ],
    get_version_info: () => ({
      current: '2026.2.23',
      latest: null,
      update_available: false,
    }),
    read_openclaw_config: () => ({
      meta: { lastTouchedVersion: '2026.2.23' },
      models: { mode: 'replace', providers: {} },
      agents: { defaults: { model: { primary: 'newapi-claude/claude-opus-4-6', fallbacks: [] } } },
      gateway: { port: 18789, mode: 'local', bind: 'loopback' },
    }),
    read_log_tail: () => '2026-02-26 13:29:01 [INFO] Gateway started on :18789\n2026-02-26 13:29:02 [INFO] Agent connected\n',
    list_memory_files: () => [],
    read_mcp_config: () => ({}),
  }
  const fn = mocks[cmd]
  return fn ? Promise.resolve(fn(args)) : Promise.reject(`未知命令: ${cmd}`)
}

// 导出 API
export const api = {
  // 服务管理
  getServicesStatus: () => invoke('get_services_status'),
  startService: (label) => invoke('start_service', { label }),
  stopService: (label) => invoke('stop_service', { label }),
  restartService: (label) => invoke('restart_service', { label }),

  // 配置
  getVersionInfo: () => invoke('get_version_info'),
  readOpenclawConfig: () => invoke('read_openclaw_config'),
  writeOpenclawConfig: (config) => invoke('write_openclaw_config', { config }),
  readMcpConfig: () => invoke('read_mcp_config'),
  writeMcpConfig: (config) => invoke('write_mcp_config', { config }),

  // 日志
  readLogTail: (logName, lines = 100) => invoke('read_log_tail', { logName, lines }),
  searchLog: (logName, query, maxResults = 50) => invoke('search_log', { logName, query, maxResults }),

  // 记忆文件
  listMemoryFiles: (category) => invoke('list_memory_files', { category }),
  readMemoryFile: (path) => invoke('read_memory_file', { path }),
  writeMemoryFile: (path, content) => invoke('write_memory_file', { path, content }),

  // 安装/部署
  checkInstallation: () => invoke('check_installation'),
  getDeployConfig: () => invoke('get_deploy_config'),
  writeEnvFile: (path, config) => invoke('write_env_file', { path, config }),
}
