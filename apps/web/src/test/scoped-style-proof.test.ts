// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createContainer } from '@/test/createContainer'
import { appRoot } from '@/test/app-root'
import ScopedReactChild from './fixtures/ScopedReactChild.astro'

/**
 * HPA-379 Stage 2 scoped-style proof: Astro scopes a parent's <style> rules
 * with `data-astro-cid-<hash>` attributes. When the parent renders a
 * framework (React) child, the cid attribute arrives as a plain prop — the
 * child only matches the parent's scoped CSS if it forwards {...rest} onto
 * its root element. This test proves the chain on a real .astro parent:
 *
 * 1. a plain element in the fixture carries the scope's cid attribute,
 * 2. the React Card's root element carries the SAME cid attribute,
 * 3. the fixture has a scoped `.proof-target` rule, so the compiled
 *    selector `.proof-target:where([data-astro-cid-<hash>])` matches the
 *    forwarded root.
 */
describe('Astro scoped styles match migrated React components', () => {
    let container: Awaited<ReturnType<typeof createContainer>>
    let html: string

    beforeAll(async () => {
        container = await createContainer()
        html = await container.renderToString(ScopedReactChild)
    })

    function cidAttributes(): Map<string, number> {
        const cids = new Map<string, number>()
        for (const match of html.matchAll(/data-astro-cid-([a-z0-9]+)/g)) {
            cids.set(match[1], (cids.get(match[1]) ?? 0) + 1)
        }
        return cids
    }

    it('stamps the parent scope cid on the fixture wrapper element', () => {
        const wrapper = html.match(
            /<div class="proof-wrapper" data-astro-cid-([a-z0-9]+)/
        )
        expect(wrapper, 'fixture wrapper must carry a cid').not.toBeNull()
    })

    it('forwards the same cid onto the React Card root element', () => {
        const wrapperCid = html.match(
            /<div class="proof-wrapper" data-astro-cid-([a-z0-9]+)/
        )?.[1]
        expect(wrapperCid).toBeTruthy()

        // The Card root: a div whose class list contains the component's
        // own classes plus the passed proof-target class, carrying the
        // parent's cid attribute.
        const cardRoot = html.match(
            new RegExp(
                `<div class="[^"]*proof-target[^"]*"[^>]*data-astro-cid-${wrapperCid}`
            )
        )
        expect(
            cardRoot,
            `React Card root must carry the parent's cid (${wrapperCid}); cids seen: ${[...cidAttributes().keys()].join(', ')}`
        ).not.toBeNull()
    })

    it('fixture declares the scoped .proof-target rule', () => {
        const source = readFileSync(
            resolve(appRoot, 'src/test/fixtures/ScopedReactChild.astro'),
            'utf-8'
        )
        expect(source).toMatch(/\.proof-target\s*\{/)
    })
})
