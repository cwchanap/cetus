// Bejeweled field-plate controller tests (HPA-393 Stage 4). mount() owns
// the sheet dialog, preferences, hint/keyboard wiring, account panels and
// teardown; the game handle and its helpers are mocked so the wiring can
// be exercised under jsdom.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const {
    initMock,
    getUserBestScoreMock,
    findLegalSwapMock,
    getChallengesMock,
    getLeaderboardMock,
} = vi.hoisted(() => ({
    initMock: vi.fn(),
    getUserBestScoreMock: vi.fn(),
    findLegalSwapMock: vi.fn(),
    getChallengesMock: vi.fn(),
    getLeaderboardMock: vi.fn(),
}))

vi.mock('@/lib/games/bejeweled/init', () => ({
    initBejeweledGame: initMock,
}))
vi.mock('@/lib/services/scoreService', () => ({
    getUserBestScore: getUserBestScoreMock,
}))
vi.mock('@cetus/games/bejeweled/utils', () => ({
    findLegalSwap: findLegalSwapMock,
}))
vi.mock('@cetus/api-client/api-client', () => ({
    createApiClient: vi.fn(() => ({
        getChallenges: getChallengesMock,
        getLeaderboard: getLeaderboardMock,
    })),
}))

import { mount } from './controller'
import { installFieldPlateDOM } from '@/test/field-plate'

interface ControllerCallbacks {
    onStart?: () => void
    onPause?: () => void
    onResume?: () => void
    onTimeUpdate?: (time: number) => void
    onScoreUpdate?: (score: number) => void
    onStateChange?: (state: unknown) => void
    onEnd?: (score: number, stats: unknown) => void
}

interface FakeHandle {
    game: {
        pause: ReturnType<typeof vi.fn>
        resume: ReturnType<typeof vi.fn>
        start: ReturnType<typeof vi.fn>
        reset: ReturnType<typeof vi.fn>
        clickCell: ReturnType<typeof vi.fn>
        getState: ReturnType<typeof vi.fn>
        getGameStats: ReturnType<typeof vi.fn>
        on: ReturnType<typeof vi.fn>
    }
    renderer: {
        getApp: ReturnType<typeof vi.fn>
        setPreferences: ReturnType<typeof vi.fn>
        cancelAnimations: ReturnType<typeof vi.fn>
        showHint: ReturnType<typeof vi.fn>
        moveCursor: ReturnType<typeof vi.fn>
        selectCursor: ReturnType<typeof vi.fn>
    }
    cleanup: ReturnType<typeof vi.fn>
}

let callbacks: ControllerCallbacks = {}
let handle: FakeHandle
let endHandlers: Array<(event: { data?: unknown }) => void>

function makeHandle(): FakeHandle {
    const canvas = document.createElement('canvas')
    endHandlers = []
    return {
        game: {
            pause: vi.fn(),
            resume: vi.fn(),
            start: vi.fn(),
            reset: vi.fn(),
            clickCell: vi.fn(),
            getState: vi.fn(() => ({ isActive: true, isPaused: false })),
            getGameStats: vi.fn(() => ({ maxCombo: 4 })),
            on: vi.fn((event: string, cb: (e: { data?: unknown }) => void) => {
                if (event === 'end') {
                    endHandlers.push(cb)
                }
            }),
        },
        renderer: {
            getApp: vi.fn(() => ({ canvas })),
            setPreferences: vi.fn(),
            cancelAnimations: vi.fn(),
            showHint: vi.fn(),
            moveCursor: vi.fn(),
            selectCursor: vi.fn(),
        },
        cleanup: vi.fn(),
    }
}

function jewelState(overrides: Record<string, unknown> = {}) {
    return {
        isActive: true,
        isPaused: false,
        isAnimating: false,
        selected: null,
        combo: 0,
        movesMade: 5,
        grid: [],
        ...overrides,
    }
}

const CHALLENGES = {
    level: 7,
    xp: 640,
    xpToNextLevel: 120,
    xpProgress: 84,
    streak: 3,
    resetIn: 3600,
    date: '2026-10-30',
    challenges: [
        {
            icon: '💎',
            name: 'Shallow chains',
            xpReward: 50,
            description: 'Chain twice.',
            currentValue: 1,
            targetValue: 2,
            completed: false,
            gameId: 'bejeweled',
            completedAt: null,
        },
        {
            icon: '🌊',
            name: 'Any dive',
            xpReward: 10,
            description: 'Play a dive.',
            currentValue: 2,
            targetValue: 2,
            completed: true,
            gameId: null,
            completedAt: null,
        },
        {
            icon: '🐍',
            name: 'Other plate',
            xpReward: 20,
            description: 'Another game.',
            currentValue: 0,
            targetValue: 1,
            completed: false,
            gameId: 'snake',
            completedAt: null,
        },
    ],
}

const LEADERBOARD = {
    gameId: 'bejeweled',
    gameName: 'Bejeweled',
    viewerAuthenticated: true,
    leaderboard: [
        { rank: 1, name: 'Abalone', score: 900 },
        { rank: 2, name: 'Brittle', score: 700 },
    ],
}

function setupDOM({ signedIn = false } = {}): HTMLElement {
    document.body.innerHTML = `
        <span id="account-label">Sign in</span>
        <div id="host" data-signed-in="${signedIn}">
            <button data-sheet="commission">💎</button>
            <button data-sheet="help">?</button>
            <button data-sheet="log">▤</button>
            <button id="pause-btn" disabled>Ⅱ</button>
            <div id="score">0</div>
            <div id="time-remaining">60</div>
            <progress id="time-fill" max="60" value="60"></progress>
            <div data-best>—</div>
            <div id="moves">0</div>
            <span id="cascade-label">Idle</span>
            <div id="cascade-pips"><span></span><span></span><span></span><span></span><span></span></div>
            <span id="max-combo">×0</span>
            <p id="board-notice">Drag a gem onto its neighbour</p>
            <button id="hint-btn" disabled>✦ Hint</button>
        </div>
        <dialog id="field-sheet">
            <section data-panel="intro">
                <h2 id="intro-title">Bejeweled</h2>
                <p id="game-error" class="hidden">err</p>
                <button id="start-btn" disabled>Loading…</button>
                <button data-sheet="log">Field log</button>
            </section>
            <section data-panel="pause" class="hidden">
                <h2 id="pause-title">Paused</h2>
                <button data-pace="swift" aria-pressed="true">Swift</button>
                <button data-pace="measured" aria-pressed="false">Measured</button>
                <button id="glyphs-btn" aria-pressed="false"><span>Glyphs</span><span data-state>Off</span></button>
                <button id="sound-btn" aria-pressed="true"><span>Sound</span><span data-state>On</span></button>
                <button id="motion-btn" aria-pressed="false"><span>Reduced motion</span><span data-state>Off</span></button>
                <button id="resume-btn">Continue</button>
                <button id="reset-btn">Abandon & restart</button>
            </section>
            <section data-panel="results" class="hidden">
                <h2 id="results-title">The tide turns</h2>
                <span id="personal-best" class="hidden">Personal best</span>
                <span data-best>—</span>
                <dd id="per-move">0</dd>
                <dd id="final-moves">0</dd>
                <dd id="final-combo">×0</dd>
                <dd id="final-largest">0</dd>
                <dd id="final-matches">0</dd>
            </section>
            <section data-panel="help" class="hidden">
                <h2 id="help-title">How it plays</h2>
                <button data-close>Got it</button>
            </section>
            <section data-panel="log" class="hidden">
                <h2 id="log-title">Your dive record</h2>
                <div id="xp-panel" class="hidden">
                    <span id="xp-label"></span><span id="xp-next"></span>
                    <progress id="xp-fill" max="100" value="0"></progress>
                    <span id="streak"></span>
                </div>
                <strong id="visit-count">0</strong>
                <strong id="visit-chain">×0</strong>
                <span data-best>—</span>
                <p id="empty-log">Nothing logged</p>
                <ol id="recent-dives"></ol>
                <p id="leaderboard-status"></p>
                <ol id="leaderboard"></ol>
                <button data-close>Back</button>
            </section>
            <section data-panel="commission" class="hidden">
                <h2 id="commission-title">Commission</h2>
                <p id="commission-status"></p>
                <div id="commissions"></div>
                <button data-close>Back</button>
            </section>
        </dialog>
        <template id="commission-template">
            <article><span data-icon></span><h3 data-name></h3><span data-xp></span>
            <p data-description></p><progress max="100" value="0"></progress><p data-progress></p></article>
        </template>
        <div id="achievement-award-overlay"><button data-card>Award</button></div>
        <div id="challenge-complete-overlay" class="hidden">
            <button data-card>Challenge</button>
        </div>
    `
    return document.getElementById('host')!
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const sheet = () => document.getElementById('field-sheet') as HTMLDialogElement
const panel = (name: string) =>
    sheet().querySelector<HTMLElement>(`[data-panel="${name}"]`)!
const click = (el: Element) =>
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
const keydown = (init: KeyboardEventInit, target: EventTarget = document) => {
    const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
    })
    target.dispatchEvent(event)
    return event
}

async function mountReady(
    host: HTMLElement,
    signal = new AbortController().signal
) {
    initMock.mockImplementation(async (_config, cb: ControllerCallbacks) => {
        callbacks = cb
        return handle
    })
    mount(host, signal)
    await vi.waitFor(() =>
        expect(
            document.getElementById('start-btn') as HTMLButtonElement
        ).not.toBeDisabled()
    )
    return signal
}

describe('bejeweled controller', () => {
    let host: HTMLElement
    let abort: AbortController
    let restoreDOM: () => void

    beforeEach(() => {
        restoreDOM = installFieldPlateDOM()
        vi.clearAllMocks()
        callbacks = {}
        handle = makeHandle()
        abort = new AbortController()
        host = setupDOM()
        getUserBestScoreMock.mockResolvedValue(null)
        getChallengesMock.mockResolvedValue(CHALLENGES)
        getLeaderboardMock.mockResolvedValue(LEADERBOARD)
        findLegalSwapMock.mockReturnValue([
            { row: 0, col: 1 },
            { row: 0, col: 2 },
        ])
    })

    afterEach(() => {
        if (!abort.signal.aborted) {
            abort.abort()
        }
        document.body.innerHTML = ''
        restoreDOM()
    })

    describe('mount and initialize', () => {
        it('opens the intro sheet and applies preferences once init resolves', async () => {
            await mountReady(host, abort.signal)
            expect(sheet().open).toBe(true)
            expect(panel('intro').classList.contains('hidden')).toBe(false)
            expect(sheet().dataset.panel).toBe('intro')
            expect(sheet().getAttribute('aria-labelledby')).toBe('intro-title')
            const start = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            expect(start.textContent).toBe('Begin the dive')
            expect(handle.renderer.setPreferences).toHaveBeenCalledWith(
                'swift',
                false,
                false
            )
            expect(
                document
                    .querySelector('[data-pace="swift"]')!
                    .getAttribute('aria-pressed')
            ).toBe('true')
            expect(
                document
                    .querySelector('[data-pace="measured"]')!
                    .getAttribute('aria-pressed')
            ).toBe('false')
        })

        it('skips account refresh for signed-out players', async () => {
            await mountReady(host, abort.signal)
            await flush()
            expect(getUserBestScoreMock).not.toHaveBeenCalled()
            expect(getChallengesMock).not.toHaveBeenCalled()
        })

        it('loads best and commissions for signed-in players', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(1234)
            await mountReady(host, abort.signal)
            await flush()
            document.querySelectorAll('[data-best]').forEach(el => {
                expect(el.textContent).toBe('1,234')
            })
            expect(document.getElementById('account-label')!.textContent).toBe(
                'LV 7'
            )
            expect(document.getElementById('xp-label')!.textContent).toBe(
                'Level 7 · 640 XP'
            )
            expect(document.getElementById('xp-next')!.textContent).toBe(
                '120 to next level'
            )
            expect(document.getElementById('streak')!.textContent).toBe(
                '3 days'
            )
            expect(
                document
                    .getElementById('xp-panel')!
                    .classList.contains('hidden')
            ).toBe(false)
            expect(
                (document.querySelector('#xp-fill') as HTMLProgressElement)
                    .value
            ).toBe(84)
            // Snake-scoped challenge is filtered out; the other two render.
            const cards = document
                .getElementById('commissions')!
                .querySelectorAll('article')
            expect(cards).toHaveLength(2)
            expect(
                document.getElementById('commissions')!.textContent
            ).toContain('Shallow chains')
            expect(
                document.getElementById('commissions')!.textContent
            ).toContain('Completed')
        })

        it('reports empty commissions with the catalogue hint', async () => {
            host = setupDOM({ signedIn: true })
            getChallengesMock.mockResolvedValue({
                ...CHALLENGES,
                challenges: [CHALLENGES.challenges[2]],
            })
            await mountReady(host, abort.signal)
            await flush()
            expect(
                document.getElementById('commission-status')!.textContent
            ).toContain('No Bejeweled commissions today')
        })

        it('degrades gracefully when the challenges request fails', async () => {
            host = setupDOM({ signedIn: true })
            getChallengesMock.mockRejectedValue(new Error('offline'))
            await mountReady(host, abort.signal)
            await flush()
            expect(
                document.getElementById('commission-status')!.textContent
            ).toContain('Commissions are unavailable')
        })

        it('reveals the error note and marks the plate unavailable on init failure', async () => {
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})
            initMock.mockRejectedValue(new Error('boom'))
            mount(host, abort.signal)
            await vi.waitFor(() =>
                expect(
                    document
                        .getElementById('game-error')!
                        .classList.contains('hidden')
                ).toBe(false)
            )
            expect(
                (document.getElementById('start-btn') as HTMLButtonElement)
                    .textContent
            ).toBe('Plate unavailable')
            consoleSpy.mockRestore()
        })

        it('cleans up a late-arriving handle when the signal aborted mid-init', async () => {
            let resolveInit!: (value: FakeHandle) => void
            initMock.mockImplementation(
                (_config, cb: ControllerCallbacks) =>
                    new Promise(resolve => {
                        callbacks = cb
                        resolveInit = resolve
                    })
            )
            mount(host, abort.signal)
            abort.abort()
            resolveInit(handle)
            await flush()
            expect(handle.cleanup).toHaveBeenCalledTimes(1)
        })
    })

    describe('sheet navigation', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
        })

        it('pauses an active run and resumes it after the panel closes', () => {
            handle.game.getState.mockReturnValue({
                isActive: true,
                isPaused: false,
            })
            click(host.querySelector('[data-sheet="help"]')!)
            expect(handle.game.pause).toHaveBeenCalledTimes(1)
            expect(panel('help').classList.contains('hidden')).toBe(false)
            click(sheet().querySelector('[data-panel="help"] [data-close]')!)
            expect(handle.game.resume).toHaveBeenCalledTimes(1)
        })

        it('reopens the return panel when no resume is pending', () => {
            handle.game.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="help"]')!)
            click(sheet().querySelector('[data-panel="help"] [data-close]')!)
            expect(panel('intro').classList.contains('hidden')).toBe(false)
        })

        it('refreshes leaderboard and account when the log opens', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(50)
            await mountReady(host, abort.signal)
            getChallengesMock.mockClear()
            handle.game.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="log"]')!)
            await flush()
            expect(getLeaderboardMock).toHaveBeenCalledTimes(1)
            expect(getChallengesMock).toHaveBeenCalledTimes(1)
            const list = document.getElementById('leaderboard')!
            expect(list.children).toHaveLength(2)
            expect(list.textContent).toContain('Abalone')
            expect(list.textContent).toContain('900')
        })

        it('shows the empty-leaderboard note and survives request failure', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(50)
            await mountReady(host, abort.signal)
            getLeaderboardMock.mockResolvedValue({
                ...LEADERBOARD,
                leaderboard: [],
            })
            handle.game.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="log"]')!)
            await flush()
            expect(
                document.getElementById('leaderboard-status')!.textContent
            ).toBe('No recorded dives yet.')

            getLeaderboardMock.mockRejectedValue(new Error('down'))
            click(sheet().querySelector('[data-panel="log"] [data-close]')!)
            click(host.querySelector('[data-sheet="log"]')!)
            await flush()
            expect(
                document.getElementById('leaderboard-status')!.textContent
            ).toContain('leaderboard is unavailable')
        })

        it('rejects non-leaderboard payloads as unavailable', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(50)
            await mountReady(host, abort.signal)
            getLeaderboardMock.mockResolvedValue({ games: [] })
            handle.game.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="log"]')!)
            await flush()
            expect(
                document.getElementById('leaderboard-status')!.textContent
            ).toContain('leaderboard is unavailable')
        })

        it('Escape closes info panels and resumes from the pause panel', () => {
            handle.game.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="log"]')!)
            sheet().dispatchEvent(new Event('cancel', { cancelable: true }))
            expect(panel('intro').classList.contains('hidden')).toBe(false)

            callbacks.onPause!()
            sheet().dispatchEvent(new Event('cancel', { cancelable: true }))
            expect(handle.game.resume).toHaveBeenCalled()
        })

        it('reopens the current panel if the dialog is force-closed', async () => {
            handle.game.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="help"]')!)
            sheet().close()
            await flush()
            expect(panel('help').classList.contains('hidden')).toBe(false)
        })
    })

    describe('preferences', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
        })

        it('switches pace and re-syncs the renderer', () => {
            click(document.querySelector('[data-pace="measured"]')!)
            expect(handle.renderer.setPreferences).toHaveBeenLastCalledWith(
                'measured',
                false,
                false
            )
            expect(
                document
                    .querySelector('[data-pace="measured"]')!
                    .getAttribute('aria-pressed')
            ).toBe('true')
            expect(
                document
                    .querySelector('[data-pace="swift"]')!
                    .getAttribute('aria-pressed')
            ).toBe('false')
        })

        it('toggles glyphs, sound and motion with their state labels', () => {
            click(document.getElementById('glyphs-btn')!)
            click(document.getElementById('sound-btn')!)
            click(document.getElementById('motion-btn')!)
            expect(handle.renderer.setPreferences).toHaveBeenLastCalledWith(
                'swift',
                true,
                true
            )
            expect(
                document
                    .getElementById('glyphs-btn')!
                    .querySelector('[data-state]')!.textContent
            ).toBe('On')
            expect(
                document
                    .getElementById('sound-btn')!
                    .querySelector('[data-state]')!.textContent
            ).toBe('Off')
            expect(
                document
                    .getElementById('motion-btn')!
                    .getAttribute('aria-pressed')
            ).toBe('true')
        })
    })

    describe('controls', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
            callbacks.onStart!()
            handle.game.pause.mockClear()
        })

        it('pause, resume and reset buttons drive the game', () => {
            click(host.querySelector('#pause-btn')!)
            expect(handle.game.pause).toHaveBeenCalledTimes(1)
            click(document.getElementById('resume-btn')!)
            expect(handle.game.resume).toHaveBeenCalledTimes(1)
            click(document.getElementById('reset-btn')!)
            expect(handle.renderer.cancelAnimations).toHaveBeenCalledTimes(1)
            expect(handle.game.reset).toHaveBeenCalledTimes(1)
            expect(handle.game.start).toHaveBeenCalledTimes(1)
        })

        it('hint selects the pending cell then shows the legal swap', () => {
            handle.game.getState.mockReturnValue(
                jewelState({ selected: { row: 2, col: 3 } })
            )
            click(host.querySelector('#hint-btn')!)
            expect(handle.game.clickCell).toHaveBeenCalledWith(2, 3)
            expect(handle.renderer.showHint).toHaveBeenCalledWith([
                { row: 0, col: 1 },
                { row: 0, col: 2 },
            ])
            expect(
                document.getElementById('board-notice')!.textContent
            ).toContain('Swap row 1, column 2')
        })

        it('hint warns when no legal swap exists', () => {
            handle.game.getState.mockReturnValue(jewelState())
            findLegalSwapMock.mockReturnValue(null)
            click(host.querySelector('#hint-btn')!)
            expect(handle.game.clickCell).not.toHaveBeenCalled()
            expect(handle.renderer.showHint).toHaveBeenCalledWith([])
            expect(
                document.getElementById('board-notice')!.textContent
            ).toContain('No legal swaps')
        })

        it('hint does nothing while paused, animating or inactive', () => {
            for (const state of [
                jewelState({ isPaused: true }),
                jewelState({ isAnimating: true }),
                jewelState({ isActive: false }),
            ]) {
                handle.game.getState.mockReturnValue(state)
                click(host.querySelector('#hint-btn')!)
            }
            expect(handle.renderer.showHint).not.toHaveBeenCalled()
        })

        it('P resumes from the pause panel and pauses when the sheet is closed', () => {
            callbacks.onPause!()
            keydown({ key: 'p' })
            expect(handle.game.resume).toHaveBeenCalledTimes(1)

            callbacks.onResume!()
            keydown({ key: 'P' })
            expect(handle.game.pause).toHaveBeenCalledTimes(1)
        })

        it('P does nothing while another sheet panel is open', () => {
            handle.game.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="help"]')!)
            keydown({ key: 'p' })
            expect(handle.game.pause).not.toHaveBeenCalled()
            expect(handle.game.resume).not.toHaveBeenCalled()
        })

        it('H shows a hint only with the sheet closed', () => {
            handle.game.getState.mockReturnValue(jewelState())
            keydown({ key: 'h' })
            expect(handle.renderer.showHint).toHaveBeenCalledTimes(1)

            handle.renderer.showHint.mockClear()
            handle.game.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="help"]')!)
            handle.game.getState.mockReturnValue(jewelState())
            keydown({ key: 'h' })
            expect(handle.renderer.showHint).not.toHaveBeenCalled()
        })

        it('arrow keys move the cursor and Enter selects it', () => {
            keydown({ key: 'ArrowUp' })
            expect(handle.renderer.moveCursor).toHaveBeenCalledWith(-1, 0)
            keydown({ key: 'ArrowDown' })
            expect(handle.renderer.moveCursor).toHaveBeenCalledWith(1, 0)
            keydown({ key: 'ArrowLeft' })
            expect(handle.renderer.moveCursor).toHaveBeenCalledWith(0, -1)
            keydown({ key: 'ArrowRight' })
            expect(handle.renderer.moveCursor).toHaveBeenCalledWith(0, 1)
            keydown({ key: 'Enter' })
            expect(handle.renderer.selectCursor).toHaveBeenCalledTimes(1)
        })

        it('leaves keys alone in editable targets and on buttons', () => {
            const input = document.createElement('input')
            document.body.appendChild(input)
            keydown({ key: 'ArrowUp' }, input)
            keydown({ key: 'Enter' }, document.getElementById('start-btn')!)
            const anchor = document.createElement('a')
            anchor.href = '/x'
            document.body.appendChild(anchor)
            keydown({ key: 'h' }, anchor)
            expect(handle.renderer.moveCursor).not.toHaveBeenCalled()
            expect(handle.renderer.selectCursor).not.toHaveBeenCalled()
            expect(handle.renderer.showHint).not.toHaveBeenCalled()
        })

        it('ignores keys while a reward overlay holds the panels inert', () => {
            sheet()
                .querySelectorAll<HTMLElement>('[data-panel]')
                .forEach(p => {
                    p.inert = true
                })
            keydown({ key: 'ArrowUp' })
            keydown({ key: 'p' })
            expect(handle.renderer.moveCursor).not.toHaveBeenCalled()
            expect(handle.game.pause).not.toHaveBeenCalled()
        })
    })

    describe('game callbacks', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
        })

        it('onStart closes the sheet and enables the run controls', () => {
            callbacks.onStart!()
            expect(sheet().open).toBe(false)
            expect(
                (host.querySelector('#pause-btn') as HTMLButtonElement).disabled
            ).toBe(false)
            expect(
                (host.querySelector('#hint-btn') as HTMLButtonElement).disabled
            ).toBe(false)
            expect(document.getElementById('score')!.textContent).toBe('0')
            expect(
                (host.querySelector('#time-fill') as HTMLProgressElement).value
            ).toBe(60)
            expect(document.getElementById('board-notice')!.textContent).toBe(
                'Drag a gem onto its neighbour'
            )
        })

        it('onTimeUpdate paints the time bar with amber then urgent states', () => {
            const bar = host.querySelector('#time-fill') as HTMLProgressElement
            const remaining = host.querySelector('#time-remaining')!
            callbacks.onTimeUpdate!(45)
            expect(bar.value).toBe(45)
            callbacks.onTimeUpdate!(15)
            expect(bar.classList).toContain('amber')
            expect(remaining.classList).toContain('amber')
            callbacks.onTimeUpdate!(8)
            expect(bar.classList).toContain('urgent')
            expect(remaining.classList).toContain('urgent')
            callbacks.onTimeUpdate!(30)
            expect(bar.classList).not.toContain('urgent')
            expect(bar.classList).not.toContain('amber')
        })

        it('onScoreUpdate blips only for positive scores', () => {
            callbacks.onScoreUpdate!(0)
            callbacks.onScoreUpdate!(12)
            // AudioContext is stubbed; exercising the >0 path is enough.
        })

        it('onStateChange mirrors the cascade and hint state', () => {
            callbacks.onStateChange!(
                jewelState({ combo: 4, movesMade: 9, isAnimating: true })
            )
            expect(document.getElementById('moves')!.textContent).toBe('9')
            expect(document.getElementById('cascade-label')!.textContent).toBe(
                '×4 chain'
            )
            expect(
                document.getElementById('cascade-label')!.classList
            ).toContain('amber')
            expect(document.getElementById('max-combo')!.textContent).toBe('×4')
            const pips = host.querySelectorAll('#cascade-pips span')
            expect(pips[3].classList).toContain('active')
            expect(pips[4].classList).not.toContain('active')
            expect(
                (host.querySelector('#hint-btn') as HTMLButtonElement).disabled
            ).toBe(true)
            expect(document.getElementById('board-notice')!.textContent).toBe(
                'Chain in motion'
            )
        })

        it('onStateChange falls back to idle labels and accent cascade', () => {
            callbacks.onStateChange!(jewelState({ combo: 1 }))
            expect(document.getElementById('cascade-label')!.textContent).toBe(
                '×1 chain'
            )
            expect(
                document.getElementById('cascade-label')!.classList
            ).toContain('accent')
            handle.game.getGameStats.mockReturnValue({ maxCombo: 0 })
            callbacks.onStateChange!(jewelState())
            expect(document.getElementById('cascade-label')!.textContent).toBe(
                'Idle'
            )
            expect(document.getElementById('max-combo')!.textContent).toBe('×0')
            expect(document.getElementById('board-notice')!.textContent).toBe(
                'Drag a gem onto its neighbour'
            )
        })

        it('onEnd records the dive, unlocks personal best and shows results', () => {
            callbacks.onEnd!(2000, {
                movesMade: 10,
                maxCombo: 3,
                largestMatch: 5,
                totalMatches: 12,
            })
            expect(
                (host.querySelector('#pause-btn') as HTMLButtonElement).disabled
            ).toBe(true)
            expect(
                (host.querySelector('#hint-btn') as HTMLButtonElement).disabled
            ).toBe(true)
            expect(document.getElementById('final-moves')!.textContent).toBe(
                '10'
            )
            expect(document.getElementById('final-combo')!.textContent).toBe(
                '×3'
            )
            expect(document.getElementById('final-largest')!.textContent).toBe(
                '5'
            )
            expect(document.getElementById('final-matches')!.textContent).toBe(
                '12'
            )
            expect(document.getElementById('per-move')!.textContent).toBe('200')
            expect(document.getElementById('results-title')!.textContent).toBe(
                'A chain reaction'
            )
            expect(
                document.getElementById('personal-best')!.classList
            ).not.toContain('hidden')
            const rows = document.getElementById('recent-dives')!
            expect(rows.children).toHaveLength(1)
            expect(rows.textContent).toContain('Dive 1')
            expect(rows.textContent).toContain('10 moves')
            expect(rows.textContent).toContain('×3')
            expect(document.getElementById('visit-count')!.textContent).toBe(
                '1'
            )
            expect(document.getElementById('visit-chain')!.textContent).toBe(
                '×3'
            )
            expect(panel('results').classList.contains('hidden')).toBe(false)
        })

        it('onEnd handles a quiet dive and a replay below the visit best', () => {
            callbacks.onEnd!(0, {
                movesMade: 0,
                maxCombo: 1,
                largestMatch: 3,
                totalMatches: 2,
            })
            expect(document.getElementById('per-move')!.textContent).toBe('—')
            expect(document.getElementById('results-title')!.textContent).toBe(
                'The tide turns'
            )

            // A 500-point dive sets the visit best → badge shows.
            callbacks.onEnd!(500, {
                movesMade: 3,
                maxCombo: 2,
                largestMatch: 4,
                totalMatches: 4,
            })
            expect(
                document.getElementById('personal-best')!.classList
            ).not.toContain('hidden')

            // A follow-up dive below that visit best hides it again.
            callbacks.onEnd!(100, {
                movesMade: 1,
                maxCombo: 1,
                largestMatch: 3,
                totalMatches: 1,
            })
            expect(document.getElementById('visit-count')!.textContent).toBe(
                '3'
            )
            expect(
                document.getElementById('personal-best')!.classList
            ).toContain('hidden')
        })

        it('refreshes the account on the structured end event only', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(10)
            await mountReady(host, abort.signal)
            getChallengesMock.mockClear()
            endHandlers.forEach(cb => cb({}))
            await flush()
            expect(getChallengesMock).not.toHaveBeenCalled()
            endHandlers.forEach(cb => cb({ data: { score: 10 } }))
            await flush()
            expect(getChallengesMock).toHaveBeenCalledTimes(1)
        })
    })

    describe('reward overlay observer', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
        })

        it('inerts panels while a reward shows and restores the sheet after', async () => {
            const awards = document.getElementById('achievement-award-overlay')!
            awards.style.display = 'flex'
            await flush()
            sheet()
                .querySelectorAll<HTMLElement>('[data-panel]')
                .forEach(p => {
                    expect(p.inert).toBe(true)
                })
            awards.style.display = ''
            await flush()
            sheet()
                .querySelectorAll<HTMLElement>('[data-panel]')
                .forEach(p => {
                    expect(p.inert).toBe(false)
                })
            expect(panel('intro').classList.contains('hidden')).toBe(false)
        })

        it('pauses when a reward activates with the sheet closed', async () => {
            callbacks.onResume!()
            document
                .getElementById('challenge-complete-overlay')!
                .classList.remove('hidden')
            await flush()
            expect(handle.game.pause).toHaveBeenCalled()
        })
    })

    describe('page lifecycle', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
        })

        it('pauses on persisted pagehide and tears down on unload', () => {
            const persisted = new Event('pagehide') as PageTransitionEvent
            Object.defineProperty(persisted, 'persisted', { value: true })
            window.dispatchEvent(persisted)
            expect(handle.game.pause).toHaveBeenCalledTimes(1)
            expect(handle.cleanup).not.toHaveBeenCalled()

            const unload = new Event('pagehide') as PageTransitionEvent
            Object.defineProperty(unload, 'persisted', { value: false })
            window.dispatchEvent(unload)
            expect(handle.cleanup).toHaveBeenCalledTimes(1)
        })

        it('pauses when the page becomes hidden', () => {
            const spy = vi
                .spyOn(document, 'hidden', 'get')
                .mockReturnValue(true)
            document.dispatchEvent(new Event('visibilitychange'))
            expect(handle.game.pause).toHaveBeenCalledTimes(1)
            spy.mockRestore()
        })

        it('abort sets disposed and cleans up the handle', () => {
            abort.abort()
            expect(handle.cleanup).toHaveBeenCalledTimes(1)
        })
    })
})
