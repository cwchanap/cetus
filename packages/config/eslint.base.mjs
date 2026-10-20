// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Thin common JS+TS settings shared by every workspace ESLint config.
 * Astro parser/plugin rules and app-specific blocks live in the
 * consuming configs (root eslint.config.js, apps/web/eslint.config.js).
 */
export const commonRules = {
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
}

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    rules: commonRules,
  },
  {
    files: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}'],
    rules: {
      // Relax rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  }
)
