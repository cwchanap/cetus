// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import { appRoot } from '@/test/app-root'

/**
 * Built-CSS assertion owed from HPA-379 Stage 1: utilities used ONLY by
 * @cetus/ui sources must be generated, proving Tailwind's `@source
 * "../../../../packages/ui"` wiring actually feeds the compiler.
 *
 * The test replicates the exact pipeline @tailwindcss/vite runs
 * (compile -> Scanner over auto root + @source entries -> build) so no full
 * `astro build` is needed, then asserts the canary utility's rule appears in
 * the compiled stylesheet.
 */

const globalCssPath = resolve(appRoot, 'src/styles/global.css')
const globalCss = readFileSync(globalCssPath, 'utf-8')

// Canary: a utility emitted only from packages/ui source (Pagination's page
// buttons). After Stage 2 deleted the .astro twins, apps/web no longer
// mentions it — if that changes, update the canary along with the code.
// Assembled from parts so this file itself never contains the literal
// (the scan below must treat this test as canary-free).
const CANARY = 'min-w-' + '[40px]'

function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (full.includes('node_modules') || full.includes('/.astro/')) {
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

describe('Tailwind generates @cetus/ui utilities (built-CSS assertion)', () => {
    it('canary utility appears only in packages/ui source', () => {
        const uiHit = [...walk(resolve(appRoot, '../../packages/ui/src'))].some(
            file => {
                try {
                    return readFileSync(file, 'utf-8').includes(CANARY)
                } catch {
                    return false
                }
            }
        )
        expect(uiHit, `${CANARY} must exist in packages/ui sources`).toBe(true)

        const webHits = [...walk(appRoot + '/src')].filter(file => {
            try {
                return readFileSync(file, 'utf-8').includes(CANARY)
            } catch {
                return false
            }
        })
        expect(
            webHits,
            `${CANARY} must stay package-only; found in: ${webHits.map(f => relative(appRoot, f)).join(', ')}`
        ).toEqual([])
    })

    it('compiles the canary utility into the built CSS via the @source wiring', async () => {
        const compiler = await compile(globalCss, {
            base: dirname(globalCssPath),
            onDependency: () => {},
        })

        // Mirror @tailwindcss/vite: auto-detection root (or none) plus every
        // explicit @source entry.
        const sources =
            compiler.root === 'none'
                ? []
                : compiler.root === null
                  ? [{ base: appRoot, pattern: '**/*', negated: false }]
                  : [{ ...compiler.root, negated: false }]
        const scanner = new Scanner({
            sources: sources.concat(compiler.sources),
        })

        const candidates = new Set(scanner.scan())
        expect(
            [...candidates].some(c => c.includes('min-w-')),
            'scanner must see packages/ui candidates'
        ).toBe(true)

        const builtCss = compiler.build([...candidates])
        // Brackets are CSS-escaped in the generated selector.
        expect(builtCss).toContain('.min-w-\\[40px\\]')
    })
})
