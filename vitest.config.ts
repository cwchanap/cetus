import { resolve } from 'path'
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
                // These names are type-only in apps/web; in packages the same
                // names carry executable config factories and route handlers,
                // so they must stay measured.
                'apps/web/src/**/types.ts',
                'apps/web/src/**/frameworkTypes.ts',
                'apps/web/src/lib/**/index.ts',
                '**/*.astro',
                '**/*.test.ts',
                '**/*.test.tsx',
                '**/*.test-d.ts',
                '**/*.spec.ts',
                '**/*.spec.tsx',
            ],
        },
        projects: [
            'apps/web/vitest.config.ts',
            {
                // React UI package (HPA-379): jsdom + the shared jest-dom
                // setup file. The `@` alias mirrors apps/web's config because
                // setup.ts registers a mock keyed on `@/lib/auth-client`.
                test: {
                    name: 'ui',
                    environment: 'jsdom',
                    globals: true,
                    setupFiles: ['./apps/web/src/test/setup.ts'],
                    include: ['packages/ui/src/**/*.test.{ts,tsx}'],
                },
                resolve: {
                    alias: {
                        '@': resolve(__dirname, './apps/web/src'),
                    },
                },
            },
            {
                // Portable hooks package (HPA-393): React hook tests run in
                // jsdom; pure adapter files override per-file with the
                // `// @vitest-environment node` docblock.
                test: {
                    name: 'app-core',
                    environment: 'jsdom',
                    globals: true,
                    include: ['packages/app-core/src/**/*.test.{ts,tsx}'],
                },
            },
            {
                test: {
                    name: 'shared',
                    environment: 'node',
                    globals: true,
                    include: ['packages/shared/src/**/*.test.ts'],
                },
            },
            {
                test: {
                    name: 'games',
                    environment: 'node',
                    globals: true,
                    include: ['packages/games/src/**/*.test.ts'],
                },
            },
            {
                test: {
                    name: 'api-client',
                    environment: 'node',
                    globals: true,
                    include: ['packages/api-client/src/**/*.test.ts'],
                },
            },
        ],
    },
})
