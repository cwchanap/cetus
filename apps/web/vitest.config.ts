import { defineConfig } from 'vitest/config'
import { getViteConfig } from 'astro/config'
import { resolve } from 'path'

// `getViteConfig` returns an Astro `UserConfig` whose generated type omits the
// vitest `test` key. Narrow the escape to exactly that boundary: build a typed
// Vitest `UserConfig` (which DOES include `test`), and cast only the input to
// `getViteConfig` / its output back across the incompatibility boundary.
type VitestUserConfig = Parameters<typeof defineConfig>[0]

const vitestConfig: VitestUserConfig = {
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        include: [
            'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'src/test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        ],
        coverage: {
            provider: 'v8',
            exclude: [
                'e2e/**',
                'node_modules/**',
                '**/*.config.*',
                '**/types.ts',
                '**/index.ts',
                '**/*.astro',
            ],
        },
        env: {
            TURSO_DATABASE_URL: 'libsql://test-db.turso.io',
            TURSO_AUTH_TOKEN: 'test-token',
            BETTER_AUTH_SECRET: 'test-secret',
            BETTER_AUTH_URL: 'http://localhost:4321',
            GOOGLE_CLIENT_ID: 'test-google-client-id',
            GOOGLE_CLIENT_SECRET: 'test-google-secret',
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            'astro:middleware': resolve(
                __dirname,
                './src/test/mocks/astro-middleware.ts'
            ),
        },
    },
}

export default defineConfig(
    getViteConfig(
        vitestConfig as Parameters<typeof getViteConfig>[0]
    ) as VitestUserConfig
)
