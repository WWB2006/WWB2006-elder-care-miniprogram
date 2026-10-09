/**
 * 全屏加载遮罩。
 * 与 wx.showLoading 的分工：
 * - 页面级「首屏加载」用骨架屏（styles/common.wxss 的 .skeleton）；
 * - 阻断式「提交中」用本组件，好处是可以自定义文案（老人端需要更明确的说明，而不是干巴巴的"加载中"）。
 */
Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    visible: { type: Boolean, value: false },
    text: { type: String, value: '处理中，请稍候' },
    /** 是否拦截点击，防止重复提交；默认拦截 */
    mask: { type: Boolean, value: true },
  },

  methods: {
    /** 拦截穿透点击 */
    noop() {
      // 故意留空：仅用于 catchtouchmove / catchtap 阻止滚动与穿透
    },
  },
})
