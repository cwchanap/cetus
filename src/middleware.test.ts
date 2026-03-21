import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe('middleware', () => {
    function makeContext(overrides: Partial<any> = {}) {
        return {
            request: {
                headers: new Headers(),
            },
            locals: {} as any,
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
        const context = makeContext({ request: { headers } })
        const next = makeNext()

        await (onRequest as any)(context, next)

        expect(auth.api.getSession).toHaveBeenCalledWith({
            headers,
        })
    })

    it('should return the response from next()', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as any)

        const mockResponse = new Response('Test response', { status: 200 })
        const next = vi.fn().mockResolvedValue(mockResponse)
        const context = makeContext()

        const result = await (onRequest as any)(context, next)

        expect(result).toBe(mockResponse)
    })
})
