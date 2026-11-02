// Expo Metro config wrapped with the documented NativeWind v5 (react-native-css)
// transformer (HPA-179 Stage 2). Expo resolves workspace symlinks out of the
// box, so no watchFolders/nodeModulesPaths are set.
const { getDefaultConfig } = require('expo/metro-config')

const { withNativewind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

module.exports = withNativewind(config)
