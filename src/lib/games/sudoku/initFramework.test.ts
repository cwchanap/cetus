// initSudokuGameFramework integration tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initSudokuGameFramework } from './initFramework'

function setupDOM(): void {
    document.body.innerHTML = `
        <div id="sudoku-container" style="width: 450px; height: 450px;"></div>
        <span id="game-time">00:00</span>
        <span id="difficulty">Medium</span>
        <span id="score">0</span>
        <div id="game-over-overlay" class="hidden">
            <h3 id="game-over-title">GAME OVER</h3>
        </div>
        <span id="final-time">00:00</span>
        <span id="final-score">0</span>
        <span id="final-difficulty">Medium</span>
        <button id="start-btn" style="display:inline-flex">Start Game</button>
        <button id="end-btn" style="display:none">End Game</button>
        <button id="pause-btn">Pause</button>
        <button id="reset-btn">Reset</button>
        <button id="restart-btn">Play Again</button>
        <button id="easy-btn">Easy</button>
        <button id="medium-btn">Medium</button>
        <button id="hard-btn">Hard</button>
    `
}

describe('initSudokuGameFramework', () => {
    let result: Awaited<ReturnType<typeof initSudokuGameFramework>>

    beforeEach(() => {
        setupDOM()
        vi.clearAllMocks()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
    })

    afterEach(() => {
        if (result) {
            try {
                result.cleanup()
            } catch {
                // ignore
            }
        }
        result = undefined
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
    })

    describe('initialization', () => {
        it('returns undefined when the container is missing', async () => {
            document.getElementById('sudoku-container')!.remove()
            expect(await initSudokuGameFramework()).toBeUndefined()
        })

        it('returns a game instance with the expected API', async () => {
            result = await initSudokuGameFramework()
            expect(result).toBeDefined()
            expect(result!.game).toBeDefined()
            expect(result!.renderer).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
            expect(typeof result!.restart).toBe('function')
            expect(typeof result!.getState).toBe('function')
            expect(typeof result!.endGame).toBe('function')
        })

        it('initializes with default state', async () => {
            result = await initSudokuGameFramework()
            const state = result!.getState()
            expect(state.score).toBe(0)
            expect(state.gameStarted).toBe(false)
            expect(state.isGameOver).toBe(false)
        })

        it('renders the initial board into the sudoku-container element', async () => {
            result = await initSudokuGameFramework()
            const container = document.getElementById('sudoku-container')!
            expect(container.querySelectorAll('.sudoku-cell').length).toBe(81)
        })
    })

    describe('start wiring', () => {
        it('starts the game and swaps buttons via the start button', async () => {
            result = await initSudokuGameFramework()
            const startBtn = document.getElementById('start-btn')!
            const endBtn = document.getElementById('end-btn')!

            startBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(result!.game.getState().gameStarted).toBe(true)
            expect(startBtn.style.display).toBe('none')
            expect(endBtn.style.display).toBe('inline-flex')
        })

        it('hides the game-over overlay on start', async () => {
            result = await initSudokuGameFramework()
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            document
                .getElementById('start-btn')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(overlay.classList.contains('hidden')).toBe(true)
        })

        it('disables difficulty buttons on start', async () => {
            result = await initSudokuGameFramework()
            document
                .getElementById('start-btn')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(
                (document.getElementById('easy-btn') as HTMLButtonElement)
                    .disabled
            ).toBe(true)
        })
    })

    describe('cell clicks', () => {
        it('selects a cell when clicked after the game starts', async () => {
            result = await initSudokuGameFramework()
            result!.game.start()

            const container = document.getElementById('sudoku-container')!
            const firstCell = container.querySelector(
                '.sudoku-cell'
            ) as HTMLElement
            const selectSpy = vi.spyOn(result!.game, 'selectCell')

            firstCell.dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(selectSpy).toHaveBeenCalled()
        })
    })

    describe('end game', () => {
        it('shows the overlay and submits the score on end', async () => {
            result = await initSudokuGameFramework()
            result!.game.start()

            await result!.endGame()
            await Promise.resolve()
            await Promise.resolve()

            const overlay = document.getElementById('game-over-overlay')!
            expect(overlay.classList.contains('hidden')).toBe(false)
            expect(fetch).toHaveBeenCalledWith(
                '/api/scores',
                expect.objectContaining({ method: 'POST' })
            )
        })

        it('updates final stats in the overlay on end', async () => {
            result = await initSudokuGameFramework()
            result!.game.start()

            await result!.endGame()
            await Promise.resolve()
            await Promise.resolve()

            const finalScore = document.getElementById('final-score')!
            expect(finalScore.textContent).toMatch(/\d+/)
        })

        it('shows GAME OVER title when puzzle not solved', async () => {
            result = await initSudokuGameFramework()
            result!.game.start()

            await result!.endGame()
            await Promise.resolve()
            await Promise.resolve()

            const title = document.getElementById('game-over-title')!
            expect(title.textContent).toBe('GAME OVER')
        })
    })

    describe('restart', () => {
        it('resets the game and hides the overlay', async () => {
            result = await initSudokuGameFramework()
            result!.game.start()
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            result!.restart()

            const state = result!.game.getState()
            expect(state.gameStarted).toBe(false)
            expect(state.score).toBe(0)
            expect(overlay.classList.contains('hidden')).toBe(true)
        })
    })

    describe('start after game over', () => {
        it('generates a fresh puzzle and resets score before starting', async () => {
            result = await initSudokuGameFramework()
            result!.game.start()
            // Capture the first run's puzzle givens and score a placement
            const firstState = result!.game.getState()
            const firstGivens = firstState.grid.cells
                .map(row =>
                    row.map(c => (c.isGiven ? c.value : null)).join(',')
                )
                .join('|')
            // Place a number to make the score non-zero
            const emptyCell = firstState.grid.cells
                .map(
                    (row, r) =>
                        row
                            .map((c, col) => (c.isGiven ? null : { r, col }))
                            .filter(Boolean) as { r: number; col: number }[]
                )
                .flat()[0]
            if (emptyCell) {
                result!.game.selectCell(emptyCell.r, emptyCell.col)
                result!.game.placeNumber(1)
            }
            expect(result!.game.getState().score).toBeGreaterThan(0)

            await result!.endGame()
            expect(result!.game.getState().isGameOver).toBe(true)

            // Click Start again — should produce a fresh puzzle, not reuse
            // the ended run's grid/score.
            document
                .getElementById('start-btn')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }))

            const state = result!.game.getState()
            expect(state.gameStarted).toBe(true)
            expect(state.isGameOver).toBe(false)
            expect(state.score).toBe(0)
            const newGivens = state.grid.cells
                .map(row =>
                    row.map(c => (c.isGiven ? c.value : null)).join(',')
                )
                .join('|')
            // The new puzzle should differ from the ended one (puzzle
            // generation is randomized, so a fresh puzzle is expected).
            expect(newGivens).not.toBe(firstGivens)
        })
    })

    describe('reset button', () => {
        it('resets the game when reset is clicked', async () => {
            result = await initSudokuGameFramework()
            result!.game.start()

            document
                .getElementById('reset-btn')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }))

            const state = result!.game.getState()
            expect(state.gameStarted).toBe(false)
        })
    })

    describe('difficulty buttons', () => {
        it('changes difficulty when easy button is clicked', async () => {
            result = await initSudokuGameFramework()
            document
                .getElementById('easy-btn')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(result!.game.getState().difficulty).toBe('easy')
        })

        it('changes difficulty when hard button is clicked', async () => {
            result = await initSudokuGameFramework()
            document
                .getElementById('hard-btn')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(result!.game.getState().difficulty).toBe('hard')
        })
    })

    describe('pause button', () => {
        it('toggles pause when pause button is clicked', async () => {
            result = await initSudokuGameFramework()
            result!.game.start()

            const pauseBtn = document.getElementById('pause-btn')!
            pauseBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(result!.game.getState().isPaused).toBe(true)
            expect(pauseBtn.textContent).toBe('Resume')

            pauseBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            expect(result!.game.getState().isPaused).toBe(false)
            expect(pauseBtn.textContent).toBe('Pause')
        })
    })
})
