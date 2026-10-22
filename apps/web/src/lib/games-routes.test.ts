import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { GAMES, getGameUrl } from '@cetus/shared/games'
import { appRoot } from '@/test/app-root'

// Web-side companion to the portable `getGameUrl` tests in
// @cetus/shared: URL derivation is pure, but verifying that every derived
// slug maps to a real Astro route requires this app's page tree.
describe('getGameUrl route derivation (web routes)', () => {
    it('derives a URL that maps to an existing page route for every game', () => {
        const pagesDir = resolve(appRoot, 'src/pages')
        for (const game of GAMES) {
            const url = getGameUrl(game.id)
            const slug = url.slice(1)
            // Accept any valid Astro route shape: a directory route
            // (src/pages/<slug>/...), a file-backed page
            // (src/pages/<slug>.astro), or an index page
            // (src/pages/<slug>/index.astro).
            const routeDir = resolve(pagesDir, slug)
            const fileRoute = resolve(pagesDir, `${slug}.astro`)
            const indexRoute = resolve(pagesDir, slug, 'index.astro')
            const routeExists =
                existsSync(routeDir) ||
                existsSync(fileRoute) ||
                existsSync(indexRoute)
            expect(routeExists).toBe(true)
        }
    })
})
