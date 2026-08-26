import { describe, expect, it } from 'vitest'
import { calculateChromaticTideScore } from './scoring'

describe('calculateChromaticTideScore', () => {
    it('scores only cells gained beyond the free initial territory when unfinished', () => {
        expect(
            calculateChromaticTideScore({
                cleared: false,
                capturedCells: 10,
                initialCapturedCells: 3,
                movesUsed: 7,
                secondsRemaining: 42,
            })
        ).toBe(70)
    })

    it('uses the full board base, completion, move, and floored time bonuses when cleared', () => {
        expect(
            calculateChromaticTideScore({
                cleared: true,
                capturedCells: 144,
                initialCapturedCells: 3,
                movesUsed: 18,
                secondsRemaining: 12.9,
            })
        ).toBe(144 * 10 + 500 + (22 - 18) * 25 + 12 * 2)
    })

    it('normalizes non-finite and negative values to non-negative integers', () => {
        expect(
            calculateChromaticTideScore({
                cleared: false,
                capturedCells: NaN,
                initialCapturedCells: Number.POSITIVE_INFINITY,
                movesUsed: -3,
                secondsRemaining: -10,
            })
        ).toBe(0)
        expect(
            calculateChromaticTideScore({
                cleared: true,
                capturedCells: 144,
                initialCapturedCells: 0,
                movesUsed: -3,
                secondsRemaining: Number.POSITIVE_INFINITY,
            })
        ).toBe(144 * 10 + 500 + 22 * 25)
        expect(
            calculateChromaticTideScore({
                cleared: false,
                capturedCells: 5.9,
                initialCapturedCells: 2.1,
                movesUsed: 0,
                secondsRemaining: 0,
            })
        ).toBe(30)
    })

    it('clamps captured cells to the 144-cell board', () => {
        expect(
            calculateChromaticTideScore({
                cleared: false,
                capturedCells: 999,
                initialCapturedCells: 0,
                movesUsed: 0,
                secondsRemaining: 0,
            })
        ).toBe(144 * 10)
    })

    it('clamps initial captured cells to the normalized captured count', () => {
        expect(
            calculateChromaticTideScore({
                cleared: false,
                capturedCells: 5.9,
                initialCapturedCells: 99,
                movesUsed: 0,
                secondsRemaining: 0,
            })
        ).toBe(0)
    })

    it('awards no efficiency bonus for moves beyond the reference', () => {
        expect(
            calculateChromaticTideScore({
                cleared: true,
                capturedCells: 144,
                initialCapturedCells: 1,
                movesUsed: 30,
                secondsRemaining: 0,
            })
        ).toBe(144 * 10 + 500)
    })

    it('clamps remaining seconds between zero and the 90-second duration', () => {
        const baseInput = {
            cleared: true,
            capturedCells: 144,
            initialCapturedCells: 1,
            movesUsed: 22,
        }

        expect(
            calculateChromaticTideScore({
                ...baseInput,
                secondsRemaining: -1,
            })
        ).toBe(144 * 10 + 500)
        expect(
            calculateChromaticTideScore({
                ...baseInput,
                secondsRemaining: 999,
            })
        ).toBe(144 * 10 + 500 + 90 * 2)
    })

    it('keeps unfinished scoring independent of time and moves', () => {
        const progressOnly = calculateChromaticTideScore({
            cleared: false,
            capturedCells: 20,
            initialCapturedCells: 4,
            movesUsed: 0,
            secondsRemaining: 90,
        })
        const delayedProgress = calculateChromaticTideScore({
            cleared: false,
            capturedCells: 20,
            initialCapturedCells: 4,
            movesUsed: 1_000,
            secondsRemaining: 0,
        })

        expect(delayedProgress).toBe(progressOnly)
        expect(progressOnly).toBe(160)
    })
})
