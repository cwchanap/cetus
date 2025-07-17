// Tetris game initialization module
import {
    createGameState,
    generateNextPiece,
    movePiece,
    rotatePiece,
    hardDrop,
    startGame,
    togglePause,
    resetGame,
    gameLoop,
    updateUI,
    updateNextPieceDisplay,
    draw,
    GAME_CONSTANTS,
} from './game'
import { setupPixiJS } from './renderer'

export async function initTetrisGame(): Promise<void> {
    const gameContainer = document.getElementById('tetris-container')
    const nextCanvas = document.getElementById(
        'next-canvas'
    ) as HTMLCanvasElement
    const nextCtx = nextCanvas?.getContext('2d')

    if (!gameContainer || !nextCtx) {
        return
    }

    // Initialize game state
    const state = createGameState()
    const renderer = await setupPixiJS(gameContainer, GAME_CONSTANTS)

    // Helper functions that close over local state
    const updateNextPieceDisplayFn = () =>
        updateNextPieceDisplay(state, nextCtx, nextCanvas)

    const gameLoopFn = () => {
        if (state.gameStarted && !state.gameOver && !state.paused) {
            gameLoop(state)
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        document
            .getElementById('start-btn')
            ?.addEventListener('click', () => startGame(state, gameLoopFn))
        document
            .getElementById('pause-btn')
            ?.addEventListener('click', () => togglePause(state, gameLoopFn))
        document
            .getElementById('reset-btn')
            ?.addEventListener('click', () =>
                resetGame(state, updateNextPieceDisplayFn)
            )
        document
            .getElementById('restart-btn')
            ?.addEventListener('click', () =>
                resetGame(state, updateNextPieceDisplayFn)
            )

        // Page unload warning
        window.addEventListener('beforeunload', e => {
            if (state.gameStarted && !state.gameOver && !state.paused) {
                e.preventDefault()
                return 'You have a game in progress. Are you sure you want to leave?'
            }
        })

        // Keyboard controls
        document.addEventListener('keydown', e => {
            if (!state.gameStarted || state.gameOver || state.paused) {
                return
            }

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault()
                    movePiece(state, -1, 0)
                    break
                case 'ArrowRight':
                    e.preventDefault()
                    movePiece(state, 1, 0)
                    break
                case 'ArrowDown':
                    e.preventDefault()
                    movePiece(state, 0, 1)
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    rotatePiece(state)
                    break
                case ' ':
                    e.preventDefault()
                    hardDrop(state)
                    break
                case 'p':
                case 'P':
                    e.preventDefault()
                    togglePause(state, gameLoopFn)
                    break
            }
        })
    }

    // Initialize everything
    setupEventListeners()
    state.nextPiece = generateNextPiece()
    updateNextPieceDisplayFn()
    updateUI(state)

    // Start continuous draw loop for rendering
    function drawLoop() {
        draw(renderer, state, GAME_CONSTANTS)
        requestAnimationFrame(drawLoop)
    }
    drawLoop()
}
