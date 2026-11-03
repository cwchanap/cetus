// Expo Metro config wrapped with the documented NativeWind v5 (react-native-css)
// transformer (HPA-179 Stage 2). Expo resolves workspace symlinks out of the
// box, so no watchFolders/nodeModulesPaths are set.
const { getDefaultConfig } = require('expo/metro-config')

const { withNativewind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// react-native-css inlines every CSS variable declared exactly once. The
// chrome tokens below are declared once in @cetus/tokens :root and read at
// runtime via useNativeVariable for header/tab-bar props — inlining would
// drop them from the runtime variable context. (Multi-declared vars like
// --foreground, --cetus-ink, --font-sans and --cetus-display-font are never
// inlined anyway and need no exclusion.)
module.exports = withNativewind(config, {
  inlineVariables: {
    exclude: [
      '--cetus-canvas',
      '--cetus-chrome',
      '--cetus-chrome-ink',
      '--cetus-chrome-tint',
      '--cetus-chrome-muted',
      '--cetus-chrome-border',
    ],
  },
})
