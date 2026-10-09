/**
 * 异常复核 —— 占位页面，待按 docs/设计方案.md 第 6 节实现。
 * 落地清单：
 * 1. 页面参数解析与鉴权（需要登录的操作用 utils/auth.ts 的 ensureLogin）；
 * 2. 首屏骨架屏 + 空态 / 错误重试（使用 components/empty-state）；
 * 3. 适老模式适配（根节点 class 绑定 elder-mode）；
 * 4. 关键行为埋点（utils/logger.ts 的 logger.event）。
 */

Page({
  data: {
    title: '异常复核',
    loading: false,
  },

  onLoad() {
    void this.loadData()
  },

  async loadData() {
    // TODO: 调用对应 api 域的接口；失败时展示 empty-state 并支持重试
    this.setData({ loading: false })
  },
})
