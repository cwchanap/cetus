import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { updateAllUserStreaksForUTC } from '@/lib/server/db/queries'

// Mock the database client used by queries.ts so internal functions operate without a real DB
vi.mock('@/lib/server/db/client', () => {
    // Helper builders for different table mocks
    const makeUserSelect = () => ({
        select: vi.fn().mockReturnThis(),
        execute: vi
            .fn()
            .mockResolvedValue([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]),
    })

    const makeScoresSelect = () => ({
        select: vi.fn().mockReturnThis(),
        distinct: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi
            .fn()
            .mockResolvedValue([{ user_id: 'u1' }, { user_id: 'u3' }]),
    })

    const makeUserStatsSelect = () => ({
        selectAll: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({
            user_id: 'uX',
            total_games_played: 0,
            total_score: 0,
            favorite_game: null,
            streak_days: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }),
    })

    const makeUpdateChain = () => {
        const chain: Record<string, any> = {}
        chain.set = vi.fn().mockReturnValue(chain)
        chain.where = vi.fn().mockReturnValue(chain)
        chain.execute = vi.fn().mockResolvedValue({})
        return chain
    }

    const updateTable = vi.fn().mockImplementation(() => makeUpdateChain())

    const insertInto = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({}),
    })

    const selectFrom = vi.fn((table: string) => {
        if (table === 'user') {
            return makeUserSelect()
        }
        if (table === 'game_scores') {
            return makeScoresSelect()
        }
        if (table === 'user_stats') {
            return makeUserStatsSelect()
        }
        // default empty mock
        return {
            select: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue([]),
        }
    })

    return {
        db: {
            selectFrom,
            updateTable,
            insertInto,
            fn: {
                count: vi
                    .fn()
                    .mockReturnValue({ as: vi.fn().mockReturnValue('COUNT') }),
            },
        },
    }
})

describe('Streak updates', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('increments streak for users active yesterday and resets others', async () => {
        const res = await updateAllUserStreaksForUTC()
        expect(res).toEqual({ processed: 3, incremented: 2, reset: 1 })
    })
})
