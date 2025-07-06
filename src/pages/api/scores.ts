import type { APIRoute } from 'astro'
import { saveGameScore, getGameById } from '@/lib/db/queries'
import { auth } from '@/lib/auth'

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

    const { gameId, score } = await request.json()

    if (!gameId || typeof score !== 'number') {
      return new Response(JSON.stringify({ error: 'Invalid data' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }

    // Verify game exists
    const game = await getGameById(gameId)
    if (!game) {
      return new Response(JSON.stringify({ error: 'Invalid game ID' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }

    const success = await saveGameScore(session.user.id, gameId, score)

    if (!success) {
      return new Response(JSON.stringify({ error: 'Failed to save score' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('Error in POST /api/scores:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}
