/**
 * 启动页（唯一入口）。
 * 职责：恢复会话 -> 角色分流 -> 进入对应首页。
 * 设计要点：
 * 1. 游客不强制登录，直接进服务大厅，降低首次使用门槛；
 * 2. 冷启动等待时间上限 1.5s，超时也放行，避免网络慢时卡在启动页；
 * 3. 分流逻辑集中在 config/route.ts，页面不硬编码路径。
 */
import { resolveHomeByRole, router } from '../../config/route'
import { userStore } from '../../store/user'
import { appStore } from '../../store/app'
import { logger } from '../../utils/logger'

const MAX_WAIT_MS = 1500

Page({
  data: {
    appName: '安心养老',
    slogan: '让每一位老人，都被好好照顾',
  },

  async onLoad() {
    const start = Date.now()
    const role = await this.waitForSession()
    const cost = Date.now() - start
    logger.event('launch_route', { role, cost })
    this.redirect(role)
  },

  /** 等待 app.ts 的 restoreSession 完成，最多等 MAX_WAIT_MS */
  async waitForSession(): Promise<Role> {
    const deadline = Date.now() + MAX_WAIT_MS
    while (Date.now() < deadline) {
      const role = userStore.getState().role
      if (role !== 'guest') return role
      const app = getApp<IElderAppOption>()
      if (app?.globalData.role && app.globalData.role !== 'guest') return app.globalData.role
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return 'guest'
  },

  redirect(role: Role) {
    appStore.markColdStartReady()
    const target = resolveHomeByRole(role)
    // 老人 / 家属 / 游客：进入 tab 首页（switchTab）；员工：进入任务池（reLaunch）
    router.switchTo(target.key, target.query)
  },
})
