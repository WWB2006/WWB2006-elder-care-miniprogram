/**
 * 订单详情。
 * 功能：展示订单全貌 + 进度、按状态提供可执行动作（支付 / 取消 / 确认 / 评价）。
 * 原则：前端不修改订单状态，所有动作都调后端接口，成功后重新拉取详情（以服务端为准）。
 */
import { cancelOrder, confirmOrder, getOrderDetail } from '../../api/order'
import type { IOrderBrief, OrderStatus } from '../../api/types'
import { ORDER_STATUS_DICT } from '../../config/constant'
import { router } from '../../config/route'
import { formatDate, formatMoney } from '../../utils/format'
import { logger } from '../../utils/logger'
import { elderModeBehavior } from '../../behaviors/elder-mode'

interface IOrderDetailQuery {
  orderId?: string
}

interface IOrderDetail extends IOrderBrief {
  timeline: unknown[]
}

const STEPS = [
  { label: '提交订单' },
  { label: '机构派单' },
  { label: '服务人员接单' },
  { label: '上门服务中' },
  { label: '服务完成，待确认' },
  { label: '已完成' },
]

/** 状态 -> 当前步骤下标；-1 表示已终止（取消 / 退款），不展示进度 */
const STATUS_STEP: Record<OrderStatus, number> = {
  PENDING_PAY: 0,
  PENDING_DISPATCH: 1,
  DISPATCHED: 2,
  ACCEPTED: 2,
  IN_SERVICE: 3,
  PENDING_CONFIRM: 4,
  COMPLETED: 6,
  CANCELED: -1,
  REFUNDED: -1,
}

/** 各状态下可执行的动作，避免在 WXML 里写复杂条件 */
const ACTIONS: Partial<Record<OrderStatus, string[]>> = {
  PENDING_PAY: ['pay', 'cancel'],
  PENDING_DISPATCH: ['cancel'],
  ACCEPTED: ['cancel'],
  PENDING_CONFIRM: ['confirm', 'evaluate'],
  COMPLETED: ['evaluate'],
}

Page({
  behaviors: [elderModeBehavior],

  data: {
    orderId: '',
    loading: true,
    loadFailed: false,
    steps: STEPS,
    stepCurrent: 0,
    stepErrorIndex: -1,
    terminated: false,
    actions: [] as string[],
    detail: null as IOrderDetail | null,
    statusLabel: '',
    statusDesc: '',
    appointmentText: '',
    amountText: '',
    createdAtText: '',
    /** 正在提交动作，避免重复点击 */
    submitting: false,
  },

  onLoad(query: IOrderDetailQuery) {
    const orderId = query?.orderId ?? ''
    if (!orderId) {
      this.setData({ loading: false, loadFailed: true })
      return
    }
    this.setData({ orderId })
    void this.loadDetail()
  },

  async onPullDownRefresh() {
    await this.loadDetail()
    wx.stopPullDownRefresh()
  },

  async loadDetail() {
    this.setData({ loading: true, loadFailed: false })
    try {
      const detail = await getOrderDetail(this.data.orderId)
      this.applyDetail(detail as IOrderDetail)
    } catch (err) {
      logger.error('order_detail_load_failed', { err: String(err), orderId: this.data.orderId })
      this.setData({ loading: false, loadFailed: true })
    }
  },

  applyDetail(detail: IOrderDetail) {
    const dict = ORDER_STATUS_DICT[detail.status] ?? {
      label: '未知状态',
      desc: '请下拉刷新获取最新状态',
      color: '--color-text-tertiary',
    }
    const stepCurrent = STATUS_STEP[detail.status] ?? 0
    this.setData({
      detail,
      loading: false,
      loadFailed: false,
      statusLabel: dict.label,
      statusDesc: dict.desc,
      stepCurrent: stepCurrent < 0 ? 0 : stepCurrent,
      stepErrorIndex: -1,
      terminated: stepCurrent < 0,
      actions: ACTIONS[detail.status] ?? [],
      appointmentText: formatDate(detail.appointmentAt, 'YYYY-MM-DD HH:mm'),
      amountText: formatMoney(detail.amountCents),
      createdAtText: formatDate(detail.createdAt, 'YYYY-MM-DD HH:mm'),
    })
  },

  handleRetry() {
    void this.loadDetail()
  },

  async handleAction(event: WechatMiniprogram.TouchEvent) {
    const { action } = event.currentTarget.dataset as { action: string }
    if (this.data.submitting) return

    if (action === 'pay') return this.goPay()
    if (action === 'evaluate') return this.goEvaluate()
    if (action === 'confirm') return this.confirm()
    if (action === 'cancel') return this.cancel()
  },

  goPay() {
    router.push('pay', { orderId: this.data.orderId })
  },

  goEvaluate() {
    router.push('evaluate', { orderId: this.data.orderId })
  },

  /** 确认完成：老人端必须二次确认，避免误触导致服务人员无法申诉 */
  async confirm() {
    const res = await wx.showModal({
      title: '确认服务已完成？',
      content: '确认后款项将结算给服务人员，如对服务有异议请先联系客服。',
      confirmText: '确认完成',
      cancelText: '再看看',
    })
    if (!res.confirm) return

    this.setData({ submitting: true })
    try {
      await confirmOrder(this.data.orderId)
      logger.event('order_confirm', { orderId: this.data.orderId })
      wx.showToast({ title: '已确认，感谢您的信任', icon: 'none' })
      await this.loadDetail()
    } catch (err) {
      logger.error('order_confirm_failed', { err: String(err) })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 取消订单：必须填写原因，后端据此判断是否收取违约金 */
  async cancel() {
    const res = await wx.showModal({
      title: '取消订单',
      editable: true,
      placeholderText: '请填写取消原因，便于我们改进服务',
      confirmText: '确认取消',
      cancelText: '再想想',
    })
    if (!res.confirm) return
    const reason = (res.content || '').trim()
    if (!reason) {
      wx.showToast({ title: '请填写取消原因', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      await cancelOrder(this.data.orderId, reason)
      logger.event('order_cancel', { orderId: this.data.orderId })
      wx.showToast({ title: '订单已取消', icon: 'none' })
      await this.loadDetail()
    } catch (err) {
      logger.error('order_cancel_failed', { err: String(err) })
    } finally {
      this.setData({ submitting: false })
    }
  },

  handleHotline() {
    wx.makePhoneCall({ phoneNumber: '400-000-0000' })
  },
})
