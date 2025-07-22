import {
    initializeGame,
    selectCell,
    placeNumber,
    clearCell,
    updateTimer,
    togglePause,
} from './game'
import type { GameState } from './types'

/**
 * Initializes and sets up the Sudoku game
 */
export function initSudokuGame(
    container: HTMLElement,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium'
): () => void {
    // Initialize game state
    const state: GameState = initializeGame(difficulty)

    // Create game container
    const gameElement = document.createElement('div')
    gameElement.className =
        'sudoku-game w-full h-full flex items-center justify-center p-4'
    container.innerHTML = '' // Clear existing content
    container.appendChild(gameElement)

    // Render initial state
    renderGame(gameElement, state)

    // Set up event listeners
    setupEventListeners(gameElement, state)

    // Start game loop with proper timing
    let gameLoopId: number | null = null
    let lastUpdateTime = Date.now()

    function gameLoop() {
        const currentTime = Date.now()
        const deltaTime = currentTime - lastUpdateTime

        // Update timer every second
        if (deltaTime >= 1000) {
            updateTimer(state)
            updateUI(state)
            lastUpdateTime = currentTime
        }

        // Continue game loop if game is active
        if (!state.isComplete && !state.isGameOver) {
            gameLoopId = requestAnimationFrame(gameLoop)
        }
    }

    // Start the game loop
    gameLoopId = requestAnimationFrame(gameLoop)

    // Return cleanup function
    return () => {
        // Cancel game loop
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId)
        }

        // Clean up event listeners
        gameElement.removeEventListener('click', e =>
            handleClick(e, state, gameElement)
        )
        gameElement.removeEventListener('keydown', e =>
            handleKeydown(e, state, gameElement)
        )

        // Remove game element
        if (gameElement.parentNode) {
            gameElement.parentNode.removeChild(gameElement)
        }
    }
}

/**
 * Updates external UI elements
 */
function updateUI(state: GameState): void {
    // Update timer
    const timeElement = document.getElementById('game-time')
    if (timeElement) {
        const minutes = Math.floor(state.timer / 60)
            .toString()
            .padStart(2, '0')
        const seconds = (state.timer % 60).toString().padStart(2, '0')
        timeElement.textContent = `${minutes}:${seconds}`
    }

    // Update mistakes
    const mistakesElement = document.getElementById('mistakes-count')
    if (mistakesElement) {
        mistakesElement.textContent = state.mistakes.toString()

        // Change color when approaching limit
        const badge = mistakesElement.closest('.px-4')
        if (badge) {
            if (state.mistakes >= 2) {
                badge.classList.add('border-red-400', 'text-red-400')
                badge.classList.remove('border-cyan-400', 'text-cyan-400')
            } else if (state.mistakes >= 1) {
                badge.classList.add('border-yellow-400', 'text-yellow-400')
                badge.classList.remove('border-cyan-400', 'text-cyan-400')
            }
        }
    }
}

/**
 * Sets up event listeners for the game
 */
function setupEventListeners(gameElement: HTMLElement, state: GameState): void {
    // Click handler for cell selection
    gameElement.addEventListener('click', e =>
        handleClick(e, state, gameElement)
    )

    // Keyboard support
    gameElement.addEventListener('keydown', e =>
        handleKeydown(e, state, gameElement)
    )

    // Focus the game element to receive keyboard events
    gameElement.tabIndex = 0
    gameElement.focus()

    // Handle pause button
    const pauseBtn = document.getElementById('pause-btn')
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            togglePause(state)
            pauseBtn.textContent = state.isPaused ? 'Resume' : 'Pause'
            renderGame(gameElement, state)
        })
    }
}

/**
 * Handles click events
 */
function handleClick(
    e: Event,
    state: GameState,
    gameElement: HTMLElement
): void {
    const target = e.target as HTMLElement

    // Handle cell clicks
    if (target.classList.contains('sudoku-cell')) {
        const row = parseInt(target.dataset.row || '0')
        const col = parseInt(target.dataset.col || '0')
        selectCell(state, row, col)
        renderGame(gameElement, state)
        return
    }
}

/**
 * Handles keyboard events
 */
function handleKeydown(
    e: KeyboardEvent,
    state: GameState,
    gameElement: HTMLElement
): void {
    // Ignore if game is over or complete
    if (state.isGameOver || state.isComplete || state.isPaused) {
        return
    }

    // Handle number keys (1-9)
    if (e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key)
        placeNumber(state, num)
        renderGame(gameElement, state)
        updateUI(state)
        return
    }

    // Handle delete/backspace for clearing
    if (e.key === 'Delete' || e.key === 'Backspace') {
        clearCell(state)
        renderGame(gameElement, state)
        return
    }

    // Handle pause
    if (e.key === 'p' || e.key === 'P') {
        togglePause(state)
        const pauseBtn = document.getElementById('pause-btn')
        if (pauseBtn) {
            pauseBtn.textContent = state.isPaused ? 'Resume' : 'Pause'
        }
        renderGame(gameElement, state)
        return
    }

    // Handle arrow keys for cell navigation
    if (state.grid.selectedCell) {
        const { row, col } = state.grid.selectedCell
        let newRow = row
        let newCol = col

        switch (e.key) {
            case 'ArrowUp':
                newRow = Math.max(0, row - 1)
                break
            case 'ArrowDown':
                newRow = Math.min(8, row + 1)
                break
            case 'ArrowLeft':
                newCol = Math.max(0, col - 1)
                break
            case 'ArrowRight':
                newCol = Math.min(8, col + 1)
                break
            default:
                return
        }

        // Only navigate if position changed
        if (newRow !== row || newCol !== col) {
            selectCell(state, newRow, newCol)
            renderGame(gameElement, state)
        }
    }
}

/**
 * Renders the current game state
 */
function renderGame(gameElement: HTMLElement, state: GameState): void {
    // Clear previous content
    gameElement.innerHTML = ''

    // Create game board (fits perfectly in 450px container)
    const board = document.createElement('div')
    board.className =
        'grid grid-cols-9 gap-1 p-3 bg-black/30 rounded-lg border border-cyan-400/30'
    board.style.width = '416px' // 9 cells × 40px + 8 gaps × 4px + padding 24px + border 4px = 416px
    board.style.height = '416px'
    gameElement.appendChild(board)

    // Render cells
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            const cell = state.grid.cells[row][col]
            const cellElement = document.createElement('div')

            // Base cell styling
            const cellClasses = [
                'sudoku-cell',
                'flex items-center justify-center',
                'text-lg font-bold font-orbitron',
                'border border-gray-600',
                'cursor-pointer',
                'relative',
                'transition-all duration-200',
                'w-10 h-10', // 40px cells to fit perfectly in container
            ]

            // Cell state styling
            if (cell.isGiven) {
                cellClasses.push('bg-gray-800/50', 'text-cyan-400')
            } else {
                cellClasses.push(
                    'bg-black/50',
                    'text-white',
                    'hover:bg-cyan-900/20'
                )
            }

            // Selection highlighting
            if (
                state.grid.selectedCell?.row === row &&
                state.grid.selectedCell?.col === col
            ) {
                cellClasses.push('ring-2', 'ring-cyan-400', 'bg-cyan-900/30')
            } else if (cell.isHighlighted) {
                cellClasses.push('bg-purple-900/20')
            }

            // Conflict highlighting
            if (cell.isConflicting) {
                cellClasses.push(
                    'bg-red-900/50',
                    'text-red-400',
                    'border-red-400'
                )
            }

            // 3x3 box borders (thicker borders for box separation)
            if (col % 3 === 0 && col !== 0) {
                cellClasses.push('border-l-2', 'border-l-cyan-400/50')
            }
            if (row % 3 === 0 && row !== 0) {
                cellClasses.push('border-t-2', 'border-t-cyan-400/50')
            }

            cellElement.className = cellClasses.join(' ')
            cellElement.dataset.row = row.toString()
            cellElement.dataset.col = col.toString()

            // Add value if present
            if (cell.value) {
                cellElement.textContent = cell.value.toString()
            }

            board.appendChild(cellElement)
        }
    }

    // Show game over/complete overlay
    if (state.isGameOver || state.isComplete) {
        showGameOverOverlay(state)
    }

    // Show pause overlay
    if (state.isPaused) {
        const pauseOverlay = document.createElement('div')
        pauseOverlay.className =
            'absolute inset-0 bg-black/80 rounded-lg flex items-center justify-center'
        pauseOverlay.innerHTML = `
            <div class="text-center">
                <h3 class="text-3xl font-orbitron font-bold text-cyan-400 mb-4">PAUSED</h3>
                <p class="text-gray-400">Press P to resume or click the Resume button</p>
            </div>
        `
        gameElement.appendChild(pauseOverlay)
    }
}

/**
 * Shows the game over overlay
 */
function showGameOverOverlay(state: GameState): void {
    const gameOverOverlay = document.getElementById('game-over-overlay')
    if (!gameOverOverlay) {
        return
    }

    // Update final stats
    const finalTimeElement = document.getElementById('final-time')
    if (finalTimeElement) {
        const minutes = Math.floor(state.timer / 60)
            .toString()
            .padStart(2, '0')
        const seconds = (state.timer % 60).toString().padStart(2, '0')
        finalTimeElement.textContent = `${minutes}:${seconds}`
    }

    const finalMistakesElement = document.getElementById('final-mistakes')
    if (finalMistakesElement) {
        finalMistakesElement.textContent = state.mistakes.toString()
    }

    const finalDifficultyElement = document.getElementById('final-difficulty')
    if (finalDifficultyElement) {
        const difficulty =
            state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1)
        finalDifficultyElement.textContent = difficulty
    }

    // Update overlay title based on outcome
    const titleElement = gameOverOverlay.querySelector('h3')
    if (titleElement) {
        if (state.isComplete) {
            titleElement.textContent = 'PUZZLE SOLVED!'
            titleElement.className =
                'text-4xl font-orbitron font-bold text-green-400 mb-6'
        } else {
            titleElement.textContent = 'GAME OVER'
            titleElement.className =
                'text-4xl font-orbitron font-bold text-red-400 mb-6'
        }
    }

    // Show overlay
    gameOverOverlay.classList.remove('hidden')
}
