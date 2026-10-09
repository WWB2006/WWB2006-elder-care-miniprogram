/**
 * 业务常量与字典。
 * 规则：任何会被两个以上页面使用的枚举 / 文案映射，都必须放这里，禁止页面内各写一份。
 */
import { OrderStatus, ServiceCategory } from '../api/types'

export const APP_INFO = {
  name: '安心养老',
  version: '0.1.0',
  /** 客服热线：老人端任何页面都可一键拨打 */
  serviceHotline: '400-000-0000',
} as const

/** 分页默认值（列表页统一 10 条 / 页，老人端不做无限滚动，改为「加载更多」大按钮） */
export const PAGE_SIZE = 10

/** 订单状态字典：label 用于展示，desc 用于老人端大字解释，color 对应设计令牌 */
export const ORDER_STATUS_DICT: Record<OrderStatus, { label: string; desc: string; color: string }> = {
  [OrderStatus.PENDING_PAY]: { label: '待支付', desc: '订单已提交，请尽快完成支付', color: '--color-warning' },
  [OrderStatus.PENDING_DISPATCH]: { label: '待派单', desc: '机构正在安排服务人员', color: '--color-warning' },
  [OrderStatus.DISPATCHED]: { label: '待接单', desc: '已指定服务人员，等待其确认', color: '--color-warning' },
  [OrderStatus.ACCEPTED]: { label: '待上门', desc: '服务人员已接单，将按时上门', color: '--color-primary' },
  [OrderStatus.IN_SERVICE]: { label: '服务中', desc: '服务人员已到达并开始服务', color: '--color-primary' },
  [OrderStatus.PENDING_CONFIRM]: { label: '待确认', desc: '服务已完成，请确认本次服务', color: '--color-primary' },
  [OrderStatus.COMPLETED]: { label: '已完成', desc: '本次服务已完成，感谢您的信任', color: '--color-success' },
  [OrderStatus.CANCELED]: { label: '已取消', desc: '订单已取消', color: '--color-text-tertiary' },
  [OrderStatus.REFUNDED]: { label: '已退款', desc: '款项已原路退回', color: '--color-text-tertiary' },
}

/** 服务分类字典（icons 为 assets/icons 下的文件名，不引入网络图片以避免闪白） */
export const SERVICE_CATEGORY_DICT: Record<ServiceCategory, { label: string; icon: string; tip: string }> = {
  [ServiceCategory.Meal]: { label: '助餐', icon: 'meal', tip: '送餐上门、协助进食' },
  [ServiceCategory.Bath]: { label: '助浴', icon: 'bath', tip: '上门助浴、擦浴服务' },
  [ServiceCategory.Clean]: { label: '助洁', icon: 'clean', tip: '居家保洁、衣物洗涤' },
  [ServiceCategory.Medical]: { label: '助医', icon: 'medical', tip: '陪同就医、用药协助' },
  [ServiceCategory.Walk]: { label: '助行', icon: 'walk', tip: '陪同外出、康复行走' },
  [ServiceCategory.Rehab]: { label: '康复护理', icon: 'rehab', tip: '专业护理、康复训练' },
  [ServiceCategory.Escort]: { label: '陪诊', icon: 'escort', tip: '挂号取药、全程陪诊' },
  [ServiceCategory.Comfort]: { label: '精神慰藉', icon: 'comfort', tip: '聊天陪伴、心理关怀' },
}

export const CARE_LEVEL_DICT = {
  self: { label: '自理', desc: '生活基本能自理' },
  semi: { label: '半自理', desc: '部分日常活动需要帮助' },
  disabled: { label: '不能自理', desc: '日常起居需要全程照护' },
} as const

/** 微信订阅消息模板 ID（需在小程序后台申请，审核通过后填入） */
export const SUBSCRIBE_TEMPLATE = {
  orderStatusChanged: 'TEMPLATE_ID_ORDER_STATUS',
  serviceReminder: 'TEMPLATE_ID_SERVICE_REMINDER',
  medicationReminder: 'TEMPLATE_ID_MEDICATION',
  sosNotify: 'TEMPLATE_ID_SOS',
  healthAbnormal: 'TEMPLATE_ID_HEALTH_ALERT',
} as const

/** 紧急呼叫配置：长按 3 秒触发，防误触 */
export const SOS_CONFIG = {
  longPressMs: 3000,
  /** 触发后自动拨号给第一紧急联系人 */
  autoCall: true,
  /** 接口失败后重试次数 */
  retry: 2,
  /** 客服热线兜底 */
  hotline: APP_INFO.serviceHotline,
} as const

/** 功能开关：灰度 / 应急下线，无需发版即可通过后端配置覆盖 */
export const FEATURE_FLAG = {
  videoVisit: true,
  voiceAssistant: true,
  healthDevice: true,
  familyTrack: true,
  adminInMiniProgram: false,
} as const

/**
 * 内嵌 H5（web-view）域名白名单。
 * 安全约束：web-view 等同于把外部页面放进小程序，绝不允许加载任意 URL
 * （钓鱼页可伪装成"用户协议"骗取老人手机号）。未列入白名单的地址一律拒绝。
 * 上线前替换为真实的协议 / 帮助中心 / 机构主页域名，并同步小程序后台业务域名。
 */
export const WEBVIEW_ALLOWED_HOSTS: readonly string[] = ['example.com', 'docs.qq.com']
