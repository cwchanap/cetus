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

// The island passes the board host (HPA-393); tests grab the same node.
function initFramework(): ReturnType<typeof initSudokuGameFramework> {
    return initSudokuGameFramework(document.getElementById('sudoku-container')!)
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
        it('returns undefined when the renderer board is missing', async () => {
            const consoleError = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})
            document.getElementById('sudoku-container')!.remove()
            expect(
                await initSudokuGameFramework(document.createElement('div'))
            ).toBeUndefined()
            expect(consoleError).toHaveBeenCalled()
            consoleError.mockRestore()
        })

        it('returns a game instance with the expected API', async () => {
            result = await initFramework()
            expect(result).toBeDefined()
            expect(result!.game).toBeDefined()
            expect(result!.renderer).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
            expect(typeof result!.restart).toBe('function')
            expect(typeof result!.getState).toBe('function')
            expect(typeof result!.endGame).toBe('function')
        })

        it('initializes with default state', async () => {
            result = await initFramework()
            const state = result!.getState()
            expect(state.score).toBe(0)
            expect(state.gameStarted).toBe(false)
            expect(state.isGameOver).toBe(false)
        })

        it('renders the initial board into the sudoku-container element', async () => {
            result = await initFramework()
            const container = document.getElementById('sudoku-container')!
            expect(container.querySelectorAll('.sudoku-cell').length).toBe(81)
        })
    })

    describe('start wiring', () => {
        it('starts the game through the game API', async () => {
            // Shared-button wiring moved to the SudokuScreen island (HPA-393);
            // the game lifecycle contract stays here.
            result = await initFramework()

            result!.game.start()

            expect(result!.game.getState().gameStarted).toBe(true)
        })

        it('disables difficulty buttons on start', async () => {
            result = await initFramework()
            result!.game.start()

            expect(
                (document.getElementById('easy-btn') as HTMLButtonElement)
                    .disabled
            ).toBe(true)
        })
    })

    describe('cell clicks', () => {
        it('selects a cell when clicked after the game starts', async () => {
            result = await initFramework()
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

    describe('arrow-key selection movement', () => {
        // Regression: ArrowLeft must move the selection left (column clamp),
        // not vertically — guards against row/col mixups in the keydown handler.
        async function startAtCenter(): Promise<void> {
            result = await initFramework()
            result!.game.start()
            result!.game.selectCell(4, 4)
        }

        function pressKey(key: string): void {
            document.dispatchEvent(new KeyboardEvent('keydown', { key }))
        }

        it('moves the selection left with ArrowLeft', async () => {
            await startAtCenter()
            pressKey('ArrowLeft')
            expect(result!.game.getState().grid.selectedCell).toEqual({
                row: 4,
                col: 3,
            })
        })

        it('moves the selection right with ArrowRight', async () => {
            await startAtCenter()
            pressKey('ArrowRight')
            expect(result!.game.getState().grid.selectedCell).toEqual({
                row: 4,
                col: 5,
            })
        })

        it('moves the selection up with ArrowUp', async () => {
            await startAtCenter()
            pressKey('ArrowUp')
            expect(result!.game.getState().grid.selectedCell).toEqual({
                row: 3,
                col: 4,
            })
        })

        it('moves the selection down with ArrowDown', async () => {
            await startAtCenter()
            pressKey('ArrowDown')
            expect(result!.game.getState().grid.selectedCell).toEqual({
                row: 5,
                col: 4,
            })
        })

        it('clamps ArrowLeft at the first column', async () => {
            await startAtCenter()
            result!.game.selectCell(4, 0)
            pressKey('ArrowLeft')
            expect(result!.game.getState().grid.selectedCell).toEqual({
                row: 4,
                col: 0,
            })
        })
    })

    describe('end game', () => {
        it('submits the score on end', async () => {
            // Overlay/final-stat ownership moved to the SudokuScreen island
            // (HPA-393); the score-submission contract stays here.
            result = await initFramework()
            result!.game.start()

            await result!.endGame()
            await Promise.resolve()
            await Promise.resolve()

            expect(fetch).toHaveBeenCalledWith(
                '/api/scores',
                expect.objectContaining({ method: 'POST' })
            )
        })
    })

    describe('restart', () => {
        it('resets the game', async () => {
            result = await initFramework()
            result!.game.start()

            result!.restart()

            const state = result!.game.getState()
            expect(state.gameStarted).toBe(false)
            expect(state.score).toBe(0)
        })
    })

    describe('start after game over', () => {
        it('generates a fresh puzzle and resets score before starting', async () => {
            result = await initFramework()
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

            // Click Start again — BaseGame.start() clears a completed run
            // itself (fresh puzzle), so it must not reuse the ended run's
            // grid/score.
            result!.game.start()

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

    describe('reset', () => {
        it('resets the game through the initializer restart', async () => {
            result = await initFramework()
            result!.game.start()

            result!.restart()

            const state = result!.game.getState()
            expect(state.gameStarted).toBe(false)
        })

        it('re-enables the difficulty buttons after a mid-run reset', async () => {
            // The screen's Reset goes through game.reset(); the difficulty
            // lock must follow live state rather than only onStart/onEnd.
            result = await initFramework()
            result!.game.start()

            const buttons = () =>
                ['easy-btn', 'medium-btn', 'hard-btn'].map(
                    id => document.getElementById(id) as HTMLButtonElement
                )
            expect(buttons().every(btn => btn.disabled)).toBe(true)

            result!.game.reset()

            expect(result!.game.getState().gameStarted).toBe(false)
            expect(buttons().every(btn => btn.disabled)).toBe(false)
        })
    })

    describe('difficulty buttons', () => {
        it('changes difficulty when easy button is clicked', async () => {
            result = await initFramework()
            document
                .getElementById('easy-btn')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(result!.game.getState().difficulty).toBe('easy')
        })

        it('changes difficulty when hard button is clicked', async () => {
            result = await initFramework()
            document
                .getElementById('hard-btn')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(result!.game.getState().difficulty).toBe('hard')
        })
    })

    describe('pause', () => {
        it('pauses and resumes through the game API', async () => {
            // Pause-button wiring moved to the SudokuScreen island (HPA-393);
            // the game lifecycle contract stays here (also used by the P key).
            result = await initFramework()
            result!.game.start()

            result!.game.pause()
            expect(result!.game.getState().isPaused).toBe(true)

            result!.game.resume()
            expect(result!.game.getState().isPaused).toBe(false)
        })
    })
})
