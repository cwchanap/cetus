// Expo 57 discovers postcss.config.js (not .cjs) and runs it over imported
// CSS; @tailwindcss/postcss compiles Tailwind 4 utilities before
// react-native-css turns them into React Native styles (NativeWind v5 setup).
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
