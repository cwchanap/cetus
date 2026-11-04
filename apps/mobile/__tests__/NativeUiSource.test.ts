/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'

/**
 * Built-CSS assertion for the native @cetus/ui @source wiring (HPA-182):
 * mobile global.css must scan packages/ui's *.native.tsx sources so the
 * shared components' utilities are generated, while never scanning the web
 * DOM components. Mirrors apps/web/src/styles/tailwind-source.test.ts,
 * which replicates the @tailwindcss/postcss pipeline (compile -> Scanner
 * over auto root + @source entries -> build).
 */

const mobileRoot = resolve(__dirname, '..')
const globalCssPath = resolve(mobileRoot, 'global.css')
const globalCss = readFileSync(globalCssPath, 'utf-8')

// Canaries: utilities emitted only from packages/ui *.native.tsx sources.
// Assembled from parts so this file never contains the literals — the file
// itself sits inside the auto-detection root and is scanned.
const NATIVE_CANARIES = ['active:' + 'opacity-80', 'border-' + 't-2']

// Web-only utilities found in packages/ui DOM components; none may be
// scanned into the mobile stylesheet.
const WEB_ONLY = ['backdrop-blur-' + 'sm', 'underline-offset-' + '4']

function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (full.includes('node_modules')) {
            continue
        }
        const stat = statSync(full)
        if (stat.isDirectory()) {
            yield* walk(full)
        } else {
            yield full
        }
    }
}

const read = (file: string) => {
    try {
        return readFileSync(file, 'utf-8')
    } catch {
        return ''
    }
}

describe('Tailwind generates native @cetus/ui utilities', () => {
    const uiSrc = resolve(mobileRoot, '../../packages/ui/src')

    it('canary utilities exist only in .native.tsx sources', () => {
        const nativeFiles = [...walk(uiSrc)].filter(f =>
            f.endsWith('.native.tsx')
        )
        const otherFiles = [...walk(uiSrc)].filter(
            f => !f.endsWith('.native.tsx')
        )

        expect(nativeFiles.length).toBeGreaterThan(0)
        for (const canary of NATIVE_CANARIES) {
            // The canary must exist in a .native.tsx source and nowhere else.
            expect(nativeFiles.some(file => read(file).includes(canary))).toBe(
                true
            )
            const webHits = otherFiles.filter(file =>
                read(file).includes(canary)
            )
            expect(webHits).toEqual([])
        }
    })

    it('compiles the native utility via the @source wiring, without scanning web UI sources', async () => {
        const compiler = await compile(globalCss, {
            base: dirname(globalCssPath),
            onDependency: () => {},
        })

        // Auto-detection root (apps/mobile) plus every explicit @source entry.
        const sources =
            compiler.root === 'none'
                ? []
                : compiler.root === null
                  ? [{ base: mobileRoot, pattern: '**/*', negated: false }]
                  : [{ ...compiler.root, negated: false }]
        const scanner = new Scanner({
            sources: sources.concat(compiler.sources),
        })

        const candidates = new Set(scanner.scan())

        for (const canary of NATIVE_CANARIES) {
            // Scanner must see the native-only candidates.
            expect(candidates.has(canary)).toBe(true)
        }
        for (const webOnly of WEB_ONLY) {
            // Web-only utilities must never be scanned into this stylesheet.
            expect(candidates.has(webOnly)).toBe(false)
        }

        const builtCss = compiler.build([...candidates])
        for (const canary of NATIVE_CANARIES) {
            const selector =
                '.' + canary.replaceAll(':', '\\:').replaceAll('/', '\\/')
            expect(builtCss).toContain(selector)
        }
    })
})
