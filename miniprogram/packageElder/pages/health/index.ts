/**
 * 健康档案。
 * 功能：体征录入（血压 / 血糖 / 心率）、异常提示、最近记录与趋势图。
 *
 * 合规红线（见 docs/设计方案.md 6.3 / 9.1）：
 * - 健康数据属敏感个人信息，录入前必须单独同意；
 * - 页面内**不得出现诊断、处方、用药建议类表述**，一律用「建议就医 / 联系医生」的中性文案；
 * - 阈值判断只做提示，不做医学结论。
 */
import { getVitalList, recordVital } from '../../../api/health'
import type { IVitalSign } from '../../../api/types'
import { PAGE_SIZE } from '../../../config/constant'
import { bloodPressureLevel, formatDate } from '../../../utils/format'
import { logger } from '../../../utils/logger'
import { requirePrivacy } from '../../../utils/privacy'
import { userStore } from '../../../store/user'
import { elderModeBehavior } from '../../../behaviors/elder-mode'

type VitalType = IVitalSign['type']

interface IVitalTypeTab {
  key: VitalType
  label: string
  unit: string
}

interface IVitalVM extends IVitalSign {
  measuredText: string
  valueText: string
  levelText: string
  levelTone: string
}

const TYPE_TABS: IVitalTypeTab[] = [
  { key: 'blood_pressure', label: '血压', unit: 'mmHg' },
  { key: 'blood_glucose', label: '血糖', unit: 'mmol/L' },
  { key: 'heart_rate', label: '心率', unit: '次/分' },
]

/** 各类型的正常范围，仅用于提示「偏高/偏低」，不作为诊断依据 */
const RANGE: Record<string, { min: number; max: number }> = {
  blood_glucose: { min: 3.9, max: 7.8 },
  heart_rate: { min: 60, max: 100 },
}

Page({
  behaviors: [elderModeBehavior],

  data: {
    elderId: '',
    typeTabs: TYPE_TABS,
    activeType: 'blood_pressure' as VitalType,
    activeUnit: 'mmHg',
    systolic: '',
    diastolic: '',
    singleValue: '',
    saving: false,
    loading: true,
    loadFailed: false,
    list: [] as IVitalVM[],
    chartPoints: [] as Array<{ at: string; value: number }>,
    chartUnit: '',
    abnormalTip: '',
  },

  onLoad() {
    const elderId = userStore.getState().activeElderId || userStore.getState().profile?.userId || ''
    this.setData({ elderId })
    void this.loadRecords()
  },

  async onPullDownRefresh() {
    await this.loadRecords()
    wx.stopPullDownRefresh()
  },

  /** 切换指标类型：清空表单与图表，避免不同类型数据混在一张图里 */
  handleTypeTap(event: WechatMiniprogram.TouchEvent) {
    const { key } = event.currentTarget.dataset as { key: VitalType }
    const tab = TYPE_TABS.find((t) => t.key === key)
    this.setData({
      activeType: key,
      activeUnit: tab?.unit ?? '',
      systolic: '',
      diastolic: '',
      singleValue: '',
      abnormalTip: '',
      chartPoints: [],
    })
    void this.loadRecords()
  },

  handleInput(event: WechatMiniprogram.Input) {
    const { field } = event.currentTarget.dataset as { field: string }
    this.setData({ [field]: event.detail.value, abnormalTip: '' })
  },

  async loadRecords() {
    if (!this.data.elderId) {
      this.setData({ loading: false, loadFailed: true })
      return
    }
    this.setData({ loading: true, loadFailed: false })
    try {
      const res = await getVitalList({
        elderId: this.data.elderId,
        type: this.data.activeType,
        pageNum: 1,
        pageSize: PAGE_SIZE,
      })
      const list = res.list.map((item) => this.decorate(item))
      this.setData({
        list,
        loading: false,
        chartPoints: this.buildChartPoints(res.list),
        chartUnit: this.data.activeUnit,
      })
    } catch (err) {
      logger.error('health_records_load_failed', { err: String(err) })
      this.setData({ loading: false, loadFailed: true })
    }
  },

  decorate(item: IVitalSign): IVitalVM {
    const level = this.judgeLevel(item)
    return {
      ...item,
      measuredText: formatDate(item.measuredAt, 'YYYY-MM-DD HH:mm'),
      valueText: this.formatValue(item),
      levelText: level.text,
      levelTone: level.tone,
    }
  },

  formatValue(item: IVitalSign): string {
    if (item.type === 'blood_pressure') {
      return `${item.values.systolic ?? '-'}/${item.values.diastolic ?? '-'} mmHg`
    }
    const value = item.values.value
    if (value === undefined) return '-'
    return `${value}${this.unitOf(item.type)}`
  },

  unitOf(type: VitalType): string {
    const map: Partial<Record<VitalType, string>> = {
      blood_glucose: ' mmol/L',
      heart_rate: ' 次/分',
      weight: ' kg',
      temperature: ' ℃',
      spo2: ' %',
    }
    return map[type] ?? ''
  },

  /** 仅做健康提示，不做诊断；文案必须是中性的 */
  judgeLevel(item: IVitalSign): { text: string; tone: string } {
    if (item.type === 'blood_pressure') {
      const level = bloodPressureLevel(item.values.systolic ?? 0, item.values.diastolic ?? 0)
      if (level === '正常') return { text: '正常', tone: 'success' }
      return { text: `${level}，建议联系医生`, tone: 'warning' }
    }
    const range = RANGE[item.type]
    const value = item.values.value
    if (!range || value === undefined) return { text: '', tone: '' }
    if (value > range.max) return { text: '偏高，建议联系医生', tone: 'warning' }
    if (value < range.min) return { text: '偏低，建议联系医生', tone: 'warning' }
    return { text: '正常', tone: 'success' }
  },

  buildChartPoints(records: IVitalSign[]): Array<{ at: string; value: number }> {
    return records
      .slice()
      .reverse()
      .map((item) => ({
        at: item.measuredAt,
        value:
          item.type === 'blood_pressure'
            ? (item.values.systolic ?? 0)
            : (item.values.value ?? 0),
      }))
      .filter((point) => Number.isFinite(point.value) && point.value > 0)
  },

  /** 录入：先过单独同意，再校验输入，最后提交 */
  async handleSave() {
    if (this.data.saving) return

    const payload = this.buildPayload()
    if (!payload) return

    const agreed = await requirePrivacy('health')
    if (!agreed) {
      wx.showToast({ title: '需要同意后才能保存健康数据', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      await recordVital(payload)
      logger.event('health_vital_recorded', { type: payload.type })
      wx.showToast({ title: '已保存', icon: 'success' })
      this.setData({ systolic: '', diastolic: '', singleValue: '', abnormalTip: '' })
      await this.loadRecords()
    } catch (err) {
      logger.error('health_vital_record_failed', { err: String(err) })
    } finally {
      this.setData({ saving: false })
    }
  },

  /** 返回 null 表示校验未通过（已给出内联提示） */
  buildPayload(): Omit<IVitalSign, 'recordId' | 'abnormal'> | null {
    const { activeType, systolic, diastolic, singleValue, elderId } = this.data

    if (activeType === 'blood_pressure') {
      const s = Number(systolic)
      const d = Number(diastolic)
      if (!systolic || !diastolic) {
        this.setData({ abnormalTip: '请填写收缩压与舒张压两个数值' })
        return null
      }
      if (!this.isPlausible(s, 50, 300) || !this.isPlausible(d, 30, 200)) {
        this.setData({ abnormalTip: '数值看起来不太对，请核对后重新填写' })
        return null
      }
      const level = bloodPressureLevel(s, d)
      if (level !== '正常') {
        this.setData({ abnormalTip: `本次血压${level}，已记录，建议联系医生` })
      }
      return {
        elderId,
        type: activeType,
        values: { systolic: s, diastolic: d },
        measuredAt: new Date().toISOString(),
        source: 'manual',
      }
    }

    const value = Number(singleValue)
    if (!singleValue) {
      this.setData({ abnormalTip: '请填写测量数值' })
      return null
    }
    if (!this.isPlausible(value, 0.1, 1000)) {
      this.setData({ abnormalTip: '数值看起来不太对，请核对后重新填写' })
      return null
    }
    const range = RANGE[activeType]
    if (range && (value > range.max || value < range.min)) {
      this.setData({ abnormalTip: `本次数值超出常见范围，已记录，建议联系医生` })
    }
    return {
      elderId,
      type: activeType,
      values: { value },
      measuredAt: new Date().toISOString(),
      source: 'manual',
    }
  },

  isPlausible(value: number, min: number, max: number): boolean {
    return Number.isFinite(value) && value >= min && value <= max
  },

  handleRetry() {
    void this.loadRecords()
  },
})
