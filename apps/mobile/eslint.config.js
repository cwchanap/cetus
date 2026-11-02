// @ts-check

import base from '@cetus/config'

export default [
  ...base,
  {
    // Ignores for the app tree; globs are relative to this config file.
    ignores: [
      'node_modules/',
      '.expo/',
      'ios/',
      'android/',
      'dist/',
      'web-build/',
      '*.config.js',
    ],
  },
]
