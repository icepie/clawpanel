/**
 * 仪表盘页面
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">仪表盘</h1>
      <p class="page-desc">OpenClaw 运行状态概览</p>
    </div>
    <div class="stat-cards" id="stat-cards">
      <div class="stat-card loading-placeholder"></div>
      <div class="stat-card loading-placeholder"></div>
      <div class="stat-card loading-placeholder"></div>
      <div class="stat-card loading-placeholder"></div>
    </div>
    <div class="quick-actions">
      <button class="btn btn-secondary" id="btn-restart-gw">重启 Gateway</button>
      <button class="btn btn-secondary" id="btn-check-update">检查更新</button>
    </div>
    <div class="config-section">
      <div class="config-section-title">最近日志</div>
      <div class="log-viewer" id="recent-logs" style="max-height:300px">加载中...</div>
    </div>
  `

  // 异步加载数据
  loadDashboardData(page)
  return page
}

async function loadDashboardData(page) {
  try {
    const [services, version, logs] = await Promise.all([
      api.getServicesStatus(),
      api.getVersionInfo(),
      api.readLogTail('gateway', 20),
    ])

    renderStatCards(page, services, version)
    renderLogs(page, logs)
    bindActions(page)
  } catch (e) {
    toast('加载仪表盘数据失败: ' + e, 'error')
  }
}

function renderStatCards(page, services, version) {
  const cardsEl = page.querySelector('#stat-cards')
  const gw = services.find(s => s.label.includes('gateway'))
  const guardian = services.find(s => s.label.includes('guardian.watch'))
  const watchdog = services.find(s => s.label.includes('watchdog'))
  const runningCount = services.filter(s => s.running).length

  cardsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-header">
        <span class="stat-card-label">Gateway</span>
        <span class="status-dot ${gw?.running ? 'running' : 'stopped'}"></span>
      </div>
      <div class="stat-card-value">${gw?.running ? '运行中' : '已停止'}</div>
      <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-top:4px">
        ${gw?.pid ? 'PID: ' + gw.pid : ''}
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <span class="stat-card-label">Guardian</span>
        <span class="status-dot ${guardian?.running ? 'running' : 'stopped'}"></span>
      </div>
      <div class="stat-card-value">${guardian?.running ? '运行中' : '已停止'}</div>
      <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-top:4px">健康监控</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <span class="stat-card-label">Watchdog</span>
        <span class="status-dot ${watchdog?.running ? 'running' : 'stopped'}"></span>
      </div>
      <div class="stat-card-value">${watchdog?.running ? '运行中' : '已停止'}</div>
      <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-top:4px">看门狗</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <span class="stat-card-label">版本</span>
      </div>
      <div class="stat-card-value">${version.current || '未知'}</div>
      <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-top:4px">
        服务 ${runningCount}/${services.length} 运行中
      </div>
    </div>
  `
}

function renderLogs(page, logs) {
  const logsEl = page.querySelector('#recent-logs')
  if (!logs) { logsEl.textContent = '暂无日志'; return }
  const lines = logs.trim().split('\n')
  logsEl.innerHTML = lines.map(l => `<div class="log-line">${escapeHtml(l)}</div>`).join('')
  logsEl.scrollTop = logsEl.scrollHeight
}

function bindActions(page) {
  page.querySelector('#btn-restart-gw')?.addEventListener('click', async () => {
    try {
      await api.restartService('ai.openclaw.gateway')
      toast('Gateway 已重启', 'success')
    } catch (e) {
      toast('重启失败: ' + e, 'error')
    }
  })

  page.querySelector('#btn-check-update')?.addEventListener('click', async () => {
    try {
      const info = await api.getVersionInfo()
      if (info.update_available) {
        toast(`发现新版本: ${info.latest}`, 'info')
      } else {
        toast('已是最新版本', 'success')
      }
    } catch (e) {
      toast('检查更新失败: ' + e, 'error')
    }
  })
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
