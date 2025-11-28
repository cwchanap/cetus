// 2048 Game Core Logic

import {
    type Board,
    type Direction,
    type GameState,
    type MoveResult,
    type Animation,
    type Tile,
    type GameStats,
    type GameCallbacks,
    GAME_CONSTANTS,
} from './types'
import {
    createEmptyBoard,
    getRandomEmptyPosition,
    getNewTileValue,
    generateTileId,
    canMove,
    getMaxTile,
    cloneBoard,
} from './utils'

/**
 * Create initial game state
 */
export function createGameState(): GameState {
    return {
        board: createEmptyBoard(),
        score: 0,
        gameStarted: false,
        gameOver: false,
        won: false,
        moveCount: 0,
        maxTile: 0,
        lastMoveAnimations: [],
        tileIdCounter: 0,
    }
}

/**
 * Spawn a new tile on the board
 * Returns updated state and animation info
 */
export function spawnTile(state: GameState): {
    state: GameState
    animation: Animation | null
} {
    const position = getRandomEmptyPosition(state.board)
    if (!position) {
        return { state, animation: null }
    }

    const tileId = generateTileId(state)
    const value = getNewTileValue()

    const tile: Tile = {
        id: tileId,
        value,
        position,
        isNew: true,
    }

    const newBoard = cloneBoard(state.board)
    newBoard[position.row][position.col] = tile

    const animation: Animation = {
        type: 'spawn',
        tileId,
        to: position,
        value,
    }

    return {
        state: {
            ...state,
            board: newBoard,
            tileIdCounter: state.tileIdCounter + 1,
            maxTile: Math.max(state.maxTile, value),
        },
        animation,
    }
}

/**
 * Get the traversal indices for a direction
 */
function getTraversalVectors(direction: Direction): {
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

/**
 * Get the delta for movement based on direction
 */
function getMoveDelta(direction: Direction): { dRow: number; dCol: number } {
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

/**
 * Find the farthest position a tile can move to in a direction
 */
function findFarthestPosition(
    board: Board,
    position: { row: number; col: number },
    delta: { dRow: number; dCol: number }
): { farthest: { row: number; col: number }; next: Tile | null } {
    const size = GAME_CONSTANTS.BOARD_SIZE
    let current = position
    let next: Tile | null = null

    do {
        const newRow = current.row + delta.dRow
        const newCol = current.col + delta.dCol

        // Check bounds
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
 * Process a move in the given direction
 */
export function move(state: GameState, direction: Direction): MoveResult {
    if (state.gameOver || !state.gameStarted) {
        return {
            board: state.board,
            moved: false,
            scoreGained: 0,
            mergeCount: 0,
            animations: [],
        }
    }

    const { rowVector, colVector } = getTraversalVectors(direction)
    const delta = getMoveDelta(direction)
    const newBoard = createEmptyBoard()
    const animations: Animation[] = []
    let scoreGained = 0
    let mergeCount = 0
    let moved = false

    // Track which positions have been merged to (for once-per-move rule)
    const merged: boolean[][] = Array.from(
        { length: GAME_CONSTANTS.BOARD_SIZE },
        () => Array(GAME_CONSTANTS.BOARD_SIZE).fill(false)
    )

    const normalizeTile = (
        tile: Tile,
        position: { row: number; col: number }
    ): Tile => ({
        ...tile,
        position: { ...position },
        isNew: false,
        mergedFrom: undefined,
    })

    // Process each cell in traversal order
    for (const row of rowVector) {
        for (const col of colVector) {
            const tile = state.board[row][col]
            if (!tile) {
                continue
            }

            const originalPosition = { row, col }
            const { farthest, next } = findFarthestPosition(
                newBoard,
                originalPosition,
                delta
            )

            // Check if we can merge with the next tile
            if (
                next &&
                next.value === tile.value &&
                !merged[farthest.row + delta.dRow][farthest.col + delta.dCol]
            ) {
                // Merge tiles
                const mergePosition = {
                    row: farthest.row + delta.dRow,
                    col: farthest.col + delta.dCol,
                }
                const mergedValue = tile.value * 2

                const sourceTile = normalizeTile(tile, originalPosition)
                const targetTile = normalizeTile(next, mergePosition)

                const mergedTile: Tile = {
                    id: tile.id, // Keep the moving tile's ID
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

                // Add merge animation
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
                // Just move tile
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

/**
 * Start a new game
 */
export function startGame(_state: GameState): GameState {
    let newState = createGameState()
    newState.gameStarted = true

    // Spawn initial tiles
    for (let i = 0; i < GAME_CONSTANTS.INITIAL_TILES; i++) {
        const result = spawnTile(newState)
        newState = result.state
    }

    return newState
}

/**
 * Reset the game to initial state
 */
export function resetGame(_state: GameState): GameState {
    return createGameState()
}

/**
 * Check if game is over (no valid moves remaining)
 */
export function checkGameOver(state: GameState): boolean {
    return !canMove(state.board)
}

/**
 * Check if player has won (reached 2048 tile)
 */
export function checkWin(state: GameState): boolean {
    return getMaxTile(state.board) >= GAME_CONSTANTS.WIN_TILE
}

/**
 * End the game and calculate final stats
 */
export function endGame(
    state: GameState,
    totalMerges: number
): { state: GameState; stats: GameStats } {
    const stats: GameStats = {
        finalScore: state.score,
        maxTile: state.maxTile,
        moveCount: state.moveCount,
        mergeCount: totalMerges,
        gameWon: state.won,
    }

    return {
        state: {
            ...state,
            gameOver: true,
        },
        stats,
    }
}

/**
 * Process a complete game move with all side effects
 * Returns the new state and any callbacks to invoke
 */
export function processMove(
    state: GameState,
    direction: Direction,
    totalMerges: number,
    callbacks?: GameCallbacks
): {
    state: GameState
    totalMerges: number
    callbacksToInvoke: Array<() => void>
} {
    const result = move(state, direction)
    const callbacksToInvoke: Array<() => void> = []

    if (!result.moved) {
        return { state, totalMerges, callbacksToInvoke }
    }

    let newState: GameState = {
        ...state,
        board: result.board,
        score: state.score + result.scoreGained,
        moveCount: state.moveCount + 1,
        lastMoveAnimations: result.animations,
    }

    // Update total merges
    const newTotalMerges = totalMerges + result.mergeCount

    // Spawn new tile
    const spawnResult = spawnTile(newState)
    newState = spawnResult.state
    if (spawnResult.animation) {
        newState.lastMoveAnimations.push(spawnResult.animation)
    }

    // Update max tile
    newState.maxTile = getMaxTile(newState.board)

    // Check for win
    if (!newState.won && checkWin(newState)) {
        newState.won = true
        if (callbacks?.onWin) {
            callbacksToInvoke.push(() => callbacks.onWin!())
        }
    }

    // Check for game over
    if (checkGameOver(newState)) {
        const { state: endedState, stats } = endGame(newState, newTotalMerges)
        newState = endedState
        if (callbacks?.onGameOver) {
            callbacksToInvoke.push(() =>
                callbacks.onGameOver!(stats.finalScore, stats)
            )
        }
    }

    // Notify score change
    if (callbacks?.onScoreChange && result.scoreGained > 0) {
        callbacksToInvoke.push(() => callbacks.onScoreChange!(newState.score))
    }

    // Notify move
    if (callbacks?.onMove) {
        callbacksToInvoke.push(() => callbacks.onMove!(result))
    }

    return { state: newState, totalMerges: newTotalMerges, callbacksToInvoke }
}
