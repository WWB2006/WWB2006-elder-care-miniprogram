/**
 * 本地存储封装的单元测试。
 * 覆盖点：前缀隔离、默认值、TTL 过期清理、异常降级、按前缀清理。
 */
import {
  StorageKey,
  clearAllStorage,
  getStorage,
  removeStorage,
  setStorage,
} from '../../miniprogram/utils/storage'
import { hasWxStorage, readWxStorage, wxMock } from '../setup/wx'

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('setStorage / getStorage', () => {
  it('写入后能读回同一个值', () => {
    setStorage('profile', { name: '张三' })
    expect(getStorage('profile', null)).toEqual({ name: '张三' })
  })

  it('key 统一加 ec_ 前缀，避免与其他插件数据冲突', () => {
    setStorage(StorageKey.token, 'abc')
    expect(hasWxStorage('ec_token')).toBe(true)
    expect(hasWxStorage('token')).toBe(false)
  })

  it('未写入时返回默认值', () => {
    expect(getStorage('missing', 'fallback')).toBe('fallback')
    expect(getStorage('missing')).toBeUndefined()
  })

  it('存储的是历史遗留的裸值（非包装对象）时返回默认值而不是崩溃', () => {
    wxMock.setStorageSync('ec_legacy', 'raw-string')
    expect(getStorage('legacy', 'fallback')).toBe('fallback')
  })

  it('可以存 false / 0 / 空串这类假值并原样读回', () => {
    setStorage('flag', false)
    setStorage('count', 0)
    setStorage('text', '')
    expect(getStorage('flag', true)).toBe(false)
    expect(getStorage('count', 9)).toBe(0)
    expect(getStorage('text', 'x')).toBe('')
  })
})

describe('TTL 过期', () => {
  it('未过期时正常返回值', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
    setStorage('cache', 'v', { ttl: 60 })
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + 30_000)
    expect(getStorage('cache', 'fallback')).toBe('v')
  })

  it('已过期时返回默认值并顺手删除该 key', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
    setStorage('cache', 'v', { ttl: 60 })
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + 61_000)

    expect(getStorage('cache', 'fallback')).toBe('fallback')
    expect(hasWxStorage('ec_cache')).toBe(false)
  })

  it('不传 ttl 表示永不过期（过期时间戳为 0）', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
    setStorage('perm', 'v')
    const wrapped = readWxStorage('ec_perm') as { e: number }
    expect(wrapped.e).toBe(0)
  })
})

describe('removeStorage / clearAllStorage', () => {
  it('removeStorage 只删除目标 key', () => {
    setStorage('a', 1)
    setStorage('b', 2)
    removeStorage('a')
    expect(hasWxStorage('ec_a')).toBe(false)
    expect(hasWxStorage('ec_b')).toBe(true)
  })

  it('clearAllStorage 只清理 ec_ 前缀，不动其他数据', () => {
    setStorage('a', 1)
    setStorage('b', 2)
    wxMock.setStorageSync('third_party_key', 'keep-me')

    clearAllStorage()

    expect(hasWxStorage('ec_a')).toBe(false)
    expect(hasWxStorage('ec_b')).toBe(false)
    expect(hasWxStorage('third_party_key')).toBe(true)
  })
})

describe('异常降级', () => {
  it('写入抛错时不冒泡到调用方', () => {
    jest.spyOn(wxMock, 'setStorageSync').mockImplementation(() => {
      throw new Error('storage full')
    })
    expect(() => setStorage('a', 1)).not.toThrow()
  })

  it('读取抛错时返回默认值', () => {
    jest.spyOn(wxMock, 'getStorageSync').mockImplementation(() => {
      throw new Error('boom')
    })
    expect(getStorage('a', 'fallback')).toBe('fallback')
  })

  it('清理抛错时不冒泡', () => {
    jest.spyOn(wxMock, 'getStorageInfoSync').mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() => clearAllStorage()).not.toThrow()
  })
})
