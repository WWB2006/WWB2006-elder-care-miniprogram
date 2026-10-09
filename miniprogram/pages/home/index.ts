/**
 * 首页（角色自适应）。
 * 同一页面按角色渲染不同首屏内容，避免维护三套首页：
 *   老人：紧急呼叫 + 今日照护提醒 + 大字快捷入口；
 *   家属：老人状态卡 + 快速下单 + 进行中订单；
 *   员工：今日任务概览（主入口在任务池，首页只做概览）；
 *   游客：服务分类 + 推荐服务 + 立即登录引导。
 */
import { getOrderList } from '../../api/order'
import { getServiceList } from '../../api/service'
import type { IOrderBrief, IServiceItem } from '../../api/types'
import { ServiceCategory } from '../../api/types'
import { APP_INFO, SERVICE_CATEGORY_DICT, ORDER_STATUS_DICT } from '../../config/constant'
import { router } from '../../config/route'
import { appStore } from '../../store/app'
import { connectStore } from '../../store/base'
import { userStore } from '../../store/user'
import { formatDate, formatMoney } from '../../utils/format'
import { logger } from '../../utils/logger'
import { syncTabBar } from '../../utils/tabbar'

interface IHomeOrder extends IOrderBrief {
  appointmentText: string
  amountText: string
  statusLabel: string
  statusColor: string
}

interface IHomeService extends IServiceItem {
  priceText: string
}

const TAB_INDEX = 0
const MAX_SHOW_ORDER = 3

Page({
  data: {
    role: 'guest' as Role,
    elderMode: false,
    elderName: '',
    networkHint: '',
    loading: true,
    loadFailed: false,
    categories: [] as Array<{ key: ServiceCategory; label: string; icon: string; tip: string }>,
    services: [] as IHomeService[],
    orders: [] as IHomeOrder[],
    hotline: APP_INFO.serviceHotline,
  },

  unbindStore: undefined as (() => void) | undefined,

  onLoad() {
    // 首页只需要极少量全局状态，按需订阅避免无关刷新
    this.unbindStore = connectStore(this, appStore, (state) => ({
      elderMode: state.elderMode,
      networkHint: state.networkConnected ? '' : '当前网络不可用，已为您展示缓存内容',
    }))
    this.setData({ categories: this.buildCategories() })
  },

  onShow() {
    syncTabBar(this, TAB_INDEX)
    this.setData({ role: userStore.getState().role })
    void this.loadHome()
  },

  onUnload() {
    this.unbindStore?.()
  },

  async onPullDownRefresh() {
    await this.loadHome()
    wx.stopPullDownRefresh()
  },

  buildCategories() {
    return Object.values(ServiceCategory).map((key) => ({
      key,
      label: SERVICE_CATEGORY_DICT[key].label,
      icon: SERVICE_CATEGORY_DICT[key].icon,
      tip: SERVICE_CATEGORY_DICT[key].tip,
    }))
  },

  /** 首屏数据：服务推荐 + 最近订单。任一失败都降级展示，不影响另一块 */
  async loadHome() {
    this.setData({ loading: true, loadFailed: false })
    const [services, orders] = await Promise.allSettled([
      getServiceList({ pageNum: 1, pageSize: 6 }),
      getOrderList({ pageNum: 1, pageSize: MAX_SHOW_ORDER, status: 'ALL' }),
    ])

    if (services.status === 'fulfilled') {
      this.setData({ services: services.value.list.map((item) => this.decorateService(item)) })
    } else {
      logger.error('home_service_load_failed', { err: String(services.reason) })
    }

    if (orders.status === 'fulfilled') {
      this.setData({ orders: orders.value.list.map((item) => this.decorateOrder(item)) })
    } else {
      logger.warn('home_order_load_failed', { err: String(orders.reason) })
    }

    this.setData({
      loading: false,
      loadFailed:
        services.status === 'rejected' && orders.status === 'rejected',
    })
  },

  decorateService(item: IServiceItem): IHomeService {
    return { ...item, priceText: `${formatMoney(item.priceCents)}起` }
  },

  decorateOrder(item: IOrderBrief): IHomeOrder {
    // 字典缺失时兜底，避免后端新增状态导致首页整块渲染异常
    const dict = ORDER_STATUS_DICT[item.status] ?? {
      label: '未知状态',
      desc: '',
      color: '--color-text-tertiary',
    }
    return {
      ...item,
      appointmentText: formatDate(item.appointmentAt, 'MM-DD HH:mm'),
      amountText: formatMoney(item.amountCents),
      statusLabel: dict.label,
      statusColor: dict.color,
    }
  },

  /** 老人端：跳转紧急呼叫（长按确认在目标页完成，避免首页误触直接呼叫） */
  handleSos() {
    logger.event('sos_trigger', { from: 'home' })
    router.push('sos')
  },

  /**
   * 分类跳转：switchTab 不能带 query，分类条件通过 appStore 一次性传递，
   * 由服务页 onShow 消费（早期实现直接把 query 拼在 switchTab 上，参数会被丢弃）。
   */
  handleCategoryTap(event: WechatMiniprogram.TouchEvent) {
    const { key } = event.currentTarget.dataset as { key: ServiceCategory }
    appStore.setServiceCategory(key)
    router.switchTo('service')
  },

  handleServiceTap(event: WechatMiniprogram.TouchEvent) {
    const { id } = event.currentTarget.dataset as { id: string }
    router.push('booking', { itemId: id })
  },

  /** 订单卡片统一进详情页，具体可执行动作由详情页按状态决定 */
  handleOrderTap(event: WechatMiniprogram.TouchEvent) {
    const { id } = event.currentTarget.dataset as { id: string }
    router.push('orderDetail', { orderId: id })
  },

  handleMoreOrder() {
    router.switchTo('order')
  },

  handleLogin() {
    router.push('login', { redirect: 'home' })
  },

  /** 客服热线：老人端任何页面都能一键拨打（系统弹窗二次确认，防误触） */
  handleHotline() {
    wx.makePhoneCall({ phoneNumber: APP_INFO.serviceHotline })
  },

  handleRetry() {
    void this.loadHome()
  },
})
