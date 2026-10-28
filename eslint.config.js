// @ts-check

import base from '@cetus/config'

// Framework/DB/web-source bans shared by every portable package (HPA-447).
// Repeated inside each package-scoped block below: ESLint rule options
// replace rather than merge across config entries for the same rule.
const packageBoundaryPatterns = [
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
    message: 'the @/ alias is web-only; use relative or @cetus/* imports',
  },
  {
    group: ['@cetus/web', '**/apps/web', '**/apps/web/**'],
    message: 'packages must not import apps/web; move portable code down',
  },
]

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
    files: ['packages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: packageBoundaryPatterns }],
    },
  },
  // Dependency direction: shared is the base package (imports nothing
  // workspace-local); games/api-client may only depend on @cetus/shared.
  {
    files: ['packages/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...packageBoundaryPatterns,
            {
              group: ['@cetus/*', '@cetus/**'],
              message:
                '@cetus/shared is the base package; it cannot depend on other workspace packages',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/{games,api-client}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...packageBoundaryPatterns,
            {
              group: [
                '@cetus/games',
                '@cetus/games/**',
                '@cetus/api-client',
                '@cetus/api-client/**',
                '@cetus/tokens',
                '@cetus/tokens/**',
              ],
              message:
                'only @cetus/shared imports are allowed; sideways package imports are banned',
            },
          ],
        },
      ],
    },
  },
  // Dependency direction for the React UI package (HPA-379): it may use
  // @cetus/shared types and @cetus/tokens CSS tokens, never game rules,
  // the API client, framework or server code. (react/react-dom and
  // clsx/tailwind-merge are unrestricted; boundary bans above still apply.)
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...packageBoundaryPatterns,
            {
              group: [
                '@cetus/games',
                '@cetus/games/**',
                '@cetus/api-client',
                '@cetus/api-client/**',
              ],
              message:
                '@cetus/ui may only depend on @cetus/shared and @cetus/tokens',
            },
          ],
        },
      ],
    },
  },
  // Dependency direction for the portable hooks package (HPA-393): it may
  // depend on @cetus/shared and @cetus/games (peer) only — never the API
  // client, UI components, tokens, framework or server code.
  {
    files: ['packages/app-core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...packageBoundaryPatterns,
            {
              group: [
                '@cetus/api-client',
                '@cetus/api-client/**',
                '@cetus/ui',
                '@cetus/ui/**',
                '@cetus/tokens',
                '@cetus/tokens/**',
              ],
              message:
                '@cetus/app-core may only depend on @cetus/shared and @cetus/games',
            },
          ],
        },
      ],
    },
  },
  // DOM globals are banned in app-core production sources (HPA-393): hooks
  // and adapters stay portable; only jsdom test files may touch them. The
  // no-DOM tsconfig lib already excludes them at compile time.
  {
    files: ['packages/app-core/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message: 'app-core production source must not use browser globals',
        },
        {
          name: 'document',
          message: 'app-core production source must not use browser globals',
        },
        {
          name: 'HTMLElement',
          message: 'app-core production source must not use browser globals',
        },
      ],
    },
  },
]
