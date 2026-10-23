import { afterEach, describe, expect, it, vi } from 'vitest'

describe('Campaign run materialization guards', () => {
    afterEach(() => {
        vi.doUnmock('./levels')
    })

    it('rejects authored level and difficulty table length drift', async () => {
        vi.resetModules()
        vi.doMock('./levels', () => ({ ICE_SLIDE_LEVELS: [] }))

        const { createCampaignRunDefinition } = await import('./run')

        expect(() => createCampaignRunDefinition()).toThrow(
            'CAMPAIGN_STAGE_DIFFICULTIES and ICE_SLIDE_LEVELS must have the same length'
        )
    })
})
