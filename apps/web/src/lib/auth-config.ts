import { importPKCS8, SignJWT } from 'jose'

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

export interface ResolvedAuthConfig {
    baseURL: string
    google: { clientId: string; clientSecret: string }
    apple:
        | (() => Promise<{
              clientId: string
              clientSecret: string
          }>)
        | undefined
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

// better-auth 1.7.x does not export generateAppleClientSecret, so mint the
// short-lived ES256 client-secret JWT here per Apple's token docs: sub =
// Services ID, iss = Team ID, aud = appleid.apple.com, kid = Key ID, ~1 month
// exp. Called lazily inside the async provider factory — never at boot.
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
        apple: apple
            ? async () => ({
                  clientId: apple.serviceId,
                  clientSecret: await generateAppleClientSecret(apple),
              })
            : undefined,
        trustedOrigins: [
            ...(baseURL ? [baseURL] : []),
            'cetus://',
            APPLE_AUDIENCE,
        ],
    }
}
