import { db } from '../src/lib/server/db/client'
import { saveGameScore } from '../src/lib/server/db/queries'

async function populateTestData() {
    console.log('Populating test data...')

    try {
        // Create some test users
        const testUsers = [
            { id: 'user1', name: 'Test User 1', email: 'test1@example.com' },
            { id: 'user2', name: 'Test User 2', email: 'test2@example.com' },
            { id: 'user3', name: 'Test User 3', email: 'test3@example.com' },
        ]

        // Insert test users
        for (const user of testUsers) {
            try {
                await db
                    .insertInto('user')
                    .values({
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        emailVerified: 1, // SQLite uses INTEGER for BOOLEAN
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    })
                    .execute()
                console.log(`Created user: ${user.name}`)
            } catch (e) {
                console.log(`User ${user.name} already exists`)
            }
        }

        // Add some game scores
        const games = [
            'tetris',
            'bubble_shooter',
            'memory_matrix',
            'quick_math',
        ]
        for (const user of testUsers) {
            for (const game of games) {
                // Add 1-3 scores per user per game
                const numScores = Math.floor(Math.random() * 3) + 1
                for (let i = 0; i < numScores; i++) {
                    const score = Math.floor(Math.random() * 1000) + 1
                    await saveGameScore(user.id, game, score)
                    console.log(
                        `Added score ${score} for ${user.name} in ${game}`
                    )
                }
            }
        }

        // Award some achievements manually
        const achievements = [
            'tetris_welcome',
            'bubble_shooter_welcome',
            'memory_matrix_welcome',
            'tetris_novice',
            'bubble_beginner',
            'memory_novice',
        ]

        for (const user of testUsers.slice(0, 2)) {
            // Only award to first 2 users
            for (const achievementId of achievements.slice(0, 3)) {
                // Award first 3 achievements
                try {
                    await db
                        .insertInto('user_achievements')
                        .values({
                            user_id: user.id,
                            achievement_id: achievementId,
                        })
                        .execute()
                    console.log(`Awarded ${achievementId} to ${user.name}`)
                } catch (e) {
                    console.log(
                        `Achievement ${achievementId} already awarded to ${user.name}`
                    )
                }
            }
        }

        console.log('Test data populated successfully!')
    } catch (error) {
        console.error('Error populating test data:', error)
    }
}

populateTestData()
