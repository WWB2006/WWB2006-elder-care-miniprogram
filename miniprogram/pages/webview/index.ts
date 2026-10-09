/**
 * 内嵌 H5 容器（用户协议、隐私政策、帮助中心、机构主页）。
 *
 * 安全要点：web-view 相当于把外部页面装进小程序，**必须做域名白名单校验**。
 * 不做校验的话，一个伪造的「用户协议」链接就能骗老人输入手机号与验证码。
 */
import { WEBVIEW_ALLOWED_HOSTS } from '../../config/constant'
import { logger } from '../../utils/logger'

interface IWebviewQuery {
  url?: string
  title?: string
}

/** 微信对 query 的解码行为在不同版本上不一致，这里做一次容错解码 */
function safeDecode(value?: string): string {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

Page({
  data: {
    url: '',
    /** 校验失败时的提示，非空则展示错误态而非 web-view */
    errorText: '',
  },

  onLoad(query: IWebviewQuery) {
    const title = safeDecode(query.title) || '详情'
    wx.setNavigationBarTitle({ title })

    const rawUrl = safeDecode(query.url)
    const check = this.validateUrl(rawUrl)
    if (!check.ok) {
      logger.warn('webview_url_rejected', { url: rawUrl, reason: check.reason })
      this.setData({ errorText: check.reason, url: '' })
      return
    }
    this.setData({ url: rawUrl, errorText: '' })
    logger.event('webview_open', { host: check.host })
  },

  /** 仅允许 https + 白名单域名 */
  validateUrl(url: string): { ok: true; host: string } | { ok: false; reason: string } {
    if (!url) return { ok: false, reason: '链接为空，请返回重试' }
    if (!/^https:\/\//.test(url)) return { ok: false, reason: '出于安全考虑，仅支持打开 https 链接' }
    const matched = url.match(/^https:\/\/([^/?#]+)/)
    const host = matched ? matched[1].split(':')[0].toLowerCase() : ''
    const allowed = WEBVIEW_ALLOWED_HOSTS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
    if (!allowed) return { ok: false, reason: '该链接不在可信域名范围内，已阻止打开' }
    return { ok: true, host }
  },

  handleBack() {
    wx.navigateBack({ delta: 1 })
  },

  /** H5 通过 wx.miniProgram.postMessage 回传的数据（页面隐藏 / 分享时触发） */
  handleMessage(event: WechatMiniprogram.WebviewMessage) {
    logger.event('webview_message', { data: event.detail?.data })
  },

  handleError() {
    logger.error('webview_load_error', { url: this.data.url })
    this.setData({ errorText: '页面加载失败，请检查网络后重试', url: '' })
  },
})
