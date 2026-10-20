// @ts-check

import base from '@cetus/config'

export default [
  ...base,
  {
    // Ignores for root and packages/* files. ESLint 10 resolves the nearest
    // config per source file, so the moved app tree is covered by the
    // ignores in apps/web/eslint.config.js (HPA-446 Step 3).
    ignores: [
      '**/dist/',
      '**/node_modules/',
      '**/.astro/',
      '**/.vercel/',
      '.worktrees/',
      '**/coverage/',
      '**/db/',
      '.superpowers/',
      '**/public/',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.ts',
      '**/env.d.ts',
    ],
  },
]
