import type { APIRoute } from 'astro'
import { db } from '@/lib/server/db/client'
import { GameID } from '@/lib/games'

export const POST: APIRoute = async () => {
    // Only allow in development
    if (import.meta.env.PROD) {
        return new Response(
            JSON.stringify({ error: 'Not available in production' }),
            {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }

    try {
        // Create a test user first
        const testUserId = 'test-user-12345'

        try {
            await db
                .insertInto('user')
                .values({
                    id: testUserId,
                    name: 'Test Player',
                    email: 'test@example.com',
                    emailVerified: Math.floor(Date.now() / 1000),
                    image: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .execute()
        } catch {
            // User may already exist, continue
        }

        // Add some test scores
        const testScores = [
            { gameId: GameID.TETRIS, score: 15420 },
            { gameId: GameID.TETRIS, score: 12340 },
            { gameId: GameID.TETRIS, score: 11250 },
            { gameId: GameID.QUICK_MATH, score: 280 },
            { gameId: GameID.QUICK_MATH, score: 215 },
            { gameId: GameID.MEMORY_MATRIX, score: 4200 },
            { gameId: GameID.BUBBLE_SHOOTER, score: 7650 },
            { gameId: GameID.WORD_SCRAMBLE, score: 680 },
            { gameId: GameID.REFLEX, score: 850 },
            { gameId: GameID.SUDOKU, score: 2350 },
        ]

        let addedCount = 0
        for (const testScore of testScores) {
            try {
                await db
                    .insertInto('game_scores')
                    .values({
                        user_id: testUserId,
                        game_id: testScore.gameId,
                        score: testScore.score,
                    })
                    .execute()
                addedCount++
            } catch {
                // Score may already exist, continue
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: `Added ${addedCount} test scores. Visit /leaderboard to see results.`,
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    } catch (error) {
        return new Response(
            JSON.stringify({
                error: 'Failed to add test scores',
                details:
                    error instanceof Error ? error.message : 'Unknown error',
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
}
