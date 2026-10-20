import { distance } from '@/lib/games/shared/geometry'
import { clamp, lerp } from '@/lib/games/shared/utils'
import type {
    AsteroidDriftAsteroid,
    AsteroidDriftConfig,
    AsteroidDriftPlayer,
} from './types'

export type AsteroidSpawnEdge = 'top' | 'right' | 'bottom' | 'left'

/** Clamp one RNG sample into a finite [0, 1) value. */
function unitSample(rng: () => number): number {
    const value = rng()
    if (!Number.isFinite(value)) {
        return 0
    }
    return Math.min(1 - Number.EPSILON, Math.max(0, value))
}

/**
 * Edges the player is at least `asteroidSafeEdgeDistance` away from.
 * An edge is eligible when the player's center distance to it meets
 * the safe distance, inclusive.
 */
export function eligibleAsteroidSpawnEdges(
    player: Pick<AsteroidDriftPlayer, 'x' | 'y'>,
    config: AsteroidDriftConfig
): AsteroidSpawnEdge[] {
    const edges: AsteroidSpawnEdge[] = []
    if (player.y >= config.asteroidSafeEdgeDistance) {
        edges.push('top')
    }
    if (player.x <= config.canvasWidth - config.asteroidSafeEdgeDistance) {
        edges.push('right')
    }
    if (player.y <= config.canvasHeight - config.asteroidSafeEdgeDistance) {
        edges.push('bottom')
    }
    if (player.x >= config.asteroidSafeEdgeDistance) {
        edges.push('left')
    }
    return edges
}

/** RNG-free opening asteroid outside the right edge at center Y. */
export function createIntroAsteroid(
    id: string,
    config: AsteroidDriftConfig
): AsteroidDriftAsteroid {
    return {
        id,
        x:
            config.canvasWidth +
            config.asteroidSpawnPadding +
            config.introAsteroidRadius,
        y: config.canvasHeight / 2,
        velocityX: -config.asteroidInitialSpeed,
        velocityY: 0,
        radius: config.introAsteroidRadius,
    }
}

/**
 * One finite random materialization: edge, radius, along-edge coordinate,
 * target x, target y, and speed jitter — exactly six RNG samples, no retry
 * loop. Spawns fully outside its selected edge aiming at the target-inset
 * rectangle with ramped speed plus bounded jitter.
 */
export function createRandomAsteroid(
    id: string,
    player: Pick<AsteroidDriftPlayer, 'x' | 'y'>,
    progress: number,
    config: AsteroidDriftConfig
): AsteroidDriftAsteroid {
    const edges = eligibleAsteroidSpawnEdges(player, config)
    if (edges.length === 0) {
        throw new RangeError('Asteroid Drift has no eligible spawn edge')
    }

    const edge = edges[Math.floor(unitSample(config.rng) * edges.length)]
    const radius = lerp(
        config.asteroidMinRadius,
        config.asteroidMaxRadius,
        unitSample(config.rng)
    )
    const outside = config.asteroidSpawnPadding + radius

    let x: number
    let y: number
    if (edge === 'top' || edge === 'bottom') {
        x = lerp(0, config.canvasWidth, unitSample(config.rng))
        y = edge === 'top' ? -outside : config.canvasHeight + outside
    } else {
        x = edge === 'left' ? -outside : config.canvasWidth + outside
        y = lerp(0, config.canvasHeight, unitSample(config.rng))
    }

    const targetX = lerp(
        config.asteroidTargetInset,
        config.canvasWidth - config.asteroidTargetInset,
        unitSample(config.rng)
    )
    const targetY = lerp(
        config.asteroidTargetInset,
        config.canvasHeight - config.asteroidTargetInset,
        unitSample(config.rng)
    )
    const directionX = targetX - x
    const directionY = targetY - y
    const directionLength = Math.hypot(directionX, directionY)

    const rampedSpeed = lerp(
        config.asteroidInitialSpeed,
        config.asteroidFinalSpeed,
        clamp(progress, 0, 1)
    )
    const jitter = (unitSample(config.rng) * 2 - 1) * config.asteroidSpeedJitter
    const speed = rampedSpeed * (1 + jitter)

    return {
        id,
        x,
        y,
        velocityX: (directionX / directionLength) * speed,
        velocityY: (directionY / directionLength) * speed,
        radius,
    }
}

/** Strict padded-bounds predicate: exact expanded boundaries stay active. */
export function isAsteroidOffArena(
    asteroid: AsteroidDriftAsteroid,
    config: AsteroidDriftConfig
): boolean {
    const margin = config.asteroidSpawnPadding + asteroid.radius
    return (
        asteroid.x < -margin ||
        asteroid.x > config.canvasWidth + margin ||
        asteroid.y < -margin ||
        asteroid.y > config.canvasHeight + margin
    )
}

export const ASTEROID_DRIFT_ORB_ANCHORS = [
    { x: 0.16, y: 0.18 },
    { x: 0.5, y: 0.14 },
    { x: 0.84, y: 0.18 },
    { x: 0.12, y: 0.5 },
    { x: 0.88, y: 0.5 },
    { x: 0.16, y: 0.82 },
    { x: 0.5, y: 0.86 },
    { x: 0.84, y: 0.82 },
] as const

/**
 * One finite orb spawn attempt: a single RNG sample picks the starting
 * anchor, then all eight anchors are scanned once cyclically. The first
 * point clearing the player and every asteroid is returned; otherwise null.
 */
export function findEnergyOrbSpawn(
    player: Pick<AsteroidDriftPlayer, 'x' | 'y'>,
    asteroids: readonly AsteroidDriftAsteroid[],
    config: AsteroidDriftConfig
): { x: number; y: number } | null {
    const startIndex = Math.floor(
        unitSample(config.rng) * ASTEROID_DRIFT_ORB_ANCHORS.length
    )
    for (let offset = 0; offset < ASTEROID_DRIFT_ORB_ANCHORS.length; offset++) {
        const anchor =
            ASTEROID_DRIFT_ORB_ANCHORS[
                (startIndex + offset) % ASTEROID_DRIFT_ORB_ANCHORS.length
            ]
        const candidate = {
            x: anchor.x * config.canvasWidth,
            y: anchor.y * config.canvasHeight,
        }
        if (distance(candidate, player) < config.orbPlayerMinDistance) {
            continue
        }
        const clear = asteroids.every(
            asteroid =>
                distance(candidate, asteroid) >=
                config.orbAsteroidClearance + asteroid.radius + config.orbRadius
        )
        if (clear) {
            return candidate
        }
    }
    return null
}
