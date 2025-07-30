import { db } from '@/lib/server/db/client'
import { GameID } from '@/lib/games'

// Sample data for populating leaderboards
const sampleScores = [
    // Tetris scores
    { game_id: GameID.TETRIS, user_name: 'Alex Chen', score: 15420 },
    { game_id: GameID.TETRIS, user_name: 'Sarah Johnson', score: 12340 },
    { game_id: GameID.TETRIS, user_name: 'Mike Rodriguez', score: 11250 },
    { game_id: GameID.TETRIS, user_name: 'Emma Wilson', score: 9870 },
    { game_id: GameID.TETRIS, user_name: 'David Kim', score: 8650 },

    // Quick Math scores
    { game_id: GameID.QUICK_MATH, user_name: 'Lisa Zhang', score: 2840 },
    { game_id: GameID.QUICK_MATH, user_name: 'Tom Anderson', score: 2150 },
    { game_id: GameID.QUICK_MATH, user_name: 'Nina Patel', score: 1980 },
    { game_id: GameID.QUICK_MATH, user_name: 'James Wu', score: 1750 },
    { game_id: GameID.QUICK_MATH, user_name: 'Sophia Lee', score: 1620 },

    // Memory Matrix scores
    { game_id: GameID.MEMORY_MATRIX, user_name: 'Carlos Santos', score: 4200 },
    { game_id: GameID.MEMORY_MATRIX, user_name: 'Maya Gupta', score: 3850 },
    { game_id: GameID.MEMORY_MATRIX, user_name: "Ryan O'Connor", score: 3420 },
    { game_id: GameID.MEMORY_MATRIX, user_name: 'Zoe Chen', score: 3100 },
    { game_id: GameID.MEMORY_MATRIX, user_name: 'Andre Silva', score: 2890 },

    // Bubble Shooter scores
    {
        game_id: GameID.BUBBLE_SHOOTER,
        user_name: 'Isabella Garcia',
        score: 7650,
    },
    { game_id: GameID.BUBBLE_SHOOTER, user_name: 'Lucas Brown', score: 6320 },
    { game_id: GameID.BUBBLE_SHOOTER, user_name: 'Ava Thompson', score: 5940 },
    { game_id: GameID.BUBBLE_SHOOTER, user_name: 'Ethan Davis', score: 5210 },
    { game_id: GameID.BUBBLE_SHOOTER, user_name: 'Mia Johnson', score: 4780 },

    // Word Scramble scores
    { game_id: GameID.WORD_SCRAMBLE, user_name: 'Oliver Martinez', score: 680 },
    { game_id: GameID.WORD_SCRAMBLE, user_name: 'Charlotte Wong', score: 590 },
    { game_id: GameID.WORD_SCRAMBLE, user_name: 'Noah Taylor', score: 520 },
    { game_id: GameID.WORD_SCRAMBLE, user_name: 'Amelia Clarke', score: 480 },
    { game_id: GameID.WORD_SCRAMBLE, user_name: 'William Jones', score: 430 },

    // Reflex scores
    { game_id: GameID.REFLEX, user_name: 'Liam Miller', score: 850 },
    { game_id: GameID.REFLEX, user_name: 'Harper Wilson', score: 720 },
    { game_id: GameID.REFLEX, user_name: 'Benjamin White', score: 650 },
    { game_id: GameID.REFLEX, user_name: 'Evelyn Harris', score: 580 },
    { game_id: GameID.REFLEX, user_name: 'Henry Lewis', score: 510 },

    // Sudoku scores
    { game_id: GameID.SUDOKU, user_name: 'Chloe Martin', score: 2350 },
    { game_id: GameID.SUDOKU, user_name: 'Sebastian Clark', score: 2120 },
    { game_id: GameID.SUDOKU, user_name: 'Grace Rodriguez', score: 1940 },
    { game_id: GameID.SUDOKU, user_name: 'Daniel Lee', score: 1780 },
    { game_id: GameID.SUDOKU, user_name: 'Lily Anderson', score: 1650 },
]

async function populateLeaderboards() {
    try {
        console.log('🎮 Starting to populate leaderboards with sample data...')

        // First, we need to create sample users for the scores
        // Note: This is a simplified approach for demo purposes

        for (const scoreData of sampleScores) {
            // Insert directly into game_scores table
            // Note: In a real app, you'd want proper user_id references
            const fakeUserId = `demo-user-${Math.random().toString(36).substr(2, 9)}`

            await db
                .insertInto('game_scores')
                .values({
                    user_id: fakeUserId,
                    game_id: scoreData.game_id,
                    score: scoreData.score,
                })
                .execute()

            console.log(
                `✅ Added score: ${scoreData.user_name} - ${scoreData.game_id} - ${scoreData.score}`
            )
        }

        console.log('🎉 Successfully populated leaderboards with sample data!')
        console.log(`📊 Total scores added: ${sampleScores.length}`)
    } catch (error) {
        console.error('❌ Error populating leaderboards:', error)
    }
}

// Run the population script
populateLeaderboards()
    .then(() => {
        console.log('✨ Leaderboard population complete!')
        process.exit(0)
    })
    .catch(error => {
        console.error('💥 Failed to populate leaderboards:', error)
        process.exit(1)
    })
