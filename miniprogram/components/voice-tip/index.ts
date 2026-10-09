/**
 * 语音播报入口。
 * 组件本身不接语音能力（ASR/TTS 需在小程序后台配置同声传译插件），
 * 只负责「大按钮 + 大字文案」的交互外壳，把播报动作抛给页面，
 * 这样插件未申请下来时页面可以安全降级为纯文字提示。
 */
Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    /** 要播报 / 提示的文案 */
    text: { type: String, value: '' },
    /** 按钮文案 */
    actionText: { type: String, value: '播报' },
    disabled: { type: Boolean, value: false },
  },

  methods: {
    handleTap() {
      if (this.properties.disabled) return
      this.triggerEvent('speak', { text: this.properties.text })
    },
  },
})
