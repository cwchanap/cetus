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
    endGame,
    GAME_CONSTANTS,
} from './game'
import { setupPixiJS } from './renderer'

export async function initTetrisGame(callbacks?: {
    onGameOver?: (finalScore: number, stats: any) => void
}): Promise<unknown> {
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

    // Enhanced state with callbacks
    const enhancedState = {
        ...state,
        onGameOver: callbacks?.onGameOver,
    }

    // Helper functions that close over local state
    const updateNextPieceDisplayFn = () =>
        updateNextPieceDisplay(state, nextCtx, nextCanvas)

    const gameLoopFn = () => {
        if (
            enhancedState.gameStarted &&
            !enhancedState.gameOver &&
            !enhancedState.paused
        ) {
            gameLoop(enhancedState)
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        document
            .getElementById('start-btn')
            ?.addEventListener('click', () =>
                startGame(enhancedState, gameLoopFn)
            )
        document
            .getElementById('pause-btn')
            ?.addEventListener('click', () =>
                togglePause(enhancedState, gameLoopFn)
            )
        document
            .getElementById('reset-btn')
            ?.addEventListener('click', () =>
                resetGame(enhancedState, updateNextPieceDisplayFn)
            )
        document
            .getElementById('restart-btn')
            ?.addEventListener('click', () =>
                resetGame(enhancedState, updateNextPieceDisplayFn)
            )

        // Page unload warning
        window.addEventListener('beforeunload', e => {
            if (
                enhancedState.gameStarted &&
                !enhancedState.gameOver &&
                !enhancedState.paused
            ) {
                e.preventDefault()
                return 'You have a game in progress. Are you sure you want to leave?'
            }
        })

        // Keyboard controls
        document.addEventListener('keydown', e => {
            if (
                !enhancedState.gameStarted ||
                enhancedState.gameOver ||
                enhancedState.paused
            ) {
                return
            }

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault()
                    movePiece(enhancedState, -1, 0)
                    break
                case 'ArrowRight':
                    e.preventDefault()
                    movePiece(enhancedState, 1, 0)
                    break
                case 'ArrowDown':
                    e.preventDefault()
                    movePiece(enhancedState, 0, 1)
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    rotatePiece(enhancedState)
                    break
                case ' ':
                    e.preventDefault()
                    hardDrop(enhancedState)
                    break
                case 'p':
                case 'P':
                    e.preventDefault()
                    togglePause(enhancedState, gameLoopFn)
                    break
            }
        })
    }

    // Initialize everything
    setupEventListeners()
    enhancedState.nextPiece = generateNextPiece()
    updateNextPieceDisplayFn()
    updateUI(enhancedState)

    // Start continuous draw loop for rendering
    function drawLoop() {
        draw(renderer, enhancedState, GAME_CONSTANTS)
        requestAnimationFrame(drawLoop)
    }
    drawLoop()

    // Return game instance for external control
    return {
        restart: () => resetGame(enhancedState, updateNextPieceDisplayFn),
        getState: () => enhancedState,
        endGame: () => endGame(enhancedState),
    }
}
