import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        include: [
            'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'src/test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        ],
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
})
