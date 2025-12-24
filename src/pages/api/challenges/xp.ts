import type { APIRoute } from 'astro'
import { auth } from '@/lib/auth'
import { getUserXPAndLevel } from '@/lib/server/db/queries'
import { getXPProgress, LEVEL_THRESHOLDS } from '@/lib/challenges'
import { jsonResponse, unauthorizedResponse } from '@/lib/server/api-utils'

export const GET: APIRoute = async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) {
        return unauthorizedResponse()
    }

    try {
        const { xp, level, challengeStreak } = await getUserXPAndLevel(
            session.user.id
        )
        const progress = getXPProgress(xp)

        return jsonResponse({
            xp,
            level,
            currentLevelXP: progress.currentLevelXP,
            nextLevelXP: progress.nextLevelXP,
            progress: progress.progress,
            streak: challengeStreak,
            maxLevel: LEVEL_THRESHOLDS.length,
        })
    } catch (_error) {
        return jsonResponse({ error: 'Failed to fetch XP info' }, 500)
    }
}
