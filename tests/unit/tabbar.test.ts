/**
 * 自定义 tabBar 高亮同步的单测。
 * 这个函数被所有 tab 页的 onShow 调用，一旦对「拿不到 tabBar」的场景抛错，
 * 整页 onShow 都会中断——所以容错是它的核心契约。
 */
import { syncTabBar } from '../../miniprogram/utils/tabbar'

describe('syncTabBar', () => {
  it('把下标透传给 tabBar 组件的 syncTabBar', () => {
    const syncTabBarFn = jest.fn()
    const page = { getTabBar: () => ({ syncTabBar: syncTabBarFn }) }

    syncTabBar(page, 2)
    expect(syncTabBarFn).toHaveBeenCalledWith(2)
  })

  it('页面没有 getTabBar 时不报错（非 tab 页也会误调用）', () => {
    expect(() => syncTabBar({}, 0)).not.toThrow()
  })

  it('getTabBar 返回空时不报错（组件尚未挂载）', () => {
    const page = { getTabBar: () => undefined }
    expect(() => syncTabBar(page, 1)).not.toThrow()
  })

  it('tabBar 组件没有 syncTabBar 方法时不报错', () => {
    const page = { getTabBar: () => ({}) }
    expect(() => syncTabBar(page, 1)).not.toThrow()
  })

  it('传入 null / undefined 页面对象时不报错', () => {
    expect(() => syncTabBar(null, 0)).not.toThrow()
    expect(() => syncTabBar(undefined, 0)).not.toThrow()
  })
})
