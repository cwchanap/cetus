import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/pages/api/leaderboard'
import { getGameLeaderboard } from '@/lib/server/db/queries'
import { getAllGames, GameID } from '@/lib/games'

// Mock dependencies
vi.mock('@/lib/server/db/queries', () => ({
    getGameLeaderboard: vi.fn(),
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
            expect(data).toHaveProperty('error', 'Invalid limit parameter')
        })

        it('should return 400 for negative limit', async () => {
            const url = new URL('http://localhost/api/leaderboard?limit=-5')
            const response = await GET({ url } as any)

            expect(response.status).toBe(400)

            const data = await response.json()
            expect(data).toHaveProperty('error', 'Invalid limit parameter')
        })

        it('should return 400 for limit exceeding maximum', async () => {
            const url = new URL('http://localhost/api/leaderboard?limit=101')
            const response = await GET({ url } as any)

            expect(response.status).toBe(400)

            const data = await response.json()
            expect(data).toHaveProperty('error', 'Invalid limit parameter')
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
})
