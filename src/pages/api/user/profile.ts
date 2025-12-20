import type { APIRoute } from 'astro'
import { updateUser, isUsernameAvailable } from '@/lib/server/db/queries'
import type { UserUpdate } from '@/lib/server/db/types'

export const POST: APIRoute = async ({ request, locals }) => {
    // Check if user is authenticated
    const user = locals.user
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    try {
        const data = await request.json()
        const { name, displayName, username } = data ?? {}

        // Prepare updates object
        const updates: Record<string, unknown> = {}

        // Backward compat: if legacy name provided, validate and set it
        if (typeof name !== 'undefined') {
            if (typeof name !== 'string' || name.trim().length === 0) {
                return new Response(
                    JSON.stringify({
                        error: 'Name must be a non-empty string when provided',
                    }),
                    {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                    }
                )
            }
            const trimmed = name.trim()
            if (trimmed.length > 100) {
                return new Response(
                    JSON.stringify({
                        error: 'Name must be 100 characters or less',
                    }),
                    {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                    }
                )
            }
            updates.name = trimmed
        }

        // New field: displayName (optional)
        if (typeof displayName !== 'undefined') {
            if (displayName === null || displayName === '') {
                updates.displayName = null
            } else if (typeof displayName === 'string') {
                const trimmed = displayName.trim()
                if (trimmed.length === 0) {
                    return new Response(
                        JSON.stringify({
                            error: 'Display name cannot be empty',
                        }),
                        {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' },
                        }
                    )
                }
                if (trimmed.length > 100) {
                    return new Response(
                        JSON.stringify({
                            error: 'Display name must be 100 characters or less',
                        }),
                        {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' },
                        }
                    )
                }
                updates.displayName = trimmed
            } else {
                return new Response(
                    JSON.stringify({ error: 'Invalid displayName value' }),
                    {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                    }
                )
            }
        }

        // New field: username (optional, unique, normalized to lowercase)
        if (typeof username !== 'undefined') {
            if (username === null || username === '') {
                updates.username = null
            } else if (typeof username === 'string') {
                const normalized = username.trim().toLowerCase()
                const re = /^[a-z0-9_]{3,20}$/
                if (!re.test(normalized)) {
                    return new Response(
                        JSON.stringify({
                            error: 'Username must be 3-20 chars, lowercase letters, numbers or underscore',
                        }),
                        {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' },
                        }
                    )
                }

                // Uniqueness (excluding the current user)
                const available = await isUsernameAvailable(normalized, user.id)
                if (!available) {
                    return new Response(
                        JSON.stringify({ error: 'Username is already taken' }),
                        {
                            status: 409,
                            headers: { 'Content-Type': 'application/json' },
                        }
                    )
                }

                updates.username = normalized
            } else {
                return new Response(
                    JSON.stringify({ error: 'Invalid username value' }),
                    {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                    }
                )
            }
        }

        // Nothing to update
        if (Object.keys(updates).length === 0) {
            return new Response(
                JSON.stringify({ error: 'No valid fields to update' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        const success = await updateUser(user.id, updates as UserUpdate)
        if (!success) {
            return new Response(
                JSON.stringify({ error: 'Failed to update profile' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Profile updated successfully',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    } catch (_error) {
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
}
