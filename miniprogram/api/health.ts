/**
 * 健康档案域接口。
 * 合规提醒：健康数据属敏感个人信息，读写接口必须校验「老人本人或已授权家属」关系，
 * 并在服务端记录操作审计日志（谁、何时、访问了谁的什么数据）。
 */
import { http } from '../utils/request'
import type { IVitalSign } from './types'

export interface VitalQuery extends IPageParams {
  elderId: string
  type?: IVitalSign['type']
  startDate?: string
  endDate?: string
}

export interface MedicationReminder {
  reminderId: string
  elderId: string
  medicineName: string
  dosage: string
  /** 每日服药时间点，如 ['08:00', '20:00'] */
  times: string[]
  startDate: string
  endDate: string
  enabled: boolean
  /** 漏服时是否同步提醒家属 */
  notifyFamily: boolean
}

export interface HealthReport {
  periodLabel: string
  summary: string
  series: Array<{ type: IVitalSign['type']; points: Array<{ at: string; value: number }> }>
  abnormalCount: number
  suggestions: string[]
}

export function recordVital(payload: Omit<IVitalSign, 'recordId' | 'abnormal'>): Promise<IVitalSign> {
  return http.post<IVitalSign>('/health/vitals', payload, { loading: true })
}

export function getVitalList(query: VitalQuery): Promise<IPageResult<IVitalSign>> {
  return http.get<IPageResult<IVitalSign>>('/health/vitals', query)
}

/** 健康周报 / 月报：图表数据由后端聚合，减少小程序端计算与流量 */
export function getHealthReport(params: {
  elderId: string
  period: 'week' | 'month'
  endDate?: string
}): Promise<HealthReport> {
  return http.get<HealthReport>('/health/report', params)
}

export function getMedicationList(elderId: string): Promise<MedicationReminder[]> {
  return http.get<MedicationReminder[]>('/health/medications', { elderId }, { auth: true })
}

export function saveMedication(
  payload: Omit<MedicationReminder, 'reminderId'> & { reminderId?: string },
): Promise<MedicationReminder> {
  return http.post<MedicationReminder>('/health/medications', payload, { loading: true })
}

/** 绑定蓝牙血压计 / 血糖仪 / 手环等设备 */
export function bindDevice(payload: {
  elderId: string
  deviceType: 'blood_pressure' | 'glucose_meter' | 'band'
  deviceSn: string
  deviceName: string
}): Promise<{ deviceId: string }> {
  return http.post<{ deviceId: string }>('/health/devices/bind', payload, { loading: true })
}

/**
 * 一键呼救。
 * 降级链路：小程序内调用接口 -> 后端外呼值班手机 -> 短信通知家属 -> App/公众号推送。
 * 前端同时提供 wx.makePhoneCall 直呼家属，避免接口不可用时完全失联。
 */
export function triggerSos(payload: {
  elderId: string
  /** 触发方式：长按按钮 / 语音 / 跌倒检测设备 */
  triggerType: 'button' | 'voice' | 'device'
  latitude?: number
  longitude?: number
  addressHint?: string
}): Promise<{ sosId: string; handledBy: string; expectCallSeconds: number }> {
  return http.post<{ sosId: string; handledBy: string; expectCallSeconds: number }>(
    '/sos/trigger',
    payload,
    { loading: true, toast: false, retry: 2 },
  )
}
