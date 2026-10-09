/**
 * 埋点脱敏与批量上报的单元测试。
 *
 * 背景：脱敏是「敏感信息不外泄」的最后一道防线，且此前存在两个真实缺陷：
 * 1. 数组被当成普通对象递归，`[a, b]` 被改写成 `{0: a, 1: b}`，埋点数据失真；
 * 2. 敏感字段大小写不统一，`phoneNumber` / `IDCARD` 能绕过过滤。
 * 这两条都在下面有用例守着，防止回退。
 */
import { __sanitizeForTest, flush, logger, resetLoggerQueue } from '../../miniprogram/utils/logger'
import { wxMock } from '../setup/wx'

const sanitize = __sanitizeForTest

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  resetLoggerQueue()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('sanitize · 敏感字段', () => {
  it('顶层敏感字段被替换为 [FILTERED]', () => {
    expect(sanitize({ phone: '13800008000', password: 'abc' })).toEqual({
      phone: '[FILTERED]',
      password: '[FILTERED]',
    })
  })

  it('字段名大小写变体同样被过滤（此前会绕过）', () => {
    const result = sanitize({ PhoneNumber: '138', IDCARD: '110101', Accesstoken: 't' })
    expect(result).toEqual({
      PhoneNumber: '[FILTERED]',
      IDCARD: '[FILTERED]',
      Accesstoken: '[FILTERED]',
    })
  })

  it('只精确匹配字段名，不误伤业务字段', () => {
    const result = sanitize({ serviceName: '助餐', elderName: '张三', addressBook: 'x' })
    expect(result).toEqual({ serviceName: '助餐', elderName: '张三', addressBook: 'x' })
  })

  it('深层嵌套对象里的敏感字段也会被过滤', () => {
    const result = sanitize({ order: { contact: { mobile: '13800008000', name: '李四' } } })
    expect(result).toEqual({ order: { contact: { mobile: '[FILTERED]', name: '李四' } } })
  })
})

describe('sanitize · 数组穿透（回归用例）', () => {
  it('数组仍是数组，不会被改写成 {0:..,1:..}', () => {
    const result = sanitize({ list: [{ phone: '138' }, { name: 'a' }] })
    expect(Array.isArray((result.list as unknown[])[0]) === false).toBe(true)
    expect(Array.isArray(result.list)).toBe(true)
    expect((result.list as unknown[]).length).toBe(2)
  })

  it('数组元素内的敏感字段被过滤', () => {
    const result = sanitize({ list: [{ phone: '138' }, { name: 'a' }] })
    expect(result.list).toEqual([{ phone: '[FILTERED]' }, { name: 'a' }])
  })

  it('嵌套数组（数组套数组）逐层处理', () => {
    const result = sanitize({ matrix: [[{ token: 't' }], [{ ok: 1 }]] })
    expect(result.matrix).toEqual([[{ token: '[FILTERED]' }], [{ ok: 1 }]])
  })

  it('纯标量数组保持原样', () => {
    expect(sanitize({ ids: [1, 2, 3] })).toEqual({ ids: [1, 2, 3] })
  })
})

describe('sanitize · 深度与类型兜底', () => {
  it('超过深度上限返回 [DEEP]，避免异常深对象把日志打爆', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }
    const result = sanitize(deep) as Record<string, unknown>
    expect(JSON.stringify(result)).toContain('[DEEP]')
  })

  it('保留原始标量类型（number / boolean / null / undefined）', () => {
    expect(sanitize({ n: 0, b: false, z: null, u: undefined })).toEqual({
      n: 0,
      b: false,
      z: null,
      u: undefined,
    })
  })

  it('不修改入参对象（纯函数）', () => {
    const input = { phone: '13800008000' }
    sanitize(input)
    expect(input.phone).toBe('13800008000')
  })
})

describe('logger.event · 批量上报', () => {
  it('单条埋点只入队，不立即上报', () => {
    logger.event('page_view', { page: 'home' })
    expect(wxMock.reportEvent).not.toHaveBeenCalled()
  })

  it('flush 时一次性上报整批，且上报内容已脱敏', () => {
    logger.event('submit', { phone: '13800008000', itemId: 'A1' })
    flush()

    expect(wxMock.reportEvent).toHaveBeenCalledTimes(1)
    const [eventName, payload] = wxMock.reportEvent.mock.calls[0] as [string, { data: string }]
    expect(eventName).toBe('track_batch')

    const batch = JSON.parse(payload.data) as Array<{ event: string; payload: Record<string, unknown> }>
    expect(batch).toHaveLength(1)
    expect(batch[0].event).toBe('submit')
    expect(batch[0].payload.phone).toBe('[FILTERED]')
    expect(batch[0].payload.itemId).toBe('A1')
    // 明文手机号绝不能出现在上报内容里
    expect(payload.data).not.toContain('13800008000')
  })

  it('队列达到上限（20 条）自动上报', () => {
    for (let i = 0; i < 20; i += 1) logger.event('e', { i })
    expect(wxMock.reportEvent).toHaveBeenCalledTimes(1)
  })

  it('空队列 flush 不产生请求', () => {
    flush()
    expect(wxMock.reportEvent).not.toHaveBeenCalled()
  })

  it('到达延迟时间后自动上报', () => {
    jest.useFakeTimers()
    logger.event('page_view', { page: 'home' })
    expect(wxMock.reportEvent).not.toHaveBeenCalled()

    jest.advanceTimersByTime(10_000)
    expect(wxMock.reportEvent).toHaveBeenCalledTimes(1)
  })

  it('上报接口抛错时静默降级，不影响主流程', () => {
    wxMock.reportEvent.mockImplementationOnce(() => {
      throw new Error('reportEvent not supported')
    })
    logger.event('page_view', { page: 'home' })
    expect(() => flush()).not.toThrow()
  })

  it('上报后队列被清空，再次 flush 不重复上报', () => {
    logger.event('a', {})
    flush()
    flush()
    expect(wxMock.reportEvent).toHaveBeenCalledTimes(1)
  })
})

describe('logger.error · 实时日志', () => {
  it('error 上报到实时日志前先脱敏', () => {
    const errorSpy = jest.fn()
    jest.spyOn(wxMock, 'getRealtimeLogManager').mockReturnValue({ error: errorSpy })

    logger.error('pay_failed', { phone: '13800008000' })
    expect(errorSpy).toHaveBeenCalledWith('pay_failed', { phone: '[FILTERED]' })
  })

  it('实时日志不可用时不抛异常', () => {
    jest.spyOn(wxMock, 'getRealtimeLogManager').mockImplementation(() => {
      throw new Error('unsupported')
    })
    expect(() => logger.error('x', { a: 1 })).not.toThrow()
  })
})
