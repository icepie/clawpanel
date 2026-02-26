/**
 * Toast 通知组件
 */
let _container = null

function ensureContainer() {
  if (!_container) {
    _container = document.createElement('div')
    _container.className = 'toast-container'
    document.body.appendChild(_container)
  }
  return _container
}

export function toast(message, type = 'info', duration = 3000) {
  const container = ensureContainer()
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = message
  container.appendChild(el)

  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transform = 'translateX(20px)'
    el.style.transition = 'all 250ms ease'
    setTimeout(() => el.remove(), 250)
  }, duration)
}
