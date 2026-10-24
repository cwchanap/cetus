import type { APIRoute } from 'astro'
import { auth } from '@/lib/auth'
import { getUserDailyChallenges } from '@/lib/services/challengeService'
import { getUserXPAndLevel } from '@/lib/server/db/queries'
import {
    getSecondsUntilMidnightUTC,
    getTodayUTC,
    getXPProgress,
} from '@cetus/shared/challenges'
import { jsonResponse, unauthorizedResponse } from '@/lib/server/api-utils'
import type { ChallengesResponse } from '@cetus/shared/api-dto'

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

        // Serialize completedAt to the wire shape (JSON date string) so the
        // payload is checked against the shared DTO as-is. An unparseable
        // completed_at row produces an Invalid Date; JSON.stringify used to
        // write null for it, and toISOString() would throw instead — keep the
        // old null-on-wire behavior rather than failing the whole request.
        const payload: ChallengesResponse = {
            challenges: challenges.map(challenge => ({
                ...challenge,
                completedAt:
                    challenge.completedAt &&
                    !Number.isNaN(challenge.completedAt.getTime())
                        ? challenge.completedAt.toISOString()
                        : null,
            })),
            xp,
            level,
            xpProgress: xpProgress.progress,
            xpToNextLevel: Math.max(0, xpProgress.nextLevelXP - xp),
            streak: challengeStreak,
            resetIn: getSecondsUntilMidnightUTC(),
            date: getTodayUTC(),
        }

        return jsonResponse<ChallengesResponse>(payload)
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
