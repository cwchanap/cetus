import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    getAllGames,
    getGameById,
    getActiveGames,
    getGamesByCategory,
    getMultiplayerGames,
    getSinglePlayerGames,
    searchGames,
    getGameIcon,
    getCategoryColor,
    getDifficultyColor,
    getGameUrl,
    type Game,
    GAMES,
    GameID,
} from './games'

describe('Games System', () => {
    describe('getAllGames', () => {
        it('should return all games', () => {
            const games = getAllGames()
            expect(games).toEqual(GAMES)
            expect(games.length).toBeGreaterThan(0)
        })
    })

    describe('getGameById', () => {
        it('should return game by id', () => {
            const game = getGameById(GameID.TETRIS)
            expect(game).toBeDefined()
            expect(game?.id).toBe(GameID.TETRIS)
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
        it('should return games filtered by category and only active ones', () => {
            const puzzleGames = getGamesByCategory('puzzle')
            expect(puzzleGames.length).toBeGreaterThan(0)
            puzzleGames.forEach(game => {
                expect(game.category).toBe('puzzle')
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
        it('should return empty array when no multiplayer games exist', () => {
            const multiplayerGames = getMultiplayerGames()
            expect(multiplayerGames.length).toBe(0)
        })

        it('should return active multiplayer games when present', () => {
            const testGames: Game[] = GAMES.map((g, i) =>
                i === 0 ? { ...g, maxPlayers: 4, isActive: true } : g
            )

            const multiplayerGames = getMultiplayerGames(testGames)
            expect(multiplayerGames.length).toBeGreaterThan(0)
            expect(multiplayerGames.some(game => game.id === GAMES[0].id)).toBe(
                true
            )
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

        it('should exclude inactive games from results', () => {
            const testGames: Game[] = GAMES.map((g, i) =>
                i === 0 ? { ...g, isActive: false } : g
            )
            const searchTerm = GAMES[0].name.toLowerCase()

            const results = searchGames(searchTerm, testGames)
            expect(results.some(game => game.id === GAMES[0].id)).toBe(false)
        })
    })

    describe('getGameIcon', () => {
        it('should return mapped icon for known game id', () => {
            expect(getGameIcon('tetris')).toBe('🔲')
            expect(getGameIcon('2048')).toBe('🎯')
        })

        it('should return fallback icon for unknown game id', () => {
            expect(getGameIcon('unknown-game')).toBe('🎮')
        })
    })

    describe('Category and Difficulty Styling', () => {
        it('should return correct colors for categories', () => {
            expect(getCategoryColor('puzzle')).toContain('blue-400')
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
})

describe('Circuit Hacker registration', () => {
    it('has a GameID and registry entry', () => {
        expect(GameID.CIRCUIT_HACKER).toBe('circuit_hacker')
        const game = getGameById(GameID.CIRCUIT_HACKER)
        expect(game).toBeDefined()
        expect(game?.name).toBe('Circuit Hacker')
        expect(game?.category).toBe('puzzle')
        expect(game?.isActive).toBe(true)
    })

    it('has an icon', () => {
        expect(getGameIcon(GameID.CIRCUIT_HACKER)).toBe('🔌')
    })

    it('is included in the GAMES list exactly once', () => {
        expect(GAMES.filter(g => g.id === GameID.CIRCUIT_HACKER)).toHaveLength(
            1
        )
    })
})

describe('Satellite Sync registration', () => {
    it('has a GameID and registry entry', () => {
        expect(GameID.SATELLITE_SYNC).toBe('satellite_sync')
        const game = getGameById(GameID.SATELLITE_SYNC)
        expect(game).toBeDefined()
        expect(game?.name).toBe('Satellite Sync')
        expect(game?.category).toBe('strategy')
        expect(game?.isActive).toBe(true)
    })

    it('has an icon', () => {
        expect(getGameIcon(GameID.SATELLITE_SYNC)).toBe('🛰️')
    })

    it('is included in the GAMES list exactly once', () => {
        expect(GAMES.filter(g => g.id === GameID.SATELLITE_SYNC)).toHaveLength(
            1
        )
    })
})

describe('getGameUrl route derivation', () => {
    it('replaces underscores with hyphens and prefixes a slash', () => {
        expect(getGameUrl('satellite_sync')).toBe('/satellite-sync')
        expect(getGameUrl('bubble_shooter')).toBe('/bubble-shooter')
        expect(getGameUrl('tetris')).toBe('/tetris')
        expect(getGameUrl('2048')).toBe('/2048')
    })

    it('derives a URL that maps to an existing page route for every game', () => {
        const pagesDir = resolve(process.cwd(), 'src/pages')
        for (const game of GAMES) {
            const url = getGameUrl(game.id)
            const slug = url.slice(1)
            // Accept any valid Astro route shape: a directory route
            // (src/pages/<slug>/...), a file-backed page
            // (src/pages/<slug>.astro), or an index page
            // (src/pages/<slug>/index.astro).
            const routeDir = resolve(pagesDir, slug)
            const fileRoute = resolve(pagesDir, `${slug}.astro`)
            const indexRoute = resolve(pagesDir, slug, 'index.astro')
            const routeExists =
                existsSync(routeDir) ||
                existsSync(fileRoute) ||
                existsSync(indexRoute)
            expect(routeExists).toBe(true)
        }
    })
})
