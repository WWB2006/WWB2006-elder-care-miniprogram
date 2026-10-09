#!/usr/bin/env node
/**
 * 小程序工程完整性静态校验。
 *
 * 为什么需要这个脚本：微信开发者工具「打不开项目」的绝大多数原因都不是逻辑 bug，而是
 * 静态结构问题——app.json 登记了页面但文件缺失、usingComponents 指向不存在的组件、
 * tabBar 的 pagePath 不在 pages 里、分包体积超限。这些问题 tsc / eslint / jest
 * 一个都查不出来（它们只看语法与逻辑），但开发者工具一导入就报错。
 *
 * 本脚本把「能否被开发者工具正常打开」变成可自动化的检查项，并纳入 CI。
 *
 * 用法：
 *   node scripts/verify-project.js          # 人类可读报告
 *   node scripts/verify-project.js --json   # 机器可读（供 scripts/report.js 消费）
 *
 * 同时导出 verifyProject()，供 report.js 直接 require 调用。
 * 注意：这里刻意不通过 child_process 起子进程——一来没必要，二来在受限沙箱里
 * spawn node.exe 可能直接 EBUSY，让整个报告生成失败。
 *
 * 退出码：0 = 全部通过；1 = 存在 error 级问题。
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const MP = path.join(ROOT, 'miniprogram')

/** 主包体积上限 2MB，整包（含全部分包）上限 20MB —— 微信官方限制 */
const MAIN_PACKAGE_LIMIT = 2 * 1024 * 1024
const TOTAL_LIMIT = 20 * 1024 * 1024

/** 小程序页面 / 组件的源码四件套。TS 项目里 .js 由编译器插件产出，因此这里检查 .ts */
const SCRIPT_EXTS = ['.ts', '.js']

/** 会被打进包的文件类型（用于体积统计） */
const PACKED_EXTS = new Set([
  '.ts', '.js', '.json', '.wxml', '.wxss', '.wxs',
  '.png', '.jpg', '.jpeg', '.svg', '.webp',
])
const IGNORED_DIRS = new Set(['node_modules', 'miniprogram_npm', '.git'])

/**
 * 占位页的判定依据是源码里的显式标记，而不是「wxml 体积小」这类启发式。
 * 早期用体积猜测会把 pages/webview（真实实现，但只有 266 字节）误判为占位页。
 */
const PLACEHOLDER_MARKER = '占位页面，待按'

function exists(p) {
  return fs.existsSync(p)
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}

function dirSize(dir, skipDirs = []) {
  let total = 0
  const walk = (current) => {
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || skipDirs.includes(full)) continue
        walk(full)
      } else if (PACKED_EXTS.has(path.extname(entry.name).toLowerCase())) {
        try {
          total += fs.statSync(full).size
        } catch {
          /* 忽略无法读取的文件 */
        }
      }
    }
  }
  walk(dir)
  return total
}

/**
 * 执行全部校验。
 * @returns {{errors:number,warnings:number,pages:number,implemented:number,placeholder:number,
 *            components:number,componentRefs:number,mainSize:number,totalSize:number,
 *            subPackages:Array<{name:string,size:number}>,results:Array}}
 */
function verifyProject() {
  const results = []
  let errorCount = 0
  let warnCount = 0

  const report = (level, title, detail) => {
    results.push({ level, title, detail: detail || '' })
    if (level === 'error') errorCount += 1
    if (level === 'warn') warnCount += 1
  }

  const readJson = (file, label) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      report('error', `${label} 解析失败`, `${path.relative(ROOT, file)} → ${err.message}`)
      return null
    }
  }

  /** 检查一个页面/组件目录是否具备完整四件套 */
  const checkUnit = (unitPath, kind, displayName) => {
    const dir = path.dirname(unitPath)
    const base = path.basename(unitPath)

    if (!SCRIPT_EXTS.some((ext) => exists(path.join(dir, base + ext)))) {
      report('error', `${kind}缺少脚本文件`, `${displayName} → 期望 ${base}.ts 或 ${base}.js`)
    }
    for (const ext of ['.json', '.wxml', '.wxss']) {
      if (!exists(path.join(dir, base + ext))) {
        report('error', `${kind}缺少 ${ext}`, `${displayName} → ${path.relative(MP, dir)}/${base}${ext}`)
      }
    }
  }

  // ------------------------------------------- 0. project.config.json（能否导入）
  // AppID 格式不对时，开发者工具在「导入项目」这一步就会弹「AppID 格式不正确」，
  // 属于典型的「打不开」原因，但 tsc / eslint / jest 都查不出来。
  const projectConfigPath = path.join(ROOT, 'project.config.json')
  if (!exists(projectConfigPath)) {
    report('error', '缺少 project.config.json', '开发者工具无法识别项目类型与 AppID')
  } else {
    const projectConfig = readJson(projectConfigPath, 'project.config.json')
    const appid = String(projectConfig.appid || '')
    if (appid === 'touristappid') {
      report('ok', 'AppID = touristappid', '游客模式，无需注册即可打开（不能真机调试 / 上传）')
    } else if (/^wx[0-9a-f]{16}$/.test(appid)) {
      report('ok', 'AppID 格式合法', appid)
    } else {
      report(
        'warn',
        'AppID 不是合法格式，开发者工具导入时会提示「AppID 格式不正确」',
        `当前为 ${JSON.stringify(appid)}；合法格式为 wx + 16 位十六进制，或 touristappid（游客模式）`,
      )
    }
    if (!projectConfig.miniprogramRoot) {
      report('warn', 'project.config.json 未声明 miniprogramRoot', '将默认以项目根目录为小程序根目录')
    }
  }

  // ------------------------------------------------------------ 1. app.json

  const appJsonPath = path.join(MP, 'app.json')
  const appJson = exists(appJsonPath) ? readJson(appJsonPath, 'app.json') : null
  if (!appJson) {
    report('error', '缺少 app.json', 'miniprogram/app.json 不存在，项目无法被识别为小程序')
  }

  const allPageRoutes = []
  const subPackageSizes = []
  let mainSize = 0
  let totalSize = 0

  if (appJson) {
    // 1.1 主包页面
    const pages = appJson.pages || []
    if (!pages.length) report('error', 'app.json 未声明任何页面', 'pages 数组为空')
    pages.forEach((route) => {
      allPageRoutes.push(route)
      checkUnit(path.join(MP, route), '页面', route)
    })

    // 1.2 分包页面
    const subPackages = appJson.subPackages || appJson.subpackages || []
    subPackages.forEach((pkg) => {
      const rootDir = path.join(MP, pkg.root)
      if (!exists(rootDir)) {
        report('error', '分包目录不存在', `${pkg.root}（app.json subPackages 中声明）`)
        return
      }
      ;(pkg.pages || []).forEach((route) => {
        const full = `${pkg.root}/${route}`
        allPageRoutes.push(full)
        checkUnit(path.join(MP, full), '分包页面', full)
      })
      const size = dirSize(rootDir)
      subPackageSizes.push({ name: pkg.name || pkg.root, size })
    })

    // 1.3 入口页必须在 pages 中
    if (appJson.entryPagePath) {
      if (!pages.includes(appJson.entryPagePath)) {
        report('error', 'entryPagePath 未在 pages 中登记', appJson.entryPagePath)
      } else {
        report('ok', '入口页有效', appJson.entryPagePath)
      }
    } else {
      report('warn', '未声明 entryPagePath', '将默认使用 pages 数组第一项作为启动页')
    }

    // 1.4 tabBar
    if (appJson.tabBar) {
      const list = appJson.tabBar.list || []
      if (!list.length) report('error', 'tabBar.list 为空', '自定义 tabBar 也必须在 list 中声明 4 个页面')
      list.forEach((item) => {
        if (!pages.includes(item.pagePath)) {
          report('error', 'tabBar 页面未在 pages 中登记', item.pagePath)
        }
      })
      if (appJson.tabBar.custom) {
        const customTabBar = path.join(MP, 'custom-tab-bar')
        if (!exists(customTabBar)) {
          report('error', 'tabBar.custom=true 但缺少 custom-tab-bar 目录', 'miniprogram/custom-tab-bar')
        } else {
          checkUnit(path.join(customTabBar, 'index'), '自定义 tabBar', 'custom-tab-bar/index')
          report('ok', '自定义 tabBar 已就位', `list 共 ${list.length} 项`)
        }
      }
    }

    // 1.5 preloadRule 引用的页面与分包名必须存在
    const packageNames = new Set(subPackages.map((p) => p.name || p.root))
    Object.entries(appJson.preloadRule || {}).forEach(([route, rule]) => {
      if (!allPageRoutes.includes(route)) {
        report('error', 'preloadRule 指向未登记的页面', route)
      }
      ;(rule.packages || []).forEach((name) => {
        if (!packageNames.has(name)) {
          report('error', 'preloadRule 引用了不存在的分包名', `${route} → ${name}`)
        }
      })
    })

    // 1.6 隐私合规：requiredPrivateInfos 与 permission 必须成对出现
    const privateInfos = appJson.requiredPrivateInfos || []
    if (privateInfos.length) {
      const permission = appJson.permission || {}
      const needsLocation = privateInfos.some((i) => /location/i.test(i))
      if (needsLocation && !permission['scope.userLocation']?.desc) {
        report('error', 'requiredPrivateInfos 含定位接口但 permission.scope.userLocation.desc 缺失', '微信审核会驳回')
      } else {
        report('ok', '隐私接口声明完整', `requiredPrivateInfos: ${privateInfos.join(', ')}`)
      }
    }
    if (appJson.__usePrivacyCheck__ !== true) {
      report('warn', '未开启 __usePrivacyCheck__', '基础库 2.32.3+ 建议开启，否则隐私接口在部分版本上会失败')
    } else {
      report('ok', '隐私检查开关已开启', '__usePrivacyCheck__ = true')
    }

    // 1.7 sitemap
    if (appJson.sitemapLocation && !exists(path.join(MP, appJson.sitemapLocation))) {
      report('error', 'sitemapLocation 指向的文件不存在', appJson.sitemapLocation)
    }

    // 1.8 按需注入
    if (appJson.lazyCodeLoading === 'requiredComponents') {
      report('ok', '按需注入已开启', 'lazyCodeLoading = requiredComponents，可显著降低启动耗时')
    }

    // 1.9 体积：主包 = miniprogram 下排除各分包 root
    const subRoots = subPackages.map((p) => path.join(MP, p.root))
    mainSize = dirSize(MP, subRoots)
    totalSize = mainSize + subPackageSizes.reduce((sum, p) => sum + p.size, 0)

    if (mainSize > MAIN_PACKAGE_LIMIT) {
      report('error', '主包体积超限（> 2MB）', `${formatSize(mainSize)}，需把资源挪入分包`)
    } else {
      report('ok', '主包体积合规', `${formatSize(mainSize)} / 2 MB`)
    }
    if (totalSize > TOTAL_LIMIT) {
      report('error', '整包体积超限（> 20MB）', formatSize(totalSize))
    } else {
      report('ok', '整包体积合规', `${formatSize(totalSize)} / 20 MB`)
    }
    subPackageSizes.forEach((p) => report('info', `分包 ${p.name}`, formatSize(p.size)))
  }

  // ------------------------------------------------------- 2. usingComponents 解析

  let componentRefs = 0
  const componentRefErrors = []

  const scanJsonConfigs = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        scanJsonConfigs(full)
        continue
      }
      if (!entry.name.endsWith('.json')) continue
      if (['app.json', 'sitemap.json', 'project.config.json'].includes(entry.name)) continue

      const json = readJson(full, path.relative(ROOT, full))
      if (!json || !json.usingComponents) continue

      Object.entries(json.usingComponents).forEach(([tag, target]) => {
        componentRefs += 1
        const resolved = target.startsWith('/') ? path.join(MP, target) : path.resolve(dir, target)
        const hasScript = SCRIPT_EXTS.some((ext) => exists(resolved + ext))
        if (!hasScript || !exists(resolved + '.wxml')) {
          componentRefErrors.push(
            `${path.relative(MP, full)} → <${tag} ${target}> 解析到 ${path.relative(MP, resolved)}，文件不完整`,
          )
        }
      })
    }
  }

  scanJsonConfigs(MP)
  if (componentRefErrors.length) {
    componentRefErrors.forEach((e) => report('error', 'usingComponents 指向的组件不存在', e))
  } else {
    report('ok', 'usingComponents 全部解析成功', `共 ${componentRefs} 处引用`)
  }

  // -------------------------------------------------------------- 3. 组件四件套

  const componentsDir = path.join(MP, 'components')
  const componentNames = []
  if (exists(componentsDir)) {
    const dirs = fs.readdirSync(componentsDir, { withFileTypes: true }).filter((d) => d.isDirectory())
    dirs.forEach((d) => {
      componentNames.push(d.name)
      checkUnit(path.join(componentsDir, d.name, 'index'), '组件', `components/${d.name}/index`)
    })
    report('ok', '组件四件套齐全', `${dirs.length} 个：${componentNames.join(' / ')}`)
  }

  // ------------------------------------------------------- 4. 页面数量与占位统计

  const implemented = []
  const placeholder = []
  allPageRoutes.forEach((route) => {
    const ts = path.join(MP, `${route}.ts`)
    const js = path.join(MP, `${route}.js`)
    const source = exists(ts) ? fs.readFileSync(ts, 'utf8') : exists(js) ? fs.readFileSync(js, 'utf8') : ''
    ;(source.includes(PLACEHOLDER_MARKER) ? placeholder : implemented).push(route)
  })

  report('info', '页面总数', `${allPageRoutes.length} 个（主包 + 4 分包）`)
  report('info', '完整实现页面', `${implemented.length} 个：${implemented.join('、')}`)
  report('info', '占位页面', `${placeholder.length} 个（含统一落地清单与空态骨架）`)

  if (placeholder.length) {
    const byPackage = {}
    placeholder.forEach((route) => {
      const pkg = !route.startsWith('pages/') ? route.split('/')[0] : '主包'
      byPackage[pkg] = (byPackage[pkg] || 0) + 1
    })
    report(
      'warn',
      '存在未实现页面',
      Object.entries(byPackage)
        .map(([k, v]) => `${k} ${v} 页`)
        .join('，'),
    )
  }

  return {
    errors: errorCount,
    warnings: warnCount,
    pages: allPageRoutes.length,
    implemented: implemented.length,
    placeholder: placeholder.length,
    components: componentNames.length,
    componentRefs,
    mainSize,
    totalSize,
    mainSizeText: formatSize(mainSize),
    totalSizeText: formatSize(totalSize),
    subPackages: subPackageSizes.map((p) => ({ name: p.name, size: p.size, sizeText: formatSize(p.size) })),
    implementedList: implemented,
    placeholderList: placeholder,
    componentNames,
    results,
  }
}

// ------------------------------------------------------------------ CLI

if (require.main === module) {
  const summary = verifyProject()

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(summary, null, 2))
    // 用 exitCode 而不是 process.exit()：后者会立刻终止进程，
    // Windows 上管道中尚未 flush 的 stdout 可能被截断，导致 JSON 解析失败
    process.exitCode = summary.errors > 0 ? 1 : 0
  } else {
    const ICON = { ok: '  ✔', info: '  ·', warn: '  !', error: '  ✖' }
    console.log('\n══════════ 小程序工程完整性校验 ══════════\n')
    summary.results.forEach((r) => {
      console.log(`${ICON[r.level]} ${r.title}${r.detail ? `\n      ${r.detail}` : ''}`)
    })
    console.log(`\n────────── 结果：${summary.errors} 个错误 / ${summary.warnings} 个警告 ──────────\n`)
    process.exitCode = summary.errors > 0 ? 1 : 0
  }
}

module.exports = { verifyProject }
