/**
 * 空状态 / 错误状态。
 * 老人端要求：空状态必须给出「下一步该做什么」的动作按钮，不能只显示一句"暂无数据"。
 */
Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    /** empty | error | network */
    type: { type: String, value: 'empty' },
    title: { type: String, value: '暂无内容' },
    description: { type: String, value: '' },
    actionText: { type: String, value: '' },
  },

  methods: {
    handleAction() {
      this.triggerEvent('action')
    },
  },
})
