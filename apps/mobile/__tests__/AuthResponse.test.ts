jest.mock('better-auth/react', () => ({
    createAuthClient: jest.fn(() => ({})),
}))
jest.mock('@better-auth/expo/client', () => ({
    expoClient: jest.fn(() => ({})),
}))

import { createAuthClient } from 'better-auth/react'
import '../src/lib/auth-client'

const options = jest.mocked(createAuthClient).mock.calls[0][0]
const checkResponse = async (response: Response, path = '/get-session') =>
    options?.fetchOptions?.onResponse?.({
        response,
        request: {
            url: `https://cetus-test.example/api/auth${path}`,
            method: 'GET',
            headers: new Headers(),
            body: undefined,
            signal: new AbortController().signal,
        },
    })

test('rejects a successful HTML login page before it can become a cached session', async () => {
    await expect(
        checkResponse(
            new Response('<html>Vercel Authentication</html>', {
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8' },
            })
        )
    ).rejects.toThrow('non-JSON session response')
})

test.each([null, { user: { id: 'user-1' }, session: { id: 'session-1' } }])(
    'preserves a JSON guest or signed-in session: %j',
    async data => {
        const response = new Response(JSON.stringify(data), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
        })
        await checkResponse(response)
        expect(await response.json()).toEqual(data)
    }
)

test('leaves HTTP errors and unrelated auth responses to Better Auth', async () => {
    await expect(
        checkResponse(new Response('Unauthorized', { status: 401 }))
    ).resolves.toBeUndefined()
    await expect(
        checkResponse(new Response(null, { status: 204 }), '/sign-out')
    ).resolves.toBeUndefined()
})
