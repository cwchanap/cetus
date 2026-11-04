import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the auth module
vi.mock('@/lib/auth', () => ({
    auth: {
        api: {
            getSession: vi.fn(),
        },
    },
}))

// Mock astro:middleware
vi.mock('astro:middleware', () => ({
    defineMiddleware: vi.fn(handler => handler),
}))

import { onRequest } from './middleware'
import { auth } from '@/lib/auth'

interface TestContext {
    request: Request
    url: URL
    isPrerendered: boolean
    locals: Record<string, unknown>
}

describe('middleware', () => {
    function makeContext(overrides: Partial<TestContext> = {}): TestContext {
        return {
            request: new Request('https://cetus.example/page'),
            url: new URL('https://cetus.example/page'),
            isPrerendered: false,
            locals: {},
            ...overrides,
        }
    }

    function makeNext() {
        return vi.fn().mockResolvedValue(new Response('OK'))
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should set user and session in locals when authenticated', async () => {
        const mockUser = { id: '1', email: 'test@example.com', name: 'Test' }
        const mockSession = { id: 'session-1', expiresAt: new Date() }

        vi.mocked(auth.api.getSession).mockResolvedValueOnce({
            user: mockUser,
            session: mockSession,
        } as any)

        const context = makeContext()
        const next = makeNext()
        await (onRequest as any)(context, next)

        expect(context.locals.user).toEqual(mockUser)
        expect(context.locals.session).toEqual(mockSession)
        expect(next).toHaveBeenCalled()
    })

    it('should set user and session to null when not authenticated', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)

        const context = makeContext()
        const next = makeNext()
        await (onRequest as any)(context, next)

        expect(context.locals.user).toBeNull()
        expect(context.locals.session).toBeNull()
        expect(next).toHaveBeenCalled()
    })

    it('should call next() after setting locals', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)

        const context = makeContext()
        const next = makeNext()
        const response = await (onRequest as any)(context, next)

        expect(next).toHaveBeenCalledTimes(1)
        expect(response).toBeDefined()
    })

    it('should call getSession with request headers', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)

        const headers = new Headers({ Authorization: 'Bearer token123' })
        const context = makeContext({
            request: new Request('https://cetus.example/page', { headers }),
        })
        const next = makeNext()

        await (onRequest as any)(context, next)

        // Request copies its init headers — assert on the carried value.
        const calledArgs = vi.mocked(auth.api.getSession).mock.calls.at(0)?.[0]
        expect((calledArgs?.headers as Headers).get('Authorization')).toBe(
            'Bearer token123'
        )
    })

    it('should return the response from next()', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)

        const mockResponse = new Response('Test response', { status: 200 })
        const next = vi.fn().mockResolvedValue(mockResponse)
        const context = makeContext()

        const result = await (onRequest as any)(context, next)

        expect(result).toBe(mockResponse)
    })

    it('should propagate errors thrown by getSession', async () => {
        vi.mocked(auth.api.getSession).mockRejectedValueOnce(
            new Error('Test error')
        )

        const context = makeContext()
        const next = makeNext()

        await expect((onRequest as any)(context, next)).rejects.toThrow(
            'Test error'
        )
        expect(next).not.toHaveBeenCalled()
    })
})

// The re-implemented origin check (Astro's checkOrigin is disabled in config
// so /api/auth/callback/apple can accept Apple's cross-site form_post).
// The check only runs in production — matching the stock check, which the
// dev pipeline never enabled.
describe('middleware — origin check', () => {
    beforeEach(() => {
        vi.stubEnv('PROD', true)
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    function makeNext() {
        return vi.fn().mockResolvedValue(new Response('OK'))
    }

    function makePostContext(path: string, init: RequestInit): TestContext {
        return {
            request: new Request(`https://cetus.example${path}`, {
                method: 'POST',
                ...init,
            }),
            url: new URL(`https://cetus.example${path}`),
            isPrerendered: false,
            locals: {},
        }
    }

    function makeMethodContext(
        method: string,
        path: string,
        init: RequestInit
    ): TestContext {
        return {
            request: new Request(`https://cetus.example${path}`, {
                method,
                ...init,
            }),
            url: new URL(`https://cetus.example${path}`),
            isPrerendered: false,
            locals: {},
        }
    }

    it('403s a cross-site form post', async () => {
        const context = makePostContext('/api/scores', {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                origin: 'https://evil.example',
            },
            body: 'a=1',
        })
        const next = makeNext()

        const response = await (onRequest as any)(context, next)

        expect(response.status).toBe(403)
        expect(next).not.toHaveBeenCalled()
    })

    it('403s a POST with no origin and no content-type', async () => {
        const context = makePostContext('/api/scores', {})
        const next = makeNext()

        const response = await (onRequest as any)(context, next)

        expect(response.status).toBe(403)
        expect(next).not.toHaveBeenCalled()
    })

    it('passes a same-origin form post through', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)
        const context = makePostContext('/api/scores', {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                origin: 'https://cetus.example',
            },
            body: 'a=1',
        })
        const next = makeNext()

        await (onRequest as any)(context, next)

        expect(next).toHaveBeenCalled()
    })

    it('exempts the Apple OAuth callback — its origin is cross-site by design', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)
        const context = makePostContext('/api/auth/callback/apple', {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                origin: 'https://appleid.apple.com',
            },
            body: 'code=abc&state=xyz',
        })
        const next = makeNext()

        await (onRequest as any)(context, next)

        expect(next).toHaveBeenCalled()
    })

    it('does not run the check in dev — bare API clients keep working', async () => {
        vi.stubEnv('PROD', false)
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)
        const context = makePostContext('/api/login-rewards/claim', {})
        const next = makeNext()

        await (onRequest as any)(context, next)

        expect(next).toHaveBeenCalled()
    })

    it('passes cross-origin JSON posts (the check only covers form-like bodies)', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)
        const context = makePostContext('/api/scores', {
            headers: {
                'content-type': 'application/json',
                origin: 'https://other.example',
            },
            body: '{}',
        })
        const next = makeNext()

        await (onRequest as any)(context, next)

        expect(next).toHaveBeenCalled()
    })

    it('passes a same-origin multipart avatar upload through', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)
        const context = makeMethodContext('POST', '/api/user/avatar', {
            headers: {
                'content-type':
                    'multipart/form-data; boundary=----native-generated-boundary',
                origin: 'https://cetus.example',
            },
            body: '----native-generated-boundary--',
        })
        const next = makeNext()

        await (onRequest as any)(context, next)

        expect(next).toHaveBeenCalled()
    })

    it('403s a multipart post when the origin is missing', async () => {
        const context = makeMethodContext('POST', '/api/user/avatar', {
            headers: {
                'content-type':
                    'multipart/form-data; boundary=----native-generated-boundary',
            },
            body: '----native-generated-boundary--',
        })
        const next = makeNext()

        const response = await (onRequest as any)(context, next)

        expect(response.status).toBe(403)
        expect(next).not.toHaveBeenCalled()
    })

    it('403s a multipart post from a foreign origin', async () => {
        const context = makeMethodContext('POST', '/api/user/avatar', {
            headers: {
                'content-type':
                    'multipart/form-data; boundary=----native-generated-boundary',
                origin: 'https://evil.example',
            },
            body: '----native-generated-boundary--',
        })
        const next = makeNext()

        const response = await (onRequest as any)(context, next)

        expect(response.status).toBe(403)
        expect(next).not.toHaveBeenCalled()
    })

    it('passes a same-origin bodyless avatar DELETE through', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)
        const context = makeMethodContext('DELETE', '/api/user/avatar', {
            headers: { origin: 'https://cetus.example' },
        })
        const next = makeNext()

        await (onRequest as any)(context, next)

        expect(next).toHaveBeenCalled()
    })

    it('403s a bodyless DELETE when the origin is missing', async () => {
        const context = makeMethodContext('DELETE', '/api/user/avatar', {})
        const next = makeNext()

        const response = await (onRequest as any)(context, next)

        expect(response.status).toBe(403)
        expect(next).not.toHaveBeenCalled()
    })

    it('403s a bodyless DELETE from a foreign origin', async () => {
        const context = makeMethodContext('DELETE', '/api/user/avatar', {
            headers: { origin: 'https://evil.example' },
        })
        const next = makeNext()

        const response = await (onRequest as any)(context, next)

        expect(response.status).toBe(403)
        expect(next).not.toHaveBeenCalled()
    })

    it('leaves safe methods alone — a GET without an origin still passes', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)
        const context = makeMethodContext('GET', '/api/leaderboard', {})
        const next = makeNext()

        await (onRequest as any)(context, next)

        expect(next).toHaveBeenCalled()
    })
})
