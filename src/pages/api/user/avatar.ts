import type { APIRoute } from 'astro'
import { updateUser } from '@/lib/server/db/queries'
import {
    jsonResponse,
    unauthorizedResponse,
    badRequestResponse,
    errorResponse,
} from '@/lib/server/api-utils'

export const DELETE: APIRoute = async ({ locals }) => {
    const user = locals.user
    if (!user) {
        return unauthorizedResponse()
    }

    try {
        const success = await updateUser(user.id, { image: null })

        if (!success) {
            return errorResponse('Failed to remove avatar')
        }

        return jsonResponse({
            success: true,
            message: 'Avatar removed successfully',
        })
    } catch (_error) {
        return errorResponse('Internal server error')
    }
}

export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user
    if (!user) {
        return unauthorizedResponse()
    }

    try {
        const formData = await request.formData()
        const file = formData.get('avatar') as File

        if (!file) {
            return badRequestResponse('No file provided')
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            return badRequestResponse('File must be an image')
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            return badRequestResponse('File size must be less than 5MB')
        }

        // Convert file to buffer and create base64 data URL directly
        // No resizing - use the cropped image as-is from frontend
        const buffer = Buffer.from(await file.arrayBuffer())
        const base64Image = `data:image/png;base64,${buffer.toString('base64')}`

        // Update user profile with the new avatar
        const success = await updateUser(user.id, { image: base64Image })

        if (!success) {
            return errorResponse('Failed to update avatar')
        }

        return jsonResponse({
            success: true,
            message: 'Avatar updated successfully',
            avatar: base64Image,
        })
    } catch (_error) {
        return errorResponse('Internal server error')
    }
}
