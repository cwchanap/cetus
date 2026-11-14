/**
 * Dependency contract for native modules that load lazily at runtime.
 *
 * `@better-auth/expo`'s client lazily requires `expo-network` the first
 * time its session hook resolves (useSessionGuard → authClient.useSession).
 * jsdom tests never hit that require, so a missing module only surfaced
 * on-device as "Cannot find module 'expo-network'" render errors that
 * killed the game play route's touch handlers. This test keeps every such
 * runtime-only native dependency pinned in package.json.
 */
import { describe, expect, it } from '@jest/globals'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../package.json') as {
    dependencies: Record<string, string>
}

describe('mobile native runtime dependency contract', () => {
    it('pins expo-network required lazily by the @better-auth/expo client', () => {
        expect(pkg.dependencies['expo-network']).toBeDefined()
    })
})
