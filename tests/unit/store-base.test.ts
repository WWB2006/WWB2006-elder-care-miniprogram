/**
 * 轻量 Store 的单元测试。
 * 重点：订阅/退订、变更通知携带 patch、单个监听器抛错不影响其它监听器。
 */
import { Store } from '../../miniprogram/store/base'

interface ITestState {
  count: number
  name: string
}

class TestStore extends Store<ITestState> {
  constructor() {
    super({ count: 0, name: 'init' })
  }

  inc(): void {
    this.setState({ count: this.getState().count + 1 })
  }

  rename(name: string): void {
    this.setState({ name })
  }
}

describe('Store', () => {
  it('构造后即可读到初始状态', () => {
    const store = new TestStore()
    expect(store.getState()).toEqual({ count: 0, name: 'init' })
  })

  it('setState 后通知监听器并携带 patch', () => {
    const store = new TestStore()
    const listener = jest.fn()
    store.subscribe(listener)

    store.inc()

    expect(store.getState().count).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ count: 1, name: 'init' }, { count: 1 })
  })

  it('退订后不再收到通知', () => {
    const store = new TestStore()
    const listener = jest.fn()
    const unbind = store.subscribe(listener)

    store.inc()
    unbind()
    store.inc()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('单个监听器抛错不影响其它监听器', () => {
    const store = new TestStore()
    const bad = jest.fn(() => {
      throw new Error('boom')
    })
    const good = jest.fn()
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    store.subscribe(bad)
    store.subscribe(good)
    store.rename('next')

    expect(bad).toHaveBeenCalledTimes(1)
    expect(good).toHaveBeenCalledTimes(1)
    expect(store.getState().name).toBe('next')
    spy.mockRestore()
  })

  it('返回的是可变对象的浅拷贝，外部改动初始对象不影响 store', () => {
    const initial = { count: 0, name: 'init' }
    const store = new Store<ITestState>(initial)
    initial.count = 99
    expect(store.getState().count).toBe(0)
  })
})
