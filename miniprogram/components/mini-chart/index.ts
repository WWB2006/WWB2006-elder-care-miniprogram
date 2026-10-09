/**
 * 轻量趋势图（健康指标）。
 *
 * 为什么不用 canvas / 图表库：
 * 1. 健康趋势每类指标每周 ≤ 30 个点，数据量极小，引入 300KB+ 图表库不划算（见设计方案 3.2 / 6.3）；
 * 2. canvas 组件在小程序里需要唯一 canvas-id，列表内多个图表容易串号，且层级（原生组件）会盖住弹窗；
 * 3. 用 view + 百分比高度画柱状图，无原生组件层级问题、可随适老模式自动放大、也便于截图验收。
 */
interface IPoint {
  at: string
  value: number
}

interface IBar extends IPoint {
  /** 柱高百分比（10–100，保证最小值也可见） */
  percent: number
  label: string
}

const MAX_BARS = 30

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    points: { type: Array, value: [] },
    /** 指标单位，如 mmHg、mmol/L */
    unit: { type: String, value: '' },
    /** 图表高度（rpx） */
    height: { type: Number, value: 240 },
    /** primary | danger | success | warning */
    tone: { type: String, value: 'primary' },
    /** 是否显示最高/最低值标注 */
    showAxis: { type: Boolean, value: true },
  },

  data: {
    bars: [] as IBar[],
    hasData: false,
    maxText: '',
    minText: '',
    latestText: '',
  },

  observers: {
    points() {
      this.buildBars()
    },
  },

  lifetimes: {
    attached() {
      this.buildBars()
    },
  },

  methods: {
    buildBars() {
      const raw = (this.properties.points ?? []) as IPoint[]
      const points = raw
        .filter((p) => p && Number.isFinite(Number(p.value)))
        .slice(-MAX_BARS)

      if (!points.length) {
        this.setData({ bars: [], hasData: false, maxText: '', minText: '', latestText: '' })
        return
      }

      const values = points.map((p) => Number(p.value))
      const max = Math.max(...values)
      const min = Math.min(...values)
      const range = max - min || 1
      const unit = this.properties.unit

      const bars: IBar[] = points.map((p) => {
        const value = Number(p.value)
        // 最低值也保留 10% 高度，否则柱形会「消失」，老人会以为没数据
        const percent = Math.round(10 + ((value - min) / range) * 90)
        return { at: p.at, value, percent, label: this.formatAxisLabel(p.at) }
      })

      this.setData({
        bars,
        hasData: true,
        maxText: `${max}${unit}`,
        minText: `${min}${unit}`,
        latestText: `${values[values.length - 1]}${unit}`,
      })
    },

    /** 只取「月-日」部分，避免横轴过长把柱形挤扁 */
    formatAxisLabel(at: string): string {
      if (!at) return ''
      const matched = at.match(/(\d{1,2})[-/](\d{1,2})/)
      if (matched) return `${Number(matched[1])}/${Number(matched[2])}`
      return at.slice(-5)
    },
  },
})

export {}
