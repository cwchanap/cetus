import { POTION_TUBE_CAPACITY, type PotionTube } from './types'

export function getTopRunLength(tube: PotionTube): number {
    if (tube.length === 0) {
        return 0
    }
    const top = tube[tube.length - 1]
    let count = 0
    for (let i = tube.length - 1; i >= 0 && tube[i] === top; i--) {
        count++
    }
    return count
}

export function pourPotion(
    tubes: PotionTube[],
    sourceIndex: number,
    destinationIndex: number,
    capacity = POTION_TUBE_CAPACITY
): { tubes: PotionTube[]; layersMoved: number } | null {
    if (
        !Number.isInteger(sourceIndex) ||
        !Number.isInteger(destinationIndex) ||
        sourceIndex === destinationIndex ||
        sourceIndex < 0 ||
        destinationIndex < 0 ||
        sourceIndex >= tubes.length ||
        destinationIndex >= tubes.length
    ) {
        return null
    }

    const source = tubes[sourceIndex]
    const destination = tubes[destinationIndex]
    if (source.length === 0 || destination.length >= capacity) {
        return null
    }

    const top = source[source.length - 1]
    if (destination.length > 0 && destination[destination.length - 1] !== top) {
        return null
    }

    const layersMoved = Math.min(
        getTopRunLength(source),
        capacity - destination.length
    )
    if (layersMoved <= 0) {
        return null
    }

    const next = tubes.map(tube => [...tube])
    const moved = next[sourceIndex].splice(-layersMoved)
    next[destinationIndex].push(...moved)
    return { tubes: next, layersMoved }
}

export function isPotionSorterSolved(
    tubes: PotionTube[],
    capacity = POTION_TUBE_CAPACITY
): boolean {
    let nonEmpty = 0
    for (const tube of tubes) {
        if (tube.length === 0) {
            continue
        }
        nonEmpty++
        if (tube.length !== capacity || new Set(tube).size !== 1) {
            return false
        }
    }
    return nonEmpty > 0
}

export function hasLegalMove(
    tubes: PotionTube[],
    capacity = POTION_TUBE_CAPACITY
): boolean {
    for (let source = 0; source < tubes.length; source++) {
        for (let destination = 0; destination < tubes.length; destination++) {
            if (pourPotion(tubes, source, destination, capacity)) {
                return true
            }
        }
    }
    return false
}
