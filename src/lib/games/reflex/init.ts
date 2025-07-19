import { ReflexGame } from './game'
import {
    setupPixiJS,
    renderGrid,
    renderObject,
    removeObject,
    showClickEffect,
    getCellFromPosition,
    cleanup,
} from './renderer'
import type {
    GameConfig,
    GameCallbacks,
    GameStats,
    RendererState,
} from './types'

const DEFAULT_CONFIG: GameConfig = {
    gameDuration: 60, // 60 seconds
    gridSize: 12, // 12x12 grid
    cellSize: 40, // 40px per cell
    objectLifetime: 2, // 2 seconds
    spawnInterval: 1, // 1 second
    coinToBombRatio: 2, // 2:1 ratio (coins:bombs)
    pointsForCoin: 10,
    pointsForBomb: -15,
    pointsForMissedCoin: -5,
}

export async function initializeReflexGame(
    gameContainer: HTMLElement,
    callbacks: GameCallbacks,
    config: Partial<GameConfig> = {}
): Promise<{
    game: ReflexGame
    cleanup: () => void
    startGame: () => void
    stopGame: () => void
}> {
    const finalConfig: GameConfig = { ...DEFAULT_CONFIG, ...config }

    try {
        // Setup PixiJS renderer
        const rendererState = await setupPixiJS(gameContainer, finalConfig)

        // Create enhanced callbacks that include rendering
        const enhancedCallbacks: GameCallbacks = {
            ...callbacks,
            onObjectSpawn: object => {
                renderObject(rendererState, object, finalConfig)
                callbacks.onObjectSpawn?.(object)
            },
            onObjectClick: (object, points) => {
                removeObject(rendererState, object.id)
                showClickEffect(
                    rendererState,
                    object.cell.row,
                    object.cell.col,
                    finalConfig,
                    points > 0
                )
                callbacks.onObjectClick?.(object, points)
            },
            onObjectExpire: object => {
                removeObject(rendererState, object.id)
                callbacks.onObjectExpire?.(object)
            },
        }

        // Create game instance
        const game = new ReflexGame(finalConfig, enhancedCallbacks)

        // Setup initial grid rendering
        renderGrid(rendererState, game.getGrid(), finalConfig)

        // Setup click handler
        const handleCanvasClick = (event: MouseEvent) => {
            const rect = rendererState.app.canvas.getBoundingClientRect()
            const x =
                (event.clientX - rect.left) *
                (rendererState.app.canvas.width / rect.width)
            const y =
                (event.clientY - rect.top) *
                (rendererState.app.canvas.height / rect.height)

            const cellPosition = getCellFromPosition(x, y, finalConfig)
            if (cellPosition) {
                game.handleCellClick(cellPosition.row, cellPosition.col)
            }
        }

        rendererState.app.canvas.addEventListener('click', handleCanvasClick)

        // Game loop for continuous rendering updates
        let animationFrame: number
        const gameLoop = () => {
            // Update object animations and remove expired objects
            const activeObjects = game.getActiveObjects()

            // Re-render all active objects to update animations
            activeObjects.forEach(object => {
                renderObject(rendererState, object, finalConfig)
            })

            animationFrame = requestAnimationFrame(gameLoop)
        }

        // Start the game loop
        gameLoop()

        const cleanupFunction = () => {
            cancelAnimationFrame(animationFrame)
            rendererState.app.canvas.removeEventListener(
                'click',
                handleCanvasClick
            )
            game.cleanup()
            cleanup(rendererState)
            gameContainer.innerHTML = ''
        }

        return {
            game,
            cleanup: cleanupFunction,
            startGame: () => game.startGame(),
            stopGame: () => game.stopGame(),
        }
    } catch (error) {
        gameContainer.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="text-center">
                    <p class="text-red-400 mb-2">Failed to initialize Reflex game</p>
                    <p class="text-gray-400 text-sm">${error}</p>
                </div>
            </div>
        `
        throw error
    }
}

export { DEFAULT_CONFIG }
export type { GameConfig, GameCallbacks, GameStats }
