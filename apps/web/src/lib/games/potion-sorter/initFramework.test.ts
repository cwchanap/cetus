import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/dom'
import { initPotionSorterGameFramework } from './initFramework'
import { PotionSorterGame } from '@cetus/games/potion-sorter/PotionSorterGame'
import { PotionSorterRenderer } from './PotionSorterRenderer'
import { POTION_SORTER_PRESETS } from '@cetus/games/potion-sorter/levels'

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
    // Mirrors the static skeleton rendered by src/pages/potion-sorter/index.astro.
    const skeleton = Array.from({ length: 9 }, (_, index) =>
        [
            `<button type="button" class="potion-tube" data-tube-index="${index}" hidden>`,
            '<span class="potion-layer" aria-hidden="true"></span>'.repeat(4),
            '</button>',
        ].join('')
    ).join('')
    document.body.innerHTML = `
        <div id="potion-sorter-container">
            <div id="potion-sorter-board" class="potion-sorter-board" aria-label="Potion tubes">${skeleton}</div>
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
            `#potion-sorter-board button[data-tube-index="${index}"] .potion-layer:not([hidden])`
        )
    ).map(layer => layer.getAttribute('data-liquid') ?? '')
}

// Static skeleton holds nine tubes; the renderer hides surplus ones.
function visibleTubeCount(): number {
    return document.querySelectorAll(
        '#potion-sorter-board button[data-tube-index]:not([hidden])'
    ).length
}

// The island passes the board host (HPA-393); tests grab the same node.
function initFramework(): ReturnType<typeof initPotionSorterGameFramework> {
    return initPotionSorterGameFramework(
        document.getElementById('potion-sorter-container')!
    )
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

    it('fails cleanly when the renderer board is missing', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        document.getElementById('potion-sorter-board')?.remove()

        expect(await initFramework()).toBeUndefined()
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })

    it('creates exactly one game and renderer instance', async () => {
        handle = await initFramework()

        expect(handle).toBeDefined()
        expect(handle!.game).toBeInstanceOf(PotionSorterGame)
        expect(handle!.renderer).toBeInstanceOf(PotionSorterRenderer)
        expect(handle!.renderer.getContainer()).toBe(
            document.getElementById('potion-sorter-board')
        )
        expect(visibleTubeCount()).toBe(7)
    })

    it('renders the idle Medium board with the pressed preset before Start', async () => {
        handle = await initFramework()

        expect(handle!.game.getState()).toMatchObject({
            difficulty: 'medium',
            isActive: false,
            gameStarted: false,
        })
        expect(visibleTubeCount()).toBe(7)
        expect(
            document.getElementById('medium-btn')!.getAttribute('aria-pressed')
        ).toBe('true')
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement
        expect(undoButton.disabled).toBe(true)
        expect(undoButton.dataset.deadEnd).toBe('false')
    })

    it('rerenders immediately on an idle difficulty change and rejects active changes', async () => {
        handle = await initFramework()

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
        handle = await initFramework()
        handle!.game.start()

        clickTube(0)

        expect(handle!.game.getState().selectedTubeIndex).toBe(0)
    })

    it('writes selection, invalid, pour, and undo copy to the status region', async () => {
        handle = await initFramework()
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
        handle = await initFramework()
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
        handle = await initFramework()
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
        handle = await initFramework()
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
        handle = await initFramework()
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
        handle = await initFramework()
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

    it('Restart clears dead-end state and returns to idle', async () => {
        handle = await initFramework()
        handle!.game.start()

        playMoves(MEDIUM_DEAD_END)
        handle!.restart()

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
    })

    it('disables Undo and clears the dead-end flag when a run with history times out', async () => {
        handle = await initFramework()
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

    it('disables Undo immediately on timeout while score submission is still pending', async () => {
        // Regression: onStateChange must sync the Undo button so it does not
        // stay enabled (or dead-end-emphasized) during the await between
        // handleTimeUp's emitStateChange and onEnd running after saveFinalScore.
        let resolveFetch!: (value: Response) => void
        const pendingScore = new Promise<Response>(resolve => {
            resolveFetch = resolve
        })
        vi.stubGlobal(
            'fetch',
            vi.fn().mockReturnValue(pendingScore) as unknown as typeof fetch
        )

        handle = await initFramework()
        handle!.game.start()

        playMoves(MEDIUM_DEAD_END)
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement
        expect(undoButton.disabled).toBe(false)
        expect(undoButton.dataset.deadEnd).toBe('true')

        vi.advanceTimersByTime(300_000)

        // Assert before the score submission resolves — no awaiting settleEnd.
        expect(handle!.game.getState().result).toBe('timeout')
        expect(undoButton.disabled).toBe(true)
        expect(undoButton.dataset.deadEnd).toBe('false')

        // Let the pending score submission complete so onEnd can run and
        // cleanup finishes without leaking rejected promises.
        resolveFetch({
            ok: true,
            json: async () => ({ newAchievements: [] }),
        } as Response)
        await settleEnd()
    })

    it('keeps Undo disabled across game over and an idle difficulty change', async () => {
        handle = await initFramework()
        handle!.game.start()

        playMoves(MEDIUM_DEAD_END)
        vi.advanceTimersByTime(300_000)
        await settleEnd()
        document.getElementById('easy-btn')!.click()

        expect(handle!.game.getState().difficulty).toBe('easy')
        expect(visibleTubeCount()).toBe(5)
        const undoButton = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement
        expect(undoButton.disabled).toBe(true)
        expect(undoButton.dataset.deadEnd).toBe('false')
    })

    it('Play Again restart keeps the chosen preset and restores the board', async () => {
        // Overlay/final-stat ownership moved to the PotionSorterScreen island
        // (HPA-393); the initializer contract left here is the restart itself.
        handle = await initFramework()
        document.getElementById('easy-btn')!.click()
        handle!.game.start()

        playMoves(EASY_SOLUTION)
        await settleEnd()
        handle!.restart()

        expect(handle!.game.getState()).toMatchObject({
            difficulty: 'easy',
            isActive: false,
            isGameOver: false,
            gameStarted: false,
            movesMade: 0,
            undosUsed: 0,
        })
        expect(
            document.getElementById('easy-btn')!.getAttribute('aria-pressed')
        ).toBe('true')
        expect(tubeLayers(0)).toEqual(
            POTION_SORTER_PRESETS.easy.initialTubes[0]
        )
    })

    it('warns before unload only while a run is active', async () => {
        handle = await initFramework()

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
        handle = await initFramework()
        const rendererDestroy = vi.spyOn(handle!.renderer, 'destroy')
        const gameDestroy = vi.spyOn(handle!.game, 'destroy')

        handle!.cleanup()
        handle!.cleanup()
        document.getElementById('undo-btn')!.click()

        expect(rendererDestroy).toHaveBeenCalledTimes(1)
        expect(gameDestroy).toHaveBeenCalledTimes(1)
        expect(handle!.game.getState().isActive).toBe(false)
        expect(handle!.game.getState().movesMade).toBe(0)
        expect(
            document.querySelectorAll(
                '#potion-sorter-board button[data-tube-index]'
            )
        ).toHaveLength(9)
    })
})
