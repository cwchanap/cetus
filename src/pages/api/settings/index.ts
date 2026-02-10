import type { APIRoute } from 'astro'
import {
    getUserPreferences,
    updateUserPreferences,
} from '@/lib/server/db/queries'
import {
    jsonResponse,
    unauthorizedResponse,
    badRequestResponse,
    errorResponse,
} from '@/lib/server/api-utils'

/**
 * GET /api/settings
 * Get user notification preferences
 */
export const GET: APIRoute = async ({ locals }) => {
    const user = locals.user
    if (!user) {
        return unauthorizedResponse()
    }

    try {
        const preferences = await getUserPreferences(user.id)

        // getUserPreferences returns null only on database errors
        // (it returns defaults if no row exists)
        if (!preferences) {
            console.error(
                '[GET /api/settings] Failed to fetch preferences from database'
            )
            return errorResponse('Failed to fetch preferences')
        }

        return jsonResponse(preferences)
    } catch (error) {
        console.error('[GET /api/settings] Error:', error)
        return errorResponse('Internal server error')
    }
}

/**
 * POST /api/settings
 * Update user notification preferences
 */
export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user
    if (!user) {
        return unauthorizedResponse()
    }

    try {
        // Parse JSON with specific error handling for malformed JSON
        let data
        try {
            data = await request.json()
        } catch (err) {
            if (err && err instanceof SyntaxError) {
                return badRequestResponse('Bad Request: malformed JSON')
            }
            throw err // Re-throw other errors
        }

        // Validate input - only accept boolean values for notification preferences
        const updates: {
            email_notifications?: boolean
            push_notifications?: boolean
            challenge_reminders?: boolean
        } = {}

        if (typeof data.email_notifications === 'boolean') {
            updates.email_notifications = data.email_notifications
        }
        if (typeof data.push_notifications === 'boolean') {
            updates.push_notifications = data.push_notifications
        }
        if (typeof data.challenge_reminders === 'boolean') {
            updates.challenge_reminders = data.challenge_reminders
        }

        if (Object.keys(updates).length === 0) {
            return badRequestResponse('No valid preferences to update')
        }

        const success = await updateUserPreferences(user.id, updates)

        if (!success) {
            return errorResponse('Failed to update preferences')
        }

        // Return updated preferences
        const updatedPreferences = await getUserPreferences(user.id)

        // getUserPreferences returns null only on database errors
        // (it returns defaults if no row exists)
        if (!updatedPreferences) {
            console.error(
                '[POST /api/settings] Failed to read back updated preferences from database'
            )
            return errorResponse('Failed to retrieve updated preferences')
        }

        return jsonResponse({
            success: true,
            preferences: updatedPreferences,
        })
    } catch (error) {
        console.error('[POST /api/settings] Error:', error)
        return errorResponse('Internal server error')
    }
}
