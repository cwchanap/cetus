import { describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { decodeJwt, decodeProtectedHeader } from 'jose'
import { expo } from '@better-auth/expo'
import {
    expoPluginWithExactOrigins,
    resolveAuthConfig,
    type AuthEnvInput,
} from '@/lib/auth-config'

// A real ES256 key pair so the Apple client-secret factory signs for real.
const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
})
const testP8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

const googleEnv = {
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
}

const completeAppleEnv = {
    APPLE_SERVICE_ID: 'com.cetus.web.service',
    APPLE_TEAM_ID: 'TEAM123',
    APPLE_KEY_ID: 'KEY123',
    APPLE_PRIVATE_KEY: testP8,
}

describe('resolveAuthConfig — Google (required)', () => {
    it('throws an actionable error when Google credentials are missing', () => {
        expect(() => resolveAuthConfig({ env: {}, isProd: false })).toThrow(
            /Google OAuth credentials are required.*GOOGLE_CLIENT_ID.*GOOGLE_CLIENT_SECRET/s
        )
    })

    it('rejects placeholder Google credentials', () => {
        expect(() =>
            resolveAuthConfig({
                env: {
                    GOOGLE_CLIENT_ID: 'placeholder',
                    GOOGLE_CLIENT_SECRET: 'placeholder',
                },
                isProd: false,
            })
        ).toThrow('Google OAuth credentials are required')
    })

    it('rejects whitespace-only Google credentials', () => {
        expect(() =>
            resolveAuthConfig({
                env: {
                    GOOGLE_CLIENT_ID: '   ',
                    GOOGLE_CLIENT_SECRET: '   ',
                },
                isProd: false,
            })
        ).toThrow('Google OAuth credentials are required')
    })

    it('trims valid Google credentials', () => {
        const config = resolveAuthConfig({
            env: {
                GOOGLE_CLIENT_ID: '  google-client-id  ',
                GOOGLE_CLIENT_SECRET: '  google-client-secret  ',
            },
            isProd: false,
        })
        expect(config.google).toEqual({
            clientId: 'google-client-id',
            clientSecret: 'google-client-secret',
        })
    })
})

describe('resolveAuthConfig — Apple (optional)', () => {
    it('omits the Apple provider when no Apple vars are set', () => {
        const config = resolveAuthConfig({
            env: googleEnv,
            isProd: false,
        })
        expect(config.apple).toBeUndefined()
        expect(config.google).toBeDefined()
    })

    it('treats whitespace-only Apple vars as unset', () => {
        const config = resolveAuthConfig({
            env: {
                ...googleEnv,
                APPLE_SERVICE_ID: '   ',
                APPLE_TEAM_ID: '',
            },
            isProd: false,
        })
        expect(config.apple).toBeUndefined()
    })

    it('fails with the missing var names on partial Apple config', () => {
        const env: AuthEnvInput = {
            ...googleEnv,
            APPLE_SERVICE_ID: 'com.cetus.web.service',
            APPLE_TEAM_ID: 'TEAM123',
        }
        expect(() => resolveAuthConfig({ env, isProd: false })).toThrow(
            /missing APPLE_KEY_ID, APPLE_PRIVATE_KEY/
        )
    })

    it('builds a lazy Apple provider whose oauth2 reads sign fresh ES256 secrets', async () => {
        const config = resolveAuthConfig({
            env: { ...googleEnv, ...completeAppleEnv },
            isProd: false,
        })
        expect(typeof config.apple).toBe('function')

        // better-auth resolves the factory once and retains the result; the
        // retained options must be callable so every oauth2 call re-signs.
        const provider = await config.apple!()
        expect(typeof provider).toBe('function')
        expect(provider.clientId).toBe('com.cetus.web.service')

        const first = await provider()
        expect(first.clientId).toBe('com.cetus.web.service')

        const header = decodeProtectedHeader(first.clientSecret)
        expect(header.alg).toBe('ES256')
        expect(header.kid).toBe('KEY123')

        const claims = decodeJwt(first.clientSecret)
        expect(claims.sub).toBe('com.cetus.web.service')
        expect(claims.iss).toBe('TEAM123')
        expect(claims.aud).toBe('https://appleid.apple.com')
        // ~1 month validity, minted fresh at call time.
        expect(claims.exp! - claims.iat!).toBe(30 * 24 * 60 * 60)

        // Each resolution mints a distinct secret — never once per process.
        const second = await provider()
        expect(second.clientSecret).not.toBe(first.clientSecret)
    })

    it('accepts a .p8 key with escaped newlines', async () => {
        const config = resolveAuthConfig({
            env: {
                ...googleEnv,
                ...completeAppleEnv,
                APPLE_PRIVATE_KEY: testP8.replaceAll('\n', '\\n'),
            },
            isProd: false,
        })
        const provider = await config.apple!()
        const fresh = await provider()
        expect(decodeProtectedHeader(fresh.clientSecret).kid).toBe('KEY123')
    })
})

describe('expoPluginWithExactOrigins', () => {
    it('keeps the upstream exp:// dev origin out of the plugin init result', async () => {
        vi.stubEnv('NODE_ENV', 'development')

        const upstream = expo()
        const upstreamResult = await upstream.init!({} as never)
        expect(upstreamResult?.options?.trustedOrigins).toContain('exp://')

        const wrapped = expoPluginWithExactOrigins()
        const wrappedResult = await wrapped.init!({} as never)
        expect(wrappedResult?.options?.trustedOrigins).not.toContain('exp://')
    })

    it('leaves non-development init results untouched', async () => {
        vi.stubEnv('NODE_ENV', 'production')

        const wrapped = expoPluginWithExactOrigins()
        const wrappedResult = await wrapped.init!({} as never)
        // Upstream returns [] outside development; nothing to strip, no error.
        expect(wrappedResult?.options?.trustedOrigins ?? []).not.toContain(
            'exp://'
        )
    })
})

describe('resolveAuthConfig — baseURL and trusted origins', () => {
    it('uses BETTER_AUTH_URL as baseURL and first trusted origin', () => {
        const config = resolveAuthConfig({
            env: { ...googleEnv, BETTER_AUTH_URL: 'https://cetus.example' },
            isProd: false,
        })
        expect(config.baseURL).toBe('https://cetus.example')
        expect(config.trustedOrigins).toEqual([
            'https://cetus.example',
            'cetus://',
            'https://appleid.apple.com',
        ])
    })

    it('omits the empty production baseURL from trusted origins', () => {
        const config = resolveAuthConfig({
            env: googleEnv,
            isProd: true,
        })
        expect(config.baseURL).toBe('')
        expect(config.trustedOrigins).toEqual([
            'cetus://',
            'https://appleid.apple.com',
        ])
    })

    it('falls back to the dev URL outside production', () => {
        const config = resolveAuthConfig({
            env: googleEnv,
            isProd: false,
        })
        expect(config.baseURL).toBe('http://localhost:4325')
        expect(config.trustedOrigins).toEqual([
            'http://localhost:4325',
            'cetus://',
            'https://appleid.apple.com',
        ])
    })
})
