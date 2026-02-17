import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Buffer } from 'node:buffer'
import { DELETE, POST } from '@/pages/api/user/avatar'
import { updateUser } from '@/lib/server/db/queries'

vi.mock('@/lib/server/db/queries', () => ({
    updateUser: vi.fn(),
}))

describe('/api/user/avatar', () => {
    const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
    }

    let originalArrayBufferDescriptor: PropertyDescriptor | undefined

    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubGlobal('Buffer', Buffer)
        originalArrayBufferDescriptor = Object.getOwnPropertyDescriptor(
            File.prototype,
            'arrayBuffer'
        )
        Object.defineProperty(File.prototype, 'arrayBuffer', {
            configurable: true,
            value: async function () {
                return new Uint8Array([97, 98, 99]).buffer
            },
        })
        vi.mocked(updateUser).mockResolvedValue(true)
    })

    afterEach(() => {
        if (originalArrayBufferDescriptor) {
            Object.defineProperty(
                File.prototype,
                'arrayBuffer',
                originalArrayBufferDescriptor
            )
        } else {
            delete (File.prototype as any).arrayBuffer
        }
    })

    describe('DELETE', () => {
        it('returns 401 when user is unauthenticated', async () => {
            const response = await DELETE({ locals: {} } as any)

            expect(response.status).toBe(401)
            await expect(response.json()).resolves.toEqual({
                error: 'Unauthorized',
            })
            expect(updateUser).not.toHaveBeenCalled()
        })

        it('returns 500 when avatar removal fails', async () => {
            vi.mocked(updateUser).mockResolvedValue(false)

            const response = await DELETE({
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(500)
            await expect(response.json()).resolves.toEqual({
                error: 'Failed to remove avatar',
            })
            expect(updateUser).toHaveBeenCalledWith('user-123', { image: null })
        })

        it('returns 500 when removal throws', async () => {
            vi.mocked(updateUser).mockRejectedValue(new Error('db error'))

            const response = await DELETE({
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(500)
            await expect(response.json()).resolves.toEqual({
                error: 'Internal server error',
            })
        })

        it('removes avatar successfully', async () => {
            const response = await DELETE({
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(200)
            await expect(response.json()).resolves.toEqual({
                success: true,
                message: 'Avatar removed successfully',
            })
            expect(updateUser).toHaveBeenCalledWith('user-123', { image: null })
        })
    })

    describe('POST', () => {
        function createRequestWithAvatar(avatar?: FormDataEntryValue) {
            const formData = new FormData()
            if (avatar !== undefined) {
                formData.set('avatar', avatar)
            }

            return {
                formData: vi.fn().mockResolvedValue(formData),
            }
        }

        it('returns 401 when user is unauthenticated', async () => {
            const request = createRequestWithAvatar(
                new File(['hello'], 'avatar.png', { type: 'image/png' })
            )

            const response = await POST({ request, locals: {} } as any)

            expect(response.status).toBe(401)
            await expect(response.json()).resolves.toEqual({
                error: 'Unauthorized',
            })
            expect(updateUser).not.toHaveBeenCalled()
        })

        it('returns 400 when no file is provided', async () => {
            const request = createRequestWithAvatar()

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            await expect(response.json()).resolves.toEqual({
                error: 'No file provided',
            })
        })

        it('returns 400 when avatar is not a file', async () => {
            const request = createRequestWithAvatar('not-a-file')

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            await expect(response.json()).resolves.toEqual({
                error: 'Avatar must be a file',
            })
        })

        it('returns 400 for unsupported mime type', async () => {
            const request = createRequestWithAvatar(
                new File(['hello'], 'avatar.svg', { type: 'image/svg+xml' })
            )

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            await expect(response.json()).resolves.toEqual({
                error: 'File must be a valid image (PNG, JPEG, WebP, or GIF)',
            })
        })

        it('returns 400 when file size exceeds 5MB', async () => {
            const oversizedData = new Uint8Array(5 * 1024 * 1024 + 1)
            const request = createRequestWithAvatar(
                new File([oversizedData], 'avatar.png', { type: 'image/png' })
            )

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            await expect(response.json()).resolves.toEqual({
                error: 'File size must be less than 5MB',
            })
        })

        it('returns 500 when update fails', async () => {
            vi.mocked(updateUser).mockResolvedValue(false)
            const request = createRequestWithAvatar(
                new File(['abc'], 'avatar.png', { type: 'image/png' })
            )

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(500)
            await expect(response.json()).resolves.toEqual({
                error: 'Failed to update avatar',
            })
            expect(updateUser).toHaveBeenCalledTimes(1)
            expect(updateUser).toHaveBeenCalledWith(
                'user-123',
                expect.objectContaining({
                    image: expect.stringContaining('data:image/png;base64,'),
                })
            )
        })

        it('returns 500 when processing throws', async () => {
            const request = {
                formData: vi.fn().mockRejectedValue(new Error('bad form data')),
            }

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(500)
            await expect(response.json()).resolves.toEqual({
                error: 'Internal server error',
            })
        })

        it('updates avatar successfully and returns data url', async () => {
            const file = new File(['abc'], 'avatar.png', { type: 'image/png' })
            const request = createRequestWithAvatar(file)

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(200)
            const data = await response.json()

            expect(data.success).toBe(true)
            expect(data.message).toBe('Avatar updated successfully')
            expect(data.avatar).toMatch(/^data:image\/png;base64,/)
            expect(updateUser).toHaveBeenCalledWith(
                'user-123',
                expect.objectContaining({ image: data.avatar })
            )
        })
    })
})
