import type { APIRoute } from 'astro'
import { updateUser } from '@/lib/server/db/queries'

export const DELETE: APIRoute = async ({ locals }) => {
    // Check if user is authenticated
    const user = locals.user
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    try {
        // Remove avatar by setting image to null
        const success = await updateUser(user.id, { image: null })

        if (!success) {
            return new Response(
                JSON.stringify({ error: 'Failed to remove avatar' }),
                {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Avatar removed successfully',
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    } catch (_error) {
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
}

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
        const formData = await request.formData()
        const file = formData.get('avatar') as File

        if (!file) {
            return new Response(JSON.stringify({ error: 'No file provided' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            return new Response(
                JSON.stringify({ error: 'File must be an image' }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            return new Response(
                JSON.stringify({ error: 'File size must be less than 5MB' }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        // Convert file to buffer and create base64 data URL directly
        // No resizing - use the cropped image as-is from frontend
        const buffer = Buffer.from(await file.arrayBuffer())
        const base64Image = `data:image/png;base64,${buffer.toString('base64')}`

        // Update user profile with the new avatar
        const success = await updateUser(user.id, { image: base64Image })

        if (!success) {
            return new Response(
                JSON.stringify({ error: 'Failed to update avatar' }),
                {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Avatar updated successfully',
                avatar: base64Image,
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    } catch (_error) {
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
}
