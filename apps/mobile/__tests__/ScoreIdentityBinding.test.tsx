// Blocking final-review finding 1 (HPA-425) — score/account ownership
// race. The play route keeps an old NativeGameHost mounted while the auth
// session re-settles, so a save fired from a guest or account-A host can
// race the SecureStore cookie flipping to the newly signed-in account
// (guest→account, or account-A→account-B). The invariant under test:
// every save carries exactly ONE credential snapshot, verified once at
// the real cookie/header/fetch boundary against the host's settled
// identity. A later cookie change must never switch the request's
// account, and a guest host must never send credentials at all.
//
// Mocked edges: authClient.getCookie (SecureStore) and global fetch. The
// real api.ts identity binding, the real @cetus/api-client request path
// and the real host→game→submit wiring all run — api.submitScore is NOT
// mocked in this file.

import TestRenderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import { BaseGame, type BaseGameConfig, type BaseGameState } from '@cetus/games'

jest.mock('../src/lib/auth-client', () => ({
  authClient: { getCookie: jest.fn() },
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    canGoBack: jest.fn(),
  }),
}))

import { authClient } from '../src/lib/auth-client'
import { NativeGameHost } from '../src/games/NativeGameHost'
import {
  NATIVE_GAMES,
  type NativeGamePort,
  type NativeGameViewProps,
} from '../src/games/registry'

const getCookie = authClient.getCookie as jest.Mock

// --- fetch boundary ---------------------------------------------------------

type FetchCall = { input: unknown; init: RequestInit }
const fetchCalls: FetchCall[] = []
/** get-session response bodies, consumed one per verification attempt. */
let sessionBodies: unknown[] = []
let scoreStatus = 200
let scoreBody: unknown = { success: true }
let failSessionFetch = false

const fetchMock = jest.fn((input: unknown, init?: RequestInit) => {
  fetchCalls.push({ input, init: { credentials: 'include', ...init } })
  const url = String(input)
  if (url.endsWith('/api/auth/get-session')) {
    if (failSessionFetch) {
      return Promise.reject(new Error('verification transport down'))
    }
    const body = sessionBodies.length > 0 ? sessionBodies.shift() : null
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
  }
  // Server contract: a score POST without a session cookie is
  // unauthenticated and rejected — the honest-failure path.
  const sentCookie = (init?.headers as Record<string, string> | undefined)
    ?.Cookie
  if (!sentCookie) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: 'unauthenticated' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    )
  }
  return Promise.resolve(
    new Response(JSON.stringify(scoreBody), {
      status: scoreStatus,
      headers: { 'content-type': 'application/json' },
    })
  )
})
globalThis.fetch = fetchMock as unknown as typeof fetch

// Better Auth's get-session wire shape for an authenticated request.
const sessionUser = (userId: string) => ({
  session: { id: 'sess-1', userId, expiresAt: '2030-01-01T00:00:00Z' },
  user: { id: userId },
})

const headersOf = (call: FetchCall): Record<string, string> =>
  call.init.headers as Record<string, string>

const getSessions = (): FetchCall[] =>
  fetchCalls.filter(call =>
    String(call.input).endsWith('/api/auth/get-session')
  )

const submits = (): FetchCall[] =>
  fetchCalls.filter(call => String(call.input).endsWith('/api/scores'))

// --- minimal concrete @cetus/games fixture ----------------------------------

interface TestGameState extends BaseGameState {
  board: number[]
}

class TestNativeGame extends BaseGame<TestGameState> {
  constructor(config: BaseGameConfig) {
    super(GameID.QUICK_MATH, config, {}, { basePoints: 10 })
  }

  override createInitialState(): TestGameState {
    return {
      score: 0,
      timeRemaining: this.config.duration,
      isActive: false,
      isPaused: false,
      isGameOver: false,
      gameStarted: false,
      board: [1, 2, 3],
    }
  }

  override update(): void {}
  override render(): void {}
  override cleanup(): void {}

  override getGameStats() {
    return {
      finalScore: this.state.score,
      timeElapsed: this.config.duration - this.state.timeRemaining,
      gameCompleted: true,
    }
  }
}

const TestBoardView = ({ projected }: NativeGameViewProps) => (
  <Text testID="native-board">{(projected.board as number[]).join(',')}</Text>
)

const createdGames: TestNativeGame[] = []

const testPort: NativeGamePort = {
  createGame(deps) {
    const game = new TestNativeGame({
      duration: 60,
      pausable: true,
      resettable: true,
      submitScore: deps.submitScore,
      platform: deps.platform,
    })
    createdGames.push(game)
    return game
  },
  project: state => ({ board: [...(state as TestGameState).board] }),
  view: TestBoardView,
}

const originalEntry = NATIVE_GAMES[GameID.QUICK_MATH]
beforeAll(() => {
  NATIVE_GAMES[GameID.QUICK_MATH] = { port: testPort }
})
afterAll(() => {
  NATIVE_GAMES[GameID.QUICK_MATH] = originalEntry
})

const drain = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 25))
  })
}

const render = async (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(element)
  })
  await drain()
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  return tree
}

const press = async (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const button = tree.root.findByProps({ accessibilityLabel: label })
  await act(async () => {
    button.props.onPress()
  })
}

const scalarText = (children: React.ReactNode): string => {
  if (Array.isArray(children)) {
    return children.map(scalarText).join('')
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }
  return ''
}

const renderedText = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(node => scalarText(node.props.children))
    .join('\n')

/** Mount, run and finish one game, letting the save settle. */
const runAndFinish = async (
  element: React.ReactElement
): Promise<TestRenderer.ReactTestRenderer> => {
  const tree = await render(element)
  await press(tree, 'Start game')
  await act(async () => {
    await createdGames[createdGames.length - 1].end()
  })
  await drain()
  return tree
}

const stopTree = async (tree: TestRenderer.ReactTestRenderer) => {
  await act(async () => {
    tree.unmount()
  })
}

beforeEach(() => {
  fetchCalls.length = 0
  sessionBodies = []
  scoreStatus = 200
  scoreBody = { success: true }
  failSessionFetch = false
  getCookie.mockReset()
  createdGames.length = 0
})

describe('identity-bound score submission — the real fetch boundary', () => {
  test('an account host saves through its verified snapshot cookie', async () => {
    getCookie.mockResolvedValue('better-auth.session_token=token-a')
    sessionBodies = [sessionUser('user-a')]

    const tree = await runAndFinish(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
    )

    // Bind-time verification went to the real get-session endpoint with
    // exactly the snapshot cookie and the native transport rules.
    const verification = getSessions()
    expect(verification).toHaveLength(1)
    expect(String(verification[0].input)).toBe(
      'https://cetus-test.example/api/auth/get-session'
    )
    expect(headersOf(verification[0]).Cookie).toBe(
      'better-auth.session_token=token-a'
    )
    expect(headersOf(verification[0]).Origin).toBe('https://cetus-test.example')
    expect(verification[0].init.credentials).toBe('omit')

    // The save carries the same verified snapshot — and binding happened
    // once, not per save.
    const save = submits()
    expect(save).toHaveLength(1)
    expect(headersOf(save[0]).Cookie).toBe('better-auth.session_token=token-a')
    expect(save[0].init.credentials).toBe('omit')
    expect(save[0].init.method).toBe('POST')
    expect(renderedText(tree)).toContain('Score saved')
    await stopTree(tree)
  })

  test('guest→account: a guest host never sends the cookie that appears mid-run', async () => {
    // The guest host binds while the store already holds an account
    // cookie (the exact pending-race state): no credentials may ever
    // leave a guest-bound host, and nothing needs verifying for that.
    getCookie.mockResolvedValue('better-auth.session_token=token-account')

    const tree = await runAndFinish(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId={null} />
    )

    expect(getSessions()).toHaveLength(0)
    const save = submits()
    expect(save).toHaveLength(1)
    expect(headersOf(save[0]).Cookie).toBeUndefined()
    expect(save[0].init.credentials).toBe('omit')
    // Unauthenticated saves stay honest: definitively unsaved, never faked.
    expect(renderedText(tree)).toContain(
      'Score not saved — you are signed out.'
    )
    expect(renderedText(tree)).not.toContain('Score saved')
    await stopTree(tree)
  })

  test('account A→B: the host keeps its verified snapshot when the stored cookie flips', async () => {
    // Bind reads A's cookie; the moment after binding, SecureStore flips
    // to account B (sign-in completing elsewhere). The live-cookie read
    // would attach token-b; the bound host must not.
    getCookie
      .mockResolvedValueOnce('better-auth.session_token=token-a')
      .mockResolvedValue('better-auth.session_token=token-b')
    sessionBodies = [sessionUser('user-a')]

    const tree = await runAndFinish(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
    )

    expect(getSessions()).toHaveLength(1)
    expect(headersOf(getSessions()[0]).Cookie).toBe(
      'better-auth.session_token=token-a'
    )
    const save = submits()
    expect(save).toHaveLength(1)
    expect(headersOf(save[0]).Cookie).toBe('better-auth.session_token=token-a')
    expect(renderedText(tree)).toContain('Score saved')
    await stopTree(tree)
  })

  test('initial-mount race: a snapshot cookie owned by another identity never reaches a request', async () => {
    // Identity settled for A while the store already holds B's cookie.
    // The snapshot fails verification (user-b ≠ user-a) on every bounded
    // retry, so the host binds NO credential: saves stay honestly
    // unconfirmed instead of landing on B.
    getCookie.mockResolvedValue('better-auth.session_token=token-b')
    sessionBodies = [
      sessionUser('user-b'),
      sessionUser('user-b'),
      sessionUser('user-b'),
    ]

    const tree = await runAndFinish(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
    )

    expect(getSessions()).toHaveLength(3)
    const save = submits()
    expect(save).toHaveLength(1)
    expect(headersOf(save[0]).Cookie).toBeUndefined()
    expect(renderedText(tree)).toContain(
      'Score not saved — you are signed out.'
    )
    expect(renderedText(tree)).not.toContain('Score saved')
    await stopTree(tree)
  })

  test('same-account renewal: a new cookie value never switches the request credential', async () => {
    // Renewal (or a second session of the same user) rewrites the stored
    // cookie value; the host's verified snapshot stays the one truth.
    getCookie
      .mockResolvedValueOnce('better-auth.session_token=token-a')
      .mockResolvedValue('better-auth.session_token=token-a-renewed')
    sessionBodies = [sessionUser('user-a')]

    const tree = await runAndFinish(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
    )

    expect(getSessions()).toHaveLength(1)
    const save = submits()
    expect(save).toHaveLength(1)
    expect(headersOf(save[0]).Cookie).toBe('better-auth.session_token=token-a')
    expect(renderedText(tree)).toContain('Score saved')
    await stopTree(tree)
  })

  test('verification transport failure sends no credentials and stays honestly unconfirmed', async () => {
    getCookie.mockResolvedValue('better-auth.session_token=token-a')
    failSessionFetch = true

    const tree = await runAndFinish(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
    )

    expect(getSessions()).toHaveLength(3)
    const save = submits()
    expect(save).toHaveLength(1)
    expect(headersOf(save[0]).Cookie).toBeUndefined()
    expect(renderedText(tree)).toContain(
      'Score not saved — you are signed out.'
    )
    expect(renderedText(tree)).not.toContain('Score saved')
    await stopTree(tree)
  })
})
