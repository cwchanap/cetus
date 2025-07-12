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
            expect(games).toHaveLength(3) // tetris, quick_draw, bubble_shooter
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
            const validGameTypes = ['tetris', 'quick_draw', 'bubble_shooter']

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

    describe('Game Card Mapper Integration', () => {
        // Game icon and URL mapping (same as in index.astro)
        const gameIcons: Record<string, string> = {
            tetris: '🔲',
            quick_draw: '🎨',
            bubble_shooter: '🫧',
        }

        // Convert Games system data to GameCard format (same function as in index.astro)
        function convertGameToCardFormat(game: Game) {
            return {
                id: game.id === 'tetris' ? 2 : game.id === 'quick_draw' ? 1 : 3,
                title: game.name,
                description: game.description,
                icon: gameIcons[game.id] || '🎮',
                duration: game.estimatedDuration || '5-15 min',
                difficulty:
                    game.difficulty.charAt(0).toUpperCase() +
                    game.difficulty.slice(1),
                available: game.isActive,
            }
        }

        it('should convert Games system data to GameCard format', () => {
            const games = getAllGames()
            const convertedGames = games.map(convertGameToCardFormat)

            expect(convertedGames).toHaveLength(3)

            // Test Tetris conversion
            const tetris = convertedGames.find(g => g.id === 2)
            expect(tetris).toBeDefined()
            expect(tetris?.title).toBe('Tetris Challenge')
            expect(tetris?.icon).toBe('🔲')
            expect(tetris?.difficulty).toBe('Medium')
            expect(tetris?.available).toBe(true)

            // Test Quick Draw conversion
            const quickDraw = convertedGames.find(g => g.id === 1)
            expect(quickDraw).toBeDefined()
            expect(quickDraw?.title).toBe('Quick Draw')
            expect(quickDraw?.icon).toBe('🎨')
            expect(quickDraw?.difficulty).toBe('Easy')
            expect(quickDraw?.available).toBe(true)

            // Test Bubble Shooter conversion
            const bubbleShooter = convertedGames.find(g => g.id === 3)
            expect(bubbleShooter).toBeDefined()
            expect(bubbleShooter?.title).toBe('Bubble Shooter')
            expect(bubbleShooter?.icon).toBe('🫧')
            expect(bubbleShooter?.difficulty).toBe('Easy')
            expect(bubbleShooter?.available).toBe(true)
        })

        it('should maintain proper difficulty capitalization', () => {
            const games = getAllGames()
            const convertedGames = games.map(convertGameToCardFormat)

            convertedGames.forEach(game => {
                expect(['Easy', 'Medium', 'Hard']).toContain(game.difficulty)
                expect(game.difficulty[0]).toBe(
                    game.difficulty[0].toUpperCase()
                )
            })
        })

        it('should provide fallback values for missing properties', () => {
            const mockGame = {
                id: 'test_game' as any,
                name: 'Test Game',
                description: 'A test game',
                category: 'puzzle' as const,
                difficulty: 'medium' as const,
                tags: ['test'],
                isActive: true,
            }

            const converted = convertGameToCardFormat(mockGame)

            expect(converted.icon).toBe('🎮') // fallback icon
            expect(converted.duration).toBe('5-15 min') // fallback duration
            expect(converted.difficulty).toBe('Medium') // capitalized
        })

        it('should map game IDs correctly for legacy compatibility', () => {
            const games = getAllGames()
            const convertedGames = games.map(convertGameToCardFormat)

            // Verify ID mapping maintains legacy compatibility
            const tetris = convertedGames.find(
                g => g.title === 'Tetris Challenge'
            )
            const quickDraw = convertedGames.find(g => g.title === 'Quick Draw')
            const bubbleShooter = convertedGames.find(
                g => g.title === 'Bubble Shooter'
            )

            expect(tetris?.id).toBe(2)
            expect(quickDraw?.id).toBe(1)
            expect(bubbleShooter?.id).toBe(3)
        })
    })
})
