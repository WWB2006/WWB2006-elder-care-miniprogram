/**
 * 小程序入口。
 * 设计原则：入口保持轻量，重逻辑下放到 utils / store。
 * 职责：
 * 1. 初始化环境配置、日志与埋点；
 * 2. 恢复登录态（token / 角色）；失败不阻塞启动（游客可浏览服务大厅）；
 * 3. 全局异常与弱网监听，避免白屏；
 * 4. 检查小程序更新并静默下载，下次冷启动生效。
 */
import { initEnv, env } from './utils/env'
import { restoreSession } from './utils/auth'
import { flush, logger } from './utils/logger'
import { appStore } from './store/app'
import { StorageKey, getStorage } from './utils/storage'

initEnv()

App<IElderAppOption>({
  globalData: {
    /** 当前角色，启动时为 guest，登录后刷新 */
    role: 'guest',
    /** 适老模式：放大字号、简化文案（用户可在「我的-关怀设置」切换） */
    elderMode: false,
    /** 系统字号设置（px），用于首帧兜底判断 */
    systemFontSizeSetting: 16,
    /** 底部安全区内边距，配合自定义 tabBar 使用 */
    safeAreaBottom: 0,
    /** 冷启动时间戳，用于启动耗时埋点 */
    launchAt: Date.now(),
  },

  onLaunch(options: IAppLaunchOption) {
    this.initSystemInfo()
    this.restoreLoginState()
    this.setupErrorHandler()
    this.checkUpdate()
    logger.event('app_launch', {
      scene: options.scene,
      path: options.path,
      query: options.query,
      env: env.name,
    })
  },

  onShow(options: IAppLaunchOption) {
    logger.event('app_show', { scene: options.scene, path: options.path })
    appStore.markColdStartReady()
  },

  onHide() {
    logger.event('app_hide')
    // 用户切后台或直接杀进程时，把内存里的埋点队列落盘上报，避免丢数据
    flush()
  },

  onError(error: string) {
    logger.error('app_on_error', { error })
  },

  onUnhandledRejection(res: IUnhandledRejection) {
    logger.error('unhandled_rejection', { reason: String(res.reason) })
  },

  onPageNotFound(res: IPageNotFoundOption) {
    // 兜底：分包未下载 / 路径错误时回首页，而不是停在白屏
    logger.error('page_not_found', { path: res.path, query: res.query })
    wx.switchTab({ url: '/pages/home/index' })
  },

  /**
   * 读取系统信息，决定首帧字号与底部安全区。
   * 兼容性：wx.getSystemInfoSync 自基础库 2.20.1 起被拆分且官方建议不再使用，
   * 这里优先用 getWindowInfo / getAppBaseInfo，低版本基础库回落到旧 API；
   * 整段包 try/catch，任何异常都不能阻断 onLaunch（否则会白屏）。
   */
  initSystemInfo() {
    let fontSize = 16
    let safeAreaBottom = 0
    try {
      const canUseSplit =
        typeof wx.getWindowInfo === 'function' && typeof wx.getAppBaseInfo === 'function'
      if (canUseSplit) {
        const windowInfo = wx.getWindowInfo()
        const appBaseInfo = wx.getAppBaseInfo()
        fontSize = Number(appBaseInfo.fontSizeSetting) || 16
        const safeArea = windowInfo.safeArea
        safeAreaBottom = safeArea ? windowInfo.screenHeight - safeArea.bottom : 0
      } else {
        const legacy = wx.getSystemInfoSync()
        fontSize = Number(legacy.fontSizeSetting) || 16
        const safeArea = legacy.safeArea
        safeAreaBottom = safeArea ? legacy.screenHeight - safeArea.bottom : 0
      }
    } catch (err) {
      logger.warn('init_system_info_failed', { err: String(err) })
    }

    this.globalData.systemFontSizeSetting = fontSize
    this.globalData.safeAreaBottom = Math.max(0, safeAreaBottom)
    // 用户在「我的-关怀设置」里显式选择过，则以用户选择为准；否则按系统字号（>=22px）自动进入适老模式
    const saved = getStorage<boolean | null>(StorageKey.elderMode, null)
    this.globalData.elderMode = saved ?? fontSize >= 22
    this.syncElderMode(this.globalData.elderMode)
  },

  /** 适老模式同时写 globalData 与 store：store 才是驱动视图 class 的数据源 */
  syncElderMode(enabled: boolean) {
    this.globalData.elderMode = enabled
    appStore.setElderMode(enabled)
    appStore.setSafeAreaBottom(this.globalData.safeAreaBottom)
  },

  /** 恢复本地登录态：token 有效则刷新用户资料，否则保持游客态 */
  async restoreLoginState() {
    try {
      const role = await restoreSession()
      this.globalData.role = role ?? 'guest'
    } catch (err) {
      // 启动阶段任何异常都不能外抛，否则 launch 页会一直等不到角色
      logger.warn('restore_session_failed', { err: String(err) })
      this.globalData.role = 'guest'
    }
  },

  /** 全局异常兜底与弱网感知 */
  setupErrorHandler() {
    wx.onMemoryWarning((res) => {
      logger.error('memory_warning', { level: res.level })
    })
    wx.onNetworkStatusChange((res) => {
      logger.event('network_change', { isConnected: res.isConnected, type: res.networkType })
      appStore.setNetwork({ isConnected: res.isConnected, networkType: res.networkType })
    })
  },

  /** 检查更新：下载完成后提示重启，避免老人端长期停留在旧版本 */
  checkUpdate() {
    const manager = wx.getUpdateManager()
    manager.onUpdateReady(() => {
      wx.showModal({
        title: '发现新版本',
        content: '新版本已准备好，是否立即重启应用？',
        confirmText: '立即重启',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) manager.applyUpdate()
        },
      })
    })
    manager.onUpdateFailed(() => {
      logger.error('update_failed')
    })
  },
})
