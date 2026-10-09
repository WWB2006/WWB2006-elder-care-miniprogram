/**
 * 自定义导航栏。
 * 用途：老人端需要更大的返回热区，且首页要展示角色与老人姓名，原生导航栏无法承载。
 * 注意：使用本组件时页面 app.json 需配置 navigationStyle: custom（或页面级 json 单独配置）。
 */
Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    showBack: { type: Boolean, value: true },
    /** 是否使用主色背景（默认白底黑字，主色用于活动页） */
    primary: { type: Boolean, value: false },
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
  },

  lifetimes: {
    attached() {
      const info = wx.getSystemInfoSync()
      const statusBarHeight = info.statusBarHeight ?? 20
      // 胶囊按钮位置反推导航栏高度，兼容全面屏与刘海屏
      const menu = wx.getMenuButtonBoundingClientRect()
      const navBarHeight = menu ? (menu.top - statusBarHeight) * 2 + menu.height : 44
      this.setData({ statusBarHeight, navBarHeight })
    },
  },

  methods: {
    handleBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) wx.navigateBack({ delta: 1 })
      else wx.switchTab({ url: '/pages/home/index' })
      this.triggerEvent('back')
    },
  },
})
