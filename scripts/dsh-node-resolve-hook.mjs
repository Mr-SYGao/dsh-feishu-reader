// 测试专用：把 @deepseek-ai/* 的 bare specifier 解析锚点指到 DSH 的
// profiles 共享 node_modules（DSH host 运行时实际解析处）。仅用于
// verify-host.mjs 在仓库里加载 lib/index.js；不影响运行时。
import { pathToFileURL } from 'node:url'

const SHARED_DIR = 'C:/Users/Mr.Gao/.dsh/profiles/node_modules'

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@deepseek-ai/')) {
    const parent = pathToFileURL(SHARED_DIR + '/__hook_anchor__.js').href
    return nextResolve(specifier, { ...context, parentURL: parent })
  }
  return nextResolve(specifier, context)
}
