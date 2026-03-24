import { api, invalidate } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showUpgradeModal, showConfirm } from '../components/modal.js'
import { setUpgrading } from '../lib/app-state.js'
import { icon, statusIcon } from '../lib/icons.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;gap:16px">
      <img src="/images/logo-brand.png" alt="NiceClaw" style="height:48px;width:auto">
      <div>
        <h1 class="page-title" style="margin:0">NiceClaw</h1>
        <p class="page-desc" style="margin:0">OpenClaw 可视化管理面板</p>
      </div>
    </div>
    <div class="stat-cards" id="version-cards">
      <div class="stat-card loading-placeholder"></div>
      <div class="stat-card loading-placeholder"></div>
      <div class="stat-card loading-placeholder"></div>
    </div>
    <div class="config-section" style="color:var(--text-tertiary);font-size:var(--font-size-xs)">
      <p>NiceClaw 基于 Tauri v2 构建，前端 Vanilla JS + Vite，后端 Rust。</p>
      <p style="margin-top:8px">MIT License &copy; 2026</p>
    </div>
  `

  loadData(page)
  return page
}

async function loadData(page) {
  const cards = page.querySelector('#version-cards')
  try {
    const [version, install] = await Promise.all([
      api.getVersionInfo(),
      api.checkInstallation(),
    ])

    // 尝试从 Tauri API 获取 NiceClaw 自身版本号，失败则 fallback
    let panelVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'
    try {
      const { getVersion } = await import('@tauri-apps/api/app')
      panelVersion = await getVersion()
    } catch {
      // 非 Tauri 环境或 API 不可用，使用构建时注入的版本号
    }

    // 异步检查前端热更新
    let panelUpdateHtml = '<span style="color:var(--text-tertiary)">检查更新中...</span>'
    checkHotUpdate(cards, panelVersion)

    const isInstalled = !!version.current
    const sourceLabel = version.source === 'official' ? '官方版' : '汉化版'
    const btnSm = 'padding:2px 8px;font-size:var(--font-size-xs)'
    const hasRecommended = !!version.recommended
    const aheadOfRecommended = isInstalled && hasRecommended && !!version.ahead_of_recommended
    const driftFromRecommended = isInstalled && hasRecommended && !version.is_recommended && !aheadOfRecommended
    const policyRiskHint = aheadOfRecommended
      ? `检测到你本地安装的是高于推荐稳定版的 ${version.current}，可能存在接口、事件或配置兼容性问题。建议回退到 ${version.recommended}；如果你要继续使用高版本，请自行验证兼容性。`
      : '当前面板默认只保证推荐稳定版的兼容性；如果你要尝试其他版本或预览版，请自行验证兼容性。'

    cards.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">NiceClaw</span></div>
        <div class="stat-card-value">${panelVersion}</div>
        <div class="stat-card-meta" id="panel-update-meta" style="display:flex;align-items:center;gap:8px">${panelUpdateHtml}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">OpenClaw · ${sourceLabel}</span></div>
        <div class="stat-card-value">${version.current || '未安装'}</div>
        <div class="stat-card-meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${isInstalled && hasRecommended
            ? (aheadOfRecommended
              ? `<span style="color:var(--warning,#f59e0b)">当前版本高于推荐稳定版: ${version.recommended}</span>
                 <button class="btn btn-primary btn-sm" id="btn-apply-recommended" style="${btnSm}">回退到推荐版</button>`
              : driftFromRecommended
              ? `<span style="color:var(--accent)">推荐稳定版: ${version.recommended}</span>
                 <button class="btn btn-primary btn-sm" id="btn-apply-recommended" style="${btnSm}">切换到推荐版</button>`
              : '<span style="color:var(--success)">已是推荐稳定版</span>')
            : ''}
          ${version.latest_update_available && version.latest ? `<span style="color:var(--text-tertiary)">最新上游: ${version.latest}</span>` : ''}
          <button class="btn btn-${isInstalled ? 'secondary' : 'primary'} btn-sm" id="btn-version-mgmt" style="${btnSm}">
            ${isInstalled ? '切换版本' : '安装 OpenClaw'}
          </button>
          ${isInstalled ? `<button class="btn btn-secondary btn-sm" id="btn-uninstall" style="${btnSm};color:var(--error)">卸载</button>` : ''}
        </div>
        <div style="margin-top:8px;font-size:var(--font-size-xs);color:var(--text-tertiary);line-height:1.6">
          ${policyRiskHint}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">安装路径</span></div>
        <div class="stat-card-value" style="font-size:var(--font-size-sm);word-break:break-all">${install.path || '未知'}</div>
        <div class="stat-card-meta">${install.installed ? '配置文件存在' : '未找到配置文件'}</div>
      </div>
    `

    const applyRecommendedBtn = cards.querySelector('#btn-apply-recommended')
    if (applyRecommendedBtn && version.recommended) {
      applyRecommendedBtn.onclick = () => doInstall(page, aheadOfRecommended ? '回退到推荐稳定版' : '切换到推荐稳定版', version.source, version.recommended)
    }

    // 版本管理 / 安装
    const versionMgmtBtn = cards.querySelector('#btn-version-mgmt')
    if (versionMgmtBtn) {
      versionMgmtBtn.onclick = () => showVersionPicker(page, version)
    }

    // 卸载
    const uninstallBtn = cards.querySelector('#btn-uninstall')
    if (uninstallBtn) {
      uninstallBtn.onclick = async () => {
        const confirmed = await showConfirm('确定要卸载 OpenClaw 吗？\n\n这将停止 Gateway 服务并卸载 npm 全局包。\n配置文件（~/.openclaw/）默认保留，可稍后手动删除。')
        if (!confirmed) return
        const modal = showUpgradeModal('卸载 OpenClaw')
        modal.onClose(() => {
          invalidate('check_installation', 'get_services_status', 'check_node', 'check_git')
          api.invalidatePathCache().catch(() => {})
          loadData(page)
        })
        modal.appendLog('开始卸载 OpenClaw...')
        let unlistenLog, unlistenProgress, unlistenDone, unlistenError
        const cleanup = () => { unlistenLog?.(); unlistenProgress?.(); unlistenDone?.(); unlistenError?.() }
        try {
          if (window.__TAURI_INTERNALS__) {
            const { listen } = await import('@tauri-apps/api/event')
            unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
            unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))
            unlistenDone = await listen('upgrade-done', (e) => {
              cleanup()
              invalidate('check_installation', 'get_services_status', 'check_node', 'check_git')
              api.invalidatePathCache().catch(() => {})
              modal.setDone(typeof e.payload === 'string' ? e.payload : '卸载完成')
            })
            unlistenError = await listen('upgrade-error', (e) => { cleanup(); modal.setError('卸载失败: ' + (e.payload || '未知错误')) })
            await api.uninstallOpenclaw(false)
            modal.appendLog('后台卸载任务已启动...')
          } else {
            const msg = await api.uninstallOpenclaw(false)
            modal.setDone(typeof msg === 'string' ? msg : '卸载完成')
            cleanup()
          }
        } catch (e) {
          cleanup()
          modal.setError('卸载失败: ' + (e?.message || e))
        }
      }
    }
  } catch {
    cards.innerHTML = '<div class="stat-card"><div class="stat-card-label">加载失败</div></div>'
  }
}

/**
 * 版本选择器弹窗 — 选择版本（汉化版/原版）+ 版本号
 */
async function showVersionPicker(page, currentVersion) {
  const isInstalled = !!currentVersion.current
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-title">${isInstalled ? '切换版本' : '安装 OpenClaw'}</div>
      <div style="display:flex;flex-direction:column;gap:16px;margin:16px 0">
        <div>
          <label style="font-size:var(--font-size-sm);color:var(--text-secondary);display:block;margin-bottom:8px">版本</label>
          <div style="display:flex;gap:8px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid var(--border);font-size:var(--font-size-sm);flex:1;justify-content:center;transition:all .15s" id="lbl-official">
              <input type="radio" name="oc-source" value="official" ${currentVersion.source !== 'chinese' ? 'checked' : ''} style="accent-color:var(--primary)">
              原版
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid var(--border);font-size:var(--font-size-sm);flex:1;justify-content:center;transition:all .15s" id="lbl-chinese">
              <input type="radio" name="oc-source" value="chinese" ${currentVersion.source === 'chinese' ? 'checked' : ''} style="accent-color:var(--primary)">
              汉化版
            </label>
          </div>
        </div>
        <div>
          <label style="font-size:var(--font-size-sm);color:var(--text-secondary);display:block;margin-bottom:8px">选择版本号</label>
          <select id="oc-version-select" class="input" style="width:100%;padding:8px 12px;font-size:var(--font-size-sm)">
            <option value="">加载中...</option>
          </select>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);line-height:1.6;padding:10px 12px;border-radius:8px;background:var(--bg-tertiary)">
          默认建议使用当前面板绑定的推荐稳定版。若手动切换到其它版本，尤其是预览版/最新版，请自行验证兼容性；如果你希望面板优先适配最新版功能，欢迎提交 issue。
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;min-height:18px">
          <div id="oc-action-hint" style="font-size:var(--font-size-xs);color:var(--text-tertiary)"></div>
          <div id="nightly-toggle" style="display:none"></div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" data-action="cancel">取消</button>
        <button class="btn btn-primary btn-sm" data-action="confirm" disabled id="oc-confirm-btn">${isInstalled ? '切换' : '安装'}</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const select = overlay.querySelector('#oc-version-select')
  const confirmBtn = overlay.querySelector('#oc-confirm-btn')
  const hintEl = overlay.querySelector('#oc-action-hint')
  const radios = overlay.querySelectorAll('input[name="oc-source"]')
  const lblChinese = overlay.querySelector('#lbl-chinese')
  const lblOfficial = overlay.querySelector('#lbl-official')

  const close = () => overlay.remove()
  overlay.querySelector('[data-action="cancel"]').onclick = close
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })

  let versionsCache = {}
  let currentSelect = currentVersion.source === 'chinese' ? 'chinese' : 'official'

  function updateRadioStyle() {
    const sel = currentSelect
    lblChinese.style.borderColor = sel !== 'official' ? 'var(--primary)' : 'var(--border)'
    lblChinese.style.background = sel !== 'official' ? 'var(--primary-bg, rgba(99,102,241,0.06))' : ''
    lblOfficial.style.borderColor = sel === 'official' ? 'var(--primary)' : 'var(--border)'
    lblOfficial.style.background = sel === 'official' ? 'var(--primary-bg, rgba(99,102,241,0.06))' : ''
  }

  function updateHint() {
    const targetSource = currentSelect
    const targetVer = select.value
    if (!targetVer || targetVer === '') { hintEl.textContent = ''; confirmBtn.disabled = true; return }
    const targetTag = select.selectedIndex === 0 ? '（推荐稳定版）' : '（需自测兼容性）'

    const sameSource = targetSource === (currentVersion.source === 'official' ? 'official' : 'chinese')

    if (!isInstalled) {
      confirmBtn.textContent = '安装'
      hintEl.textContent = `将安装 ${targetSource === 'official' ? '原版' : '汉化版'} ${targetVer}${targetTag}`
      confirmBtn.disabled = false
      return
    }

    if (!sameSource) {
      confirmBtn.textContent = '切换'
      hintEl.innerHTML = `当前: <strong>${currentVersion.source === 'official' ? '原版' : '汉化版'} ${currentVersion.current}</strong> → <strong>${targetSource === 'official' ? '原版' : '汉化版'} ${targetVer}</strong>${targetTag}`
      confirmBtn.disabled = false
      return
    }

    // 同源，比较版本
    const parseVer = v => v.split(/[^0-9]/).filter(Boolean).map(Number)
    const cur = parseVer(currentVersion.current)
    const tgt = parseVer(targetVer)
    let cmp = 0
    for (let i = 0; i < Math.max(cur.length, tgt.length); i++) {
      if ((tgt[i] || 0) > (cur[i] || 0)) { cmp = 1; break }
      if ((tgt[i] || 0) < (cur[i] || 0)) { cmp = -1; break }
    }

    if (cmp === 0) {
      confirmBtn.textContent = '重新安装'
      hintEl.textContent = `当前已是 ${targetVer}${targetTag}`
      confirmBtn.disabled = false
    } else if (cmp > 0) {
      confirmBtn.textContent = '升级'
      hintEl.innerHTML = `<span style="color:var(--accent)">${currentVersion.current} → ${targetVer}${targetTag}</span>`
      confirmBtn.disabled = false
    } else {
      confirmBtn.textContent = '降级'
      hintEl.innerHTML = `<span style="color:var(--warning,#f59e0b)">${currentVersion.current} → ${targetVer}${targetTag}</span>`
      confirmBtn.disabled = false
    }
  }

  let showNightly = false

  async function loadVersions(source) {
    select.innerHTML = '<option value="">加载中...</option>'
    confirmBtn.disabled = true
    hintEl.textContent = ''
    try {
      if (!versionsCache[source]) {
        versionsCache[source] = await api.listOpenclawVersions(source)
      }
      const allVersions = versionsCache[source]
      if (!allVersions.length) {
        select.innerHTML = '<option value="">未找到可用版本</option>'
        return
      }
      const stable = allVersions.filter(v => !v.includes('nightly') && !v.includes('canary') && !v.includes('alpha') && !v.includes('beta') && !v.includes('rc') && !v.includes('dev') && !v.includes('next'))
      const versions = showNightly ? allVersions : (stable.length > 0 ? stable : allVersions)
      const nightlyCount = allVersions.length - stable.length
      select.innerHTML = versions.map((v, idx) => {
        const isCurrent = isInstalled && v === currentVersion.current && source === (currentVersion.source === 'official' ? 'official' : 'chinese')
        return `<option value="${v}">${v}${idx === 0 ? ' (推荐)' : ''}${isCurrent ? ' (当前)' : ''}</option>`
      }).join('')
      // nightly 切换提示
      const toggleEl = overlay.querySelector('#nightly-toggle')
      if (toggleEl) {
        if (nightlyCount > 0) {
          toggleEl.style.display = ''
          toggleEl.innerHTML = showNightly
            ? `<a href="#" id="btn-toggle-nightly" style="color:var(--primary);text-decoration:none;font-size:var(--font-size-xs)">隐藏预览版 (${nightlyCount})</a>`
            : `<a href="#" id="btn-toggle-nightly" style="color:var(--text-tertiary);text-decoration:none;font-size:var(--font-size-xs)">显示预览版 (${nightlyCount})</a>`
          toggleEl.querySelector('#btn-toggle-nightly').onclick = (e) => { e.preventDefault(); showNightly = !showNightly; loadVersions(source) }
        } else {
          toggleEl.style.display = 'none'
        }
      }
      updateHint()
    } catch (e) {
      select.innerHTML = `<option value="">加载失败: ${e.message || e}</option>`
    }
  }

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      currentSelect = radio.value
      updateRadioStyle()
      loadVersions(currentSelect)
    })
  })

  select.addEventListener('change', updateHint)

  confirmBtn.onclick = () => {
    const source = currentSelect
    const ver = select.value
    const action = confirmBtn.textContent
    close()
    doInstall(page, `${action} OpenClaw`, source, ver)
  }

  updateRadioStyle()
  loadVersions(currentSelect)
}

/**
 * 执行安装/升级/降级/切换操作（带进度弹窗）
 */
async function doInstall(page, title, source, version) {
  const modal = showUpgradeModal(title)
  modal.onClose(() => {
    invalidate('check_installation', 'get_services_status', 'check_node', 'check_git')
    api.invalidatePathCache().catch(() => {})
    loadData(page)
  })
  let unlistenLog, unlistenProgress, unlistenDone, unlistenError
  setUpgrading(true)

  const cleanup = () => {
    setUpgrading(false)
    unlistenLog?.(); unlistenProgress?.(); unlistenDone?.(); unlistenError?.()
  }

  try {
    if (window.__TAURI_INTERNALS__) {
      const { listen } = await import('@tauri-apps/api/event')
      unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
      unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))

      unlistenDone = await listen('upgrade-done', (e) => {
        cleanup()
        invalidate('check_installation', 'get_services_status', 'check_node', 'check_git')
        api.invalidatePathCache().catch(() => {})
        modal.setDone(typeof e.payload === 'string' ? e.payload : '操作完成')
      })

      unlistenError = await listen('upgrade-error', async (e) => {
        cleanup()
        const errStr = String(e.payload || '未知错误')
        modal.appendLog(errStr)
        const { diagnoseInstallError } = await import('../lib/error-diagnosis.js')
        const fullLog = modal.getLogText() + '\n' + errStr
        const diagnosis = diagnoseInstallError(fullLog)
        modal.setError(diagnosis.title)
        if (diagnosis.hint) modal.appendLog('')
        if (diagnosis.hint) modal.appendHtmlLog(`${statusIcon('info', 14)} ${diagnosis.hint}`)
        if (diagnosis.command) modal.appendHtmlLog(`${icon('clipboard', 14)} ${diagnosis.command}`)
        if (window.__openAIDrawerWithError) {
          window.__openAIDrawerWithError({ title: diagnosis.title, error: fullLog, scene: title, hint: diagnosis.hint })
        }
      })

      await api.upgradeOpenclaw(source, version)
      modal.appendLog('后台任务已启动，请等待完成...')
    } else {
      modal.appendLog('Web 模式：安装过程日志不可用，请等待完成...')
      const msg = await api.upgradeOpenclaw(source, version)
      modal.setDone(typeof msg === 'string' ? msg : (msg?.message || '操作完成'))
      cleanup()
    }
  } catch (e) {
    cleanup()
    const errStr = String(e)
    modal.appendLog(errStr)
    const { diagnoseInstallError } = await import('../lib/error-diagnosis.js')
    const fullLog = modal.getLogText() + '\n' + errStr
    const diagnosis = diagnoseInstallError(fullLog)
    modal.setError(diagnosis.title)
  }
}

async function checkHotUpdate(cards, panelVersion) {
  const el = () => cards.querySelector('#panel-update-meta')
  try {
    const info = await api.checkFrontendUpdate()
    const meta = el()
    if (!meta) return

    if (info.updateReady) {
      // 已下载更新，等待重载
      const ver = info.manifest?.version || info.latestVersion || ''
      meta.innerHTML = `
        <span style="color:var(--accent)">v${ver} 已就绪</span>
        <button class="btn btn-primary btn-sm" id="btn-hot-reload" style="padding:2px 8px;font-size:var(--font-size-xs)">重载应用</button>
        <button class="btn btn-secondary btn-sm" id="btn-hot-rollback" style="padding:2px 8px;font-size:var(--font-size-xs)">回退</button>
      `
      meta.querySelector('#btn-hot-reload')?.addEventListener('click', () => {
        window.location.reload()
      })
      meta.querySelector('#btn-hot-rollback')?.addEventListener('click', async () => {
        try {
          await api.rollbackFrontendUpdate()
          toast('已回退到内嵌版本，重载中...', 'success')
          setTimeout(() => window.location.reload(), 800)
        } catch (e) {
          toast('回退失败: ' + (e.message || e), 'error')
        }
      })
    } else if (info.hasUpdate) {
      // 有新版本可下载
      const ver = info.latestVersion
      const manifest = info.manifest || {}
      const changelog = manifest.changelog || ''
      meta.innerHTML = `
        <span style="color:var(--accent)">新版本: v${ver}</span>
        ${changelog ? `<span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">${changelog}</span>` : ''}
        <button class="btn btn-primary btn-sm" id="btn-hot-download" style="padding:2px 8px;font-size:var(--font-size-xs)">热更新</button>
      `
      meta.querySelector('#btn-hot-download')?.addEventListener('click', async () => {
        const btn = meta.querySelector('#btn-hot-download')
        if (btn) { btn.disabled = true; btn.textContent = '下载中...' }
        try {
          await api.downloadFrontendUpdate(manifest.url, manifest.hash || '')
          toast('更新下载完成，点击「重载应用」生效', 'success')
          checkHotUpdate(cards, panelVersion)
        } catch (e) {
          toast('下载失败: ' + (e.message || e), 'error')
          if (btn) { btn.disabled = false; btn.textContent = '重试' }
        }
      })
    } else if (!info.compatible) {
      meta.innerHTML = '<span style="color:var(--text-tertiary)">需要更新完整安装包</span>'
    } else {
      meta.innerHTML = '<span style="color:var(--success)">已是最新</span>'
    }
  } catch (err) {
    const meta = el()
    if (!meta) return
    meta.innerHTML = `<span style="color:var(--text-tertiary)">暂无法检查更新</span>`
  }
}

