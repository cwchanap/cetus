import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

export const ASTEROID_DRIFT_RULES = {
    duration: 90,
    canvasWidth: 800,
    canvasHeight: 480,

    playerRadius: 16,
    thrustAcceleration: 720,
    dragPerSecond: 1.7,
    maxPlayerSpeed: 300,

    maxUpdateDelta: 0.1,
    maxPhysicsStep: 1 / 120,

    introAsteroidRadius: 26,
    asteroidSpawnPadding: 40,
    asteroidMinRadius: 18,
    asteroidMaxRadius: 36,
    asteroidInitialInterval: 1.35,
    asteroidFinalInterval: 0.45,
    asteroidInitialSpeed: 140,
    asteroidFinalSpeed: 240,
    asteroidSpeedJitter: 0.15,
    asteroidTargetInset: 80,
    asteroidSafeEdgeDistance: 190,
    maxAsteroids: 24,
    openingRandomSpawnGrace: 4,

    orbRadius: 12,
    orbSpawnInterval: 4,
    orbLifetime: 7,
    orbPlayerMinDistance: 150,
    orbAsteroidClearance: 70,

    survivalPointsPerSecond: 10,
    orbPoints: 100,
} as const

export interface AsteroidDriftConfig extends BaseGameConfig {
    canvasWidth: number
    canvasHeight: number
    playerRadius: number
    thrustAcceleration: number
    dragPerSecond: number
    maxPlayerSpeed: number
    maxUpdateDelta: number
    maxPhysicsStep: number
    introAsteroidRadius: number
    asteroidSpawnPadding: number
    asteroidMinRadius: number
    asteroidMaxRadius: number
    asteroidInitialInterval: number
    asteroidFinalInterval: number
    asteroidInitialSpeed: number
    asteroidFinalSpeed: number
    asteroidSpeedJitter: number
    asteroidTargetInset: number
    asteroidSafeEdgeDistance: number
    maxAsteroids: number
    openingRandomSpawnGrace: number
    orbRadius: number
    orbSpawnInterval: number
    orbLifetime: number
    orbPlayerMinDistance: number
    orbAsteroidClearance: number
    survivalPointsPerSecond: number
    orbPoints: number
    rng: () => number
}

export function createAsteroidDriftConfig(
    overrides: Partial<AsteroidDriftConfig> = {}
): AsteroidDriftConfig {
    return {
        ...ASTEROID_DRIFT_RULES,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        rng: Math.random,
        ...overrides,
    }
}

export type AsteroidDriftDirection = 'up' | 'down' | 'left' | 'right'
export type AsteroidDriftInputSource = 'keyboard' | 'touch'
export type AsteroidDriftOutcome =
    | 'playing'
    | 'collision'
    | 'survived'
    | 'expired'

export interface AsteroidDriftPlayer {
    x: number
    y: number
    velocityX: number
    velocityY: number
    radius: number
}

export interface AsteroidDriftAsteroid {
    id: string
    x: number
    y: number
    velocityX: number
    velocityY: number
    radius: number
}

export interface AsteroidDriftOrb {
    id: string
    x: number
    y: number
    radius: number
    ageSeconds: number
}

export interface AsteroidDriftState extends BaseGameState {
    outcome: AsteroidDriftOutcome
    player: AsteroidDriftPlayer
    asteroids: AsteroidDriftAsteroid[]
    energyOrb: AsteroidDriftOrb | null
    orbsCollected: number
}

export interface AsteroidDriftStats extends BaseGameStats {
    outcome: AsteroidDriftOutcome
    survivalSeconds: number
    orbsCollected: number
}

export interface AsteroidDriftGameData {
    survivalSeconds: number
    orbsCollected: number
    survivedFullRun: boolean
}
