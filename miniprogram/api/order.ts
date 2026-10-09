/**
 * 订单与支付域接口。
 * 关键约定：
 * 1. 下单必须携带 requestId 做幂等，弱网重试不会产生重复订单；
 * 2. 支付参数由后端统一下单后返回，前端不接触商户密钥；
 * 3. 状态流转只允许后端驱动，前端不得直接改状态（防篡改）。
 */
import { http } from '../utils/request'
import type { IOrderBrief, OrderStatus } from './types'

export interface CreateOrderParams {
  /** 幂等键：前端生成，建议 时间戳 + 随机串 */
  requestId: string
  itemId: string
  elderId: string
  appointmentAt: string
  addressId: string
  /** 备注：如「有高血压，服务前提醒吃药」 */
  remark?: string
  couponId?: string
  /** 支付方式：微信支付 / 长护险 / 政府补贴（后两者需资质校验） */
  payChannel: 'wechat' | 'insurance' | 'subsidy'
}

export interface OrderQuery extends IPageParams {
  status?: OrderStatus | 'ALL'
}

export function createOrder(params: CreateOrderParams): Promise<IOrderBrief> {
  return http.post<IOrderBrief>('/orders', params, { loading: true, toast: false })
}

export function getOrderList(query: OrderQuery): Promise<IPageResult<IOrderBrief>> {
  return http.get<IPageResult<IOrderBrief>>('/orders', query)
}

export function getOrderDetail(orderId: string): Promise<IOrderBrief & { timeline: unknown[] }> {
  return http.get<IOrderBrief & { timeline: unknown[] }>(`/orders/${orderId}`)
}

/** 取消订单：已派单需填写原因，是否收取违约金由后端规则判定 */
export function cancelOrder(orderId: string, reason: string): Promise<void> {
  return http.post<void>(`/orders/${orderId}/cancel`, { reason }, { loading: true })
}

/** 获取微信支付参数（timeStamp / nonceStr / package / signType / paySign） */
export function getPayParams(orderId: string): Promise<WechatMiniprogram.RequestPaymentOption> {
  return http.post<WechatMiniprogram.RequestPaymentOption>(`/orders/${orderId}/pay`, undefined, {
    loading: true,
  })
}

export function confirmOrder(orderId: string): Promise<void> {
  return http.post<void>(`/orders/${orderId}/confirm`, undefined, { loading: true })
}

export function evaluateOrder(
  orderId: string,
  payload: { score: number; tags: string[]; content: string },
): Promise<void> {
  // 老人端评价支持语音转文字，内容长度与敏感词由后端二次校验
  return http.post<void>(`/orders/${orderId}/evaluate`, payload, { loading: true })
}

/** 服务中位置订阅（家属可见）；长连接推送，兜底为 30s 轮询 */
export function subscribeServiceTrack(
  orderId: string,
): Promise<{ trackToken: string; expireAt: number }> {
  return http.post<{ trackToken: string; expireAt: number }>(`/orders/${orderId}/track/subscribe`)
}
