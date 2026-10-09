/**
 * 用户态：登录信息与当前角色。
 * 安全约束：store 只是内存缓存，任何「能不能看这条数据」的判断必须由后端返回 403 兜底。
 */
import { Store } from './base'
import { getStorage, StorageKey } from '../utils/storage'

export interface IUserState {
  profile: IUserProfile | null
  role: Role
  /** 当前家属账号选中的老人；老人账号即本人 */
  activeElderId: string
}

class UserStore extends Store<IUserState> {
  constructor() {
    super({
      profile: getStorage<IUserProfile | null>(StorageKey.userProfile, null),
      role: getStorage<Role>(StorageKey.role, 'guest'),
      activeElderId: '',
    })
  }

  get isLoggedIn(): boolean {
    return this.getState().role !== 'guest'
  }

  setSession(profile: IUserProfile, role: Role): void {
    this.setState({ profile, role })
  }

  setActiveElder(elderId: string): void {
    this.setState({ activeElderId: elderId })
  }

  reset(): void {
    this.setState({ profile: null, role: 'guest', activeElderId: '' })
  }
}

export const userStore = new UserStore()
