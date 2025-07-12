import type { APIRoute } from 'astro'
import { updateUser } from '@/lib/db/queries'

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
        const { name } = data

        // Validate input
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return new Response(
                JSON.stringify({
                    error: 'Name is required and must be a valid string',
                }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        // Trim and validate name length
        const trimmedName = name.trim()
        if (trimmedName.length > 100) {
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

        // Update user profile
        const success = await updateUser(user.id, { name: trimmedName })

        if (!success) {
            return new Response(
                JSON.stringify({ error: 'Failed to update profile' }),
                {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Profile updated successfully',
                name: trimmedName,
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    } catch (error) {
        console.error('Error updating user profile:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
}
