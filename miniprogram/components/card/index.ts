/**
 * 通用卡片容器。
 * 为什么单独抽组件：页面里 `class="card"` 只是样式类，无法承载「标题 + 右侧操作 + 点击态」这些结构，
 * 抽成组件后各端页面写法统一，也便于后续给老人端统一加大内边距。
 */
Component({
  options: {
    addGlobalClass: true,
    multipleSlots: true,
  },

  properties: {
    title: { type: String, value: '' },
    /** 右上角操作文案，如「全部订单」 */
    extra: { type: String, value: '' },
    /** 去掉阴影改用描边（用于信息密度较高的管理端） */
    flat: { type: Boolean, value: false },
    /** 整卡可点击，点击时触发 tap 事件 */
    clickable: { type: Boolean, value: false },
    /** 是否使用主色渐变背景（用于引导卡片） */
    primary: { type: Boolean, value: false },
  },

  methods: {
    handleTap() {
      if (!this.properties.clickable) return
      this.triggerEvent('tap')
    },

    handleExtra() {
      this.triggerEvent('extra')
    },
  },
})
