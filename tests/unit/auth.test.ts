/**
 * 登录态的单元测试。
 *
 * 本文件守住三条设计约束：
 * 1. 三源一致：storage / globalData / userStore 必须同时更新，否则会出现
 *    「storage 已登录但页面还是游客态」的脏状态；
 * 2. 静默登录单飞：多个分包页同时冷启动只发一次 wx.login + 一次后端请求；
 * 3. accessToken 过期 ≠ 需要重新登录：只要 refreshToken 还在就保留会话。
 */
import { login as loginApi, getUserProfile, logoutApi } from '../../miniprogram/api/user'
import { bus, BusEvent } from '../../miniprogram/utils/event-bus'
import { resetLoggerQueue } from '../../miniprogram/utils/logger'
import { StorageKey, setStorage } from '../../miniprogram/utils/storage'
import {
  NotLoginError,
  clearSession,
  currentRole,
  ensureLogin,
  logout,
  phoneLogin,
  restoreSession,
  silentLogin,
} from '../../miniprogram/utils/auth'
import { setTokens } from '../../miniprogram/utils/token'
import { userStore } from '../../miniprogram/store/user'
import { wxMock, readWxStorage } from '../setup/wx'

jest.mock('../../miniprogram/api/user', () => ({
  login: jest.fn(),
  getUserProfile: jest.fn(),
  logoutApi: jest.fn(),
}))

const loginApiMock = loginApi as unknown as jest.Mock
const getUserProfileMock = getUserProfile as unknown as jest.Mock
const logoutApiMock = logoutApi as unknown as jest.Mock

const PROFILE: IUserProfile = {
  userId: 'u1',
  role: 'elder',
  nickname: '张奶奶',
  avatarUrl: '',
  phoneMasked: '138****8000',
  verifyStatus: 'passed',
}

const LOGIN_RES = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  role: 'elder' as const,
  profile: PROFILE,
}

let globalData: { role?: Role }

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  globalData = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).getApp = () => ({ globalData })
  userStore.reset()
})

afterEach(() => {
  resetLoggerQueue()
  bus.off(BusEvent.loginSuccess)
  jest.restoreAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).getApp = () => undefined
})

describe('silentLogin', () => {
  it('登录成功后同时写入 storage、globalData 与 userStore（三源一致）', async () => {
    ;(wxMock.login as unknown as jest.Mock).mockResolvedValue({ code: 'wx-code' })
    loginApiMock.mockResolvedValue(LOGIN_RES)

    await expect(silentLogin()).resolves.toEqual({ role: 'elder', profile: PROFILE })

    expect(readWxStorage(`ec_${StorageKey.token}`)).toEqual(expect.objectContaining({ v: 'access-1' }))
    expect(readWxStorage(`ec_${StorageKey.role}`)).toEqual(expect.objectContaining({ v: 'elder' }))
    expect(globalData.role).toBe('elder')
    expect(userStore.getState().role).toBe('elder')
    expect(userStore.getState().profile).toEqual(PROFILE)
    expect(userStore.isLoggedIn).toBe(true)
  })

  it('登录成功会广播 loginSuccess 事件', async () => {
    ;(wxMock.login as unknown as jest.Mock).mockResolvedValue({ code: 'wx-code' })
    loginApiMock.mockResolvedValue(LOGIN_RES)
    const handler = jest.fn()
    bus.on(BusEvent.loginSuccess, handler)

    await silentLogin()
    expect(handler).toHaveBeenCalledWith({ role: 'elder', profile: PROFILE })
  })

  it('并发调用只发起一次 wx.login 与一次后端请求（单飞）', async () => {
    ;(wxMock.login as unknown as jest.Mock).mockResolvedValue({ code: 'wx-code' })
    loginApiMock.mockResolvedValue(LOGIN_RES)

    await Promise.all([silentLogin(), silentLogin(), silentLogin()])

    expect(wxMock.login).toHaveBeenCalledTimes(1)
    expect(loginApiMock).toHaveBeenCalledTimes(1)
  })

  it('失败后单飞锁被释放，下一次调用可以重试', async () => {
    ;(wxMock.login as unknown as jest.Mock).mockResolvedValue({ code: 'wx-code' })
    loginApiMock.mockRejectedValueOnce(new Error('network'))

    await expect(silentLogin()).rejects.toThrow('network')
    loginApiMock.mockResolvedValue(LOGIN_RES)
    await expect(silentLogin()).resolves.toEqual({ role: 'elder', profile: PROFILE })
    expect(loginApiMock).toHaveBeenCalledTimes(2)
  })

  it('以 scene=silent 调用登录接口', async () => {
    ;(wxMock.login as unknown as jest.Mock).mockResolvedValue({ code: 'wx-code' })
    loginApiMock.mockResolvedValue(LOGIN_RES)

    await silentLogin()
    expect(loginApiMock).toHaveBeenCalledWith({ code: 'wx-code', scene: 'silent' })
  })
})

describe('phoneLogin', () => {
  it('手机号授权登录同样完成三源写入', async () => {
    ;(wxMock.login as unknown as jest.Mock).mockResolvedValue({ code: 'wx-code' })
    loginApiMock.mockResolvedValue({ ...LOGIN_RES, role: 'family', profile: { ...PROFILE, role: 'family' } })

    const result = await phoneLogin('phone-code-1')

    expect(loginApiMock).toHaveBeenCalledWith({
      code: 'wx-code',
      phoneCode: 'phone-code-1',
      scene: 'phone',
    })
    expect(result.role).toBe('family')
    expect(userStore.getState().role).toBe('family')
  })

  it('登录接口失败时不会写入半截状态', async () => {
    ;(wxMock.login as unknown as jest.Mock).mockResolvedValue({ code: 'wx-code' })
    loginApiMock.mockRejectedValue(new Error('boom'))

    await expect(phoneLogin('c')).rejects.toThrow('boom')
    expect(userStore.getState().role).toBe('guest')
    expect(globalData.role).toBeUndefined()
  })
})

describe('restoreSession', () => {
  it('无 token 也无 refreshToken 时返回 null，并清掉残留角色', async () => {
    await expect(restoreSession()).resolves.toBeNull()
    expect(userStore.getState().role).toBe('guest')
  })

  it('accessToken 已过期但 refreshToken 仍在时，仍尝试恢复会话（不强制重登）', async () => {
    // accessToken 写空值：getToken() 返回 '' → hasToken() 为 false；
    // 但 refreshToken 还在，restoreSession 不应直接放弃会话
    setTokens('', 'refresh-1')
    getUserProfileMock.mockResolvedValue(PROFILE)

    await expect(restoreSession()).resolves.toBe('elder')
    expect(getUserProfileMock).toHaveBeenCalledTimes(1)
  })

  it('有 accessToken 时正常拉取资料并返回角色', async () => {
    setTokens('access-1', 'refresh-1')
    getUserProfileMock.mockResolvedValue(PROFILE)

    await expect(restoreSession()).resolves.toBe('elder')
    expect(userStore.getState().role).toBe('elder')
  })

  it('拉取资料失败时清理会话并返回 null（token 已失效）', async () => {
    setTokens('access-1', 'refresh-1')
    getUserProfileMock.mockRejectedValue(new Error('401'))

    await expect(restoreSession()).resolves.toBeNull()
    expect(userStore.getState().role).toBe('guest')
    expect(wxMock.getStorageSync(StorageKey.token)).toBe('')
  })
})

describe('ensureLogin', () => {
  it('已登录时直接返回资料，不跳转', async () => {
    setTokens('access-1', 'refresh-1')
    // ensureLogin 以 storage 为准（storage 是跨启动的唯一真相源）
    setStorage(StorageKey.userProfile, PROFILE)

    await expect(ensureLogin()).resolves.toEqual(PROFILE)
    expect(wxMock.navigateTo).not.toHaveBeenCalled()
  })

  it('未登录时跳登录页并抛 NotLoginError 中断后续流程', async () => {
    await expect(ensureLogin()).rejects.toBeInstanceOf(NotLoginError)
    expect(wxMock.navigateTo).toHaveBeenCalledWith({ url: '/pages/login/index' })
  })

  it('有 token 但本地无资料时视为未登录', async () => {
    setTokens('access-1', 'refresh-1')
    userStore.reset()

    await expect(ensureLogin()).rejects.toBeInstanceOf(NotLoginError)
  })
})

describe('currentRole', () => {
  it('无 token 时恒为 guest（即使 storage 残留角色）', () => {
    wxMock.setStorageSync(`ec_${StorageKey.role}`, { v: 'elder', e: 0 })
    expect(currentRole()).toBe('guest')
  })

  it('有 token 时返回 storage 中记录的角色', () => {
    setTokens('access-1', 'refresh-1')
    setStorage(StorageKey.role, 'staff')
    expect(currentRole()).toBe('staff')
  })
})

describe('logout / clearSession', () => {
  it('logout 通知服务端并使本地会话失效', () => {
    setTokens('access-1', 'refresh-1')
    userStore.setSession(PROFILE, 'elder')
    logoutApiMock.mockResolvedValue(undefined)

    logout()

    expect(logoutApiMock).toHaveBeenCalledTimes(1)
    expect(wxMock.getStorageSync(StorageKey.token)).toBe('')
    expect(userStore.getState().role).toBe('guest')
    expect(globalData.role).toBe('guest')
  })

  it('服务端登出失败也不阻塞本地登出（否则用户卡在登录态）', () => {
    setTokens('access-1', 'refresh-1')
    userStore.setSession(PROFILE, 'elder')
    logoutApiMock.mockRejectedValue(new Error('network'))

    expect(() => logout()).not.toThrow()
    expect(userStore.getState().role).toBe('guest')
  })

  it('clearSession 清空 profile / role / token 与 globalData', () => {
    setTokens('access-1', 'refresh-1')
    userStore.setSession(PROFILE, 'elder')

    clearSession()

    expect(wxMock.getStorageSync(StorageKey.token)).toBe('')
    expect(wxMock.getStorageSync(StorageKey.refreshToken)).toBe('')
    expect(wxMock.getStorageSync(StorageKey.userProfile)).toBe('')
    expect(userStore.getState()).toEqual({ profile: null, role: 'guest', activeElderId: '' })
    expect(globalData.role).toBe('guest')
  })

  it('getApp 不可用时 clearSession 不报错（单测/冷启动早期）', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).getApp = () => undefined
    expect(() => clearSession()).not.toThrow()
  })
})
