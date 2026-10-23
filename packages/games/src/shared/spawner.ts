/**
 * Shared spawning utilities for coin/bomb style games.
 */

export type SpawnType = 'coin' | 'bomb'

/** Decide coin vs bomb based on a coinToBombRatio (coins per bomb). */
export function rollSpawnType(
    coinToBombRatio: number,
    rng: () => number = Math.random
): SpawnType {
    return rng() < coinToBombRatio / (coinToBombRatio + 1) ? 'coin' : 'bomb'
}
