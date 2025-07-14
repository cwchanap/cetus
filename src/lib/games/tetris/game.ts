// Main game controller for Tetris
import type { GameState, GameConstants, Piece } from './types'
import {
    hexToPixiColor,
    rotateMatrix,
    checkCollision,
    placePiece,
    clearLines,
    drawNextPiece,
} from './utils'
import { draw, type RendererState } from './renderer'

export const GAME_CONSTANTS: GameConstants = {
    BOARD_WIDTH: 10,
    BOARD_HEIGHT: 20,
    BLOCK_SIZE: 30,
    GAME_WIDTH: 300,
    GAME_HEIGHT: 600,
    NEXT_CANVAS_SIZE: 120,
    COLORS: {
        I: hexToPixiColor('#00ffff'),
        O: hexToPixiColor('#ffff00'),
        T: hexToPixiColor('#800080'),
        S: hexToPixiColor('#00ff00'),
        Z: hexToPixiColor('#ff0000'),
        J: hexToPixiColor('#0000ff'),
        L: hexToPixiColor('#ffa500'),
    },
    PIECE_TYPES: ['I', 'O', 'T', 'S', 'Z', 'J', 'L'],
    PIECES: {
        I: {
            shape: [[1, 1, 1, 1]],
            color: hexToPixiColor('#00ffff'),
        },
        O: {
            shape: [
                [1, 1],
                [1, 1],
            ],
            color: hexToPixiColor('#ffff00'),
        },
        T: {
            shape: [
                [0, 1, 0],
                [1, 1, 1],
            ],
            color: hexToPixiColor('#800080'),
        },
        S: {
            shape: [
                [0, 1, 1],
                [1, 1, 0],
            ],
            color: hexToPixiColor('#00ff00'),
        },
        Z: {
            shape: [
                [1, 1, 0],
                [0, 1, 1],
            ],
            color: hexToPixiColor('#ff0000'),
        },
        J: {
            shape: [
                [1, 0, 0],
                [1, 1, 1],
            ],
            color: hexToPixiColor('#0000ff'),
        },
        L: {
            shape: [
                [0, 0, 1],
                [1, 1, 1],
            ],
            color: hexToPixiColor('#ffa500'),
        },
    },
}

export function createGameState(): GameState {
    return {
        board: Array(GAME_CONSTANTS.BOARD_HEIGHT)
            .fill(null)
            .map(() => Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null)),
        currentPiece: null,
        nextPiece: null,
        score: 0,
        level: 1,
        lines: 0,
        gameOver: false,
        paused: false,
        gameStarted: false,
        stats: {
            pieces: 0,
            singles: 0,
            doubles: 0,
            triples: 0,
            tetrises: 0,
        },
        dropTime: 0,
        dropInterval: 1000,
        needsRedraw: true,
    }
}

export function generateNextPiece(): Piece {
    const randomType =
        GAME_CONSTANTS.PIECE_TYPES[
            Math.floor(Math.random() * GAME_CONSTANTS.PIECE_TYPES.length)
        ]
    return {
        type: randomType,
        shape: JSON.parse(
            JSON.stringify(GAME_CONSTANTS.PIECES[randomType].shape)
        ),
        color: GAME_CONSTANTS.PIECES[randomType].color,
        x: 0,
        y: 0,
    }
}

export function spawnPiece(state: GameState): void {
    state.currentPiece = state.nextPiece
    if (state.currentPiece) {
        state.currentPiece.x = Math.floor(
            (GAME_CONSTANTS.BOARD_WIDTH - state.currentPiece.shape[0].length) /
                2
        )
        state.currentPiece.y = 0
    }

    state.nextPiece = generateNextPiece()
    state.stats.pieces++

    // Check for game over
    if (
        state.currentPiece &&
        checkCollision(
            state.currentPiece.x,
            state.currentPiece.y,
            state.currentPiece.shape,
            state.board,
            GAME_CONSTANTS
        )
    ) {
        endGame(state).catch(error => {
            console.error('Error ending game:', error)
        })
    }

    state.needsRedraw = true
}

export function movePiece(state: GameState, dx: number, dy: number): void {
    if (!state.currentPiece) {
        return
    }

    const newX = state.currentPiece.x + dx
    const newY = state.currentPiece.y + dy

    if (
        !checkCollision(
            newX,
            newY,
            state.currentPiece.shape,
            state.board,
            GAME_CONSTANTS
        )
    ) {
        state.currentPiece.x = newX
        state.currentPiece.y = newY
        state.needsRedraw = true
    } else if (dy > 0) {
        // Piece hit bottom or another piece
        handlePiecePlacement(state)
    }
}

export function rotatePiece(state: GameState): void {
    if (!state.currentPiece) {
        return
    }

    const rotated = rotateMatrix(state.currentPiece.shape)

    if (
        !checkCollision(
            state.currentPiece.x,
            state.currentPiece.y,
            rotated,
            state.board,
            GAME_CONSTANTS
        )
    ) {
        state.currentPiece.shape = rotated
        state.needsRedraw = true
    }
}

export function hardDrop(state: GameState): void {
    if (!state.currentPiece) {
        return
    }

    while (
        !checkCollision(
            state.currentPiece.x,
            state.currentPiece.y + 1,
            state.currentPiece.shape,
            state.board,
            GAME_CONSTANTS
        )
    ) {
        state.currentPiece.y++
        state.score += 2 // Bonus points for hard drop
    }
    handlePiecePlacement(state)
}

function handlePiecePlacement(state: GameState): void {
    if (!state.currentPiece) {
        return
    }

    // Place piece on board
    placePiece(state.currentPiece, state.board, GAME_CONSTANTS)

    // Check for completed lines
    const linesCleared = clearLines(state.board, GAME_CONSTANTS)

    if (linesCleared > 0) {
        state.lines += linesCleared
        updateLevel(state)
        updateScore(state, linesCleared)
        updateStats(state, linesCleared)
    }

    // Spawn next piece
    spawnPiece(state)
}

function updateScore(state: GameState, linesCleared: number): void {
    const baseScore = [0, 40, 100, 300, 1200][linesCleared]
    state.score += baseScore * state.level
}

function updateStats(state: GameState, linesCleared: number): void {
    switch (linesCleared) {
        case 1:
            state.stats.singles++
            break
        case 2:
            state.stats.doubles++
            break
        case 3:
            state.stats.triples++
            break
        case 4:
            state.stats.tetrises++
            break
    }
}

function updateLevel(state: GameState): void {
    const newLevel = Math.floor(state.lines / 10) + 1
    if (newLevel > state.level) {
        state.level = newLevel
        state.dropInterval = Math.max(50, 1000 - (state.level - 1) * 50)
    }
}

export function startGame(state: GameState, gameLoopFn: () => void): void {
    if (!state.gameStarted) {
        state.gameStarted = true
        spawnPiece(state)
        gameLoopFn()

        const startBtn = document.getElementById('start-btn')
        if (startBtn) {
            startBtn.textContent = 'Playing...'
            ;(startBtn as HTMLButtonElement).disabled = true
        }
    }
}

export function togglePause(state: GameState, gameLoopFn: () => void): void {
    if (!state.gameStarted || state.gameOver) {
        return
    }

    state.paused = !state.paused
    const pauseBtn = document.getElementById('pause-btn')
    if (pauseBtn) {
        pauseBtn.textContent = state.paused ? 'Resume' : 'Pause'
    }

    if (!state.paused) {
        gameLoopFn()
    }
}

export function resetGame(
    state: GameState,
    updateNextPieceDisplay: () => void
): void {
    state.board = Array(GAME_CONSTANTS.BOARD_HEIGHT)
        .fill(null)
        .map(() => Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null))
    state.currentPiece = null
    state.score = 0
    state.level = 1
    state.lines = 0
    state.gameOver = false
    state.paused = false
    state.gameStarted = false
    state.stats = {
        pieces: 0,
        singles: 0,
        doubles: 0,
        triples: 0,
        tetrises: 0,
    }
    state.dropInterval = 1000
    state.needsRedraw = true

    state.nextPiece = generateNextPiece()
    updateNextPieceDisplay()
    updateUI(state)

    const gameOverOverlay = document.getElementById('game-over-overlay')
    if (gameOverOverlay) {
        gameOverOverlay.classList.add('hidden')
    }

    const startBtn = document.getElementById('start-btn')
    if (startBtn) {
        startBtn.textContent = 'Start'
        ;(startBtn as HTMLButtonElement).disabled = false
    }

    const pauseBtn = document.getElementById('pause-btn')
    if (pauseBtn) {
        pauseBtn.textContent = 'Pause'
    }
}

export async function endGame(state: GameState): Promise<void> {
    state.gameOver = true
    state.gameStarted = false

    const finalScoreElement = document.getElementById('final-score')
    if (finalScoreElement) {
        finalScoreElement.textContent = state.score.toString()
    }

    const gameOverOverlay = document.getElementById('game-over-overlay')
    if (gameOverOverlay) {
        gameOverOverlay.classList.remove('hidden')
    }

    console.log('Game Over! Final Score:', state.score)

    // Submit score to server
    if (state.score > 0) {
        try {
            const response = await fetch('/api/scores', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    gameId: 'tetris',
                    score: state.score,
                }),
            })

            if (response.ok) {
                const result = await response.json()
                console.log('Score submitted successfully')

                // Handle newly earned achievements
                if (
                    result.newAchievements &&
                    result.newAchievements.length > 0
                ) {
                    console.log(
                        'New achievements earned:',
                        result.newAchievements
                    )

                    // Dispatch an event for achievement notifications
                    window.dispatchEvent(
                        new CustomEvent('achievementsEarned', {
                            detail: { achievementIds: result.newAchievements },
                        })
                    )
                }
            } else {
                console.error('Failed to submit score')
            }
        } catch (error) {
            console.error('Error submitting score:', error)
        }
    }
}

export function gameLoop(state: GameState): void {
    if (state.gameOver || state.paused || !state.gameStarted) {
        return
    }

    const now = Date.now()
    if (now - state.dropTime > state.dropInterval) {
        movePiece(state, 0, 1)
        state.dropTime = now
    }

    updateUI(state)
    requestAnimationFrame(() => gameLoop(state))
}

export function updateUI(state: GameState): void {
    const scoreElement = document.getElementById('score')
    const levelElement = document.getElementById('level')
    const linesElement = document.getElementById('lines')
    const piecesElement = document.getElementById('pieces-count')
    const singlesElement = document.getElementById('singles-count')
    const doublesElement = document.getElementById('doubles-count')
    const triplesElement = document.getElementById('triples-count')
    const tetrisesElement = document.getElementById('tetrises-count')

    if (scoreElement) {
        scoreElement.textContent = state.score.toString()
    }
    if (levelElement) {
        levelElement.textContent = state.level.toString()
    }
    if (linesElement) {
        linesElement.textContent = state.lines.toString()
    }
    if (piecesElement) {
        piecesElement.textContent = state.stats.pieces.toString()
    }
    if (singlesElement) {
        singlesElement.textContent = state.stats.singles.toString()
    }
    if (doublesElement) {
        doublesElement.textContent = state.stats.doubles.toString()
    }
    if (triplesElement) {
        triplesElement.textContent = state.stats.triples.toString()
    }
    if (tetrisesElement) {
        tetrisesElement.textContent = state.stats.tetrises.toString()
    }
}

export function updateNextPieceDisplay(
    state: GameState,
    nextCtx: CanvasRenderingContext2D,
    nextCanvas: HTMLCanvasElement
): void {
    drawNextPiece(state.nextPiece, nextCtx, nextCanvas)
}

export { draw }
