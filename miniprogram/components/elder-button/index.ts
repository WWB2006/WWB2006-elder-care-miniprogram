/**
 * 适老化大按钮。
 * 与原生 button 的差异：
 * 1. 默认高度 112rpx（适老模式 128rpx），字号大、对比度高；
 * 2. 支持长按触发（SOS / 支付确认等危险操作，长按 3 秒防误触）；
 * 3. 长按过程有进度反馈，且进度环 + 文字双重提示，不依赖颜色。
 *
 * 防误触细节：长按必须能被「手指划走」和「系统打断（来电/切后台）」取消，
 * 否则老人按住后手指滑出按钮，仍然会触发 SOS —— 这是真实发生过的误报来源。
 */
/** 定时器句柄挂在实例上，用 WeakMap 保存，避免污染 data 触发无意义渲染 */
const pressTimers = new WeakMap<object, number>()
/** 记录按下起点，用于判断手指是否划走 */
const pressOrigins = new WeakMap<object, { x: number; y: number }>()

/** 手指移动超过该距离（px）视为「划走」，取消长按 */
const MOVE_CANCEL_PX = 20

Component({
  options: {
    multipleSlots: false,
    addGlobalClass: true,
  },

  properties: {
    text: { type: String, value: '' },
    /** primary | ghost | danger | disabled */
    type: { type: String, value: 'primary' },
    /** 是否启用长按触发（毫秒），0 表示普通点击 */
    longPressMs: { type: Number, value: 0 },
    loading: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    /** 长按提示文案，如「长按 3 秒呼叫」 */
    longPressHint: { type: String, value: '' },
    /** 无障碍朗读文案；不传时回落到 text */
    ariaLabel: { type: String, value: '' },
  },

  data: {
    pressing: false,
    progress: 0,
  },

  lifetimes: {
    detached() {
      this.clearTimer()
    },
  },

  methods: {
    clearTimer() {
      const timerId = pressTimers.get(this)
      if (timerId) {
        clearInterval(timerId)
        pressTimers.delete(this)
      }
      pressOrigins.delete(this)
    },

    handleTap() {
      const { disabled, loading, longPressMs } = this.properties
      if (disabled || loading || longPressMs > 0) return
      this.triggerEvent('tap')
    },

    handleTouchStart(event: WechatMiniprogram.TouchEvent) {
      const { disabled, loading, longPressMs } = this.properties
      if (disabled || loading || longPressMs <= 0) return

      const touch = event.touches?.[0]
      if (touch) pressOrigins.set(this, { x: touch.clientX, y: touch.clientY })

      wx.vibrateShort({ type: 'medium' })
      const stepMs = 80
      const step = (stepMs / longPressMs) * 100
      let progress = 0
      this.setData({ pressing: true, progress: 0 })

      const timerId = setInterval(() => {
        progress += step
        if (progress >= 100) {
          this.clearTimer()
          this.setData({ pressing: false, progress: 100 })
          wx.vibrateLong()
          this.triggerEvent('longpress')
          return
        }
        this.setData({ progress: Math.round(progress) })
      }, stepMs) as unknown as number
      pressTimers.set(this, timerId)
    },

    /** 手指划出按钮：立即取消，避免误触发 */
    handleTouchMove(event: WechatMiniprogram.TouchEvent) {
      if (!pressTimers.get(this)) return
      const origin = pressOrigins.get(this)
      const touch = event.touches?.[0]
      if (!origin || !touch) return
      const moved = Math.abs(touch.clientX - origin.x) + Math.abs(touch.clientY - origin.y)
      if (moved > MOVE_CANCEL_PX) this.cancelPress()
    },

    handleTouchEnd() {
      if (!this.properties.longPressMs) return
      this.cancelPress()
    },

    cancelPress() {
      this.clearTimer()
      this.setData({ pressing: false, progress: 0 })
    },
  },
})

// 显式声明为 ES Module：否则文件内顶层 const 会泄漏到全局作用域，与其它组件的同名常量冲突
export {}
