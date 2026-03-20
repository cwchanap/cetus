import { describe, it, expect } from 'vitest'
import {
    getAllAchievements,
    getAchievementById,
    getAchievementsByGame,
    getGlobalAchievements,
    getRarityColor,
    getRarityGlow,
    getPaginatedAchievements,
    ACHIEVEMENTS,
} from './achievements'
import { GameID } from './games'

describe('Achievement System', () => {
    describe('getAllAchievements', () => {
        it('should return all achievements', () => {
            const achievements = getAllAchievements()
            expect(achievements).toEqual(ACHIEVEMENTS)
            expect(achievements.length).toBeGreaterThan(0)
        })
    })

    describe('getAchievementById', () => {
        it('should return achievement by id', () => {
            const achievement = getAchievementById('space_explorer')
            expect(achievement).toBeDefined()
            expect(achievement?.name).toBe('Space Explorer')
            expect(achievement?.gameId).toBe('global')
        })

        it('should return undefined for non-existent id', () => {
            const achievement = getAchievementById('non_existent')
            expect(achievement).toBeUndefined()
        })
    })

    describe('getAchievementsByGame', () => {
        it('should return achievements filtered by game', () => {
            const tetrisAchievements = getAchievementsByGame(GameID.TETRIS)
            expect(tetrisAchievements.length).toBeGreaterThan(0)
            tetrisAchievements.forEach(achievement => {
                expect(achievement.gameId).toBe(GameID.TETRIS)
            })

            const bubbleAchievements = getAchievementsByGame(
                GameID.BUBBLE_SHOOTER
            )
            expect(bubbleAchievements.length).toBeGreaterThan(0)
            bubbleAchievements.forEach(achievement => {
                expect(achievement.gameId).toBe(GameID.BUBBLE_SHOOTER)
            })
        })

        it('should return empty array for non-existent game', () => {
            const achievements = getAchievementsByGame('non_existent')
            expect(achievements).toHaveLength(0)
        })
    })

    describe('getGlobalAchievements', () => {
        it('should return only global achievements', () => {
            const achievements = getGlobalAchievements()
            expect(achievements.length).toBeGreaterThan(0)
            achievements.forEach(achievement => {
                expect(achievement.gameId).toBe('global')
            })
        })
    })

    describe('Rarity Styling Helpers', () => {
        it('should return correct colors for rarities', () => {
            expect(getRarityColor('common')).toContain('gray-400')
            expect(getRarityColor('rare')).toContain('blue-400')
            expect(getRarityColor('epic')).toContain('purple-400')
            expect(getRarityColor('legendary')).toContain('yellow-400')
        })

        it('should return correct glow effects for rarities', () => {
            expect(getRarityGlow('common')).toContain('gray-400/25')
            expect(getRarityGlow('rare')).toContain('blue-400/25')
            expect(getRarityGlow('epic')).toContain('purple-400/25')
            expect(getRarityGlow('legendary')).toContain('yellow-400/25')
        })

        it('should handle invalid rarity gracefully', () => {
            // @ts-expect-error Testing invalid input
            expect(getRarityColor('invalid')).toContain('gray-400')
            // @ts-expect-error Testing invalid input
            expect(getRarityGlow('invalid')).toContain('gray-400/25')
        })
    })

    describe('Pagination', () => {
        // Mock achievement data for testing
        const mockAchievements = [
            {
                id: 'test_1',
                name: 'Test Achievement 1',
                description: 'First test achievement',
                logo: '🏆',
                rarity: 'common',
                gameId: 'global',
                scoreThreshold: 100,
            },
            {
                id: 'test_2',
                name: 'Test Achievement 2',
                description: 'Second test achievement',
                logo: '🥇',
                rarity: 'rare',
                gameId: 'tetris',
                scoreThreshold: 200,
            },
            {
                id: 'test_3',
                name: 'Test Achievement 3',
                description: 'Third test achievement',
                logo: '🥈',
                rarity: 'epic',
                gameId: 'tetris',
                scoreThreshold: 300,
            },
            {
                id: 'test_4',
                name: 'Test Achievement 4',
                description: 'Fourth test achievement',
                logo: '🥉',
                rarity: 'legendary',
                gameId: 'bubble_shooter',
                scoreThreshold: 400,
            },
            {
                id: 'test_5',
                name: 'Test Achievement 5',
                description: 'Fifth test achievement',
                logo: '🎖️',
                rarity: 'common',
                gameId: 'global',
                scoreThreshold: 500,
            },
        ]

        it('should return first page with default page size', () => {
            const result = getPaginatedAchievements(mockAchievements)

            expect(result.page).toBe(1)
            expect(result.pageSize).toBe(10)
            expect(result.total).toBe(5)
            expect(result.totalPages).toBe(1)
            expect(result.achievements).toHaveLength(5)
            expect(result.achievements[0].id).toBe('test_1')
        })

        it('should return correct page with custom page size', () => {
            const result = getPaginatedAchievements(mockAchievements, 1, 2)

            expect(result.page).toBe(1)
            expect(result.pageSize).toBe(2)
            expect(result.total).toBe(5)
            expect(result.totalPages).toBe(3)
            expect(result.achievements).toHaveLength(2)
            expect(result.achievements[0].id).toBe('test_1')
            expect(result.achievements[1].id).toBe('test_2')
        })

        it('should return second page correctly', () => {
            const result = getPaginatedAchievements(mockAchievements, 2, 2)

            expect(result.page).toBe(2)
            expect(result.pageSize).toBe(2)
            expect(result.total).toBe(5)
            expect(result.totalPages).toBe(3)
            expect(result.achievements).toHaveLength(2)
            expect(result.achievements[0].id).toBe('test_3')
            expect(result.achievements[1].id).toBe('test_4')
        })

        it('should return last page with remaining items', () => {
            const result = getPaginatedAchievements(mockAchievements, 3, 2)

            expect(result.page).toBe(3)
            expect(result.pageSize).toBe(2)
            expect(result.total).toBe(5)
            expect(result.totalPages).toBe(3)
            expect(result.achievements).toHaveLength(1)
            expect(result.achievements[0].id).toBe('test_5')
        })

        it('should handle empty achievements array', () => {
            const result = getPaginatedAchievements([])

            expect(result.page).toBe(1)
            expect(result.pageSize).toBe(10)
            expect(result.total).toBe(0)
            expect(result.totalPages).toBe(0)
            expect(result.achievements).toHaveLength(0)
        })

        it('should handle page beyond total pages', () => {
            const result = getPaginatedAchievements(mockAchievements, 10, 2)

            expect(result.page).toBe(10)
            expect(result.pageSize).toBe(2)
            expect(result.total).toBe(5)
            expect(result.totalPages).toBe(3)
            expect(result.achievements).toHaveLength(0)
        })

        it('should preserve achievement properties in paginated results', () => {
            const result = getPaginatedAchievements(mockAchievements, 1, 3)

            expect(result.achievements[0]).toEqual(mockAchievements[0])
            expect(result.achievements[0]).toHaveProperty('id')
            expect(result.achievements[0]).toHaveProperty('name')
            expect(result.achievements[0]).toHaveProperty('description')
            expect(result.achievements[0]).toHaveProperty('logo')
            expect(result.achievements[0]).toHaveProperty('rarity')
            expect(result.achievements[0]).toHaveProperty('gameId')
            expect(result.achievements[0]).toHaveProperty('scoreThreshold')
        })
    })
})

describe('Achievement in_game condition callbacks', () => {
    it('reflex_balanced_collector: should return true when coins === bombs > 0', () => {
        const achievement = getAchievementById('reflex_balanced_collector')
        expect(achievement).toBeDefined()
        const check = achievement!.condition.check!
        expect(check({ coinsCollected: 5, bombsHit: 5 }, 0)).toBe(true)
    })

    it('reflex_balanced_collector: should return false when coins !== bombs', () => {
        const achievement = getAchievementById('reflex_balanced_collector')
        const check = achievement!.condition.check!
        expect(check({ coinsCollected: 3, bombsHit: 5 }, 0)).toBe(false)
    })

    it('reflex_balanced_collector: should return false when coins === 0', () => {
        const achievement = getAchievementById('reflex_balanced_collector')
        const check = achievement!.condition.check!
        expect(check({ coinsCollected: 0, bombsHit: 0 }, 0)).toBe(false)
    })

    it('reflex_coin_streak: should return true for 10 consecutive coins', () => {
        const achievement = getAchievementById('reflex_coin_streak')
        expect(achievement).toBeDefined()
        const check = achievement!.condition.check!
        const gameHistory = Array.from({ length: 10 }, (_, i) => ({
            objectId: `c${i}`,
            type: 'coin' as const,
            clicked: true,
            pointsAwarded: 10,
        }))
        expect(check({ gameHistory }, 0)).toBe(true)
    })

    it('reflex_coin_streak: should return false for fewer than 10 consecutive coins', () => {
        const achievement = getAchievementById('reflex_coin_streak')
        const check = achievement!.condition.check!
        const gameHistory = Array.from({ length: 5 }, (_, i) => ({
            objectId: `c${i}`,
            type: 'coin' as const,
            clicked: true,
            pointsAwarded: 10,
        }))
        expect(check({ gameHistory }, 0)).toBe(false)
    })

    it('reflex_bomb_streak: should return true for 10 consecutive bombs', () => {
        const achievement = getAchievementById('reflex_bomb_streak')
        expect(achievement).toBeDefined()
        const check = achievement!.condition.check!
        const gameHistory = Array.from({ length: 10 }, (_, i) => ({
            objectId: `b${i}`,
            type: 'bomb' as const,
            clicked: true,
            pointsAwarded: 0,
        }))
        expect(check({ gameHistory }, 0)).toBe(true)
    })

    it('checkConsecutiveObjectType: should handle interruptions by other type', () => {
        // 9 coins, then 1 bomb, then 1 coin — streak of 9, not 10
        const achievement = getAchievementById('reflex_coin_streak')
        const check = achievement!.condition.check!
        const gameHistory = [
            ...Array.from({ length: 9 }, (_, i) => ({
                objectId: `c${i}`,
                type: 'coin' as const,
                clicked: true,
                pointsAwarded: 10,
            })),
            {
                objectId: 'b0',
                type: 'bomb' as const,
                clicked: true,
                pointsAwarded: 0,
            },
            {
                objectId: 'c9',
                type: 'coin' as const,
                clicked: true,
                pointsAwarded: 10,
            },
        ]
        expect(check({ gameHistory }, 0)).toBe(false)
    })

    it('checkConsecutiveObjectType: should ignore non-clicked entries', () => {
        const achievement = getAchievementById('reflex_coin_streak')
        const check = achievement!.condition.check!
        // 10 coins but only 5 are clicked
        const gameHistory = Array.from({ length: 10 }, (_, i) => ({
            objectId: `c${i}`,
            type: 'coin' as const,
            clicked: i < 5,
            pointsAwarded: 10,
        }))
        expect(check({ gameHistory }, 0)).toBe(false)
    })
})

describe('Achievement in_game condition checks', () => {
    describe('word_secret_dog condition', () => {
        it('should return true when lastCorrectWord is "dog"', () => {
            const achievement = getAchievementById('word_secret_dog')
            const check = achievement!.condition.check!
            expect(check({ lastCorrectWord: 'dog' }, 0)).toBe(true)
        })

        it('should return true when lastCorrectWord is uppercase "DOG"', () => {
            const achievement = getAchievementById('word_secret_dog')
            const check = achievement!.condition.check!
            expect(check({ lastCorrectWord: 'DOG' }, 0)).toBe(true)
        })

        it('should return true when "dog" is in correctWords array', () => {
            const achievement = getAchievementById('word_secret_dog')
            const check = achievement!.condition.check!
            expect(check({ correctWords: ['cat', 'dog', 'bird'] }, 0)).toBe(
                true
            )
        })

        it('should return false when "dog" is not in game data', () => {
            const achievement = getAchievementById('word_secret_dog')
            const check = achievement!.condition.check!
            expect(check({ lastCorrectWord: 'cat', correctWords: [] }, 0)).toBe(
                false
            )
        })

        it('should return false when gameData is empty', () => {
            const achievement = getAchievementById('word_secret_dog')
            const check = achievement!.condition.check!
            expect(check({}, 0)).toBe(false)
        })
    })

    describe('quick_math_999_seen condition', () => {
        it('should return true when seenOperand999 is true', () => {
            const achievement = getAchievementById('quick_math_999_seen')
            const check = achievement!.condition.check!
            expect(check({ seenOperand999: true }, 0)).toBe(true)
        })

        it('should return false when seenOperand999 is false', () => {
            const achievement = getAchievementById('quick_math_999_seen')
            const check = achievement!.condition.check!
            expect(check({ seenOperand999: false }, 0)).toBe(false)
        })

        it('should return false when seenOperand999 is undefined', () => {
            const achievement = getAchievementById('quick_math_999_seen')
            const check = achievement!.condition.check!
            expect(check({}, 0)).toBe(false)
        })
    })

    describe('quick_math_zero_answer_wrong condition', () => {
        it('should return true when zeroAnswerIncorrect is true', () => {
            const achievement = getAchievementById(
                'quick_math_zero_answer_wrong'
            )
            const check = achievement!.condition.check!
            expect(check({ zeroAnswerIncorrect: true }, 0)).toBe(true)
        })

        it('should return false when zeroAnswerIncorrect is false', () => {
            const achievement = getAchievementById(
                'quick_math_zero_answer_wrong'
            )
            const check = achievement!.condition.check!
            expect(check({ zeroAnswerIncorrect: false }, 0)).toBe(false)
        })

        it('should return false when zeroAnswerIncorrect is undefined', () => {
            const achievement = getAchievementById(
                'quick_math_zero_answer_wrong'
            )
            const check = achievement!.condition.check!
            expect(check({}, 0)).toBe(false)
        })
    })

    describe('reflex_perfect_run condition', () => {
        it('should return true when score > 500 and no bombs hit', () => {
            const achievement = getAchievementById('reflex_perfect_run')
            const check = achievement!.condition.check!
            expect(check({ bombsHit: 0 }, 600)).toBe(true)
        })

        it('should return false when score <= 500', () => {
            const achievement = getAchievementById('reflex_perfect_run')
            const check = achievement!.condition.check!
            expect(check({ bombsHit: 0 }, 500)).toBe(false)
        })

        it('should return false when bombs were hit', () => {
            const achievement = getAchievementById('reflex_perfect_run')
            const check = achievement!.condition.check!
            expect(check({ bombsHit: 1 }, 600)).toBe(false)
        })
    })
})
