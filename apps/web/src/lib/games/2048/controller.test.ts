// 2048 field-plate controller tests (HPA-393 Stage 4). mount() owns the
// sheet dialog, undo/win/stuck flows, account panels, rule-figure painting
// and teardown; the game handle is mocked so the wiring can be exercised
// under jsdom.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const {
    initMock,
    getUserBestScoreMock,
    getChallengesMock,
    getLeaderboardMock,
} = vi.hoisted(() => ({
    initMock: vi.fn(),
    getUserBestScoreMock: vi.fn(),
    getChallengesMock: vi.fn(),
    getLeaderboardMock: vi.fn(),
}))

vi.mock('@/lib/games/2048/initFramework', () => ({
    init2048GameFramework: initMock,
}))
vi.mock('@/lib/services/scoreService', () => ({
    getUserBestScore: getUserBestScoreMock,
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
    onStateChange?: (state: unknown) => void
    onEnd?: (score: number, stats: unknown) => void
}

interface FakeHandle {
    game: {
        pause: ReturnType<typeof vi.fn>
        resume: ReturnType<typeof vi.fn>
        canUndo: ReturnType<typeof vi.fn>
        setUndos: ReturnType<typeof vi.fn>
        legalDirections: ReturnType<typeof vi.fn>
        on: ReturnType<typeof vi.fn>
    }
    renderer: {
        getApp: ReturnType<typeof vi.fn>
        setReducedMotion: ReturnType<typeof vi.fn>
        render: ReturnType<typeof vi.fn>
    }
    cleanup: ReturnType<typeof vi.fn>
    restart: ReturnType<typeof vi.fn>
    getState: ReturnType<typeof vi.fn>
    endGame: ReturnType<typeof vi.fn>
    undo: ReturnType<typeof vi.fn>
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
            canUndo: vi.fn(() => true),
            setUndos: vi.fn(),
            legalDirections: vi.fn(() => ['left', 'right']),
            on: vi.fn((event: string, cb: (e: { data?: unknown }) => void) => {
                if (event === 'end') {
                    endHandlers.push(cb)
                }
            }),
        },
        renderer: {
            getApp: vi.fn(() => ({ canvas })),
            setReducedMotion: vi.fn(),
            render: vi.fn(),
        },
        cleanup: vi.fn(),
        restart: vi.fn(),
        getState: vi.fn(() => ({ isActive: true, isPaused: false })),
        endGame: vi.fn().mockResolvedValue(undefined),
        undo: vi.fn(() => true),
    }
}

// A nearly-full board leaves `free` empty cells; each cell is a tile or 0.
function boardWith(free: number) {
    const cells = Array.from({ length: 16 }, (_, i) => (i < 16 - free ? 2 : 0))
    return [
        cells.slice(0, 4),
        cells.slice(4, 8),
        cells.slice(8, 12),
        cells.slice(12, 16),
    ]
}

function gameState(overrides: Record<string, unknown> = {}) {
    return {
        board: boardWith(4),
        maxTile: 32,
        score: 0,
        moveCount: 8,
        mergeCount: 3,
        undosLeft: 1,
        undosUsed: 0,
        won: false,
        stuck: false,
        isActive: true,
        isPaused: false,
        ...overrides,
    }
}

const CHALLENGES = {
    level: 4,
    xp: 300,
    xpToNextLevel: 90,
    xpProgress: 77,
    streak: 2,
    resetIn: 3600,
    date: '2026-10-30',
    challenges: [
        {
            icon: '🧪',
            name: 'Deep dives',
            xpReward: 40,
            description: 'Finish two dives.',
            currentValue: 1,
            targetValue: 2,
            completed: false,
            gameId: '2048',
            completedAt: null,
        },
    ],
}

const LEADERBOARD = {
    gameId: 'game-2048',
    gameName: '2048',
    viewerAuthenticated: true,
    leaderboard: [{ rank: 1, name: 'Nautilus', score: 12000 }],
}

function setupDOM({ signedIn = false } = {}): HTMLElement {
    const milestones = [64, 128, 256, 512, 1024, 2048, 4096]
        .map(v => `<span data-milestone="${v}"></span>`)
        .join('')
    document.body.innerHTML = `
        <span id="account-label">Sign in</span>
        <div id="host" data-signed-in="${signedIn}">
            <button data-sheet="commission">⭐</button>
            <button data-sheet="help">?</button>
            <button id="pause-btn" disabled>Ⅱ</button>
            <strong id="score-display">0</strong>
            <strong data-best>—</strong>
            <span id="next-target">Next · 64</span>
            ${milestones}
            <div id="game-2048-container"></div>
            <div id="merge-feedback"></div>
            <p id="board-warning"></p>
            <button id="undo-btn" disabled>↶ Undo · <span id="undos-left">1</span></button>
            <p id="game-status"></p>
        </div>
        <dialog id="field-sheet">
            <section data-panel="intro">
                <h2 id="intro-title">2048</h2>
                <span data-best>—</span>
                <p id="load-status">Preparing the plate…</p>
                <button id="start-btn" disabled>Begin the dive</button>
                <button data-sheet="log">Field log</button>
                <button data-sheet="help">? Method</button>
            </section>
            <section data-panel="pause" class="hidden">
                <h2 id="pause-title">Paused</h2>
                <button data-undos="0" aria-pressed="false">None</button>
                <button data-undos="1" aria-pressed="true">One</button>
                <button data-undos="3" aria-pressed="false">Three</button>
                <button id="sound-btn" aria-pressed="true"><span>Sound</span><span id="sound-state">On</span></button>
                <button id="motion-btn" aria-pressed="false"><span>Reduced motion</span><span id="motion-state">Off</span></button>
                <button id="resume-btn">Continue</button>
                <button data-end>End dive</button>
            </section>
            <section data-panel="win" class="hidden">
                <h2 id="win-title">Charted</h2>
                <p id="win-line"></p>
                <button id="keep-playing-btn">Keep diving</button>
                <button data-end>Surface & log it</button>
            </section>
            <section data-panel="stuck" class="hidden">
                <h2 id="stuck-title">The bed set</h2>
                <button id="undo-stuck-btn">Step back</button>
                <button data-end>End the dive</button>
            </section>
            <section data-panel="results" class="hidden">
                <h2 id="results-title">Results</h2>
                <p id="result-advice"></p>
                <span id="personal-best" class="hidden">Personal best</span>
                <span data-best>—</span>
                <dd id="final-merges">0</dd>
                <dd id="points-per-move">0</dd>
                <dd id="final-undos">0</dd>
                <dd id="final-max-tile">2</dd>
            </section>
            <section data-panel="help" class="hidden">
                <h2 id="help-title">Method</h2>
                <canvas class="rule-figure" data-fig="goal" width="300" height="200"></canvas>
                <canvas class="rule-figure" data-fig="slide" width="300" height="200"></canvas>
                <canvas class="rule-figure" data-fig="merge" width="300" height="200"></canvas>
                <button data-close>Got it</button>
            </section>
            <section data-panel="log" class="hidden">
                <h2 id="log-title">Field log</h2>
                <div id="xp-panel" class="hidden">
                    <span id="xp-label"></span><span id="xp-next"></span>
                    <progress id="xp-fill" max="100" value="0"></progress>
                    <span id="streak"></span>
                </div>
                <span id="previous-best">—</span>
                <strong id="visit-count">0</strong>
                <strong id="visit-tile">0</strong>
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

describe('2048 controller', () => {
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
    })

    afterEach(() => {
        if (!abort.signal.aborted) {
            abort.abort()
        }
        document.body.innerHTML = ''
        restoreDOM()
    })

    describe('mount and initialize', () => {
        it('opens the intro sheet, enables start and clears the load status', async () => {
            await mountReady(host, abort.signal)
            expect(sheet().open).toBe(true)
            expect(panel('intro').classList.contains('hidden')).toBe(false)
            expect(sheet().dataset.panel).toBe('intro')
            expect(document.getElementById('load-status')!.textContent).toBe('')
            expect((window as { game2048?: unknown }).game2048).toBe(handle)
        })

        it('paints the rule figures once fonts load', async () => {
            await mountReady(host, abort.signal)
            expect(document.fonts.load).toHaveBeenCalledWith(
                '500 40px "Field Display"'
            )
            // Each figure canvas was driven through the 2D context.
            const canvases =
                document.querySelectorAll<HTMLCanvasElement>('.rule-figure')
            expect(canvases).toHaveLength(3)
            canvases.forEach(canvas => {
                expect(canvas.getContext).toHaveBeenCalledWith('2d')
            })
        })

        it('marks the plate unavailable when fonts or init fail', async () => {
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})
            vi.mocked(document.fonts.load).mockRejectedValueOnce(
                new Error('no fonts')
            )
            mount(host, abort.signal)
            await vi.waitFor(() =>
                expect(
                    document.getElementById('load-status')!.textContent
                ).toBe(
                    'The plate could not start. Reload the page to try again.'
                )
            )
            expect(consoleSpy).toHaveBeenCalled()
            consoleSpy.mockRestore()
        })

        it('marks the plate unavailable when init resolves without a handle', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {})
            initMock.mockResolvedValue(undefined)
            mount(host, abort.signal)
            await vi.waitFor(() =>
                expect(
                    document.getElementById('load-status')!.textContent
                ).toBe(
                    'The plate could not start. Reload the page to try again.'
                )
            )
            vi.mocked(console.error).mockRestore()
        })

        it('shows saved best and the previous-best line for signed-in players', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(2048)
            await mountReady(host, abort.signal)
            await flush()
            expect(getUserBestScoreMock).toHaveBeenCalledTimes(1)
            document.querySelectorAll('[data-best]').forEach(el => {
                expect(el.textContent).toBe('2,048')
            })
            expect(document.getElementById('previous-best')!.textContent).toBe(
                '2,048'
            )
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
            // fonts.load resolves first, then init is invoked and captures
            // resolveInit — flush so it exists before aborting.
            await flush()
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

        it('pauses an active run when a panel opens and resumes on close', () => {
            handle.getState.mockReturnValue({
                isActive: true,
                isPaused: false,
            })
            click(host.querySelector('[data-sheet="help"]')!)
            expect(handle.game.pause).toHaveBeenCalledTimes(1)
            expect(panel('help').classList.contains('hidden')).toBe(false)
            click(sheet().querySelector('[data-panel="help"] [data-close]')!)
            expect(handle.game.resume).toHaveBeenCalledTimes(1)
        })

        it('skips the pause when no run is active', () => {
            handle.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="help"]')!)
            expect(handle.game.pause).not.toHaveBeenCalled()
        })

        it('refreshes leaderboard and account on the log panel', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(64)
            await mountReady(host, abort.signal)
            getChallengesMock.mockClear()
            handle.getState.mockReturnValue({ isActive: false })
            click(sheet().querySelector('[data-sheet="log"]')!)
            await flush()
            expect(getLeaderboardMock).toHaveBeenCalledTimes(1)
            expect(getChallengesMock).toHaveBeenCalledTimes(1)
            const list = document.getElementById('leaderboard')!
            expect(list.textContent).toContain('Nautilus')
            expect(list.textContent).toContain('12,000')
            expect(document.getElementById('xp-label')!.textContent).toBe(
                'Level 4 · 300 XP'
            )
            expect(
                document.getElementById('commissions')!.children.length
            ).toBe(1)
        })

        it('shows fallback copy when leaderboard and commissions fail', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(64)
            await mountReady(host, abort.signal)
            getLeaderboardMock.mockRejectedValue(new Error('down'))
            getChallengesMock.mockRejectedValue(new Error('down'))
            handle.getState.mockReturnValue({ isActive: false })
            click(sheet().querySelector('[data-sheet="log"]')!)
            await flush()
            expect(
                document.getElementById('leaderboard-status')!.textContent
            ).toContain('leaderboard is unavailable')
            expect(
                document.getElementById('commission-status')!.textContent
            ).toContain('Commissions are unavailable')
        })

        it('opens the commission panel and refreshes only the account', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(64)
            await mountReady(host, abort.signal)
            getChallengesMock.mockClear()
            getLeaderboardMock.mockClear()
            handle.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="commission"]')!)
            await flush()
            expect(getChallengesMock).toHaveBeenCalledTimes(1)
            expect(getLeaderboardMock).not.toHaveBeenCalled()
            expect(panel('commission').classList.contains('hidden')).toBe(false)
        })

        it('Escape closes info panels and resumes from pause', () => {
            handle.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="commission"]')!)
            sheet().dispatchEvent(new Event('cancel', { cancelable: true }))
            expect(panel('intro').classList.contains('hidden')).toBe(false)

            callbacks.onPause!()
            sheet().dispatchEvent(new Event('cancel', { cancelable: true }))
            expect(handle.game.resume).toHaveBeenCalled()
        })

        it('reopens the current panel if the dialog is force-closed', async () => {
            handle.getState.mockReturnValue({ isActive: false })
            click(host.querySelector('[data-sheet="help"]')!)
            sheet().close()
            await flush()
            expect(panel('help').classList.contains('hidden')).toBe(false)
        })

        it('closeSheet focuses the game canvas', () => {
            const canvas = handle.renderer.getApp().canvas
            const focus = vi.spyOn(canvas, 'focus')
            callbacks.onResume!()
            expect(focus).toHaveBeenCalled()
        })
    })

    describe('run controls', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
            callbacks.onStart!()
        })

        it('onStart closes the sheet and announces the dive', () => {
            expect(
                (host.querySelector('#pause-btn') as HTMLButtonElement).disabled
            ).toBe(false)
            expect(host.querySelector('#merge-feedback')!.textContent).toBe('')
            expect(host.querySelector('#game-status')!.textContent).toBe(
                'Dive started. Use arrow keys or swipe to slide.'
            )
        })

        it('pause button, resume button and data-end drive the run', () => {
            click(host.querySelector('#pause-btn')!)
            expect(handle.game.pause).toHaveBeenCalledTimes(1)
            click(document.getElementById('resume-btn')!)
            expect(handle.game.resume).toHaveBeenCalledTimes(1)
            click(sheet().querySelector('[data-end]')!)
            expect(handle.endGame).toHaveBeenCalledTimes(1)
        })

        it('P resumes only while the pause panel is open', () => {
            callbacks.onPause!()
            keydown({ key: 'p' })
            expect(handle.game.resume).toHaveBeenCalledTimes(1)
            // The game's resume fires onResume → sheet closes; a second P
            // outside the pause panel does nothing.
            callbacks.onResume!()
            keydown({ key: 'p' })
            expect(handle.game.resume).toHaveBeenCalledTimes(1)
        })

        it('undo buttons step back and refocus the canvas', () => {
            const canvas = handle.renderer.getApp().canvas
            const focus = vi.spyOn(canvas, 'focus')
            click(host.querySelector('#undo-btn')!)
            expect(handle.undo).toHaveBeenCalledTimes(1)
            expect(focus).toHaveBeenCalled()

            handle.undo.mockReturnValue(false)
            focus.mockClear()
            click(host.querySelector('#undo-btn')!)
            expect(focus).not.toHaveBeenCalled()

            click(document.getElementById('undo-stuck-btn')!)
            expect(handle.game.resume).toHaveBeenCalled()
            expect(handle.undo).toHaveBeenCalledTimes(3)
        })

        it('undo preset buttons set the allowance and re-sync aria-pressed', () => {
            click(document.querySelector('[data-undos="3"]')!)
            expect(handle.game.setUndos).toHaveBeenCalledWith(3)
            expect(
                document
                    .querySelector('[data-undos="3"]')!
                    .getAttribute('aria-pressed')
            ).toBe('true')
            expect(
                document
                    .querySelector('[data-undos="1"]')!
                    .getAttribute('aria-pressed')
            ).toBe('false')
        })

        it('keep-playing resumes a live run, offers undo when stuck or ends the dive', () => {
            const keep = document.getElementById('keep-playing-btn')!
            handle.getState.mockReturnValue({ stuck: false })
            click(keep)
            expect(handle.game.resume).toHaveBeenCalledTimes(1)

            handle.getState.mockReturnValue({ stuck: true })
            handle.game.canUndo.mockReturnValue(true)
            click(keep)
            expect(panel('stuck').classList.contains('hidden')).toBe(false)

            handle.game.canUndo.mockReturnValue(false)
            click(keep)
            expect(handle.endGame).toHaveBeenCalledTimes(1)
        })

        it('sound and motion toggles re-sync preferences and the sheet dataset', () => {
            click(document.getElementById('motion-btn')!)
            expect(handle.renderer.setReducedMotion).toHaveBeenLastCalledWith(
                true
            )
            expect(sheet().dataset.reducedMotion).toBe('true')
            expect(document.getElementById('motion-state')!.textContent).toBe(
                'On'
            )
            expect(handle.renderer.render).toHaveBeenCalled()

            click(document.getElementById('sound-btn')!)
            expect(document.getElementById('sound-state')!.textContent).toBe(
                'Off'
            )
            expect(
                document
                    .getElementById('sound-btn')!
                    .getAttribute('aria-pressed')
            ).toBe('false')
        })
    })

    describe('onStateChange', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
            callbacks.onStart!()
        })

        it('advances the next-target ladder and marks reached milestones', () => {
            callbacks.onStateChange!(gameState({ maxTile: 130, score: 40 }))
            expect(host.querySelector('#next-target')!.textContent).toBe(
                'Next · 256'
            )
            const m64 = host.querySelector('[data-milestone="64"]')!
            const m128 = host.querySelector('[data-milestone="128"]')!
            const m256 = host.querySelector('[data-milestone="256"]')!
            expect(m64.getAttribute('aria-label')).toBe('64, reached')
            expect(m128.getAttribute('aria-label')).toBe('128, reached')
            expect(m256.getAttribute('aria-label')).toBe('256')
            expect((m256 as HTMLElement).style.borderColor).toBe(
                'rgb(34, 245, 208)'
            )
        })

        it('labels beyond-the-chart runs and warns on a single escape', () => {
            handle.game.legalDirections.mockReturnValue(['left'])
            callbacks.onStateChange!(gameState({ maxTile: 8192 }))
            expect(host.querySelector('#next-target')!.textContent).toBe(
                'Beyond the chart'
            )
            expect(host.querySelector('#board-warning')!.textContent).toBe(
                'One way out ◂'
            )
            expect(host.querySelector('#board-warning')!.classList).toContain(
                'urgent'
            )
        })

        it('warns on tight boards and clears the warning otherwise', () => {
            handle.game.legalDirections.mockReturnValue(['left', 'right'])
            callbacks.onStateChange!(gameState({ board: boardWith(1) }))
            expect(host.querySelector('#board-warning')!.textContent).toBe(
                '1 cell free'
            )
            callbacks.onStateChange!(gameState({ board: boardWith(6) }))
            expect(host.querySelector('#board-warning')!.textContent).toBe('')
        })

        it('syncs the undo affordance with the state', () => {
            handle.game.canUndo.mockReturnValue(true)
            callbacks.onStateChange!(gameState({ undosLeft: 2, undosUsed: 1 }))
            const undo = host.querySelector('#undo-btn') as HTMLButtonElement
            expect(host.querySelector('#undos-left')!.textContent).toBe('2')
            expect(undo.disabled).toBe(false)
            expect(undo.style.visibility).toBe('visible')

            handle.game.canUndo.mockReturnValue(false)
            callbacks.onStateChange!(gameState({ undosLeft: 0, undosUsed: 0 }))
            expect(undo.disabled).toBe(true)
            expect(undo.style.visibility).toBe('hidden')
        })

        it('plays merge feedback and announces new high tiles', () => {
            const animate = vi.spyOn(
                host.querySelector('#merge-feedback')!,
                'animate'
            )
            callbacks.onStateChange!(gameState({ score: 24 }))
            callbacks.onStateChange!(gameState({ score: 88, maxTile: 64 }))
            expect(host.querySelector('#merge-feedback')!.textContent).toBe(
                '+64'
            )
            expect(animate).toHaveBeenCalled()
            expect(host.querySelector('#game-status')!.textContent).toBe(
                'New highest tile: 64. Score 88.'
            )
        })

        it('announces undo use through the status line', () => {
            callbacks.onStateChange!(gameState({ undosUsed: 1, undosLeft: 2 }))
            expect(host.querySelector('#game-status')!.textContent).toBe(
                'Move undone. 2 undos left.'
            )
            callbacks.onStateChange!(gameState({ undosUsed: 2, undosLeft: 1 }))
            expect(host.querySelector('#game-status')!.textContent).toBe(
                'Move undone. 1 undo left.'
            )
        })

        it('pauses into the win sheet the first time 2048 lands', () => {
            callbacks.onStateChange!(
                gameState({
                    won: true,
                    maxTile: 2048,
                    score: 20000,
                    moveCount: 300,
                })
            )
            expect(handle.game.pause).toHaveBeenCalledTimes(1)
            expect(panel('win').classList.contains('hidden')).toBe(false)
            expect(document.getElementById('win-line')!.textContent).toBe(
                '20000 points · 300 moves'
            )
            // A repeated won state does not re-trigger the sheet.
            handle.game.pause.mockClear()
            callbacks.onStateChange!(
                gameState({
                    won: true,
                    maxTile: 2048,
                    score: 20000,
                    moveCount: 301,
                })
            )
            expect(handle.game.pause).not.toHaveBeenCalled()
        })

        it('pauses into the stuck sheet when only undo can save the run', () => {
            handle.game.canUndo.mockReturnValue(true)
            callbacks.onStateChange!(gameState({ stuck: true }))
            expect(handle.game.pause).toHaveBeenCalledTimes(1)
            expect(panel('stuck').classList.contains('hidden')).toBe(false)
        })

        it('leaves the board alone when the run is inactive', () => {
            callbacks.onStateChange!(gameState({ isActive: false }))
            expect(host.querySelector('#board-warning')!.textContent).toBe('')
        })

        it('folds the live score into the best displays', () => {
            callbacks.onStateChange!(gameState({ score: 777 }))
            document.querySelectorAll('[data-best]').forEach(el => {
                expect(el.textContent).toBe('777')
            })
        })
    })

    describe('onEnd', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
            callbacks.onStart!()
        })

        it('fills the results sheet and logs the dive', () => {
            callbacks.onEnd!(2048, {
                maxTile: 512,
                moveCount: 256,
                mergeCount: 200,
                undosUsed: 2,
                won: false,
            })
            expect(
                (host.querySelector('#pause-btn') as HTMLButtonElement).disabled
            ).toBe(true)
            expect(
                (host.querySelector('#undo-btn') as HTMLButtonElement).disabled
            ).toBe(true)
            expect(document.getElementById('final-merges')!.textContent).toBe(
                '200'
            )
            expect(
                document.getElementById('points-per-move')!.textContent
            ).toBe('8')
            expect(document.getElementById('final-undos')!.textContent).toBe(
                '2'
            )
            expect(document.getElementById('final-undos')!.classList).toContain(
                'amber'
            )
            expect(document.getElementById('results-title')!.textContent).toBe(
                'Deep, not deep enough'
            )
            const tile = document.getElementById(
                'final-max-tile'
            ) as HTMLElement
            expect(tile.style.fontSize).toBe('27px')
            expect(document.getElementById('visit-count')!.textContent).toBe(
                '1'
            )
            expect(document.getElementById('visit-tile')!.textContent).toBe(
                '512'
            )
            expect(document.getElementById('empty-log')!.classList).toContain(
                'hidden'
            )
            const rows = document.getElementById('recent-dives')!
            expect(rows.children).toHaveLength(1)
            expect(rows.textContent).toContain('Tile 512')
            expect(rows.textContent).toContain('256 moves')
            expect(rows.textContent).toContain('2 undos')
            expect(host.querySelector('#game-status')!.textContent).toBe(
                'Dive over. Score 2048, highest tile 512.'
            )
            expect(panel('results').classList.contains('hidden')).toBe(false)
        })

        it('renders the record-specimen copy and tile sizes', () => {
            callbacks.onEnd!(40000, {
                maxTile: 2048,
                moveCount: 1,
                mergeCount: 1,
                undosUsed: 0,
                won: true,
            })
            expect(document.getElementById('results-title')!.textContent).toBe(
                'A specimen of record'
            )
            expect(
                document.getElementById('final-undos')!.classList
            ).not.toContain('amber')
            const tile = document.getElementById(
                'final-max-tile'
            ) as HTMLElement
            expect(tile.style.fontSize).toBe('21px')
        })

        it('renders the early-bed copy for low dives', () => {
            callbacks.onEnd!(24, {
                maxTile: 16,
                moveCount: 4,
                mergeCount: 2,
                undosUsed: 0,
                won: false,
            })
            expect(document.getElementById('results-title')!.textContent).toBe(
                'The bed set early'
            )
            const tile = document.getElementById(
                'final-max-tile'
            ) as HTMLElement
            expect(tile.style.fontSize).toBe('32px')
        })

        it('reveals the personal-best flag when the dive tops the saved best', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(100)
            await mountReady(host, abort.signal)
            await flush()
            callbacks.onStart!()
            callbacks.onEnd!(300, {
                maxTile: 64,
                moveCount: 20,
                mergeCount: 10,
                undosUsed: 0,
                won: false,
            })
            expect(
                document.getElementById('personal-best')!.classList
            ).not.toContain('hidden')
            expect(document.getElementById('previous-best')!.textContent).toBe(
                '100'
            )
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
            callbacks.onStart!()
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

        it('pauses an active run when the page hides but not a paused one', () => {
            handle.getState.mockReturnValue({
                isActive: true,
                isPaused: false,
            })
            const spy = vi
                .spyOn(document, 'hidden', 'get')
                .mockReturnValue(true)
            document.dispatchEvent(new Event('visibilitychange'))
            expect(handle.game.pause).toHaveBeenCalledTimes(1)
            spy.mockRestore()
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

        it('abort sets disposed and cleans up the handle', () => {
            abort.abort()
            expect(handle.cleanup).toHaveBeenCalledTimes(1)
        })
    })
})
