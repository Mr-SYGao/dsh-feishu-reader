// Boot-path diagnostic: verifies a profile's dsh.profile.bundles resolve and
// parse — mirrors what DSH does at startup (dsh-app-boot loadProfile).
// A bundle layer is OK when its package.json declares dsh.bundle.patch and the
// patch list parses. Run after `dsh plugin add` to confirm the plugin will
// auto-load on restart.
//
// Usage:
//   node scripts/verify-boot.mjs [profileName] [appUnpackedPath]
//   DSH_APP_UNPACKED env can supply the app path instead.
import { loadProfile } from 'file:///D:/software/DSH%20Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'

const profiles = process.argv[2] ? [process.argv[2]] : ['desktop', 'web', 'feishutest']
const unpacked = process.env.DSH_APP_UNPACKED || 'D:/software/DSH Desktop/resources/app.asar.unpacked'
const home = process.env.DSH_HOME || 'C:/Users/Mr.Gao/.dsh'
const anchor = unpacked + '/node_modules/@deepseek-ai/dsh/package.json'

let failed = 0
for (const profile of profiles) {
  try {
    const p = loadProfile('dsh', profile, anchor, home, { userLayer: true })
    const feishu = p.layers.filter((l) => l.packageName === 'dsh-feishu-reader')
    console.log(`== profile ${profile}: ${p.layers.length} bundle layers ==`)
    for (const l of feishu) {
      console.log(`  packageName: ${l.packageName}`)
      console.log(`  patchPath:   ${l.patchPath}`)
      console.log(`  patches:     ${JSON.stringify(l.patches)}`)
    }
    if (!feishu.length) {
      console.log('  !! dsh-feishu-reader NOT in bundle layers')
      failed++
    }
  } catch (e) {
    console.log(`== profile ${profile}: FAILED ==`)
    console.log(String(e && e.stack ? e.stack : e))
    failed++
  }
}
process.exit(failed ? 1 : 0)
