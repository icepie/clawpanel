/**
 * 记忆文件管理页面
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

const CATEGORIES = [
  { key: 'memory', label: '工作记忆' },
  { key: 'archive', label: '记忆归档' },
  { key: 'core', label: '核心文件' },
]

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">记忆文件</h1>
      <p class="page-desc">管理 OpenClaw 工作记忆和归档文件</p>
    </div>
    <div class="tab-bar">
      ${CATEGORIES.map((c, i) => `<div class="tab${i === 0 ? ' active' : ''}" data-tab="${c.key}">${c.label}</div>`).join('')}
    </div>
    <div class="memory-layout">
      <div class="memory-sidebar" id="file-tree">加载中...</div>
      <div class="memory-editor">
        <div class="editor-toolbar">
          <span id="current-file" style="font-size:var(--font-size-sm);color:var(--text-tertiary)">选择文件查看</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-secondary" id="btn-preview" disabled>预览</button>
            <button class="btn btn-sm btn-primary" id="btn-save-file" disabled>保存</button>
          </div>
        </div>
        <textarea class="editor-area" id="file-editor" placeholder="选择左侧文件进行编辑..." disabled></textarea>
      </div>
    </div>
  `

  const state = { category: 'memory', currentPath: null }

  // Tab 切换
  page.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      page.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      state.category = tab.dataset.tab
      state.currentPath = null
      resetEditor(page)
      loadFiles(page, state)
    }
  })

  // 保存
  page.querySelector('#btn-save-file').onclick = () => saveFile(page, state)

  loadFiles(page, state)
  return page
}

async function loadFiles(page, state) {
  const tree = page.querySelector('#file-tree')
  tree.innerHTML = '<div style="color:var(--text-tertiary);padding:12px">加载中...</div>'

  try {
    const files = await api.listMemoryFiles(state.category)
    if (!files || !files.length) {
      tree.innerHTML = '<div style="color:var(--text-tertiary);padding:12px">暂无文件</div>'
      return
    }
    renderFileTree(page, state, files)
  } catch (e) {
    toast('加载文件列表失败: ' + e, 'error')
  }
}

function renderFileTree(page, state, files) {
  const tree = page.querySelector('#file-tree')
  tree.innerHTML = files.map(f => {
    const name = f.split('/').pop()
    const active = state.currentPath === f ? ' active' : ''
    return `<div class="file-item${active}" data-path="${f}">${name}</div>`
  }).join('')

  tree.querySelectorAll('.file-item').forEach(item => {
    item.onclick = () => {
      state.currentPath = item.dataset.path
      tree.querySelectorAll('.file-item').forEach(i => i.classList.remove('active'))
      item.classList.add('active')
      loadFileContent(page, state)
    }
  })
}

async function loadFileContent(page, state) {
  const editor = page.querySelector('#file-editor')
  const label = page.querySelector('#current-file')
  const btnSave = page.querySelector('#btn-save-file')
  const btnPreview = page.querySelector('#btn-preview')

  editor.disabled = true
  editor.value = '加载中...'
  label.textContent = state.currentPath

  try {
    const content = await api.readMemoryFile(state.currentPath)
    editor.value = content || ''
    editor.disabled = false
    btnSave.disabled = false
    btnPreview.disabled = false
  } catch (e) {
    editor.value = '读取失败: ' + e
    toast('读取文件失败: ' + e, 'error')
  }
}

function resetEditor(page) {
  const editor = page.querySelector('#file-editor')
  editor.value = ''
  editor.disabled = true
  page.querySelector('#current-file').textContent = '选择文件查看'
  page.querySelector('#btn-save-file').disabled = true
  page.querySelector('#btn-preview').disabled = true
}

async function saveFile(page, state) {
  if (!state.currentPath) return
  const content = page.querySelector('#file-editor').value
  try {
    await api.writeMemoryFile(state.currentPath, content)
    toast('文件已保存', 'success')
  } catch (e) {
    toast('保存失败: ' + e, 'error')
  }
}
