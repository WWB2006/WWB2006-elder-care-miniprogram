#!/usr/bin/env node
/**
 * 一键在「微信开发者工具」中打开本项目。
 *
 * 为什么需要这个脚本：微信开发者工具的 CLI（`cli.bat open --project <路径>`）是官方
 * 支持的导入方式，但它有两个前置条件，手动处理很烦：
 *
 *   1. IDE 的「服务端口」必须处于开启状态（设置 → 安全设置 → 服务端口）。
 *      关闭时 CLI 会报 `IDE service port disabled`，并且**在非 TTY 环境下无法应答它的
 *      交互式确认**（管道喂 y 无效，因为 CLI 会检测 stdin.isTTY）。
 *      该开关落在 IDE 的 settings localStorage 里，字段是 `security.enableServicePort`，
 *      本脚本直接改这个字段。
 *   2. IDE 未启动时，CLI 会自行拉起 IDE 并等待它写出端口文件 `.ide`。
 *
 * 用法：
 *   npm run devtools:open
 *   npm run devtools:open -- --check     仅自检（探测环境，不启动 IDE）
 *   npm run devtools:open -- --tourist   无真实 AppID 时用游客模式打开
 *   或双击项目根目录的 open-devtools.bat
 *
 * 环境变量：
 *   WECHAT_DEVTOOLS_PATH  指定开发者工具安装目录（自动探测失败时使用）
 *
 * 退出码：0 = 已发起打开请求；非 0 = 前置条件不满足（会打印具体原因）
 */
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')

/** IDE 安装目录的候选位置（按优先级） */
const IDE_CANDIDATES = [
  process.env.WECHAT_DEVTOOLS_PATH,
  'D:\\微信web开发者工具',
  'C:\\Program Files (x86)\\Tencent\\微信web开发者工具',
  'C:\\Program Files\\Tencent\\微信web开发者工具',
  path.join(os.homedir(), 'AppData', 'Local', '微信web开发者工具'),
  path.join(os.homedir(), 'AppData', 'Local', '微信开发者工具'),
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', '微信web开发者工具'),
].filter(Boolean)

/** IDE 的用户数据根目录候选 */
const USER_DATA_CANDIDATES = [
  path.join(os.homedir(), 'AppData', 'Local', '微信开发者工具', 'User Data'),
  path.join(os.homedir(), 'AppData', 'Local', '微信web开发者工具', 'User Data'),
]

const log = (msg) => console.log(`[devtools] ${msg}`)
const fail = (msg, hint) => {
  console.error(`\n[devtools] ✖ ${msg}`)
  if (hint) console.error(`          ${hint}`)
  console.error('')
  process.exit(1)
}

// ------------------------------------------------------------ 1. 定位 IDE

function findIde() {
  for (const dir of IDE_CANDIDATES) {
    if (!dir) continue
    const cli = path.join(dir, 'cli.bat')
    if (fs.existsSync(cli)) return { dir, cli }
  }
  return null
}

// ------------------------------------------------- 2. 开启服务端口（CLI 前提）

/**
 * 找到 IDE 的 settings localStorage 文件。
 * IDE 把它存在 User Data/<hash>/WeappLocalData/localstorage_<md5>.json，
 * 文件名是哈希值，无法硬编码，只能按内容识别（含 "security" 与 "enableServicePort"）。
 */
function findSettingsFile() {
  for (const root of USER_DATA_CANDIDATES) {
    if (!fs.existsSync(root)) continue
    for (const hashDir of fs.readdirSync(root)) {
      const localData = path.join(root, hashDir, 'WeappLocalData')
      if (!fs.existsSync(localData)) continue
      for (const name of fs.readdirSync(localData)) {
        if (!name.startsWith('localstorage_') || !name.endsWith('.json')) continue
        const full = path.join(localData, name)
        let raw
        try {
          raw = fs.readFileSync(full, 'utf8')
        } catch {
          continue
        }
        if (raw.includes('"enableServicePort"')) return full
      }
    }
  }
  return null
}

function enableServicePort() {
  const file = findSettingsFile()
  if (!file) {
    return { ok: false, reason: '找不到 IDE 的 settings 存储文件' }
  }

  let data
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return { ok: false, reason: `解析 settings 失败：${err.message}` }
  }

  const security = data.security || (data.security = {})
  if (security.enableServicePort === true) {
    return { ok: true, file, changed: false }
  }

  // 改前备份，便于还原
  const backup = `${file}.bak`
  if (!fs.existsSync(backup)) {
    try {
      fs.copyFileSync(file, backup)
    } catch {
      /* 备份失败不阻塞主流程 */
    }
  }

  security.enableServicePort = true
  if (security.port === undefined) security.port = null

  try {
    fs.writeFileSync(file, JSON.stringify(data), 'utf8')
  } catch (err) {
    return { ok: false, reason: `写入 settings 失败：${err.message}` }
  }
  return { ok: true, file, changed: true }
}

/**
 * 找到 IDE 实例的 Default 目录（User Data/<hash>/Default）。
 * 该目录下的 `.ide-status` 记录服务端口开关状态（内容 "On" 表示开启），
 * `.ide` 由 IDE 启动后写出（内容为 HTTP 端口号）。
 * 两个文件都是 IDE 自己维护的，这里只在缺失/为空时兜底写入，避免 CLI 直接报
 * `IDE service port disabled` 而不给我们补救机会。
 */
function findDefaultDir() {
  for (const root of USER_DATA_CANDIDATES) {
    if (!fs.existsSync(root)) continue
    for (const hashDir of fs.readdirSync(root)) {
      const def = path.join(root, hashDir, 'Default')
      if (fs.existsSync(def)) return def
    }
  }
  return null
}

function ensureIdeStatus() {
  const def = findDefaultDir()
  if (!def) return { ok: false, reason: '找不到 IDE 的 Default 目录' }

  const statusFile = path.join(def, '.ide-status')
  let content = ''
  try {
    content = fs.readFileSync(statusFile, 'utf8').trim()
  } catch {
    /* 文件不存在 → 下面创建 */
  }

  if (content === 'On') return { ok: true, file: statusFile, changed: false }

  try {
    fs.writeFileSync(statusFile, 'On', 'utf8')
  } catch (err) {
    return { ok: false, reason: `写入 .ide-status 失败：${err.message}` }
  }
  return { ok: true, file: statusFile, changed: true }
}

// -------------------------------------------------- 2.5 AppID（决定能否导入）

const VALID_APPID = /^wx[0-9a-f]{16}$/

function inspectAppId() {
  const file = path.join(ROOT, 'project.config.json')
  let data
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return { ok: false, reason: `project.config.json 解析失败：${err.message}` }
  }
  const appid = String(data.appid || '')
  if (VALID_APPID.test(appid)) return { ok: true, file, appid, mode: 'real' }
  if (appid === 'touristappid') return { ok: true, file, appid, mode: 'tourist' }
  return { ok: false, file, appid, reason: `AppID 格式非法：${JSON.stringify(appid)}` }
}

/** 把 AppID 改为 touristappid（游客模式）。改前备份为 project.config.json.bak。 */
function switchToTouristAppId(file) {
  const backup = `${file}.bak`
  if (!fs.existsSync(backup)) {
    try {
      fs.copyFileSync(file, backup)
    } catch {
      /* 备份失败不阻塞主流程 */
    }
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  data.appid = 'touristappid'
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  return backup
}

// ------------------------------------------------------------ 3. 调用 CLI

function openProject(cli, projectPath) {
  // 注意：cli.bat 内部会 set ELECTRON_RUN_AS_NODE=1 并用它跑 Electron。
  // 该变量被 setlocal/endlocal 包裹，只在该 cmd 进程内有效，不会污染调用方环境。
  const result = spawnSync(
    'cmd.exe',
    ['/c', `"${cli}" open --project "${projectPath}" --lang zh`],
    // windowsHide：避免在已处于控制台时再闪出一个 cmd 窗口
    { cwd: path.dirname(cli), encoding: 'utf8', windowsHide: true },
  )
  return result
}

/** 返回可直接复制到「命令提示符」执行的等价命令（脚本调不起 CLI 时的兜底）。 */
function manualCommand(cli, projectPath) {
  return (
    '可手动在「命令提示符」中执行等价命令：\n' +
    `          cd /d "${path.dirname(cli)}"\n` +
    `          cli.bat open --project "${projectPath}" --lang zh`
  )
}

// ------------------------------------------------------------------ main

function main() {
  const checkOnly = process.argv.includes('--check')
  const tourist = process.argv.includes('--tourist')
  log(`项目路径：${ROOT}`)
  if (checkOnly) log('模式：仅自检（不会启动 IDE）')

  const ide = findIde()
  if (!ide) {
    fail(
      '未找到微信开发者工具（找不到 cli.bat）',
      `已尝试：\n          ${IDE_CANDIDATES.join('\n          ')}\n` +
        '          请设置环境变量 WECHAT_DEVTOOLS_PATH 指向安装目录，例如：\n' +
        '          set WECHAT_DEVTOOLS_PATH=D:\\微信web开发者工具',
    )
  }
  log(`开发者工具：${ide.dir}`)

  // AppID：格式非法时开发者工具会拒绝导入，因此必须在这里先解决
  let appid = inspectAppId()
  if (!appid.ok && tourist) {
    try {
      const backup = switchToTouristAppId(appid.file)
      log(`AppID 已改为 touristappid（游客模式），原文件备份在 ${path.basename(backup)}`)
      appid = inspectAppId()
    } catch (err) {
      fail(`切换游客模式失败：${err.message}`)
    }
  }
  if (!appid.ok) {
    fail(
      `AppID 不合法，开发者工具导入时会提示「AppID 格式不正确」`,
      `当前为 ${JSON.stringify(appid.appid)}\n` +
        '          两种解决办法（任选其一）：\n' +
        '          1) 把 project.config.json 的 appid 改成你的真实 AppID（wx + 16 位十六进制）；\n' +
        '          2) 加 --tourist 参数用游客模式打开：npm run devtools:open -- --tourist\n' +
        '             （游客模式可编译预览，但不能真机调试与上传）',
    )
  }
  log(
    appid.mode === 'tourist'
      ? 'AppID：touristappid（游客模式，不能真机调试 / 上传）'
      : `AppID：${appid.appid}`,
  )

  const port = enableServicePort()
  if (!port.ok) {
    log(`! 无法自动开启服务端口：${port.reason}`)
    log('  请手动在 IDE 中打开：设置 → 安全设置 → 服务端口 → 开启')
  } else if (port.changed) {
    log('已开启 IDE 服务端口（security.enableServicePort = true）')
  } else {
    log('IDE 服务端口已处于开启状态')
  }
  if (port.file) log(`settings 文件：${port.file}`)

  const status = ensureIdeStatus()
  if (status.ok) {
    log(status.changed ? '已写入 .ide-status = On' : '.ide-status 已为 On')
  } else {
    log(`! 无法写入 .ide-status：${status.reason}`)
  }

  if (checkOnly) {
    log('自检完成。去掉 --check 即可真正打开项目。')
    if (!port.ok) process.exit(1)
    return
  }

  log('正在请求 IDE 打开项目（首次会自动启动 IDE，可能需要 10~30 秒）…')
  const res = openProject(ide.cli, ROOT)

  const output = `${res.stdout || ''}${res.stderr || ''}`.trim()
  if (output) console.log(output)

  if (res.error) {
    fail(`调用 CLI 失败：${res.error.message}`, manualCommand(ide.cli, ROOT))
  }

  const failed = /初始化错误|\[error\]|service port disabled/i.test(output)
  if (failed || res.status !== 0) {
    fail(
      '打开失败。若提示「服务端口已关闭」，请在 IDE 中手动开启后重试：\n' +
        '          设置 → 安全设置 → 服务端口 → 开启',
      manualCommand(ide.cli, ROOT),
    )
  }

  log('✔ 已向 IDE 发送打开请求，请查看微信开发者工具窗口。')
}

main()
