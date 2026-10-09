/**
 * 接口 DTO 定义。
 * 约定：前端不直接使用后端实体，一律通过 DTO 映射；
 * 金额字段统一「分」，时间字段统一 ISO 字符串（见 docs/设计方案.md 第 8 节）。
 */

/** 服务大类：助餐 / 助浴 / 助洁 / 助医 / 助行 / 康复护理 / 陪诊 / 精神慰藉 */
export enum ServiceCategory {
  Meal = 'meal',
  Bath = 'bath',
  Clean = 'clean',
  Medical = 'medical',
  Walk = 'walk',
  Rehab = 'rehab',
  Escort = 'escort',
  Comfort = 'comfort',
}

export interface IServiceItem {
  id: string
  /** 服务商（机构）ID */
  orgId: string
  orgName: string
  name: string
  category: ServiceCategory
  /** 服务时长（分钟） */
  durationMinutes: number
  /** 起步价（分） */
  priceCents: number
  /** 计价单位：次 / 小时 / 天 */
  priceUnit: 'time' | 'hour' | 'day'
  coverUrl: string
  description: string
  /** 服务包含项，用于老人端大字列表展示 */
  includes: string[]
  rating: number
  soldCount: number
  /** 是否支持上门 */
  doorToDoor: boolean
}

export interface IElderProfile {
  elderId: string
  name: string
  gender: 'male' | 'female'
  birthday: string
  age: number
  /** 所在区域（用于就近派单） */
  district: string
  addressMasked: string
  /** 照护等级：自理 / 半自理 / 不能自理 */
  careLevel: 'self' | 'semi' | 'disabled'
  /** 标签：独居、失智、术后康复等，用于指导服务人员准备 */
  tags: string[]
  /** 紧急联系人（脱敏展示，点击可拨号） */
  emergencyContacts: Array<{ name: string; relation: string; phone: string }>
}

/** 订单状态机（必须与后端枚举严格一致） */
export enum OrderStatus {
  /** 待支付 */
  PENDING_PAY = 'PENDING_PAY',
  /** 待派单 */
  PENDING_DISPATCH = 'PENDING_DISPATCH',
  /** 已派单，待接单 */
  DISPATCHED = 'DISPATCHED',
  /** 服务人员已接单，待上门 */
  ACCEPTED = 'ACCEPTED',
  /** 服务中（已打卡） */
  IN_SERVICE = 'IN_SERVICE',
  /** 待确认（服务完成，等待确认或自动确认） */
  PENDING_CONFIRM = 'PENDING_CONFIRM',
  /** 已完成 */
  COMPLETED = 'COMPLETED',
  /** 已取消 */
  CANCELED = 'CANCELED',
  /** 已退款 */
  REFUNDED = 'REFUNDED',
}

export interface IOrderBrief {
  orderId: string
  orderNo: string
  serviceName: string
  status: OrderStatus
  /** 预约上门时间 */
  appointmentAt: string
  amountCents: number
  elderName: string
  orgName: string
  coverUrl: string
  /** 服务人员姓名，未派单时为空 */
  staffName?: string
  createdAt: string
}

export interface IVitalSign {
  recordId: string
  elderId: string
  type: 'blood_pressure' | 'blood_glucose' | 'heart_rate' | 'weight' | 'temperature' | 'spo2'
  /** 血压存 systolic/diastolic；血糖存 value + 餐前餐后 */
  values: Record<string, number>
  measuredAt: string
  source: 'manual' | 'device'
  deviceName?: string
  /** 是否触发异常提醒（阈值由机构配置） */
  abnormal: boolean
}

export interface IStaffTask {
  taskId: string
  orderNo: string
  serviceName: string
  status: OrderStatus
  appointmentAt: string
  /** 距离服务人员当前定位的距离（米），由后端计算 */
  distanceMeters: number
  elderName: string
  elderTags: string[]
  addressMasked: string
  /** 完整地址仅在接单后可见，规避信息泄露 */
  addressFull?: string
  amountCents: number
  /** 服务清单，服务人员需逐项勾选 */
  serviceItems: Array<{ itemId: string; name: string }>
}
