// Main game controller for Bubble Shooter
import type { GameState, GameConstants, Bubble } from './types'
import {
    getBubbleX,
    getBubbleY,
    pixiColorToHex,
    drawBubbleOnCanvas,
} from './utils'
import { updateProjectile } from './physics'
import { draw, type RendererState } from './renderer'
import { saveGameScore } from '@/lib/services/scoreService'

export const GAME_CONSTANTS: GameConstants = {
    BUBBLE_RADIUS: 20,
    GRID_WIDTH: 14,
    GRID_HEIGHT: 20,
    COLORS: [0xff4444, 0x44ff44, 0x4444ff], // Red, Green, Blue
    GAME_WIDTH: 600,
    GAME_HEIGHT: 800,
    SHOOTER_Y: 800 - 60,
}

export function createGameState(): GameState {
    return {
        grid: [],
        shooter: {
            x: GAME_CONSTANTS.GAME_WIDTH / 2,
            y: GAME_CONSTANTS.SHOOTER_Y,
        },
        currentBubble: null,
        nextBubble: null,
        aimAngle: -Math.PI / 2,
        projectile: null,
        score: 0,
        bubblesRemaining: 0,
        gameStarted: false,
        gameOver: false,
        paused: false,
        rowOffset: 0,
        shotCount: 0,
        needsRedraw: true,
    }
}

export function initializeGrid(state: GameState): void {
    state.grid = []
    state.bubblesRemaining = 0

    for (let row = 0; row < 5; row++) {
        state.grid[row] = []
        const cols = GAME_CONSTANTS.GRID_WIDTH - (row % 2)
        for (let col = 0; col < cols; col++) {
            if (Math.random() < 0.8) {
                state.grid[row][col] = {
                    color: GAME_CONSTANTS.COLORS[
                        Math.floor(Math.random() * GAME_CONSTANTS.COLORS.length)
                    ],
                    x: getBubbleX(col, row, GAME_CONSTANTS),
                    y: getBubbleY(row, state.rowOffset, GAME_CONSTANTS),
                }
                state.bubblesRemaining++
            } else {
                state.grid[row][col] = null
            }
        }
    }

    for (let row = 5; row < GAME_CONSTANTS.GRID_HEIGHT; row++) {
        state.grid[row] = []
    }

    state.needsRedraw = true
}

export function generateBubble(state: GameState): Bubble {
    const colorIndex = Math.floor(Math.random() * GAME_CONSTANTS.COLORS.length)
    const bubble = {
        color: GAME_CONSTANTS.COLORS[colorIndex],
        x: state.shooter.x,
        y: state.shooter.y - GAME_CONSTANTS.BUBBLE_RADIUS * 1.5, // Position bubble above shooter
    }
    state.currentBubble = bubble
    state.needsRedraw = true
    return bubble
}

export function generateNextBubble(state: GameState): { color: number } {
    const nextBubble = {
        color: GAME_CONSTANTS.COLORS[
            Math.floor(Math.random() * GAME_CONSTANTS.COLORS.length)
        ],
    }
    state.nextBubble = nextBubble
    state.needsRedraw = true
    return nextBubble
}

export function updateCurrentBubbleDisplay(
    state: GameState,
    currentBubbleCtx: CanvasRenderingContext2D,
    currentBubbleCanvas: HTMLCanvasElement
): void {
    if (!state.currentBubble) {
        return
    }

    currentBubbleCtx.fillStyle = 'rgba(0, 0, 0, 0.1)'
    currentBubbleCtx.fillRect(
        0,
        0,
        currentBubbleCanvas.width,
        currentBubbleCanvas.height
    )
    const centerX = currentBubbleCanvas.width / 2
    const centerY = currentBubbleCanvas.height / 2
    const radius = Math.min(centerX, centerY) - 4
    drawBubbleOnCanvas(
        currentBubbleCtx,
        centerX,
        centerY,
        radius,
        pixiColorToHex(state.currentBubble.color)
    )
}

export function updateNextBubbleDisplay(
    state: GameState,
    nextBubbleCtx: CanvasRenderingContext2D,
    nextBubbleCanvas: HTMLCanvasElement
): void {
    if (!state.nextBubble) {
        return
    }

    nextBubbleCtx.fillStyle = 'rgba(0, 0, 0, 0.1)'
    nextBubbleCtx.fillRect(
        0,
        0,
        nextBubbleCanvas.width,
        nextBubbleCanvas.height
    )
    const centerX = nextBubbleCanvas.width / 2
    const centerY = nextBubbleCanvas.height / 2
    const radius = Math.min(centerX, centerY) - 4
    drawBubbleOnCanvas(
        nextBubbleCtx,
        centerX,
        centerY,
        radius,
        pixiColorToHex(state.nextBubble.color)
    )
}

export function updateUI(state: GameState): void {
    const scoreElement = document.getElementById('score')
    const bubblesElement = document.getElementById('bubbles-remaining')

    if (scoreElement) {
        scoreElement.textContent = state.score.toString()
    }
    if (bubblesElement) {
        bubblesElement.textContent = state.bubblesRemaining.toString()
    }
}

export function handleMouseMove(
    e: MouseEvent,
    state: GameState,
    renderer: RendererState
): void {
    if (
        !state.gameStarted ||
        state.gameOver ||
        state.paused ||
        state.projectile
    ) {
        return
    }

    if (!renderer.app || !renderer.app.canvas) {
        return
    }
    const rect = renderer.app.canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Calculate aim angle from current bubble position if available, otherwise from shooter
    const aimFromY = state.currentBubble
        ? state.currentBubble.y
        : state.shooter.y
    const aimFromX = state.currentBubble
        ? state.currentBubble.x
        : state.shooter.x

    const newAimAngle = Math.atan2(mouseY - aimFromY, mouseX - aimFromX)

    let clampedAngle = newAimAngle
    if (clampedAngle > -Math.PI * 0.1) {
        clampedAngle = -Math.PI * 0.1
    }
    if (clampedAngle < -Math.PI * 0.9) {
        clampedAngle = -Math.PI * 0.9
    }

    // Only update if angle actually changed
    if (Math.abs(state.aimAngle - clampedAngle) > 0.01) {
        state.aimAngle = clampedAngle
        state.needsRedraw = true
    }
}

export function handleClick(
    _e: MouseEvent,
    state: GameState,
    updateCurrentBubbleDisplayFn: () => void
): void {
    if (
        !state.gameStarted ||
        state.gameOver ||
        state.paused ||
        state.projectile ||
        !state.currentBubble ||
        !state.nextBubble
    ) {
        return
    }

    const speed = 12
    state.projectile = {
        x: state.currentBubble.x,
        y: state.currentBubble.y,
        vx: Math.cos(state.aimAngle) * speed,
        vy: Math.sin(state.aimAngle) * speed,
        color: state.currentBubble.color,
    }

    state.currentBubble = {
        ...state.nextBubble,
        x: state.shooter.x,
        y: state.shooter.y - GAME_CONSTANTS.BUBBLE_RADIUS * 1.5, // Position bubble above shooter
    }
    generateNextBubble(state)
    updateCurrentBubbleDisplayFn()
    state.needsRedraw = true
}

export function startGame(state: GameState, gameLoopFn?: () => void): void {
    if (!state.gameStarted) {
        state.gameStarted = true
        state.needsRedraw = true
        const startBtn = document.getElementById(
            'start-btn'
        ) as HTMLButtonElement
        if (startBtn) {
            startBtn.textContent = 'Playing...'
            startBtn.disabled = true
        }
        // Start the game loop
        if (gameLoopFn) {
            gameLoopFn()
        }
    }
}

export function resetGame(
    state: GameState,
    updateCurrentBubbleDisplayFn: () => void,
    updateNextBubbleDisplayFn: () => void
): void {
    Object.assign(state, createGameState())
    initializeGrid(state)
    generateBubble(state)
    generateNextBubble(state)
    updateCurrentBubbleDisplayFn()
    updateNextBubbleDisplayFn()
    updateUI(state)
    state.needsRedraw = true

    const gameOverOverlay = document.getElementById('game-over-overlay')
    const pauseOverlay = document.getElementById('pause-overlay')
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement
    const pauseBtn = document.getElementById('pause-btn')

    if (gameOverOverlay) {
        gameOverOverlay.classList.add('hidden')
    }
    if (pauseOverlay) {
        pauseOverlay.classList.add('hidden')
    }
    if (startBtn) {
        startBtn.textContent = 'Start'
        startBtn.disabled = false
    }
    if (pauseBtn) {
        pauseBtn.textContent = 'Pause'
    }
}

export function togglePause(state: GameState, gameLoopFn: () => void): void {
    if (!state.gameStarted || state.gameOver) {
        return
    }

    state.paused = !state.paused
    state.needsRedraw = true
    const pauseBtn = document.getElementById('pause-btn')
    const pauseOverlay = document.getElementById('pause-overlay')

    if (state.paused) {
        if (pauseBtn) {
            pauseBtn.textContent = 'Resume'
        }
        if (pauseOverlay) {
            pauseOverlay.classList.remove('hidden')
        }
    } else {
        if (pauseBtn) {
            pauseBtn.textContent = 'Pause'
        }
        if (pauseOverlay) {
            pauseOverlay.classList.add('hidden')
        }
        gameLoopFn()
    }
}

export function gameLoop(state: GameState, renderer: RendererState): void {
    if (state.paused || !state.gameStarted) {
        return
    }

    if (state.gameOver) {
        endGame(state)
        return
    }

    updateProjectile(state, GAME_CONSTANTS)
    updateUI(state)

    // Check for game over after each update
    if (state.gameOver) {
        endGame(state)
        return
    }

    requestAnimationFrame(() => gameLoop(state, renderer))
}

export async function endGame(state: GameState): Promise<void> {
    state.gameOver = true
    state.gameStarted = false

    const finalScoreElement = document.getElementById('final-score')
    const gameOverOverlay = document.getElementById('game-over-overlay')
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement

    if (finalScoreElement) {
        finalScoreElement.textContent = state.score.toString()
    }
    if (gameOverOverlay) {
        gameOverOverlay.classList.remove('hidden')
    }
    if (startBtn) {
        startBtn.textContent = 'Start'
        startBtn.disabled = false
    }

    console.log('Game Over! Final Score:', state.score)

    // Submit score to server using scoreService
    await saveGameScore(
        'bubble_shooter',
        state.score,
        result => {
            // Handle newly earned achievements
            if (result.newAchievements && result.newAchievements.length > 0) {
                console.log('New achievements earned:', result.newAchievements)

                // Dispatch an event for achievement notifications
                window.dispatchEvent(
                    new CustomEvent('achievementsEarned', {
                        detail: { achievementIds: result.newAchievements },
                    })
                )
            }
        },
        error => {
            console.error('Failed to save score:', error)
        }
    )
}

export { draw }
