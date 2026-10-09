/**
 * 我的。
 * 合规要求（见 docs/设计方案.md 9.2 / 9.4）：本页必须提供
 *   - 隐私授权撤回入口；
 *   - 账号注销入口；
 *   - 用户协议与隐私政策查看入口。
 * 另外承载「关怀模式」开关，这是适老化的唯一用户侧入口。
 */
import { logout } from '../../utils/auth'
import { APP_INFO } from '../../config/constant'
import { ROUTES, type RouteKey, router } from '../../config/route'
import { logger } from '../../utils/logger'
import { syncTabBar } from '../../utils/tabbar'
import { PrivacyScope, revokePrivacy } from '../../utils/privacy'
import { userStore } from '../../store/user'
import { elderModeBehavior } from '../../behaviors/elder-mode'

interface IMenuItem {
  key: string
  label: string
  /** 目标路由 key；为空表示由页面自行处理 */
  route?: RouteKey
  /** 是否必须登录 */
  needLogin: boolean
  /** 老人端隐藏的次要入口 */
  hideInElderMode?: boolean
}

const TAB_INDEX = 3

const MENUS: IMenuItem[] = [
  { key: 'health', label: '健康档案', route: 'health', needLogin: true },
  { key: 'medication', label: '用药提醒', route: 'medication', needLogin: true },
  { key: 'elder', label: '长辈管理', route: 'elderDetail', needLogin: true },
  { key: 'contacts', label: '亲情号码', route: 'contacts', needLogin: true },
  { key: 'schedule', label: '我的排班', route: 'schedule', needLogin: true, hideInElderMode: true },
  { key: 'order', label: '我的订单', route: 'order', needLogin: true },
]

Page({
  behaviors: [elderModeBehavior],

  data: {
    menus: MENUS,
    role: 'guest' as Role,
    nickname: '',
    phoneMasked: '',
    roleLabel: '',
    hotline: APP_INFO.serviceHotline,
    appVersion: APP_INFO.version,
  },

  onShow() {
    syncTabBar(this, TAB_INDEX)
    this.refreshProfile()
  },

  refreshProfile() {
    const state = userStore.getState()
    this.setData({
      role: state.role,
      nickname: state.profile?.nickname || '微信用户',
      phoneMasked: state.profile?.phoneMasked || '',
      roleLabel: this.roleLabel(state.role),
    })
  },

  roleLabel(role: Role): string {
    const map: Record<Role, string> = {
      guest: '未登录',
      elder: '长辈用户',
      family: '家属用户',
      staff: '服务人员',
      admin: '机构管理员',
    }
    return map[role] ?? '未登录'
  },

  handleLogin() {
    router.push('login', { redirect: 'mine' })
  },

  handleMenuTap(event: WechatMiniprogram.TouchEvent) {
    const { key, route, needlogin } = event.currentTarget.dataset as {
      key: string
      route?: RouteKey
      needlogin: boolean
    }
    if (needlogin && this.data.role === 'guest') {
      this.handleLogin()
      return
    }
    if (route && route in ROUTES) {
      router.push(route)
      return
    }
    logger.warn('mine_menu_unhandled', { key })
  },

  handleHotline() {
    wx.makePhoneCall({ phoneNumber: APP_INFO.serviceHotline })
  },

  handleAgreement() {
    router.push('webview', { url: 'https://example.com/agreement', title: '用户协议' })
  },

  handlePrivacy() {
    router.push('webview', { url: 'https://example.com/privacy', title: '隐私政策' })
  },

  /** 撤回敏感信息授权：合规要求必须可撤回，撤回后相关功能需重新申请 */
  async handleRevokePrivacy() {
    const res = await wx.showModal({
      title: '撤回隐私授权',
      content:
        '撤回后，定位打卡、健康档案等需要敏感信息的功能将无法使用，可随时重新授权。是否继续？',
      confirmText: '确认撤回',
      cancelText: '取消',
    })
    if (!res.confirm) return

    const scopes: PrivacyScope[] = ['health', 'location', 'album', 'camera', 'phone']
    scopes.forEach((scope) => revokePrivacy(scope))
    logger.event('privacy_revoked', { scopes })
    wx.showToast({ title: '已撤回授权', icon: 'none' })
  },

  /** 账号注销：涉及数据删除与保留范围，必须明示后再走二次确认 */
  async handleDeleteAccount() {
    const res = await wx.showModal({
      title: '注销账号',
      content:
        '注销后账号立即停用，个人信息将在 15 个工作日内删除或匿名化；订单与服务记录因财务与纠纷取证需要会脱敏保留。是否继续？',
      confirmText: '继续注销',
      cancelText: '暂不注销',
    })
    if (!res.confirm) return

    const second = await wx.showModal({
      title: '再次确认',
      content: '注销后无法恢复，请确认是否继续。',
      confirmText: '确认注销',
      cancelText: '取消',
    })
    if (!second.confirm) return

    logger.event('account_delete_request')
    // 注销接口未在 MVP 接口清单中，此处先提示走人工渠道，避免给出"已注销"的假反馈
    wx.showModal({
      title: '已提交申请',
      content: `请拨打客服热线 ${APP_INFO.serviceHotline} 完成身份核验，我们将在核验后为您注销。`,
      showCancel: false,
      confirmText: '知道了',
    })
  },

  async handleLogout() {
    const res = await wx.showModal({
      title: '退出登录',
      content: '退出后需要重新授权手机号才能下单，确定退出吗？',
      confirmText: '退出登录',
      cancelText: '取消',
    })
    if (!res.confirm) return
    logout()
    this.refreshProfile()
    wx.showToast({ title: '已退出登录', icon: 'none' })
  },
})
