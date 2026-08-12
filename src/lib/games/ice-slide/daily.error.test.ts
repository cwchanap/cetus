import { beforeEach, describe, expect, it, vi } from 'vitest'

const validateQuality = vi.hoisted(() => vi.fn())

vi.mock('./quality', () => ({
    validateIceSlideStageQuality: (...args: unknown[]) =>
        validateQuality(...args),
}))

function authoredLevels() {
    return Array.from({ length: 8 }, (_, index) => ({
        id: index + 1,
        name: `Authored ${index + 1}`,
        rows: ['#####', '#S.G#', '#####'],
        parMoves: 1,
    }))
}

describe('Ice Slide Daily generator rejection paths', () => {
    beforeEach(() => {
        vi.resetModules()
        validateQuality.mockReset()
    })

    it('reports a missing authored level reference', async () => {
        vi.doMock('./levels', () => ({ ICE_SLIDE_LEVELS: [] }))
        const { createIceSlideDailyRunDefinition } = await import('./daily')

        expect(() => createIceSlideDailyRunDefinition('2026-08-12')).toThrow(
            'references missing Ice Slide level'
        )
    })

    it('continues past candidates rejected by stage quality and reports exhaustion', async () => {
        vi.doMock('./levels', () => ({ ICE_SLIDE_LEVELS: authoredLevels() }))
        validateQuality.mockReturnValue({ accepted: false })
        const { createIceSlideDailyRunDefinition } = await import('./daily')

        expect(() => createIceSlideDailyRunDefinition('2026-08-12')).toThrow(
            'has no eligible authored candidate'
        )
        expect(validateQuality).toHaveBeenCalled()
    })

    it('continues past candidates with no eligible bonus objective', async () => {
        vi.doMock('./levels', () => ({ ICE_SLIDE_LEVELS: authoredLevels() }))
        validateQuality.mockReturnValue({
            accepted: true,
            canonicalKey: 'candidate',
            parMoves: 1,
            objectiveFeasibility: {
                collect_all_crystals: false,
                no_falls: false,
                no_reset: false,
            },
        })
        const { createIceSlideDailyRunDefinition } = await import('./daily')

        expect(() => createIceSlideDailyRunDefinition('2026-08-12')).toThrow(
            'has no eligible authored candidate'
        )
        expect(validateQuality).toHaveBeenCalled()
    })
})
