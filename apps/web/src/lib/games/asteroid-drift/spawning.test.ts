import { describe, expect, it } from 'vitest'
import { lerp } from '@/lib/games/shared/utils'
import {
    ASTEROID_DRIFT_ORB_ANCHORS,
    createIntroAsteroid,
    createRandomAsteroid,
    eligibleAsteroidSpawnEdges,
    findEnergyOrbSpawn,
    isAsteroidOffArena,
} from './spawning'
import {
    createAsteroidDriftConfig,
    type AsteroidDriftAsteroid,
    type AsteroidDriftPlayer,
} from './types'

const config = createAsteroidDriftConfig({ rng: () => 0 })
const player: AsteroidDriftPlayer = {
    x: config.canvasWidth / 2,
    y: config.canvasHeight / 2,
    velocityX: 0,
    velocityY: 0,
    radius: config.playerRadius,
}

function makeAsteroid(
    x: number,
    y: number,
    radius = config.asteroidMinRadius
): AsteroidDriftAsteroid {
    return {
        id: `asteroid-${x}-${y}`,
        x,
        y,
        velocityX: 0,
        velocityY: 0,
        radius,
    }
}

function anchorPoint(index: number): { x: number; y: number } {
    return {
        x: ASTEROID_DRIFT_ORB_ANCHORS[index].x * config.canvasWidth,
        y: ASTEROID_DRIFT_ORB_ANCHORS[index].y * config.canvasHeight,
    }
}

describe('eligibleAsteroidSpawnEdges', () => {
    it('excludes the left edge when the player hugs it', () => {
        expect(
            eligibleAsteroidSpawnEdges({ ...player, x: 20 }, config)
        ).not.toContain('left')
    })

    it('always leaves an eligible edge for center and corner-like positions', () => {
        const positions = [
            { x: config.canvasWidth / 2, y: config.canvasHeight / 2 },
            { x: 0, y: 0 },
            { x: config.canvasWidth, y: 0 },
            { x: 0, y: config.canvasHeight },
            { x: config.canvasWidth, y: config.canvasHeight },
            { x: 20, y: 20 },
            { x: config.canvasWidth - 20, y: config.canvasHeight - 20 },
        ]
        for (const position of positions) {
            expect(
                eligibleAsteroidSpawnEdges(position, config).length
            ).toBeGreaterThan(0)
        }
    })

    it('returns no edges for an impossible test configuration', () => {
        const tiny = createAsteroidDriftConfig({
            canvasWidth: 200,
            canvasHeight: 100,
        })
        expect(eligibleAsteroidSpawnEdges({ x: 100, y: 50 }, tiny)).toEqual([])
    })
})

describe('createIntroAsteroid', () => {
    it('creates the deterministic opening asteroid outside the right edge', () => {
        expect(createIntroAsteroid('asteroid-0', config)).toMatchObject({
            id: 'asteroid-0',
            y: config.canvasHeight / 2,
            velocityX: -config.asteroidInitialSpeed,
            velocityY: 0,
            radius: config.introAsteroidRadius,
        })
        expect(createIntroAsteroid('asteroid-0', config).x).toBe(
            config.canvasWidth +
                config.asteroidSpawnPadding +
                config.introAsteroidRadius
        )
    })
})

describe('createRandomAsteroid', () => {
    it('materializes one finite top-edge spawn from rng() = 0', () => {
        let rngCalls = 0
        const countedConfig = createAsteroidDriftConfig({
            rng: () => {
                rngCalls++
                return 0
            },
        })
        const asteroid = createRandomAsteroid('a1', player, 0, countedConfig)

        expect(asteroid).toMatchObject({ id: 'a1', radius: 18, x: 0, y: -58 })
        expect(asteroid.y).toBeLessThan(-asteroid.radius)
        // target (80, 80) from (0, -58): speed 140 * (1 - 0.15) = 119
        expect(Math.hypot(asteroid.velocityX, asteroid.velocityY)).toBeCloseTo(
            119,
            9
        )
        expect(asteroid.velocityX).toBeGreaterThan(0)
        expect(asteroid.velocityY).toBeGreaterThan(0)
        // one finite materialization: edge, radius, coordinate, target x, target y, speed
        expect(rngCalls).toBe(6)
    })

    it.each([
        ['top', (): number => 0],
        ['right', (): number => 0.25],
        ['bottom', (): number => 0.5],
        ['left', (): number => 0.75],
    ] as const)(
        'spawns a %s-edge asteroid fully outside with inward velocity',
        (edge, rng) => {
            const edgeConfig = createAsteroidDriftConfig({ rng })
            const asteroid = createRandomAsteroid(
                `a-${edge}`,
                player,
                0.5,
                edgeConfig
            )
            const padding = edgeConfig.asteroidSpawnPadding
            if (edge === 'top') {
                expect(asteroid.y + asteroid.radius).toBeCloseTo(-padding, 6)
                expect(asteroid.velocityY).toBeGreaterThan(0)
            } else if (edge === 'bottom') {
                expect(asteroid.y - asteroid.radius).toBeCloseTo(
                    edgeConfig.canvasHeight + padding,
                    6
                )
                expect(asteroid.velocityY).toBeLessThan(0)
            } else if (edge === 'left') {
                expect(asteroid.x + asteroid.radius).toBeCloseTo(-padding, 6)
                expect(asteroid.velocityX).toBeGreaterThan(0)
            } else {
                expect(asteroid.x - asteroid.radius).toBeCloseTo(
                    edgeConfig.canvasWidth + padding,
                    6
                )
                expect(asteroid.velocityX).toBeLessThan(0)
            }
        }
    )

    it('keeps radius and speed inside config-derived bounds', () => {
        for (const progress of [0, 0.5, 1]) {
            for (const sample of [0, 0.13, 0.5, 0.77, 0.999]) {
                const sampleConfig = createAsteroidDriftConfig({
                    rng: () => sample,
                })
                const asteroid = createRandomAsteroid(
                    'a',
                    player,
                    progress,
                    sampleConfig
                )
                expect(asteroid.radius).toBeGreaterThanOrEqual(
                    sampleConfig.asteroidMinRadius
                )
                expect(asteroid.radius).toBeLessThanOrEqual(
                    sampleConfig.asteroidMaxRadius
                )
                const speed = Math.hypot(asteroid.velocityX, asteroid.velocityY)
                const ramped = lerp(
                    sampleConfig.asteroidInitialSpeed,
                    sampleConfig.asteroidFinalSpeed,
                    progress
                )
                expect(speed).toBeGreaterThanOrEqual(
                    ramped * (1 - sampleConfig.asteroidSpeedJitter)
                )
                expect(speed).toBeLessThanOrEqual(
                    ramped * (1 + sampleConfig.asteroidSpeedJitter)
                )
            }
        }
    })

    it('stays finite and in range for invalid rng samples', () => {
        for (const bad of [NaN, Infinity, -Infinity, -5, 42]) {
            const badConfig = createAsteroidDriftConfig({ rng: () => bad })
            const asteroid = createRandomAsteroid('a', player, 0.5, badConfig)
            for (const value of [
                asteroid.x,
                asteroid.y,
                asteroid.velocityX,
                asteroid.velocityY,
                asteroid.radius,
            ]) {
                expect(Number.isFinite(value)).toBe(true)
            }
            expect(asteroid.radius).toBeGreaterThanOrEqual(
                badConfig.asteroidMinRadius
            )
            expect(asteroid.radius).toBeLessThanOrEqual(
                badConfig.asteroidMaxRadius
            )
            const orbSpawn = findEnergyOrbSpawn(player, [], badConfig)
            if (orbSpawn) {
                expect(Number.isFinite(orbSpawn.x)).toBe(true)
                expect(Number.isFinite(orbSpawn.y)).toBe(true)
            }
        }
    })

    it('throws when no edge is eligible', () => {
        const tiny = createAsteroidDriftConfig({
            canvasWidth: 200,
            canvasHeight: 100,
        })
        expect(() =>
            createRandomAsteroid('a', { x: 100, y: 50 }, 0, tiny)
        ).toThrow(RangeError)
    })
})

describe('isAsteroidOffArena', () => {
    const radius = config.asteroidMinRadius
    const margin = config.asteroidSpawnPadding + radius

    it('keeps a body exactly on an expanded boundary active', () => {
        expect(isAsteroidOffArena(makeAsteroid(-margin, 240), config)).toBe(
            false
        )
        expect(
            isAsteroidOffArena(
                makeAsteroid(config.canvasWidth + margin, 240),
                config
            )
        ).toBe(false)
        expect(isAsteroidOffArena(makeAsteroid(400, -margin), config)).toBe(
            false
        )
        expect(
            isAsteroidOffArena(
                makeAsteroid(400, config.canvasHeight + margin),
                config
            )
        ).toBe(false)
    })

    it('despawns one epsilon beyond any expanded boundary', () => {
        const epsilon = 0.000001
        expect(
            isAsteroidOffArena(makeAsteroid(-margin - epsilon, 240), config)
        ).toBe(true)
        expect(
            isAsteroidOffArena(
                makeAsteroid(config.canvasWidth + margin + epsilon, 240),
                config
            )
        ).toBe(true)
        expect(
            isAsteroidOffArena(makeAsteroid(400, -margin - epsilon), config)
        ).toBe(true)
        expect(
            isAsteroidOffArena(
                makeAsteroid(400, config.canvasHeight + margin + epsilon),
                config
            )
        ).toBe(true)
    })
})

describe('ASTEROID_DRIFT_ORB_ANCHORS', () => {
    it('exposes eight normalized anchors', () => {
        expect(ASTEROID_DRIFT_ORB_ANCHORS).toHaveLength(8)
        for (const anchor of ASTEROID_DRIFT_ORB_ANCHORS) {
            expect(anchor.x).toBeGreaterThanOrEqual(0)
            expect(anchor.x).toBeLessThanOrEqual(1)
            expect(anchor.y).toBeGreaterThanOrEqual(0)
            expect(anchor.y).toBeLessThanOrEqual(1)
        }
    })
})

describe('findEnergyOrbSpawn', () => {
    it('consumes exactly one rng sample for the starting index', () => {
        let rngCalls = 0
        const countedConfig = createAsteroidDriftConfig({
            rng: () => {
                rngCalls++
                return 0
            },
        })
        findEnergyOrbSpawn(player, [], countedConfig)
        expect(rngCalls).toBe(1)
    })

    it('skips anchors too close to the player', () => {
        const nearAnchor0 = anchorPoint(0)
        const spawn = findEnergyOrbSpawn(
            { ...player, x: nearAnchor0.x, y: nearAnchor0.y },
            [],
            config
        )
        expect(spawn).toEqual(anchorPoint(1))
    })

    it('skips anchors too close to an asteroid', () => {
        const spawn = findEnergyOrbSpawn(
            player,
            [makeAsteroid(anchorPoint(0).x, anchorPoint(0).y)],
            config
        )
        expect(spawn).toEqual(anchorPoint(1))
    })

    it('wraps cyclically when the starting anchor is blocked', () => {
        const wrapConfig = createAsteroidDriftConfig({ rng: () => 0.99 })
        const nearAnchor0 = anchorPoint(0)
        const spawn = findEnergyOrbSpawn(
            { ...player, x: nearAnchor0.x, y: nearAnchor0.y },
            [
                makeAsteroid(anchorPoint(7).x, anchorPoint(7).y),
                makeAsteroid(anchorPoint(1).x, anchorPoint(1).y),
            ],
            wrapConfig
        )
        expect(spawn).toEqual(anchorPoint(2))
    })

    it('returns null when every anchor is blocked', () => {
        const blockedAnchors = ASTEROID_DRIFT_ORB_ANCHORS.map(anchor =>
            makeAsteroid(
                anchor.x * config.canvasWidth,
                anchor.y * config.canvasHeight
            )
        )
        expect(findEnergyOrbSpawn(player, blockedAnchors, config)).toBeNull()
    })
})
