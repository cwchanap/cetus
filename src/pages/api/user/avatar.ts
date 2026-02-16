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
        const avatarEntry = formData.get('avatar')

        // Validate that avatar entry exists and is a File (not a string)
        if (!avatarEntry) {
            return badRequestResponse('No file provided')
        }

        if (!(avatarEntry instanceof File)) {
            return badRequestResponse('Avatar must be a file')
        }

        const file = avatarEntry

        // Validate file type using allowlist (reject SVG due to XSS risk)
        const allowedMimeTypes = [
            'image/png',
            'image/jpeg',
            'image/webp',
            'image/gif',
        ]
        if (!allowedMimeTypes.includes(file.type)) {
            return badRequestResponse(
                'File must be a valid image (PNG, JPEG, WebP, or GIF)'
            )
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
