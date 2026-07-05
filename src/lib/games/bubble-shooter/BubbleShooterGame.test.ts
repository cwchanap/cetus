import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    BubbleShooterGame,
    DEFAULT_BUBBLE_SHOOTER_CONFIG,
} from './BubbleShooterGame'
import type {
    BubbleShooterState,
    BubbleShooterConfig,
    GameConstants,
} from './types'
import { getBubbleX, getBubbleY, getNeighbors } from './utils'

const CONSTANTS: GameConstants = {
    BUBBLE_RADIUS: 20,
    GRID_WIDTH: 14,
    GRID_HEIGHT: 20,
    COLORS: [0xff0000, 0x00ff00, 0x0000ff],
    GAME_WIDTH: 600,
    GAME_HEIGHT: 800,
    SHOOTER_Y: 740,
}

function makeGame(config?: Partial<BubbleShooterConfig>): BubbleShooterGame {
    return new BubbleShooterGame({
        shooterY: CONSTANTS.SHOOTER_Y,
        gameWidth: CONSTANTS.GAME_WIDTH,
        gameHeight: CONSTANTS.GAME_HEIGHT,
        bubbleRadius: CONSTANTS.BUBBLE_RADIUS,
        gridWidth: CONSTANTS.GRID_WIDTH,
        gridHeight: CONSTANTS.GRID_HEIGHT,
        colors: CONSTANTS.COLORS,
        ...config,
    })
}

// Direct access to internal state for deterministic physics tests.
function stateOf(game: BubbleShooterGame): BubbleShooterState {
    return (game as unknown as { state: BubbleShooterState }).state
}

function setState(
    game: BubbleShooterGame,
    overrides: Partial<BubbleShooterState>
): BubbleShooterState {
    const internal = stateOf(game)
    Object.assign(internal, overrides)
    return internal
}

describe('BubbleShooterGame', () => {
    beforeEach(() => {
        // Stub rAF so the internal game loop never actually runs.
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn(() => 1)
        )
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        // Stub fetch so end()'s score save is a no-op during tests.
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            })
        )
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    describe('createInitialState', () => {
        it('creates the expected default state', () => {
            const game = makeGame()
            const state = game.getState()

            expect(state.score).toBe(0)
            expect(state.grid).toEqual([])
            expect(state.shooter.x).toBe(CONSTANTS.GAME_WIDTH / 2)
            expect(state.shooter.y).toBe(CONSTANTS.SHOOTER_Y)
            expect(state.currentBubble).toBeNull()
            expect(state.nextBubble).toBeNull()
            expect(state.aimAngle).toBeCloseTo(-Math.PI / 2)
            expect(state.projectile).toBeNull()
            expect(state.bubblesRemaining).toBe(0)
            expect(state.shotsFired).toBe(0)
            expect(state.bubblesPopped).toBe(0)
            expect(state.largestCombo).toBe(0)
            expect(state.shotCount).toBe(0)
            expect(state.needsRedraw).toBe(true)
            expect(state.isActive).toBe(false)
            expect(state.isGameOver).toBe(false)
        })
    })

    describe('getConstantsView', () => {
        it('returns a constants view derived from config', () => {
            const game = makeGame()
            const view = game.getConstantsView()
            expect(view.BUBBLE_RADIUS).toBe(CONSTANTS.BUBBLE_RADIUS)
            expect(view.GRID_WIDTH).toBe(CONSTANTS.GRID_WIDTH)
            expect(view.GRID_HEIGHT).toBe(CONSTANTS.GRID_HEIGHT)
            expect(view.COLORS).toEqual(CONSTANTS.COLORS)
            expect(view.SHOOTER_Y).toBe(CONSTANTS.SHOOTER_Y)
        })
    })

    describe('getGameStats / accuracy', () => {
        it('computes accuracy from bubblesPopped / shotsFired', () => {
            const game = makeGame()
            setState(game, { shotsFired: 10, bubblesPopped: 8 })
            const stats = game.getGameStats()
            expect(stats.accuracy).toBe(80)
            expect(stats.bubblesPopped).toBe(8)
            expect(stats.shotsFired).toBe(10)
        })

        it('returns zero accuracy when no shots fired', () => {
            const game = makeGame()
            expect(game.getGameStats().accuracy).toBe(0)
        })
    })

    describe('getGameData', () => {
        it('returns the BubbleShooterGameData contract', () => {
            const game = makeGame()
            setState(game, {
                bubblesPopped: 7,
                shotsFired: 12,
                largestCombo: 4,
            })
            const data = (
                game as unknown as {
                    getGameData: () => Record<string, unknown>
                }
            ).getGameData()
            expect(data).toEqual({
                bubblesPopped: 7,
                shotsFired: 12,
                largestCombo: 4,
            })
        })
    })

    describe('setAimAngle', () => {
        it('clamps to the upward arc', () => {
            const game = makeGame()
            setState(game, { isActive: true })
            game.setAimAngle(0) // too horizontal (right)
            expect(game.getState().aimAngle).toBe(-Math.PI * 0.1)
            game.setAimAngle(-Math.PI) // too far left
            expect(game.getState().aimAngle).toBe(-Math.PI * 0.9)
        })

        it('ignores updates when not active', () => {
            const game = makeGame()
            const before = game.getState().aimAngle
            game.setAimAngle(-0.2)
            expect(game.getState().aimAngle).toBe(before)
        })

        it('ignores updates when a projectile is in flight', () => {
            const game = makeGame()
            setState(game, {
                isActive: true,
                projectile: { x: 1, y: 1, vx: 0, vy: 0, color: 0xff0000 },
            })
            const before = game.getState().aimAngle
            game.setAimAngle(-0.2)
            expect(game.getState().aimAngle).toBe(before)
        })
    })

    describe('shoot', () => {
        it('creates a projectile and increments shotsFired', () => {
            const game = makeGame()
            setState(game, {
                isActive: true,
                currentBubble: { x: 300, y: 700, color: 0xff0000 },
                nextBubble: { color: 0x00ff00 },
                aimAngle: -Math.PI / 2,
            })
            game.shoot()
            const state = game.getState()
            expect(state.projectile).not.toBeNull()
            expect(state.shotsFired).toBe(1)
            expect(state.needsRedraw).toBe(true)
        })

        it('promotes next bubble to current and keeps currentBubble populated', () => {
            const game = makeGame()
            setState(game, {
                isActive: true,
                currentBubble: { x: 300, y: 700, color: 0xff0000 },
                nextBubble: { color: 0x00ff00 },
                aimAngle: -Math.PI / 2,
            })
            game.shoot()
            const state = game.getState()
            expect(state.currentBubble?.color).toBe(0x00ff00)
            expect(state.nextBubble).not.toBeNull()
        })

        it('does nothing when no current bubble', () => {
            const game = makeGame()
            setState(game, { isActive: true, currentBubble: null })
            game.shoot()
            expect(game.getState().projectile).toBeNull()
            expect(game.getState().shotsFired).toBe(0)
        })

        it('does nothing when a projectile already exists', () => {
            const game = makeGame()
            setState(game, {
                isActive: true,
                currentBubble: { x: 300, y: 700, color: 0xff0000 },
                nextBubble: { color: 0x00ff00 },
                projectile: { x: 1, y: 1, vx: 0, vy: 0, color: 0xff0000 },
            })
            game.shoot()
            expect(game.getState().shotsFired).toBe(0)
        })
    })

    describe('checkBubbleCollision', () => {
        it('returns null when there is no projectile', () => {
            const game = makeGame()
            setState(game, { projectile: null })
            expect(game.checkBubbleCollision()).toBeNull()
        })

        it('detects collision with a grid bubble', () => {
            const game = makeGame()
            const bx = getBubbleX(0, 0, CONSTANTS)
            const by = getBubbleY(0, 0, CONSTANTS)
            setState(game, {
                projectile: {
                    x: bx + 1,
                    y: by + 1,
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [[{ color: 0x00ff00, x: bx, y: by }]],
            })
            expect(game.checkBubbleCollision()).toEqual({ row: 0, col: 0 })
        })

        it('returns null when projectile is far from all bubbles', () => {
            const game = makeGame()
            const bx = getBubbleX(0, 0, CONSTANTS)
            const by = getBubbleY(0, 0, CONSTANTS)
            setState(game, {
                projectile: { x: 500, y: 500, vx: 0, vy: -5, color: 0xff0000 },
                grid: [[{ color: 0x00ff00, x: bx, y: by }]],
            })
            expect(game.checkBubbleCollision()).toBeNull()
        })

        it('returns the nearest collided bubble', () => {
            const game = makeGame()
            const farBubble = {
                color: 0x00ff00,
                x: getBubbleX(0, 0, CONSTANTS),
                y: getBubbleY(0, 0, CONSTANTS),
            }
            const nearBubble = {
                color: 0x0000ff,
                x: getBubbleX(1, 0, CONSTANTS),
                y: getBubbleY(0, 0, CONSTANTS),
            }
            const dist = CONSTANTS.BUBBLE_RADIUS * 1.5
            setState(game, {
                projectile: {
                    x: nearBubble.x - dist * 0.5,
                    y: nearBubble.y + dist * 0.5,
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [[farBubble, nearBubble]],
            })
            const result = game.checkBubbleCollision()
            expect(result).not.toBeNull()
            // The returned bubble must be at least as close as farBubble.
            const returned = result
                ? stateOf(game).grid[result.row][result.col]
                : null
            const projectile = stateOf(game).projectile
            const farDist = projectile
                ? Math.hypot(
                      projectile.x - farBubble.x,
                      projectile.y - farBubble.y
                  )
                : Infinity
            const returnedDist =
                returned && projectile
                    ? Math.hypot(
                          projectile.x - returned.x,
                          projectile.y - returned.y
                      )
                    : Infinity
            expect(returnedDist).toBeLessThanOrEqual(farDist)
        })
    })

    describe('updateProjectile', () => {
        it('moves the projectile by its velocity', () => {
            const game = makeGame()
            setState(game, {
                projectile: { x: 100, y: 200, vx: 5, vy: -10, color: 0xff0000 },
                grid: [],
            })
            game.updateProjectile()
            const p = stateOf(game).projectile
            expect(p?.x).toBe(105)
            expect(p?.y).toBe(190)
        })

        it('reflects off the left wall', () => {
            const game = makeGame()
            setState(game, {
                projectile: {
                    x: CONSTANTS.BUBBLE_RADIUS - 1,
                    y: 400,
                    vx: -5,
                    vy: -10,
                    color: 0xff0000,
                },
                grid: [],
            })
            game.updateProjectile()
            expect(stateOf(game).projectile?.vx).toBeGreaterThan(0)
        })

        it('reflects off the right wall', () => {
            const game = makeGame()
            setState(game, {
                projectile: {
                    x: CONSTANTS.GAME_WIDTH - CONSTANTS.BUBBLE_RADIUS + 1,
                    y: 400,
                    vx: 5,
                    vy: -10,
                    color: 0xff0000,
                },
                grid: [],
            })
            game.updateProjectile()
            expect(stateOf(game).projectile?.vx).toBeLessThan(0)
        })

        it('attaches (clears projectile) when reaching the top', () => {
            const game = makeGame()
            setState(game, {
                isActive: false, // avoid end() side effects
                projectile: {
                    x: 300,
                    y: CONSTANTS.BUBBLE_RADIUS - 1,
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [],
            })
            game.updateProjectile()
            expect(stateOf(game).projectile).toBeNull()
        })

        it('does nothing without a projectile', () => {
            const game = makeGame()
            setState(game, { projectile: null, needsRedraw: false })
            expect(game.updateProjectile()).toBe(false)
        })
    })

    describe('attachBubble - matching & scoring', () => {
        it('detects matches of 3+ and awards score', () => {
            const game = makeGame()
            const bx0 = getBubbleX(0, 0, CONSTANTS)
            const by0 = getBubbleY(0, 0, CONSTANTS)
            const bx1 = getBubbleX(1, 0, CONSTANTS)
            setState(game, {
                isActive: false,
                projectile: {
                    x: getBubbleX(2, 0, CONSTANTS) - 1,
                    y: by0,
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [
                    [
                        { color: 0xff0000, x: bx0, y: by0 },
                        { color: 0xff0000, x: bx1, y: by0 },
                    ],
                ],
                bubblesRemaining: 5,
                score: 0,
            })
            game.attachBubble()
            const state = stateOf(game)
            expect(state.score).toBeGreaterThanOrEqual(30) // 3 * 10
            expect(state.bubblesPopped).toBe(3)
            expect(state.largestCombo).toBe(3)
            expect(state.bubblesRemaining).toBeLessThan(5)
        })

        it('does not pop on a color mismatch (tracks remaining including new bubble)', () => {
            const game = makeGame()
            setState(game, {
                isActive: false,
                projectile: {
                    x: getBubbleX(2, 0, CONSTANTS),
                    y: getBubbleY(0, 0, CONSTANTS),
                    vx: 0,
                    vy: -5,
                    color: 0x0000ff, // blue into reds
                },
                grid: [
                    [
                        {
                            color: 0xff0000,
                            x: getBubbleX(0, 0, CONSTANTS),
                            y: getBubbleY(0, 0, CONSTANTS),
                        },
                        {
                            color: 0xff0000,
                            x: getBubbleX(1, 0, CONSTANTS),
                            y: getBubbleY(0, 0, CONSTANTS),
                        },
                    ],
                ],
                bubblesRemaining: 2,
            })
            game.attachBubble()
            // No match: blue added, bubblesRemaining = 2 + 1 = 3, nothing popped
            expect(stateOf(game).bubblesRemaining).toBe(3)
            expect(stateOf(game).bubblesPopped).toBe(0)
        })

        it('awards all-clear bonus when grid is emptied', () => {
            const game = makeGame()
            const bubbles = [
                {
                    color: 0xff0000,
                    x: getBubbleX(0, 0, CONSTANTS),
                    y: getBubbleY(0, 0, CONSTANTS),
                },
                {
                    color: 0xff0000,
                    x: getBubbleX(1, 0, CONSTANTS),
                    y: getBubbleY(0, 0, CONSTANTS),
                },
                {
                    color: 0xff0000,
                    x: getBubbleX(2, 0, CONSTANTS),
                    y: getBubbleY(0, 0, CONSTANTS),
                },
            ]
            setState(game, {
                isActive: false,
                projectile: {
                    x: getBubbleX(3, 0, CONSTANTS),
                    y: getBubbleY(0, 0, CONSTANTS),
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [bubbles],
                bubblesRemaining: 3,
                score: 0,
            })
            game.attachBubble()
            // 4 matched → 40 points + 1000 all clear bonus
            expect(stateOf(game).score).toBeGreaterThanOrEqual(1000)
        })

        it('increments shotCount and adds a row every 5 shots', () => {
            const game = makeGame()
            setState(game, {
                isActive: false,
                projectile: {
                    x: 300,
                    y: 50,
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [],
                shotCount: 4,
            })
            const before = stateOf(game).grid.length
            game.attachBubble()
            expect(stateOf(game).shotCount).toBe(5)
            expect(stateOf(game).grid.length).toBeGreaterThan(before)
        })

        it('clears the projectile after attaching', () => {
            const game = makeGame()
            setState(game, {
                isActive: false,
                projectile: { x: 300, y: 50, vx: 0, vy: -5, color: 0xff0000 },
                grid: [],
            })
            game.attachBubble()
            expect(stateOf(game).projectile).toBeNull()
        })

        it('snaps collision attachments to a neighbor of the anchor', () => {
            const game = makeGame()
            const anchor = { row: 4, col: 4 }
            const realGrid: ({
                color: number
                x: number
                y: number
            } | null)[][] = []
            realGrid[anchor.row] = []
            realGrid[anchor.row][anchor.col] = {
                color: 0x00ff00,
                x: getBubbleX(anchor.col, anchor.row, CONSTANTS),
                y: getBubbleY(anchor.row, 0, CONSTANTS),
            }
            setState(game, {
                isActive: false,
                projectile: {
                    x: getBubbleX(0, 0, CONSTANTS),
                    y: getBubbleY(0, 0, CONSTANTS),
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: realGrid,
                bubblesRemaining: 1,
            })
            game.attachBubble(anchor)
            const filledNeighbor = getNeighbors(
                anchor.row,
                anchor.col,
                CONSTANTS
            ).find(
                ({ row, col }) =>
                    stateOf(game).grid[row]?.[col]?.color === 0xff0000
            )
            expect(filledNeighbor).toBeDefined()
        })

        it('uses fallback position when grid is fully filled', () => {
            const game = makeGame()
            const grid: ({
                color: number
                x: number
                y: number
            } | null)[][] = Array(CONSTANTS.GRID_HEIGHT)
                .fill(null)
                .map((_, row) => {
                    const cols = CONSTANTS.GRID_WIDTH - (row % 2)
                    return Array(cols).fill({
                        color: 0xff0000,
                        x: 0,
                        y: 0,
                    })
                })
            setState(game, {
                isActive: false,
                projectile: { x: 300, y: 400, vx: 0, vy: -5, color: 0x00ff00 },
                grid,
            })
            expect(() => game.attachBubble()).not.toThrow()
            expect(stateOf(game).projectile).toBeNull()
        })
    })

    describe('game over detection', () => {
        it('triggers end when a bubble enters the danger zone after a new row', () => {
            const game = makeGame()
            const dangerousY = getBubbleY(17, 0, CONSTANTS)
            const grid: ({
                color: number
                x: number
                y: number
            } | null)[][] = []
            for (let r = 0; r < 18; r++) {
                grid.push([])
            }
            grid[17] = [
                {
                    color: 0xff0000,
                    x: getBubbleX(0, 17, CONSTANTS),
                    y: dangerousY,
                },
            ]
            setState(game, {
                isActive: true, // allow end() to proceed to score save (fetch mocked)
                projectile: { x: 300, y: 50, vx: 0, vy: -5, color: 0xff0000 },
                grid,
                shotCount: 4,
            })
            const ended = game.attachBubble()
            expect(ended).toBe(true)
        })
    })

    describe('default config', () => {
        it('has sensible defaults', () => {
            expect(DEFAULT_BUBBLE_SHOOTER_CONFIG.bubbleRadius).toBe(20)
            expect(DEFAULT_BUBBLE_SHOOTER_CONFIG.gridWidth).toBe(14)
            expect(DEFAULT_BUBBLE_SHOOTER_CONFIG.colors).toHaveLength(3)
            expect(DEFAULT_BUBBLE_SHOOTER_CONFIG.rowAddInterval).toBe(5)
        })
    })

    describe('lifecycle (start/pause/resume/end/reset)', () => {
        beforeEach(() => {
            // rAF stubbed globally in the outer beforeEach; no game-internal loop.
        })

        it('start initializes the grid, loads bubbles, and starts the game', () => {
            const onStateChange = vi.fn()
            const game = makeGame()
            ;(
                game as unknown as { callbacks: { onStateChange?: unknown } }
            ).callbacks.onStateChange = onStateChange
            game.start()
            const state = game.getState()
            expect(state.isActive).toBe(true)
            expect(state.gameStarted).toBe(true)
            // initializeGrid built rows for initialRows + empty rows up to grid height
            expect(state.grid.length).toBe(CONSTANTS.GRID_HEIGHT)
            expect(state.currentBubble).not.toBeNull()
            expect(state.nextBubble).not.toBeNull()
            expect(state.needsRedraw).toBe(true)
        })

        it('pause marks paused', () => {
            const game = makeGame()
            game.start()
            game.pause()
            expect(game.getState().isPaused).toBe(true)
        })

        it('resume unpauses the game', () => {
            const game = makeGame()
            game.start()
            game.pause()
            game.resume()
            expect(game.getState().isPaused).toBe(false)
        })

        it('end stops the loop and marks game over', async () => {
            const game = makeGame()
            game.start()
            await game.end()
            expect(game.getState().isGameOver).toBe(true)
            expect(game.getState().isActive).toBe(false)
        })

        it('reset rebuilds initial state and emits a state change', () => {
            const onStateChange = vi.fn()
            const game = makeGame()
            ;(
                game as unknown as { callbacks: { onStateChange?: unknown } }
            ).callbacks.onStateChange = onStateChange
            game.start()
            onStateChange.mockClear()
            game.reset()
            const state = game.getState()
            expect(state.isActive).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.grid).toEqual([])
            expect(onStateChange).toHaveBeenCalled()
        })

        it('update advances the projectile and emits state changes while active', () => {
            const onStateChange = vi.fn()
            const game = makeGame()
            ;(
                game as unknown as { callbacks: { onStateChange?: unknown } }
            ).callbacks.onStateChange = onStateChange
            game.start()
            // Arm a projectile so updateProjectile does real work.
            setState(game, {
                projectile: { x: 100, y: 200, vx: 5, vy: -10, color: 0xff0000 },
                grid: [],
            })
            onStateChange.mockClear()
            // Invoke one update tick (the framework render loop calls this).
            game.update(16)
            expect(stateOf(game).projectile?.x).toBe(105)
            expect(onStateChange).toHaveBeenCalled()
        })

        it('update does not advance the projectile when paused', () => {
            const game = makeGame()
            game.start()
            game.pause()
            const projectileBefore = stateOf(game).projectile
            game.update(16)
            expect(stateOf(game).projectile).toEqual(projectileBefore)
        })

        it('update and render are safe no-ops when not active', () => {
            const game = makeGame()
            expect(() => game.update(16)).not.toThrow()
            expect(() => game.render()).not.toThrow()
        })

        it('cleanup does not throw', () => {
            const game = makeGame()
            game.start()
            expect(() => game.cleanup()).not.toThrow()
        })
    })

    describe('public accessors', () => {
        it('getConfig returns a copy of the config', () => {
            const game = makeGame()
            const cfg = game.getConfig()
            expect(cfg.bubbleRadius).toBe(CONSTANTS.BUBBLE_RADIUS)
            expect(cfg.gridWidth).toBe(CONSTANTS.GRID_WIDTH)
            // Mutating the copy must not affect the game's config.
            cfg.bubbleRadius = 999
            expect(game.getConfig().bubbleRadius).toBe(CONSTANTS.BUBBLE_RADIUS)
        })

        it('markRendered clears the needsRedraw flag', () => {
            const game = makeGame()
            setState(game, { needsRedraw: true })
            game.markRendered()
            expect(game.getState().needsRedraw).toBe(false)
        })
    })

    describe('defensive guards', () => {
        it('attachBubble returns false when there is no projectile', () => {
            const game = makeGame()
            setState(game, { projectile: null })
            expect(game.attachBubble()).toBe(false)
        })

        it('findAttachPosition returns null when there is no projectile', () => {
            const game = makeGame()
            const constants = game.getConstantsView()
            const internal = game as unknown as {
                findAttachPosition: (
                    c: typeof constants,
                    a?: unknown
                ) => unknown
            }
            expect(internal.findAttachPosition(constants)).toBeNull()
        })

        it('findClosestPosition returns null when there is no projectile', () => {
            const game = makeGame()
            const constants = game.getConstantsView()
            const internal = game as unknown as {
                findClosestPosition: (
                    c: typeof constants,
                    candidates: unknown[]
                ) => unknown
            }
            expect(internal.findClosestPosition(constants, [])).toBeNull()
        })

        it('checkMatches is a no-op when the start cell is empty', () => {
            const game = makeGame()
            setState(game, { grid: [[null, null]] })
            const internal = game as unknown as {
                checkMatches: (row: number, col: number) => void
            }
            expect(() => internal.checkMatches(0, 0)).not.toThrow()
        })

        it('checkBubbleCollision skips empty rows and null cells', () => {
            const game = makeGame()
            const bx = getBubbleX(0, 0, CONSTANTS)
            const by = getBubbleY(0, 0, CONSTANTS)
            // Row 0 has a real bubble; row 1 is undefined; row 2 has a null cell.
            setState(game, {
                projectile: {
                    x: bx + 1,
                    y: by + 1,
                    vx: 0,
                    vy: -5,
                    color: 0xff0000,
                },
                grid: [[{ color: 0x00ff00, x: bx, y: by }]],
            })
            stateOf(game).grid[2] = [null]
            expect(game.checkBubbleCollision()).toEqual({ row: 0, col: 0 })
        })

        it('addRowAtTop handles sparse grids (undefined source rows)', () => {
            const game = makeGame()
            const constants = game.getConstantsView()
            // A sparse grid where most rows are undefined exercises the `: []`
            // fallback branch in addRowAtTop.
            setState(game, {
                grid: [],
                bubblesRemaining: 0,
            })
            const internal = game as unknown as {
                addRowAtTop: (c: typeof constants) => void
            }
            expect(() => internal.addRowAtTop(constants)).not.toThrow()
        })
    })
})
