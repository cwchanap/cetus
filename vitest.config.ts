import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        include: [
            'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'src/test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        ],
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
        },
    },
})
