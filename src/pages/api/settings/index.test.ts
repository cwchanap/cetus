import { describe, it, expect, vi } from 'vitest'
import { GET, POST } from '@/pages/api/settings/index'
import type { APIContext } from 'astro'

// Mock the database queries
vi.mock('@/lib/server/db/queries', () => ({
    getUserPreferences: vi.fn(),
    updateUserPreferences: vi.fn(),
}))

const { getUserPreferences, updateUserPreferences } = await import(
    '@/lib/server/db/queries'
)

describe('Settings API', () => {
    const mockUserId = 'test-user-123'

    const mockLocals = {
        user: { id: mockUserId } as { id: string },
    }

    const createMockContext = (
        locals: typeof mockLocals | { user: null },
        request?: Request
    ) =>
        ({
            locals,
            request,
        }) as APIContext

    describe('GET /api/settings', () => {
        it('should return 401 if user is not authenticated', async () => {
            const context = createMockContext({ user: null })
            const response = await GET(context)
            const data = await response.json()

            expect(response.status).toBe(401)
            expect(data.error).toBe('Unauthorized')
        })

        it('should return 200 with preferences on success', async () => {
            const mockPreferences = {
                email_notifications: true,
                push_notifications: false,
                challenge_reminders: true,
            }
            vi.mocked(getUserPreferences).mockResolvedValue(mockPreferences)

            const context = createMockContext(mockLocals)
            const response = await GET(context)
            const data = await response.json()

            expect(response.status).toBe(200)
            expect(data).toEqual(mockPreferences)
            expect(getUserPreferences).toHaveBeenCalledWith(mockUserId)
        })

        it('should return 500 when getUserPreferences returns null (database error)', async () => {
            vi.mocked(getUserPreferences).mockResolvedValue(null)

            const context = createMockContext(mockLocals)
            const response = await GET(context)
            const data = await response.json()

            expect(response.status).toBe(500)
            expect(data.error).toBe('Failed to fetch preferences')
            expect(getUserPreferences).toHaveBeenCalledWith(mockUserId)
        })

        it('should return 500 on unexpected errors', async () => {
            vi.mocked(getUserPreferences).mockRejectedValue(
                new Error('Database connection failed')
            )

            const context = createMockContext(mockLocals)
            const response = await GET(context)
            const data = await response.json()

            expect(response.status).toBe(500)
            expect(data.error).toBe('Internal server error')
        })
    })

    describe('POST /api/settings', () => {
        const validRequestBody = JSON.stringify({
            email_notifications: false,
            push_notifications: true,
        })

        const createMockRequest = (body: string): Request =>
            ({
                json: async () => JSON.parse(body),
            }) as Request

        it('should return 401 if user is not authenticated', async () => {
            const context = createMockContext({ user: null })
            const response = await POST(context)
            const data = await response.json()

            expect(response.status).toBe(401)
            expect(data.error).toBe('Unauthorized')
        })

        it('should return 400 if no valid preferences to update', async () => {
            const invalidRequestBody = JSON.stringify({
                invalid_field: 'value',
            })
            const request = createMockRequest(invalidRequestBody)
            const context = createMockContext(mockLocals, request)

            const response = await POST(context)
            const data = await response.json()

            expect(response.status).toBe(400)
            expect(data.error).toBe('No valid preferences to update')
        })

        it('should return 500 when updateUserPreferences fails', async () => {
            vi.mocked(updateUserPreferences).mockResolvedValue(false)

            const request = createMockRequest(validRequestBody)
            const context = createMockContext(mockLocals, request)

            const response = await POST(context)
            const data = await response.json()

            expect(response.status).toBe(500)
            expect(data.error).toBe('Failed to update preferences')
            expect(updateUserPreferences).toHaveBeenCalledWith(mockUserId, {
                email_notifications: false,
                push_notifications: true,
            })
        })

        it('should return 500 when getUserPreferences returns null after update (database error)', async () => {
            vi.mocked(updateUserPreferences).mockResolvedValue(true)
            vi.mocked(getUserPreferences).mockResolvedValue(null)

            const request = createMockRequest(validRequestBody)
            const context = createMockContext(mockLocals, request)

            const response = await POST(context)
            const data = await response.json()

            expect(response.status).toBe(500)
            expect(data.error).toBe('Failed to retrieve updated preferences')
            expect(updateUserPreferences).toHaveBeenCalledWith(mockUserId, {
                email_notifications: false,
                push_notifications: true,
            })
            expect(getUserPreferences).toHaveBeenCalledWith(mockUserId)
        })

        it('should return 200 with updated preferences on success', async () => {
            const updatedPreferences = {
                email_notifications: false,
                push_notifications: true,
                challenge_reminders: true,
            }
            vi.mocked(updateUserPreferences).mockResolvedValue(true)
            vi.mocked(getUserPreferences).mockResolvedValue(updatedPreferences)

            const request = createMockRequest(validRequestBody)
            const context = createMockContext(mockLocals, request)

            const response = await POST(context)
            const data = await response.json()

            expect(response.status).toBe(200)
            expect(data.success).toBe(true)
            expect(data.preferences).toEqual(updatedPreferences)
            expect(updateUserPreferences).toHaveBeenCalledWith(mockUserId, {
                email_notifications: false,
                push_notifications: true,
            })
            expect(getUserPreferences).toHaveBeenCalledWith(mockUserId)
        })

        it('should handle partial updates correctly', async () => {
            const partialRequestBody = JSON.stringify({
                email_notifications: false,
            })
            const updatedPreferences = {
                email_notifications: false,
                push_notifications: false,
                challenge_reminders: true,
            }
            vi.mocked(updateUserPreferences).mockResolvedValue(true)
            vi.mocked(getUserPreferences).mockResolvedValue(updatedPreferences)

            const request = createMockRequest(partialRequestBody)
            const context = createMockContext(mockLocals, request)

            const response = await POST(context)
            const data = await response.json()

            expect(response.status).toBe(200)
            expect(data.success).toBe(true)
            expect(data.preferences).toEqual(updatedPreferences)
            expect(updateUserPreferences).toHaveBeenCalledWith(mockUserId, {
                email_notifications: false,
            })
        })

        it('should return 500 on unexpected errors', async () => {
            vi.mocked(getUserPreferences).mockRejectedValue(
                new Error('Database connection failed')
            )

            const request = createMockRequest(validRequestBody)
            const context = createMockContext(mockLocals, request)

            const response = await POST(context)
            const data = await response.json()

            expect(response.status).toBe(500)
            expect(data.error).toBe('Internal server error')
        })
    })
})
