// The adapter contract: the SecureStore cookie becomes an explicit Cookie
// header only when present, and native fetch always runs with
// `credentials: 'omit'` so the implicit cookie jar cannot compete (Better
// Auth Expo guidance). Shared header merging is covered by
// packages/api-client's own tests.
jest.mock('../src/lib/auth-client', () => ({
  authClient: { getCookie: jest.fn() },
}))

import { api } from '../src/lib/api'
import { authClient } from '../src/lib/auth-client'

const getCookie = authClient.getCookie as jest.Mock

type FetchCall = { input: unknown; init: RequestInit }

const fetchCalls: FetchCall[] = []
globalThis.fetch = jest.fn((input: unknown, init?: RequestInit) => {
  fetchCalls.push({ input, init: { credentials: 'include', ...init } })
  return Promise.resolve(
    new Response(JSON.stringify({ notificationsEnabled: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  )
}) as unknown as typeof fetch

beforeEach(() => {
  fetchCalls.length = 0
  getCookie.mockReset()
})

test('sends the session cookie and omits native credentials when signed in', async () => {
  getCookie.mockResolvedValueOnce('better-auth.session_token=token-1')

  await api.getSettings()

  expect(fetchCalls).toHaveLength(1)
  const { init } = fetchCalls[0]
  expect((init.headers as Record<string, string>).Cookie).toBe(
    'better-auth.session_token=token-1'
  )
  expect(init.credentials).toBe('omit')
})

test('omits the Cookie header entirely when no session exists', async () => {
  getCookie.mockResolvedValueOnce(null)

  await api.getSettings()

  expect(fetchCalls).toHaveLength(1)
  const { init } = fetchCalls[0]
  expect((init.headers as Record<string, string>).Cookie).toBeUndefined()
  expect(init.credentials).toBe('omit')
})

test('sends the configured backend origin so production origin checks pass', async () => {
  getCookie.mockResolvedValueOnce(null)

  await api.getSettings()

  expect(fetchCalls).toHaveLength(1)
  const { init } = fetchCalls[0]
  expect((init.headers as Record<string, string>).Origin).toBe(
    'https://cetus-test.example'
  )
  expect(init.credentials).toBe('omit')
})

test('multipart avatar uploads carry the origin and no manual content-type', async () => {
  getCookie.mockResolvedValueOnce('better-auth.session_token=token-1')
  ;(globalThis.fetch as jest.Mock).mockImplementationOnce(
    (input: unknown, init?: RequestInit) => {
      fetchCalls.push({ input, init: { credentials: 'include', ...init } })
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            avatar: 'https://cdn.example/avatar.png',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    }
  )
  const body = new FormData()
  body.append('avatar', {
    uri: 'file:///avatar.png',
    name: 'avatar.png',
    type: 'image/png',
  } as unknown as Blob)

  await api.uploadAvatar(body)

  expect(fetchCalls).toHaveLength(1)
  const { init } = fetchCalls[0]
  const headers = init.headers as Record<string, string>
  expect(headers.Origin).toBe('https://cetus-test.example')
  expect(headers.Cookie).toBe('better-auth.session_token=token-1')
  expect(
    Object.keys(headers).some(name => name.toLowerCase() === 'content-type')
  ).toBe(false)
  expect(init.body).toBe(body)
  expect(init.credentials).toBe('omit')
})

test('bodyless avatar deletes carry the origin without a content-type', async () => {
  getCookie.mockResolvedValueOnce('better-auth.session_token=token-1')
  ;(globalThis.fetch as jest.Mock).mockImplementationOnce(
    (input: unknown, init?: RequestInit) => {
      fetchCalls.push({ input, init: { credentials: 'include', ...init } })
      return Promise.resolve(
        new Response(
          JSON.stringify({ success: true, message: 'Avatar removed' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    }
  )

  await api.deleteAvatar()

  expect(fetchCalls).toHaveLength(1)
  const { init } = fetchCalls[0]
  const headers = init.headers as Record<string, string>
  expect(headers.Origin).toBe('https://cetus-test.example')
  expect(headers.Cookie).toBe('better-auth.session_token=token-1')
  expect(
    Object.keys(headers).some(name => name.toLowerCase() === 'content-type')
  ).toBe(false)
  expect(init.credentials).toBe('omit')
})
