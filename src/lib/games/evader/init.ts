import { EvaderGame } from './game'
import {
    setupPixiJS,
    renderPlayer,
    renderObjects,
    cleanup as rendererCleanup,
} from './renderer'
import type {
    GameConfig,
    GameCallbacks,
    GameStats,
    RendererState,
} from './types'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

const DEFAULT_CONFIG: GameConfig = {
    gameDuration: 60,
    canvasWidth: 800,
    canvasHeight: 300,
    playerSize: 40,
    playerSpeed: 300, // pixels per second
    objectSize: 30,
    spawnInterval: 1, // seconds
    objectSpeed: 200, // pixels per second
    coinToBombRatio: 0.5, // 0.5:1 coins to bombs (2:1 bomb to coin)
    pointsForCoin: 100,
    pointsForBomb: -100,
}

async function handleGameOver(
    finalScore: number,
    stats: GameStats
): Promise<void> {
    // Update final stats in overlay
    const finalScoreElement = document.getElementById('final-score')
    if (finalScoreElement) {
        finalScoreElement.textContent = finalScore.toString()
    }

    const finalCoinsElement = document.getElementById('final-coins')
    if (finalCoinsElement) {
        finalCoinsElement.textContent = stats.coinsCollected.toString()
    }

    const finalBombsElement = document.getElementById('final-bombs')
    if (finalBombsElement) {
        finalBombsElement.textContent = stats.bombsHit.toString()
    }

    // Show game over overlay
    const gameOverOverlay = document.getElementById('game-over-overlay')
    if (gameOverOverlay) {
        gameOverOverlay.classList.remove('hidden')
    }

    // Reset buttons
    const startBtn = document.getElementById('start-btn')
    const stopBtn = document.getElementById('stop-btn')
    if (startBtn) {
        startBtn.style.display = 'inline-flex'
        startBtn.style.opacity = '1'
        startBtn.style.pointerEvents = 'auto'
    }
    if (stopBtn) {
        stopBtn.style.display = 'none'
    }

    // Submit score
    await saveGameScore(
        GameID.EVADER,
        finalScore,
        result => {
            if (result.newAchievements && result.newAchievements.length > 0) {
                window.dispatchEvent(
                    new CustomEvent('achievementsEarned', {
                        detail: { achievementIds: result.newAchievements },
                    })
                )
            }
        },
        error => {
            console.error('Failed to submit score:', error)
        },
        stats
    )
}

export async function initializeEvaderGame(
    gameContainer: HTMLElement,
    callbacks: GameCallbacks,
    config: Partial<GameConfig> = {}
): Promise<{
    game: EvaderGame
    cleanup: () => void
    startGame: () => void
    stopGame: () => void
    pressKey: (key: string) => void
    releaseKey: (key: string) => void
}> {
    const finalConfig: GameConfig = { ...DEFAULT_CONFIG, ...config }

    try {
        const rendererState = await setupPixiJS(gameContainer, finalConfig)

        const enhancedCallbacks: GameCallbacks = {
            ...callbacks,
            onGameOver: async (finalScore: number, stats: GameStats) => {
                await handleGameOver(finalScore, stats)
                callbacks.onGameOver?.(finalScore, stats)
            },
            onObjectSpawn: object => {
                callbacks.onObjectSpawn?.(object)
            },
            onCollision: (object, points) => {
                callbacks.onCollision?.(object, points)
            },
        }

        const game = new EvaderGame(finalConfig, enhancedCallbacks)

        // Setup keyboard controls
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                game.pressKey(event.key)
            }
        }

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                game.releaseKey(event.key)
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        document.addEventListener('keyup', handleKeyUp)

        // Game loop for rendering
        let animationFrame: number
        const gameLoop = () => {
            const state = game.getState()
            renderPlayer(rendererState, state.player, finalConfig)
            renderObjects(rendererState, state.objects, finalConfig)

            animationFrame = requestAnimationFrame(gameLoop)
        }

        gameLoop()

        const cleanupFunction = () => {
            cancelAnimationFrame(animationFrame)
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('keyup', handleKeyUp)
            game.cleanup()
            rendererCleanup(rendererState)
            gameContainer.innerHTML = ''
        }

        return {
            game,
            cleanup: cleanupFunction,
            startGame: () => game.startGame(),
            stopGame: () => game.stopGame(),
            pressKey: (key: string) => game.pressKey(key),
            releaseKey: (key: string) => game.releaseKey(key),
        }
    } catch (error) {
        gameContainer.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="text-center">
                    <p class="text-red-400 mb-2">Failed to initialize Evader game</p>
                    <p class="text-gray-400 text-sm">${error}</p>
                </div>
            </div>
        `
        throw error
    }
}

export { DEFAULT_CONFIG }
export type { GameConfig, GameCallbacks, GameStats }
