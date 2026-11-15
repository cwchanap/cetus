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
let hangScorePost = false

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
  if (hangScorePost) {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new Error('Aborted'))
      })
    })
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
  hangScorePost = false
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
    // A GUEST's 401 stays honest and its sign-in CTA truthful: the guest
    // genuinely has no account.
    expect(renderedText(tree)).toContain(
      'Score not saved — you are signed out.'
    )
    expect(renderedText(tree)).toContain('Sign in to save future scores')
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
    // The snapshot fails verification (user-b ≠ user-a) on save, so the
    // host sends NO score POST and stays honestly unconfirmed instead of
    // landing on B.
    getCookie.mockResolvedValue('better-auth.session_token=token-b')
    sessionBodies = [sessionUser('user-b')]

    const tree = await runAndFinish(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
    )

    // Verified once lazily at save time (no startup round-trip).
    expect(getSessions()).toHaveLength(1)
    // Fail closed: an unverifiable binding sends NO score POST at all.
    expect(submits()).toHaveLength(0)
    // Truthful outcome: the account may be perfectly valid, so this is
    // never "signed out" and never carries a sign-in prompt. The copy is
    // neutral between the two sources of this code (unverifiable local
    // binding AND the server's context-storage refusal), so it names no
    // transport story.
    expect(renderedText(tree)).toContain(
      'Score not saved — the account context needed to save was unavailable.'
    )
    expect(renderedText(tree)).not.toContain('you are signed out')
    expect(renderedText(tree)).not.toContain('Sign in to save')
    expect(renderedText(tree)).not.toContain('Score saved')
    await stopTree(tree)
  })

  test('a server SCORE_CONTEXT_UNAVAILABLE refusal renders the same neutral copy', async () => {
    // The verified binding POSTs and the server refuses the save because
    // its score-context storage is unavailable (coded 500 envelope — the
    // same public code the client's fail-closed binding uses). One
    // neutral string must be true for both sources: nothing here may
    // claim the request did or did not go out.
    getCookie.mockResolvedValue('better-auth.session_token=token-a')
    sessionBodies = [sessionUser('user-a')]
    scoreStatus = 500
    scoreBody = {
      error: 'Score context is unavailable',
      code: 'SCORE_CONTEXT_UNAVAILABLE',
    }

    const tree = await runAndFinish(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
    )

    // The request WAS sent and refused server-side.
    expect(submits()).toHaveLength(1)
    expect(renderedText(tree)).toContain(
      'Score not saved — the account context needed to save was unavailable.'
    )
    // No stale account-verification wording, no sign-out claim, no CTA,
    // no false "saved".
    expect(renderedText(tree)).not.toContain('account verification unavailable')
    expect(renderedText(tree)).not.toContain('you are signed out')
    expect(renderedText(tree)).not.toContain('Sign in to save')
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

    // Single lazy verification at save time hits the dead transport.
    expect(getSessions()).toHaveLength(1)
    // Fail closed: a transport-failed binding sends NO score POST at all.
    expect(submits()).toHaveLength(0)
    // Truthful outcome: an unreachable get-session never means signed out.
    expect(renderedText(tree)).toContain(
      'Score not saved — the account context needed to save was unavailable.'
    )
    expect(renderedText(tree)).not.toContain('you are signed out')
    expect(renderedText(tree)).not.toContain('Sign in to save')
    expect(renderedText(tree)).not.toContain('Score saved')
    await stopTree(tree)
  })

  test('missing stored cookie makes zero get-session calls at startup or save', async () => {
    getCookie.mockResolvedValue(null)

    const tree = await runAndFinish(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
    )

    expect(getSessions()).toHaveLength(0)
    expect(submits()).toHaveLength(0)
    expect(renderedText(tree)).toContain(
      'Score not saved — the account context needed to save was unavailable.'
    )
    await stopTree(tree)
  })

  test('a transient save verification failure recovers on the next save and stays pinned for replay', async () => {
    // Startup never blocks on get-session.
    getCookie.mockResolvedValue('better-auth.session_token=token-a')
    failSessionFetch = true

    const tree = await render(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
    )
    expect(getSessions()).toHaveLength(0)

    // First run ends while verification transport is offline: fails closed.
    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[createdGames.length - 1].end()
    })
    await drain()
    expect(getSessions()).toHaveLength(1)
    expect(submits()).toHaveLength(0)
    expect(renderedText(tree)).toContain(
      'Score not saved — the account context needed to save was unavailable.'
    )

    // Connectivity returns for replay: the save verifies once at the real
    // get-session boundary and pins the recovered client for the host.
    failSessionFetch = false
    sessionBodies = [sessionUser('user-a')]
    await press(tree, 'Play again')
    await act(async () => {
      await createdGames[createdGames.length - 1].end()
    })
    await drain()

    expect(getSessions()).toHaveLength(2)
    const save = submits()
    expect(save).toHaveLength(1)
    expect(headersOf(save[0]).Cookie).toBe('better-auth.session_token=token-a')
    expect(renderedText(tree)).toContain('Score saved')

    // Replay again: the recovered pin is the host's lifetime binding —
    // the next save reuses it verbatim with no second verification.
    await press(tree, 'Play again')
    await act(async () => {
      await createdGames[createdGames.length - 1].end()
    })
    await drain()

    expect(getSessions()).toHaveLength(2)
    expect(submits()).toHaveLength(2)
    expect(headersOf(submits()[1]).Cookie).toBe(
      'better-auth.session_token=token-a'
    )
    await stopTree(tree)
  })

  test('a recovered binding still refuses a cookie owned by another account', async () => {
    // Save 1 fails offline; save 2 sees B's cookie and refuses it.
    getCookie.mockResolvedValue('better-auth.session_token=token-b')
    failSessionFetch = true

    const tree = await render(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
    )
    expect(getSessions()).toHaveLength(0)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[createdGames.length - 1].end()
    })
    await drain()
    expect(getSessions()).toHaveLength(1)

    failSessionFetch = false
    sessionBodies = [sessionUser('user-b')]
    await press(tree, 'Play again')
    await act(async () => {
      await createdGames[createdGames.length - 1].end()
    })
    await drain()

    expect(getSessions()).toHaveLength(2)
    expect(headersOf(getSessions()[1]).Cookie).toBe(
      'better-auth.session_token=token-b'
    )
    expect(submits()).toHaveLength(0)
    expect(renderedText(tree)).toContain(
      'Score not saved — the account context needed to save was unavailable.'
    )
    expect(renderedText(tree)).not.toContain('you are signed out')
    expect(renderedText(tree)).not.toContain('Sign in to save')
    await stopTree(tree)
  })

  test('a hanging score POST aborts on timeout instead of leaving Saving score… forever', async () => {
    getCookie.mockResolvedValue('better-auth.session_token=token-a')
    sessionBodies = [sessionUser('user-a')]
    hangScorePost = true

    jest.useFakeTimers()
    try {
      let tree: TestRenderer.ReactTestRenderer | undefined
      await act(async () => {
        tree = TestRenderer.create(
          <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
        )
      })
      await act(async () => {
        await jest.advanceTimersByTimeAsync(25)
      })
      if (!tree) {
        throw new Error('TestRenderer.create returned nothing')
      }

      await press(tree, 'Start game')
      await act(async () => {
        void createdGames[createdGames.length - 1].end()
      })
      await act(async () => {
        await jest.advanceTimersByTimeAsync(25)
      })
      expect(renderedText(tree)).toContain('Saving score…')

      // Advance past the mobile request timeout: the aborted POST settles
      // to NETWORK_ERROR so the spinner/saving message clears truthfully.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10_000)
      })
      expect(renderedText(tree)).not.toContain('Saving score…')
      expect(renderedText(tree)).toContain('may still have been saved')
      await stopTree(tree)
    } finally {
      jest.useRealTimers()
    }
  })
})
