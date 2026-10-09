/**
 * 服务大厅域接口（服务项目、机构、可约时段）。
 */
import { http } from '../utils/request'
import type { IElderProfile, IServiceItem, ServiceCategory } from './types'

export interface ServiceQuery extends IPageParams {
  category?: ServiceCategory
  keyword?: string
  /** 按距离排序需传入定位（后端仅保存网格化后的位置，见隐私规范） */
  location?: { latitude: number; longitude: number }
}

export interface IOrganization {
  orgId: string
  name: string
  logoUrl: string
  rating: number
  /** 是否具备医疗 / 长护险等资质 */
  qualifications: string[]
  address: string
  distanceMeters: number
  serviceCount: number
}

export function getServiceList(query: ServiceQuery): Promise<IPageResult<IServiceItem>> {
  return http.get<IPageResult<IServiceItem>>('/service/items', query)
}

export function getServiceDetail(itemId: string): Promise<IServiceItem> {
  return http.get<IServiceItem>(`/service/items/${itemId}`)
}

export function getCategories(): Promise<
  Array<{ category: ServiceCategory; name: string; icon: string }>
> {
  return http.get<Array<{ category: ServiceCategory; name: string; icon: string }>>(
    '/service/categories',
  )
}

/** 就近机构列表：用于「附近的服务网点」 */
export function getNearbyOrganizations(params: {
  latitude: number
  longitude: number
  pageNum?: number
  pageSize?: number
}): Promise<IPageResult<IOrganization>> {
  return http.get<IPageResult<IOrganization>>('/service/organizations/nearby', {
    pageNum: 1,
    pageSize: 20,
    ...params,
  })
}

/** 下单前的可用时段（结合排班与地址可达性） */
export function getAvailableSlots(params: {
  itemId: string
  elderId: string
  date: string
}): Promise<Array<{ startAt: string; endAt: string; available: boolean; staffId?: string }>> {
  return http.get<Array<{ startAt: string; endAt: string; available: boolean; staffId?: string }>>(
    '/service/slots',
    params,
  )
}

export function getElderProfile(elderId: string): Promise<IElderProfile> {
  return http.get<IElderProfile>(`/elder/${elderId}`, undefined, { auth: true })
}
