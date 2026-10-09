/**
 * 订单列表。
 * 功能：按状态分 tab、分页加载、下拉刷新、触底加载。
 * 约定：状态流转只由后端驱动，前端按钮可见性只是「提示」，不是权限（见设计方案 6.2）。
 */
import { getOrderList } from '../../api/order'
import { OrderStatus } from '../../api/types'
import type { IOrderBrief } from '../../api/types'
import { ORDER_STATUS_DICT, PAGE_SIZE } from '../../config/constant'
import { router } from '../../config/route'
import { formatDate, formatMoney } from '../../utils/format'
import { logger } from '../../utils/logger'
import { syncTabBar } from '../../utils/tabbar'
import { elderModeBehavior, type IElderModeData } from '../../behaviors/elder-mode'
import type { IPageBehaviorSupport } from '../../behaviors/types'
import {
  paginationBehavior,
  type IPageFetchResult,
  type IPaginationCustom,
  type IPaginationData,
} from '../../behaviors/pagination'

interface IOrderVM extends IOrderBrief {
  statusLabel: string
  statusDesc: string
  statusTone: string
  appointmentText: string
  amountText: string
}

interface IStatusTab {
  key: OrderStatus | 'ALL'
  label: string
}

const TAB_INDEX = 2

/** 状态 tab 的顺序即老人最关心的顺序：进行中在前，已结束在后 */
const STATUS_TABS: IStatusTab[] = [
  { key: 'ALL', label: '全部' },
  { key: OrderStatus.PENDING_PAY, label: '待支付' },
  { key: OrderStatus.ACCEPTED, label: '待上门' },
  { key: OrderStatus.IN_SERVICE, label: '服务中' },
  { key: OrderStatus.PENDING_CONFIRM, label: '待确认' },
  { key: OrderStatus.COMPLETED, label: '已完成' },
]

interface IOrderData extends Partial<IPaginationData<IOrderVM>>, Partial<IElderModeData> {
  tabs: IStatusTab[]
  activeStatus: OrderStatus | 'ALL'
}

type IOrderCustom = IPageBehaviorSupport &
  IPaginationCustom<IOrderBrief> & {
    decorate(item: IOrderBrief): IOrderVM
    handleTabTap(event: WechatMiniprogram.TouchEvent): void
    handleOrderTap(event: WechatMiniprogram.TouchEvent): void
    handleGoService(): void
    handleEmptyAction(): void
    handleRetry(): void
  }

Page<IOrderData, IOrderCustom>({
  behaviors: [elderModeBehavior, paginationBehavior],

  data: {
    tabs: STATUS_TABS,
    activeStatus: 'ALL',
    list: [],
  },

  onShow() {
    syncTabBar(this, TAB_INDEX)
    void this.refreshPage?.()
  },

  async onPullDownRefresh() {
    await this.refreshPage?.()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    void this.loadMorePage?.()
  },

  async fetchPage(pageNum: number): Promise<IPageFetchResult<IOrderBrief>> {
    const res = await getOrderList({
      pageNum,
      pageSize: PAGE_SIZE,
      status: this.data.activeStatus,
    })
    return { list: res.list, hasMore: res.hasMore }
  },

  mapPageItems(items: unknown[]): unknown[] {
    return (items as IOrderBrief[]).map((item) => this.decorate(item))
  },

  decorate(item: IOrderBrief): IOrderVM {
    // 字典缺失时兜底，避免后端新增状态导致整页渲染异常
    const dict = ORDER_STATUS_DICT[item.status] ?? {
      label: '未知状态',
      desc: '请下拉刷新获取最新状态',
      color: '--color-text-tertiary',
    }
    return {
      ...item,
      statusLabel: dict.label,
      statusDesc: dict.desc,
      statusTone: dict.color.replace('--color-', ''),
      appointmentText: formatDate(item.appointmentAt, 'YYYY-MM-DD HH:mm'),
      amountText: formatMoney(item.amountCents),
    }
  },

  handleTabTap(event: WechatMiniprogram.TouchEvent) {
    const { key } = event.currentTarget.dataset as { key: OrderStatus | 'ALL' }
    if (key === this.data.activeStatus) return
    this.setData({ activeStatus: key, list: [] })
    logger.event('order_tab_change', { status: key })
    void this.refreshPage?.()
  },

  handleOrderTap(event: WechatMiniprogram.TouchEvent) {
    const { id } = event.currentTarget.dataset as { id: string }
    router.push('orderDetail', { orderId: id })
  },

  handleGoService() {
    router.switchTo('service')
  },

  /** 空态按钮是「重新加载」还是「去预约」取决于当前是错误态还是空态 */
  handleEmptyAction() {
    if (this.data.listError) this.handleRetry()
    else this.handleGoService()
  },

  handleRetry() {
    void this.refreshPage?.()
  },
})
