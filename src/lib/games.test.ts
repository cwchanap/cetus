import { describe, it, expect } from 'vitest'
import {
    getAllGames,
    getGameById,
    getActiveGames,
    getGamesByCategory,
    getMultiplayerGames,
    getSinglePlayerGames,
    searchGames,
    getCategoryColor,
    getDifficultyColor,
    type Game,
} from './games'

describe('Games System', () => {
    describe('getAllGames', () => {
        it('should return all games', () => {
            const games = getAllGames()
            expect(games).toHaveLength(6) // tetris, quick_draw, bubble_shooter, quick_math, memory_matrix, word_scramble
            expect(games[0]).toHaveProperty('id')
            expect(games[0]).toHaveProperty('name')
            expect(games[0]).toHaveProperty('description')
            expect(games[0]).toHaveProperty('category')
            expect(games[0]).toHaveProperty('difficulty')
            expect(games[0]).toHaveProperty('tags')
            expect(games[0]).toHaveProperty('isActive')
        })
    })

    describe('getGameById', () => {
        it('should return game by id', () => {
            const game = getGameById('tetris')
            expect(game).toBeDefined()
            expect(game?.name).toBe('Tetris Challenge')
            expect(game?.category).toBe('puzzle')
        })

        it('should return undefined for non-existent id', () => {
            // @ts-expect-error Testing invalid input
            const game = getGameById('non_existent')
            expect(game).toBeUndefined()
        })
    })

    describe('getActiveGames', () => {
        it('should return only active games', () => {
            const games = getActiveGames()
            expect(games.length).toBeGreaterThan(0)
            games.forEach(game => {
                expect(game.isActive).toBe(true)
            })
        })
    })

    describe('getGamesByCategory', () => {
        it('should return puzzle games', () => {
            const puzzleGames = getGamesByCategory('puzzle')
            expect(puzzleGames.length).toBeGreaterThan(0)
            puzzleGames.forEach(game => {
                expect(game.category).toBe('puzzle')
                expect(game.isActive).toBe(true)
            })
        })

        it('should return drawing games', () => {
            const drawingGames = getGamesByCategory('drawing')
            expect(drawingGames.length).toBeGreaterThan(0)
            drawingGames.forEach(game => {
                expect(game.category).toBe('drawing')
                expect(game.isActive).toBe(true)
            })
        })

        it('should return empty array for non-existent category', () => {
            // @ts-expect-error Testing invalid input
            const games = getGamesByCategory('non_existent')
            expect(games).toHaveLength(0)
        })
    })

    describe('getMultiplayerGames', () => {
        it('should return games with more than 1 player', () => {
            const multiplayerGames = getMultiplayerGames()
            expect(multiplayerGames.length).toBeGreaterThan(0)
            multiplayerGames.forEach(game => {
                expect(game.maxPlayers).toBeGreaterThan(1)
                expect(game.isActive).toBe(true)
            })
        })
    })

    describe('getSinglePlayerGames', () => {
        it('should return games with exactly 1 player', () => {
            const singlePlayerGames = getSinglePlayerGames()
            expect(singlePlayerGames.length).toBeGreaterThan(0)
            singlePlayerGames.forEach(game => {
                expect(game.maxPlayers).toBe(1)
                expect(game.isActive).toBe(true)
            })
        })
    })

    describe('searchGames', () => {
        it('should find games by name', () => {
            const results = searchGames('tetris')
            expect(results.length).toBeGreaterThan(0)
            expect(results[0].name.toLowerCase()).toContain('tetris')
        })

        it('should find games by description', () => {
            const results = searchGames('puzzle')
            expect(results.length).toBeGreaterThan(0)
            results.forEach(game => {
                const matchesDescription = game.description
                    .toLowerCase()
                    .includes('puzzle')
                const matchesTag = game.tags.some(tag =>
                    tag.toLowerCase().includes('puzzle')
                )
                expect(matchesDescription || matchesTag).toBe(true)
            })
        })

        it('should find games by tags', () => {
            const results = searchGames('blocks')
            expect(results.length).toBeGreaterThan(0)
            expect(
                results.some(game =>
                    game.tags.some(tag => tag.toLowerCase().includes('blocks'))
                )
            ).toBe(true)
        })

        it('should return empty array for no matches', () => {
            const results = searchGames('nonexistentgame')
            expect(results).toHaveLength(0)
        })

        it('should be case insensitive', () => {
            const lowerResults = searchGames('tetris')
            const upperResults = searchGames('TETRIS')
            const mixedResults = searchGames('TeTrIs')

            expect(lowerResults.length).toBe(upperResults.length)
            expect(lowerResults.length).toBe(mixedResults.length)
        })
    })

    describe('Game Data Integrity', () => {
        it('should have unique game IDs', () => {
            const games = getAllGames()
            const ids = games.map(g => g.id)
            const uniqueIds = new Set(ids)

            expect(uniqueIds.size).toBe(ids.length)
        })

        it('should have all required properties for each game', () => {
            const games = getAllGames()

            games.forEach(game => {
                expect(game.id).toBeTruthy()
                expect(game.name).toBeTruthy()
                expect(game.description).toBeTruthy()
                expect(game.category).toBeTruthy()
                expect(game.difficulty).toBeTruthy()
                expect(Array.isArray(game.tags)).toBe(true)
                expect(game.tags.length).toBeGreaterThan(0)
                expect(typeof game.isActive).toBe('boolean')

                // Validate category values
                expect(['puzzle', 'drawing', 'action', 'strategy']).toContain(
                    game.category
                )

                // Validate difficulty values
                expect(['easy', 'medium', 'hard']).toContain(game.difficulty)

                // Validate maxPlayers if defined
                if (game.maxPlayers) {
                    expect(game.maxPlayers).toBeGreaterThan(0)
                }
            })
        })

        it('should have valid game types', () => {
            const games = getAllGames()
            const validGameTypes = [
                'tetris',
                'quick_draw',
                'bubble_shooter',
                'quick_math',
                'memory_matrix',
                'word_scramble',
            ]

            games.forEach(game => {
                expect(validGameTypes).toContain(game.id)
            })
        })
    })

    describe('Category and Difficulty Styling', () => {
        it('should return correct colors for categories', () => {
            expect(getCategoryColor('puzzle')).toContain('blue-400')
            expect(getCategoryColor('drawing')).toContain('pink-400')
            expect(getCategoryColor('action')).toContain('red-400')
            expect(getCategoryColor('strategy')).toContain('purple-400')
        })

        it('should return correct colors for difficulty', () => {
            expect(getDifficultyColor('easy')).toContain('green-400')
            expect(getDifficultyColor('medium')).toContain('yellow-400')
            expect(getDifficultyColor('hard')).toContain('red-400')
        })

        it('should handle invalid category gracefully', () => {
            // @ts-expect-error Testing invalid input
            expect(getCategoryColor('invalid')).toContain('gray-400')
        })

        it('should handle invalid difficulty gracefully', () => {
            // @ts-expect-error Testing invalid input
            expect(getDifficultyColor('invalid')).toContain('gray-400')
        })
    })

    describe('Game Categories and Features', () => {
        it('should have correct game categorization', () => {
            const tetris = getGameById('tetris')
            const quickDraw = getGameById('quick_draw')
            const bubbleShooter = getGameById('bubble_shooter')

            expect(tetris?.category).toBe('puzzle')
            expect(tetris?.maxPlayers).toBe(1)
            expect(tetris?.difficulty).toBe('medium')

            expect(quickDraw?.category).toBe('drawing')
            expect(quickDraw?.maxPlayers).toBe(8)
            expect(quickDraw?.difficulty).toBe('easy')

            expect(bubbleShooter?.category).toBe('puzzle')
            expect(bubbleShooter?.maxPlayers).toBe(1)
            expect(bubbleShooter?.difficulty).toBe('easy')
        })

        it('should have meaningful tags for each game', () => {
            const games = getAllGames()

            games.forEach(game => {
                expect(game.tags.length).toBeGreaterThan(0)
                expect(game.tags.every(tag => typeof tag === 'string')).toBe(
                    true
                )
                expect(game.tags.every(tag => tag.length > 0)).toBe(true)
            })
        })

        it('should have estimated durations for games', () => {
            const games = getAllGames()

            games.forEach(game => {
                if (game.estimatedDuration) {
                    expect(typeof game.estimatedDuration).toBe('string')
                    expect(game.estimatedDuration.length).toBeGreaterThan(0)
                }
            })
        })
    })
})
