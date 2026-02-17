import type { APIRoute } from 'astro'
import { updateUser, isUsernameAvailable } from '@/lib/server/db/queries'
import type { UserUpdate } from '@/lib/server/db/types'
import { validateBody, profileUpdateSchema } from '@/lib/server/validations'
import {
    jsonResponse,
    unauthorizedResponse,
    badRequestResponse,
    errorResponse,
} from '@/lib/server/api-utils'

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
        const updates: Record<string, unknown> = {}

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

        const success = await updateUser(user.id, updates as UserUpdate)
        if (!success) {
            return errorResponse('Failed to update profile')
        }

        return jsonResponse({
            success: true,
            message: 'Profile updated successfully',
        })
    } catch (_error) {
        return errorResponse('Internal server error')
    }
}
