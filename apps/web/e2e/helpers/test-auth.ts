import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { libsql, LibsqlDialect } from '@libsql/kysely-libsql'
import { betterAuth } from 'better-auth'
import { testUtils } from 'better-auth/plugins'
import type { Page } from '@playwright/test'
import { appRoot } from '../../src/test/app-root'

/**
 * E2E authentication seeding.
 *
 * The app is Google-OAuth-only (there is no email/password sign-in to drive
 * from a spec), so authenticated E2E flows seed a real session instead:
 * a test-only Better Auth instance bound to the SAME isolated E2E file DB and
 * the SAME BETTER_AUTH_SECRET as the dev server creates a user + session row
 * and returns the signed session cookie. The app then treats the page as
 * normally signed-in — no mocks on the auth or score paths.
 *
 * Paths anchor to `appRoot` (the apps/web package root, resolved from the
 * module location, not process.cwd()) so the helper works no matter which
 * directory Playwright was launched from. The resolved db path matches
 * `src/lib/server/db/client.ts`'s file-DB resolution.
 */

function loadAuthSecret(): string {
    const fromEnv = process.env.BETTER_AUTH_SECRET
    if (fromEnv) {
        return fromEnv
    }
    // Local runs keep CI dummy values in apps/web/.env (git-ignored); the
    // Playwright process does not load that file automatically.
    const env = readFileSync(resolve(appRoot, '.env'), 'utf8')
    const match = env.match(/^BETTER_AUTH_SECRET=(.+)$/m)
    if (!match) {
        throw new Error(
            'BETTER_AUTH_SECRET not found in env or apps/web/.env — cannot seed an E2E session'
        )
    }
    return match[1].trim().replace(/^["']|["']$/g, '')
}

let cachedDialect: LibsqlDialect | undefined

async function buildTestHelpers() {
    if (!cachedDialect) {
        // Same client construction as scripts/init-e2e-db.ts: the re-export
        // from @libsql/kysely-libsql matches what LibsqlDialect expects. The
        // dev server holds the same file open, so writes from this process
        // need a busy timeout to survive brief cross-process lock contention.
        const client = libsql.createClient({
            url: `file:${resolve(appRoot, 'db', 'db.sqlite')}`,
        })
        await client.execute('PRAGMA busy_timeout = 5000')
        cachedDialect = new LibsqlDialect({ client })
    }
    const testAuth = betterAuth({
        database: { dialect: cachedDialect, type: 'sqlite' },
        secret: loadAuthSecret(),
        baseURL: 'http://localhost:4325',
        plugins: [testUtils()],
    })
    return (await testAuth.$context).test
}

/**
 * Create a fresh user + session in the E2E DB and sign the browser context
 * in. Returns the seeded user's email for assertions.
 */
export async function signInTestUser(page: Page): Promise<string> {
    const test = await buildTestHelpers()
    const suffix = `${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 8)}`
    const email = `smoke-${suffix}@example.com`
    const saved = await test.saveUser(
        test.createUser({ name: `Score Smoke ${suffix}`, email })
    )
    const { cookies } = await test.login({ userId: saved.id })
    await page.context().addCookies(
        cookies.map(cookie => ({
            ...cookie,
            domain: cookie.domain ?? 'localhost',
        }))
    )
    return email
}
