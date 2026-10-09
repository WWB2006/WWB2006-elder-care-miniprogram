/**
 * 自定义 tabBar 的高亮同步。
 * 自定义 tabBar 是独立组件，页面 onShow 时必须主动告知当前选中项，
 * 否则从分包页返回后会出现"高亮还停在上一页"的问题。
 */
interface ITabBarLike {
  syncTabBar?: (index: number) => void
}

interface IPageWithTabBar {
  getTabBar?: () => ITabBarLike | undefined
}

export function syncTabBar(page: unknown, index: number): void {
  // 容错：页面对象可能为 null（例如在页面创建前误调用），不能让 onShow 整段中断
  if (!page || typeof page !== 'object') return
  const holder = page as IPageWithTabBar
  holder.getTabBar?.()?.syncTabBar?.(index)
}
