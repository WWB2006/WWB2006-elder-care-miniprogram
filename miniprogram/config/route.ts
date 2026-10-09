/**
 * 路由表与统一的跳转方法。
 * 为什么集中管理：分包路径散落在各页面时，重构（改目录 / 换分包）成本极高，
 * 且容易出现 navigateTo 跳 tabBar 页导致失败的经典 bug。
 */
import { FEATURE_FLAG } from './constant'
import { logger } from '../utils/logger'

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

/**
 * 跳转 tab 页的公共入口。
 *
 * 为什么单独抽出来：wx.switchTab 的 url 不支持 query（官方限制），拼接的参数会被
 * 静默忽略。早期实现是「拼上 query 再 split('?')[0] 丢掉」，问题是调用方看不出
 * 参数已失效，排查成本高。
 *
 * 现行约定（与 handleCategoryTap 一致）：**tab 页之间的参数一律走 appStore 等全局状态**，
 * router 层不接收也不猜测 query。因此这里在开发期主动拦截并报错，把「静默失效」
 * 变成「立刻暴露」，避免以后有人误传参数却查不出原因。
 */
function switchToTab(path: string, query?: Record<string, string | number | undefined>): void {
  const normalized = query
    ? Object.keys(query).filter((k) => query[k] !== undefined && query[k] !== '')
    : []
  if (normalized.length) {
    // 不静默丢弃：明确提示调用方改用全局状态，开发阶段即可发现
    logger.warn('router.switchTab', {
      message: 'switchTab 不支持 query，参数已忽略，请改用 appStore 传递',
      path,
      keys: normalized,
    })
  }
  wx.switchTab({ url: path })
}

export const router = {
  /** 普通跳转；若目标是 tab 页会自动改用 switchTab（navigateTo 跳 tab 页会失败） */
  push(key: RouteKey, query?: Record<string, string | number | undefined>): void {
    const path = ROUTES[key]
    if (TAB_ROUTES.includes(path)) {
      switchToTab(path, query)
      return
    }
    if (getCurrentPages().length >= MAX_PAGE_STACK) {
      wx.redirectTo({ url: buildUrl(path, query) })
      return
    }
    wx.navigateTo({ url: buildUrl(path, query) })
  },

  /** 回到 tab 页（首页 / 服务 / 订单 / 我的）；非 tab 页用 reLaunch（url 上的 query 有效） */
  switchTo(key: RouteKey, query?: Record<string, string | number | undefined>): void {
    const path = ROUTES[key]
    if (TAB_ROUTES.includes(path)) {
      switchToTab(path, query)
      return
    }
    wx.reLaunch({ url: buildUrl(path, query) })
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
 *
 * 为什么不再返回 query：目标页（首页）的角色来自 userStore.getState().role，
 * 并不读 query；而 home 是 tab 页、switchTab 也不接受 query。
 * 早期返回 { role } 属于死参数，已移除以避免误导。
 */
export function resolveHomeByRole(role: Role): { key: RouteKey } {
  switch (role) {
    case 'staff':
      return { key: 'taskPool' }
    case 'admin':
      return { key: FEATURE_FLAG.adminInMiniProgram ? 'dashboard' : 'home' }
    case 'elder':
    case 'family':
      return { key: 'home' }
    default:
      return { key: 'home' }
  }
}
