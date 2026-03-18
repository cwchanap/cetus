import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    upsertUserStats,
    updateUserLevel,
    incrementUserStreak,
    resetUserStreak,
    getUserChallengeProgress,
    upsertChallengeProgress,
    updateChallengeProgressValue,
    completeChallengeAndAwardXP,
    atomicCheckAndUpdateStreak,
    claimLoginReward,
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
                distinct: vi.fn().mockReturnValue({
                    as: vi.fn().mockReturnValue('COUNT_DISTINCT'),
                }),
            }),
            sum: vi.fn().mockReturnValue({
                as: vi.fn().mockReturnValue('SUM'),
            }),
        },
    },
}))

vi.mock('@/lib/challenges', () => ({
    // Simplified formula (intentional): real code uses LEVEL_THRESHOLDS array, but this linear
    // approximation is sufficient for testing level-change detection in these unit tests.
    getLevelFromXP: vi.fn((xp: number) => Math.floor(xp / 100) + 1),
}))

describe('Extended Database Queries Part 2', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('upsertUserStats', () => {
        it('should update existing user stats', async () => {
            // getUserStats returns existing stats
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({
                    id: 1,
                    user_id: 'user-123',
                    total_games_played: 5,
                    total_score: 1000,
                }),
                execute: vi.fn().mockResolvedValue([{ game_id: 'tetris' }]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockStatsQuery as any)

            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            const result = await upsertUserStats('user-123', {
                total_score: 2000,
            })

            expect(result).toBe(true)
            expect(db.updateTable).toHaveBeenCalledWith('user_stats')
        })

        it('should create new user stats when not existing', async () => {
            // getUserStats returns null (no existing row)
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
                execute: vi.fn().mockResolvedValue([]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockStatsQuery as any)

            const mockInsertQuery = {
                values: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.insertInto).mockReturnValue(mockInsertQuery as any)

            const result = await upsertUserStats('new-user', {
                total_score: 500,
            })

            expect(result).toBe(true)
            expect(db.insertInto).toHaveBeenCalledWith('user_stats')
        })

        it('should return false on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('Connection failed')
            })
            // Also mock insertInto so the insert path (reached when getUserStats returns null)
            // also fails, ensuring upsertUserStats catches the error and returns false
            vi.mocked(db.insertInto).mockImplementation(() => {
                throw new Error('Connection failed')
            })

            const result = await upsertUserStats('user-123', {
                total_score: 100,
            })

            expect(result).toBe(false)
        })
    })

    describe('updateUserLevel', () => {
        it('should update user level successfully', async () => {
            // getUserStats returns stats (for upsertUserStats update path)
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({
                    id: 1,
                    user_id: 'user-123',
                }),
                execute: vi.fn().mockResolvedValue([]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockStatsQuery as any)

            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            const result = await updateUserLevel('user-123', 5)

            expect(result).toBe(true)
        })

        it('should return false on error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })
            // Also mock insertInto so the upsertUserStats insert path fails too,
            // ensuring upsertUserStats returns false regardless of which branch runs
            vi.mocked(db.insertInto).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await updateUserLevel('user-123', 5)

            expect(result).toBe(false)
        })
    })

    describe('incrementUserStreak', () => {
        it('should increment streak for user', async () => {
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({
                    id: 1,
                    user_id: 'user-123',
                    streak_days: 3,
                }),
                execute: vi.fn().mockResolvedValue([{ game_id: 'tetris' }]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockStatsQuery as any)

            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            const result = await incrementUserStreak('user-123')

            expect(result).toBe(true)
        })

        it('should return true even when inner db calls fail (errors are handled internally)', async () => {
            // getUserStats and upsertUserStats each have their own try/catch,
            // so errors never propagate to incrementUserStreak's catch — it always returns true
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB selectFrom failure')
            })
            vi.mocked(db.insertInto).mockImplementation(() => {
                throw new Error('DB insertInto failure')
            })
            vi.mocked(db.updateTable).mockImplementation(() => {
                throw new Error('DB updateTable failure')
            })

            const result = await incrementUserStreak('user-123')

            expect(result).toBe(true)
        })
    })

    describe('resetUserStreak', () => {
        it('should reset user streak to zero', async () => {
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({
                    id: 1,
                    user_id: 'user-123',
                    streak_days: 5,
                }),
                execute: vi.fn().mockResolvedValue([]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockStatsQuery as any)

            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            const result = await resetUserStreak('user-123')

            expect(result).toBe(true)
        })

        it('should return true even when inner db calls fail (errors are handled internally)', async () => {
            // upsertUserStats has its own try/catch, so errors never propagate to
            // resetUserStreak's catch — it always returns true on internal DB failures
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB selectFrom failure')
            })
            vi.mocked(db.insertInto).mockImplementation(() => {
                throw new Error('DB insertInto failure')
            })
            vi.mocked(db.updateTable).mockImplementation(() => {
                throw new Error('DB updateTable failure')
            })

            const result = await resetUserStreak('user-123')

            expect(result).toBe(true)
        })
    })

    describe('getUserChallengeProgress', () => {
        it('should return challenge progress for user and date', async () => {
            const mockProgress = [
                {
                    id: 1,
                    user_id: 'user-123',
                    challenge_date: '2024-01-15',
                    challenge_id: 'play_5_games',
                    current_value: 3,
                    target_value: 5,
                    completed_at: null,
                    xp_awarded: 0,
                },
            ]
            const mockQuery = {
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue(mockProgress),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserChallengeProgress(
                'user-123',
                '2024-01-15'
            )

            expect(result).toEqual(mockProgress)
            expect(result).toHaveLength(1)
        })

        it('should return empty array on error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getUserChallengeProgress(
                'user-123',
                '2024-01-15'
            )

            expect(result).toEqual([])
        })
    })

    describe('upsertChallengeProgress', () => {
        it('should create or update challenge progress', async () => {
            const mockInsertQuery = {
                values: vi.fn().mockReturnThis(),
                onConflict: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            const mockOnConflict = {
                columns: vi.fn().mockReturnThis(),
                doNothing: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.insertInto).mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflict: vi.fn().mockReturnValue({
                        ...mockOnConflict,
                        execute: vi.fn().mockResolvedValue({}),
                    }),
                }),
            } as any)

            const result = await upsertChallengeProgress(
                'user-123',
                '2024-01-15',
                'play_5_games',
                5
            )

            expect(result).toBe(true)
        })

        it('should return false on error', async () => {
            vi.mocked(db.insertInto).mockImplementation(() => {
                throw new Error('Insert failed')
            })

            const result = await upsertChallengeProgress(
                'user-123',
                '2024-01-15',
                'play_5_games',
                5
            )

            expect(result).toBe(false)
        })
    })

    describe('updateChallengeProgressValue', () => {
        it('should update progress value successfully', async () => {
            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            const result = await updateChallengeProgressValue(
                'user-123',
                '2024-01-15',
                'play_5_games',
                4
            )

            expect(result).toBe(true)
            expect(db.updateTable).toHaveBeenCalledWith(
                'daily_challenge_progress'
            )
        })

        it('should return false on error', async () => {
            vi.mocked(db.updateTable).mockImplementation(() => {
                throw new Error('Update failed')
            })

            const result = await updateChallengeProgressValue(
                'user-123',
                '2024-01-15',
                'play_5_games',
                4
            )

            expect(result).toBe(false)
        })
    })

    describe('completeChallengeAndAwardXP', () => {
        it('should return false when progress not found in transaction', async () => {
            const mockTrx = {
                selectFrom: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
                }),
                updateTable: vi.fn(),
                insertInto: vi.fn(),
            }
            vi.mocked(db.transaction).mockReturnValue({
                execute: vi
                    .fn()
                    .mockImplementation(
                        async (
                            fn: (trx: typeof mockTrx) => Promise<unknown>
                        ) => {
                            return fn(mockTrx)
                        }
                    ),
            } as any)
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const result = await completeChallengeAndAwardXP(
                'user-123',
                '2024-01-15',
                'play_5_games',
                50
            )

            // Progress not found throws, caught and returns false
            expect(result).toBe(false)
        })

        it('should return false on database error', async () => {
            vi.mocked(db.transaction).mockImplementation(() => {
                throw new Error('Transaction failed')
            })

            const result = await completeChallengeAndAwardXP(
                'user-123',
                '2024-01-15',
                'play_5_games',
                50
            )

            expect(result).toBe(false)
        })

        it('should return true when XP already awarded (idempotent)', async () => {
            const mockTrx = {
                selectFrom: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    executeTakeFirst: vi
                        .fn()
                        .mockResolvedValue({ xp_awarded: 50 }),
                }),
                updateTable: vi.fn(),
                insertInto: vi.fn(),
            }
            vi.mocked(db.transaction).mockReturnValue({
                execute: vi
                    .fn()
                    .mockImplementation(
                        async (
                            fn: (trx: typeof mockTrx) => Promise<unknown>
                        ) => {
                            return fn(mockTrx)
                        }
                    ),
            } as any)
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const result = await completeChallengeAndAwardXP(
                'user-123',
                '2024-01-15',
                'play_5_games',
                50
            )

            expect(result).toBe(true)
        })
    })

    describe('atomicCheckAndUpdateStreak', () => {
        it('should return false when challenges not completed', async () => {
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const result = await atomicCheckAndUpdateStreak(
                'user-123',
                '2024-01-15',
                false
            )

            expect(result).toBe(false)
        })

        it('should return false on database error', async () => {
            vi.mocked(db.transaction).mockImplementation(() => {
                throw new Error('Transaction failed')
            })

            const result = await atomicCheckAndUpdateStreak(
                'user-123',
                '2024-01-15',
                true
            )

            expect(result).toBe(false)
        })

        it('should use transaction when all challenges completed', async () => {
            const mockTrx = {
                selectFrom: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
                }),
                insertInto: vi.fn().mockReturnValue({
                    values: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue({}),
                }),
                updateTable: vi.fn(),
            }
            vi.mocked(db.transaction).mockReturnValue({
                execute: vi
                    .fn()
                    .mockImplementation(
                        async (
                            fn: (trx: typeof mockTrx) => Promise<unknown>
                        ) => {
                            return fn(mockTrx)
                        }
                    ),
            } as any)
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const result = await atomicCheckAndUpdateStreak(
                'user-123',
                '2024-01-15',
                true
            )

            expect(result).toBe(true)
            expect(db.transaction).toHaveBeenCalled()
        })
    })

    describe('claimLoginReward', () => {
        it('should return failure when transaction fails', async () => {
            vi.mocked(db.transaction).mockImplementation(() => {
                throw new Error('Transaction error')
            })
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const result = await claimLoginReward(
                'user-123',
                '2024-01-15',
                1,
                50,
                false
            )

            expect(result.success).toBe(false)
        })

        it('should return false when already claimed today', async () => {
            const today = '2024-01-15'
            const mockTrx = {
                selectFrom: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    executeTakeFirst: vi.fn().mockResolvedValue({
                        xp: 100,
                        level: 2,
                        last_login_reward_date: today,
                    }),
                }),
                updateTable: vi.fn(),
                insertInto: vi.fn(),
            }
            vi.mocked(db.transaction).mockReturnValue({
                execute: vi
                    .fn()
                    .mockImplementation(
                        async (
                            fn: (trx: typeof mockTrx) => Promise<unknown>
                        ) => {
                            return fn(mockTrx)
                        }
                    ),
            } as any)
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const result = await claimLoginReward(
                'user-123',
                today,
                1,
                50,
                false
            )

            expect(result.success).toBe(false)
        })

        it('should successfully claim reward for new user', async () => {
            const today = '2024-01-15'
            const mockTrx = {
                selectFrom: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    executeTakeFirst: vi.fn().mockResolvedValue(undefined), // no stats row
                }),
                updateTable: vi.fn().mockReturnValue({
                    set: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue({}),
                }),
                insertInto: vi.fn().mockReturnValue({
                    values: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue({}),
                }),
            }
            vi.mocked(db.transaction).mockReturnValue({
                execute: vi
                    .fn()
                    .mockImplementation(
                        async (
                            fn: (trx: typeof mockTrx) => Promise<unknown>
                        ) => {
                            return fn(mockTrx)
                        }
                    ),
            } as any)
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const result = await claimLoginReward(
                'user-123',
                today,
                1,
                50,
                false
            )

            expect(result.success).toBe(true)
        })

        it('should handle cycle completed flag', async () => {
            const today = '2024-01-15'
            const mockTrx = {
                selectFrom: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    executeTakeFirst: vi.fn().mockResolvedValue({
                        xp: 100,
                        level: 2,
                        last_login_reward_date: '2024-01-14', // yesterday
                    }),
                }),
                updateTable: vi.fn().mockReturnValue({
                    set: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue({}),
                }),
                insertInto: vi.fn(),
            }
            vi.mocked(db.transaction).mockReturnValue({
                execute: vi
                    .fn()
                    .mockImplementation(
                        async (
                            fn: (trx: typeof mockTrx) => Promise<unknown>
                        ) => {
                            return fn(mockTrx)
                        }
                    ),
            } as any)
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const result = await claimLoginReward(
                'user-123',
                today,
                7,
                100,
                true // cycleCompleted
            )

            expect(result.success).toBe(true)
        })
    })
})
