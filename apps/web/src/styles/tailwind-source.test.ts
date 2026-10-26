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

// Canaries: utilities emitted only from packages/ui source, one per
// consumption path — the first belongs to Pagination's page buttons
// (consumed server-side by the achievements page), the second to
// AchievementAwardCard (consumed only through the hydrated
// AppNotifications island). After Stage 2 deleted the .astro twins,
// apps/web no longer mentions either — if that changes, update the canaries
// along with the code. Assembled from parts so this file itself never
// contains the literals (the scan below must treat this test as
// canary-free).
const CANARIES = ['min-w-' + '[40px]', 'min-h-' + '[480px]']

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
    it('canary utilities appear only in packages/ui source', () => {
        const read = (file: string) => {
            try {
                return readFileSync(file, 'utf-8')
            } catch {
                return ''
            }
        }
        const uiFiles = [...walk(resolve(appRoot, '../../packages/ui/src'))]
        const webFiles = [...walk(appRoot + '/src')]

        for (const canary of CANARIES) {
            expect(
                uiFiles.some(file => read(file).includes(canary)),
                `${canary} must exist in packages/ui sources`
            ).toBe(true)

            const webHits = webFiles.filter(file => read(file).includes(canary))
            expect(
                webHits,
                `${canary} must stay package-only; found in: ${webHits.map(f => relative(appRoot, f)).join(', ')}`
            ).toEqual([])
        }
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
        for (const canary of CANARIES) {
            const selector =
                '.' + canary.replaceAll('[', '\\[').replaceAll(']', '\\]')
            expect(builtCss).toContain(selector)
        }
    })
})
