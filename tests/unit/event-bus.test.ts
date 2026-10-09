/**
 * 事件总线单元测试。
 * 关键约束：单个监听器抛错不能阻断其他监听器——登录失效广播里任何一个页面
 * 处理异常，都不该让其他页面收不到通知。
 */
import { BusEvent, bus } from '../../miniprogram/utils/event-bus'

const EVENT = 'test:event'

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  bus.off(EVENT)
  jest.restoreAllMocks()
})

describe('bus.on / emit', () => {
  it('emit 能把 payload 传给监听器', () => {
    const handler = jest.fn()
    bus.on<{ id: number }>(EVENT, handler)

    bus.emit(EVENT, { id: 7 })
    expect(handler).toHaveBeenCalledWith({ id: 7 })
  })

  it('支持多个监听器，按注册顺序依次触发', () => {
    const order: string[] = []
    bus.on(EVENT, () => order.push('a'))
    bus.on(EVENT, () => order.push('b'))

    bus.emit(EVENT)
    expect(order).toEqual(['a', 'b'])
  })

  it('同一个函数重复注册只触发一次（Set 去重）', () => {
    const handler = jest.fn()
    bus.on(EVENT, handler)
    bus.on(EVENT, handler)

    bus.emit(EVENT)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('没有监听器时 emit 不报错', () => {
    expect(() => bus.emit('no:listener')).not.toThrow()
  })

  it('不带 payload 也能触发', () => {
    const handler = jest.fn()
    bus.on(EVENT, handler)
    bus.emit(EVENT)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('bus.off', () => {
  it('指定 handler 时只移除该监听器', () => {
    const a = jest.fn()
    const b = jest.fn()
    bus.on(EVENT, a)
    bus.on(EVENT, b)

    bus.off(EVENT, a)
    bus.emit(EVENT)

    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('不传 handler 时清空该事件的全部监听器', () => {
    const a = jest.fn()
    bus.on(EVENT, a)
    bus.off(EVENT)
    bus.emit(EVENT)
    expect(a).not.toHaveBeenCalled()
  })

  it('移除不存在的监听器不报错', () => {
    expect(() => bus.off('never:registered')).not.toThrow()
  })
})

describe('异常隔离', () => {
  it('一个监听器抛错不影响后续监听器', () => {
    const bad = jest.fn(() => {
      throw new Error('boom')
    })
    const good = jest.fn()
    bus.on(EVENT, bad)
    bus.on(EVENT, good)

    expect(() => bus.emit(EVENT)).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })
})

describe('BusEvent 常量', () => {
  it('事件名集中定义且互不重复', () => {
    const names = Object.values(BusEvent)
    expect(new Set(names).size).toBe(names.length)
    names.forEach((name) => expect(name).toContain(':'))
  })
})
