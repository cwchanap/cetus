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
    // Set to '1'/'true' to register the Better Auth Expo plugin (the
    // expo-authorization-proxy endpoint and the expo-origin header override).
    // Off by default: the proxy redirects to any external https origin, so it
    // must only run while the fixed tunnel backend actually serves mobile.
    ENABLE_EXPO_AUTH?: string | undefined
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
    expoEnabled: boolean
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

// Doc placeholders are real configuration mistakes, not a configured
// provider: 'placeholder' literals and the 'your_apple_*' values copied from
// the env docs count as unset, so a fully-placeholder env disables Apple and
// a mixed one fails at boot instead of at the first Apple sign-in.
function isPlaceholder(value: string): boolean {
    return value === 'placeholder' || value.startsWith('your_')
}

function resolveApple(env: AuthEnvInput): AppleCredentials | undefined {
    const credentials = {
        serviceId: trimmed(env.APPLE_SERVICE_ID),
        teamId: trimmed(env.APPLE_TEAM_ID),
        keyId: trimmed(env.APPLE_KEY_ID),
        privateKey: trimmed(env.APPLE_PRIVATE_KEY),
    }
    const missing = (Object.keys(credentials) as (keyof AppleCredentials)[])
        .filter(key => !credentials[key] || isPlaceholder(credentials[key]))
        .map(key => `APPLE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`)
    if (missing.length === 4) {
        return undefined
    }
    if (missing.length > 0) {
        throw new Error(
            `Incomplete Apple sign-in configuration: missing or placeholder ${missing.join(', ')}. Set all of APPLE_SERVICE_ID, APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY, or unset them all to keep Apple disabled.`
        )
    }
    if (!credentials.privateKey.includes('PRIVATE KEY')) {
        throw new Error(
            'APPLE_PRIVATE_KEY must be the PKCS8 PEM contents of the .p8 file (expected a "PRIVATE KEY" PEM block).'
        )
    }
    return credentials
}

function resolveExpoEnabled(env: AuthEnvInput): boolean {
    const flag = trimmed(env.ENABLE_EXPO_AUTH).toLowerCase()
    return flag === '1' || flag === 'true'
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
// exp. The PKCS8 key is parsed ONCE at provider init — a malformed key fails
// the auth module at boot rather than 500ing the first Apple sign-in — and
// each oauth2 call only pays for a fresh SignJWT over the cached CryptoKey.
async function createLazyAppleProvider(
    apple: AppleCredentials
): Promise<LazyAppleProviderOptions> {
    // APPLE_PRIVATE_KEY may carry the .p8 PEM with literal \n escapes.
    const pem = apple.privateKey.includes('\\n')
        ? apple.privateKey.replaceAll('\\n', '\n')
        : apple.privateKey
    const key = await importPKCS8(pem, 'ES256')
    const signSecret = (): Promise<string> =>
        new SignJWT({})
            .setProtectedHeader({ alg: 'ES256', kid: apple.keyId })
            .setSubject(apple.serviceId)
            .setIssuer(apple.teamId)
            .setAudience(APPLE_AUDIENCE)
            .setIssuedAt()
            .setExpirationTime('30d')
            .sign(key)
    const initSecret = await signSecret()
    const load = async (): Promise<AppleProviderOptions> => ({
        clientId: apple.serviceId,
        clientSecret: await signSecret(),
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
            // A real signed JWT, not a sentinel: anything that reads
            // clientSecret without resolving the callable still gets a
            // valid (init-time) secret.
            get: () => initSecret,
            enumerable: false,
        },
    }) as LazyAppleProviderOptions
}

export function resolveAuthConfig(input: {
    env: AuthEnvInput
    isProd: boolean
}): ResolvedAuthConfig {
    const google = resolveGoogle(input.env)
    const apple = resolveApple(input.env)
    const expoEnabled = resolveExpoEnabled(input.env)
    const baseURL = resolveBaseURL(input.env, input.isProd)
    return {
        baseURL,
        google,
        apple: apple ? () => createLazyAppleProvider(apple) : undefined,
        expoEnabled,
        trustedOrigins: [
            ...(baseURL ? [baseURL] : []),
            // cetus:// only exists for the mobile OAuth return — no reason to
            // trust it while the expo plugin is off. appleid.apple.com is
            // needed only when Apple sign-in is configured.
            ...(expoEnabled ? ['cetus://'] : []),
            ...(apple ? [APPLE_AUDIENCE] : []),
        ],
    }
}
