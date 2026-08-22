import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/dom'
import { initPotionSorterGameFramework } from './initFramework'
import { PotionSorterGame } from './PotionSorterGame'
import { PotionSorterRenderer } from './PotionSorterRenderer'
import { POTION_SORTER_PRESETS } from './levels'
import { calculatePotionSorterScore } from './scoring'

const EASY_SOLUTION: Array<[number, number]> = [
    [0, 3],
    [2, 0],
    [1, 2],
    [1, 3],
    [0, 1],
    [2, 0],
    [2, 3],
    [1, 2],
    [0, 1],
    [0, 3],
]

const MEDIUM_DEAD_END: Array<[number, number]> = [
    [3, 5],
    [1, 3],
    [4, 6],
    [4, 5],
]

const HARD_DEAD_END: Array<[number, number]> = [
    [1, 7],
    [4, 8],
]

function setupDOM(): void {
    document.body.innerHTML = `
        <div id="potion-sorter-container">
            <div id="potion-sorter-board" class="potion-sorter-board" aria-label="Potion tubes"></div>
            <p id="potion-sorter-status" aria-live="polite"></p>
        </div>
        <button id="start-btn" style="display: inline-flex">Start Game</button>
        <button id="reset-btn">Reset</button>
        <button id="undo-btn" disabled data-dead-end="false">Undo</button>
        <div>
            <button id="easy-btn">Easy</button>
            <button id="medium-btn">Medium</button>
            <button id="hard-btn">Hard</button>
        </div>
        <span id="score">0</span>
        <span id="time-remaining">300</span>
        <span id="difficulty">Medium</span>
        <span id="moves">0</span>
        <span id="undos">0</span>
        <div id="game-over-overlay" class="hidden">
            <h3 id="game-over-title">GAME OVER!</h3>
            <span id="final-outcome">—</span>
            <span id="final-difficulty">—</span>
            <span id="final-score">0</span>
            <span id="final-moves">0</span>
            <span id="final-undos">0</span>
            <span id="final-time">00:00</span>
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
    Awaited<ReturnType<typeof initPotionSorterGameFramework>>
>

function clickTube(index: number): void {
    const button = document.querySelector<HTMLButtonElement>(
        `#potion-sorter-board button[data-tube-index="${index}"]`
    )
    if (!button) {
        throw new Error(`Tube button ${index} not found`)
    }
    fireEvent.click(button)
}

function playMoves(moves: Array<[number, number]>): void {
    for (const [source, destination] of moves) {
        clickTube(source)
        clickTube(destination)
    }
}

function tubeLayers(index: number): string[] {
    return Array.from(
        document.querySelectorAll<HTMLElement>(
            `#potion-sorter-board button[data-tube-index="${index}"] .potion-layer`
        )
    ).map(layer => layer.getAttribute('data-liquid') ?? '')
}

describe('initPotionSorterGameFramework', () => {
    let handle: Awaited<ReturnType<typeof initPotionSorterGameFramework>>

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

    it('fails cleanly when the outer container is missing', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        document.getElementById('potion-sorter-container')?.remove()

        expect(await initPotionSorterGameFramework()).toBeUndefined()
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })

    it('creates exactly one game and renderer instance', async () => {
        handle = await initPotionSorterGameFramework()

        expect(handle).toBeDefined()
        expect(handle!.game).toBeInstanceOf(PotionSorterGame)
        expect(handle!.renderer).toBeInstanceOf(PotionSorterRenderer)
        expect(handle!.renderer.getContainer()).toBe(
            document.getElementById('potion-sorter-board')
        )
        expect(
            document.querySelectorAll(
                '#potion-sorter-board button[data-tube-index]'
            )
        ).toHaveLength(7)
    })

    it('renders the idle Medium board and HUD before Start', async () => {
        handle = await initPotionSorterGameFramework()

        expect(handle!.game.getState()).toMatchObject({
            difficulty: 'medium',
            isActive: false,
            gameStarted: false,
        })
        expect(
            document.querySelectorAll(
                '#potion-sorter-board button[data-tube-index]'
            )
        ).toHaveLength(7)
        expect(
            document.getElementById('medium-btn')!.getAttribute('aria-pressed')
        ).toBe('true')
        expect(document.getElementById('time-remaining')).toHaveTextContent(
            '300'
        )
        expect(document.getElementById('difficulty')).toHaveTextContent(
            'Medium'
        )
        expect(document.getElementById('start-btn')).toHaveStyle({
            display: 'inline-flex',
        })
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement
        expect(undoButton.disabled).toBe(true)
        expect(undoButton.dataset.deadEnd).toBe('false')
    })

    it('rerenders immediately on an idle difficulty change and rejects active changes', async () => {
        handle = await initPotionSorterGameFramework()

        document.getElementById('hard-btn')!.click()

        expect(handle!.game.getState().difficulty).toBe('hard')
        expect(
            document.querySelectorAll(
                '#potion-sorter-board button[data-tube-index]'
            )
        ).toHaveLength(9)
        expect(
            document.getElementById('hard-btn')!.getAttribute('aria-pressed')
        ).toBe('true')
        expect(
            document.getElementById('medium-btn')!.getAttribute('aria-pressed')
        ).toBe('false')
        expect(document.getElementById('time-remaining')).toHaveTextContent(
            '480'
        )
        expect(document.getElementById('difficulty')).toHaveTextContent('Hard')

        handle!.game.start()
        document.getElementById('easy-btn')!.click()

        expect(handle!.game.getState().difficulty).toBe('hard')
        expect(
            document.querySelectorAll(
                '#potion-sorter-board button[data-tube-index]'
            )
        ).toHaveLength(9)
        expect(
            document.getElementById('easy-btn')!.getAttribute('aria-pressed')
        ).toBe('false')
    })

    it('routes a native tube click to activateTube', async () => {
        handle = await initPotionSorterGameFramework()
        handle!.game.start()

        clickTube(0)

        expect(handle!.game.getState().selectedTubeIndex).toBe(0)
    })

    it('writes selection, invalid, pour, and undo copy to the status region', async () => {
        handle = await initPotionSorterGameFramework()
        handle!.game.start()
        const status = document.getElementById('potion-sorter-status')!

        clickTube(0)
        expect(status).toHaveTextContent('Selected tube 1.')

        clickTube(0)
        expect(status).toHaveTextContent('Selection cleared.')

        clickTube(0)
        clickTube(1)
        expect(status).toHaveTextContent('That pour is not allowed.')

        clickTube(5)
        expect(status).toHaveTextContent('Potion poured.')

        document.getElementById('undo-btn')!.click()
        expect(status).toHaveTextContent('Last pour undone.')
    })

    it('keeps Undo disabled without history and enables it after a legal pour', async () => {
        handle = await initPotionSorterGameFramework()
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement

        expect(undoButton.disabled).toBe(true)
        handle!.game.start()
        expect(undoButton.disabled).toBe(true)

        clickTube(0)
        clickTube(5)
        expect(undoButton.disabled).toBe(false)

        document.getElementById('undo-btn')!.click()
        expect(undoButton.disabled).toBe(true)
    })

    it('announces the Medium dead-end path and emphasizes Undo', async () => {
        handle = await initPotionSorterGameFramework()
        handle!.game.start()

        playMoves(MEDIUM_DEAD_END)

        expect(
            document.getElementById('potion-sorter-status')
        ).toHaveTextContent('No pours left — undo or reset.')
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement
        expect(undoButton.dataset.deadEnd).toBe('true')
        expect(undoButton.disabled).toBe(false)
        expect(handle!.game.getState().result).toBe('playing')
    })

    it('clears the dead-end presentation when Undo restores a playable board', async () => {
        handle = await initPotionSorterGameFramework()
        handle!.game.start()

        playMoves(MEDIUM_DEAD_END)
        document.getElementById('undo-btn')!.click()

        expect(
            document.getElementById('potion-sorter-status')
        ).toHaveTextContent('Last pour undone.')
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement
        expect(undoButton.dataset.deadEnd).toBe('false')
        expect(undoButton.disabled).toBe(false)
    })

    it('announces the Hard dead-end path with the same signal', async () => {
        handle = await initPotionSorterGameFramework()
        document.getElementById('hard-btn')!.click()
        handle!.game.start()

        playMoves(HARD_DEAD_END)

        expect(
            document.getElementById('potion-sorter-status')
        ).toHaveTextContent('No pours left — undo or reset.')
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement
        expect(undoButton.dataset.deadEnd).toBe('true')
        expect(undoButton.disabled).toBe(false)
    })

    it('never enters dead-end presentation on the clean Easy path before solve', async () => {
        handle = await initPotionSorterGameFramework()
        document.getElementById('easy-btn')!.click()
        handle!.game.start()
        const status = document.getElementById('potion-sorter-status')!
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement

        playMoves(EASY_SOLUTION)

        expect(status).not.toHaveTextContent('No pours left — undo or reset.')
        expect(undoButton.dataset.deadEnd).toBe('false')
        expect(handle!.game.getState().result).toBe('solved')
    })

    it('Reset clears dead-end state and returns to idle', async () => {
        handle = await initPotionSorterGameFramework()
        handle!.game.start()

        playMoves(MEDIUM_DEAD_END)
        document.getElementById('reset-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            difficulty: 'medium',
            isActive: false,
            gameStarted: false,
            result: 'playing',
            movesMade: 0,
            undosUsed: 0,
        })
        expect(
            document.getElementById('potion-sorter-status')
        ).toHaveTextContent('Ready.')
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement
        expect(undoButton.dataset.deadEnd).toBe('false')
        expect(undoButton.disabled).toBe(true)
        expect(document.getElementById('start-btn')).toHaveStyle({
            display: 'inline-flex',
        })
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
        expect(document.getElementById('time-remaining')).toHaveTextContent(
            '300'
        )
    })

    it('disables Undo and clears the dead-end flag when a run with history times out', async () => {
        handle = await initPotionSorterGameFramework()
        handle!.game.start()

        playMoves(MEDIUM_DEAD_END)
        vi.advanceTimersByTime(300_000)
        await settleEnd()

        expect(handle!.game.getState().result).toBe('timeout')
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement
        expect(undoButton.disabled).toBe(true)
        expect(undoButton.dataset.deadEnd).toBe('false')
    })

    it('keeps Undo disabled across game over and an idle difficulty change', async () => {
        handle = await initPotionSorterGameFramework()
        handle!.game.start()

        playMoves(MEDIUM_DEAD_END)
        vi.advanceTimersByTime(300_000)
        await settleEnd()
        document.getElementById('easy-btn')!.click()

        expect(handle!.game.getState().difficulty).toBe('easy')
        expect(
            document.querySelectorAll(
                '#potion-sorter-board button[data-tube-index]'
            )
        ).toHaveLength(5)
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement
        expect(undoButton.disabled).toBe(true)
        expect(undoButton.dataset.deadEnd).toBe('false')
    })

    it('fills the result overlay with outcome, difficulty, score, moves, undos, and time', async () => {
        handle = await initPotionSorterGameFramework()
        document.getElementById('easy-btn')!.click()
        handle!.game.start()

        playMoves(EASY_SOLUTION)
        await settleEnd()

        expect(document.getElementById('game-over-overlay')).not.toHaveClass(
            'hidden'
        )
        expect(document.getElementById('game-over-title')).toHaveTextContent(
            'SOLVED!'
        )
        expect(document.getElementById('final-outcome')).toHaveTextContent(
            'Solved'
        )
        expect(document.getElementById('final-difficulty')).toHaveTextContent(
            'Easy'
        )
        expect(document.getElementById('final-score')).toHaveTextContent(
            String(
                calculatePotionSorterScore(
                    POTION_SORTER_PRESETS.easy,
                    180,
                    10,
                    true
                )
            )
        )
        expect(document.getElementById('final-moves')).toHaveTextContent('10')
        expect(document.getElementById('final-undos')).toHaveTextContent('0')
        expect(document.getElementById('final-time')).toHaveTextContent('00:00')
    })

    it('Play Again reuses the reset handler, hides the overlay, and restores the board', async () => {
        handle = await initPotionSorterGameFramework()
        document.getElementById('easy-btn')!.click()
        handle!.game.start()

        playMoves(EASY_SOLUTION)
        await settleEnd()
        document.getElementById('play-again-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            difficulty: 'easy',
            isActive: false,
            isGameOver: false,
            gameStarted: false,
            movesMade: 0,
            undosUsed: 0,
        })
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
        expect(document.getElementById('start-btn')).toHaveStyle({
            display: 'inline-flex',
        })
        expect(document.getElementById('time-remaining')).toHaveTextContent(
            '180'
        )
        expect(
            document.getElementById('easy-btn')!.getAttribute('aria-pressed')
        ).toBe('true')
        expect(tubeLayers(0)).toEqual(
            POTION_SORTER_PRESETS.easy.initialTubes[0]
        )
    })

    it('starts a fresh run directly from Start after a completed run', async () => {
        handle = await initPotionSorterGameFramework()
        document.getElementById('easy-btn')!.click()
        handle!.game.start()

        playMoves(EASY_SOLUTION)
        await settleEnd()
        document.getElementById('start-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            isActive: true,
            result: 'playing',
            movesMade: 0,
        })
        expect(document.getElementById('start-btn')).toHaveStyle({
            display: 'none',
        })
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
    })

    it('warns before unload only while a run is active', async () => {
        handle = await initPotionSorterGameFramework()

        const idleEvent = new Event('beforeunload', { cancelable: true })
        const idlePreventDefault = vi.spyOn(idleEvent, 'preventDefault')
        window.dispatchEvent(idleEvent)
        expect(idlePreventDefault).not.toHaveBeenCalled()

        handle!.game.start()
        const activeEvent = new Event('beforeunload', { cancelable: true })
        const activePreventDefault = vi.spyOn(activeEvent, 'preventDefault')
        window.dispatchEvent(activeEvent)
        expect(activePreventDefault).toHaveBeenCalled()
    })

    it('cleans up DOM listeners, renderer, and game once', async () => {
        handle = await initPotionSorterGameFramework()
        const rendererDestroy = vi.spyOn(handle!.renderer, 'destroy')
        const gameDestroy = vi.spyOn(handle!.game, 'destroy')

        handle!.cleanup()
        handle!.cleanup()
        document.getElementById('start-btn')!.click()

        expect(rendererDestroy).toHaveBeenCalledTimes(1)
        expect(gameDestroy).toHaveBeenCalledTimes(1)
        expect(handle!.game.getState().isActive).toBe(false)
        expect(
            document.getElementById('potion-sorter-board')!.children
        ).toHaveLength(0)
    })
})
