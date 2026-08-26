import { afterEach, describe, expect, it, vi } from 'vitest'
import { ASTEROID_DRIFT_ORB_ANCHORS, createIntroAsteroid } from './spawning'
import { AsteroidDriftGame } from './AsteroidDriftGame'
import {
    createAsteroidDriftConfig,
    type AsteroidDriftAsteroid,
    type AsteroidDriftConfig,
    type AsteroidDriftGameData,
    type AsteroidDriftPlayer,
} from './types'

function createGame(overrides: Partial<AsteroidDriftConfig> = {}) {
    return new AsteroidDriftGame(
        createAsteroidDriftConfig({
            achievementIntegration: false,
            rng: () => 0,
            ...overrides,
        })
    )
}

function gameDataOf(game: AsteroidDriftGame): AsteroidDriftGameData {
    return (
        game as unknown as {
            getGameData: () => AsteroidDriftGameData
        }
    ).getGameData()
}

function introAsteroid(game: AsteroidDriftGame): AsteroidDriftAsteroid {
    const asteroid = game.getState().asteroids[0]
    if (!asteroid) {
        throw new Error('intro asteroid missing')
    }
    return asteroid
}

/** Teleport the intro asteroid off-arena and let one update despawn it. */
function clearIntro(game: AsteroidDriftGame): void {
    introAsteroid(game).x = -10_000
    game.update(0.05)
    expect(game.getState().asteroids).toHaveLength(0)
}

function advance(game: AsteroidDriftGame, seconds: number): void {
    const updates = Math.round(seconds / 0.05)
    for (let i = 0; i < updates; i++) {
        game.update(0.05)
    }
}

describe('AsteroidDriftGame', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    describe('idle and start state', () => {
        it('derives idle center/time/radius from config with zeroed runtime', () => {
            const config = createAsteroidDriftConfig({
                achievementIntegration: false,
                duration: 42,
                canvasWidth: 600,
                canvasHeight: 400,
                playerRadius: 20,
            })
            const game = new AsteroidDriftGame(config)

            expect(game.getState()).toEqual({
                score: 0,
                timeRemaining: 42,
                isActive: false,
                isPaused: false,
                isGameOver: false,
                gameStarted: false,
                outcome: 'playing',
                player: {
                    x: 300,
                    y: 200,
                    velocityX: 0,
                    velocityY: 0,
                    radius: 20,
                },
                asteroids: [],
                energyOrb: null,
                orbsCollected: 0,
            })
            game.destroy()
        })

        it('has exactly one deterministic intro asteroid after start', () => {
            const game = createGame()
            game.start()

            expect(game.getState().asteroids).toEqual([
                createIntroAsteroid(
                    'asteroid-0',
                    createAsteroidDriftConfig({ rng: () => 0 })
                ),
            ])
            game.destroy()
        })
    })

    describe('held input sources', () => {
        it('unions keyboard and touch directions', () => {
            const game = createGame()
            game.pressDirection('right')
            game.pressDirection('up', 'touch')

            expect(game.pressedDirections).toEqual(new Set(['right', 'up']))
            game.destroy()
        })

        it('releasing one source keeps the direction held by the other', () => {
            const game = createGame()
            game.pressDirection('left')
            game.pressDirection('left', 'touch')

            game.releaseDirection('left')
            expect(game.pressedDirections).toEqual(new Set(['left']))

            game.releaseDirection('left', 'touch')
            expect(game.pressedDirections).toEqual(new Set())
            game.destroy()
        })

        it('defaults to the keyboard source for press and release', () => {
            const game = createGame()
            game.pressDirection('down')

            game.releaseDirection('down', 'touch')
            expect(game.pressedDirections).toEqual(new Set(['down']))

            game.releaseDirection('down')
            expect(game.pressedDirections).toEqual(new Set())
            game.destroy()
        })
    })

    describe('movement', () => {
        it('held right creates positive velocity and position', () => {
            const game = createGame()
            game.start()
            game.pressDirection('right')
            game.update(0.05)

            const player = game.getState().player
            expect(player.velocityX).toBeGreaterThan(0)
            expect(player.velocityY).toBe(0)
            expect(player.x).toBeGreaterThan(400)
            game.destroy()
        })

        it('release preserves a reduced positive velocity while coasting', () => {
            const game = createGame()
            game.start()
            introAsteroid(game).y = 60
            game.pressDirection('right')
            advance(game, 1.2)

            const pinned = game.getState().player.velocityX
            game.releaseDirection('right')
            game.update(0.05)

            const player = game.getState().player
            expect(player.velocityX).toBeGreaterThan(0)
            expect(player.velocityX).toBeLessThan(pinned)
            expect(player.x).toBeGreaterThan(400)
            game.destroy()
        })

        it('diagonal normalization does not increase acceleration magnitude', () => {
            const cardinal = createGame()
            cardinal.start()
            cardinal.pressDirection('right')
            cardinal.update(0.05)

            const diagonal = createGame()
            diagonal.start()
            diagonal.pressDirection('right')
            diagonal.pressDirection('up')
            diagonal.update(0.05)

            const cardinalPlayer = cardinal.getState().player
            const diagonalPlayer = diagonal.getState().player
            expect(
                Math.hypot(diagonalPlayer.velocityX, diagonalPlayer.velocityY)
            ).toBeCloseTo(
                Math.hypot(cardinalPlayer.velocityX, cardinalPlayer.velocityY)
            )
            expect(diagonalPlayer.velocityY).toBeLessThan(0)
            cardinal.destroy()
            diagonal.destroy()
        })

        it('sustained thrust never exceeds max speed', () => {
            const game = createGame()
            game.start()
            introAsteroid(game).y = 60
            game.pressDirection('right')

            let maxSpeed = 0
            for (let i = 0; i < 20; i++) {
                game.update(0.05)
                maxSpeed = Math.max(
                    maxSpeed,
                    Math.hypot(
                        game.getState().player.velocityX,
                        game.getState().player.velocityY
                    )
                )
            }

            expect(maxSpeed).toBeLessThanOrEqual(300)
            expect(maxSpeed).toBeGreaterThan(280)
            game.destroy()
        })

        it('clamps the circle inside the arena and clears only outward velocity', () => {
            const horizontal = createGame()
            horizontal.start()
            horizontal.pressDirection('left')
            advance(horizontal, 4)

            const pinned = horizontal.getState().player
            expect(pinned.x).toBe(16)
            expect(pinned.velocityX).toBe(0)
            expect(pinned.y).toBe(240)

            horizontal.releaseDirection('left')
            horizontal.pressDirection('right')
            horizontal.update(0.05)
            const recovering = horizontal.getState().player
            expect(recovering.velocityX).toBeGreaterThan(0)
            expect(recovering.x).toBeGreaterThan(16)
            horizontal.destroy()

            const vertical = createGame()
            vertical.start()
            vertical.pressDirection('up')
            advance(vertical, 4)

            const top = vertical.getState().player
            expect(top.y).toBe(16)
            expect(top.velocityY).toBe(0)
            expect(top.x).toBe(400)
            vertical.destroy()
        })
    })

    describe('update guards', () => {
        it('is inert while inactive and for non-finite or non-positive deltas', () => {
            const game = createGame()
            for (const delta of [Number.NaN, Infinity, -Infinity, 0, -1]) {
                game.update(delta)
            }
            expect(game.getState().asteroids).toEqual([])
            expect(game.getState().player.x).toBe(400)

            game.start()
            advance(game, 0)
            for (const delta of [Number.NaN, Infinity, -Infinity, 0, -1]) {
                game.update(delta)
            }
            expect(game.getState().asteroids[0]).toMatchObject({
                x: 866,
                y: 240,
            })
            game.destroy()
        })

        it('advances at most one outer-clamp worth of simulation per update', () => {
            const config = createAsteroidDriftConfig({
                achievementIntegration: false,
            })
            const game = new AsteroidDriftGame(config)
            game.start()

            game.update(1000)

            const asteroid = game.getState().asteroids[0]
            expect(asteroid).toMatchObject({
                y: config.canvasHeight / 2,
            })
            expect(asteroid?.x).toBeCloseTo(
                config.canvasWidth +
                    config.asteroidSpawnPadding +
                    config.introAsteroidRadius -
                    config.asteroidInitialSpeed * config.maxUpdateDelta,
                6
            )
            game.destroy()
        })

        it('catches a fast crossing asteroid through fixed substeps', () => {
            const game = createGame()
            game.start()
            const intro = introAsteroid(game)
            intro.x = 450
            intro.y = 240
            intro.velocityX = -1200
            intro.velocityY = 0

            game.update(0.1)

            expect(game.getState().outcome).toBe('collision')
            expect(game.getState().isGameOver).toBe(true)
            game.destroy()
        })
    })

    describe('random asteroid spawning', () => {
        it('waits for the opening grace before random traffic', () => {
            const rng = vi.fn(() => 0)
            const game = createGame({
                rng,
                asteroidInitialInterval: 1,
                asteroidFinalInterval: 1,
                openingRandomSpawnGrace: 4,
                orbSpawnInterval: 1e6,
            })
            game.start()
            clearIntro(game)

            advance(game, 4.9)
            expect(game.getState().asteroids).toHaveLength(0)
            expect(rng).not.toHaveBeenCalled()

            advance(game, 0.15)
            expect(game.getState().asteroids).toHaveLength(1)
            expect(rng).toHaveBeenCalledTimes(6)
            game.destroy()
        })

        it('removes the intro asteroid when it exits left', () => {
            const game = createGame({ openingRandomSpawnGrace: 1000 })
            game.start()
            introAsteroid(game).y = 60

            advance(game, 7)

            expect(game.getState().asteroids).toHaveLength(0)
            game.destroy()
        })

        it('removes a positive-X asteroid when it exits right', () => {
            const game = createGame({ openingRandomSpawnGrace: 1000 })
            game.start()
            const intro = introAsteroid(game)
            intro.x = 700
            intro.velocityX = 140

            advance(game, 1.5)

            expect(game.getState().asteroids).toHaveLength(0)
            game.destroy()
        })

        it('releases capacity when a body leaves the arena', () => {
            const rng = vi.fn(() => 0)
            const game = createGame({
                rng,
                maxAsteroids: 1,
                openingRandomSpawnGrace: 0,
                asteroidInitialInterval: 0.4,
                asteroidFinalInterval: 0.4,
                orbSpawnInterval: 1e6,
            })
            game.start()
            advance(game, 0.2)
            expect(game.getState().asteroids).toHaveLength(1)
            expect(rng).not.toHaveBeenCalled()

            clearIntro(game)
            expect(game.getState().asteroids).toHaveLength(0)
            expect(rng).not.toHaveBeenCalled()

            advance(game, 0.2)
            expect(game.getState().asteroids).toHaveLength(1)
            expect(rng).toHaveBeenCalledTimes(6)
            game.destroy()
        })

        it('consumes zero RNG at capacity and banks no multi-spawn burst', () => {
            const rng = vi.fn(() => 0)
            const game = createGame({
                rng,
                maxAsteroids: 1,
                openingRandomSpawnGrace: 0,
                asteroidInitialInterval: 0.4,
                asteroidFinalInterval: 0.4,
                orbSpawnInterval: 1e6,
            })
            game.start()
            advance(game, 1)
            expect(game.getState().asteroids).toHaveLength(1)
            expect(rng).not.toHaveBeenCalled()

            introAsteroid(game).x = -10_000
            game.update(0.05)
            expect(game.getState().asteroids).toHaveLength(1)
            expect(rng).toHaveBeenCalledTimes(6)

            advance(game, 0.1)
            expect(game.getState().asteroids).toHaveLength(1)
            expect(rng).toHaveBeenCalledTimes(6)
            game.destroy()
        })

        it('traffic gets denser and faster as simulated progress increases', () => {
            const rng = vi.fn(() => 0)
            const game = createGame({ rng, orbSpawnInterval: 1e6 })
            game.start()
            clearIntro(game)

            advance(game, 15)
            const earlySpeed = Math.hypot(
                game.getState().asteroids[0]?.velocityX ?? 0,
                game.getState().asteroids[0]?.velocityY ?? 0
            )
            rng.mockClear()
            advance(game, 5)
            const earlyCalls = rng.mock.calls.length

            advance(game, 50)
            rng.mockClear()
            advance(game, 5)
            const lateCalls = rng.mock.calls.length
            const lateSpeed = Math.hypot(
                game.getState().asteroids[0]?.velocityX ?? 0,
                game.getState().asteroids[0]?.velocityY ?? 0
            )

            expect(earlyCalls).toBeLessThanOrEqual(30)
            expect(lateCalls).toBeGreaterThanOrEqual(42)
            expect(lateCalls).toBeGreaterThan(earlyCalls)
            expect(lateSpeed).toBeGreaterThan(earlySpeed)
            game.destroy()
        })
    })

    describe('energy orb lifecycle', () => {
        function createOrbGame(overrides: Partial<AsteroidDriftConfig> = {}) {
            const rng = vi.fn(() => 0)
            const game = createGame({
                rng,
                openingRandomSpawnGrace: 1000,
                orbSpawnInterval: 0.5,
                orbLifetime: 1000,
                ...overrides,
            })
            return { game, rng }
        }

        it('a valid attempt creates an age-0 orb at the first anchor', () => {
            const { game } = createOrbGame()
            game.start()
            clearIntro(game)

            advance(game, 0.45)

            const config = createAsteroidDriftConfig({
                orbSpawnInterval: 0.5,
            })
            const orb = game.getState().energyOrb
            expect(orb).toMatchObject({
                id: 'orb-1',
                x: ASTEROID_DRIFT_ORB_ANCHORS[0].x * config.canvasWidth,
                y: ASTEROID_DRIFT_ORB_ANCHORS[0].y * config.canvasHeight,
                radius: config.orbRadius,
            })
            expect(orb?.ageSeconds).toBeCloseTo(0, 12)
            const ageAtSpawn = orb?.ageSeconds ?? 0
            game.update(0.05)
            expect(game.getState().energyOrb?.ageSeconds).toBeGreaterThan(
                ageAtSpawn
            )
            game.destroy()
        })

        it('keeps at most one orb and never re-attempts while it exists', () => {
            const { game, rng } = createOrbGame()
            game.start()
            clearIntro(game)
            advance(game, 0.55)
            const orb = game.getState().energyOrb
            expect(orb).not.toBeNull()

            advance(game, 2)

            expect(game.getState().energyOrb).toMatchObject({
                id: orb?.id,
            })
            expect(rng).toHaveBeenCalledTimes(1)
            game.destroy()
        })

        it('a blocked attempt resets the attempt cadence', () => {
            const { game, rng } = createOrbGame({
                orbAsteroidClearance: 5000,
            })
            game.start()

            advance(game, 0.55)
            expect(game.getState().energyOrb).toBeNull()
            expect(rng).toHaveBeenCalledTimes(1)

            advance(game, 0.5)
            expect(game.getState().energyOrb).toBeNull()
            expect(rng).toHaveBeenCalledTimes(2)
            game.destroy()
        })

        it('collection resets the accumulator and does not instant-respawn', () => {
            const { game } = createOrbGame()
            game.start()
            clearIntro(game)
            advance(game, 0.55)
            const orb = game.getState().energyOrb
            expect(orb).not.toBeNull()

            const player: AsteroidDriftPlayer = game.getState().player
            player.x = orb?.x ?? 0
            player.y = orb?.y ?? 0
            game.update(0.05)

            expect(game.getState().orbsCollected).toBe(1)
            expect(game.getState().energyOrb).toBeNull()
            expect(game.getState().score).toBe(100)

            game.update(0.05)
            expect(game.getState().orbsCollected).toBe(1)

            advance(game, 0.3)
            expect(game.getState().energyOrb).toBeNull()

            advance(game, 0.25)
            expect(game.getState().energyOrb).not.toBeNull()
            game.destroy()
        })

        it('expiry resets the accumulator and does not instant-respawn', () => {
            const { game, rng } = createOrbGame({ orbLifetime: 1 })
            game.start()
            clearIntro(game)
            advance(game, 0.55)
            expect(game.getState().energyOrb).not.toBeNull()

            advance(game, 1.05)
            expect(game.getState().energyOrb).toBeNull()
            expect(rng).toHaveBeenCalledTimes(1)

            advance(game, 0.3)
            expect(game.getState().energyOrb).toBeNull()
            expect(rng).toHaveBeenCalledTimes(1)

            advance(game, 0.25)
            expect(game.getState().energyOrb).not.toBeNull()
            expect(rng).toHaveBeenCalledTimes(2)
            game.destroy()
        })

        it('loses the run when asteroid and orb contact in the same substep', () => {
            const { game } = createOrbGame()
            game.start()
            clearIntro(game)
            advance(game, 0.55)
            const orb = game.getState().energyOrb
            expect(orb).not.toBeNull()

            const state = game.getState()
            const player: AsteroidDriftPlayer = state.player
            player.x = orb?.x ?? 0
            player.y = orb?.y ?? 0
            state.asteroids.push({
                id: 'asteroid-killer',
                x: player.x,
                y: player.y,
                velocityX: 0,
                velocityY: 0,
                radius: 18,
            })

            game.update(0.05)

            expect(game.getState().outcome).toBe('collision')
            expect(game.getState().orbsCollected).toBe(0)
            expect(game.getState().energyOrb).not.toBeNull()
            game.destroy()
        })
    })

    describe('collision end path', () => {
        it('ends exactly once for overlapping lethal asteroids', async () => {
            const game = createGame()
            game.start()
            game.pressDirection('right')
            const intro = introAsteroid(game)
            intro.x = 400
            game.getState().asteroids.push({
                ...intro,
                id: 'asteroid-extra',
                x: 400,
            })
            const end = vi.spyOn(game, 'end')

            game.update(0.05)
            await new Promise(resolve => setTimeout(resolve, 0))

            expect(end).toHaveBeenCalledTimes(1)
            expect(game.getState()).toMatchObject({
                outcome: 'collision',
                isGameOver: true,
                isActive: false,
            })
            expect(game.pressedDirections).toEqual(new Set())
            game.destroy()
        })

        it('catches a rejected async end', async () => {
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})
            const game = createGame()
            game.start()
            vi.spyOn(game, 'end').mockRejectedValue(new Error('save failed'))
            introAsteroid(game).x = 400

            game.update(0.05)
            await new Promise(resolve => setTimeout(resolve, 0))

            expect(game.getState().outcome).toBe('collision')
            expect(errorSpy).toHaveBeenCalledWith(
                'AsteroidDrift end failed',
                expect.any(Error)
            )
            game.destroy()
        })
    })

    describe('simulation-owned score authority', () => {
        it('advances survival score through update calls alone', () => {
            const game = createGame()
            game.start()

            advance(game, 1.25)

            expect(game.getState().score).toBe(10)
            expect(game.getGameStats().survivalSeconds).toBe(1)
            game.destroy()
        })

        it('collision preserves the simulated seconds actually played', () => {
            const game = createGame()
            game.start()
            advance(game, 1.25)

            introAsteroid(game).x = 400
            game.update(0.05)

            expect(game.getState().outcome).toBe('collision')
            expect(game.getState().score).toBe(10)
            expect(game.getGameStats().survivalSeconds).toBe(1)
            game.destroy()
        })

        it('classifies a near-complete simulation as survived', async () => {
            vi.useFakeTimers()
            const onEnd = vi.fn()
            const game = new AsteroidDriftGame(
                createAsteroidDriftConfig({
                    achievementIntegration: false,
                    duration: 2,
                    rng: () => 0,
                }),
                { onEnd }
            )
            game.start()
            advance(game, 1.95)

            await vi.advanceTimersByTimeAsync(2000)
            await Promise.resolve()

            expect(game.getState()).toMatchObject({
                outcome: 'survived',
                isGameOver: true,
                isActive: false,
            })
            expect(game.getState().score).toBe(20)
            expect(game.getGameStats()).toMatchObject({
                outcome: 'survived',
                survivalSeconds: 2,
                gameCompleted: true,
            })
            expect(gameDataOf(game)).toEqual({
                survivalSeconds: 2,
                orbsCollected: 0,
                survivedFullRun: true,
            })
            expect(onEnd).toHaveBeenCalledWith(
                20,
                expect.objectContaining({ outcome: 'survived' })
            )
        })

        it('expires a wall-clock completion without simulated play', async () => {
            vi.useFakeTimers()
            const game = new AsteroidDriftGame(
                createAsteroidDriftConfig({
                    achievementIntegration: false,
                    duration: 2,
                    rng: () => 0,
                })
            )
            game.start()

            await vi.advanceTimersByTimeAsync(2000)
            await Promise.resolve()

            expect(game.getState()).toMatchObject({
                outcome: 'expired',
                isGameOver: true,
                isActive: false,
            })
            expect(game.getState().score).toBe(0)
            expect(gameDataOf(game)).toEqual({
                survivalSeconds: 0,
                orbsCollected: 0,
                survivedFullRun: false,
            })
        })

        it('a partially simulated timeout returns partial survival only', () => {
            const game = createGame({ duration: 4 })
            game.start()
            advance(game, 1.25)
            ;(
                game as unknown as {
                    handleTimeUp: () => void
                }
            ).handleTimeUp()

            expect(game.getState()).toMatchObject({
                outcome: 'expired',
                isGameOver: true,
            })
            expect(game.getState().score).toBe(10)
            expect(game.getGameStats().survivalSeconds).toBe(1)
            expect(gameDataOf(game)).toEqual({
                survivalSeconds: 1,
                orbsCollected: 0,
                survivedFullRun: false,
            })
            game.destroy()
        })

        it('stops physics once the simulation reaches the duration', () => {
            const game = createGame({ duration: 2 })
            game.start()

            // Drive the simulation to its full duration. The sim clock
            // clamps at config.duration; the run is still active because
            // handleTimeUp (independent GameTimer clock) has not fired.
            advance(game, 2.5)
            expect(game.getState().isActive).toBe(true)

            // Place a lethal asteroid on the player after the sim clock
            // is full. Without capping substeps by the remaining sim
            // budget, a subsequent update would still step physics and
            // flip a survived run to collision before handleTimeUp runs.
            const player = game.getState().player
            game.getState().asteroids.push({
                id: 'asteroid-killer',
                x: player.x,
                y: player.y,
                velocityX: 0,
                velocityY: 0,
                radius: 18,
            })

            game.update(0.1)
            expect(game.getState().outcome).toBe('playing')
            expect(game.getState().isActive).toBe(true)

            // The authoritative survival path: handleTimeUp classifies
            // the full simulation as survived, not collision.
            ;(
                game as unknown as {
                    handleTimeUp: () => void
                }
            ).handleTimeUp()
            expect(game.getState()).toMatchObject({
                outcome: 'survived',
                isGameOver: true,
                isActive: false,
            })
            game.destroy()
        })
    })

    describe('reset lifecycle', () => {
        it('reset returns to the centered idle state and clears input', () => {
            const game = createGame()
            game.start()
            game.pressDirection('right')
            game.pressDirection('up', 'touch')
            advance(game, 1.25)

            game.reset()

            expect(game.getState()).toMatchObject({
                score: 0,
                timeRemaining: 90,
                isActive: false,
                gameStarted: false,
                outcome: 'playing',
                orbsCollected: 0,
                energyOrb: null,
                asteroids: [],
                player: {
                    x: 400,
                    y: 240,
                    velocityX: 0,
                    velocityY: 0,
                    radius: 16,
                },
            })
            expect(game.pressedDirections).toEqual(new Set())
            game.destroy()
        })
    })
})
