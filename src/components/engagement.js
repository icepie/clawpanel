/**
 * 社区引导浮窗已停用。
 *
 * 保留同名导出，避免影响现有调用点。
 */

export function tryShowEngagement() {
  return false
}

window.__testEngagement = function() {
  return false
}
