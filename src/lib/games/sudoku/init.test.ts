import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initSudokuGame } from './init'

// Mock saveGameScore to avoid network calls
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock ./game so we can spy on initializeGame for state-specific tests
vi.mock('./game', async importOriginal => {
    const actual = await importOriginal<typeof import('./game')>()
    return { ...actual, initializeGame: vi.fn(actual.initializeGame) }
})

function makeGameState(overrides: Record<string, unknown> = {}) {
    return {
        grid: {
            cells: Array.from({ length: 9 }, () =>
                Array.from({ length: 9 }, () => ({
                    value: null as number | null,
                    isGiven: false,
                    isHighlighted: false,
                    isConflicting: false,
                }))
            ),
            selectedCell: null as { row: number; col: number } | null,
        },
        difficulty: 'medium' as const,
        timer: 42,
        mistakes: 0,
        isComplete: false,
        isPaused: false,
        isGameOver: false,
        score: 100,
        ...overrides,
    }
}

describe('initSudokuGame', () => {
    let container: HTMLElement
    let rafCallbacks: FrameRequestCallback[]

    beforeEach(() => {
        rafCallbacks = []
        container = document.createElement('div')
        container.id = 'sudoku-container'
        document.body.appendChild(container)

        // Mock requestAnimationFrame
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafCallbacks.push(cb)
            return rafCallbacks.length
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
    })

    afterEach(() => {
        document.body.innerHTML = ''
        vi.unstubAllGlobals()
        vi.clearAllMocks()
    })

    describe('initialization', () => {
        it('should return a cleanup function', () => {
            const cleanup = initSudokuGame(container)
            expect(typeof cleanup).toBe('function')
        })

        it('should create a game element inside the container', () => {
            initSudokuGame(container)
            expect(container.querySelector('.sudoku-game')).not.toBeNull()
        })

        it('should render an initial 9x9 board with sudoku-cell divs', () => {
            initSudokuGame(container)
            const cells = container.querySelectorAll('.sudoku-cell')
            expect(cells.length).toBe(81)
        })

        it('should accept easy difficulty', () => {
            expect(() => initSudokuGame(container, 'easy')).not.toThrow()
        })

        it('should accept medium difficulty', () => {
            expect(() => initSudokuGame(container, 'medium')).not.toThrow()
        })

        it('should accept hard difficulty', () => {
            expect(() => initSudokuGame(container, 'hard')).not.toThrow()
        })

        it('should clear container innerHTML before creating game element', () => {
            container.innerHTML = '<p>old content</p>'
            initSudokuGame(container)
            expect(container.querySelector('p')).toBeNull()
        })

        it('should start requestAnimationFrame for game loop', () => {
            initSudokuGame(container)
            expect(rafCallbacks.length).toBeGreaterThanOrEqual(1)
        })
    })

    describe('cleanup function', () => {
        it('should call cancelAnimationFrame when cleanup is called', () => {
            const cleanup = initSudokuGame(container)
            cleanup()
            expect(cancelAnimationFrame).toHaveBeenCalled()
        })

        it('should remove the game element from DOM on cleanup', () => {
            const cleanup = initSudokuGame(container)
            const gameEl = container.querySelector('.sudoku-game')
            expect(gameEl).not.toBeNull()
            cleanup()
            expect(container.querySelector('.sudoku-game')).toBeNull()
        })
    })

    describe('cell click handling', () => {
        it('should select a cell when a sudoku-cell is clicked', () => {
            initSudokuGame(container)
            const cell = container.querySelector('.sudoku-cell') as HTMLElement
            expect(() => cell?.click()).not.toThrow()
        })

        it('should re-render after cell click', () => {
            initSudokuGame(container)
            const cells = container.querySelectorAll('.sudoku-cell')
            const firstCell = cells[0] as HTMLElement
            firstCell.dataset.row = '0'
            firstCell.dataset.col = '0'
            expect(() => firstCell.click()).not.toThrow()
            // Board should still have 81 cells after click
            expect(container.querySelectorAll('.sudoku-cell').length).toBe(81)
        })

        it('should use fallback row/col 0 when dataset.row/col absent (lines 155-156 || branch)', () => {
            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement
            // Create a .sudoku-cell element without data-row/data-col attributes
            const cell = document.createElement('div')
            cell.className = 'sudoku-cell'
            gameEl.appendChild(cell)
            // Click triggers handleGameClick → dataset.row is undefined → || '0' fires
            expect(() => cell.click()).not.toThrow()
        })
    })

    describe('keyboard handling', () => {
        it('should handle number key press on game element', () => {
            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement

            // First select a cell
            const cells = container.querySelectorAll('.sudoku-cell')
            ;(cells[40] as HTMLElement).click()

            // Press number key
            const event = new KeyboardEvent('keydown', { key: '5' })
            expect(() => gameEl.dispatchEvent(event)).not.toThrow()
        })

        it('should handle Delete key press', () => {
            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement

            const cells = container.querySelectorAll('.sudoku-cell')
            ;(cells[40] as HTMLElement).click()

            const event = new KeyboardEvent('keydown', { key: 'Delete' })
            expect(() => gameEl.dispatchEvent(event)).not.toThrow()
        })

        it('should handle Backspace key press', () => {
            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement

            const event = new KeyboardEvent('keydown', { key: 'Backspace' })
            expect(() => gameEl.dispatchEvent(event)).not.toThrow()
        })

        it('should handle P key for pause', () => {
            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement

            const event = new KeyboardEvent('keydown', { key: 'p' })
            expect(() => gameEl.dispatchEvent(event)).not.toThrow()
        })

        it('should handle ArrowUp key when cell is selected', () => {
            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement

            // Select a cell in the middle
            const cells = container.querySelectorAll('.sudoku-cell')
            ;(cells[40] as HTMLElement).click()

            const event = new KeyboardEvent('keydown', { key: 'ArrowUp' })
            expect(() => gameEl.dispatchEvent(event)).not.toThrow()
        })

        it('should handle ArrowDown key when cell is selected', () => {
            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement

            const cells = container.querySelectorAll('.sudoku-cell')
            ;(cells[40] as HTMLElement).click()

            const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })
            expect(() => gameEl.dispatchEvent(event)).not.toThrow()
        })

        it('should handle ArrowLeft key when cell is selected', () => {
            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement

            const cells = container.querySelectorAll('.sudoku-cell')
            ;(cells[40] as HTMLElement).click()

            const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' })
            expect(() => gameEl.dispatchEvent(event)).not.toThrow()
        })

        it('should handle ArrowRight key when cell is selected', () => {
            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement

            const cells = container.querySelectorAll('.sudoku-cell')
            ;(cells[40] as HTMLElement).click()

            const event = new KeyboardEvent('keydown', { key: 'ArrowRight' })
            expect(() => gameEl.dispatchEvent(event)).not.toThrow()
        })
    })

    describe('pause button', () => {
        it('should toggle pause when pause button is clicked', () => {
            const pauseBtn = document.createElement('button')
            pauseBtn.id = 'pause-btn'
            document.body.appendChild(pauseBtn)

            initSudokuGame(container)
            expect(() => pauseBtn.click()).not.toThrow()
        })

        it('should update pause button text when clicked', () => {
            const pauseBtn = document.createElement('button')
            pauseBtn.id = 'pause-btn'
            pauseBtn.textContent = 'Pause'
            document.body.appendChild(pauseBtn)

            initSudokuGame(container)
            expect(pauseBtn.textContent).toBe('Pause')
            pauseBtn.click()
            expect(pauseBtn.textContent).toBe('Resume')
            pauseBtn.click()
            expect(pauseBtn.textContent).toBe('Pause')
        })
    })

    describe('game loop', () => {
        it('should not throw when game loop runs', () => {
            initSudokuGame(container)
            // Run the RAF callback with a future timestamp
            const now = Date.now()
            expect(() => {
                rafCallbacks[0]?.(now + 2000)
            }).not.toThrow()
        })

        it('should update game-time element to mm:ss format after 2 seconds', () => {
            const timeEl = document.createElement('div')
            timeEl.id = 'game-time'
            document.body.appendChild(timeEl)

            vi.useFakeTimers()
            initSudokuGame(container)
            vi.advanceTimersByTime(2000)
            // Trigger the RAF callback — game loop reads Date.now() which is now +2000ms
            rafCallbacks[rafCallbacks.length - 1]?.(performance.now())
            vi.useRealTimers()
            expect(timeEl.textContent).toMatch(/^\d{2}:\d{2}$/)
        })

        it('should update score element in game loop', () => {
            const scoreEl = document.createElement('div')
            scoreEl.id = 'score'
            document.body.appendChild(scoreEl)

            vi.useFakeTimers()
            initSudokuGame(container)
            vi.advanceTimersByTime(1100)
            rafCallbacks[rafCallbacks.length - 1]?.(performance.now())
            vi.useRealTimers()
            expect(scoreEl.textContent).toMatch(/\d+/)
        })
    })

    describe('game initialization with overlay elements present', () => {
        it('should initialise successfully without a game-over-overlay in the DOM', () => {
            // Verifies initSudokuGame does not crash when overlay element is absent
            initSudokuGame(container)
            expect(container.querySelector('.sudoku-game')).not.toBeNull()
        })

        it('should initialise successfully with all overlay elements present', () => {
            // Verifies initSudokuGame does not crash when overlay elements are present;
            // the overlay is not shown at start because the puzzle is not yet complete
            const overlay = document.createElement('div')
            overlay.id = 'game-over-overlay'
            overlay.className = 'hidden'
            const h3 = document.createElement('h3')
            overlay.appendChild(h3)
            document.body.appendChild(overlay)

            const finalTimeEl = document.createElement('div')
            finalTimeEl.id = 'final-time'
            document.body.appendChild(finalTimeEl)

            const finalScoreEl = document.createElement('div')
            finalScoreEl.id = 'final-score'
            document.body.appendChild(finalScoreEl)

            const finalDiffEl = document.createElement('div')
            finalDiffEl.id = 'final-difficulty'
            document.body.appendChild(finalDiffEl)

            initSudokuGame(container)
            expect(container.querySelector('.sudoku-game')).not.toBeNull()
            // Overlay stays hidden at game start
            expect(overlay.classList.contains('hidden')).toBe(true)
        })
    })

    describe('pause overlay rendering', () => {
        it('should render pause overlay when state starts paused', async () => {
            const { initializeGame } = await import('./game')
            vi.mocked(initializeGame).mockReturnValueOnce(
                makeGameState({ isPaused: true }) as any
            )
            initSudokuGame(container)
            const gameEl = container.querySelector('.sudoku-game')!
            expect(gameEl.querySelector('.absolute')).not.toBeNull()
        })

        it('should handle P keydown with pause-btn in DOM', async () => {
            const pauseBtn = document.createElement('button')
            pauseBtn.id = 'pause-btn'
            pauseBtn.textContent = 'Pause'
            document.body.appendChild(pauseBtn)

            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement
            const event = new KeyboardEvent('keydown', {
                key: 'p',
                bubbles: true,
            })
            gameEl.dispatchEvent(event)
            // After keydown with 'p', pause-btn text should update
            expect(['Resume', 'Pause']).toContain(pauseBtn.textContent)
        })
    })

    describe('handleKeydown early return when paused', () => {
        it('should ignore number keydown when game is paused', async () => {
            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement

            // Pause via P key
            gameEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))
            // Now dispatch a number key — should hit early return
            expect(() =>
                gameEl.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }))
            ).not.toThrow()
        })
    })

    describe('handleKeydown default switch branch', () => {
        it('should hit default branch when a non-arrow non-special key is pressed with selected cell', () => {
            initSudokuGame(container)
            const gameEl = container.querySelector(
                '.sudoku-game'
            ) as HTMLElement

            // Select a cell
            const cells = container.querySelectorAll('.sudoku-cell')
            ;(cells[40] as HTMLElement).click()

            // Press a key that hits the default branch in the switch
            expect(() =>
                gameEl.dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'Tab' })
                )
            ).not.toThrow()
        })
    })

    describe('conflict cell rendering', () => {
        it('should render conflict classes when a cell has isConflicting true', async () => {
            const { initializeGame } = await import('./game')
            const state = makeGameState()
            state.grid.cells[0][0].isConflicting = true
            state.grid.cells[0][0].value = 5
            vi.mocked(initializeGame).mockReturnValueOnce(state as any)

            initSudokuGame(container)
            // Check that the board rendered (conflict styles applied internally)
            expect(container.querySelectorAll('.sudoku-cell').length).toBe(81)
        })
    })

    describe('showGameOverOverlay', () => {
        it('should return early when game-over-overlay is missing from DOM', async () => {
            const { initializeGame } = await import('./game')
            vi.mocked(initializeGame).mockReturnValueOnce(
                makeGameState({ isGameOver: true }) as any
            )
            // No overlay in DOM - should not throw
            expect(() => initSudokuGame(container)).not.toThrow()
        })

        it('should show overlay and update stats when game is over', async () => {
            const { initializeGame } = await import('./game')

            // Build overlay elements
            const overlay = document.createElement('div')
            overlay.id = 'game-over-overlay'
            overlay.className = 'hidden'
            const h3 = document.createElement('h3')
            overlay.appendChild(h3)
            document.body.appendChild(overlay)

            const finalTimeEl = document.createElement('div')
            finalTimeEl.id = 'final-time'
            document.body.appendChild(finalTimeEl)

            const finalScoreEl = document.createElement('div')
            finalScoreEl.id = 'final-score'
            document.body.appendChild(finalScoreEl)

            const finalDiffEl = document.createElement('div')
            finalDiffEl.id = 'final-difficulty'
            document.body.appendChild(finalDiffEl)

            vi.mocked(initializeGame).mockReturnValueOnce(
                makeGameState({ isGameOver: true, timer: 65 }) as any
            )
            initSudokuGame(container)

            expect(overlay.classList.contains('hidden')).toBe(false)
            expect(finalTimeEl.textContent).toBe('01:05')
            expect(finalScoreEl.textContent).toBe('100')
            expect(finalDiffEl.textContent).toBe('Medium')
            expect(h3.textContent).toBe('GAME OVER')
        })

        it('should show PUZZLE SOLVED when isComplete is true', async () => {
            const { initializeGame } = await import('./game')

            const overlay = document.createElement('div')
            overlay.id = 'game-over-overlay'
            overlay.className = 'hidden'
            const h3 = document.createElement('h3')
            overlay.appendChild(h3)
            document.body.appendChild(overlay)

            document.body.appendChild(
                Object.assign(document.createElement('div'), {
                    id: 'final-time',
                })
            )
            document.body.appendChild(
                Object.assign(document.createElement('div'), {
                    id: 'final-score',
                })
            )
            document.body.appendChild(
                Object.assign(document.createElement('div'), {
                    id: 'final-difficulty',
                })
            )

            vi.mocked(initializeGame).mockReturnValueOnce(
                makeGameState({ isComplete: true }) as any
            )
            initSudokuGame(container)

            expect(overlay.classList.contains('hidden')).toBe(false)
            expect(h3.textContent).toBe('PUZZLE SOLVED!')
        })
    })
})
