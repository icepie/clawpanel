/**
 * 服务管理页面
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">服务管理</h1>
      <p class="page-desc">管理 OpenClaw 相关的 launchd 服务</p>
    </div>
    <div id="services-list">加载中...</div>
  `

  loadServices(page)
  return page
}

async function loadServices(page) {
  try {
    const services = await api.getServicesStatus()
    renderServices(page, services)
  } catch (e) {
    toast('加载服务状态失败: ' + e, 'error')
  }
}

function renderServices(page, services) {
  const listEl = page.querySelector('#services-list')
  listEl.innerHTML = services.map(s => `
    <div class="service-card" data-label="${s.label}">
      <div class="service-info">
        <span class="status-dot ${s.running ? 'running' : 'stopped'}"></span>
        <div>
          <div class="service-name">${s.label}</div>
          <div class="service-desc">${s.description}${s.pid ? ' · PID: ' + s.pid : ''}</div>
        </div>
      </div>
      <div class="service-actions">
        ${s.running
          ? `<button class="btn btn-sm btn-secondary" data-action="stop">停止</button>
             <button class="btn btn-sm btn-primary" data-action="restart">重启</button>`
          : `<button class="btn btn-sm btn-primary" data-action="start">启动</button>`
        }
      </div>
    </div>
  `).join('')

  // 绑定操作按钮
  listEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async () => {
      const card = btn.closest('.service-card')
      const label = card.dataset.label
      const action = btn.dataset.action
      btn.disabled = true
      btn.textContent = '执行中...'
      try {
        if (action === 'start') await api.startService(label)
        else if (action === 'stop') await api.stopService(label)
        else if (action === 'restart') await api.restartService(label)
        toast(`${label} ${action} 成功`, 'success')
        loadServices(page)
      } catch (e) {
        toast(`操作失败: ${e}`, 'error')
        btn.disabled = false
        btn.textContent = action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'
      }
    }
  })
}
