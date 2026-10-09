/**
 * 隐私协议合规。
 * 规则（2023-09 起微信强制）：
 * 1. 处理个人信息前必须用户点击同意《用户隐私保护指引》；
 * 2. app.json 需开启 __usePrivacyCheck__（基础库 2.32.3+），否则敏感接口调用失败；
 * 3. 健康数据属敏感个人信息，必须「单独同意 + 明示目的」，不能与总体协议打包默认勾选。
 */
export type PrivacyScope = 'location' | 'album' | 'camera' | 'health' | 'phone'

const PRIVACY_TEXT: Record<PrivacyScope, { title: string; content: string }> = {
  location: {
    title: '位置信息使用说明',
    content: '用于上门服务定位打卡、紧急呼叫时向家属与机构同步位置。仅在服务过程中采集。',
  },
  album: {
    title: '相册权限说明',
    content: '用于上传体检报告、服务过程照片。我们不会读取与服务无关的图片。',
  },
  camera: {
    title: '摄像头权限说明',
    content: '用于拍摄服务过程照片与视频探视。拍摄前会再次向您确认。',
  },
  health: {
    title: '健康信息单独同意',
    content:
      '血压、血糖、用药等属于敏感个人信息。同意后仅用于健康档案管理与异常提醒，不会用于营销或对外提供。您可随时撤回。',
  },
  phone: {
    title: '手机号使用说明',
    content: '用于账号登录、服务通知与紧急联系人联系。手机号将加密存储并脱敏展示。',
  },
}

/** 是否已同意过某类隐私授权 */
export function isPrivacyAgreed(scope: PrivacyScope): boolean {
  return wx.getStorageSync(`privacy_${scope}`) === true
}

export function markPrivacyAgreed(scope: PrivacyScope): void {
  wx.setStorageSync(`privacy_${scope}`, true)
}

/**
 * 申请隐私授权（敏感个人信息单独同意）。
 * @returns 用户是否同意
 */
export async function requirePrivacy(scope: PrivacyScope): Promise<boolean> {
  if (isPrivacyAgreed(scope)) return true
  const { title, content } = PRIVACY_TEXT[scope]
  const agreed = await new Promise<boolean>((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText: '同意并继续',
      cancelText: '暂不使用',
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    })
  })
  if (agreed) markPrivacyAgreed(scope)
  return agreed
}

/** 撤回授权（合规要求：必须提供撤回入口） */
export function revokePrivacy(scope: PrivacyScope): void {
  wx.removeStorageSync(`privacy_${scope}`)
}

/** 系统权限申请：定位等，被拒后引导用户去设置页开启 */
export async function requestSystemPermission(
  scope: 'scope.userLocation' | 'scope.writePhotosAlbum' | 'scope.camera',
): Promise<boolean> {
  const setting = await wx.getSetting()
  if (setting.authSetting[scope]) return true
  try {
    await wx.authorize({ scope })
    return true
  } catch {
    const res = await wx.showModal({
      title: '需要授权',
      content: '该功能需要您授权后才能使用，是否前往设置开启？',
      confirmText: '去设置',
    })
    if (!res.confirm) return false
    const finalSetting = await wx.openSetting()
    return !!finalSetting.authSetting[scope]
  }
}
