import { defineConfig } from 'vitest/config'
import { getViteConfig } from 'astro/config'
import { resolve } from 'path'

// `getViteConfig` returns an Astro `UserConfig` whose generated type omits the
// vitest `test` key. Narrow the escape to exactly that boundary: build a typed
// Vitest `UserConfig` (which DOES include `test`), and cast only the input to
// `getViteConfig` / its output back across the incompatibility boundary.
type VitestUserConfig = Parameters<typeof defineConfig>[0]

const vitestConfig: VitestUserConfig = {
    // Islands (.tsx) compile with the automatic JSX runtime in both the Astro
    // build and tests; without this, the classic transform needs a React
    // import in every test file.
    esbuild: {
        jsx: 'automatic',
    },
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
        server: {
            deps: {
                // createContainer loads @astrojs/react's server renderer via
                // loadRenderers; that module imports the astro:react:opts
                // virtual module. Left external (the node_modules default),
                // Node's ESM loader receives the astro: protocol and throws.
                // Inline these so Vite transforms them and the aliases above
                // apply.
                inline: [
                    /node_modules\/@astrojs\/react\//,
                    /node_modules\/astro\/dist\/virtual-modules\//,
                ],
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            // The astro:container virtual module is provided by Astro's vite
            // plugin only when getViteConfig can load the Astro config. Under
            // the root workspace config (project reference, cwd = repo root)
            // it isn't registered, so alias to the same implementation module
            // directly — identical to what the plugin virtualizes.
            'astro:container': resolve(
                __dirname,
                '../../node_modules/astro/dist/virtual-modules/container.js'
            ),
            // Same story for @astrojs/react's virtual module, which the React
            // server renderer imports when the container loads it.
            'astro:react:opts': resolve(
                __dirname,
                './src/test/mocks/astro-react-opts.ts'
            ),
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
