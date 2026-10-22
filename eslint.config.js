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
  // Persistent package-boundary enforcement (HPA-447): portable code under
  // packages/** must not import web/framework/DB modules. Bun's hoisted
  // install and TS skipLibCheck would otherwise hide invalid dependencies.
  {
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pixi.js', 'pixi.js/*'],
              message: 'packages must not depend on PixiJS renderers',
            },
            {
              group: ['astro', 'astro:*', 'astro/*'],
              message: 'packages must not depend on Astro',
            },
            {
              group: ['better-auth', 'better-auth/*'],
              message: 'packages must not depend on Better Auth',
            },
            {
              group: ['kysely', '@libsql/client', '@libsql/kysely-libsql'],
              message: 'packages must not depend on the database layer',
            },
            {
              group: ['@', '@/*'],
              message:
                'the @/ alias is web-only; use relative or @cetus/* imports',
            },
            {
              group: ['@cetus/web', '**/apps/web', '**/apps/web/**'],
              message:
                'packages must not import apps/web; move portable code down',
            },
          ],
        },
      ],
    },
  },
]
