/**
 * 自定义 tabBar。
 * 为什么不用原生：原生 tabBar 无法在适老模式下放大字号与图标，
 * 也无法体现"角色不同、首页不同"的信息架构。
 * 使用注意：
 * 1. app.json 中 tabBar.custom = true；
 * 2. 每个 tab 页面在 onShow 中调用 syncTabBar(index)，否则高亮不会更新；
 * 3. 只有 app.json tabBar.list 中的页面才能用 wx.switchTab 跳转。
 */
interface ITabItem {
  index: number
  pagePath: string
  text: string
  icon: string
}

const TABS: ITabItem[] = [
  { index: 0, pagePath: '/pages/home/index', text: '首页', icon: 'home' },
  { index: 1, pagePath: '/pages/service/index', text: '服务', icon: 'service' },
  { index: 2, pagePath: '/pages/order/index', text: '订单', icon: 'order' },
  { index: 3, pagePath: '/pages/mine/index', text: '我的', icon: 'mine' },
]

Component({
  data: {
    selected: 0,
    list: TABS,
  },

  methods: {
    /** 页面 onShow 调用：this.getTabBar()?.syncTabBar(0) */
    syncTabBar(index: number) {
      if (this.data.selected !== index) this.setData({ selected: index })
    },

    handleSwitch(event: WechatMiniprogram.TouchEvent) {
      const { path, index } = event.currentTarget.dataset as { path: string; index: number }
      if (index === this.data.selected) return
      this.setData({ selected: index })
      wx.switchTab({ url: path })
    },
  },
})

// 显式声明为 ES Module：否则文件内顶层 const 会泄漏到全局作用域，与其它组件的同名常量冲突
export {}
