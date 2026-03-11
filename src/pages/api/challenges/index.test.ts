import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/pages/api/challenges/index'
import { auth } from '@/lib/auth'
import { getUserDailyChallenges } from '@/lib/services/challengeService'
import { getUserXPAndLevel } from '@/lib/server/db/queries'
import {
    getSecondsUntilMidnightUTC,
    getTodayUTC,
    getXPProgress,
} from '@/lib/challenges'

vi.mock('@/lib/auth', () => ({
    auth: {
        api: {
            getSession: vi.fn(),
        },
    },
}))

vi.mock('@/lib/services/challengeService', () => ({
    getUserDailyChallenges: vi.fn(),
}))

vi.mock('@/lib/server/db/queries', () => ({
    getUserXPAndLevel: vi.fn(),
}))

vi.mock('@/lib/challenges', () => ({
    getSecondsUntilMidnightUTC: vi.fn(),
    getTodayUTC: vi.fn(),
    getXPProgress: vi.fn(),
}))

describe('GET /api/challenges', () => {
    const mockUser = { id: 'user-123', name: 'Test User' }
    const mockSession = { user: mockUser }

    const mockChallenges = [
        {
            id: 'c1',
            title: 'Play 3 games',
            completed: false,
            progress: 1,
            target: 3,
        },
    ]

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any)
        vi.mocked(getUserDailyChallenges).mockResolvedValue(
            mockChallenges as any
        )
        vi.mocked(getUserXPAndLevel).mockResolvedValue({
            xp: 150,
            level: 2,
            challengeStreak: 3,
            lastChallengeDate: '2024-01-03',
        })
        vi.mocked(getXPProgress).mockReturnValue({
            progress: 50,
            currentLevelXP: 100,
            nextLevelXP: 200,
        } as any)
        vi.mocked(getSecondsUntilMidnightUTC).mockReturnValue(3600)
        vi.mocked(getTodayUTC).mockReturnValue('2024-01-03')
    })

    it('should return 401 for unauthenticated requests', async () => {
        vi.mocked(auth.api.getSession).mockResolvedValue(null)

        const request = new Request('http://localhost/api/challenges')
        const response = await GET({ request } as any)

        expect(response.status).toBe(401)
    })

    it('should return challenges data for authenticated user', async () => {
        const request = new Request('http://localhost/api/challenges')
        const response = await GET({ request } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data).toMatchObject({
            challenges: mockChallenges,
            xp: 150,
            level: 2,
            xpProgress: 50,
            xpToNextLevel: 50,
            streak: 3,
            resetIn: 3600,
            date: '2024-01-03',
        })
    })

    it('should calculate xpToNextLevel correctly', async () => {
        vi.mocked(getUserXPAndLevel).mockResolvedValue({
            xp: 180,
            level: 2,
            challengeStreak: 0,
            lastChallengeDate: null,
        })
        vi.mocked(getXPProgress).mockReturnValue({
            progress: 80,
            currentLevelXP: 100,
            nextLevelXP: 200,
        } as any)

        const request = new Request('http://localhost/api/challenges')
        const response = await GET({ request } as any)
        const data = await response.json()

        expect(data.xpToNextLevel).toBe(20) // 200 - 180
    })

    it('should clamp xpToNextLevel to 0 when xp exceeds nextLevelXP', async () => {
        vi.mocked(getUserXPAndLevel).mockResolvedValue({
            xp: 250,
            level: 3,
            challengeStreak: 0,
            lastChallengeDate: null,
        })
        vi.mocked(getXPProgress).mockReturnValue({
            progress: 100,
            currentLevelXP: 200,
            nextLevelXP: 200,
        } as any)

        const request = new Request('http://localhost/api/challenges')
        const response = await GET({ request } as any)
        const data = await response.json()

        expect(data.xpToNextLevel).toBe(0)
    })

    it('should return 500 on unexpected error', async () => {
        vi.mocked(getUserDailyChallenges).mockRejectedValue(
            new Error('Database failure')
        )

        const request = new Request('http://localhost/api/challenges')
        const response = await GET({ request } as any)

        expect(response.status).toBe(500)
        const data = await response.json()
        expect(data).toHaveProperty('error', 'Failed to fetch challenges')
    })

    it('should call getUserDailyChallenges with the user id', async () => {
        const request = new Request('http://localhost/api/challenges')
        await GET({ request } as any)

        expect(getUserDailyChallenges).toHaveBeenCalledWith('user-123')
    })

    it('should call getUserXPAndLevel with the user id', async () => {
        const request = new Request('http://localhost/api/challenges')
        await GET({ request } as any)

        expect(getUserXPAndLevel).toHaveBeenCalledWith('user-123')
    })
})
