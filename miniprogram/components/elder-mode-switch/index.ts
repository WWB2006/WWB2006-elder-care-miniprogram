/**
 * 关怀模式（适老模式）开关。
 *
 * 职责边界：组件只负责「切换 + 持久化 + 广播」，不做任何业务判断。
 * 三处状态必须同步，否则会出现「开关显示已开启，但页面字号没变」：
 *   1. app.globalData.elderMode（兼容旧代码读取）；
 *   2. appStore.elderMode（驱动视图 class）；
 *   3. StorageKey.elderMode（下次冷启动恢复用户显式选择）。
 */
import { appStore } from '../../store/app'
import { StorageKey, getStorage, setStorage } from '../../utils/storage'
import { BusEvent, bus } from '../../utils/event-bus'

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    /** 开关右侧说明文案 */
    desc: { type: String, value: '放大字号、简化页面，看得更清楚' },
    disabled: { type: Boolean, value: false },
  },

  data: {
    elderMode: false,
  },

  lifetimes: {
    attached() {
      this.setData({ elderMode: this.readCurrent() })
    },
  },

  methods: {
    readCurrent(): boolean {
      const app = getApp<IElderAppOption>()
      if (app?.globalData) return app.globalData.elderMode
      const saved = getStorage<boolean | null>(StorageKey.elderMode, null)
      return saved ?? appStore.getState().elderMode
    },

    handleToggle() {
      if (this.properties.disabled) return
      const next = !this.data.elderMode
      this.setData({ elderMode: next })
      setStorage(StorageKey.elderMode, next)

      const app = getApp<IElderAppOption>()
      app?.syncElderMode?.(next)
      // 兜底：若 app 尚未就绪（极早期渲染），至少保证 store 与视图一致
      appStore.setElderMode(next)

      bus.emit(BusEvent.elderModeChanged, next)
      this.triggerEvent('change', { elderMode: next })
    },
  },
})

export {}
