// Residual I3 regression: the get-session credential verification must
// normalize the backend origin exactly like the typed API client (which
// strips trailing slashes from baseUrl) — an EXPO_PUBLIC_API_BASE_URL
// configured with a trailing slash must not request a double-slashed
// `//api/auth/get-session` path, and a verification that succeeds on the
// normalized origin must still bind the cookie and save the score.
//
// apiBaseUrl is read at import time, so this file's hoisted env mock
// supplies a trailing-slash origin for THIS file's module registry only.

jest.mock('../src/lib/env', () => ({
    apiBaseUrl: 'https://slash-origin.example/',
}))

jest.mock('../src/lib/auth-client', () => ({
    authClient: { getCookie: jest.fn() },
}))

import { GameID } from '@cetus/shared/games'
import { authClient } from '../src/lib/auth-client'
import { createScoreSubmitter } from '../src/lib/api'

const fetchMock = jest.fn()
globalThis.fetch = fetchMock as unknown as typeof fetch

const getCookie = authClient.getCookie as jest.Mock

const sessionUser = (userId: string) => ({
    session: { id: 'sess-1', userId, expiresAt: '2030-01-01T00:00:00Z' },
    user: { id: userId },
})

beforeEach(() => {
    fetchMock.mockReset()
    getCookie.mockReset()
})

test('trailing-slash origin: verification and save hit single-slashed paths and the verified save succeeds', async () => {
    getCookie.mockResolvedValue('better-auth.session_token=token-slash')

    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/auth/get-session')) {
            // The verification must land on the normalized origin — no `//api`.
            expect(url).toBe(
                'https://slash-origin.example/api/auth/get-session'
            )
            expect((init?.headers as Record<string, string>).Cookie).toBe(
                'better-auth.session_token=token-slash'
            )
            return Promise.resolve(
                new Response(JSON.stringify(sessionUser('user-slash')), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            )
        }
        return Promise.resolve(
            new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        )
    })

    const submit = await createScoreSubmitter('user-slash')
    const result = await submit({ gameId: GameID.QUICK_MATH, score: 10 })

    // The verified snapshot cookie reached the score save and it succeeded.
    expect(result.success).toBe(true)
    const save = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith('/api/scores')
    )
    expect(String(save?.[0])).toBe('https://slash-origin.example/api/scores')
    expect((save?.[1]?.headers as Record<string, string>).Cookie).toBe(
        'better-auth.session_token=token-slash'
    )
    // Exactly one verification and one save, in that order.
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
        'https://slash-origin.example/api/auth/get-session',
        'https://slash-origin.example/api/scores',
    ])
})

test('trailing-slash origin: a failed verification still fails closed on the normalized origin', async () => {
    getCookie.mockResolvedValue('better-auth.session_token=token-other')
    fetchMock.mockImplementation((input: unknown) => {
        const url = String(input)
        expect(url).toBe('https://slash-origin.example/api/auth/get-session')
        return Promise.resolve(
            new Response(JSON.stringify(sessionUser('user-other')), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        )
    })

    const submit = await createScoreSubmitter('user-slash')
    const result = await submit({ gameId: GameID.QUICK_MATH, score: 10 })

    // Fail closed: no save POST at all, truthful verification-unavailable.
    expect(result).toEqual({
        success: false,
        error: 'Account verification unavailable',
        code: 'SCORE_CONTEXT_UNAVAILABLE',
    })
    expect(
        fetchMock.mock.calls.filter(([url]) =>
            String(url).endsWith('/api/scores')
        )
    ).toHaveLength(0)
})
