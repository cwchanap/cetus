import { clamp } from '@/lib/games/shared/utils'
import type { AsteroidDriftConfig } from './types'

/**
 * Pure scorer: floor(clamped survival) * survival points per second plus
 * floor(normalized orb count) * orb points.
 */
export function calculateAsteroidDriftScore(
    input: { survivalSeconds: number; orbsCollected: number },
    config: Pick<
        AsteroidDriftConfig,
        'duration' | 'survivalPointsPerSecond' | 'orbPoints'
    >
): number {
    const survivalSeconds = Math.floor(
        clamp(
            Number.isFinite(input.survivalSeconds) ? input.survivalSeconds : 0,
            0,
            config.duration
        )
    )
    const orbsCollected = Math.max(
        0,
        Math.floor(
            Number.isFinite(input.orbsCollected) ? input.orbsCollected : 0
        )
    )
    return (
        survivalSeconds * config.survivalPointsPerSecond +
        orbsCollected * config.orbPoints
    )
}
