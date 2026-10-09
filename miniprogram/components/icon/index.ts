/**
 * 图标封装。
 * 设计约束（docs/设计方案.md 第 6.6 节）：图标必须配文字，禁止纯图标入口。
 * 因此本组件只负责「统一尺寸与语义色」，不负责承载可点击入口。
 *
 * 兜底策略：图标资源由 `assets/icons/` 提供，缺失时（当前脚手架即为此状态）
 * 自动回落到 `symbol` 文案，避免出现一排破图。
 */
Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    /** assets/icons 下的文件名（不含扩展名） */
    name: { type: String, value: '' },
    /** 图标缺失时的文字兜底，如「餐」「医」 */
    symbol: { type: String, value: '' },
    /** sm | md | lg */
    size: { type: String, value: 'md' },
    /** default | primary | danger | success | warning | inverse */
    tone: { type: String, value: 'default' },
  },

  data: {
    loadFailed: false,
  },

  observers: {
    name() {
      // 换图标时重置兜底状态，否则从坏图切到好图仍显示文字
      if (this.data.loadFailed) this.setData({ loadFailed: false })
    },
  },

  methods: {
    handleError() {
      this.setData({ loadFailed: true })
    },
  },
})
