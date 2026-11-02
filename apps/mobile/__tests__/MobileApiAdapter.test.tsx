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
