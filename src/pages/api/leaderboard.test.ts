import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/pages/api/leaderboard'
import {
    getGameLeaderboard,
    getScopedGameLeaderboard,
    type ScopedLeaderboardRow,
} from '@/lib/server/db/queries'
import { getAllGames, GameID } from '@/lib/games'

// Mock dependencies
vi.mock('@/lib/server/db/queries', () => ({
    getGameLeaderboard: vi.fn(),
    getScopedGameLeaderboard: vi.fn(),
    toPublicScopedLeaderboardEntry: vi.fn(
        ({ userId: _userId, ...entry }: ScopedLeaderboardRow) => entry
    ),
    isGameLeaderboardAvailable: (result: unknown) => Array.isArray(result),
}))

vi.mock('@/lib/games', () => ({
    getAllGames: vi.fn(),
    GameID: {
        TETRIS: 'tetris',
    },
}))

describe('GET /api/leaderboard', () => {
    const mockGame = {
        id: 'tetris' as GameID,
        name: 'Tetris Challenge',
        description: 'Classic puzzle game',
        category: 'puzzle' as const,
        difficulty: 'medium' as const,
        tags: ['puzzle', 'classic'],
        isActive: true,
    }

    const mockLeaderboardEntry = {
        name: 'Test Player',
        username: 'testplayer',
        score: 1000,
        created_at: '2023-01-01T00:00:00Z',
        image: null,
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getAllGames).mockReturnValue([mockGame])
        vi.mocked(getGameLeaderboard).mockResolvedValue([mockLeaderboardEntry])
    })

    describe('without gameId parameter', () => {
        it('should return leaderboards for all games', async () => {
            const url = new URL('http://localhost/api/leaderboard')
            const response = await GET({ url } as any)

            expect(response.status).toBe(200)

            const data = await response.json()
            expect(data).toHaveProperty('leaderboards')
            expect(data.leaderboards).toHaveProperty('tetris')
            expect(data.leaderboards.tetris).toHaveLength(1)
            expect(data.leaderboards.tetris[0]).toMatchObject({
                rank: 1,
                name: 'Test Player',
                score: 1000,
                created_at: '2023-01-01T00:00:00Z',
            })
        })

        it('should use default limit of 10', async () => {
            const url = new URL('http://localhost/api/leaderboard')
            await GET({ url } as any)

            expect(getGameLeaderboard).toHaveBeenCalledWith('tetris', 10)
        })

        it('should use custom limit when provided', async () => {
            const url = new URL('http://localhost/api/leaderboard?limit=5')
            await GET({ url } as any)

            expect(getGameLeaderboard).toHaveBeenCalledWith('tetris', 5)
        })

        it('should return 400 for invalid limit', async () => {
            const url = new URL(
                'http://localhost/api/leaderboard?limit=invalid'
            )
            const response = await GET({ url } as any)

            expect(response.status).toBe(400)

            const data = await response.json()
            expect(typeof data.error).toBe('string')
            expect(data.error.length).toBeGreaterThan(0)
            // Non-decimal input fails the digit-only regex boundary, distinct
            // from the range checks below.
            expect(data.error).toMatch(/positive integer|digit|number/i)
        })

        it('should return 400 for negative limit', async () => {
            const url = new URL('http://localhost/api/leaderboard?limit=-5')
            const response = await GET({ url } as any)

            expect(response.status).toBe(400)

            const data = await response.json()
            expect(typeof data.error).toBe('string')
            expect(data.error.length).toBeGreaterThan(0)
            // Negative values fail the digit-only regex boundary before the
            // minimum (>=1) check runs.
            expect(data.error).toMatch(/positive integer|digit|number/i)
        })

        it('should return 400 for limit exceeding maximum', async () => {
            const url = new URL('http://localhost/api/leaderboard?limit=101')
            const response = await GET({ url } as any)

            expect(response.status).toBe(400)

            const data = await response.json()
            expect(typeof data.error).toBe('string')
            expect(data.error.length).toBeGreaterThan(0)
            // Over-maximum value fails the maximum (<=100) check.
            expect(data.error).toMatch(/<=|less|at most|big/i)
        })

        it('should return a 503 coded error when any game leaderboard is unavailable', async () => {
            vi.mocked(getGameLeaderboard).mockResolvedValue({
                status: 'unavailable',
                code: 'SCORE_CONTEXT_UNAVAILABLE',
            })

            const url = new URL('http://localhost/api/leaderboard')
            const response = await GET({ url } as any)

            expect(response.status).toBe(503)

            const data = await response.json()
            expect(data).toEqual({
                error: 'Score context is unavailable',
                code: 'SCORE_CONTEXT_UNAVAILABLE',
            })
        })
    })

    describe('with gameId parameter', () => {
        it('should return leaderboard for specific game', async () => {
            const url = new URL(
                'http://localhost/api/leaderboard?gameId=tetris'
            )
            const response = await GET({ url } as any)

            expect(response.status).toBe(200)

            const data = await response.json()
            expect(data).toMatchObject({
                gameId: 'tetris',
                gameName: 'Tetris Challenge',
                leaderboard: [
                    {
                        rank: 1,
                        name: 'Test Player',
                        score: 1000,
                        created_at: '2023-01-01T00:00:00Z',
                    },
                ],
            })
        })

        it('should return 400 for invalid game ID', async () => {
            const url = new URL(
                'http://localhost/api/leaderboard?gameId=invalid'
            )
            const response = await GET({ url } as any)

            expect(response.status).toBe(400)

            const data = await response.json()
            expect(data).toHaveProperty('error', 'Invalid game ID')
        })

        it('should assign correct ranks to leaderboard entries', async () => {
            const multipleEntries = [
                {
                    name: 'Player 1',
                    username: 'player1',
                    score: 1000,
                    created_at: '2023-01-01T00:00:00Z',
                    image: null,
                },
                {
                    name: 'Player 2',
                    username: 'player2',
                    score: 900,
                    created_at: '2023-01-02T00:00:00Z',
                    image: null,
                },
                {
                    name: 'Player 3',
                    username: 'player3',
                    score: 800,
                    created_at: '2023-01-03T00:00:00Z',
                    image: null,
                },
            ]
            vi.mocked(getGameLeaderboard).mockResolvedValue(multipleEntries)

            const url = new URL(
                'http://localhost/api/leaderboard?gameId=tetris'
            )
            const response = await GET({ url } as any)

            const data = await response.json()
            expect(data.leaderboard).toHaveLength(3)
            expect(data.leaderboard[0].rank).toBe(1)
            expect(data.leaderboard[1].rank).toBe(2)
            expect(data.leaderboard[2].rank).toBe(3)
        })

        it('should handle empty leaderboard', async () => {
            vi.mocked(getGameLeaderboard).mockResolvedValue([])

            const url = new URL(
                'http://localhost/api/leaderboard?gameId=tetris'
            )
            const response = await GET({ url } as any)

            expect(response.status).toBe(200)

            const data = await response.json()
            expect(data.leaderboard).toEqual([])
        })

        it('should return a 503 coded error when the score context is unavailable', async () => {
            vi.mocked(getGameLeaderboard).mockResolvedValue({
                status: 'unavailable',
                code: 'SCORE_CONTEXT_UNAVAILABLE',
            })

            const url = new URL(
                'http://localhost/api/leaderboard?gameId=tetris'
            )
            const response = await GET({ url } as any)

            expect(response.status).toBe(503)

            const data = await response.json()
            expect(data).toEqual({
                error: 'Score context is unavailable',
                code: 'SCORE_CONTEXT_UNAVAILABLE',
            })
        })
    })

    describe('error handling', () => {
        it('should return 500 for database errors', async () => {
            vi.mocked(getGameLeaderboard).mockRejectedValue(
                new Error('Database error')
            )

            const url = new URL(
                'http://localhost/api/leaderboard?gameId=tetris'
            )
            const response = await GET({ url } as any)

            expect(response.status).toBe(500)

            const data = await response.json()
            expect(data).toHaveProperty('error', 'Internal server error')
        })

        it('should return 500 for getAllGames errors', async () => {
            vi.mocked(getAllGames).mockImplementation(() => {
                throw new Error('Games error')
            })

            const url = new URL('http://localhost/api/leaderboard')
            const response = await GET({ url } as any)

            expect(response.status).toBe(500)

            const data = await response.json()
            expect(data).toHaveProperty('error', 'Internal server error')
        })
    })

    describe('response format', () => {
        it('should set correct content type header', async () => {
            const url = new URL(
                'http://localhost/api/leaderboard?gameId=tetris'
            )
            const response = await GET({ url } as any)

            expect(response.headers.get('Content-Type')).toBe(
                'application/json'
            )
        })

        it('should include all required fields in leaderboard entries', async () => {
            const url = new URL(
                'http://localhost/api/leaderboard?gameId=tetris'
            )
            const response = await GET({ url } as any)

            const data = await response.json()
            const entry = data.leaderboard[0]

            expect(entry).toHaveProperty('rank')
            expect(entry).toHaveProperty('name')
            expect(entry).toHaveProperty('score')
            expect(entry).toHaveProperty('created_at')
            expect(typeof entry.rank).toBe('number')
            expect(typeof entry.name).toBe('string')
            expect(typeof entry.score).toBe('number')
            expect(typeof entry.created_at).toBe('string')
        })
    })

    describe('scoped leaderboard', () => {
        it('returns a mode-only scoped best-per-user leaderboard', async () => {
            vi.mocked(getScopedGameLeaderboard).mockResolvedValue({
                success: true,
                rows: [
                    {
                        userId: 'u1',
                        name: 'Player',
                        username: 'player',
                        image: null,
                        score: 500,
                        created_at: '2026-08-01T00:00:00.000Z',
                        mode: 'daily',
                        competitionKey: null,
                        rulesetVersion: 2,
                        elapsedSeconds: 12,
                        totalMoves: 34,
                    },
                ],
            })

            const response = await GET({
                url: new URL(
                    'http://localhost/api/leaderboard?gameId=tetris&mode=daily'
                ),
            } as never)

            expect(response.status).toBe(200)
            expect(getScopedGameLeaderboard).toHaveBeenCalledWith({
                gameId: 'tetris',
                mode: 'daily',
                competitionKey: undefined,
                limit: 10,
            })

            const body = await response.json()
            expect(body.leaderboard).toEqual([
                {
                    rank: 1,
                    name: 'Player',
                    username: 'player',
                    image: null,
                    score: 500,
                    created_at: '2026-08-01T00:00:00.000Z',
                    mode: 'daily',
                    competitionKey: null,
                    rulesetVersion: 2,
                    elapsedSeconds: 12,
                    totalMoves: 34,
                },
            ])
            expect(body.leaderboard[0]).not.toHaveProperty('userId')
        })

        it('forwards an exact competition key', async () => {
            vi.mocked(getScopedGameLeaderboard).mockResolvedValue({
                success: true,
                rows: [],
            })

            await GET({
                url: new URL(
                    'http://localhost/api/leaderboard' +
                        '?gameId=tetris&mode=daily&competitionKey=daily%3A1'
                ),
            } as never)

            expect(getScopedGameLeaderboard).toHaveBeenCalledWith({
                gameId: 'tetris',
                mode: 'daily',
                competitionKey: 'daily:1',
                limit: 10,
            })
        })

        it.each([
            'http://localhost/api/leaderboard?mode=daily',
            'http://localhost/api/leaderboard?competitionKey=daily%3A1',
            'http://localhost/api/leaderboard?gameId=tetris&competitionKey=daily%3A1',
        ])('rejects invalid scoped parameter combinations: %s', async url => {
            const response = await GET({ url: new URL(url) } as never)
            expect(response.status).toBe(400)
            expect(getScopedGameLeaderboard).not.toHaveBeenCalled()
        })

        it('returns a stable scoped-unavailable code', async () => {
            vi.mocked(getScopedGameLeaderboard).mockResolvedValue({
                success: false,
                code: 'SCOPED_LEADERBOARD_UNAVAILABLE',
            })

            const response = await GET({
                url: new URL(
                    'http://localhost/api/leaderboard?gameId=tetris&mode=daily'
                ),
            } as never)

            expect(response.status).toBe(503)
            expect(await response.json()).toEqual({
                error: 'Scoped leaderboard is unavailable',
                code: 'SCOPED_LEADERBOARD_UNAVAILABLE',
            })
        })

        it('keeps two unscoped rows from the same user as two response entries', async () => {
            vi.mocked(getGameLeaderboard).mockResolvedValue([
                {
                    name: 'Same User',
                    username: 'sameuser',
                    score: 1000,
                    created_at: '2023-01-01T00:00:00Z',
                    image: null,
                },
                {
                    name: 'Same User',
                    username: 'sameuser',
                    score: 900,
                    created_at: '2023-01-02T00:00:00Z',
                    image: null,
                },
            ])

            const url = new URL(
                'http://localhost/api/leaderboard?gameId=tetris'
            )
            const response = await GET({ url } as never)

            const data = await response.json()
            expect(data.leaderboard).toHaveLength(2)
        })
    })
})
