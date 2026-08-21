import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/dom'
import { initPatternPulseGameFramework } from './initFramework'
import type { PatternPad } from './types'

function setupDOM(): void {
    document.body.innerHTML = `
        <div id="pattern-pulse-container">
            <div id="pattern-pulse-board">
                <button type="button" data-pattern-pad="0">▲</button>
                <button type="button" data-pattern-pad="1">●</button>
                <button type="button" data-pattern-pad="2">◆</button>
                <button type="button" data-pattern-pad="3">✦</button>
            </div>
            <p id="pattern-status">READY</p>
        </div>
        <button id="start-btn" style="display: inline-flex">Start Game</button>
        <button id="reset-btn">Reset</button>
        <span id="score">0</span>
        <span id="time-remaining">60</span>
        <span id="sequence-length">3</span>
        <span id="completed-rounds">0</span>
        <span id="streak">0</span>
        <span id="mistakes">0</span>
        <div id="game-over-overlay" class="hidden">
            <h3 id="game-over-title">GAME OVER!</h3>
            <span id="final-score">0</span>
            <span id="final-outcome">—</span>
            <span id="final-rounds">0</span>
            <span id="final-longest-sequence">0</span>
            <span id="final-max-streak">0</span>
            <span id="final-mistakes">0</span>
            <button id="play-again-btn">Play Again</button>
        </div>
    `
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

    it('fails cleanly when #pattern-pulse-container is missing', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        document.getElementById('pattern-pulse-container')?.remove()

        expect(await initPatternPulseGameFramework()).toBeUndefined()
        expect(consoleError).toHaveBeenCalled()
    })

    it('renders the idle board and HUD without starting a run', async () => {
        handle = await initPatternPulseGameFramework()

        expect(handle).toBeDefined()
        expect(handle!.game.getState()).toMatchObject({
            phase: 'idle',
            isActive: false,
            gameStarted: false,
        })
        expect(document.getElementById('pattern-status')).toHaveTextContent(
            'READY'
        )
        expect(document.getElementById('sequence-length')).toHaveTextContent(
            '3'
        )
        expect(document.getElementById('completed-rounds')).toHaveTextContent(
            '0'
        )
        expect(document.getElementById('streak')).toHaveTextContent('0')
        expect(document.getElementById('mistakes')).toHaveTextContent('0')
        expect(
            document.querySelectorAll(
                '#pattern-pulse-board button[aria-disabled="true"]'
            )
        ).toHaveLength(4)
    })

    it('maps a document numeric shortcut during input', async () => {
        handle = await initPatternPulseGameFramework()
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

    it('ignores numeric shortcuts from an editable target', async () => {
        const input = document.createElement('input')
        document.body.appendChild(input)
        handle = await initPatternPulseGameFramework()
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
        handle = await initPatternPulseGameFramework()
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

    it('updates the status text across phases and feedback', async () => {
        handle = await initPatternPulseGameFramework()
        const status = document.getElementById('pattern-status')!

        handle!.game.start()
        expect(status).toHaveTextContent('WATCH')

        vi.advanceTimersByTime(4_000)
        expect(status).toHaveTextContent('REPEAT')

        const sequence = handle!.game.getState().sequence
        for (const pad of sequence) {
            fireEvent.click(padButton(pad))
        }
        expect(status).toHaveTextContent('CORRECT')
        expect(document.getElementById('completed-rounds')).toHaveTextContent(
            '1'
        )
        expect(document.getElementById('streak')).toHaveTextContent('1')

        advanceToInput(handle!)
        expect(handle!.game.getState().phase).toBe('input')
        fireEvent.click(padButton(wrongPadFor(sequence[0])))
        expect(status).toHaveTextContent('WRONG — WATCH AGAIN')
        expect(document.getElementById('mistakes')).toHaveTextContent('1')
    })

    it('forwards score and time callbacks to the HUD', async () => {
        handle = await initPatternPulseGameFramework()
        await startRun(handle!)

        expect(document.getElementById('time-remaining')).toHaveTextContent(
            '58'
        )

        for (const pad of handle!.game.getState().sequence) {
            fireEvent.click(padButton(pad))
        }
        expect(document.getElementById('score')).toHaveTextContent('500')
        expect(document.getElementById('sequence-length')).toHaveTextContent(
            '3'
        )
    })

    it('Reset restores the idle presentation mid-run', async () => {
        handle = await initPatternPulseGameFramework()
        await startRun(handle!)
        expect(document.getElementById('time-remaining')).toHaveTextContent(
            '58'
        )

        document.getElementById('reset-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            phase: 'idle',
            isActive: false,
            gameStarted: false,
        })
        expect(document.getElementById('time-remaining')).toHaveTextContent(
            '60'
        )
        expect(document.getElementById('pattern-status')).toHaveTextContent(
            'READY'
        )
        expect(document.getElementById('start-btn')).toHaveStyle({
            display: 'inline-flex',
        })
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
    })

    it('renders final overlay data after the mistake limit and Play Again resets', async () => {
        handle = await initPatternPulseGameFramework()
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
        expect(document.getElementById('game-over-overlay')).not.toHaveClass(
            'hidden'
        )
        expect(document.getElementById('game-over-title')).toHaveTextContent(
            'SIGNAL LOST!'
        )
        expect(document.getElementById('final-outcome')).toHaveTextContent(
            /mistake/i
        )
        expect(document.getElementById('final-rounds')).toHaveTextContent('0')
        expect(document.getElementById('final-mistakes')).toHaveTextContent('3')
        expect(
            document.getElementById('final-longest-sequence')
        ).toHaveTextContent('0')
        expect(document.getElementById('final-max-streak')).toHaveTextContent(
            '0'
        )

        document.getElementById('play-again-btn')!.click()
        expect(handle!.game.getState()).toMatchObject({
            phase: 'idle',
            isActive: false,
            gameStarted: false,
        })
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
        expect(document.getElementById('pattern-status')).toHaveTextContent(
            'READY'
        )
        expect(document.getElementById('score')).toHaveTextContent('0')
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

        handle = await initPatternPulseGameFramework()
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
        handle = await initPatternPulseGameFramework()
        handle!.game.start()

        const event = new Event('beforeunload', { cancelable: true })
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
        window.dispatchEvent(event)
        expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('does not warn before unload when idle', async () => {
        handle = await initPatternPulseGameFramework()

        const event = new Event('beforeunload', { cancelable: true })
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
        window.dispatchEvent(event)
        expect(preventDefaultSpy).not.toHaveBeenCalled()
    })

    it('preserves the static pads after cleanup', async () => {
        handle = await initPatternPulseGameFramework()
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
        handle = await initPatternPulseGameFramework()
        const rendererDestroy = vi.spyOn(handle!.renderer, 'destroy')
        const gameDestroy = vi.spyOn(handle!.game, 'destroy')

        handle!.cleanup()
        handle!.cleanup()
        document.getElementById('start-btn')!.click()
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: '1', bubbles: true })
        )

        expect(rendererDestroy).toHaveBeenCalledTimes(1)
        expect(gameDestroy).toHaveBeenCalledTimes(1)
        expect(handle!.game.getState().gameStarted).toBe(false)
    })
})
