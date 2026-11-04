'use strict'

const { realpathSync } = require('node:fs')
const path = require('node:path')

const uiPackageRoot = realpathSync(
  path.resolve(__dirname, '..', '..', 'packages', 'ui')
)
const uiSourceRoot = path.join(uiPackageRoot, 'src')

const NATIVE_PLATFORMS = new Set(['ios', 'android'])
const NATIVE_SAFE_UI_FILES = new Set([path.join('lib', 'utils.ts')])

const pathInside = (root, filePath) => {
  const rel = path.relative(root, filePath)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
    ? rel
    : null
}

const isAllowedOnNative = filePath => {
  const relToSource = pathInside(uiSourceRoot, filePath)
  if (relToSource !== null) {
    return (
      path.basename(relToSource).includes('.native.') ||
      NATIVE_SAFE_UI_FILES.has(relToSource)
    )
  }
  if (pathInside(uiPackageRoot, filePath) !== null) {
    return !filePath.endsWith('.css')
  }
  return true
}

const withWebOnlyUiGuard = innerResolveRequest => {
  return (context, specifier, platform) => {
    const resolve = innerResolveRequest ?? context.resolveRequest
    const resolution = resolve(context, specifier, platform)
    if (
      resolution !== null &&
      typeof resolution === 'object' &&
      resolution.type === 'sourceFile' &&
      NATIVE_PLATFORMS.has(platform) &&
      !isAllowedOnNative(resolution.filePath)
    ) {
      throw new Error(
        `[metro-native-guard] "${specifier}" resolved to a web-only @cetus/ui module on ${platform}: ${resolution.filePath}. Only the package root, @cetus/ui/components/* native files and @cetus/ui/lib/utils may be imported from native code.`
      )
    }
    return resolution
  }
}

module.exports = { isAllowedOnNative, withWebOnlyUiGuard }
