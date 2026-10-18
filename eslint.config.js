// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintPluginAstro from 'eslint-plugin-astro'
import * as astroParser from 'astro-eslint-parser'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    ignores: [
      'dist/',
      'node_modules/',
      '.astro/',
      '.vercel/',
      '.worktrees/',
      'coverage/',
      'db/',
      '.superpowers/',
      'public/',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
      'env.d.ts',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,astro}'],
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // General rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],

      // Import/export rules
      'no-duplicate-imports': 'error',
    },
  },
  {
    // Portable game logic must stay free of browser globals; DOM access
    // belongs to the init/renderer web boundaries excluded below.
    files: ['src/lib/games/**/*.ts'],
    ignores: [
      '**/init*.ts',
      '**/renderer.ts',
      '**/*Renderer.ts',
      'src/lib/games/renderers/**',
      'src/lib/games/core/BaseRenderer.ts',
      'src/lib/games/core/RendererFactory.ts',
      'src/lib/games/core/GameInitializer.ts',
      '**/*.test.ts',
      '**/*.spec.ts',
      'src/lib/games/ice-slide/daily-leaderboard.ts',
    ],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document'],
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
      // Astro specific rules
      'astro/no-conflict-set-directives': 'error',
      'astro/no-unused-define-vars-in-style': 'error',
    },
  },
  {
    files: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}', 'src/test/**/*.{js,ts}'],
    rules: {
      // Relax rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  }
)
