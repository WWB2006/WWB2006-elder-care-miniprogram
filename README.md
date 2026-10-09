# 养老服务系统 · 微信小程序

面向居家与社区养老场景的微信小程序工程脚手架，包含老人端、家属端、服务人员端与机构管理端四类角色的代码结构、适老化设计令牌与核心业务模块的骨架实现。

完整设计方案见 [`docs/设计方案.md`](./docs/设计方案.md)（含业务流程、技术选型、目录职责、模块设计、数据模型、接口规范、安全合规、排期与风险）。

## 快速开始

```bash
npm install          # 安装依赖
npm run type-check   # TypeScript 类型检查
npm run lint         # 代码规范检查（miniprogram + tests）
npm run lint:style   # WXSS 规范检查（禁止硬编码色值）
npm run verify       # 工程完整性校验（能否被开发者工具正常打开）
npm run test         # 单元测试（283 个用例，含覆盖率阈值校验）
npm run test:watch   # 单元测试 watch 模式
npm run report       # 生成可视化验收报告 reports/验收报告.html
```

提交前建议一次性跑完全部校验，与 CI 保持一致：

```bash
npm run type-check && npm run lint && npm run lint:style && npm run verify && npm run test -- --coverage
```

生成验收报告（先跑测试产出 JSON，再渲染 HTML）：

```bash
npm test -- --coverage --json --outputFile=reports/jest-result.json
npm run report
```

上传体验版 / 正式版（需先配置上传密钥，见脚本头部说明）：

```bash
npm run upload:dev   # 开发版（robot 1）
npm run upload:uat   # 体验版（robot 2）
npm run upload:prod  # 正式版（robot 3，开启域名校验与压缩）
```

一键在开发者工具中打开本项目：

```bash
npm run devtools:open              # 自动探测 IDE → 校验 AppID → 开启服务端口 → 导入并打开
npm run devtools:open -- --check   # 仅自检环境，不启动 IDE
npm run devtools:open -- --tourist # 还没有真实 AppID 时，用游客模式打开
```

也可以直接双击项目根目录的 **`open-devtools.bat`**（等价于第一条命令，带错误提示与暂停）。

> 脚本为什么存在：官方 CLI（`cli.bat open --project <路径>`）有两个隐藏前置条件 ——
> IDE 的「服务端口」开关（关闭时 CLI 报 `IDE service port disabled`，且在非 TTY 环境下
> **无法应答它的交互式确认**）与 IDE 写出的端口文件 `.ide`。脚本会自动把
> `security.enableServicePort` 置为 `true`（改前写 `.bak` 备份）、补写 `.ide-status = On`，
> 再调用 CLI。若 IDE 装在非默认位置，设置环境变量 `WECHAT_DEVTOOLS_PATH` 指向安装目录即可。
>
> **AppID 是导入的硬前提**：`project.config.json` 的 `appid` 必须是 `wx` + 16 位十六进制
> （或 `touristappid`）。仓库里默认是占位值 `wx00000000000000`，格式非法，开发者工具会弹
> 「AppID 格式不正确」。`npm run verify` 会把这种情况报为警告；`--tourist` 可一键切到游客模式
> （改前备份为 `project.config.json.bak`）。

手动导入（不使用脚本时）：

1. 打开微信开发者工具 → 导入项目，目录选择本仓库根目录；
2. 将 `project.config.json` 的 `appid` 替换为真实 AppID；
3. 修改 `miniprogram/utils/env.ts` 中的三套接口域名，并在小程序后台配置服务器域名白名单；
4. 修改 `miniprogram/config/constant.ts` 中的客服热线与订阅消息模板 ID；
5. 图标资源已随仓库提供（`miniprogram/assets/icons/` 下 16 个 PNG，覆盖 tabBar 与 8 个服务分类），
   如需替换为设计稿资源，文件名与尺寸约定见该目录的 `README.md`。

## 本地 Mock 数据（无服务端也能跑通全部页面）

本仓库不含服务端，各环境的接口域名都是占位域名。**开发版（develop）默认开启本地 mock**，
所以导入开发者工具后所有列表页都能正常出数据；预发 / 正式版不受影响。

```js
// 开发者工具 Console 里可随时切换
wx.setStorageSync('__enable_mock__', false)  // 关闭 mock，联调真实后端
wx.setStorageSync('__enable_mock__', true)   // 重新打开
// 改完需重新编译（Ctrl+B）才会生效
```

**排查「还是网络连接失败」**：`app.ts` 启动时会往 Console 打一行横幅，第一行即可确认状态 ——

```
[env] 本地 mock 已开启（env=dev）：所有接口走 miniprogram/mock，不会发起真实请求
```

看到的是「已关闭」则说明旧编译包还在生效，点「编译」（Ctrl+B）重新编译；
若仍无效，走「清缓存 → 全部清除」再编译。

另有一道硬兜底：`apiBaseUrl` 仍是 `*.example.com` 占位域名时，即使开关被写成 false
也会强制开启 mock 并打印告警。因为此时真实请求必然打到不存在的域名上，
页面只会得到「网络连接失败」，而真实原因其实是「没有后端」。
要联调真实后端，顺序是：**先改 `utils/env.ts` 的域名 → 再关开关 → 重新编译**。

mock 的实现位置与约定：

| 文件 | 职责 |
| --- | --- |
| `miniprogram/mock/fixtures.ts` | 假数据：16 个服务项目、10 张各状态订单、6 个员工任务、健康记录、排班等 |
| `miniprogram/mock/index.ts` | 路由表：`method + path` → 响应体；含分页、过滤与可变状态（取消订单 / 接单会真的改数据） |
| `miniprogram/utils/request.ts` | 开关打开时优先走 mock，**未覆盖的路由直接抛 40400** |

三条设计取舍：

1. **未覆盖的路由必须显式报错**，不能静默回落成真实请求 —— 否则「mock 没写」会被伪装成
   「网络连接失败」，排查方向完全跑偏；
2. **`coverUrl` 指向本地 `assets/icons`**，不引网络图，避免开发者工具里图片白块与域名白名单问题；
3. **时间相对「现在」生成**（见 `fixtures.ts` 的 `offset()`），写死日期会让「待上门 / 已过期」
   这类判断随日期推移失真。

新增接口时，`tests/unit/mock.test.ts` 的「路由表 · 覆盖完整性」用例会检查 `api/` 层每个调用点
都有对应 mock；忘了补会直接失败。另有「api 层端到端」用例把每个接口真实调一遍，
保证页面拿得到结构正确的数据。

## 目录速览

```
miniprogram/
├── pages/            主包：启动、登录、4 个 tab 页、订单详情、内嵌网页（8 页）
├── packageElder/     分包：紧急呼叫、健康档案、用药提醒、语音助手、亲情号码（5 页）
├── packageFamily/    分包：长辈档案、预约下单、支付、健康报告、评价、视频探视（6 页）
├── packageStaff/     分包：任务大厅、任务详情、上门打卡、服务记录、排班（5 页）
├── packageAdmin/     分包：运营看板、长者管理、派单调度、异常复核（4 页）
├── components/       适老化组件库（12 个）
├── behaviors/        页面复用逻辑（适老模式 / 分页 / 埋点 / 登录守卫）
├── wxs/              WXML 内联格式化（金额 / 脱敏 / 状态）
├── api/              接口层（按业务域拆分）
├── store/            状态层
├── utils/            请求、鉴权、存储、日志、隐私、格式化
├── config/           常量字典与路由表
└── styles/           设计令牌与适老模式
```

配套工程能力：

```
tests/unit/           16 个测试文件 / 283 个用例（utils、store、config、mock 层、wxs 一致性）
.github/workflows/    CI：type-check → lint → lint:style → verify → test（含覆盖率阈值）
scripts/upload.js     三环境上传脚本（凭据全部外部注入，仓库不落任何密钥）
scripts/verify-project.js  工程完整性静态校验（页面/组件/分包/tabBar/体积/隐私声明）
scripts/report.js     由真实执行结果渲染可视化验收报告（reports/验收报告.html）
scripts/open-in-devtools.js  一键导入微信开发者工具（探测 IDE + 开启服务端口 + 调 CLI）
```

## 开发约束（务必遵守）

1. **新增页面必须在 `app.json` 的 `subPackages` 中登记**，否则无法编译跳转；
2. 样式一律使用 `styles/variables.wxss` 的设计令牌，禁止硬编码色值；
3. 老人端页面根节点绑定 `class="page-root {{elderMode ? 'elder-mode' : ''}}"`，自动获得适老字号；
4. 组件内不发请求，只抛事件；请求统一走 `api/` 层与 `utils/request.ts`；
5. 涉及手机号、健康数据、定位的操作必须走 `utils/privacy.ts` 的单独同意流程；
6. 关键行为调用 `logger.event(...)`，埋点敏感字段会被自动过滤；
7. 提交前由 `.husky/pre-commit` 自动对暂存文件跑 `lint-staged`（eslint --fix + prettier + stylelint --fix），
   规则见 `package.json` 的 `lint-staged` 字段；如需手动执行：`npm run precommit`。

## 完成度说明

全项目共 **28 个页面**（主包 8 + 4 个分包 20）：

| 状态 | 页数 | 页面 |
| --- | --- | --- |
| 完整实现 | 10 | 启动、登录、首页、服务、订单、订单详情、我的、内嵌网页、紧急呼叫、健康档案 |
| 占位页 | 18 | 老人端 3（用药提醒 / 语音助手 / 亲情号码）、家属端 6、服务人员端 5、机构管理端 4 |

工程配置、入口与全局能力（环境 / 请求 / 鉴权 / 存储 / 日志 / 隐私 / 状态）、接口层、样式令牌、
12 个适老化组件、4 个 behavior、3 个 wxs、16 个测试文件（283 个用例）与 CI 流水线为完整实现；
上表「完整实现」的 10 个页面已按设计方案第 6 章落地；其余 18 个页面为占位页，
每页含统一的落地清单与空态骨架，需按设计方案第 6 章实现。服务端不在本仓库内，
设计方案第 4.3 与第 7、8 章给出了包结构、数据模型与接口契约。

### 已验证的校验项

| 命令 | 结果 |
| --- | --- |
| `npm run type-check` | 通过（strict 模式，0 error） |
| `npm run lint` | 通过（ESLint Flat Config，覆盖 miniprogram 与 tests） |
| `npm run lint:style` | 通过（Stylelint，WXSS 专有单位 rpx 已放行） |
| `npm run verify` | 通过（0 错误；28 个页面 / 12 个组件 / 34 处组件引用全部解析成功；主包 245.3 KB） |
| `npm test -- --coverage` | 283 用例全绿；语句 95.9% / 分支 80.6% / 函数 96.1% / 行 98.2%，均高于阈值 |

### 能否被开发者工具正常打开

`npm run verify` 专门回答这个问题。它检查的是「小程序打不开」的真正原因，
而这些原因 `tsc` / `eslint` / `jest` 一个都查不出来（它们只看语法与逻辑）：

- `project.config.json` 的 `appid` 是否为合法格式（非法时导入这一步就会失败）；
- `app.json` 中 `pages` / `subPackages` 登记的每个页面是否具备 `.ts` `.json` `.wxml` `.wxss` 四件套；
- 所有 `.json` 里 `usingComponents` 的路径能否解析到真实组件；
- `entryPagePath`、`tabBar.list[].pagePath`、`preloadRule` 是否都指向已登记的页面；
- 主包 / 整包 / 各分包体积是否超过微信限制（2 MB / 20 MB）；
- `requiredPrivateInfos` 与 `permission` 是否成对声明（缺了会被审核驳回）。

### 已知的工程化取舍

- **`tests` 目录不在根 `tsconfig.json` 的 include 内**，由 `tests/tsconfig.json` 单独接管
  （`module: CommonJS` + jest/node 类型），避免测试类型污染小程序源码的类型环境；
- **jest 的 `roots` 必须同时包含 `miniprogram`**，否则 `collectCoverageFrom` 里尚未被引用的
  源文件不会被统计，覆盖率会虚高；
- **WXS 无法 import TS 常量**，`wxs/status.wxs` 保留了一份状态文案副本，
  由 `tests/unit/wxs-status.test.ts` 与 `config/constant.ts` 做一致性校验，防止悄悄漂移。

## 许可证

本项目为**从零独立设计与实现**，未基于任何开源仓库二次开发。

代码以 **MIT 许可证**发布，全文见 [LICENSE](LICENSE)。

> 注意：`project.private.config.json`、`private.*.key`、`.env` 等本地配置与上传密钥
> 已在 `.gitignore` 中排除，不会进入版本库。
