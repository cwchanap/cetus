import { describe, it, expect } from 'vitest'
import {
    getAllAchievements,
    getAchievementById,
    getAchievementsByGame,
    getGlobalAchievements,
    getRarityColor,
    getRarityGlow,
    type Achievement,
} from './achievements'

describe('Achievement System', () => {
    describe('getAllAchievements', () => {
        it('should return all achievements', () => {
            const achievements = getAllAchievements()
            expect(achievements).toHaveLength(9) // 1 global + 4 tetris + 4 bubble shooter
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
            const achievements = getAchievementsByGame('tetris')
            expect(achievements).toHaveLength(4)
            achievements.forEach(achievement => {
                expect(achievement.gameId).toBe('tetris')
            })
        })

        it('should return bubble shooter achievements', () => {
            const achievements = getAchievementsByGame('bubble_shooter')
            expect(achievements).toHaveLength(4)
            achievements.forEach(achievement => {
                expect(achievement.gameId).toBe('bubble_shooter')
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

            expect(thresholds).toEqual([100, 250, 500, 1000])
        })

        it('should have correct bubble shooter score thresholds', () => {
            const bubbleAchievements = getAchievementsByGame('bubble_shooter')
            const thresholds = bubbleAchievements
                .map(a => a.condition.threshold)
                .filter(Boolean)
                .sort((a, b) => a! - b!)

            expect(thresholds).toEqual([100, 200, 400, 800])
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
})
