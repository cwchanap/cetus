import { describe, expect, it } from 'vitest'
import {
    getIceSlideObjectiveFeasibility,
    ICE_SLIDE_OBJECTIVE_IDS,
    ICE_SLIDE_OBJECTIVE_LABELS,
    isIceSlideObjectiveComplete,
} from './objectives'
import type { IceSlideSolveResult } from './solver'

describe('Ice Slide objective policy', () => {
    it('computes the shared objective order and feasibility from board facts', () => {
        expect(ICE_SLIDE_OBJECTIVE_IDS).toEqual([
            'collect_all_crystals',
            'no_falls',
            'no_reset',
        ])

        const allEligible = getIceSlideObjectiveFeasibility(
            ['#####', '#S.C#', '#..G#', '#.H.#', '#####'],
            {
                solvable: true,
                minMoves: 2,
                reachableStopCount: 5,
                reachableCrystalIds: ['1,3'],
                reachedGoalWithAllCrystals: true,
                exploredStates: 8,
                truncated: false,
            }
        )

        expect(allEligible).toEqual({
            collect_all_crystals: true,
            no_falls: true,
            no_reset: true,
        })

        const solvableResult: IceSlideSolveResult = {
            solvable: true,
            minMoves: 1,
            reachableStopCount: 2,
            reachableCrystalIds: [],
            reachedGoalWithAllCrystals: false,
            exploredStates: 2,
            truncated: false,
        }
        const noCrystal = getIceSlideObjectiveFeasibility(
            ['#####', '#S..#', '#..G#', '#...#', '#####'],
            solvableResult
        )
        const noHazard = getIceSlideObjectiveFeasibility(
            ['#####', '#S.C#', '#..G#', '#...#', '#####'],
            { ...solvableResult, reachedGoalWithAllCrystals: true }
        )
        const cannotFinishWithAllCrystals = getIceSlideObjectiveFeasibility(
            ['#####', '#S.C#', '#..G#', '#.H.#', '#####'],
            solvableResult
        )
        const solvable = getIceSlideObjectiveFeasibility(
            ['#####', '#S..#', '#..G#', '#...#', '#####'],
            solvableResult
        )

        expect(noCrystal.collect_all_crystals).toBe(false)
        expect(noHazard.no_falls).toBe(false)
        expect(cannotFinishWithAllCrystals.collect_all_crystals).toBe(false)
        expect(solvable.no_reset).toBe(true)
    })

    it('requires at least one crystal and collecting them all', () => {
        expect(
            isIceSlideObjectiveComplete('collect_all_crystals', {
                crystalsCollected: 2,
                totalCrystals: 2,
                stageFalls: 0,
                stageResets: 0,
            })
        ).toBe(true)
        expect(
            isIceSlideObjectiveComplete('collect_all_crystals', {
                crystalsCollected: 1,
                totalCrystals: 2,
                stageFalls: 0,
                stageResets: 0,
            })
        ).toBe(false)
        expect(
            isIceSlideObjectiveComplete('collect_all_crystals', {
                crystalsCollected: 0,
                totalCrystals: 0,
                stageFalls: 0,
                stageResets: 0,
            })
        ).toBe(false)
    })

    it('checks no_falls against stage falls only', () => {
        expect(
            isIceSlideObjectiveComplete('no_falls', {
                crystalsCollected: 0,
                totalCrystals: 0,
                stageFalls: 0,
                stageResets: 4,
            })
        ).toBe(true)
        expect(
            isIceSlideObjectiveComplete('no_falls', {
                crystalsCollected: 0,
                totalCrystals: 0,
                stageFalls: 1,
                stageResets: 0,
            })
        ).toBe(false)
    })

    it('checks no_reset against stage resets only', () => {
        expect(
            isIceSlideObjectiveComplete('no_reset', {
                crystalsCollected: 0,
                totalCrystals: 0,
                stageFalls: 3,
                stageResets: 0,
            })
        ).toBe(true)
        expect(
            isIceSlideObjectiveComplete('no_reset', {
                crystalsCollected: 0,
                totalCrystals: 0,
                stageFalls: 0,
                stageResets: 1,
            })
        ).toBe(false)
    })

    it('exposes concise labels for each objective', () => {
        expect(ICE_SLIDE_OBJECTIVE_LABELS).toEqual({
            collect_all_crystals: 'Collect all crystals',
            no_falls: 'No falls',
            no_reset: 'No resets',
        })
    })
})
