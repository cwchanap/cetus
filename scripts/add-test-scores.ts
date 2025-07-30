import { db } from '@/lib/server/db/client'
import { GameID } from '@/lib/games'

// Simple script to add test scores directly to the database
async function addTestScores() {
    try {
        console.log('Adding test scores to the database...')

        // Create a test user first
        const testUserId = 'test-user-12345'

        try {
            await db
                .insertInto('user')
                .values({
                    id: testUserId,
                    name: 'Test Player',
                    email: 'test@example.com',
                    emailVerified: new Date(),
                    image: null,
                })
                .execute()
            console.log('✅ Created test user')
        } catch (error) {
            console.log('ℹ️  Test user may already exist, continuing...')
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

        for (const testScore of testScores) {
            await db
                .insertInto('game_scores')
                .values({
                    user_id: testUserId,
                    game_id: testScore.gameId,
                    score: testScore.score,
                })
                .execute()

            console.log(
                `✅ Added ${testScore.gameId} score: ${testScore.score}`
            )
        }

        console.log('🎉 Successfully added test scores!')
        console.log(
            '🔗 Visit http://localhost:4322/leaderboard to see the results'
        )
    } catch (error: any) {
        console.error('❌ Error adding test scores:', error.message)
    }
}

addTestScores()
    .then(() => {
        process.exit(0)
    })
    .catch(error => {
        console.error('💥 Script failed:', error)
        process.exit(1)
    })
