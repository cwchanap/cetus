import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    getUserStatsStrict,
    getUserIdentityByIdStrict,
    getUserAchievementsStrict,
} from '@/lib/server/db/queries'
import { db } from '@/lib/server/db/client'

vi.mock('@/lib/server/db/client', () => ({
    db: {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        updateTable: vi.fn(),
        transaction: vi.fn(),
        fn: {
            count: vi.fn().mockReturnValue({
                as: vi.fn().mockReturnValue('COUNT'),
            }),
        },
    },
}))

describe('Strict user read variants', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('getUserStatsStrict', () => {
        it('should return stats with the distinct game count', async () => {
            const mockStats = {
                id: 1,
                user_id: 'user-123',
                total_games_played: 99,
                total_score: 10000,
                favorite_game: 'tetris',
            }
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(mockStats),
            }
            const mockGamesQuery = {
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi
                    .fn()
                    .mockResolvedValue([
                        { game_id: 'tetris' },
                        { game_id: 'snake' },
                    ]),
            }
            vi.mocked(db.selectFrom)
                .mockReturnValueOnce(mockStatsQuery as any)
                .mockReturnValueOnce(mockGamesQuery as any)

            const result = await getUserStatsStrict('user-123')

            expect(result).not.toBeNull()
            expect(result!.total_games_played).toBe(2)
            expect(result!.total_score).toBe(10000)
        })

        it('should return null when no stats row exists', async () => {
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockStatsQuery as any)

            const result = await getUserStatsStrict('user-123')

            expect(result).toBeNull()
        })

        it('should reject when the stats read fails', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('Connection failed')
            })

            await expect(getUserStatsStrict('user-123')).rejects.toThrow(
                'Connection failed'
            )
        })

        it('should reject when the distinct-game read fails', async () => {
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi
                    .fn()
                    .mockResolvedValue({ id: 1, user_id: 'user-123' }),
            }
            const mockGamesQuery = {
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi
                    .fn()
                    .mockRejectedValue(new Error('game_scores read failed')),
            }
            vi.mocked(db.selectFrom)
                .mockReturnValueOnce(mockStatsQuery as any)
                .mockReturnValueOnce(mockGamesQuery as any)

            await expect(getUserStatsStrict('user-123')).rejects.toThrow(
                'game_scores read failed'
            )
        })
    })

    describe('getUserIdentityByIdStrict', () => {
        it('should return the mapped identity row', async () => {
            const mockUser = {
                id: 'user-123',
                username: 'testuser',
                displayName: 'Test Display',
                image: 'https://example.com/a.png',
                name: 'Test User',
                email: 'test@example.com',
                createdAt: '2024-06-01T12:00:00.000Z',
            }
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(mockUser),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserIdentityByIdStrict('user-123')

            expect(result).toEqual({
                id: 'user-123',
                username: 'testuser',
                displayName: 'Test Display',
                image: 'https://example.com/a.png',
                name: 'Test User',
                email: 'test@example.com',
                createdAt: '2024-06-01T12:00:00.000Z',
            })
        })

        it('should return null when the user row does not exist', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserIdentityByIdStrict('user-999')

            expect(result).toBeNull()
        })

        it('should reject when the identity read fails', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            await expect(getUserIdentityByIdStrict('user-123')).rejects.toThrow(
                'DB error'
            )
        })
    })

    describe('getUserAchievementsStrict', () => {
        it('should return earned achievement records', async () => {
            const mockRecords = [
                {
                    id: 1,
                    user_id: 'user-123',
                    achievement_id: 'first_win',
                    earned_at: new Date('2024-01-01'),
                },
            ]
            const mockQuery = {
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue(mockRecords),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserAchievementsStrict('user-123')

            expect(result).toEqual(mockRecords)
            expect(mockQuery.orderBy).toHaveBeenCalledWith('earned_at', 'desc')
        })

        it('should return an empty array when the user earned nothing', async () => {
            const mockQuery = {
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue([]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserAchievementsStrict('user-123')

            expect(result).toEqual([])
        })

        it('should reject when the achievements read fails', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            await expect(getUserAchievementsStrict('user-123')).rejects.toThrow(
                'DB error'
            )
        })
    })
})
