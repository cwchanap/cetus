// Expo Metro config wrapped with the documented NativeWind v5 (react-native-css)
// transformer (HPA-179 Stage 2). Expo resolves workspace symlinks out of the
// box, so no watchFolders/nodeModulesPaths are set.
const { getDefaultConfig } = require('expo/metro-config')

const { withNativewind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// react-native-css inlines every CSS variable declared exactly once, which
// would freeze the runtime-overridden values below: VariableContextProvider
// swaps the font vars on load failure and the root `dark` class resolves the
// theme vars. Exclude them so they stay dynamic.
module.exports = withNativewind(config, {
  inlineVariables: {
    exclude: [
      '--cetus-ink',
      '--foreground',
      '--font-sans',
      '--cetus-display-font',
    ],
  },
})
