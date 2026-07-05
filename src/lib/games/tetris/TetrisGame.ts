// Tetris game implementation using BaseGame framework
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks, ScoringConfig } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import type {
    TetrisState,
    TetrisConfig,
    TetrisStats,
    Piece,
    GameConstants,
} from './types'
import { rotateMatrix, checkCollision, placePiece, clearLines } from './utils'
import { hexToPixiColor } from '@/lib/games/shared/types'
import {
    create2DArray,
    randomElement,
    deepClone,
} from '@/lib/games/shared/utils'

// Static piece definitions and board dimensions (single source of truth).
// Re-exported for util/tests that still rely on the legacy constants shape.
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

// Default configuration for Tetris game
export const DEFAULT_TETRIS_CONFIG: TetrisConfig = {
    // BaseGameConfig — Tetris runs until the board fills, so the countdown
    // timer is given an effectively infinite duration and never completes.
    duration: Number.MAX_SAFE_INTEGER,
    achievementIntegration: true,
    pausable: true,
    resettable: true,
    // TetrisConfig
    boardWidth: GAME_CONSTANTS.BOARD_WIDTH,
    boardHeight: GAME_CONSTANTS.BOARD_HEIGHT,
    blockSize: GAME_CONSTANTS.BLOCK_SIZE,
    gameWidth: GAME_CONSTANTS.GAME_WIDTH,
    gameHeight: GAME_CONSTANTS.GAME_HEIGHT,
    nextCanvasSize: GAME_CONSTANTS.NEXT_CANVAS_SIZE,
    startingLevel: 1,
    baseDropInterval: 1000,
    pieces: GAME_CONSTANTS.PIECES,
    pieceTypes: GAME_CONSTANTS.PIECE_TYPES,
    colors: GAME_CONSTANTS.COLORS,
    backgroundColor: 0x000000,
    gridColor: 0x333333,
}

// Points awarded per number of simultaneously cleared lines (index = lines)
const LINE_CLEAR_BASE_SCORE = [0, 40, 100, 300, 1200]

export class TetrisGame extends BaseGame<
    TetrisState,
    TetrisConfig,
    TetrisStats
> {
    constructor(
        config: Partial<TetrisConfig> = {},
        callbacks: BaseGameCallbacks = {},
        scoringConfig?: ScoringConfig
    ) {
        const fullConfig: TetrisConfig = {
            ...DEFAULT_TETRIS_CONFIG,
            ...config,
        }
        super(
            GameID.TETRIS,
            fullConfig,
            callbacks,
            scoringConfig ?? {
                basePoints: 0,
                timeBonus: false, // Tetris computes its own scores
            }
        )
    }

    createInitialState(): TetrisState {
        return {
            // BaseGameState fields
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            // TetrisState fields
            board: create2DArray(
                this.config.boardHeight,
                this.config.boardWidth,
                null
            ),
            currentPiece: null,
            nextPiece: this.generateNextPiece(),
            level: this.config.startingLevel,
            lines: 0,
            dropTime: 0,
            dropInterval: this.computeDropInterval(this.config.startingLevel),
            stats: {
                pieces: 0,
                singles: 0,
                doubles: 0,
                triples: 0,
                tetrises: 0,
                consecutiveLineClears: 0,
            },
            needsRedraw: true,
        }
    }

    protected onGameStart(): void {
        // Spawn the first piece; the framework render loop drives update().
        this.state.dropTime = Date.now()
        this.spawnPiece()
    }

    protected onGamePause(): void {
        // No internal loop to stop — the framework render loop gates update().
    }

    protected onGameResume(): void {
        // Reset timing to avoid a sudden drop on resume
        this.state.dropTime = Date.now()
    }

    protected onGameEnd(_finalScore: number, _finalStats: TetrisStats): void {
        // No internal loop to stop — the framework render loop gates update().
    }

    protected onGameReset(): void {
        this.emitStateChange()
    }

    update(_deltaTime: number): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver
        ) {
            return
        }

        // Drop the active piece at the configured interval
        const now = Date.now()
        if (now - this.state.dropTime > this.state.dropInterval) {
            this.movePiece(0, 1)
            this.state.dropTime = now
        }

        // Only emit state changes when something actually changed this frame.
        if (this.state.needsRedraw) {
            this.emitStateChange()
        }
    }

    render(): void {
        // Rendering is handled by the renderer
    }

    cleanup(): void {
        // No internal loop to stop — the framework render loop owns the RAF.
    }

    getGameStats(): TetrisStats {
        const timerStatus = this.getTimerStatus()
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timerStatus.elapsedTime || 0),
            gameCompleted: this.state.isGameOver,
            lines: this.state.lines,
            level: this.state.level,
            pieces: this.state.stats.pieces,
            singles: this.state.stats.singles,
            doubles: this.state.stats.doubles,
            triples: this.state.stats.triples,
            tetrises: this.state.stats.tetrises,
            consecutiveLineClears: this.state.stats.consecutiveLineClears,
        }
    }

    protected getGameData(): Record<string, unknown> {
        const stats = this.state.stats
        return {
            doubles: stats.doubles,
            triples: stats.triples,
            tetrises: stats.tetrises,
            consecutiveLineClears: stats.consecutiveLineClears,
            piecesPlaced: stats.pieces,
            level: this.state.level,
            lines: this.state.lines,
        }
    }

    // --- Tetris-specific public API (input handlers) ---

    moveLeft(): void {
        if (!this.state.isActive || this.state.isPaused) {
            return
        }
        this.movePiece(-1, 0)
    }

    moveRight(): void {
        if (!this.state.isActive || this.state.isPaused) {
            return
        }
        this.movePiece(1, 0)
    }

    softDrop(): void {
        if (!this.state.isActive || this.state.isPaused) {
            return
        }
        this.movePiece(0, 1)
        // Reset the auto-drop timer so the piece doesn't immediately drop again
        this.state.dropTime = Date.now()
    }

    rotate(): void {
        if (!this.state.isActive || this.state.isPaused) {
            return
        }
        this.rotatePiece()
    }

    hardDrop(): void {
        if (!this.state.isActive || this.state.isPaused) {
            return
        }
        this.hardDropPiece()
    }

    /**
     * Get config for renderer / external consumers
     */
    getConfig(): TetrisConfig {
        return { ...this.config }
    }

    /**
     * Mark the game as rendered - clears the needsRedraw flag
     */
    markRendered(): void {
        this.state.needsRedraw = false
    }

    // --- Private game logic ---

    private generateNextPiece(): Piece {
        const randomType = randomElement(this.config.pieceTypes)!
        return {
            type: randomType,
            shape: deepClone(this.config.pieces[randomType].shape),
            color: this.config.pieces[randomType].color,
            x: 0,
            y: 0,
        }
    }

    private spawnPiece(): void {
        this.state.currentPiece = this.state.nextPiece
        if (this.state.currentPiece) {
            this.state.currentPiece.x = Math.floor(
                (this.config.boardWidth -
                    this.state.currentPiece.shape[0].length) /
                    2
            )
            this.state.currentPiece.y = 0
        }

        this.state.nextPiece = this.generateNextPiece()
        this.state.stats.pieces++

        // Check for game over — newly spawned piece collides immediately
        if (
            this.state.currentPiece &&
            checkCollision(
                this.state.currentPiece.x,
                this.state.currentPiece.y,
                this.state.currentPiece.shape,
                this.state.board,
                this.getConstantsView()
            )
        ) {
            this.state.needsRedraw = true
            this.end().catch(err => console.error('Tetris end failed', err))
            return
        }

        this.state.needsRedraw = true
    }

    private movePiece(dx: number, dy: number): void {
        if (!this.state.currentPiece) {
            return
        }

        const newX = this.state.currentPiece.x + dx
        const newY = this.state.currentPiece.y + dy

        if (
            !checkCollision(
                newX,
                newY,
                this.state.currentPiece.shape,
                this.state.board,
                this.getConstantsView()
            )
        ) {
            this.state.currentPiece.x = newX
            this.state.currentPiece.y = newY
            this.state.needsRedraw = true
        } else if (dy > 0) {
            // Piece hit the bottom or another piece
            this.handlePiecePlacement()
        }
    }

    private rotatePiece(): void {
        if (!this.state.currentPiece) {
            return
        }

        const rotated = rotateMatrix(this.state.currentPiece.shape)

        if (
            !checkCollision(
                this.state.currentPiece.x,
                this.state.currentPiece.y,
                rotated,
                this.state.board,
                this.getConstantsView()
            )
        ) {
            this.state.currentPiece.shape = rotated
            this.state.needsRedraw = true
        }
    }

    private hardDropPiece(): void {
        if (!this.state.currentPiece) {
            return
        }

        let rowsDropped = 0
        while (
            !checkCollision(
                this.state.currentPiece.x,
                this.state.currentPiece.y + 1,
                this.state.currentPiece.shape,
                this.state.board,
                this.getConstantsView()
            )
        ) {
            this.state.currentPiece.y++
            rowsDropped++
        }
        if (rowsDropped > 0) {
            this.addScore(rowsDropped * 2, 'hard_drop')
        }
        this.handlePiecePlacement()
    }

    private handlePiecePlacement(): void {
        if (!this.state.currentPiece) {
            return
        }

        // Place piece on board
        placePiece(
            this.state.currentPiece,
            this.state.board,
            this.getConstantsView()
        )

        // Check for completed lines
        const linesCleared = clearLines(
            this.state.board,
            this.getConstantsView()
        )

        if (linesCleared > 0) {
            this.state.lines += linesCleared
            this.updateLevel()
            this.applyLineClearScore(linesCleared)
            this.updateStats(linesCleared)
        } else {
            this.state.stats.consecutiveLineClears = 0
        }

        // Spawn next piece
        this.spawnPiece()
    }

    private applyLineClearScore(linesCleared: number): void {
        const baseScore = LINE_CLEAR_BASE_SCORE[linesCleared] ?? 0
        this.addScore(baseScore * this.state.level, 'line_clear')
    }

    private updateStats(linesCleared: number): void {
        if (linesCleared > 0) {
            this.state.stats.consecutiveLineClears++
        }

        switch (linesCleared) {
            case 1:
                this.state.stats.singles++
                break
            case 2:
                this.state.stats.doubles++
                break
            case 3:
                this.state.stats.triples++
                break
            case 4:
                this.state.stats.tetrises++
                break
        }
    }

    private updateLevel(): void {
        const newLevel =
            Math.floor(this.state.lines / 10) + this.config.startingLevel
        if (newLevel > this.state.level) {
            this.state.level = newLevel
            this.state.dropInterval = this.computeDropInterval(this.state.level)
        }
    }

    private computeDropInterval(level: number): number {
        return Math.max(50, this.config.baseDropInterval - (level - 1) * 50)
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }

    // Build a legacy GameConstants view from the active config so the shared
    // util functions (which still take a GameConstants argument) keep working.
    private getConstantsView(): GameConstants {
        return {
            BOARD_WIDTH: this.config.boardWidth,
            BOARD_HEIGHT: this.config.boardHeight,
            BLOCK_SIZE: this.config.blockSize,
            GAME_WIDTH: this.config.gameWidth,
            GAME_HEIGHT: this.config.gameHeight,
            NEXT_CANVAS_SIZE: this.config.nextCanvasSize,
            COLORS: this.config.colors,
            PIECE_TYPES: this.config.pieceTypes,
            PIECES: this.config.pieces,
        }
    }
}

export default TetrisGame
