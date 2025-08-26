import { getAchievementStatistics } from '../src/lib/server/db/queries'
import { db } from '../src/lib/server/db/client'

async function testAchievementStats() {
    console.log('Testing achievement statistics...')

    try {
        // Check if there are any game scores
        const gameScores = await db
            .selectFrom('game_scores')
            .select(db.fn.count('id').as('count'))
            .executeTakeFirst()
        console.log('Total game scores:', gameScores?.count || 0)

        // Check if there are any user achievements
        const userAchievements = await db
            .selectFrom('user_achievements')
            .select(db.fn.count('id').as('count'))
            .executeTakeFirst()
        console.log('Total user achievements:', userAchievements?.count || 0)

        // Check if there are any users
        const users = await db
            .selectFrom('user')
            .select(db.fn.count('id').as('count'))
            .executeTakeFirst()
        console.log('Total users:', users?.count || 0)

        // Get achievement statistics
        const stats = await getAchievementStatistics()
        console.log('Achievement statistics:', stats)

        // Show first few results
        if (stats.length > 0) {
            console.log('First 5 achievements:')
            stats.slice(0, 5).forEach(stat => {
                console.log(
                    `- ${stat.achievement_id}: ${stat.earned_count}/${stat.total_players} players (${stat.percentage}%)`
                )
            })
        }
    } catch (error) {
        console.error('Error testing achievement stats:', error)
    }
}

testAchievementStats()
