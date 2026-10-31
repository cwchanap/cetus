import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/dom'
import { initPatternPulseGameFramework } from './initFramework'
import type { PatternPad } from '@cetus/games/pattern-pulse/types'

function setupDOM(): void {
    // React owns the HUD/shared buttons/overlay (HPA-393); the initializer
    // only needs the board host (and its static pads) the island ref-passes.
    document.body.innerHTML = `
        <div id="pattern-pulse-container">
            <div id="pattern-pulse-board">
                <button type="button" data-pattern-pad="0">▲</button>
                <button type="button" data-pattern-pad="1">●</button>
                <button type="button" data-pattern-pad="2">◆</button>
                <button type="button" data-pattern-pad="3">✦</button>
            </div>
        </div>
    `
}

function getContainer(): HTMLElement {
    return document.getElementById('pattern-pulse-container') as HTMLElement
}

async function settleEnd(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve()
    }
}

type InitHandle = NonNullable<
    Awaited<ReturnType<typeof initPatternPulseGameFramework>>
>

async function startRun(handle: InitHandle): Promise<void> {
    handle.game.start()
    advanceToInput(handle)
}

// Steps in 10ms chunks so score-exact assertions land exactly on input
// entry (input begins at 400 + sequenceLength * 740 ms).
function advanceToInput(handle: InitHandle): void {
    for (
        let i = 0;
        i < 1_000 && handle.game.getState().phase !== 'input';
        i++
    ) {
        vi.advanceTimersByTime(10)
    }
    expect(handle.game.getState().phase).toBe('input')
}

function padButton(pad: PatternPad): HTMLButtonElement {
    return document.querySelector<HTMLButtonElement>(
        `button[data-pattern-pad="${pad}"]`
    )!
}

function wrongPadFor(pad: PatternPad): PatternPad {
    return ((pad + 1) % 4) as PatternPad
}

describe('initPatternPulseGameFramework', () => {
    let handle: Awaited<ReturnType<typeof initPatternPulseGameFramework>>

    beforeEach(() => {
        setupDOM()
        vi.useFakeTimers()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
    })

    afterEach(() => {
        handle?.cleanup()
        handle = undefined
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        document.body.replaceChildren()
    })

    it('renders the idle board without starting a run', async () => {
        handle = await initPatternPulseGameFramework(getContainer())

        expect(handle).toBeDefined()
        expect(handle!.game.getState()).toMatchObject({
            phase: 'idle',
            isActive: false,
            gameStarted: false,
        })
        expect(
            document.querySelectorAll(
                '#pattern-pulse-board button[aria-disabled="true"]'
            )
        ).toHaveLength(4)
    })

    it('maps a document numeric shortcut during input', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        expect(handle).toBeDefined()
        handle?.game.start()
        vi.advanceTimersByTime(4_000)
        expect(handle?.game.getState().phase).toBe('input')

        const first = handle?.game.getState().sequence[0] ?? 0
        document.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: String(first + 1),
                bubbles: true,
            })
        )
        expect(handle?.game.getState().inputIndex).toBe(1)
    })

    it('ignores auto-repeated numeric keydown events during input', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        handle!.game.start()
        vi.advanceTimersByTime(4_000)
        expect(handle!.game.getState().phase).toBe('input')

        const inputIndexBefore = handle!.game.getState().inputIndex
        const mistakesBefore = handle!.game.getState().mistakes

        document.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: '1',
                repeat: true,
                bubbles: true,
            })
        )

        expect(handle!.game.getState().inputIndex).toBe(inputIndexBefore)
        expect(handle!.game.getState().mistakes).toBe(mistakesBefore)
    })

    it('ignores numeric shortcuts from an editable target', async () => {
        const input = document.createElement('input')
        document.body.appendChild(input)
        handle = await initPatternPulseGameFramework(getContainer())
        handle?.game.start()
        vi.advanceTimersByTime(4_000)

        input.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: '1',
                bubbles: true,
            })
        )
        expect(handle?.game.getState().inputIndex).toBe(0)
    })

    it('routes renderer pad clicks to the game', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        await startRun(handle!)

        const sequence = handle!.game.getState().sequence
        fireEvent.click(padButton(sequence[0]))
        expect(handle!.game.getState().inputIndex).toBe(1)

        fireEvent.click(padButton(wrongPadFor(sequence[1])))
        expect(handle!.game.getState()).toMatchObject({
            mistakes: 1,
            inputIndex: 0,
            feedback: 'wrong',
        })
    })

    it('advances rounds and streaks as the sequence is repeated', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        handle!.game.start()
        vi.advanceTimersByTime(4_000)
        expect(handle!.game.getState().phase).toBe('input')

        const sequence = handle!.game.getState().sequence
        for (const pad of sequence) {
            fireEvent.click(padButton(pad))
        }
        expect(handle!.game.getState()).toMatchObject({
            completedRounds: 1,
            streak: 1,
            feedback: 'correct',
        })

        advanceToInput(handle!)
        expect(handle!.game.getState().phase).toBe('input')
        fireEvent.click(padButton(wrongPadFor(sequence[0])))
        expect(handle!.game.getState()).toMatchObject({
            mistakes: 1,
            inputIndex: 0,
            feedback: 'wrong',
        })
    })

    it('awards the speed-bonus score for a completed round', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        await startRun(handle!)

        for (const pad of handle!.game.getState().sequence) {
            fireEvent.click(padButton(pad))
        }
        expect(handle!.game.getState().score).toBe(500)
        expect(handle!.game.getState().sequence).toHaveLength(3)
    })

    it('Reset restores the idle state mid-run', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        await startRun(handle!)

        handle!.restart()

        expect(handle!.game.getState()).toMatchObject({
            phase: 'idle',
            isActive: false,
            gameStarted: false,
        })
    })

    it('ends after the mistake limit and restarts to idle', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        await startRun(handle!)

        for (let attempt = 0; attempt < 3; attempt++) {
            fireEvent.click(
                padButton(wrongPadFor(handle!.game.getState().sequence[0]))
            )
            if (attempt < 2) {
                vi.advanceTimersByTime(4_000)
                expect(handle!.game.getState().phase).toBe('input')
            }
        }
        await settleEnd()

        expect(handle!.game.getState()).toMatchObject({
            phase: 'ended',
            outcome: 'mistakes',
            isGameOver: true,
        })
        // The overlay stats themselves are React-owned (island test).

        handle!.restart()
        expect(handle!.game.getState()).toMatchObject({
            phase: 'idle',
            isActive: false,
            gameStarted: false,
        })
    })

    it('forwards achievement and challenge notifications from end events', async () => {
        const showAchievementAward = vi.fn()
        const showChallengeComplete = vi.fn()
        vi.stubGlobal('showAchievementAward', showAchievementAward)
        vi.stubGlobal('showChallengeComplete', showChallengeComplete)
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                newAchievements: ['pattern_pulse_welcome'],
                challengeUpdates: {
                    completedChallenges: [{ id: 'streak' }],
                },
            }),
        } as Response)

        handle = await initPatternPulseGameFramework(getContainer())
        handle!.game.start()
        await handle!.game.end()

        expect(showAchievementAward).toHaveBeenCalledWith([
            'pattern_pulse_welcome',
        ])
        expect(showChallengeComplete).toHaveBeenCalledWith({
            completedChallenges: [{ id: 'streak' }],
        })
    })

    it('warns before unload while a run is active', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        handle!.game.start()

        const event = new Event('beforeunload', { cancelable: true })
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
        window.dispatchEvent(event)
        expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('does not warn before unload when idle', async () => {
        handle = await initPatternPulseGameFramework(getContainer())

        const event = new Event('beforeunload', { cancelable: true })
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
        window.dispatchEvent(event)
        expect(preventDefaultSpy).not.toHaveBeenCalled()
    })

    it('preserves the static pads after cleanup', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        await startRun(handle!)

        handle!.cleanup()

        expect(
            document.querySelectorAll('button[data-pattern-pad]')
        ).toHaveLength(4)
        const board = document.getElementById('pattern-pulse-board')!
        expect(board.querySelector('[aria-disabled]')).toBeNull()
        expect(board.querySelector('[data-active]')).toBeNull()
        expect(board.querySelector('[data-feedback]')).toBeNull()
    })

    it('cleans up DOM listeners, renderer, and game once', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        const rendererDestroy = vi.spyOn(handle!.renderer, 'destroy')
        const gameDestroy = vi.spyOn(handle!.game, 'destroy')

        handle!.cleanup()
        handle!.cleanup()
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: '1', bubbles: true })
        )

        expect(rendererDestroy).toHaveBeenCalledTimes(1)
        expect(gameDestroy).toHaveBeenCalledTimes(1)
        expect(handle!.game.getState().gameStarted).toBe(false)
    })

    it('fails cleanly when the renderer cannot initialize', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        document.getElementById('pattern-pulse-board')?.remove()

        expect(
            await initPatternPulseGameFramework(getContainer())
        ).toBeUndefined()
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })

    it('ignores numeric shortcuts from textarea and select elements', async () => {
        const textarea = document.createElement('textarea')
        const select = document.createElement('select')
        document.body.appendChild(textarea)
        document.body.appendChild(select)

        handle = await initPatternPulseGameFramework(getContainer())
        handle!.game.start()
        vi.advanceTimersByTime(4_000)
        expect(handle!.game.getState().phase).toBe('input')

        const inputIndexBefore = handle!.game.getState().inputIndex
        const mistakesBefore = handle!.game.getState().mistakes

        textarea.dispatchEvent(
            new KeyboardEvent('keydown', { key: '1', bubbles: true })
        )
        select.dispatchEvent(
            new KeyboardEvent('keydown', { key: '1', bubbles: true })
        )

        expect(handle!.game.getState().inputIndex).toBe(inputIndexBefore)
        expect(handle!.game.getState().mistakes).toBe(mistakesBefore)
    })

    it('routes numeric shortcuts 1-4 and ignores non-numeric keys', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        handle!.game.start()
        vi.advanceTimersByTime(4_000)
        expect(handle!.game.getState().phase).toBe('input')

        const stateBefore = { ...handle!.game.getState() }

        // Keys '1', '2', '3', '4' map to pads 0, 1, 2, 3
        for (const key of ['1', '2', '3', '4']) {
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key, bubbles: true })
            )
        }

        const stateAfter = { ...handle!.game.getState() }
        // At least one of inputIndex or mistakes should have changed
        const changed =
            stateAfter.inputIndex !== stateBefore.inputIndex ||
            stateAfter.mistakes !== stateBefore.mistakes
        expect(changed).toBe(true)

        // Non-numeric key → shortcutToPad returns null → no-op
        const idxBefore = handle!.game.getState().inputIndex
        const misBefore = handle!.game.getState().mistakes
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'a', bubbles: true })
        )
        expect(handle!.game.getState().inputIndex).toBe(idxBefore)
        expect(handle!.game.getState().mistakes).toBe(misBefore)
    })

    it('reports the timeout outcome when the game timer expires', async () => {
        handle = await initPatternPulseGameFramework(getContainer())
        handle!.game.start()

        // Advance past the full 60-second duration
        vi.advanceTimersByTime(60_000)
        await settleEnd()

        expect(handle!.game.getState()).toMatchObject({
            outcome: 'timeout',
            isGameOver: true,
        })
        // The overlay title/stats are React-owned (island test).
    })
})
