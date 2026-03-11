import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/pages/api/login-rewards/claim'
import { claimDailyLoginReward } from '@/lib/services/loginRewardService'

vi.mock('@/lib/services/loginRewardService', () => ({
    claimDailyLoginReward: vi.fn(),
}))

describe('POST /api/login-rewards/claim', () => {
    const mockUser = { id: 'user-123', name: 'Test User' }

    const mockSuccessResult = {
        success: true,
        xpEarned: 20,
        newTotalXP: 120,
        newLevel: 2,
        leveledUp: true,
        previousLevel: 1,
        milestoneBadge: undefined,
        updatedStatus: {
            loginStreak: 2,
            currentCycleDay: 2,
            totalCycles: 0,
            totalConsecutiveDays: 2,
            todayReward: { day: 2, xp: 20 },
            alreadyClaimed: true,
            canClaim: false,
            nextMilestone: null,
            daysUntilMilestone: null,
        },
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(claimDailyLoginReward).mockResolvedValue(
            mockSuccessResult as any
        )
    })

    it('should return 401 for unauthenticated requests', async () => {
        const locals = { user: null }
        const response = await POST({ locals } as any)

        expect(response.status).toBe(401)
    })

    it('should return claim result for authenticated user', async () => {
        const locals = { user: mockUser }
        const response = await POST({ locals } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data).toMatchObject({
            success: true,
            xpEarned: 20,
            newTotalXP: 120,
            leveledUp: true,
        })
    })

    it('should call claimDailyLoginReward with the user id', async () => {
        const locals = { user: mockUser }
        await POST({ locals } as any)

        expect(claimDailyLoginReward).toHaveBeenCalledWith('user-123')
    })

    it('should return 400 when reward already claimed today', async () => {
        vi.mocked(claimDailyLoginReward).mockResolvedValue({
            success: false,
            error: 'Reward already claimed today',
        })

        const locals = { user: mockUser }
        const response = await POST({ locals } as any)

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data).toMatchObject({
            success: false,
            error: 'Reward already claimed today',
        })
    })

    it('should return 400 with default error when result.error is not set', async () => {
        vi.mocked(claimDailyLoginReward).mockResolvedValue({
            success: false,
        })

        const locals = { user: mockUser }
        const response = await POST({ locals } as any)

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data).toMatchObject({
            success: false,
            error: 'Failed to claim reward',
        })
    })

    it('should return 500 on unexpected error', async () => {
        vi.mocked(claimDailyLoginReward).mockRejectedValue(
            new Error('Unexpected failure')
        )

        const locals = { user: mockUser }
        const response = await POST({ locals } as any)

        expect(response.status).toBe(500)
    })
})
