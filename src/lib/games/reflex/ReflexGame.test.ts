// ReflexGame (BaseGame framework) unit tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ReflexGame, DEFAULT_REFLEX_CONFIG } from './ReflexGame'
import type { ReflexState } from './frameworkTypes'

describe('ReflexGame', () => {
    let game: ReflexGame

    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
        game = new ReflexGame()
    })

    afterEach(() => {
        game.destroy()
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    describe('createInitialState', () => {
        it('creates a zeroed state with a populated grid', () => {
            const state = game.getState()
            expect(state.score).toBe(0)
            expect(state.timeRemaining).toBe(60)
            expect(state.isActive).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.gameStarted).toBe(false)
            expect(state.objects).toEqual([])
            expect(state.totalClicks).toBe(0)
            expect(state.correctClicks).toBe(0)
            expect(state.incorrectClicks).toBe(0)
            expect(state.coinsCollected).toBe(0)
            expect(state.bombsHit).toBe(0)
            expect(state.missedCoins).toBe(0)
            expect(state.gameHistory).toEqual([])
        })

        it('builds a grid matching the configured dimensions', () => {
            const grid = game.getGrid()
            expect(grid).toHaveLength(12)
            expect(grid[0]).toHaveLength(12)
            expect(grid[0][0]).toEqual({
                id: 'cell-0-0',
                row: 0,
                col: 0,
                x: 0,
                y: 0,
            })
            expect(grid[11][11]).toEqual({
                id: 'cell-11-11',
                row: 11,
                col: 11,
                x: 440,
                y: 440,
            })
        })
    })

    describe('start', () => {
        it('marks the game as active and started', () => {
            game.start()
            const state = game.getState()
            expect(state.isActive).toBe(true)
            expect(state.gameStarted).toBe(true)
            expect(state.isGameOver).toBe(false)
        })

        it('does not restart if already active', () => {
            game.start()
            vi.advanceTimersByTime(100)
            game.start()
            // Only one spawn timer should be running; advancing 1s spawns once
            vi.advanceTimersByTime(1000)
            expect(game.getActiveObjects()).toHaveLength(1)
        })
    })

    describe('end', () => {
        it('stops the game and fires onEnd with stats', async () => {
            const onEnd = vi.fn()
            const g = new ReflexGame({}, { onEnd })
            g.start()
            await g.end()

            const state = g.getState()
            expect(state.isActive).toBe(false)
            expect(state.isGameOver).toBe(true)
            expect(onEnd).toHaveBeenCalledTimes(1)
            const [score, stats] = onEnd.mock.calls[0]
            expect(score).toBe(0)
            expect(stats.accuracy).toBe(0)
            g.destroy()
        })
    })

    describe('timer countdown', () => {
        it('counts down via the framework GameTimer', () => {
            const onTimeUpdate = vi.fn()
            const g = new ReflexGame({}, { onTimeUpdate })
            g.start()

            vi.advanceTimersByTime(1000)
            expect(onTimeUpdate).toHaveBeenCalledWith(59)

            vi.advanceTimersByTime(1000)
            expect(onTimeUpdate).toHaveBeenCalledWith(58)
            g.destroy()
        })

        it('ends the game when time reaches zero', async () => {
            const onEnd = vi.fn()
            const g = new ReflexGame({ duration: 2 }, { onEnd })
            g.start()

            vi.advanceTimersByTime(2000)
            await vi.runAllTimersAsync()

            const state = g.getState()
            expect(state.isGameOver).toBe(true)
            expect(onEnd).toHaveBeenCalled()
            g.destroy()
        })
    })

    describe('object spawning', () => {
        it('spawns objects at the configured interval', () => {
            game.start()

            vi.advanceTimersByTime(1000)
            expect(game.getActiveObjects()).toHaveLength(1)

            vi.advanceTimersByTime(1000)
            expect(game.getActiveObjects()).toHaveLength(2)
        })

        it('assigns valid type and cell to spawned objects', () => {
            game.start()
            vi.advanceTimersByTime(1000)

            const obj = game.getActiveObjects()[0]
            expect(['coin', 'bomb']).toContain(obj.type)
            expect(obj.isActive).toBe(true)
            expect(obj.clicked).toBe(false)
            expect(obj.cell.row).toBeGreaterThanOrEqual(0)
            expect(obj.cell.row).toBeLessThan(12)
            expect(obj.cell.col).toBeGreaterThanOrEqual(0)
            expect(obj.cell.col).toBeLessThan(12)
        })

        it('does not spawn in occupied cells', () => {
            game.start()
            for (let i = 0; i < 10; i++) {
                vi.advanceTimersByTime(1000)
            }

            const active = game.getActiveObjects()
            const seen = new Set<string>()
            active.forEach(obj => {
                const key = `${obj.cell.row}-${obj.cell.col}`
                expect(seen.has(key)).toBe(false)
                seen.add(key)
            })
        })

        it('respects coin-to-bomb ratio approximately', () => {
            game.start()
            for (let i = 0; i < 100; i++) {
                vi.advanceTimersByTime(1000)
                vi.advanceTimersByTime(2000) // let objects expire
            }

            const history = game.getState().gameHistory
            const coins = history.filter(h => h.type === 'coin').length
            const bombs = history.filter(h => h.type === 'bomb').length

            if (coins > 0 && bombs > 0) {
                const ratio = coins / bombs
                expect(ratio).toBeGreaterThan(1.0)
                expect(ratio).toBeLessThan(4.0)
            }
        })

        it('handles no-available-cells gracefully with tiny grid', () => {
            const small = new ReflexGame({
                gridSize: 1,
                spawnInterval: 0.01,
            })
            small.start()
            vi.advanceTimersByTime(100)
            vi.advanceTimersByTime(100)
            expect(small.getActiveObjects().length).toBeLessThanOrEqual(1)
            small.destroy()
        })
    })

    describe('object expiration', () => {
        it('expires objects after their lifetime', () => {
            game.start()
            vi.advanceTimersByTime(1000)
            expect(game.getActiveObjects()).toHaveLength(1)

            vi.advanceTimersByTime(1000)
            expect(game.getActiveObjects()).toHaveLength(2)

            vi.advanceTimersByTime(1000)
            game.cleanupExpiredObjects()
            expect(game.getActiveObjects()).toHaveLength(2)
        })

        it('applies penalty for missed coins (clamped to >= 0)', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5) // always coins
            game.start()
            vi.advanceTimersByTime(1000)
            vi.advanceTimersByTime(2100)

            const state = game.getState()
            expect(state.missedCoins).toBe(1)
            // ScoreManager clamps to >= 0
            expect(state.score).toBe(0)
        })
    })

    describe('click handling', () => {
        it('handles coin clicks and awards points', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5) // always coins
            game.start()
            vi.advanceTimersByTime(1000)

            const coin = game.getActiveObjects()[0]
            const result = game.handleCellClick(coin.cell.row, coin.cell.col)

            expect(result).toBe(true)
            expect(game.getState().score).toBe(10)
            expect(game.getState().coinsCollected).toBe(1)
            expect(game.getState().correctClicks).toBe(1)
        })

        it('handles bomb clicks and tracks incorrect clicks', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.95) // always bombs
            game.start()
            vi.advanceTimersByTime(1000)

            const bomb = game.getActiveObjects()[0]
            const result = game.handleCellClick(bomb.cell.row, bomb.cell.col)

            expect(result).toBe(true)
            // Score clamped to 0 by ScoreManager
            expect(game.getState().score).toBe(0)
            expect(game.getState().bombsHit).toBe(1)
            expect(game.getState().incorrectClicks).toBe(1)
        })

        it('handles empty cell clicks without scoring', () => {
            game.start()
            const result = game.handleCellClick(5, 5)

            expect(result).toBe(false)
            expect(game.getState().totalClicks).toBe(1)
            expect(game.getState().score).toBe(0)
        })

        it('does not handle clicks when game is inactive', () => {
            const result = game.handleCellClick(5, 5)
            expect(result).toBe(false)
            expect(game.getState().totalClicks).toBe(0)
        })
    })

    describe('statistics', () => {
        it('calculates accuracy correctly', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5) // always coins
            game.start()

            for (let i = 0; i < 3; i++) {
                vi.advanceTimersByTime(1000)
                const objects = game.getActiveObjects()
                if (objects.length > 0) {
                    game.handleCellClick(
                        objects[0].cell.row,
                        objects[0].cell.col
                    )
                }
            }

            game.handleCellClick(0, 0) // empty cell

            const state = game.getState()
            expect(state.totalClicks).toBe(4)
            expect(state.correctClicks).toBe(3)
        })

        it('tracks game history on click', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5)
            game.start()
            vi.advanceTimersByTime(1000)

            const objects = game.getActiveObjects()
            game.handleCellClick(objects[0].cell.row, objects[0].cell.col)

            const history = game.getState().gameHistory
            expect(history).toHaveLength(1)
            expect(history[0]).toMatchObject({
                type: 'coin',
                clicked: true,
                pointsAwarded: 10,
            })
            expect(history[0].timeToClick).toBeTypeOf('number')
        })

        it('getGameStats reports accuracy and reaction time', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5)
            game.start()
            vi.advanceTimersByTime(1000)

            const objects = game.getActiveObjects()
            expect(objects.length).toBeGreaterThan(0)

            vi.advanceTimersByTime(100)
            game.handleCellClick(objects[0].cell.row, objects[0].cell.col)

            await game.end()
            const stats = game.getGameStats()
            expect(stats.accuracy).toBeGreaterThan(0)
            expect(stats.averageReactionTime).toBeGreaterThan(0)
        })

        it('getGameData returns the reflex stat contract', () => {
            const data = (
                game as unknown as {
                    getGameData: () => Record<string, unknown>
                }
            ).getGameData()
            expect(data).toMatchObject({
                coinsCollected: 0,
                bombsHit: 0,
                missedCoins: 0,
                accuracy: 0,
                totalClicks: 0,
            })
        })
    })

    describe('reset', () => {
        it('resets state to initial values', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5)
            game.start()
            vi.advanceTimersByTime(1000)
            const obj = game.getActiveObjects()[0]
            game.handleCellClick(obj.cell.row, obj.cell.col)

            game.reset()

            const state = game.getState()
            expect(state.score).toBe(0)
            expect(state.coinsCollected).toBe(0)
            expect(state.totalClicks).toBe(0)
            expect(state.objects).toEqual([])
            expect(state.isGameOver).toBe(false)
            expect(state.gameStarted).toBe(false)
        })
    })

    describe('pause / resume', () => {
        it('stops the spawn timer while paused', () => {
            game.start()
            vi.advanceTimersByTime(1000)
            const before = game.getActiveObjects().length

            game.pause()
            // While paused the spawn interval does not fire, so no new
            // objects are added beyond what existed at pause time.
            vi.advanceTimersByTime(500)
            const spawnTimerId = (
                game as unknown as { spawnTimerId: number | null }
            ).spawnTimerId
            expect(spawnTimerId).toBeNull()
            expect(game.getActiveObjects().length).toBe(before)

            game.resume()
            const resumedTimerId = (
                game as unknown as { spawnTimerId: number | null }
            ).spawnTimerId
            expect(resumedTimerId).not.toBeNull()
        })
    })

    describe('config override', () => {
        it('accepts custom config values', () => {
            const g = new ReflexGame({
                gridSize: 6,
                cellSize: 50,
                duration: 30,
            })
            const config = g.getConfig()
            expect(config.gridSize).toBe(6)
            expect(config.cellSize).toBe(50)
            expect(config.duration).toBe(30)
            expect(g.getState().timeRemaining).toBe(30)
            g.destroy()
        })
    })

    describe('default config export', () => {
        it('exports expected defaults', () => {
            expect(DEFAULT_REFLEX_CONFIG.duration).toBe(60)
            expect(DEFAULT_REFLEX_CONFIG.gridSize).toBe(12)
            expect(DEFAULT_REFLEX_CONFIG.cellSize).toBe(40)
            expect(DEFAULT_REFLEX_CONFIG.pointsForCoin).toBe(10)
            expect(DEFAULT_REFLEX_CONFIG.pointsForBomb).toBe(-15)
        })
    })
})
