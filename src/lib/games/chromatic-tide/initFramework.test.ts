import { fireEvent } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initChromaticTideGameFramework } from './initFramework'
import type { ChromaticTideColor } from './types'

const PALETTE: ChromaticTideColor[] = [
    'teal',
    'amber',
    'magenta',
    'ice',
    'green',
]

function setupDOM(): void {
    document.body.innerHTML = `
        <div id="chromatic-tide-container">
            <div id="chromatic-tide-board" aria-hidden="true"></div>
            <p id="chromatic-tide-status" class="sr-only" aria-live="polite"></p>
            <div id="chromatic-tide-colors">
                <button data-tide-color="teal" aria-pressed="false">1 Teal</button>
                <button data-tide-color="amber" aria-pressed="false">2 Amber</button>
                <button data-tide-color="magenta" aria-pressed="false">3 Magenta</button>
                <button data-tide-color="ice" aria-pressed="false">4 Ice</button>
                <button data-tide-color="green" aria-pressed="false">5 Green</button>
            </div>
        </div>
        <button id="start-btn" style="display: inline-flex">Start Game</button>
        <button id="reset-btn">Reset</button>
        <button id="play-again-btn">Play Again</button>
        <span id="score">0</span>
        <span id="time-remaining">90</span>
        <span id="moves">0</span>
        <span id="captured">0 / 144</span>
        <div id="game-over-overlay" class="hidden">
            <h3 id="game-over-title">GAME OVER!</h3>
            <span id="final-score">0</span>
            <span id="final-outcome">—</span>
            <span id="final-moves">0</span>
            <span id="final-captured">0 / 144</span>
            <span id="final-time">00:00</span>
        </div>
    `
}

function colorButtons(): HTMLButtonElement[] {
    return Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-tide-color]')
    )
}

function buttonFor(color: ChromaticTideColor): HTMLButtonElement {
    return document.querySelector<HTMLButtonElement>(
        `[data-tide-color="${color}"]`
    )!
}

describe('initChromaticTideGameFramework', () => {
    let handle: Awaited<ReturnType<typeof initChromaticTideGameFramework>>

    beforeEach(() => {
        setupDOM()
        const samples = [
            ...Array<number>(143).fill(0),
            0.2,
            ...Array<number>(143).fill(0.4),
            0.6,
        ]
        let sampleIndex = 0
        vi.spyOn(Math, 'random').mockImplementation(
            () => samples[sampleIndex++] ?? 0.8
        )
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

    it('fails cleanly when the Chromatic Tide container is missing', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        document.getElementById('chromatic-tide-container')?.remove()

        expect(await initChromaticTideGameFramework()).toBeUndefined()
        expect(consoleError).toHaveBeenCalled()
    })

    it('renders an idle board with all five color controls disabled', async () => {
        handle = await initChromaticTideGameFramework()

        expect(handle).toBeDefined()
        expect(colorButtons()).toHaveLength(5)
        expect(colorButtons().every(button => button.disabled)).toBe(true)
        expect(
            document.querySelectorAll(
                '#chromatic-tide-board .chromatic-tide-cell'
            )
        ).toHaveLength(144)
        expect(
            document.getElementById('chromatic-tide-status')
        ).toHaveTextContent('Territory teal, 143 of 144 captured, 0 moves.')
    })

    it('enables every color on Start while keeping the current color pressed and reachable', async () => {
        handle = await initChromaticTideGameFramework()

        document.getElementById('start-btn')!.click()

        expect(handle!.game.getState().isActive).toBe(true)
        expect(colorButtons().every(button => !button.disabled)).toBe(true)
        expect(buttonFor('teal')).toHaveAttribute('aria-pressed', 'true')
        expect(buttonFor('teal').disabled).toBe(false)
        expect(
            colorButtons()
                .filter(button => button.dataset.tideColor !== 'teal')
                .every(
                    button => button.getAttribute('aria-pressed') === 'false'
                )
        ).toBe(true)
    })

    it('routes current and changed button choices through the model without counting the current color', async () => {
        handle = await initChromaticTideGameFramework()
        const chooseColor = vi.spyOn(handle!.game, 'chooseColor')
        document.getElementById('start-btn')!.click()

        buttonFor('teal').click()
        expect(handle!.game.getState().movesUsed).toBe(0)

        buttonFor('green').click()
        expect(handle!.game.getState().movesUsed).toBe(1)
        expect(chooseColor.mock.calls.map(([color]) => color)).toEqual([
            'teal',
            'green',
        ])
    })

    it('routes number keys through the same choice path and ignores editable targets', async () => {
        handle = await initChromaticTideGameFramework()
        const chooseColor = vi.spyOn(handle!.game, 'chooseColor')
        document.getElementById('start-btn')!.click()

        const keyboardChoice = new KeyboardEvent('keydown', {
            key: '5',
            bubbles: true,
            cancelable: true,
        })
        document.dispatchEvent(keyboardChoice)

        const input = document.createElement('input')
        document.body.appendChild(input)
        fireEvent.keyDown(input, { key: '2' })

        expect(keyboardChoice.defaultPrevented).toBe(true)
        expect(chooseColor).toHaveBeenCalledTimes(1)
        expect(chooseColor).toHaveBeenCalledWith('green')
        expect(handle!.game.getState().movesUsed).toBe(1)
    })

    it('updates the pressed reachable color, HUD, and polite status after a move', async () => {
        handle = await initChromaticTideGameFramework()
        document.getElementById('start-btn')!.click()

        buttonFor('green').click()

        expect(buttonFor('green')).toHaveAttribute('aria-pressed', 'true')
        expect(buttonFor('green').disabled).toBe(false)
        expect(buttonFor('teal')).toHaveAttribute('aria-pressed', 'false')
        expect(document.getElementById('moves')).toHaveTextContent('1')
        expect(document.getElementById('captured')).toHaveTextContent(
            '143 / 144'
        )
        expect(
            document.getElementById('chromatic-tide-status')
        ).toHaveTextContent('Territory green, 143 of 144 captured, 1 move.')
    })

    it('Reset and Play Again restore idle controls and render fresh boards', async () => {
        handle = await initChromaticTideGameFramework()
        document.getElementById('start-btn')!.click()
        buttonFor('green').click()
        const firstBoard = handle!.game.getState().board
        const firstCell = document.querySelector('.chromatic-tide-cell')

        document.getElementById('reset-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            isActive: false,
            gameStarted: false,
            movesUsed: 0,
            territoryColor: 'magenta',
        })
        expect(handle!.game.getState().board).not.toBe(firstBoard)
        expect(document.querySelector('.chromatic-tide-cell')).not.toBe(
            firstCell
        )
        expect(colorButtons().every(button => button.disabled)).toBe(true)
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )

        const secondBoard = handle!.game.getState().board
        document.getElementById('start-btn')!.click()
        document.getElementById('play-again-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            isActive: false,
            gameStarted: false,
            movesUsed: 0,
        })
        expect(handle!.game.getState().board).not.toBe(secondBoard)
        expect(colorButtons().every(button => button.disabled)).toBe(true)
    })

    it('populates final stats, overlay, controls, and live status when the board clears', async () => {
        handle = await initChromaticTideGameFramework()
        document.getElementById('start-btn')!.click()

        buttonFor('amber').click()

        await vi.waitFor(() =>
            expect(
                document.getElementById('game-over-overlay')
            ).not.toHaveClass('hidden')
        )
        expect(handle!.game.getState()).toMatchObject({
            outcome: 'cleared',
            isActive: false,
            isGameOver: true,
        })
        expect(document.getElementById('final-outcome')).toHaveTextContent(
            'Cleared'
        )
        expect(document.getElementById('final-moves')).toHaveTextContent('1')
        expect(document.getElementById('final-captured')).toHaveTextContent(
            '144 / 144'
        )
        expect(document.getElementById('final-score')).toHaveTextContent('2645')
        expect(document.getElementById('game-over-title')).toHaveTextContent(
            'TIDE COMPLETE!'
        )
        expect(colorButtons().every(button => button.disabled)).toBe(true)
        expect(
            document.getElementById('chromatic-tide-status')
        ).toHaveTextContent(
            'Board cleared. Territory amber, 144 of 144 captured, 1 move.'
        )
    })

    it('forwards achievement and challenge notifications from end events', async () => {
        const showAchievementAward = vi.fn()
        const showChallengeComplete = vi.fn()
        vi.stubGlobal('showAchievementAward', showAchievementAward)
        vi.stubGlobal('showChallengeComplete', showChallengeComplete)
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                newAchievements: ['chromatic_tide_welcome'],
                challengeUpdates: {
                    completedChallenges: [{ id: 'chromatic-tide-clear' }],
                },
            }),
        } as Response)
        handle = await initChromaticTideGameFramework()
        document.getElementById('start-btn')!.click()

        buttonFor('amber').click()

        await vi.waitFor(() =>
            expect(showAchievementAward).toHaveBeenCalledWith([
                'chromatic_tide_welcome',
            ])
        )
        expect(showChallengeComplete).toHaveBeenCalledWith({
            completedChallenges: [{ id: 'chromatic-tide-clear' }],
        })
    })

    it('guards active runs before unload', async () => {
        handle = await initChromaticTideGameFramework()
        document.getElementById('start-btn')!.click()
        const event = new Event('beforeunload', { cancelable: true })

        window.dispatchEvent(event)

        expect(event.defaultPrevented).toBe(true)
    })

    it('cleans up once and later DOM events cannot mutate the destroyed game', async () => {
        handle = await initChromaticTideGameFramework()
        document.getElementById('start-btn')!.click()
        const rendererDestroy = vi.spyOn(handle!.renderer, 'destroy')
        const gameDestroy = vi.spyOn(handle!.game, 'destroy')
        const chooseColor = vi.spyOn(handle!.game, 'chooseColor')
        const stateBeforeCleanup = handle!.game.getState()

        handle!.cleanup()
        handle!.cleanup()
        buttonFor('green').click()
        fireEvent.keyDown(document, { key: '5' })
        document.getElementById('reset-btn')!.click()
        document.getElementById('start-btn')!.click()

        expect(rendererDestroy).toHaveBeenCalledTimes(1)
        expect(gameDestroy).toHaveBeenCalledTimes(1)
        expect(chooseColor).not.toHaveBeenCalled()
        expect(handle!.game.getState()).toMatchObject({
            isActive: stateBeforeCleanup.isActive,
            movesUsed: stateBeforeCleanup.movesUsed,
            territoryColor: stateBeforeCleanup.territoryColor,
        })
    })

    it.each(PALETTE.map((color, index) => [String(index + 1), color] as const))(
        'maps key %s to %s',
        async (key, color) => {
            handle = await initChromaticTideGameFramework()
            const chooseColor = vi
                .spyOn(handle!.game, 'chooseColor')
                .mockReturnValue(false)
            document.getElementById('start-btn')!.click()

            fireEvent.keyDown(document, { key })

            expect(chooseColor).toHaveBeenCalledWith(color)
        }
    )
})
