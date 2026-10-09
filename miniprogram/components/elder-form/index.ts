/**
 * 适老表单字段容器。
 *
 * 为什么做成「容器 + 插槽」而不是直接封装 input：
 * 小程序里表单控件种类多（input / textarea / picker / radio / 自定义选择器），
 * 逐个封装会得到一个巨大的组件；把「标签 / 必填标记 / 内联错误 / 提示」这些
 * 真正重复的部分抽成容器，控件本身用插槽传入，既统一了校验展示，又保留了灵活性。
 *
 * 老人端要求（设计方案 6.6）：错误必须内联展示在字段下方，禁止只弹 toast。
 */
Component({
  options: {
    addGlobalClass: true,
    multipleSlots: true,
  },

  properties: {
    label: { type: String, value: '' },
    required: { type: Boolean, value: false },
    /** 校验错误文案；非空时字段进入错误态 */
    error: { type: String, value: '' },
    /** 常驻提示（如「请填写老人身份证上的姓名」） */
    hint: { type: String, value: '' },
    /** 标签与控件是否纵向排列（老人端建议纵向，横向容易挤） */
    vertical: { type: Boolean, value: true },
  },

  methods: {
    /** 供页面在提交时聚焦错误字段（配合 scroll-into-view 使用） */
    focus() {
      this.triggerEvent('focus')
    },
  },
})

export {}
