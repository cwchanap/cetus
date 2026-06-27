import { describe, it, expect } from 'vitest'
import {
    comboMultiplier,
    lockPoints,
    levelClearBonus,
    timeBonus,
} from './scoring'

describe('comboMultiplier', () => {
    it('is 1 for combo counts of 1 or less', () => {
        expect(comboMultiplier(1)).toBe(1)
        expect(comboMultiplier(0)).toBe(1)
    })
    it('grows by 0.5 per combo step', () => {
        expect(comboMultiplier(2)).toBe(1.5)
        expect(comboMultiplier(3)).toBe(2)
        expect(comboMultiplier(4)).toBe(2.5)
    })
    it('caps at 3', () => {
        expect(comboMultiplier(5)).toBe(3)
        expect(comboMultiplier(20)).toBe(3)
    })
})

describe('lockPoints', () => {
    it('applies the combo multiplier to the base and rounds', () => {
        expect(lockPoints(1)).toBe(100)
        expect(lockPoints(2)).toBe(150)
        expect(lockPoints(3)).toBe(200)
    })
})

describe('levelClearBonus', () => {
    it('scales with 1-based level number', () => {
        expect(levelClearBonus(1)).toBe(250)
        expect(levelClearBonus(4)).toBe(1000)
        expect(levelClearBonus(8)).toBe(2000)
    })
})

describe('timeBonus', () => {
    it('awards 10 points per remaining second, never negative', () => {
        expect(timeBonus(0)).toBe(0)
        expect(timeBonus(12)).toBe(120)
        expect(timeBonus(-5)).toBe(0)
    })
})
