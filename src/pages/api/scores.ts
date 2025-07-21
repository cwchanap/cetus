import type { APIRoute } from 'astro'
import { saveGameScoreWithAchievements } from '@/lib/server/db/queries'
import { getGameById, GameID } from '@/lib/games'
import { auth } from '@/lib/auth'
import { getAchievementNotifications } from '@/lib/services/achievementService'

export const POST: APIRoute = async ({ request }) => {
    try {
        const session = await auth.api.getSession({
            headers: request.headers,
        })

        if (!session) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                },
            })
        }

        const { gameId, score, gameData } = await request.json()

        if (!gameId || typeof score !== 'number') {
            return new Response(JSON.stringify({ error: 'Invalid data' }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
            })
        }

        // Verify game exists
        const game = getGameById(gameId as GameID)
        if (!game) {
            return new Response(JSON.stringify({ error: 'Invalid game ID' }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
            })
        }

        const result = await saveGameScoreWithAchievements(
            session.user.id,
            gameId,
            score,
            gameData
        )

        if (!result.success) {
            return new Response(
                JSON.stringify({ error: 'Failed to save score' }),
                {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            )
        }

        // Convert achievement IDs to full achievement data
        const achievementNotifications = getAchievementNotifications(
            result.newAchievements
        )

        return new Response(
            JSON.stringify({
                success: true,
                newAchievements: achievementNotifications.map(achievement => ({
                    id: achievement.id,
                    name: achievement.name,
                    description: achievement.description,
                    icon: achievement.logo,
                    rarity: achievement.rarity,
                })),
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        )
    } catch (error) {
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        )
    }
}
