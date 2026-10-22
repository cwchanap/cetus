// 2048 game implementation using BaseGame framework
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks, ScoringConfig } from '@/lib/games/core/types'
import { GameID } from '@cetus/shared/games'
import {
    GAME_CONSTANTS,
    type Board,
    type Tile,
    type Position,
    type Direction,
    type Animation,
    type MoveResult,
} from './types'
import type {
    Game2048State,
    Game2048Config,
    Game2048Stats,
} from './frameworkTypes'
import {
    createEmptyBoard,
    cloneBoard,
    getRandomEmptyPosition,
    getNewTileValue,
    canMove,
    getMaxTile,
} from './utils'

// Default configuration for the 2048 game
export const DEFAULT_GAME2048_CONFIG: Game2048Config = {
    // BaseGameConfig — 2048 is turn-based and runs until no moves remain, so
    // the countdown timer is given an effectively infinite duration.
    duration: Number.MAX_SAFE_INTEGER,
    pausable: true,
    resettable: true,
    // Game2048Config (rendering + input)
    tileSize: GAME_CONSTANTS.TILE_SIZE,
    gap: GAME_CONSTANTS.GAP,
    gameWidth: 410,
    gameHeight: 410,
    animationDuration: GAME_CONSTANTS.ANIMATION_DURATION,
    swipeThreshold: GAME_CONSTANTS.SWIPE_THRESHOLD,
    backgroundColor: 0x070b16,
    boardBgColor: 0x070b16,
    cellColor: 0x0b1020,
    undos: 1,
}

export class Game2048 extends BaseGame<
    Game2048State,
    Game2048Config,
    Game2048Stats
> {
    private history: Array<{ state: Game2048State; points: number }> = []

    constructor(
        config: Partial<Game2048Config> = {},
        callbacks: BaseGameCallbacks = {},
        scoringConfig?: ScoringConfig
    ) {
        const fullConfig: Game2048Config = {
            ...DEFAULT_GAME2048_CONFIG,
            ...config,
        }
        super(
            GameID.GAME_2048,
            fullConfig,
            callbacks,
            scoringConfig ?? {
                basePoints: 0,
                timeBonus: false,
            }
        )
    }

    createInitialState(): Game2048State {
        return {
            // BaseGameState fields
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            // Game2048State fields
            board: createEmptyBoard(),
            maxTile: 0,
            moveCount: 0,
            mergeCount: 0,
            won: false,
            lastMoveAnimations: [],
            tileIdCounter: 0,
            needsRedraw: true,
            undosLeft: this.config.undos,
            undosUsed: 0,
            stuck: false,
        }
    }

    protected onGameStart(): void {
        this.history = []
        // Spawn the initial tiles
        for (let i = 0; i < GAME_CONSTANTS.INITIAL_TILES; i++) {
            const spawn = this.spawnTile(
                this.state.board,
                this.state.tileIdCounter
            )
            this.state.board = spawn.board
            this.state.tileIdCounter = spawn.nextCounter
        }
        this.state.maxTile = getMaxTile(this.state.board)
        this.state.needsRedraw = true
        this.emitStateChange()
    }

    protected onGameReset(): void {
        this.history = []
        this.emitStateChange()
    }

    update(_deltaTime: number): void {
        // 2048 is turn-based; game logic is driven by move()
    }

    render(): void {
        // Rendering is handled by the renderer
    }

    cleanup(): void {
        // No internal loops to tear down
    }

    override async end(): Promise<void> {
        if (!this.state.isActive) {
            return
        }
        // BaseGame freezes the run before awaiting persistence. Publish that
        // state now so the player can see results and restart during the save.
        const saving = super.end()
        this.emitStateChange()
        await saving
    }

    getGameStats(): Game2048Stats {
        const timerStatus = this.getTimerStatus()
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timerStatus.elapsedTime || 0),
            gameCompleted: this.state.isGameOver,
            maxTile: this.state.maxTile,
            moveCount: this.state.moveCount,
            mergeCount: this.state.mergeCount,
            won: this.state.won,
            undosUsed: this.state.undosUsed,
        }
    }

    protected getGameData(): Record<string, unknown> {
        return {
            maxTile: this.state.maxTile,
            moves: this.state.moveCount,
            merges: this.state.mergeCount,
            undosUsed: this.state.undosUsed,
        }
    }

    // --- Public 2048-specific API ---

    /**
     * Process a slide in the given direction.
     * Returns the MoveResult (board, moved, scoreGained, mergeCount, animations).
     */
    move(direction: Direction): MoveResult {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver
        ) {
            return {
                board: this.state.board,
                moved: false,
                scoreGained: 0,
                mergeCount: 0,
                animations: [],
            }
        }

        const result = this.computeMove(this.state.board, direction)
        if (!result.moved) {
            return result
        }

        if (this.state.undosLeft > 0) {
            this.history.push({
                state: { ...this.state, board: cloneBoard(this.state.board) },
                points: result.scoreGained,
            })
            this.history = this.history.slice(-this.state.undosLeft)
        }

        // Apply the slid/merged board
        this.state.board = result.board

        // Award merge score
        if (result.scoreGained > 0) {
            this.addScore(result.scoreGained, 'merge')
        }

        this.state.moveCount++
        this.state.mergeCount += result.mergeCount

        // Spawn a new tile
        const spawn = this.spawnTile(this.state.board, this.state.tileIdCounter)
        this.state.board = spawn.board
        this.state.tileIdCounter = spawn.nextCounter
        if (spawn.animation) {
            result.animations.push(spawn.animation)
        }
        // Keep the returned board in sync with the post-spawn state so
        // callers (renderer/init) see the final board, not the pre-spawn one.
        result.board = this.state.board

        // Update max tile — a run-wide peak, so an undo that lowered the
        // board's max cannot reduce it on the next move.
        this.state.maxTile = Math.max(
            this.state.maxTile,
            getMaxTile(this.state.board)
        )

        this.state.lastMoveAnimations = result.animations
        this.state.needsRedraw = true

        // Check for win (player may continue after reaching 2048). The
        // framework's state-change event lets the initializer detect the
        // false -> true transition and show a notification.
        if (!this.state.won && this.state.maxTile >= GAME_CONSTANTS.WIN_TILE) {
            this.state.won = true
        }

        this.state.stuck = !canMove(this.state.board)
        this.emitStateChange()

        // Check for game over (no moves remaining)
        if (this.state.stuck && !this.canUndo() && !this.state.isPaused) {
            this.end().catch((err: unknown) =>
                console.error('Game2048 end failed', err)
            )
        }

        return result
    }

    getConfig(): Game2048Config {
        return { ...this.config }
    }

    setUndos(undos: number): void {
        if ([0, 1, 3].includes(undos)) {
            this.config.undos = undos
        }
    }

    canUndo(): boolean {
        return (
            this.state.isActive &&
            !this.state.isGameOver &&
            this.state.undosLeft > 0 &&
            this.history.length > 0
        )
    }

    undo(): boolean {
        if (!this.canUndo() || this.state.isPaused) {
            return false
        }
        const previous = this.history.pop()!
        // won and maxTile are intentionally not restored: both are permanent
        // for the run — undoing past the win cannot re-trigger the win flow,
        // and undoing past a milestone tile cannot lower the reported peak
        // used by getGameData()/getGameStats() for tile achievements.
        const { board, moveCount, mergeCount, tileIdCounter } = previous.state
        Object.assign(this.state, {
            board,
            moveCount,
            mergeCount,
            tileIdCounter,
            stuck: false,
            lastMoveAnimations: [],
            needsRedraw: true,
        })
        this.state.undosLeft--
        this.state.undosUsed++
        this.subtractScore(previous.points, 'undo')
        this.emitStateChange()
        return true
    }

    legalDirections(): Direction[] {
        return (['left', 'right', 'up', 'down'] as const).filter(
            direction => this.computeMove(this.state.board, direction).moved
        )
    }

    getBoard(): Board {
        return this.state.board
    }

    markRendered(): void {
        this.state.needsRedraw = false
    }

    // --- Private game logic ---

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }

    /**
     * Spawn a single tile on the board.
     */
    private spawnTile(
        board: Board,
        tileIdCounter: number
    ): { board: Board; animation: Animation | null; nextCounter: number } {
        const position = getRandomEmptyPosition(board)
        if (!position) {
            return { board, animation: null, nextCounter: tileIdCounter }
        }

        const tileId = `tile-${tileIdCounter}`
        const value = getNewTileValue()
        const tile: Tile = {
            id: tileId,
            value,
            position,
            isNew: true,
        }

        const newBoard = cloneBoard(board)
        newBoard[position.row][position.col] = tile

        const animation: Animation = {
            type: 'spawn',
            tileId,
            to: position,
            value,
        }

        return { board: newBoard, animation, nextCounter: tileIdCounter + 1 }
    }

    private getTraversalVectors(direction: Direction): {
        rowVector: number[]
        colVector: number[]
    } {
        const size = GAME_CONSTANTS.BOARD_SIZE
        const forward = Array.from({ length: size }, (_, i) => i)
        const backward = Array.from({ length: size }, (_, i) => size - 1 - i)

        switch (direction) {
            case 'up':
                return { rowVector: forward, colVector: forward }
            case 'down':
                return { rowVector: backward, colVector: forward }
            case 'left':
                return { rowVector: forward, colVector: forward }
            case 'right':
                return { rowVector: forward, colVector: backward }
        }
    }

    private getMoveDelta(direction: Direction): {
        dRow: number
        dCol: number
    } {
        switch (direction) {
            case 'up':
                return { dRow: -1, dCol: 0 }
            case 'down':
                return { dRow: 1, dCol: 0 }
            case 'left':
                return { dRow: 0, dCol: -1 }
            case 'right':
                return { dRow: 0, dCol: 1 }
        }
    }

    private findFarthestPosition(
        board: Board,
        position: Position,
        delta: { dRow: number; dCol: number }
    ): { farthest: Position; next: Tile | null } {
        const size = GAME_CONSTANTS.BOARD_SIZE
        let current = position
        let next: Tile | null = null

        do {
            const newRow = current.row + delta.dRow
            const newCol = current.col + delta.dCol

            if (newRow < 0 || newRow >= size || newCol < 0 || newCol >= size) {
                break
            }

            next = board[newRow][newCol]
            if (next === null) {
                current = { row: newRow, col: newCol }
            }
        } while (next === null)

        return { farthest: current, next }
    }

    /**
     * Compute the result of sliding all tiles in the given direction.
     * Pure function over the provided board (does not mutate game state).
     */
    private computeMove(board: Board, direction: Direction): MoveResult {
        const size = GAME_CONSTANTS.BOARD_SIZE
        const { rowVector, colVector } = this.getTraversalVectors(direction)
        const delta = this.getMoveDelta(direction)
        const newBoard = createEmptyBoard()
        const animations: Animation[] = []
        let scoreGained = 0
        let mergeCount = 0
        let moved = false

        // Track which positions have already merged this move (once-per-tile rule)
        const merged: boolean[][] = Array.from({ length: size }, () =>
            Array(size).fill(false)
        )

        const normalizeTile = (tile: Tile, position: Position): Tile => ({
            ...tile,
            position: { ...position },
            isNew: false,
            mergedFrom: undefined,
        })

        for (const row of rowVector) {
            for (const col of colVector) {
                const tile = board[row][col]
                if (!tile) {
                    continue
                }

                const originalPosition = { row, col }
                const { farthest, next } = this.findFarthestPosition(
                    newBoard,
                    originalPosition,
                    delta
                )

                // Merge with a matching, not-yet-merged neighbour
                if (
                    next &&
                    next.value === tile.value &&
                    !merged[farthest.row + delta.dRow][
                        farthest.col + delta.dCol
                    ]
                ) {
                    const mergePosition = {
                        row: farthest.row + delta.dRow,
                        col: farthest.col + delta.dCol,
                    }
                    const mergedValue = tile.value * 2

                    const sourceTile = normalizeTile(tile, originalPosition)
                    const targetTile = normalizeTile(next, mergePosition)

                    const mergedTile: Tile = {
                        id: tile.id,
                        value: mergedValue,
                        position: { ...mergePosition },
                        mergedFrom: [sourceTile, targetTile],
                        isNew: false,
                    }

                    newBoard[mergePosition.row][mergePosition.col] = mergedTile
                    merged[mergePosition.row][mergePosition.col] = true

                    scoreGained += mergedValue
                    mergeCount++
                    moved = true

                    animations.push({
                        type: 'move',
                        tileId: tile.id,
                        from: originalPosition,
                        to: mergePosition,
                    })
                    animations.push({
                        type: 'merge',
                        tileId: tile.id,
                        to: mergePosition,
                        value: mergedValue,
                    })
                } else {
                    // Just slide the tile
                    const newTile = normalizeTile(tile, farthest)
                    newBoard[farthest.row][farthest.col] = newTile

                    if (farthest.row !== row || farthest.col !== col) {
                        moved = true
                        animations.push({
                            type: 'move',
                            tileId: tile.id,
                            from: originalPosition,
                            to: farthest,
                        })
                    }
                }
            }
        }

        return {
            board: newBoard,
            moved,
            scoreGained,
            mergeCount,
            animations,
        }
    }
}

export default Game2048
