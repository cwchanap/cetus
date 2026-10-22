// @vitest-environment node
import { describe, it, expect } from 'vitest'
import config from '../../playwright.config'

// Guards the local-E2E failure mode where a server already listening on :4325
// made Playwright skip the webServer command entirely — e2e:db:init never ran
// and E2E_FILE_DB was unset, so the suite silently hit a dev server backed by
// the real Turso DB.
describe('playwright webServer config', () => {
    const webServer = Array.isArray(config.webServer)
        ? config.webServer[0]
        : config.webServer

    it('never reuses an existing server on the E2E port', () => {
        expect(webServer?.reuseExistingServer).toBe(false)
    })

    it('initializes the schema and boots with the file-backed E2E database', () => {
        expect(webServer?.command).toContain('bun run e2e:db:init')
        expect(webServer?.command).toContain('E2E_FILE_DB=1')
        expect(webServer?.url).toBe('http://localhost:4325')
        expect(config.use?.baseURL).toBe(webServer?.url)
    })
})
