import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/pages/api/dev/add-test-scores'

// Mock database client
vi.mock('@/lib/server/db/client', () => ({
    db: {
        insertInto: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
    },
}))

import { db } from '@/lib/server/db/client'

describe('POST /api/dev/add-test-scores', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return 403 in production mode', async () => {
        vi.stubEnv('PROD', true)

        const request = new Request(
            'http://localhost:4321/api/dev/add-test-scores',
            { method: 'POST' }
        )

        const response = await POST({ request } as Parameters<typeof POST>[0])
        expect(response.status).toBe(403)

        vi.unstubAllEnvs()
    })

    it('should add test scores and return success', async () => {
        vi.stubEnv('PROD', false)

        const mockExecute = vi.fn().mockResolvedValue(undefined)
        const mockValues = vi.fn().mockReturnValue({ execute: mockExecute })
        const mockInsertInto = vi.fn().mockReturnValue({ values: mockValues })
        vi.mocked(db.insertInto).mockImplementation(mockInsertInto)

        const request = new Request(
            'http://localhost:4321/api/dev/add-test-scores',
            { method: 'POST' }
        )

        const response = await POST({ request } as Parameters<typeof POST>[0])
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(data.message).toContain('test scores')

        vi.unstubAllEnvs()
    })

    it('should continue if user already exists (duplicate user insert)', async () => {
        vi.stubEnv('PROD', false)

        const mockExecuteScores = vi.fn().mockResolvedValue(undefined)
        const mockValuesScores = vi
            .fn()
            .mockReturnValue({ execute: mockExecuteScores })

        // First call (user insert) throws, subsequent calls (score inserts) succeed
        const mockExecuteUser = vi
            .fn()
            .mockRejectedValueOnce(new Error('UNIQUE constraint failed'))
        const mockValuesUser = vi
            .fn()
            .mockReturnValue({ execute: mockExecuteUser })

        let callCount = 0
        vi.mocked(db.insertInto).mockImplementation(() => {
            callCount++
            if (callCount === 1) {
                return { values: mockValuesUser } as ReturnType<
                    typeof db.insertInto
                >
            }
            return { values: mockValuesScores } as ReturnType<
                typeof db.insertInto
            >
        })

        const request = new Request(
            'http://localhost:4321/api/dev/add-test-scores',
            { method: 'POST' }
        )

        const response = await POST({ request } as Parameters<typeof POST>[0])
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        vi.unstubAllEnvs()
    })

    it('should still return success when all score inserts fail', async () => {
        vi.stubEnv('PROD', false)

        const mockExecute = vi
            .fn()
            .mockRejectedValue(new Error('Score insert failed'))
        const mockValues = vi.fn().mockReturnValue({ execute: mockExecute })
        const mockInsertInto = vi.fn().mockReturnValue({ values: mockValues })
        vi.mocked(db.insertInto).mockImplementation(mockInsertInto)

        const request = new Request(
            'http://localhost:4321/api/dev/add-test-scores',
            { method: 'POST' }
        )

        const response = await POST({ request } as Parameters<typeof POST>[0])
        const data = await response.json()

        // Score failures are silently swallowed; added count is 0
        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(data.message).toContain('0 test scores')

        vi.unstubAllEnvs()
    })
})
