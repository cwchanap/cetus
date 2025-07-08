// Physics and collision detection for Bubble Shooter
import type { GameState, GameConstants, GridPosition } from './types'
import { getBubbleX, getBubbleY, getNeighbors } from './utils'

export function updateProjectile(
    state: GameState,
    constants: GameConstants
): void {
    if (!state.projectile) {
        return
    }

    const oldX = state.projectile.x
    const oldY = state.projectile.y

    state.projectile.x += state.projectile.vx
    state.projectile.y += state.projectile.vy

    // Wall collisions
    if (
        state.projectile.x <= constants.BUBBLE_RADIUS ||
        state.projectile.x >= constants.GAME_WIDTH - constants.BUBBLE_RADIUS
    ) {
        state.projectile.vx *= -1
    }

    // Only redraw if projectile actually moved
    if (
        Math.abs(oldX - state.projectile.x) > 0.1 ||
        Math.abs(oldY - state.projectile.y) > 0.1
    ) {
        state.needsRedraw = true
    }

    // Check collision with grid bubbles or top
    const bubbleCollision = checkBubbleCollision(state, constants)
    if (state.projectile.y <= constants.BUBBLE_RADIUS || bubbleCollision) {
        attachBubble(state, constants)
    }
}

export function checkBubbleCollision(
    state: GameState,
    constants: GameConstants
): GridPosition | null {
    if (!state.projectile) {
        return null
    }

    for (let row = 0; row < state.grid.length; row++) {
        if (!state.grid[row]) {
            continue
        }
        for (let col = 0; col < state.grid[row].length; col++) {
            const bubble = state.grid[row][col]
            if (!bubble) {
                continue
            }

            const distance = Math.sqrt(
                Math.pow(state.projectile.x - bubble.x, 2) +
                    Math.pow(state.projectile.y - bubble.y, 2)
            )

            if (distance < constants.BUBBLE_RADIUS * 2) {
                return { row, col }
            }
        }
    }
    return null
}

export function attachBubble(state: GameState, constants: GameConstants): void {
    if (!state.projectile) {
        return
    }

    // Find the best position to attach the projectile
    const attachPos = findAttachPosition(state, constants)

    if (attachPos) {
        state.grid[attachPos.row][attachPos.col] = {
            color: state.projectile.color,
            x: getBubbleX(attachPos.col, attachPos.row, constants),
            y: getBubbleY(attachPos.row, state.rowOffset, constants),
        }
        state.bubblesRemaining++

        // Check for matches
        checkMatches(state, constants, attachPos.row, attachPos.col)

        // Increment shot count and add new row every 5 shots
        state.shotCount++
        if (state.shotCount % 5 === 0) {
            addNewRow(state, constants)
        }
    }

    // Check for game over condition after every bubble attachment
    if (checkGameOverCondition(state, constants)) {
        console.log('Setting game over from attachBubble')
        state.gameOver = true
        state.gameStarted = false
        state.needsRedraw = true
    }

    state.projectile = null
    state.needsRedraw = true
}

function findAttachPosition(
    state: GameState,
    constants: GameConstants
): GridPosition | null {
    if (!state.projectile) {
        return null
    }

    let bestPosition: GridPosition | null = null
    let minDistance = Infinity

    // Find the closest valid position
    for (let row = 0; row < constants.GRID_HEIGHT; row++) {
        const cols = constants.GRID_WIDTH - (row % 2)
        for (let col = 0; col < cols; col++) {
            if (!state.grid[row]) {
                state.grid[row] = []
            }

            // Only consider empty positions
            if (!state.grid[row][col]) {
                const x = getBubbleX(col, row, constants)
                const y = getBubbleY(row, state.rowOffset, constants)
                const distance = Math.sqrt(
                    Math.pow(state.projectile.x - x, 2) +
                        Math.pow(state.projectile.y - y, 2)
                )

                // Check if this position is adjacent to existing bubbles or at top edge
                if (
                    isValidAttachPosition(state, constants, row, col) &&
                    distance < minDistance
                ) {
                    minDistance = distance
                    bestPosition = { row, col }
                }
            }
        }
    }

    // If no valid position found, attach to top center
    return (
        bestPosition || {
            row: 0,
            col: Math.floor((constants.GRID_WIDTH - (0 % 2)) / 2),
        }
    )
}

function isValidAttachPosition(
    state: GameState,
    constants: GameConstants,
    row: number,
    col: number
): boolean {
    // Top row is always valid
    if (row === 0) {
        return true
    }

    // Check if adjacent to existing bubble
    const neighbors = getNeighbors(row, col, constants)
    return neighbors.some(({ row: nRow, col: nCol }) => {
        return state.grid[nRow] && state.grid[nRow][nCol]
    })
}

function checkMatches(
    state: GameState,
    constants: GameConstants,
    startRow: number,
    startCol: number
): void {
    const bubble = state.grid[startRow][startCol]
    if (!bubble) {
        return
    }

    const color = bubble.color
    const visited = new Set<string>()
    const matches: GridPosition[] = []

    const dfs = (row: number, col: number): void => {
        const key = `${row},${col}`
        if (visited.has(key)) {
            return
        }
        if (!state.grid[row] || !state.grid[row][col]) {
            return
        }
        if (state.grid[row][col]?.color !== color) {
            return
        }

        visited.add(key)
        matches.push({ row, col })

        // Check neighbors in hexagonal grid
        const neighbors = getNeighbors(row, col, constants)
        neighbors.forEach(({ row: nRow, col: nCol }) => {
            dfs(nRow, nCol)
        })
    }

    dfs(startRow, startCol)

    if (matches.length >= 3) {
        removeBubbles(state, matches)
        state.score += matches.length * 10
        state.bubblesRemaining -= matches.length
        state.needsRedraw = true
    }

    if (state.bubblesRemaining === 0) {
        state.score += 1000 // Bonus for clearing all bubbles
        state.needsRedraw = true
        // Generate new level would go here
    }
}

function removeBubbles(state: GameState, bubbles: GridPosition[]): void {
    bubbles.forEach(({ row, col }) => {
        state.grid[row][col] = null
    })
}

function addNewRow(state: GameState, constants: GameConstants): void {
    // Add a new row at the top instead of shifting down
    addRowAtTop(state, constants)

    // Check if any bubble reached the danger zone (near shooter)
    if (checkGameOverCondition(state, constants)) {
        console.log('Setting game over from addNewRow')
        state.gameOver = true
        state.gameStarted = false
        state.needsRedraw = true
    }
}

function addRowAtTop(state: GameState, constants: GameConstants): void {
    // Shift existing bubbles down by creating new top row
    for (let row = constants.GRID_HEIGHT - 1; row > 0; row--) {
        state.grid[row] = state.grid[row - 1] ? [...state.grid[row - 1]] : []

        // Update Y positions for existing bubbles
        if (state.grid[row]) {
            for (let col = 0; col < state.grid[row].length; col++) {
                if (state.grid[row][col]) {
                    const bubble = state.grid[row][col]
                    if (bubble) {
                        bubble.y = getBubbleY(row, state.rowOffset, constants)
                    }
                }
            }
        }
    }

    // Create new top row
    state.grid[0] = []
    const cols = constants.GRID_WIDTH - (0 % 2) // Top row is even
    for (let col = 0; col < cols; col++) {
        if (Math.random() < 0.6) {
            // 60% chance for bubble
            state.grid[0][col] = {
                color: constants.COLORS[
                    Math.floor(Math.random() * constants.COLORS.length)
                ],
                x: getBubbleX(col, 0, constants),
                y: getBubbleY(0, state.rowOffset, constants),
            }
            state.bubblesRemaining++
        } else {
            state.grid[0][col] = null
        }
    }

    state.needsRedraw = true
}

function checkGameOverCondition(
    state: GameState,
    constants: GameConstants
): boolean {
    // Check if any bubble is too close to the shooter
    // Make the danger zone more generous - allow 5 bubble radii of space above shooter
    const dangerZone = constants.SHOOTER_Y - constants.BUBBLE_RADIUS * 5

    for (let row = 0; row < constants.GRID_HEIGHT; row++) {
        if (state.grid[row]) {
            for (let col = 0; col < state.grid[row].length; col++) {
                const bubble = state.grid[row][col]
                if (bubble && bubble.y >= dangerZone) {
                    console.log(
                        `Game Over! Bubble at row ${row}, col ${col} reached danger zone. Y: ${bubble.y}, Danger Zone: ${dangerZone}`
                    )
                    return true
                }
            }
        }
    }
    return false
}
