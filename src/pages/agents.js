/**
 * Agent 配置页面
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Agent 配置</h1>
      <p class="page-desc">配置默认模型、Fallback 链和记忆搜索</p>
    </div>
    <div id="agent-config">加载中...</div>
    <div style="margin-top:16px">
      <button class="btn btn-primary" id="btn-save-agent">保存配置</button>
    </div>
  `

  const state = { config: null }
  await loadConfig(page, state)

  page.querySelector('#btn-save-agent').onclick = () => saveConfig(page, state)
  return page
}

async function loadConfig(page, state) {
  try {
    state.config = await api.readOpenclawConfig()
    renderConfig(page, state)
  } catch (e) {
    toast('加载配置失败: ' + e, 'error')
  }
}

function renderConfig(page, state) {
  const el = page.querySelector('#agent-config')
  const agents = state.config?.agents || {}
  const defaults = agents.defaults || {}
  const model = defaults.model || {}

  el.innerHTML = `
    <div class="config-section">
      <div class="config-section-title">主模型</div>
      <div class="form-group">
        <label class="form-label">Primary Model</label>
        <input class="form-input" id="primary-model" value="${model.primary || ''}" placeholder="如 newapi-claude/claude-opus-4-6">
      </div>
    </div>

    <div class="config-section">
      <div class="config-section-title">Fallback 链</div>
      <div id="fallback-list">
        ${(model.fallbacks || []).map((f, i) => `
          <div class="fallback-item" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <span style="color:var(--text-tertiary);font-size:var(--font-size-sm);min-width:20px">${i + 1}.</span>
            <input class="form-input fallback-input" value="${f}" style="flex:1">
            <button class="btn btn-sm btn-danger" data-action="remove-fallback" data-index="${i}">删除</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-sm btn-secondary" id="btn-add-fallback">+ 添加 Fallback</button>
    </div>

    <div class="config-section">
      <div class="config-section-title">并发控制</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">最大并发</label>
          <input class="form-input" id="max-concurrent" type="number" value="${defaults.maxConcurrent || 4}" min="1" max="20">
        </div>
        <div class="form-group">
          <label class="form-label">子 Agent 数</label>
          <input class="form-input" id="max-subagents" type="number" value="${defaults.subagents || 2}" min="0" max="10">
        </div>
      </div>
    </div>
  `

  // 删除 fallback
  el.querySelectorAll('[data-action="remove-fallback"]').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.index)
      model.fallbacks.splice(idx, 1)
      renderConfig(page, state)
    }
  })

  // 添加 fallback
  el.querySelector('#btn-add-fallback').onclick = () => {
    if (!model.fallbacks) model.fallbacks = []
    model.fallbacks.push('')
    renderConfig(page, state)
  }
}

async function saveConfig(page, state) {
  // 从 DOM 收集值
  const primary = page.querySelector('#primary-model')?.value || ''
  const fallbacks = [...page.querySelectorAll('.fallback-input')].map(i => i.value).filter(Boolean)
  const maxConcurrent = parseInt(page.querySelector('#max-concurrent')?.value) || 4
  const subagents = parseInt(page.querySelector('#max-subagents')?.value) || 2

  if (!state.config.agents) state.config.agents = {}
  if (!state.config.agents.defaults) state.config.agents.defaults = {}
  state.config.agents.defaults.model = { primary, fallbacks }
  state.config.agents.defaults.maxConcurrent = maxConcurrent
  state.config.agents.defaults.subagents = subagents

  try {
    await api.writeOpenclawConfig(state.config)
    toast('Agent 配置已保存', 'success')
  } catch (e) {
    toast('保存失败: ' + e, 'error')
  }
}
