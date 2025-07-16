import { describe, it, expect } from 'vitest'
import {
    getAllAchievements,
    getAchievementById,
    getAchievementsByGame,
    getGlobalAchievements,
    getRarityColor,
    getRarityGlow,
    getPaginatedAchievements,
    type Achievement,
} from './achievements'
import { GameID } from './games'

describe('Achievement System', () => {
    describe('getAllAchievements', () => {
        it('should return all achievements', () => {
            const achievements = getAllAchievements()
            expect(achievements).toHaveLength(28) // 1 global + 6 welcome + 9 tetris + 4 bubble shooter + 4 memory matrix + 4 word scramble
            expect(achievements[0]).toHaveProperty('id')
            expect(achievements[0]).toHaveProperty('name')
            expect(achievements[0]).toHaveProperty('description')
            expect(achievements[0]).toHaveProperty('logo')
            expect(achievements[0]).toHaveProperty('gameId')
            expect(achievements[0]).toHaveProperty('condition')
            expect(achievements[0]).toHaveProperty('rarity')
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
        it('should return tetris achievements', () => {
            const achievements = getAchievementsByGame(GameID.TETRIS)
            expect(achievements).toHaveLength(9) // Including tetris_welcome + 8 others
            achievements.forEach(achievement => {
                expect(achievement.gameId).toBe(GameID.TETRIS)
            })
        })

        it('should return bubble shooter achievements', () => {
            const achievements = getAchievementsByGame(GameID.BUBBLE_SHOOTER)
            expect(achievements).toHaveLength(5) // Including bubble_shooter_welcome
            achievements.forEach(achievement => {
                expect(achievement.gameId).toBe(GameID.BUBBLE_SHOOTER)
            })
        })

        it('should return empty array for non-existent game', () => {
            const achievements = getAchievementsByGame('non_existent')
            expect(achievements).toHaveLength(0)
        })
    })

    describe('getGlobalAchievements', () => {
        it('should return global achievements', () => {
            const achievements = getGlobalAchievements()
            expect(achievements).toHaveLength(1)
            expect(achievements[0].gameId).toBe('global')
            expect(achievements[0].id).toBe('space_explorer')
        })
    })

    describe('Achievement Score Thresholds', () => {
        it('should have correct tetris score thresholds', () => {
            const tetrisAchievements = getAchievementsByGame('tetris')
            const thresholds = tetrisAchievements
                .map(a => a.condition.threshold)
                .filter(Boolean)
                .sort((a, b) => a! - b!)

            expect(thresholds).toEqual([1, 100, 250, 500, 1000]) // Including welcome achievement threshold
        })

        it('should have correct bubble shooter score thresholds', () => {
            const bubbleAchievements = getAchievementsByGame('bubble_shooter')
            const thresholds = bubbleAchievements
                .map(a => a.condition.threshold)
                .filter(Boolean)
                .sort((a, b) => a! - b!)

            expect(thresholds).toEqual([1, 100, 200, 400, 800]) // Including welcome achievement threshold
        })
    })

    describe('Achievement Rarity System', () => {
        it('should have correct rarity distribution', () => {
            const achievements = getAllAchievements()
            const rarityCount = achievements.reduce(
                (acc, achievement) => {
                    acc[achievement.rarity] = (acc[achievement.rarity] || 0) + 1
                    return acc
                },
                {} as Record<string, number>
            )

            expect(rarityCount.common).toBeGreaterThan(0)
            expect(rarityCount.rare).toBeGreaterThan(0)
            expect(rarityCount.epic).toBeGreaterThan(0)
        })

        it('should have higher thresholds for rarer achievements', () => {
            const tetrisAchievements = getAchievementsByGame('tetris')

            // Find master achievement (epic rarity)
            const master = tetrisAchievements.find(a => a.rarity === 'epic')
            expect(master?.condition.threshold).toBe(1000)

            // Find novice achievement (common rarity)
            const novice = tetrisAchievements.find(
                a => a.rarity === 'common' && a.condition.threshold === 100
            )
            expect(novice?.condition.threshold).toBe(100)
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

    describe('Achievement Data Integrity', () => {
        it('should have unique achievement IDs', () => {
            const achievements = getAllAchievements()
            const ids = achievements.map(a => a.id)
            const uniqueIds = new Set(ids)

            expect(uniqueIds.size).toBe(ids.length)
        })

        it('should have all required properties for each achievement', () => {
            const achievements = getAllAchievements()

            achievements.forEach(achievement => {
                expect(achievement.id).toBeTruthy()
                expect(achievement.name).toBeTruthy()
                expect(achievement.description).toBeTruthy()
                expect(achievement.logo).toBeTruthy()
                expect(achievement.gameId).toBeTruthy()
                expect(achievement.condition).toBeTruthy()
                expect(achievement.condition.type).toBeTruthy()
                expect(achievement.rarity).toBeTruthy()

                // Validate rarity values
                expect(['common', 'rare', 'epic', 'legendary']).toContain(
                    achievement.rarity
                )

                // Validate condition types
                expect(['score_threshold', 'games_played', 'custom']).toContain(
                    achievement.condition.type
                )

                // Validate gameId values
                expect([
                    'global',
                    'tetris',
                    'bubble_shooter',
                    'quick_draw',
                    'quick_math',
                    'memory_matrix',
                    'word_scramble',
                ]).toContain(achievement.gameId)
            })
        })

        it('should have thresholds for score_threshold achievements', () => {
            const achievements = getAllAchievements()
            const scoreAchievements = achievements.filter(
                a => a.condition.type === 'score_threshold'
            )

            scoreAchievements.forEach(achievement => {
                expect(achievement.condition.threshold).toBeGreaterThan(0)
                expect(typeof achievement.condition.threshold).toBe('number')
            })
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
