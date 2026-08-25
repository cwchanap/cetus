import { describe, expect, it } from 'vitest'
import { createAsteroidDriftConfig } from './types'
import { calculateAsteroidDriftScore } from './scoring'

const config = createAsteroidDriftConfig()

it('scores whole simulated seconds plus orb bonuses', () => {
    expect(
        calculateAsteroidDriftScore(
            { survivalSeconds: 12.99, orbsCollected: 2 },
            config
        )
    ).toBe(12 * config.survivalPointsPerSecond + 2 * config.orbPoints)
})

it('clamps survival and normalizes orb count', () => {
    expect(
        calculateAsteroidDriftScore(
            { survivalSeconds: -5, orbsCollected: -2 },
            config
        )
    ).toBe(0)
    expect(
        calculateAsteroidDriftScore(
            { survivalSeconds: config.duration + 99, orbsCollected: 1.9 },
            config
        )
    ).toBe(config.duration * config.survivalPointsPerSecond + config.orbPoints)
})

it('uses supplied point values', () => {
    const tuned = createAsteroidDriftConfig({
        duration: 10,
        survivalPointsPerSecond: 2,
        orbPoints: 7,
    })
    expect(
        calculateAsteroidDriftScore(
            { survivalSeconds: 10, orbsCollected: 3 },
            tuned
        )
    ).toBe(41)
})
