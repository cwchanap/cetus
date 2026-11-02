import { importPKCS8, SignJWT } from 'jose'
import { expo } from '@better-auth/expo'

// Pure environment decision for the Better Auth server config: enabled social
// providers (incl. the async Apple client-secret factory), baseURL and trusted
// origins. Importable without `auth.ts`/db — unit tests live in
// auth-config.test.ts. No framework, just plain functions over explicit inputs.

export interface AuthEnvInput {
    BETTER_AUTH_URL?: string | undefined
    GOOGLE_CLIENT_ID?: string | undefined
    GOOGLE_CLIENT_SECRET?: string | undefined
    APPLE_SERVICE_ID?: string | undefined
    APPLE_TEAM_ID?: string | undefined
    APPLE_KEY_ID?: string | undefined
    APPLE_PRIVATE_KEY?: string | undefined
}

export interface AppleProviderOptions {
    clientId: string
    clientSecret: string
}

// better-auth resolves a provider factory once at init and retains the result,
// but its oauth2 layer re-awaits `options` on every authorization and token
// exchange when the options object is callable
// (`options = typeof options === "function" ? await options() : options`).
// Returning a callable config keeps client-secret JWTs fresh per sign-in flow
// instead of signing once per process.
export type LazyAppleProviderOptions = (() => Promise<AppleProviderOptions>) &
    AppleProviderOptions

export interface ResolvedAuthConfig {
    baseURL: string
    google: { clientId: string; clientSecret: string }
    apple: (() => Promise<LazyAppleProviderOptions>) | undefined
    trustedOrigins: string[]
}

const APPLE_AUDIENCE = 'https://appleid.apple.com'
const DEV_BASE_URL = 'http://localhost:4325'

function trimmed(value: string | undefined): string {
    return value?.trim() ?? ''
}

function resolveBaseURL(env: AuthEnvInput, isProd: boolean): string {
    const explicit = trimmed(env.BETTER_AUTH_URL)
    if (explicit) {
        return explicit
    }
    // No explicit URL in production: Better Auth infers it from request headers.
    return isProd ? '' : DEV_BASE_URL
}

function resolveGoogle(env: AuthEnvInput): {
    clientId: string
    clientSecret: string
} {
    const clientId = trimmed(env.GOOGLE_CLIENT_ID)
    const clientSecret = trimmed(env.GOOGLE_CLIENT_SECRET)
    if (
        !clientId ||
        !clientSecret ||
        clientId === 'placeholder' ||
        clientSecret === 'placeholder'
    ) {
        throw new Error(
            'Google OAuth credentials are required. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to real OAuth credentials.'
        )
    }
    return { clientId, clientSecret }
}

interface AppleCredentials {
    serviceId: string
    teamId: string
    keyId: string
    privateKey: string
}

function resolveApple(env: AuthEnvInput): AppleCredentials | undefined {
    const credentials = {
        serviceId: trimmed(env.APPLE_SERVICE_ID),
        teamId: trimmed(env.APPLE_TEAM_ID),
        keyId: trimmed(env.APPLE_KEY_ID),
        privateKey: trimmed(env.APPLE_PRIVATE_KEY),
    }
    const missing = (Object.keys(credentials) as (keyof AppleCredentials)[])
        .filter(key => !credentials[key])
        .map(key => `APPLE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`)
    if (missing.length === 4) {
        return undefined
    }
    if (missing.length > 0) {
        throw new Error(
            `Incomplete Apple sign-in configuration: missing ${missing.join(', ')}. Set all of APPLE_SERVICE_ID, APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY, or unset them all to keep Apple disabled.`
        )
    }
    return credentials
}

// The upstream expo plugin unconditionally trusts `exp://` in development
// (its init hook adds it whenever NODE_ENV === 'development', and better-auth
// merges plugin origins into the effective allowlist). HPA-179 allows exactly
// {baseURL, cetus://, https://appleid.apple.com} — strip the injected origin
// so the effective set stays exact in every environment.
export function expoPluginWithExactOrigins() {
    const plugin = expo()
    const init = plugin.init?.bind(plugin)
    plugin.init = (async (
        context: Parameters<NonNullable<typeof plugin.init>>[0]
    ) => {
        const result = await init?.(context)
        if (!result?.options?.trustedOrigins) {
            return result
        }
        const trustedOrigins = result.options.trustedOrigins.filter(
            origin => origin !== 'exp://'
        )
        return { ...result, options: { ...result.options, trustedOrigins } }
    }) as unknown as typeof plugin.init
    return plugin
}

// better-auth 1.7.x does not export generateAppleClientSecret, so mint the
// short-lived ES256 client-secret JWT here per Apple's token docs: sub =
// Services ID, iss = Team ID, aud = appleid.apple.com, kid = Key ID, ~1 month
// exp. Signed lazily per oauth2 call — never at boot.
async function generateAppleClientSecret(
    apple: AppleCredentials
): Promise<string> {
    // APPLE_PRIVATE_KEY may carry the .p8 PEM with literal \n escapes.
    const pem = apple.privateKey.includes('\\n')
        ? apple.privateKey.replaceAll('\\n', '\n')
        : apple.privateKey
    const key = await importPKCS8(pem, 'ES256')
    return new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: apple.keyId })
        .setSubject(apple.serviceId)
        .setIssuer(apple.teamId)
        .setAudience(APPLE_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(key)
}

function createLazyAppleProvider(
    apple: AppleCredentials
): () => Promise<LazyAppleProviderOptions> {
    return async () => {
        const load = async (): Promise<AppleProviderOptions> => ({
            clientId: apple.serviceId,
            clientSecret: await generateAppleClientSecret(apple),
        })
        return Object.defineProperties(load, {
            clientId: {
                // Satisfies init-time presence checks (create-context and the
                // provider's authorize wrapper read these before any oauth2
                // call resolves the callable).
                value: apple.serviceId,
                enumerable: true,
            },
            clientSecret: {
                // Truthiness guard only; real requests always resolve via the
                // callable and get a freshly signed JWT.
                get: () => 'lazy-apple-client-secret',
                enumerable: false,
            },
        }) as LazyAppleProviderOptions
    }
}

export function resolveAuthConfig(input: {
    env: AuthEnvInput
    isProd: boolean
}): ResolvedAuthConfig {
    const google = resolveGoogle(input.env)
    const apple = resolveApple(input.env)
    const baseURL = resolveBaseURL(input.env, input.isProd)
    return {
        baseURL,
        google,
        apple: apple ? createLazyAppleProvider(apple) : undefined,
        trustedOrigins: [
            ...(baseURL ? [baseURL] : []),
            'cetus://',
            APPLE_AUDIENCE,
        ],
    }
}
