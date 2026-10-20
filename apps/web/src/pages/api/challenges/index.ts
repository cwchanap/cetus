import type { APIRoute } from 'astro'
import { auth } from '@/lib/auth'
import { getUserDailyChallenges } from '@/lib/services/challengeService'
import { getUserXPAndLevel } from '@/lib/server/db/queries'
import {
    getSecondsUntilMidnightUTC,
    getTodayUTC,
    getXPProgress,
} from '@/lib/challenges'
import { jsonResponse, unauthorizedResponse } from '@/lib/server/api-utils'

export const GET: APIRoute = async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) {
        return unauthorizedResponse()
    }

    try {
        const challenges = await getUserDailyChallenges(session.user.id)
        const { xp, level, challengeStreak } = await getUserXPAndLevel(
            session.user.id
        )
        const xpProgress = getXPProgress(xp)

        return jsonResponse({
            challenges,
            xp,
            level,
            xpProgress: xpProgress.progress,
            xpToNextLevel: Math.max(0, xpProgress.nextLevelXP - xp),
            streak: challengeStreak,
            resetIn: getSecondsUntilMidnightUTC(),
            date: getTodayUTC(),
        })
    } catch (error) {
        const safeMessage =
            error instanceof Error ? error.message : 'Unknown error occurred'
        // eslint-disable-next-line no-console
        console.error('[GET /api/challenges] Failed to fetch challenges', {
            path: request.url,
            userId: session?.user?.id,
            error: safeMessage,
        })
        return jsonResponse({ error: 'Failed to fetch challenges' }, 500)
    }
}
