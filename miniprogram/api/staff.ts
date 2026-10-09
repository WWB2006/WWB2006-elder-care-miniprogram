/**
 * 服务人员（员工端）接口。
 * 打卡防作弊：定位（GPS + 基站）+ 现场照片 + 服务前后照片 + 老人/家属确认码，
 * 四要素按机构配置组合，任一不满足则进入「异常工单」由管理员复核。
 */
import { http } from '../utils/request'
import type { IStaffTask, OrderStatus } from './types'

export interface TaskQuery extends IPageParams {
  /** pool：可抢单的任务池；mine：我的任务；history：历史记录 */
  scope: 'pool' | 'mine' | 'history'
  status?: OrderStatus
}

export function getTaskList(query: TaskQuery): Promise<IPageResult<IStaffTask>> {
  return http.get<IPageResult<IStaffTask>>('/staff/tasks', query)
}

export function getTaskDetail(taskId: string): Promise<IStaffTask> {
  return http.get<IStaffTask>(`/staff/tasks/${taskId}`)
}

export function acceptTask(taskId: string): Promise<void> {
  // 服务端使用分布式锁，避免多名服务人员同时抢到同一单
  return http.post<void>(`/staff/tasks/${taskId}/accept`, undefined, { loading: true })
}

export function checkinTask(payload: {
  taskId: string
  latitude: number
  longitude: number
  /** 打卡照片 fileId */
  photoFileId: string
  /** 定位精度（米），精度过低时后端标记为可疑打卡 */
  accuracy: number
  address?: string
}): Promise<{ checkinId: string; suspicious: boolean }> {
  return http.post<{ checkinId: string; suspicious: boolean }>('/staff/tasks/checkin', payload, {
    loading: true,
    toast: false,
  })
}

export function submitServiceLog(payload: {
  taskId: string
  /** 逐项勾选的服务清单 */
  items: Array<{ itemId: string; done: boolean; note?: string }>
  /** 服务前后照片 */
  photoFileIds: string[]
  /** 老人或家属确认码（4 位）；未获取时可上传签字照片代替 */
  confirmCode?: string
  remark?: string
  /** 异常必须上报（如老人身体不适、家中无人应答） */
  abnormal?: { type: string; description: string }
}): Promise<{ logId: string }> {
  return http.post<{ logId: string }>('/staff/tasks/service-log', payload, {
    loading: true,
    toast: false,
  })
}

/** 排班：一天的班次安排 */
export interface IShiftDay {
  date: string
  shifts: Array<{ shiftId: string; startAt: string; endAt: string; taskCount: number }>
}

export function getSchedule(params: { month: string }): Promise<IShiftDay[]> {
  return http.get<IShiftDay[]>('/staff/schedule', params)
}

/** 请假 / 换班申请 */
export function applyLeave(payload: {
  date: string
  reason: string
  type: 'leave' | 'swap'
}): Promise<void> {
  return http.post<void>('/staff/leave', payload, { loading: true })
}
