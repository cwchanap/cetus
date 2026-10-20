import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/pages/api/challenges/xp'
import { auth } from '@/lib/auth'
import { getUserXPAndLevel } from '@/lib/server/db/queries'
import { getXPProgress, LEVEL_THRESHOLDS } from '@/lib/challenges'

vi.mock('@/lib/auth', () => ({
    auth: {
        api: {
            getSession: vi.fn(),
        },
    },
}))

vi.mock('@/lib/server/db/queries', () => ({
    getUserXPAndLevel: vi.fn(),
}))

vi.mock('@/lib/challenges', () => ({
    getXPProgress: vi.fn(),
    LEVEL_THRESHOLDS: [0, 100, 250, 500, 1000],
}))

describe('GET /api/challenges/xp', () => {
    const mockUser = { id: 'user-456', name: 'XP User' }
    const mockSession = { user: mockUser }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any)
        vi.mocked(getUserXPAndLevel).mockResolvedValue({
            xp: 300,
            level: 3,
            challengeStreak: 5,
            lastChallengeDate: '2024-01-03',
        })
        vi.mocked(getXPProgress).mockReturnValue({
            currentLevel: 3,
            progress: 20,
            currentLevelXP: 250,
            nextLevelXP: 500,
        })
    })

    it('should return 401 for unauthenticated requests', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValue(null)

        const request = new Request('http://localhost/api/challenges/xp')
        const response = await GET({ request } as any)

        expect(response.status).toBe(401)
    })

    it('should return XP data for authenticated user', async () => {
        const request = new Request('http://localhost/api/challenges/xp')
        const response = await GET({ request } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data).toMatchObject({
            xp: 300,
            level: 3,
            currentLevelXP: 250,
            nextLevelXP: 500,
            progress: 20,
            streak: 5,
            maxLevel: 5,
        })
    })

    it('should call getUserXPAndLevel with the user id', async () => {
        const request = new Request('http://localhost/api/challenges/xp')
        await GET({ request } as any)

        expect(getUserXPAndLevel).toHaveBeenCalledWith('user-456')
    })

    it('should call getXPProgress with the user xp', async () => {
        const request = new Request('http://localhost/api/challenges/xp')
        await GET({ request } as any)

        expect(getXPProgress).toHaveBeenCalledWith(300)
    })

    it('should return 500 on unexpected error', async () => {
        vi.mocked(getUserXPAndLevel).mockRejectedValue(
            new Error('Database unavailable')
        )

        const request = new Request('http://localhost/api/challenges/xp')
        const response = await GET({ request } as any)

        expect(response.status).toBe(500)
        const data = await response.json()
        expect(data).toHaveProperty('error', 'Failed to fetch XP info')
    })
})
