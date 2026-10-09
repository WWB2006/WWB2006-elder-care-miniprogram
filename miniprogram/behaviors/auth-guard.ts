/**
 * 登录守卫 Behavior。
 *
 * 与 utils/auth.ts 的 ensureLogin 的分工：
 * - ensureLogin：**操作级**守卫，用户点了「下单」才拦，体验更顺（游客可以先浏览）；
 * - 本 Behavior：**页面级**守卫，用于整页都必须登录的场景（如「我的」「任务池」）。
 *
 * 注意：前端守卫只是体验优化，真正的权限判断必须由后端兜底。
 */
import { currentRole } from '../utils/auth'
import { logger } from '../utils/logger'

export interface IAuthGuardOptions {
  /** 允许访问的角色白名单，为空表示「登录即可」 */
  roles?: Role[]
}

const redirectingMap = new WeakMap<object, boolean>()

export const authGuardBehavior = Behavior({
  methods: {
    /**
     * 在 onLoad 中调用；返回 true 表示已放行，false 表示已被重定向。
     * 使用 redirectTo 而非 navigateTo：避免用户返回时又落回受限页，形成死循环。
     */
    guardAuth(options: IAuthGuardOptions = {}): boolean {
      const role = currentRole()
      const loggedIn = role !== 'guest'
      const roleAllowed = !options.roles?.length || options.roles.includes(role)

      if (loggedIn && roleAllowed) return true
      if (redirectingMap.get(this)) return false
      redirectingMap.set(this, true)

      logger.event('auth_guard_redirect', { role, needLogin: !loggedIn })
      wx.redirectTo({ url: '/pages/login/index' })
      return false
    },
  },
})

export {}
