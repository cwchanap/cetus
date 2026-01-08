import type { APIRoute } from 'astro'
import {
    getUserPreferences,
    updateUserPreferences,
} from '@/lib/server/db/queries'

/**
 * GET /api/settings
 * Get user notification preferences
 */
export const GET: APIRoute = async ({ locals }) => {
    const user = locals.user
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    try {
        const preferences = await getUserPreferences(user.id)

        return new Response(JSON.stringify(preferences), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('[GET /api/settings] Error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
}

/**
 * POST /api/settings
 * Update user notification preferences
 */
export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    try {
        const data = await request.json()

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
            return new Response(
                JSON.stringify({ error: 'No valid preferences to update' }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        const success = await updateUserPreferences(user.id, updates)

        if (!success) {
            return new Response(
                JSON.stringify({ error: 'Failed to update preferences' }),
                {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        // Return updated preferences
        const updatedPreferences = await getUserPreferences(user.id)

        return new Response(
            JSON.stringify({
                success: true,
                preferences: updatedPreferences,
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    } catch (error) {
        console.error('[POST /api/settings] Error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
}
