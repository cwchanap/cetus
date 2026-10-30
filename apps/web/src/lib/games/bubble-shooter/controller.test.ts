// Bubble Shooter field-plate controller tests (HPA-393 Stage 4). mount()
// owns the sheet dialog, host HUD reads and teardown; the game handle is
// mocked so the controller's wiring can be exercised under jsdom.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DEFAULT_BUBBLE_SHOOTER_CONFIG } from '@cetus/games/bubble-shooter/BubbleShooterGame'

const { initMock, getUserBestScoreMock } = vi.hoisted(() => ({
    initMock: vi.fn(),
    getUserBestScoreMock: vi.fn(),
}))

vi.mock('@/lib/games/bubble-shooter/initFramework', () => ({
    initBubbleShooterGameFramework: initMock,
}))
vi.mock('@/lib/services/scoreService', () => ({
    getUserBestScore: getUserBestScoreMock,
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
        on: ReturnType<typeof vi.fn>
    }
    renderer: {
        getApp: ReturnType<typeof vi.fn>
    }
    cleanup: ReturnType<typeof vi.fn>
    restart: ReturnType<typeof vi.fn>
    getState: ReturnType<typeof vi.fn>
    endGame: ReturnType<typeof vi.fn>
}

const { shooterY, bubbleRadius } = DEFAULT_BUBBLE_SHOOTER_CONFIG
const limit = shooterY - bubbleRadius * 5

let callbacks: ControllerCallbacks = {}
let handle: FakeHandle

function makeHandle(): FakeHandle {
    const canvas = document.createElement('canvas')
    return {
        game: {
            pause: vi.fn(),
            resume: vi.fn(),
            on: vi.fn(),
        },
        renderer: {
            getApp: vi.fn(() => ({ canvas })),
        },
        cleanup: vi.fn(),
        restart: vi.fn(),
        getState: vi.fn(() => ({ isActive: true, isPaused: false })),
        endGame: vi.fn().mockResolvedValue(undefined),
    }
}

function bubbleState(overrides: Record<string, unknown> = {}) {
    return {
        bubblesPopped: 3,
        largestCombo: 2,
        gameStarted: true,
        grid: [[{ y: 200 }]],
        ...overrides,
    }
}

function setupDOM({ signedIn = false } = {}): HTMLElement {
    document.body.innerHTML = `
        <div id="host" data-signed-in="${signedIn}">
            <button id="pause-btn" disabled>Ⅱ</button>
            <div id="score">0</div>
            <div id="bubbles-popped">0</div>
            <span id="largest-combo">0</span>
            <div id="colony-gauge"><div id="gauge-fill"></div></div>
            <span id="gauge-label">Clear</span>
            <button data-sheet="help">?</button>
            <button data-sheet="log">▤</button>
        </div>
        <dialog id="field-sheet">
            <section data-panel="intro">
                <h2 id="sheet-title">Bubble Shooter</h2>
                <span data-best>—</span>
                <p id="game-error" class="hidden">err</p>
                <button id="start-btn" disabled>Loading the plate…</button>
            </section>
            <section data-panel="pause" class="hidden">
                <h2 id="pause-title">Paused</h2>
                <span id="pause-score">0</span>
            </section>
            <section data-panel="results" class="hidden">
                <h2 id="results-title">Results</h2>
                <span id="personal-best" class="hidden">Personal best</span>
                <span data-best>—</span>
            </section>
            <section data-panel="help" class="hidden">
                <h2 id="help-title">How it plays</h2>
                <button data-close>Close</button>
            </section>
            <section data-panel="log" class="hidden">
                <h2 id="log-title">Log</h2>
                <span data-best>—</span>
                <p id="empty-log">Nothing logged</p>
                <ol id="recent-dives"></ol>
                <button data-close>Back</button>
            </section>
        </dialog>
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

describe('bubble-shooter controller', () => {
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
    })

    afterEach(() => {
        if (!abort.signal.aborted) {
            abort.abort()
        }
        document.body.innerHTML = ''
        restoreDOM()
    })

    describe('mount and initialize', () => {
        it('opens the intro sheet on mount and enables start once init resolves', async () => {
            await mountReady(host, abort.signal)
            const start = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            expect(sheet().open).toBe(true)
            expect(panel('intro').classList.contains('hidden')).toBe(false)
            expect(panel('pause').classList.contains('hidden')).toBe(true)
            expect(sheet().getAttribute('aria-labelledby')).toBe('sheet-title')
            expect(start.textContent).toBe('Begin the dive')
        })

        it('shows the visit best for signed-out players', async () => {
            await mountReady(host, abort.signal)
            document.querySelectorAll('[data-best]').forEach(el => {
                expect(el.textContent).toBe('0')
            })
            expect(
                document.getElementById('personal-best')!.classList
            ).toContain('hidden')
        })

        it('fetches the saved best for signed-in players', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(1500)
            await mountReady(host, abort.signal)
            expect(getUserBestScoreMock).toHaveBeenCalledTimes(1)
            await flush()
            document.querySelectorAll('[data-best]').forEach(el => {
                expect(el.textContent).toBe('1,500')
            })
        })

        it('reveals the error note and marks the plate unavailable when init throws', async () => {
            const error = new Error('init fail')
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})
            initMock.mockRejectedValue(error)
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
            expect(consoleSpy).toHaveBeenCalled()
            consoleSpy.mockRestore()
        })

        it('reveals the error note when init resolves without a handle', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {})
            initMock.mockResolvedValue(undefined)
            mount(host, abort.signal)
            await vi.waitFor(() =>
                expect(
                    document
                        .getElementById('game-error')!
                        .classList.contains('hidden')
                ).toBe(false)
            )
            vi.mocked(console.error).mockRestore()
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

        it('pauses an active run and remembers to resume when opening a sheet panel', async () => {
            handle.getState.mockReturnValue({
                isActive: true,
                isPaused: false,
            })
            click(document.querySelector('[data-sheet="help"]')!)
            expect(handle.game.pause).toHaveBeenCalledTimes(1)
            expect(panel('help').classList.contains('hidden')).toBe(false)
            expect(panel('intro').classList.contains('hidden')).toBe(true)

            click(sheet().querySelector('[data-panel="help"] [data-close]')!)
            expect(handle.game.resume).toHaveBeenCalledTimes(1)
        })

        it('does not pause when the game is already paused or idle', async () => {
            handle.getState.mockReturnValue({ isActive: false })
            click(document.querySelector('[data-sheet="help"]')!)
            expect(handle.game.pause).not.toHaveBeenCalled()
        })

        it('returns to the previous panel when closing without a pending resume', async () => {
            handle.getState.mockReturnValue({ isActive: false })
            click(document.querySelector('[data-sheet="help"]')!)
            click(sheet().querySelector('[data-panel="help"] [data-close]')!)
            // returnPanel captured 'intro' — closing help reopens it.
            expect(panel('intro').classList.contains('hidden')).toBe(false)
        })

        it('reopens the current panel if the dialog closes without closeSheet', async () => {
            handle.getState.mockReturnValue({ isActive: false })
            click(document.querySelector('[data-sheet="help"]')!)
            sheet().close()
            await flush()
            expect(panel('help').classList.contains('hidden')).toBe(false)
        })

        it('routes Escape-on-info panels through closeInfo and resumes on pause', async () => {
            handle.getState.mockReturnValue({ isActive: false })
            click(document.querySelector('[data-sheet="help"]')!)
            const cancel = new Event('cancel', { cancelable: true })
            sheet().dispatchEvent(cancel)
            expect(panel('intro').classList.contains('hidden')).toBe(false)

            callbacks.onPause!()
            expect(panel('pause').classList.contains('hidden')).toBe(false)
            sheet().dispatchEvent(new Event('cancel', { cancelable: true }))
            expect(handle.game.resume).toHaveBeenCalled()
        })

        it('ignores Escape while a reward overlay holds the panels inert', () => {
            sheet()
                .querySelectorAll<HTMLElement>('[data-panel]')
                .forEach(p => {
                    p.inert = true
                })
            const before = panel('intro').classList.contains('hidden')
            sheet().dispatchEvent(new Event('cancel', { cancelable: true }))
            expect(panel('intro').classList.contains('hidden')).toBe(before)
        })
    })

    describe('reward overlay observer', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
        })

        it('inerts the sheet panels while an award shows and restores after', async () => {
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
        })

        it('pauses the run when a reward activates with the sheet closed', async () => {
            callbacks.onResume!() // closeSheet → sheet.close()
            const awards = document.getElementById('achievement-award-overlay')!
            awards.style.display = 'flex'
            await flush()
            expect(handle.game.pause).toHaveBeenCalled()
        })

        it('treats a visible challenge overlay as the active reward', async () => {
            const challenges = document.getElementById(
                'challenge-complete-overlay'
            )!
            challenges.classList.remove('hidden')
            await flush()
            sheet()
                .querySelectorAll<HTMLElement>('[data-panel]')
                .forEach(p => {
                    expect(p.inert).toBe(true)
                })
        })
    })

    describe('game callbacks', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
        })

        it('onStart closes the sheet and enables pause', () => {
            callbacks.onStart!()
            const pause = host.querySelector('#pause-btn') as HTMLButtonElement
            expect(pause.disabled).toBe(false)
            expect(document.getElementById('score')!.textContent).toBe('0')
        })

        it('onPause mirrors the score into the pause panel and shows it', () => {
            document.getElementById('score')!.textContent = '42'
            callbacks.onPause!()
            expect(document.getElementById('pause-score')!.textContent).toBe(
                '42'
            )
            expect(panel('pause').classList.contains('hidden')).toBe(false)
        })

        it('onResume closes the sheet and restores the pause button', () => {
            callbacks.onPause!()
            callbacks.onResume!()
            const pause = host.querySelector('#pause-btn') as HTMLButtonElement
            expect(pause.textContent).toBe('Ⅱ')
            expect(pause.getAttribute('aria-label')).toBe('Pause')
        })

        it.each([
            [100, 'Clear', '#22f5d0'],
            [0.7 * limit, 'Closing', '#ffc24a'],
            [0.95 * limit, 'Critical', '#ff3d8a'],
        ])('maps lowest bubble y=%d to gauge label %s', (y, label, _color) => {
            callbacks.onStateChange!(
                bubbleState({ grid: [[{ y }]], bubblesPopped: 7 })
            )
            expect(host.querySelector('#gauge-label')!.textContent).toBe(label)
            expect(
                (host.querySelector('#gauge-fill') as HTMLElement).style
                    .background
            ).toBeTruthy()
            expect(
                host
                    .querySelector('#colony-gauge')!
                    .getAttribute('aria-valuenow')
            ).not.toBeNull()
            expect(host.querySelector('#bubbles-popped')!.textContent).toBe('7')
        })

        it('marks the gauge percent against the collection limit', () => {
            callbacks.onStateChange!(bubbleState({ grid: [[{ y: limit }]] }))
            expect(
                host
                    .querySelector('#colony-gauge')!
                    .getAttribute('aria-valuenow')
            ).toBe('100')
        })

        it('returns to the intro sheet when the game reports not started', () => {
            callbacks.onStateChange!(bubbleState({ gameStarted: false }))
            const pause = host.querySelector('#pause-btn') as HTMLButtonElement
            const start = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            expect(pause.disabled).toBe(true)
            expect(start.textContent).toBe('Begin the dive')
            expect(panel('intro').classList.contains('hidden')).toBe(false)
        })

        it('onEnd logs the dive, updates the visit best and opens results', () => {
            callbacks.onEnd!(1234, { accuracy: 87.6, largestCombo: 4 })
            const pause = host.querySelector('#pause-btn') as HTMLButtonElement
            expect(pause.disabled).toBe(true)
            expect(document.getElementById('empty-log')!.classList).toContain(
                'hidden'
            )
            const rows = document.getElementById('recent-dives')!
            expect(rows.children).toHaveLength(1)
            expect(rows.textContent).toContain('Dive 1')
            expect(rows.textContent).toContain('88% on target')
            expect(rows.textContent).toContain('×4')
            expect(rows.textContent).toContain('1,234')
            expect(panel('results').classList.contains('hidden')).toBe(false)
            document.querySelectorAll('[data-best]').forEach(el => {
                expect(el.textContent).toBe('1,234')
            })
        })

        it('reveals the personal-best flag when the dive beats the saved best', async () => {
            host = setupDOM({ signedIn: true })
            getUserBestScoreMock.mockResolvedValue(100)
            await mountReady(host, abort.signal)
            await flush()
            callbacks.onEnd!(500, { accuracy: 50, largestCombo: 1 })
            expect(
                document.getElementById('personal-best')!.classList
            ).not.toContain('hidden')
        })
    })

    describe('page lifecycle', () => {
        beforeEach(async () => {
            await mountReady(host, abort.signal)
        })

        it('pauses on a persisted pagehide but cleans up on a real unload', () => {
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

        it('aborts detach the lifecycle listeners and tear down the run', async () => {
            abort.abort()
            expect(handle.cleanup).toHaveBeenCalledTimes(1)
            handle.cleanup.mockClear()
            const unload = new Event('pagehide') as PageTransitionEvent
            Object.defineProperty(unload, 'persisted', { value: false })
            window.dispatchEvent(unload)
            expect(handle.cleanup).not.toHaveBeenCalled()
        })
    })
})
