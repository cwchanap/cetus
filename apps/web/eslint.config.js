// @ts-check

import base, { commonRules } from '@cetus/config'
import eslintPluginAstro from 'eslint-plugin-astro'
import * as astroParser from 'astro-eslint-parser'

export default [
  ...base,
  ...eslintPluginAstro.configs.recommended,
  {
    // Ignores for the app tree; globs are relative to this config file.
    ignores: [
      'dist/',
      'node_modules/',
      '.astro/',
      '.vercel/',
      'coverage/',
      'db/',
      'public/',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
      'env.d.ts',
    ],
  },
  {
    // Portable game logic must stay free of browser globals; DOM access
    // belongs to the init/renderer web boundaries excluded below.
    files: ['src/lib/games/**/*.ts'],
    ignores: [
      '**/init*.ts',
      // Field-plate controllers (HPA-393 Stage 4) own the plate DOM the
      // same way the init boundaries do.
      '**/controller.ts',
      '**/renderer.ts',
      '**/*Renderer.ts',
      'src/lib/games/renderers/**',
      'src/lib/games/core/BaseRenderer.ts',
      'src/lib/games/core/RendererFactory.ts',
      'src/lib/games/core/notificationForwarder.ts',
      '**/*.test.ts',
      '**/*.spec.ts',
      'src/lib/games/ice-slide/daily-leaderboard.ts',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'navigator',
        'location',
        'history',
        'alert',
        'confirm',
        'prompt',
        'XMLHttpRequest',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'customElements',
      ],
    },
  },
  {
    files: ['**/*.astro'],
    languageOptions: {
      parser: astroParser,
      parserOptions: {
        parser: '@typescript-eslint/parser',
        extraFileExtensions: ['.astro'],
      },
    },
    rules: {
      // Common rules also apply inside .astro scripts (parity with the
      // pre-split single config, HPA-446 Step 3).
      ...commonRules,
      // Astro specific rules
      'astro/no-conflict-set-directives': 'error',
      'astro/no-unused-define-vars-in-style': 'error',
    },
  },
  {
    files: ['src/test/**/*.{js,ts}'],
    rules: {
      // Relax rules for test helpers
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
]
