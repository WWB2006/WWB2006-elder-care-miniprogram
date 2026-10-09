/**
 * 路由表与统一的跳转方法。
 * 为什么集中管理：分包路径散落在各页面时，重构（改目录 / 换分包）成本极高，
 * 且容易出现 navigateTo 跳 tabBar 页导致失败的经典 bug。
 */
import { FEATURE_FLAG } from './constant'

export const ROUTES = {
  launch: '/pages/launch/index',
  login: '/pages/login/index',
  home: '/pages/home/index',
  service: '/pages/service/index',
  order: '/pages/order/index',
  orderDetail: '/pages/order-detail/index',
  mine: '/pages/mine/index',
  webview: '/pages/webview/index',

  sos: '/packageElder/pages/sos/index',
  health: '/packageElder/pages/health/index',
  medication: '/packageElder/pages/medication/index',
  voiceAssistant: '/packageElder/pages/voice-assistant/index',
  contacts: '/packageElder/pages/contacts/index',

  elderDetail: '/packageFamily/pages/elder-detail/index',
  booking: '/packageFamily/pages/booking/index',
  pay: '/packageFamily/pages/pay/index',
  report: '/packageFamily/pages/report/index',
  live: '/packageFamily/pages/live/index',
  evaluate: '/packageFamily/pages/evaluate/index',

  taskPool: '/packageStaff/pages/task-pool/index',
  taskDetail: '/packageStaff/pages/task-detail/index',
  checkin: '/packageStaff/pages/checkin/index',
  serviceLog: '/packageStaff/pages/service-log/index',
  schedule: '/packageStaff/pages/schedule/index',

  dashboard: '/packageAdmin/pages/dashboard/index',
  elderManage: '/packageAdmin/pages/elder-manage/index',
  dispatch: '/packageAdmin/pages/dispatch/index',
  audit: '/packageAdmin/pages/audit/index',
} as const

export type RouteKey = keyof typeof ROUTES

/** tabBar 页面必须用 switchTab，普通页面用 navigateTo */
const TAB_ROUTES: string[] = [ROUTES.home, ROUTES.service, ROUTES.order, ROUTES.mine]

/** 小程序页面栈上限为 10，超过后用 redirectTo 替换当前页，避免跳转静默失败 */
const MAX_PAGE_STACK = 10

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  if (!query) return path
  const pairs = Object.keys(query)
    .filter((k) => query[k] !== undefined && query[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(query[k]))}`)
  return pairs.length ? `${path}?${pairs.join('&')}` : path
}

export const router = {
  /** 普通跳转；若目标是 tab 页会自动改用 switchTab（navigateTo 跳 tab 页会失败） */
  push(key: RouteKey, query?: Record<string, string | number | undefined>): void {
    const path = ROUTES[key]
    if (TAB_ROUTES.includes(path)) {
      wx.switchTab({ url: buildUrl(path, query).split('?')[0] })
      return
    }
    if (getCurrentPages().length >= MAX_PAGE_STACK) {
      wx.redirectTo({ url: buildUrl(path, query) })
      return
    }
    wx.navigateTo({ url: buildUrl(path, query) })
  },

  /** 回到 tab 页（首页 / 服务 / 订单 / 我的） */
  switchTo(key: RouteKey, query?: Record<string, string | number | undefined>): void {
    const url = buildUrl(ROUTES[key], query)
    if (TAB_ROUTES.includes(ROUTES[key])) wx.switchTab({ url: url.split('?')[0] })
    else wx.reLaunch({ url })
  },

  redirect(key: RouteKey, query?: Record<string, string | number | undefined>): void {
    wx.redirectTo({ url: buildUrl(ROUTES[key], query) })
  },

  back(delta = 1): void {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack({ delta })
    else wx.switchTab({ url: ROUTES.home })
  },
}

/**
 * 角色分流：登录完成后决定落到哪个首页。
 * 管理端默认不在小程序内承载（信息密度与表格操作更适合 Web 后台），
 * 由 FEATURE_FLAG.adminInMiniProgram 控制；关闭时管理员回落到首页，避免跳到一个不可用的分包。
 */
export function resolveHomeByRole(role: Role): { key: RouteKey; query?: Record<string, string> } {
  switch (role) {
    case 'staff':
      return { key: 'taskPool' }
    case 'admin':
      return FEATURE_FLAG.adminInMiniProgram
        ? { key: 'dashboard' }
        : { key: 'home', query: { role } }
    case 'elder':
    case 'family':
      return { key: 'home', query: { role } }
    default:
      return { key: 'home' }
  }
}
