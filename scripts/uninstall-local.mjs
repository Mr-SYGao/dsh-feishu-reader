#!/usr/bin/env node
// dsh-feishu-reader 本地卸载（install-local.mjs 的反向操作）
// 用法：node scripts/uninstall-local.mjs [--profile desktop]
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const profileName = (args.find((a) => a.startsWith('--profile=')) || '').split('=')[1] || process.env.DSH_PROFILE || 'desktop'
const home = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
const profileDir = path.join(home, 'profiles', profileName)
const target = path.join(profileDir, 'plugins', 'dsh-feishu-reader')
const pkgName = 'dsh-feishu-reader'

const pkgPath = path.join(profileDir, 'package.json')
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  delete pkg.dependencies?.[pkgName]
  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  pkg.dsh.profile.bundles = (pkg.dsh.profile.bundles || []).filter((b) => b !== pkgName)
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`→ 已从 ${pkgName} deps/bundles 移除`)
}
rmSync(target, { recursive: true, force: true })
console.log('→ pnpm install …')
const run = (args) => {
  const res = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec, ['/d', '/s', '/c', args.join(' ')], { cwd: profileDir, stdio: 'inherit' })
    : spawnSync('pnpm', args, { cwd: profileDir, stdio: 'inherit' })
  if (res.error) throw res.error
  return res
}
run(['pnpm', 'install'])
console.log('✅ 已卸载，重启 DSH 生效')
