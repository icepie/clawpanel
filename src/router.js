/**
 * 极简 hash 路由
 */
const routes = {}
let _contentEl = null

export function registerRoute(path, loader) {
  routes[path] = loader
}

export function navigate(path) {
  window.location.hash = path
}

export function initRouter(contentEl) {
  _contentEl = contentEl
  window.addEventListener('hashchange', () => loadRoute())
  loadRoute()
}

async function loadRoute() {
  const hash = window.location.hash.slice(1) || '/dashboard'
  const loader = routes[hash]
  if (!loader || !_contentEl) return

  _contentEl.innerHTML = ''
  const mod = await loader()
  // 动态 import 返回模块对象，调用 render() 获取页面元素
  const page = mod.render ? await mod.render() : mod.default ? await mod.default() : mod
  if (typeof page === 'string') {
    _contentEl.innerHTML = page
  } else if (page instanceof HTMLElement) {
    _contentEl.appendChild(page)
  }

  // 更新侧边栏激活状态
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.route === hash)
  })
}

export function getCurrentRoute() {
  return window.location.hash.slice(1) || '/dashboard'
}
