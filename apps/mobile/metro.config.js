// Stock Expo Metro config for the Bun workspace: Expo resolves workspace
// symlinks out of the box, so no watchFolders/nodeModulesPaths are set.
// Stage 2 (HPA-179) wraps this with the NativeWind v5 withNativeWind call.
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

module.exports = config
