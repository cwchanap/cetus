import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/server/db/client', () => ({
    db: {
        selectFrom: vi.fn(),
    },
}))

vi.mock('@/lib/server/db/game-score-context', async importOriginal => {
    const actual =
        await importOriginal<
            typeof import('@/lib/server/db/game-score-context')
        >()
    return {
        ...actual,
        ensureGameScoresContextSchema: vi.fn(),
    }
})

import { db } from '@/lib/server/db/client'
import { getGameLeaderboard, getUserBestScore } from '@/lib/server/db/queries'
import { ensureGameScoresContextSchema } from '@/lib/server/db/game-score-context'

const mockSelectFrom = vi.mocked(db.selectFrom)
const mockEnsure = vi.mocked(ensureGameScoresContextSchema)

describe('Score context read failure (unknown capability)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockEnsure.mockResolvedValue({ known: false })
    })

    it('returns [] from getGameLeaderboard without querying', async () => {
        const result = await getGameLeaderboard('tetris', 10)

        expect(result).toEqual([])
        expect(mockEnsure).toHaveBeenCalled()
        expect(mockSelectFrom).not.toHaveBeenCalled()
    })

    it('returns an unavailable result from getUserBestScore without querying', async () => {
        const result = await getUserBestScore('u1', 'tetris')

        expect(result).toEqual({
            status: 'unavailable',
            code: 'SCORE_CONTEXT_UNAVAILABLE',
        })
        expect(mockEnsure).toHaveBeenCalled()
        expect(mockSelectFrom).not.toHaveBeenCalled()
    })
})
