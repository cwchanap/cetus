import { describe, it, expect } from 'vitest'
import { checkBubbleCollision, updateProjectile, attachBubble } from './physics'
import { getBubbleX, getBubbleY } from './utils'
import type { GameState, GameConstants } from './types'

const constants: GameConstants = {
    BUBBLE_RADIUS: 20,
    GRID_WIDTH: 14,
    GRID_HEIGHT: 20,
    COLORS: [0xff0000, 0x00ff00, 0x0000ff],
    GAME_WIDTH: 600,
    GAME_HEIGHT: 800,
    SHOOTER_Y: 740,
}

function makeState(overrides: Partial<GameState> = {}): GameState {
    return {
        grid: [],
        shooter: { x: 300, y: 740 },
        currentBubble: null,
        nextBubble: null,
        aimAngle: -Math.PI / 2,
        projectile: null,
        score: 0,
        bubblesRemaining: 0,
        gameStarted: true,
        gameOver: false,
        paused: false,
        rowOffset: 0,
        shotCount: 0,
        needsRedraw: false,
        ...overrides,
    }
}

describe('Bubble Shooter Physics', () => {
    describe('checkBubbleCollision', () => {
        it('should return null when there is no projectile', () => {
            const state = makeState({ projectile: null })
            expect(checkBubbleCollision(state, constants)).toBeNull()
        })

        it('should return null when grid is empty', () => {
            const state = makeState({
                projectile: { x: 100, y: 100, vx: 0, vy: -5, color: 0xff0000 },
                grid: [],
            })
            expect(checkBubbleCollision(state, constants)).toBeNull()
        })

        it('should detect collision with a grid bubble', () => {
            const bubbleX = getBubbleX(0, 0, constants)
            const bubbleY = getBubbleY(0, 0, constants)
            const state = makeState({
                projectile: {
                    x: bubbleX + 1,
                    y: bubbleY + 1,
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [[{ color: 0x00ff00, x: bubbleX, y: bubbleY }]],
            })
            const result = checkBubbleCollision(state, constants)
            expect(result).toEqual({ row: 0, col: 0 })
        })

        it('should return null when projectile is far from all bubbles', () => {
            const bubbleX = getBubbleX(0, 0, constants)
            const bubbleY = getBubbleY(0, 0, constants)
            const state = makeState({
                projectile: {
                    x: 500,
                    y: 500,
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [[{ color: 0x00ff00, x: bubbleX, y: bubbleY }]],
            })
            expect(checkBubbleCollision(state, constants)).toBeNull()
        })

        it('should skip null grid cells', () => {
            const state = makeState({
                projectile: { x: 100, y: 100, vx: 0, vy: -5, color: 0xff0000 },
                grid: [[null, null]],
            })
            expect(checkBubbleCollision(state, constants)).toBeNull()
        })
    })

    describe('updateProjectile', () => {
        it('should do nothing if there is no projectile', () => {
            const state = makeState({ projectile: null })
            updateProjectile(state, constants)
            expect(state.needsRedraw).toBe(false)
        })

        it('should move projectile by its velocity', () => {
            const state = makeState({
                projectile: { x: 100, y: 200, vx: 5, vy: -10, color: 0xff0000 },
                grid: [],
            })
            updateProjectile(state, constants)
            expect(state.projectile?.x).toBe(105)
            expect(state.projectile?.y).toBe(190)
        })

        it('should reflect projectile off left wall', () => {
            const state = makeState({
                projectile: {
                    x: constants.BUBBLE_RADIUS - 1,
                    y: 400,
                    vx: -5,
                    vy: -10,
                    color: 0xff0000,
                },
                grid: [],
            })
            updateProjectile(state, constants)
            expect(state.projectile?.vx).toBeGreaterThan(0)
        })

        it('should reflect projectile off right wall', () => {
            const state = makeState({
                projectile: {
                    x: constants.GAME_WIDTH - constants.BUBBLE_RADIUS + 1,
                    y: 400,
                    vx: 5,
                    vy: -10,
                    color: 0xff0000,
                },
                grid: [],
            })
            updateProjectile(state, constants)
            expect(state.projectile?.vx).toBeLessThan(0)
        })

        it('should attach bubble when projectile reaches top', () => {
            const state = makeState({
                projectile: {
                    x: 300,
                    y: constants.BUBBLE_RADIUS - 1,
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [],
            })
            updateProjectile(state, constants)
            // Projectile should be cleared after attaching
            expect(state.projectile).toBeNull()
        })

        it('should mark needsRedraw when projectile moves', () => {
            const state = makeState({
                projectile: { x: 100, y: 400, vx: 5, vy: -10, color: 0xff0000 },
                grid: [],
            })
            updateProjectile(state, constants)
            expect(state.needsRedraw).toBe(true)
        })
    })

    describe('attachBubble', () => {
        it('should do nothing if there is no projectile', () => {
            const state = makeState({ projectile: null })
            const originalGrid = [...state.grid]
            attachBubble(state, constants)
            expect(state.grid).toEqual(originalGrid)
        })

        it('should clear the projectile after attaching', () => {
            const state = makeState({
                projectile: { x: 300, y: 50, vx: 0, vy: -5, color: 0xff0000 },
                grid: [],
            })
            attachBubble(state, constants)
            expect(state.projectile).toBeNull()
        })

        it('should increment shot count after attaching', () => {
            const state = makeState({
                projectile: { x: 300, y: 50, vx: 0, vy: -5, color: 0xff0000 },
                grid: [],
                shotCount: 0,
            })
            attachBubble(state, constants)
            expect(state.shotCount).toBe(1)
        })

        it('should add a new row after every 5 shots', () => {
            const state = makeState({
                projectile: { x: 300, y: 50, vx: 0, vy: -5, color: 0xff0000 },
                grid: [],
                shotCount: 4,
            })
            const initialGridLength = state.grid.length
            attachBubble(state, constants)
            expect(state.shotCount).toBe(5)
            // After 5 shots, a new row should be added to the grid
            expect(state.grid.length).toBeGreaterThan(initialGridLength)
        })

        it('should set needsRedraw after attaching', () => {
            const state = makeState({
                projectile: { x: 300, y: 50, vx: 0, vy: -5, color: 0xff0000 },
                grid: [],
                needsRedraw: false,
            })
            attachBubble(state, constants)
            expect(state.needsRedraw).toBe(true)
        })

        it('should award bonus score when bubblesRemaining reaches zero', () => {
            // Place 3 red bubbles at row 0, cols 0-2, bubblesRemaining = 3
            // Attach a 4th red bubble: bubblesRemaining becomes 4, match of 4 removes all,
            // bubblesRemaining becomes 4 - 4 = 0, triggering 1000 bonus
            const bubbles: ReturnType<typeof makeState>['grid'][number] = [
                {
                    color: 0xff0000,
                    x: getBubbleX(0, 0, constants),
                    y: getBubbleY(0, 0, constants),
                },
                {
                    color: 0xff0000,
                    x: getBubbleX(1, 0, constants),
                    y: getBubbleY(0, 0, constants),
                },
                {
                    color: 0xff0000,
                    x: getBubbleX(2, 0, constants),
                    y: getBubbleY(0, 0, constants),
                },
            ]

            const state = makeState({
                projectile: {
                    x: getBubbleX(3, 0, constants),
                    y: getBubbleY(0, 0, constants),
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [bubbles],
                bubblesRemaining: 3,
                score: 0,
            })

            attachBubble(state, constants)
            // All bubbles matched (3+1=4 match) → bubblesRemaining = 3+1-4 = 0
            // Bonus of 1000 should be added
            expect(state.bubblesRemaining).toBeLessThanOrEqual(0)
            expect(state.score).toBeGreaterThanOrEqual(1000)
        })

        it('should trigger game over when bubble enters danger zone after new row', () => {
            // dangerZone = SHOOTER_Y - BUBBLE_RADIUS * 5 = 740 - 100 = 640
            // After addRowAtTop, bubble at row 17 moves to row 18:
            // getBubbleY(18, 0) = 20 + 18 * 20 * sqrt(3) ≈ 643.5 >= 640
            const dangerousY = getBubbleY(17, 0, constants) // y at row 17 before shift

            // Build sparse grid: place one bubble at row 17, col 0
            const grid: GameState['grid'] = []
            for (let r = 0; r < 18; r++) {
                grid.push([])
            }
            grid[17] = [
                {
                    color: 0xff0000,
                    x: getBubbleX(0, 17, constants),
                    y: dangerousY,
                },
            ]

            const state = makeState({
                projectile: { x: 300, y: 50, vx: 0, vy: -5, color: 0xff0000 },
                grid,
                shotCount: 4, // Will become 5, triggering addNewRow
            })

            attachBubble(state, constants)
            // After adding new row, bubble at row 17 moves to row 18 (y >= dangerZone)
            // So game should be over
            expect(state.gameOver).toBe(true)
        })

        it('should detect matches of 3 or more and update score', () => {
            // Place 2 red bubbles in a row, attach a 3rd red bubble nearby
            const bubbleX0 = getBubbleX(0, 0, constants)
            const bubbleY0 = getBubbleY(0, 0, constants)
            const bubbleX1 = getBubbleX(1, 0, constants)
            const bubbleY1 = getBubbleY(0, 0, constants)

            const initialScore = 100
            const initialBubblesRemaining = 5

            const state = makeState({
                projectile: {
                    x: getBubbleX(2, 0, constants) - 1,
                    y: getBubbleY(0, 0, constants),
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [
                    [
                        { color: 0xff0000, x: bubbleX0, y: bubbleY0 },
                        { color: 0xff0000, x: bubbleX1, y: bubbleY1 },
                    ],
                ],
                score: initialScore,
                bubblesRemaining: initialBubblesRemaining,
            })
            attachBubble(state, constants)
            // Score should be greater than initial if a match was found
            expect(state.score).toBeGreaterThan(initialScore)
            // Bubbles should have been removed from the match
            expect(state.bubblesRemaining).toBeLessThan(initialBubblesRemaining)
        })

        it('should handle DFS with mixed-color neighbors (color mismatch branch)', () => {
            // Place 2 red bubbles and 1 blue bubble - DFS from blue hits reds (different color)
            const grid: GameState['grid'] = [
                [
                    {
                        color: 0xff0000,
                        x: getBubbleX(0, 0, constants),
                        y: getBubbleY(0, 0, constants),
                    },
                    {
                        color: 0xff0000,
                        x: getBubbleX(1, 0, constants),
                        y: getBubbleY(0, 0, constants),
                    },
                ],
            ]
            // Projectile is blue, attaches near the two red bubbles
            const state = makeState({
                projectile: {
                    x: getBubbleX(2, 0, constants),
                    y: getBubbleY(0, 0, constants),
                    vx: 0,
                    vy: -5,
                    color: 0x0000ff, // different color from grid
                },
                grid,
                bubblesRemaining: 2,
            })
            attachBubble(state, constants)
            // No match (only 1 blue), so no bubbles popped - bubblesRemaining includes the new bubble
            // The blue was added without removing any, so bubblesRemaining increases by 1
            expect(state.bubblesRemaining).toBe(3)
        })
    })

    describe('checkBubbleCollision with sparse grid', () => {
        it('should skip null/undefined rows in the grid', () => {
            // Create a sparse grid where row 1 is undefined (null row)
            const grid: GameState['grid'] = []
            grid[0] = [{ color: 0xff0000, x: 300, y: 20 }]
            // Row 1 is intentionally missing (undefined) to test !state.grid[row] branch
            grid[2] = [{ color: 0xff0000, x: 300, y: 60 }]

            const state = makeState({
                projectile: { x: 600, y: 600, vx: 0, vy: -5, color: 0xff0000 },
                grid,
            })
            // No collision since projectile is far away; should not throw
            expect(() => checkBubbleCollision(state, constants)).not.toThrow()
        })
    })

    describe('attachBubble with fully filled grid', () => {
        it('should use fallback position when all grid positions are filled (no empty cells)', () => {
            // Fill ALL grid cells so findAttachPosition finds no empty position
            const grid: GameState['grid'] = Array(constants.GRID_HEIGHT)
                .fill(null)
                .map((_, row) => {
                    const cols = constants.GRID_WIDTH - (row % 2)
                    return Array(cols).fill({ color: 0xff0000, x: 0, y: 0 })
                })
            const state = makeState({
                projectile: { x: 300, y: 400, vx: 0, vy: -5, color: 0x00ff00 },
                grid,
            })
            // attachBubble should not throw; uses fallback position { row: 0, col: ... }
            expect(() => attachBubble(state, constants)).not.toThrow()
            expect(state.projectile).toBeNull()
        })
    })
})
