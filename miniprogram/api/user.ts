/**
 * 用户 / 认证域接口。
 * 接口层按业务域拆分文件，便于并行开发与按需引入（配合 lazyCodeLoading 控制主包体积）。
 */
import { http } from '../utils/request'
import type { IElderProfile } from './types'

export interface LoginParams {
  /** wx.login 返回的临时凭证 */
  code: string
  /** 手机号快速验证组件的 code（button open-type=getPhoneNumber） */
  phoneCode?: string
  scene: 'silent' | 'phone'
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  role: Role
  profile: IUserProfile
}

export function login(params: LoginParams): Promise<LoginResponse> {
  // 登录失败不弹全局 toast，由页面给出更友好的引导
  return http.post<LoginResponse>('/auth/login', params, { toast: false, retry: 1 })
}

export function getUserProfile(): Promise<IUserProfile> {
  return http.get<IUserProfile>('/user/profile', undefined, { auth: true, toast: false })
}

/** 绑定手机号，用于账号找回与紧急联系 */
export function bindPhone(phoneCode: string): Promise<{ phoneMasked: string }> {
  return http.post<{ phoneMasked: string }>('/user/phone', { phoneCode })
}

/** 家属绑定老人：需老人或机构管理员确认，避免任意绑定他人档案 */
export function bindElder(elderId: string, verifyCode: string): Promise<{ relation: string }> {
  return http.post<{ relation: string }>('/user/family/bind', { elderId, verifyCode })
}

export function getBoundElders(): Promise<IElderProfile[]> {
  return http.get<IElderProfile[]>('/user/family/elders')
}

/** 退出登录：服务端同时使 refreshToken 失效 */
export function logoutApi(): Promise<void> {
  return http.post<void>('/auth/logout', undefined, { toast: false })
}
