/**
 * Token 读写的单元测试。
 * 重点：accessToken（2h）与 refreshToken（30 天）的有效期差异——
 * 这是「用户每天被强制重登」这类线上投诉的根源，必须有测试固定住。
 */
import { clearTokens, getRefreshToken, getToken, hasToken, setTokens } from '../../miniprogram/utils/token'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const T0 = 1_700_000_000_000

afterEach(() => {
  jest.restoreAllMocks()
})

describe('setTokens / 读取', () => {
  it('写入后能读回两个 token', () => {
    setTokens('access-1', 'refresh-1')
    expect(getToken()).toBe('access-1')
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('hasToken 反映是否持有 accessToken', () => {
    expect(hasToken()).toBe(false)
    setTokens('access-1', 'refresh-1')
    expect(hasToken()).toBe(true)
  })

  it('clearTokens 同时清掉两个 token', () => {
    setTokens('access-1', 'refresh-1')
    clearTokens()
    expect(getToken()).toBe('')
    expect(getRefreshToken()).toBe('')
    expect(hasToken()).toBe(false)
  })
})

describe('有效期策略', () => {
  it('accessToken 超过 2 小时即失效', () => {
    jest.spyOn(Date, 'now').mockReturnValue(T0)
    setTokens('access-1', 'refresh-1')

    jest.spyOn(Date, 'now').mockReturnValue(T0 + 2 * HOUR + 1000)
    expect(getToken()).toBe('')
    expect(hasToken()).toBe(false)
  })

  it('accessToken 失效后 refreshToken 仍然有效（30 天）', () => {
    jest.spyOn(Date, 'now').mockReturnValue(T0)
    setTokens('access-1', 'refresh-1')

    // 第 3 天：accessToken 早过期，但用户不该被要求重新登录
    jest.spyOn(Date, 'now').mockReturnValue(T0 + 3 * DAY)
    expect(hasToken()).toBe(false)
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('refreshToken 超过 30 天才失效', () => {
    jest.spyOn(Date, 'now').mockReturnValue(T0)
    setTokens('access-1', 'refresh-1')

    jest.spyOn(Date, 'now').mockReturnValue(T0 + 29 * DAY)
    expect(getRefreshToken()).toBe('refresh-1')

    jest.spyOn(Date, 'now').mockReturnValue(T0 + 31 * DAY)
    expect(getRefreshToken()).toBe('')
  })

  it('accessToken 在 2 小时边界内仍然有效', () => {
    jest.spyOn(Date, 'now').mockReturnValue(T0)
    setTokens('access-1', 'refresh-1')

    jest.spyOn(Date, 'now').mockReturnValue(T0 + 2 * HOUR - 1000)
    expect(getToken()).toBe('access-1')
  })
})
