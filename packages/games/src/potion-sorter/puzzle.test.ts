import { describe, expect, it } from 'vitest'
import { type PotionTube } from './types'
import {
    getTopRunLength,
    hasLegalMove,
    isPotionSorterSolved,
    pourPotion,
} from './puzzle'

describe('getTopRunLength', () => {
    it('counts the contiguous matching run at the top of a tube', () => {
        expect(getTopRunLength(['cyan', 'magenta', 'magenta'])).toBe(2)
        expect(getTopRunLength([])).toBe(0)
    })
})

describe('pourPotion', () => {
    it('moves a matching top run into an empty or matching destination', () => {
        const original = [
            ['cyan', 'magenta', 'magenta'],
            ['magenta'],
            [],
        ] as PotionTube[]
        const poured = pourPotion(original, 0, 1)
        expect(poured?.layersMoved).toBe(2)
        expect(poured?.tubes).toEqual([
            ['cyan'],
            ['magenta', 'magenta', 'magenta'],
            [],
        ])
        expect(original).toEqual([
            ['cyan', 'magenta', 'magenta'],
            ['magenta'],
            [],
        ])
    })

    it('moves only the layers that fit into a partially full destination', () => {
        const poured = pourPotion(
            [
                ['cyan', 'magenta', 'magenta'],
                ['magenta', 'magenta', 'magenta'],
            ],
            0,
            1
        )
        expect(poured?.layersMoved).toBe(1)
        expect(poured?.tubes).toEqual([
            ['cyan', 'magenta'],
            ['magenta', 'magenta', 'magenta', 'magenta'],
        ])
    })

    it('returns null for invalid pours', () => {
        expect(pourPotion([['cyan'], ['magenta']], 0, 1)).toBeNull()
        expect(pourPotion([['cyan'], []], 0, 0)).toBeNull()
        expect(pourPotion([[], ['cyan']], 0, 1)).toBeNull()
        expect(
            pourPotion([['cyan'], ['cyan', 'cyan', 'cyan', 'cyan']], 0, 1)
        ).toBeNull()
    })
})

describe('isPotionSorterSolved', () => {
    it('detects solved and unsolved layouts', () => {
        expect(
            isPotionSorterSolved([
                ['cyan', 'cyan', 'cyan', 'cyan'],
                ['magenta', 'magenta', 'magenta', 'magenta'],
                [],
            ])
        ).toBe(true)
        expect(isPotionSorterSolved([['cyan'], []])).toBe(false)
        expect(isPotionSorterSolved([])).toBe(false)
    })
})

describe('hasLegalMove', () => {
    it('detects whether any immediate legal pour exists', () => {
        expect(hasLegalMove([['cyan'], []])).toBe(true)
        expect(hasLegalMove([['cyan'], ['magenta']])).toBe(false)
        expect(hasLegalMove([])).toBe(false)
    })
})
