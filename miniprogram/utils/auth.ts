/**
 * 登录态与角色。
 * 登录链路：wx.login 取 code -> 后端 code2Session 换 openid -> 返回本系统 token + 角色 + 绑定关系。
 * 设计要点：
 * 1. 游客态可用（可浏览服务大厅、价格），下单/看档案/接单前才强制登录；
 * 2. 角色由后端判定（老人/家属/员工），前端只做路由分流，防止越权；
 * 3. 手机号必须由用户主动点击按钮获取（wx.getPhoneNumber），不得静默获取。
 *
 * 状态一致性：登录态同时存在于「storage（跨启动）/ app.globalData（兼容旧代码）/ userStore（视图层）」，
 * 三者必须由本文件统一写入，避免出现「storage 已登录但 userStore 还是 guest」的脏状态。
 */
import { login as loginApi, getUserProfile, logoutApi } from '../api/user'
import { BusEvent, bus } from './event-bus'
import { logger } from './logger'
import { getStorage, removeStorage, StorageKey, setStorage } from './storage'
import { clearTokens, getRefreshToken, hasToken, setTokens } from './token'
import { userStore } from '../store/user'

export interface LoginResult {
  role: Role
  profile: IUserProfile
}

/** 需要登录但当前未登录时抛出，调用方据此中断后续流程（而非弹错误码） */
export class NotLoginError extends Error {
  constructor() {
    super('NOT_LOGIN')
    this.name = 'NotLoginError'
  }
}

/** 并发调用静默登录时只发起一次请求（例如多个分包页同时冷启动） */
let silentLoginPromise: Promise<LoginResult> | null = null

/** 静默登录：无需用户授权，用于拿到 openid 与初始角色 */
export function silentLogin(): Promise<LoginResult> {
  if (silentLoginPromise) return silentLoginPromise
  silentLoginPromise = (async () => {
    try {
      const { code } = await wx.login()
      const res = await loginApi({ code, scene: 'silent' })
      setTokens(res.accessToken, res.refreshToken)
      return cacheProfile(res.role, res.profile)
    } finally {
      silentLoginPromise = null
    }
  })()
  return silentLoginPromise
}

/** 手机号授权登录：老人/家属首次使用时的主路径 */
export async function phoneLogin(phoneCode: string): Promise<LoginResult> {
  const { code } = await wx.login()
  const res = await loginApi({ code, phoneCode, scene: 'phone' })
  setTokens(res.accessToken, res.refreshToken)
  return cacheProfile(res.role, res.profile)
}

/** 登录成功后统一落库：storage + globalData + userStore 三处同步 */
function cacheProfile(role: Role, profile: IUserProfile): LoginResult {
  setStorage(StorageKey.userProfile, profile)
  setStorage(StorageKey.role, role)
  const app = getApp<IElderAppOption>()
  if (app?.globalData) app.globalData.role = role
  userStore.setSession(profile, role)
  logger.event('login_success', { role })
  bus.emit(BusEvent.loginSuccess, { role, profile })
  return { role, profile }
}

/**
 * 冷启动恢复会话。
 * 注意：accessToken 只有 2 小时有效期，但 refreshToken 有 30 天。
 * 因此「accessToken 过期」不等于「需要重新登录」——只要 refreshToken 还在，
 * 就让请求层通过 401 自动刷新拿回会话，避免用户每天被强制重登一次。
 * @returns 有效角色；未登录或 token 失效返回 null
 */
export async function restoreSession(): Promise<Role | null> {
  if (!hasToken() && !getRefreshToken()) {
    // 本地可能残留角色（如上次未正常退出），清掉避免「有角色无 token」的中间态
    clearSession()
    return null
  }
  try {
    const profile = await getUserProfile()
    return cacheProfile(profile.role, profile).role
  } catch (err) {
    logger.warn('session_invalid', { err: String(err) })
    clearSession()
    return null
  }
}

/** 需要登录的操作统一调用，未登录时跳转登录页并抛出中断错误 */
export async function ensureLogin(): Promise<IUserProfile> {
  const profile = getStorage<IUserProfile | null>(StorageKey.userProfile, null)
  if (hasToken() && profile) return profile
  wx.navigateTo({ url: '/pages/login/index' })
  throw new NotLoginError()
}

export function currentRole(): Role {
  if (!hasToken()) return 'guest'
  return getStorage<Role>(StorageKey.role, 'guest')
}

/**
 * 退出登录。
 * 先通知服务端使 refreshToken 失效（失败也不阻塞本地登出，否则用户会卡在登录态）。
 */
export function logout(): void {
  void logoutApi().catch((err) => logger.warn('logout_api_failed', { err: String(err) }))
  clearSession()
}

export function clearSession(): void {
  clearTokens()
  removeStorage(StorageKey.userProfile)
  removeStorage(StorageKey.role)
  userStore.reset()
  const app = getApp<IElderAppOption>()
  if (app?.globalData) app.globalData.role = 'guest'
}
