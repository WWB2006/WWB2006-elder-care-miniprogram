/**
 * 登录页。
 * 设计要点（见 docs/设计方案.md 6.5 / 9.2）：
 * 1. 手机号必须由用户主动点击按钮获取（open-type=getPhoneNumber），禁止静默获取；
 * 2. 隐私协议必须显式勾选，且**不得默认勾选**——这是合规红线；
 * 3. 登录成功后按角色分流：老人/家属回首页，员工进任务池；带 redirect 参数时优先跳该页；
 * 4. 登录失败不弹全局 toast，页面内给出可执行的下一步（重试 / 找客服）。
 */
import { phoneLogin, silentLogin } from '../../utils/auth'
import { ROUTES, resolveHomeByRole, router, type RouteKey } from '../../config/route'
import { APP_INFO } from '../../config/constant'
import { logger } from '../../utils/logger'
import { elderModeBehavior } from '../../behaviors/elder-mode'

interface ILoginQuery {
  /** 业务拦截跳转过来时携带的目标路由 key，如 home / taskPool */
  redirect?: string
}

Page({
  behaviors: [elderModeBehavior],

  data: {
    appName: APP_INFO.name,
    slogan: '让每一位老人，都被好好照顾',
    agreed: false,
    loading: false,
    errorText: '',
    /** 静默登录是否已完成（用于决定是否直接放行） */
    silentReady: false,
  },

  query: {} as ILoginQuery,

  onLoad(query: ILoginQuery) {
    this.query = query ?? {}
    void this.bootstrap()
  },

  /**
   * 静默登录：先拿到 openid 与初始角色，减少用户操作。
   * 失败不报错——用户可以继续走手机号授权这条主路径。
   */
  async bootstrap() {
    try {
      const result = await silentLogin()
      this.setData({ silentReady: true })
      // 老用户（后端已识别角色）直接放行，避免每次都要点一次手机号授权
      if (result.role !== 'guest') this.redirectAfterLogin(result.role)
    } catch (err) {
      logger.warn('silent_login_failed', { err: String(err) })
      this.setData({ silentReady: false })
    }
  },

  handleAgreementChange(event: WechatMiniprogram.CheckboxGroupChange) {
    const values = event.detail.value
    this.setData({ agreed: values.includes('agree'), errorText: '' })
  },

  handleOpenAgreement() {
    router.push('webview', { url: '/pages/agreement/index', title: '用户协议与隐私政策' })
  },

  /** 手机号授权回调：e.detail.code 由微信下发，后端换取真实手机号 */
  async handleGetPhoneNumber(event: WechatMiniprogram.ButtonGetPhoneNumber) {
    if (this.data.loading) return
    if (!this.data.agreed) {
      this.setData({ errorText: '请先阅读并勾选《用户协议与隐私政策》' })
      return
    }
    const code = event.detail?.code
    if (!code) {
      // 用户点了「拒绝」或授权失败，给出可执行的下一步，而不是抛错误码
      this.setData({ errorText: '未获得手机号授权，可稍后重试或联系客服协助登录' })
      return
    }

    this.setData({ loading: true, errorText: '' })
    try {
      const result = await phoneLogin(code)
      logger.event('login_phone_success', { role: result.role })
      this.redirectAfterLogin(result.role)
    } catch (err) {
      logger.error('phone_login_failed', { err: String(err) })
      this.setData({ errorText: '登录失败，请检查网络后重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleHotline() {
    wx.makePhoneCall({ phoneNumber: APP_INFO.serviceHotline })
  },

  /** 优先按业务指定目标跳转，其次按角色分流 */
  redirectAfterLogin(role: Role) {
    const key = this.query.redirect as RouteKey | undefined
    if (key && key in ROUTES) {
      router.switchTo(key)
      return
    }
    const target = resolveHomeByRole(role)
    router.switchTo(target.key)
  },
})
