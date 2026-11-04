import type { APIRoute } from 'astro'
import {
    updateUser,
    isUsernameAvailable,
    getUserIdentityByIdStrict,
    getUserStatsStrict,
    getUserAchievementsStrict,
} from '@/lib/server/db/queries'
import type { UserUpdate } from '@/lib/server/db/types'
import { profileUpdateSchema } from '@cetus/shared/validations'
import { validateBody } from '@/lib/server/validations'
import {
    jsonResponse,
    unauthorizedResponse,
    badRequestResponse,
    notFoundResponse,
    errorResponse,
} from '@/lib/server/api-utils'
import type {
    SuccessMessageResponse,
    UserOverviewResponse,
} from '@cetus/shared/api-dto'

export const GET: APIRoute = async ({ locals }) => {
    const user = locals.user
    if (!user) {
        return unauthorizedResponse()
    }

    try {
        const identity = await getUserIdentityByIdStrict(user.id)
        if (!identity) {
            return notFoundResponse('User not found')
        }

        const [stats, achievements] = await Promise.all([
            getUserStatsStrict(user.id),
            getUserAchievementsStrict(user.id),
        ])

        return jsonResponse<UserOverviewResponse>({
            profile: {
                name: identity.name,
                displayName: identity.displayName,
                username: identity.username,
                image: identity.image,
                createdAt: identity.createdAt,
            },
            stats: {
                totalGamesPlayed: stats?.total_games_played ?? 0,
                totalScore: stats?.total_score ?? 0,
                favoriteGame: stats?.favorite_game ?? null,
                streakDays: stats?.streak_days ?? 0,
                xp: stats?.xp ?? 0,
                level: stats?.level ?? 1,
            },
            earnedAchievementIds: achievements.map(a => a.achievement_id),
        })
    } catch (error) {
        console.error('[profile:GET] Unexpected error reading overview:', error)
        return errorResponse('Internal server error')
    }
}

export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user
    if (!user) {
        return unauthorizedResponse()
    }

    try {
        const validation = await validateBody(request, profileUpdateSchema)
        if (!validation.success) {
            return badRequestResponse(validation.error)
        }

        const { name, displayName, username } = validation.data
        const updates: UserUpdate = {}

        if (name !== undefined) {
            updates.name = name
        }

        if (displayName !== undefined) {
            updates.displayName = displayName
        }

        if (username !== undefined) {
            if (username !== null) {
                // Check uniqueness (excluding the current user)
                const available = await isUsernameAvailable(username, user.id)
                if (!available) {
                    return errorResponse('Username is already taken', 409)
                }
            }
            updates.username = username
        }

        const success = await updateUser(user.id, updates)
        if (!success) {
            return errorResponse('Failed to update profile')
        }

        return jsonResponse<SuccessMessageResponse>({
            success: true,
            message: 'Profile updated successfully',
        })
    } catch (error) {
        console.error('[profile] Unexpected error updating profile:', error)
        return errorResponse('Internal server error')
    }
}
