import { defineConfig } from 'vitest/config'

/**
 * Root Vitest workspace config (HPA-447 Stage 1).
 *
 * Canonical test entrypoint for the monorepo: `test.projects` covers
 * apps/web (unchanged jsdom/Astro setup, declared in apps/web/vitest.config.ts)
 * plus one Node-environment project per TS-bearing package. Root
 * `test:run`/`test:coverage` aggregate every project into a single
 * `coverage/` report so extracted package sources cannot disappear from
 * coverage reporting.
 */
export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            reportsDirectory: 'coverage',
            include: ['apps/web/src/**', 'packages/*/src/**'],
            exclude: [
                'e2e/**',
                'node_modules/**',
                '**/*.config.*',
                '**/types.ts',
                '**/index.ts',
                '**/*.astro',
                '**/*.test.ts',
                '**/*.spec.ts',
            ],
        },
        projects: [
            'apps/web/vitest.config.ts',
            {
                test: {
                    name: 'shared',
                    environment: 'node',
                    globals: true,
                    include: ['packages/shared/src/**/*.test.ts'],
                },
            },
        ],
    },
})
