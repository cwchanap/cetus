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

/** Weighted random pick. */
export function weightedPick<T>(
    items: Array<{ item: T; weight: number }>,
    rng: () => number = Math.random
): T | undefined {
    const total = items.reduce((sum, i) => sum + i.weight, 0)
    let roll = rng() * total
    for (const entry of items) {
        roll -= entry.weight
        if (roll <= 0) {
            return entry.item
        }
    }
    return items[items.length - 1]?.item
}
