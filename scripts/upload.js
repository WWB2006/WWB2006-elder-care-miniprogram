/**
 * 小程序上传脚本（dev / uat / prod 三套环境）。
 *
 * 用法：
 *   npm run upload:dev
 *   npm run upload:uat
 *   npm run upload:prod
 *
 * 依赖 miniprogram-ci（已在 devDependencies 中）。首次使用需要准备：
 *
 * 1. 在「微信公众平台 -> 开发 -> 开发设置 -> 小程序代码上传」生成上传密钥，
 *    下载后放到仓库外的安全位置（**不要提交到 Git**）；
 * 2. 配置 IP 白名单，否则上传会返回 40164；
 * 3. 通过环境变量告诉脚本密钥路径与 AppID：
 *
 *      # Linux / macOS
 *      export MP_PRIVATE_KEY_PATH=/path/to/private.<appid>.key
 *      export MP_APPID=wx1234567890abcdef
 *
 *      # Windows PowerShell
 *      $env:MP_PRIVATE_KEY_PATH="D:\keys\private.wx123.key"
 *      $env:MP_APPID="wx1234567890abcdef"
 *
 * 4. 执行 npm run upload:dev。
 *
 * 脚本刻意把 AppID 与密钥都做成「外部注入」：仓库里不落任何凭据，
 * 与 README 的合规说明一致。若未配置，脚本会给出明确提示并以非零码退出。
 */

'use strict'

const fs = require('fs')
const path = require('path')

/** 三套环境的构建产物目录与描述后缀 */
const ENV_MAP = {
  dev: { desc: '开发环境', robot: 1 },
  uat: { desc: '验收环境', robot: 2 },
  prod: { desc: '生产环境', robot: 3 },
}

function fail(message) {
  console.error(`\n[upload] ${message}\n`)
  process.exit(1)
}

function parseEnvArg(argv) {
  const index = argv.indexOf('--env')
  const env = index >= 0 ? argv[index + 1] : undefined
  if (!env) fail('缺少 --env 参数（dev / uat / prod），请通过 npm run upload:dev 调用')
  if (!ENV_MAP[env]) fail(`未知环境 "${env}"，只支持 dev / uat / prod`)
  return env
}

function readProjectConfig(root) {
  const configPath = path.join(root, 'project.config.json')
  if (!fs.existsSync(configPath)) fail(`找不到 ${configPath}`)
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (err) {
    fail(`解析 project.config.json 失败：${err.message}`)
  }
}

function readVersion(root) {
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) return '0.0.0'
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function resolveAppId(config) {
  const appId = process.env.MP_APPID || config.appid
  if (!appId) fail('未找到 AppID：请在 project.config.json 里填写，或设置环境变量 MP_APPID')
  if (!/^wx[0-9a-f]{16}$/.test(appId)) {
    fail(
      `AppID "${appId}" 不是合法的 18 位小程序 AppID。\n` +
        '       请把 project.config.json 的 appid 替换成真实 AppID（wx + 16 位十六进制）。\n' +
        '       注意：touristappid（游客模式）无法上传，只能在本机模拟器里预览。',
    )
  }
  return appId
}

function resolveKeyPath(appId) {
  const fromEnv = process.env.MP_PRIVATE_KEY_PATH
  if (fromEnv) {
    if (!fs.existsSync(fromEnv)) fail(`环境变量 MP_PRIVATE_KEY_PATH 指向的文件不存在：${fromEnv}`)
    return fromEnv
  }
  const guess = path.join(process.cwd(), `private.${appId}.key`)
  if (fs.existsSync(guess)) return guess
  fail(
    '未找到上传密钥。请设置环境变量 MP_PRIVATE_KEY_PATH 指向 private.<appid>.key，\n' +
      `       或把密钥放到项目根目录并命名为 private.${appId}.key。\n` +
      '       密钥属于敏感凭据，务必加入 .gitignore，不要提交到仓库。',
  )
}

function loadCi() {
  try {
    return require('miniprogram-ci')
  } catch {
    fail('未安装 miniprogram-ci，请先执行 npm install')
  }
}

async function main() {
  const env = parseEnvArg(process.argv.slice(2))
  const root = path.resolve(__dirname, '..')
  const config = readProjectConfig(root)
  const appId = resolveAppId(config)
  const keyPath = resolveKeyPath(appId)
  const version = readVersion(root)
  const { desc, robot } = ENV_MAP[env]
  const ci = loadCi()

  const project = new ci.Project({
    appid: appId,
    type: 'miniProgram',
    projectPath: root,
    privateKeyPath: keyPath,
    ignores: ['node_modules/**/*', 'tests/**/*', 'docs/**/*', 'scripts/**/*'],
  })

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const setting = {
    es6: true,
    minify: env === 'prod',
    autoPrefixWXSS: true,
    // 生产环境必须开启合法域名校验，开发阶段才允许关闭
    urlCheck: env === 'prod',
  }

  console.log(`[upload] 环境=${env}（${desc}） 版本=${version} AppID=${appId}`)

  const result = await ci.upload({
    project,
    version,
    desc: `${desc} ${version} @ ${stamp}`,
    setting,
    robot,
    onProgressUpdate: (task) => {
      if (typeof task === 'string') console.log(`  ${task}`)
    },
  })

  console.log('[upload] 上传成功')
  if (result && result.subPackageInfo) {
    for (const pkg of result.subPackageInfo) {
      console.log(`  ${pkg.name}: ${(pkg.size / 1024).toFixed(1)} KB`)
    }
  }
  if (env === 'prod') {
    console.log('[upload] 生产包已上传，请到微信公众平台提交审核后再发布。')
  }
}

main().catch((err) => {
  console.error('\n[upload] 上传失败：', err && err.message ? err.message : err)
  process.exit(1)
})
