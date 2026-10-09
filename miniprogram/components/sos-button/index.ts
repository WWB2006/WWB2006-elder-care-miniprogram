/**
 * SOS 专用按钮。
 * 这是整个系统里唯一「绝不能失败」的交互，设计目标是**尽最大可能把呼救信号送出去**，
 * 而不是功能丰富。要点（见 docs/设计方案.md 第 6.1 节）：
 * 1. 长按触发而非单击——老人误触率高，长按 + 震动 + 进度反馈把误触降到可接受范围；
 * 2. 不做二次确认弹窗——紧急场景下多一次点击就多一分风险，用「松手即取消」替代；
 * 3. 触发后进入冷却期，避免重复触发刷屏（后端 60 秒内也会合并为同一事件）；
 * 4. 状态用「文字 + 进度百分比」双重表达，不依赖颜色。
 */
const timers = new WeakMap<object, number>()
const cooldownTimers = new WeakMap<object, number>()
const origins = new WeakMap<object, { x: number; y: number }>()

/** 手指移动超过该距离（px）视为划走，取消长按 */
const MOVE_CANCEL_PX = 24

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    /** 长按时长（毫秒），默认 3 秒 */
    longPressMs: { type: Number, value: 3000 },
    /** 触发后的冷却时长（毫秒），期间不可再次触发 */
    cooldownMs: { type: Number, value: 5000 },
    disabled: { type: Boolean, value: false },
    /** 默认文案 */
    text: { type: String, value: '按住呼叫' },
    /** 长按中的提示文案 */
    pressingText: { type: String, value: '正在呼叫，松手取消' },
    /** 已触发文案 */
    triggeredText: { type: String, value: '呼叫已发出' },
  },

  data: {
    pressing: false,
    progress: 0,
    triggered: false,
    cooldownLeft: 0,
  },

  lifetimes: {
    detached() {
      this.clearAllTimers()
    },
  },

  methods: {
    clearAllTimers() {
      const pressTimer = timers.get(this)
      if (pressTimer) {
        clearInterval(pressTimer)
        timers.delete(this)
      }
      const cooldownTimer = cooldownTimers.get(this)
      if (cooldownTimer) {
        clearInterval(cooldownTimer)
        cooldownTimers.delete(this)
      }
      origins.delete(this)
    },

    /** 当前是否处于「不可触发」状态 */
    isBlocked(): boolean {
      return this.properties.disabled || this.data.triggered || this.data.pressing
    },

    handleTouchStart(event: WechatMiniprogram.TouchEvent) {
      if (this.isBlocked()) return
      const touch = event.touches?.[0]
      if (touch) origins.set(this, { x: touch.clientX, y: touch.clientY })

      const { longPressMs } = this.properties
      wx.vibrateShort({ type: 'heavy' })
      this.setData({ pressing: true, progress: 0 })

      const stepMs = 80
      const step = (stepMs / longPressMs) * 100
      let progress = 0
      const timerId = setInterval(() => {
        progress += step
        if (progress >= 100) {
          this.clearPressTimer()
          this.setData({ pressing: false, progress: 100 })
          this.fire()
          return
        }
        this.setData({ progress: Math.round(progress) })
      }, stepMs) as unknown as number
      timers.set(this, timerId)
    },

    handleTouchMove(event: WechatMiniprogram.TouchEvent) {
      if (!timers.get(this)) return
      const origin = origins.get(this)
      const touch = event.touches?.[0]
      if (!origin || !touch) return
      const moved = Math.abs(touch.clientX - origin.x) + Math.abs(touch.clientY - origin.y)
      if (moved > MOVE_CANCEL_PX) this.cancelPress()
    },

    handleTouchEnd() {
      if (!timers.get(this)) return
      this.cancelPress()
      this.triggerEvent('cancel')
    },

    clearPressTimer() {
      const timerId = timers.get(this)
      if (timerId) {
        clearInterval(timerId)
        timers.delete(this)
      }
      origins.delete(this)
    },

    cancelPress() {
      this.clearPressTimer()
      this.setData({ pressing: false, progress: 0 })
    },

    /** 长按完成：震动反馈 + 抛事件（真正的上报由页面负责，组件不发请求） */
    fire() {
      wx.vibrateLong()
      this.setData({ triggered: true })
      this.triggerEvent('trigger')
      this.startCooldown()
    },

    startCooldown() {
      const total = Math.max(0, this.properties.cooldownMs)
      if (total <= 0) {
        this.setData({ triggered: false })
        return
      }
      const seconds = Math.ceil(total / 1000)
      let left = seconds
      this.setData({ cooldownLeft: left })
      const timerId = setInterval(() => {
        left -= 1
        if (left <= 0) {
          const id = cooldownTimers.get(this)
          if (id) clearInterval(id)
          cooldownTimers.delete(this)
          this.setData({ triggered: false, cooldownLeft: 0, progress: 0 })
          return
        }
        this.setData({ cooldownLeft: left })
      }, 1000) as unknown as number
      cooldownTimers.set(this, timerId)
    },

    /** 由页面在 SOS 上报完成后调用，可提前结束冷却（例如已确认受理） */
    reset() {
      this.clearAllTimers()
      this.setData({ pressing: false, progress: 0, triggered: false, cooldownLeft: 0 })
    },
  },
})

// 显式声明为 ES Module：否则文件内顶层 const 会泄漏到全局作用域，与其它组件的同名常量冲突
export {}
