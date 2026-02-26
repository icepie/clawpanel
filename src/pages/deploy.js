/**
 * ClawApp 部署页面
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ClawApp 部署</h1>
      <p class="page-desc">一键生成 ClawApp 客户端配置</p>
    </div>
    <div id="deploy-content">加载中...</div>
  `

  await loadDeployConfig(page)
  return page
}

async function loadDeployConfig(page) {
  const el = page.querySelector('#deploy-content')
  try {
    const [config, version] = await Promise.all([
      api.readOpenclawConfig(),
      api.getVersionInfo(),
    ])

    const gw = config?.gateway || {}
    const port = gw.port || 18789
    const bind = gw.bind || 'loopback'
    const token = gw.authToken || ''

    // 推断 Gateway URL
    let gwUrl = `http://127.0.0.1:${port}`
    if (gw.tailscale?.address) {
      gwUrl = `http://${gw.tailscale.address}`
    }

    const envContent = [
      `# ClawApp 环境配置`,
      `# 由 ClawPanel 自动生成`,
      `VITE_GATEWAY_URL=${gwUrl}`,
      token ? `VITE_AUTH_TOKEN=${token}` : `# VITE_AUTH_TOKEN=`,
      `VITE_APP_VERSION=${version?.current || 'unknown'}`,
    ].join('\n')

    renderDeployUI(page, el, envContent, gwUrl, token)
  } catch (e) {
    toast('加载部署配置失败: ' + e, 'error')
    el.innerHTML = '<div style="color:var(--text-tertiary)">加载失败</div>'
  }
}

function renderDeployUI(page, el, envContent, gwUrl, token) {
  el.innerHTML = `
    <div class="config-section">
      <div class="config-section-title">连接信息</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="stat-card">
          <div class="stat-card-header"><span class="stat-card-label">Gateway URL</span></div>
          <div class="stat-card-value" style="font-size:var(--font-size-sm);font-family:var(--font-mono)">${gwUrl}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-header"><span class="stat-card-label">认证状态</span></div>
          <div class="stat-card-value">${token ? '已配置 Token' : '无认证'}</div>
        </div>
      </div>
    </div>

    <div class="config-section">
      <div class="config-section-title">.env 文件预览</div>
      <div class="log-viewer" style="max-height:200px;margin-bottom:12px">
        ${envContent.split('\n').map(l => `<div class="log-line">${escapeHtml(l)}</div>`).join('')}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" id="btn-copy-env">复制到剪贴板</button>
        <button class="btn btn-secondary btn-sm" id="btn-write-env">写入 .env 文件</button>
      </div>
    </div>

    <div class="config-section">
      <div class="config-section-title">写入路径</div>
      <div class="form-group">
        <input class="form-input" id="env-path" value="" placeholder="输入 ClawApp 项目 .env 文件路径">
      </div>
    </div>
  `

  // 复制到剪贴板
  el.querySelector('#btn-copy-env').onclick = async () => {
    try {
      await navigator.clipboard.writeText(envContent)
      toast('已复制到剪贴板', 'success')
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = envContent
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      toast('已复制到剪贴板', 'success')
    }
  }

  // 写入文件
  el.querySelector('#btn-write-env').onclick = async () => {
    const path = el.querySelector('#env-path')?.value
    if (!path) {
      toast('请输入 .env 文件路径', 'error')
      return
    }
    try {
      await api.writeEnvFile(path, envContent)
      toast('.env 文件已写入', 'success')
    } catch (e) {
      toast('写入失败: ' + e, 'error')
    }
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
