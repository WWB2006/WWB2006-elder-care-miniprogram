/**
 * 紧急呼叫（SOS）。
 * 这是整个系统里唯一「绝不能失败」的功能，设计目标不是功能丰富，
 * 而是**尽最大可能把呼救信号送出去**（见 docs/设计方案.md 6.1）。
 *
 * 三通道降级：
 *   ① 平台通道：POST /sos/trigger，后端立刻外呼值班手机 + 推送家属；
 *   ② 3 秒内未收到受理回执 → 直接 wx.makePhoneCall 第一紧急联系人；
 *   ③ 用户取消拨号或拨号失败 → 全屏展示「客服热线」「120」两个一键拨号按钮。
 *
 * 关键约束：
 * - 定位失败不阻塞呼救：仍立即上报，位置字段留空并标记 locationMissing；
 * - 长按 3 秒 + 震动 + 进度由 sos-button 组件负责，页面只管上报与降级；
 * - 上报结果无论成败都要给老人明确的下一步，不能停在"转圈"。
 */
import { triggerSos } from '../../../api/health'
import { getElderProfile } from '../../../api/service'
import { APP_INFO, SOS_CONFIG } from '../../../config/constant'
import { logger } from '../../../utils/logger'
import { requirePrivacy, requestSystemPermission } from '../../../utils/privacy'
import { userStore } from '../../../store/user'
import { elderModeBehavior } from '../../../behaviors/elder-mode'

/** 等待平台受理回执的时间；超过就直接拨号，不能干等 */
const ACK_TIMEOUT_MS = 3000
/** 兜底拨号号码 */
const EMERGENCY_NUMBER = '120'

interface IElderContact {
  name: string
  relation: string
  phone: string
}

type SosPhase = 'idle' | 'calling' | 'accepted' | 'fallback'

interface ISosQuery {
  elderId?: string
}

Page({
  behaviors: [elderModeBehavior],

  data: {
    elderId: '',
    elderName: '',
    phase: 'idle' as SosPhase,
    statusText: '长按下方按钮 3 秒即可呼叫',
    /** 定位缺失时如实告知，但不阻断呼救 */
    locationMissing: false,
    contacts: [] as IElderContact[],
    hotline: SOS_CONFIG.hotline,
    emergencyNumber: EMERGENCY_NUMBER,
    sosId: '',
    handledBy: '',
  },

  /** 页面是否已离开，避免异步回调 setData 到已销毁页面 */
  destroyed: false,
  /** 定位结果缓存 */
  location: null as { latitude: number; longitude: number } | null,
  ackTimer: null as ReturnType<typeof setTimeout> | null,

  onLoad(query: ISosQuery) {
    const elderId = query?.elderId || userStore.getState().activeElderId
    this.setData({ elderId: elderId || '' })
    // 定位是"尽力而为"：拿到更好，拿不到也要能呼救
    void this.prepareLocation()
    if (elderId) void this.loadContacts(elderId)
    logger.event('sos_page_open', { hasElderId: !!elderId })
  },

  onUnload() {
    this.destroyed = true
    this.clearAckTimer()
  },

  /** 定位：先过隐私同意，再申请系统权限，最后取坐标；任一步失败都只标记不阻断 */
  async prepareLocation() {
    try {
      const agreed = await requirePrivacy('location')
      if (!agreed) {
        this.safeSetData({ locationMissing: true })
        return
      }
      const granted = await requestSystemPermission('scope.userLocation')
      if (!granted) {
        this.safeSetData({ locationMissing: true })
        return
      }
      const res = await wx.getLocation({ type: 'gcj02' })
      this.location = { latitude: res.latitude, longitude: res.longitude }
      this.safeSetData({ locationMissing: false })
    } catch (err) {
      logger.warn('sos_location_failed', { err: String(err) })
      this.safeSetData({ locationMissing: true })
    }
  },

  /** 加载紧急联系人：失败不影响呼救（平台通道仍会通知家属） */
  async loadContacts(elderId: string) {
    try {
      const profile = await getElderProfile(elderId)
      this.safeSetData({
        elderName: profile.name,
        contacts: profile.emergencyContacts ?? [],
      })
    } catch (err) {
      logger.warn('sos_contacts_load_failed', { err: String(err) })
    }
  },

  /** 长按完成：先上报，再进入三通道降级 */
  async handleTrigger() {
    logger.event('sos_trigger', { elderId: this.data.elderId, locationMissing: this.data.locationMissing })
    this.safeSetData({ phase: 'calling', statusText: '正在为您呼叫家属与机构，请稍候…' })

    this.startAckTimer()

    try {
      const res = await triggerSos({
        elderId: this.data.elderId,
        triggerType: 'button',
        latitude: this.location?.latitude,
        longitude: this.location?.longitude,
        addressHint: this.data.locationMissing ? '定位不可用' : undefined,
      })
      this.clearAckTimer()
      this.safeSetData({
        phase: 'accepted',
        sosId: res.sosId,
        handledBy: res.handledBy,
        statusText: `呼叫已受理，${res.handledBy || '值班人员'}正在处理`,
      })
      logger.event('sos_accepted', { sosId: res.sosId, expectCallSeconds: res.expectCallSeconds })
    } catch (err) {
      logger.error('sos_trigger_failed', { err: String(err) })
      // 平台通道失败：立刻走拨号兜底，而不是让老人自己判断
      this.clearAckTimer()
      await this.callFirstContact('platform_failed')
    }
  },

  /** 3 秒未收到回执 → 直接拨号（这是最重要的兜底，弱网时尤其关键） */
  startAckTimer() {
    this.clearAckTimer()
    this.ackTimer = setTimeout(() => {
      this.ackTimer = null
      if (this.data.phase !== 'calling') return
      logger.warn('sos_ack_timeout')
      void this.callFirstContact('ack_timeout')
    }, ACK_TIMEOUT_MS)
  },

  clearAckTimer() {
    if (this.ackTimer) {
      clearTimeout(this.ackTimer)
      this.ackTimer = null
    }
  },

  /** 拨给第一紧急联系人；没有联系人则直接进兜底面板 */
  async callFirstContact(reason: string) {
    const first = this.data.contacts[0]
    if (!first?.phone) {
      this.showFallback('no_contact')
      return
    }
    this.safeSetData({
      phase: 'fallback',
      statusText: `正在拨打 ${first.name}（${first.relation}）`,
    })
    logger.event('sos_call_fallback', { reason, hasPhone: true })
    try {
      await wx.makePhoneCall({ phoneNumber: first.phone })
    } catch (err) {
      // 用户取消拨号也会走到这里，属于预期行为，不算错误
      logger.warn('sos_call_cancelled', { err: String(err) })
      this.showFallback('call_cancelled')
    }
  },

  showFallback(reason: string) {
    logger.event('sos_call_fallback', { reason, hasPhone: false })
    this.safeSetData({
      phase: 'fallback',
      statusText: '请直接拨打下方电话，我们会同步通知家属',
    })
  },

  handleCallContact(event: WechatMiniprogram.TouchEvent) {
    const { phone, name } = event.currentTarget.dataset as { phone: string; name: string }
    if (!phone) {
      wx.showToast({ title: `${name} 未预留电话`, icon: 'none' })
      return
    }
    void wx.makePhoneCall({ phoneNumber: phone }).catch(() => undefined)
  },

  handleCallHotline() {
    void wx.makePhoneCall({ phoneNumber: APP_INFO.serviceHotline }).catch(() => undefined)
  },

  handleCall120() {
    void wx.makePhoneCall({ phoneNumber: EMERGENCY_NUMBER }).catch(() => undefined)
  },

  /** 允许老人主动重试，避免一次失败后彻底卡住 */
  handleRetry() {
    void this.handleTrigger()
  },

  safeSetData(patch: Record<string, unknown>) {
    if (this.destroyed) return
    this.setData(patch)
  },
})
