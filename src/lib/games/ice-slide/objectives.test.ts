import { describe, expect, it } from 'vitest'
import {
    ICE_SLIDE_OBJECTIVE_LABELS,
    isIceSlideObjectiveComplete,
} from './objectives'

describe('Ice Slide objective policy', () => {
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
