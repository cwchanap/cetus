// @ts-check

import base from '@cetus/config'

export default [
  ...base,
  {
    // Ignores for root and packages/* files. ESLint 10 resolves the nearest
    // config per source file, so the moved app tree is covered by the
    // ignores in apps/web/eslint.config.js (HPA-446 Step 3). App paths are
    // listed explicitly — `**/db/` or `**/*.config.*` would also exempt
    // future packages/* code from linting.
    ignores: [
      '**/dist/',
      '**/node_modules/',
      '**/.astro/',
      '**/.vercel/',
      '.worktrees/',
      '**/coverage/',
      'apps/web/db/',
      '.superpowers/',
      'apps/web/public/',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
      'apps/web/env.d.ts',
    ],
  },
]
