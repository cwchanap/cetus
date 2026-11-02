// Native tests run through jest-expo (Stage 2, HPA-179); the root Vitest
// workspace does not include this project on purpose.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Workspace TS sources resolve through node_modules symlinks; transform
  // them (and the native deps jest-expo already allowlists) for Node.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|@cetus/.*|nativewind|react-native-css))',
  ],
}
