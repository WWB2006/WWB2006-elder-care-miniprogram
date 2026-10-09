/**
 * 应用态 store 与页面连接器的单测。
 *
 * 重点是 `pendingServiceCategory`：`wx.switchTab` 不支持携带 query，
 * 首页点分类跳「服务」tab 时参数会丢失（早期实现正是这样丢的）。
 * 用一次性状态传递 + 消费即清空来规避，这里把该契约固定下来。
 */
import { Store, connectStore } from '../../miniprogram/store/base'
import { appStore } from '../../miniprogram/store/app'
import { appStore as appStoreFromIndex, userStore, Store as StoreFromIndex, connectStore as connectFromIndex } from '../../miniprogram/store/index'

/** 每个用例前把 appStore 复位到初始态（它是模块级单例） */
function resetAppStore(): void {
  appStore.setNetwork({ isConnected: true, networkType: 'unknown' })
  appStore.setElderMode(false)
  appStore.setSafeAreaBottom(0)
  appStore.setServiceCategory('')
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  resetAppStore()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('appStore · 网络状态', () => {
  it('setNetwork 同时更新连接状态与网络类型', () => {
    appStore.setNetwork({ isConnected: false, networkType: 'none' })
    expect(appStore.getState().networkConnected).toBe(false)
    expect(appStore.getState().networkType).toBe('none')
  })
})

describe('appStore · 冷启动耗时', () => {
  it('首次标记写入时间戳，重复标记不覆盖（否则耗时统计永远接近 0）', () => {
    // coldStartReadyAt 是「一次性」字段，没有 reset 入口，所以两条断言必须放在同一个用例里
    const now = jest.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    appStore.markColdStartReady()
    expect(appStore.getState().coldStartReadyAt).toBe(1000)

    now.mockReturnValue(9999)
    appStore.markColdStartReady()
    expect(appStore.getState().coldStartReadyAt).toBe(1000)
  })
})

describe('appStore · 适老模式与安全区', () => {
  it('setElderMode 切换适老模式', () => {
    appStore.setElderMode(true)
    expect(appStore.getState().elderMode).toBe(true)
    appStore.setElderMode(false)
    expect(appStore.getState().elderMode).toBe(false)
  })

  it('setSafeAreaBottom 写入安全区高度', () => {
    appStore.setSafeAreaBottom(34)
    expect(appStore.getState().safeAreaBottom).toBe(34)
  })
})

describe('appStore · 跨 tab 传参（pendingServiceCategory）', () => {
  it('写入后可以被消费一次', () => {
    appStore.setServiceCategory('medical')
    expect(appStore.consumeServiceCategory()).toBe('medical')
  })

  it('消费后立即清空，避免下次进服务页又自动筛选（回归用例）', () => {
    appStore.setServiceCategory('medical')
    appStore.consumeServiceCategory()

    expect(appStore.getState().pendingServiceCategory).toBe('')
    expect(appStore.consumeServiceCategory()).toBe('')
  })

  it('没有待消费分类时返回空串', () => {
    expect(appStore.consumeServiceCategory()).toBe('')
  })

  it('再次写入会覆盖上一次的值', () => {
    appStore.setServiceCategory('meal')
    appStore.setServiceCategory('bath')
    expect(appStore.consumeServiceCategory()).toBe('bath')
  })
})

describe('connectStore', () => {
  it('绑定后立即用当前 state 初始化页面 data', () => {
    const page = { setData: jest.fn() }
    connectStore(page, appStore, (s) => ({ online: s.networkConnected }))

    expect(page.setData).toHaveBeenCalledWith({ online: true })
  })

  it('state 变化时同步到页面 data', () => {
    const page = { setData: jest.fn() }
    connectStore(page, appStore, (s) => ({ elder: s.elderMode }))

    appStore.setElderMode(true)
    expect(page.setData).toHaveBeenLastCalledWith({ elder: true })
  })

  it('返回的退订函数能解除绑定（页面 onUnload 必须调用，否则内存泄漏）', () => {
    const page = { setData: jest.fn() }
    const unbind = connectStore(page, appStore, (s) => ({ elder: s.elderMode }))
    page.setData.mockClear()

    unbind()
    appStore.setElderMode(true)

    expect(page.setData).not.toHaveBeenCalled()
  })

  it('setData 抛错时不影响其它监听器', () => {
    const broken = {
      setData: jest.fn(() => {
        throw new Error('setData failed')
      }),
    }
    const good = { setData: jest.fn() }
    connectStore(broken, appStore, (s) => ({ elder: s.elderMode }))
    connectStore(good, appStore, (s) => ({ elder: s.elderMode }))
    good.setData.mockClear()

    expect(() => appStore.setElderMode(true)).not.toThrow()
    expect(good.setData).toHaveBeenCalledWith({ elder: true })
  })

  it('selector 只暴露页面关心的字段，不整份 state 灌进 data', () => {
    const page = { setData: jest.fn() }
    connectStore(page, appStore, (s) => ({ elder: s.elderMode }))

    const payload = page.setData.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['elder'])
  })
})

describe('store/index 出口', () => {
  it('统一导出 appStore / userStore / Store / connectStore，页面可按需引入', () => {
    expect(appStoreFromIndex).toBe(appStore)
    expect(userStore).toBeDefined()
    expect(StoreFromIndex).toBe(Store)
    expect(connectFromIndex).toBe(connectStore)
  })
})
