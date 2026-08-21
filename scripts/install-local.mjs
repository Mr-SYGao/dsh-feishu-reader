#!/usr/bin/env node
// dsh-feishu-reader 一键本地安装（与 modlens 等 bundle 插件同款机制）
//
// 用法：node scripts/install-local.mjs [--profile desktop] [--prefix <npm_prefix>]
//
// 做什么：
//   1. 把 lib/ 包复制到 profile 的 plugins/dsh-feishu-reader/
//   2. 在 profile package.json 加依赖 + 注册到 dsh.profile.bundles
//   3. pnpm install 链接该包
//   4. 提示重启 DSH 生效
// 卸载：node scripts/uninstall-local.mjs（或手动删 deps/bundles + pnpm install）
import { readFileSync, writeFileSync, cpSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const profileName = (args.find((a) => a.startsWith('--profile=')) || '').split('=')[1] || process.env.DSH_PROFILE || 'desktop'
const home = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
const profileDir = path.join(home, 'profiles', profileName)
const pluginsDir = path.join(profileDir, 'plugins')
const target = path.join(pluginsDir, 'dsh-feishu-reader')
const pkgName = 'dsh-feishu-reader'

if (!existsSync(profileDir)) {
  console.error(`✗ profile 目录不存在：${profileDir}`)
  process.exit(1)
}

// 1. 复制包
console.log(`→ 复制 lib/ → ${target}`)
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(path.join(root, 'lib'), target, {
  recursive: true,
  filter: (src) => !src.includes('node_modules') && !src.endsWith('.test.js')
})

// 2. 更新 profile package.json
const pkgPath = path.join(profileDir, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
pkg.dependencies = pkg.dependencies || {}
if (!pkg.dependencies[pkgName]) {
  pkg.dependencies[pkgName] = 'file:plugins/dsh-feishu-reader'
  console.log(`→ dependencies.${pkgName} = file:plugins/dsh-feishu-reader`)
}
pkg.dsh = pkg.dsh || {}
pkg.dsh.profile = pkg.dsh.profile || {}
pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || []
if (!pkg.dsh.profile.bundles.includes(pkgName)) {
  pkg.dsh.profile.bundles.push(pkgName)
  console.log(`→ dsh.profile.bundles 追加 ${pkgName}`)
}
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

// 3. pnpm install
console.log('→ pnpm install …')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const res = spawnSync(pnpm, ['install'], { cwd: profileDir, stdio: 'inherit', shell: process.platform === 'win32' })
if (res.status !== 0) {
  console.error(`✗ pnpm install 失败（exit ${res.status}）`)
  process.exit(1)
}

console.log('\n✅ 安装完成！重启 DSH 后自动加载。')
console.log('   验证：设置 → 插件 → 插件配置 出现「飞书」卡片；工具列表有 feishu_read / feishu_configure')
console.log('   卸载：node scripts/uninstall-local.mjs 或手动删 deps/bundles + pnpm install')
