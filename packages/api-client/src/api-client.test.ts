import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameID } from '@cetus/shared/games'
import type {
    ChallengesResponse,
    GameLeaderboardResponse,
    LeaderboardResponse,
    LoginRewardClaimResponse,
    LoginRewardStatusResponse,
    ScoreHistoryResponse,
} from '@cetus/shared/api-dto'
import { ApiClientError, createApiClient } from './api-client'

function okResponse(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
    } as unknown as Response
}

function errorResponse(status: number, body?: unknown): Response {
    return {
        ok: false,
        status,
        json: () =>
            body === undefined
                ? Promise.reject(new Error('not json'))
                : Promise.resolve(body),
    } as unknown as Response
}

function invalidJsonResponse(status = 200): Response {
    return {
        ok: true,
        status,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as unknown as Response
}

describe('createApiClient', () => {
    let fetchImpl: ReturnType<typeof vi.fn>

    beforeEach(() => {
        fetchImpl = vi.fn()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function makeClient(
        options?: Partial<Parameters<typeof createApiClient>[0]>
    ) {
        return createApiClient({
            fetchImpl: fetchImpl as typeof fetch,
            ...options,
        })
    }

    // --- POST /api/scores -----------------------------------------------------

    describe('submitScore', () => {
        it('POSTs the exact score JSON with platform and context and reads the typed result', async () => {
            const responseBody = {
                success: true,
                newAchievements: [
                    {
                        id: 'first_score',
                        name: 'First Score',
                        description: 'Earned your first score',
                        icon: 'trophy',
                    },
                ],
                challengeUpdates: {
                    completedChallenges: [
                        {
                            id: 'play_2_games',
                            name: 'Warm Up',
                            description: 'Play 2 games today',
                            icon: '🎮',
                            xpReward: 30,
                        },
                    ],
                    xpEarned: 30,
                    levelUp: true,
                    newLevel: 2,
                },
            }
            fetchImpl.mockResolvedValue(okResponse(responseBody))

            const result = await makeClient().submitScore({
                gameId: GameID.ICE_SLIDE,
                score: 1234,
                context: {
                    mode: 'daily',
                    competitionKey: 'ice-slide:daily:2026-08-01:g1:r1',
                    rulesetVersion: 1,
                },
                platform: 'web',
            })

            expect(fetchImpl).toHaveBeenCalledWith('/api/scores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: GameID.ICE_SLIDE,
                    score: 1234,
                    context: {
                        mode: 'daily',
                        competitionKey: 'ice-slide:daily:2026-08-01:g1:r1',
                        rulesetVersion: 1,
                    },
                    platform: 'web',
                }),
            })
            expect(result.success).toBe(true)
            expect(result.newAchievements).toHaveLength(1)
            expect(result.challengeUpdates?.xpEarned).toBe(30)
            expect(result.challengeUpdates?.newLevel).toBe(2)
        })

        it('defaults newAchievements to an empty array when absent', async () => {
            fetchImpl.mockResolvedValue(okResponse({ success: true }))

            const result = await makeClient().submitScore({
                gameId: GameID.TETRIS,
                score: 100,
            })

            expect(result.success).toBe(true)
            expect(result.newAchievements).toEqual([])
        })

        it('maps 401 to UNAUTHENTICATED even without a JSON body', async () => {
            fetchImpl.mockResolvedValue(errorResponse(401))

            const result = await makeClient().submitScore({
                gameId: GameID.TETRIS,
                score: 100,
            })

            expect(result).toEqual({
                success: false,
                error: 'You must be logged in to save scores',
                code: 'UNAUTHENTICATED',
            })
        })

        it('maps 400 to Invalid score data', async () => {
            fetchImpl.mockResolvedValue(
                errorResponse(400, { error: 'Invalid game ID' })
            )

            const result = await makeClient().submitScore({
                gameId: GameID.TETRIS,
                score: 100,
            })

            expect(result).toEqual({
                success: false,
                error: 'Invalid score data',
                code: undefined,
            })
        })

        it('surfaces SCORE_CONTEXT_UNAVAILABLE from a 503 coded body', async () => {
            fetchImpl.mockResolvedValue(
                errorResponse(503, {
                    error: 'Score context is unavailable',
                    code: 'SCORE_CONTEXT_UNAVAILABLE',
                })
            )

            const result = await makeClient().submitScore({
                gameId: GameID.TETRIS,
                score: 100,
            })

            expect(result).toEqual({
                success: false,
                error: 'Failed to save score',
                code: 'SCORE_CONTEXT_UNAVAILABLE',
            })
        })

        it('ignores unrelated coded bodies on non-2xx responses', async () => {
            fetchImpl.mockResolvedValue(
                errorResponse(500, { error: 'boom', code: 'SOMETHING_ELSE' })
            )

            const result = await makeClient().submitScore({
                gameId: GameID.TETRIS,
                score: 100,
            })

            expect(result.code).toBeUndefined()
            expect(result.error).toBe('Failed to save score')
        })

        it('reports NETWORK_ERROR when fetch rejects', async () => {
            fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'))

            const result = await makeClient().submitScore({
                gameId: GameID.TETRIS,
                score: 100,
            })

            expect(result).toEqual({
                success: false,
                error: 'Network error occurred',
                code: 'NETWORK_ERROR',
            })
        })

        it('reports NETWORK_ERROR when the success body is not valid JSON', async () => {
            fetchImpl.mockResolvedValue(invalidJsonResponse())

            const result = await makeClient().submitScore({
                gameId: GameID.TETRIS,
                score: 100,
            })

            expect(result).toEqual({
                success: false,
                error: 'Network error occurred',
                code: 'NETWORK_ERROR',
            })
        })
    })

    // --- GET /api/scores/best · /history --------------------------------------

    describe('getBestScore', () => {
        it('requests the encoded gameId and returns the typed DTO', async () => {
            fetchImpl.mockResolvedValue(okResponse({ bestScore: 4200 }))

            const result = await makeClient().getBestScore(GameID.GAME_2048)

            expect(fetchImpl).toHaveBeenCalledWith(
                `/api/scores/best?gameId=${encodeURIComponent(GameID.GAME_2048)}`,
                {
                    method: 'GET',
                    headers: {},
                    body: undefined,
                    signal: undefined,
                }
            )
            expect(result.bestScore).toBe(4200)
        })

        it('returns bestScore null for a user with no scores', async () => {
            fetchImpl.mockResolvedValue(okResponse({ bestScore: null }))

            const result = await makeClient().getBestScore(GameID.TETRIS)

            expect(result.bestScore).toBeNull()
        })
    })

    describe('getScoreHistory', () => {
        it('defaults the limit to 10 and returns typed history entries', async () => {
            fetchImpl.mockResolvedValue(
                okResponse({
                    history: [
                        {
                            game_id: 'tetris',
                            game_name: 'Tetris Challenge',
                            score: 9500,
                            created_at: '2026-10-21T12:00:00.000Z',
                        },
                    ],
                })
            )

            const result: ScoreHistoryResponse =
                await makeClient().getScoreHistory()

            expect(fetchImpl).toHaveBeenCalledWith(
                '/api/scores/history?limit=10',
                {
                    method: 'GET',
                    headers: {},
                    body: undefined,
                    signal: undefined,
                }
            )
            expect(result.history[0]?.score).toBe(9500)
        })

        it('passes a custom limit', async () => {
            fetchImpl.mockResolvedValue(okResponse({ history: [] }))

            await makeClient().getScoreHistory(25)

            expect(fetchImpl).toHaveBeenCalledWith(
                '/api/scores/history?limit=25',
                expect.anything()
            )
        })
    })

    // --- GET /api/leaderboard -------------------------------------------------

    describe('getLeaderboard', () => {
        it('requests the all-games branch without query params', async () => {
            fetchImpl.mockResolvedValue(
                okResponse({ leaderboards: { tetris: [] } })
            )

            const result: LeaderboardResponse =
                await makeClient().getLeaderboard()

            expect(fetchImpl).toHaveBeenCalledWith('/api/leaderboard', {
                method: 'GET',
                headers: {},
                body: undefined,
                signal: undefined,
            })
            expect(
                'leaderboards' in result && result.leaderboards.tetris
            ).toEqual([])
        })

        it('sends gameId and limit query params', async () => {
            fetchImpl.mockResolvedValue(
                okResponse({
                    gameId: '2048',
                    gameName: '2048',
                    leaderboard: [
                        {
                            rank: 1,
                            name: 'Pilot',
                            username: 'pilot',
                            score: 20480,
                            created_at: '2026-10-21T12:00:00.000Z',
                            image: null,
                        },
                    ],
                })
            )

            const result = await makeClient().getLeaderboard({
                gameId: GameID.GAME_2048,
                limit: 5,
            })

            expect(fetchImpl).toHaveBeenCalledWith(
                '/api/leaderboard?gameId=2048&limit=5',
                expect.anything()
            )
            const game = result as GameLeaderboardResponse
            expect(game.gameId).toBe('2048')
            expect(game.leaderboard[0]?.score).toBe(20480)
        })

        it('URL-encodes scoped mode and competitionKey params', async () => {
            fetchImpl.mockResolvedValue(okResponse({ leaderboard: [] }))

            await makeClient().getLeaderboard({
                gameId: GameID.ICE_SLIDE,
                limit: 10,
                mode: 'daily',
                competitionKey: 'ice-slide:daily:2026-08-01:g1:r1',
            })

            const [requestedUrl] = fetchImpl.mock.calls[0] as [
                string,
                ...unknown[],
            ]
            const params = new URL(requestedUrl, 'https://client.test')
                .searchParams
            expect(params.get('gameId')).toBe('ice_slide')
            expect(params.get('mode')).toBe('daily')
            expect(params.get('competitionKey')).toBe(
                'ice-slide:daily:2026-08-01:g1:r1'
            )
            expect(params.get('limit')).toBe('10')
        })

        it('propagates the abort signal', async () => {
            fetchImpl.mockResolvedValue(okResponse({ leaderboard: [] }))
            const controller = new AbortController()

            await makeClient().getLeaderboard(
                { gameId: GameID.TETRIS, limit: 5 },
                { signal: controller.signal }
            )

            const init = fetchImpl.mock.calls[0][1] as RequestInit
            expect(init.signal).toBe(controller.signal)
        })
    })

    // --- GET /api/challenges · /api/challenges/xp ------------------------------

    describe('getChallenges', () => {
        it('reads the typed challenges DTO and forwards the signal', async () => {
            const body = {
                challenges: [
                    {
                        challengeId: 'play_2_games',
                        name: 'Warm Up',
                        description: 'Play 2 games today',
                        icon: '🎮',
                        type: 'games_played',
                        gameId: undefined,
                        targetValue: 2,
                        currentValue: 1,
                        xpReward: 30,
                        difficulty: 'easy',
                        completed: false,
                        completedAt: null,
                    },
                ],
                xp: 130,
                level: 2,
                xpProgress: 30,
                xpToNextLevel: 120,
                streak: 3,
                resetIn: 3600,
                date: '2026-10-21',
            }
            fetchImpl.mockResolvedValue(okResponse(body))
            const controller = new AbortController()

            const result: ChallengesResponse = await makeClient().getChallenges(
                {
                    signal: controller.signal,
                }
            )

            expect(fetchImpl).toHaveBeenCalledWith('/api/challenges', {
                method: 'GET',
                headers: {},
                body: undefined,
                signal: controller.signal,
            })
            expect(result.challenges[0]?.challengeId).toBe('play_2_games')
            expect(result.challenges[0]?.completedAt).toBeNull()
            expect(result.level).toBe(2)
        })

        it('throws a coded ApiClientError on a coded 503', async () => {
            fetchImpl.mockResolvedValue(
                errorResponse(503, {
                    error: 'Score context is unavailable',
                    code: 'SCORE_CONTEXT_UNAVAILABLE',
                })
            )

            const error = await makeClient()
                .getChallenges()
                .catch((e: unknown) => e)

            expect(error).toBeInstanceOf(ApiClientError)
            const apiError = error as ApiClientError
            expect(apiError.status).toBe(503)
            expect(apiError.kind).toBe('http')
            expect(apiError.code).toBe('SCORE_CONTEXT_UNAVAILABLE')
            expect(apiError.message).toBe('Score context is unavailable')
        })
    })

    describe('getChallengeXp', () => {
        it('reads the typed XP DTO', async () => {
            fetchImpl.mockResolvedValue(
                okResponse({
                    xp: 250,
                    level: 3,
                    currentLevelXP: 100,
                    nextLevelXP: 250,
                    progress: 40,
                    streak: 5,
                    maxLevel: 12,
                })
            )

            const result = await makeClient().getChallengeXp()

            expect(fetchImpl).toHaveBeenCalledWith('/api/challenges/xp', {
                method: 'GET',
                headers: {},
                body: undefined,
                signal: undefined,
            })
            expect(result.progress).toBe(40)
            expect(result.maxLevel).toBe(12)
        })
    })

    // --- GET /api/login-rewards · POST /api/login-rewards/claim ----------------

    describe('getLoginRewardStatus', () => {
        it('reads the typed login reward status DTO', async () => {
            const body = {
                loginStreak: 3,
                currentCycleDay: 4,
                totalCycles: 2,
                totalConsecutiveDays: 18,
                todayReward: {
                    day: 4,
                    xp: 40,
                    icon: 'star',
                    label: 'Day 4',
                },
                alreadyClaimed: false,
                canClaim: true,
                nextMilestone: null,
                daysUntilMilestone: 3,
            }
            fetchImpl.mockResolvedValue(okResponse(body))

            const result: LoginRewardStatusResponse =
                await makeClient().getLoginRewardStatus()

            expect(fetchImpl).toHaveBeenCalledWith('/api/login-rewards', {
                method: 'GET',
                headers: {},
                body: undefined,
                signal: undefined,
            })
            expect(result.canClaim).toBe(true)
            expect(result.todayReward.xp).toBe(40)
        })
    })

    describe('claimLoginReward', () => {
        it('POSTs with JSON content type and reads the typed claim result', async () => {
            const body = {
                success: true,
                xpEarned: 40,
                newTotalXP: 290,
                newLevel: 3,
                leveledUp: false,
            }
            fetchImpl.mockResolvedValue(okResponse(body))

            const result: LoginRewardClaimResponse =
                await makeClient().claimLoginReward()

            expect(fetchImpl).toHaveBeenCalledWith('/api/login-rewards/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: undefined,
                signal: undefined,
            })
            expect(result.success).toBe(true)
            expect(result.xpEarned).toBe(40)
        })

        it('surfaces the server error message on a 400 claim failure', async () => {
            fetchImpl.mockResolvedValue(
                errorResponse(400, {
                    success: false,
                    error: 'Reward already claimed today',
                })
            )

            const error = await makeClient()
                .claimLoginReward()
                .catch((e: unknown) => e)

            expect(error).toBeInstanceOf(ApiClientError)
            expect((error as ApiClientError).message).toBe(
                'Reward already claimed today'
            )
        })
    })

    // --- GET+POST /api/settings ------------------------------------------------

    describe('settings', () => {
        it('GETs notification preferences as a typed DTO', async () => {
            fetchImpl.mockResolvedValue(
                okResponse({
                    email_notifications: true,
                    push_notifications: false,
                    challenge_reminders: true,
                })
            )

            const result = await makeClient().getSettings()

            expect(fetchImpl).toHaveBeenCalledWith('/api/settings', {
                method: 'GET',
                headers: {},
                body: undefined,
                signal: undefined,
            })
            expect(result.email_notifications).toBe(true)
        })

        it('POSTs the partial preference update and reads the typed response', async () => {
            fetchImpl.mockResolvedValue(
                okResponse({
                    success: true,
                    preferences: {
                        email_notifications: false,
                        push_notifications: false,
                        challenge_reminders: false,
                    },
                })
            )

            const result = await makeClient().updateSettings({
                push_notifications: true,
            })

            expect(fetchImpl).toHaveBeenCalledWith('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ push_notifications: true }),
                signal: undefined,
            })
            expect(result.success).toBe(true)
            expect(result.preferences.challenge_reminders).toBe(false)
        })
    })

    // --- POST /api/user/profile ------------------------------------------------

    describe('updateProfile', () => {
        it('POSTs the profile update and reads the typed response', async () => {
            fetchImpl.mockResolvedValue(
                okResponse({
                    success: true,
                    message: 'Profile updated successfully',
                })
            )

            const result = await makeClient().updateProfile({
                displayName: 'Nova Pilot',
            })

            expect(fetchImpl).toHaveBeenCalledWith('/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: 'Nova Pilot' }),
                signal: undefined,
            })
            expect(result.success).toBe(true)
            expect(result.message).toBe('Profile updated successfully')
        })

        it('surfaces the server message on a 409 conflict', async () => {
            fetchImpl.mockResolvedValue(
                errorResponse(409, { error: 'Username is already taken' })
            )

            const error = await makeClient()
                .updateProfile({ username: 'nova' })
                .catch((e: unknown) => e)

            expect(error).toBeInstanceOf(ApiClientError)
            expect((error as ApiClientError).status).toBe(409)
            expect((error as ApiClientError).message).toBe(
                'Username is already taken'
            )
        })
    })

    // --- POST+DELETE /api/user/avatar ------------------------------------------

    describe('uploadAvatar', () => {
        it('POSTs multipart FormData without a manual Content-Type', async () => {
            fetchImpl.mockResolvedValue(
                okResponse({
                    success: true,
                    message: 'Avatar updated',
                    avatar: '/uploads/avatar.png',
                })
            )
            const formData = new FormData()
            formData.append('avatar', new Blob(['png-bytes']), 'avatar.png')

            const result = await makeClient().uploadAvatar(formData)

            const [requestedUrl, init] = fetchImpl.mock.calls[0] as [
                string,
                RequestInit,
            ]
            expect(requestedUrl).toBe('/api/user/avatar')
            expect(init.method).toBe('POST')
            expect(init.body).toBe(formData)
            const headerRecord = init.headers as Record<string, string>
            expect(headerRecord['Content-Type']).toBeUndefined()
            expect(headerRecord['content-type']).toBeUndefined()
            expect(result.avatar).toBe('/uploads/avatar.png')
        })

        it('throws an ApiClientError on a 400 upload rejection', async () => {
            fetchImpl.mockResolvedValue(
                errorResponse(400, { error: 'File size must be less than 5MB' })
            )
            const formData = new FormData()
            formData.append('avatar', new Blob(['png-bytes']), 'avatar.png')

            const error = await makeClient()
                .uploadAvatar(formData)
                .catch((e: unknown) => e)

            expect(error).toBeInstanceOf(ApiClientError)
            expect((error as ApiClientError).status).toBe(400)
        })
    })

    describe('deleteAvatar', () => {
        it('DELETEs and reads the typed response', async () => {
            fetchImpl.mockResolvedValue(
                okResponse({
                    success: true,
                    message: 'Avatar removed successfully',
                })
            )

            const result = await makeClient().deleteAvatar()

            expect(fetchImpl).toHaveBeenCalledWith('/api/user/avatar', {
                method: 'DELETE',
                headers: {},
                body: undefined,
                signal: undefined,
            })
            expect(result.success).toBe(true)
        })
    })

    // --- POST /api/user/update-streaks -----------------------------------------

    describe('updateStreaks', () => {
        it('POSTs and reads the typed response', async () => {
            fetchImpl.mockResolvedValue(
                okResponse({
                    success: true,
                    processed: 12,
                    incremented: 9,
                    reset: 3,
                })
            )

            const result = await makeClient().updateStreaks()

            expect(fetchImpl).toHaveBeenCalledWith('/api/user/update-streaks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: undefined,
                signal: undefined,
            })
            expect(result).toEqual({
                success: true,
                processed: 12,
                incremented: 9,
                reset: 3,
            })
        })
    })

    // --- error mapping shared by the request helper -----------------------------

    describe('request error mapping', () => {
        it('uses a status-based message when the error body is not JSON', async () => {
            fetchImpl.mockResolvedValue(errorResponse(500))

            const error = await makeClient()
                .getSettings()
                .catch((e: unknown) => e)

            expect(error).toBeInstanceOf(ApiClientError)
            expect((error as ApiClientError).message).toBe(
                'Request failed with status 500'
            )
        })

        it('maps malformed success JSON to a parse error', async () => {
            fetchImpl.mockResolvedValue(invalidJsonResponse())

            const error = await makeClient()
                .getSettings()
                .catch((e: unknown) => e)

            expect(error).toBeInstanceOf(ApiClientError)
            const apiError = error as ApiClientError
            expect(apiError.kind).toBe('parse')
            expect(apiError.status).toBe(200)
        })

        it('maps fetch rejections to a network error with status 0', async () => {
            fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'))

            const error = await makeClient()
                .getChallengeXp()
                .catch((e: unknown) => e)

            expect(error).toBeInstanceOf(ApiClientError)
            const apiError = error as ApiClientError
            expect(apiError.kind).toBe('network')
            expect(apiError.status).toBe(0)
            expect(apiError.code).toBeUndefined()
        })
    })

    // --- injection seams ---------------------------------------------------------

    describe('injection', () => {
        it('prefixes baseUrl and strips trailing slashes', async () => {
            fetchImpl.mockResolvedValue(okResponse({ bestScore: 1 }))
            const client = createApiClient({
                baseUrl: 'https://api.cetus.example/',
                fetchImpl: fetchImpl as typeof fetch,
            })

            await client.getBestScore(GameID.TETRIS)

            expect(fetchImpl).toHaveBeenCalledWith(
                'https://api.cetus.example/api/scores/best?gameId=tetris',
                expect.anything()
            )
        })

        it('merges getHeaders under per-request headers', async () => {
            fetchImpl.mockResolvedValue(okResponse({ success: true }))
            const client = createApiClient({
                fetchImpl: fetchImpl as typeof fetch,
                getHeaders: () => ({ Cookie: 'session=abc', 'X-App': 'cetus' }),
            })

            await client.updateProfile({ name: 'Nova' })

            expect(fetchImpl).toHaveBeenCalledWith('/api/user/profile', {
                method: 'POST',
                headers: {
                    Cookie: 'session=abc',
                    'X-App': 'cetus',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: 'Nova' }),
                signal: undefined,
            })
        })

        it('awaits async getHeaders and lets per-request headers win', async () => {
            fetchImpl.mockResolvedValue(okResponse({ success: true }))
            const client = createApiClient({
                fetchImpl: fetchImpl as typeof fetch,
                getHeaders: async () => ({
                    'Content-Type': 'text/plain',
                    Authorization: 'Bearer tok',
                }),
            })

            await client.claimLoginReward()

            const init = fetchImpl.mock.calls[0][1] as RequestInit
            expect(init.headers).toEqual({
                'Content-Type': 'application/json',
                Authorization: 'Bearer tok',
            })
        })

        it('uses the ambient global fetch when fetchImpl is omitted', async () => {
            const globalFetch = vi
                .fn()
                .mockResolvedValue(okResponse({ bestScore: 7 }))
            const original = globalThis.fetch
            globalThis.fetch = globalFetch as typeof fetch

            try {
                const client = createApiClient()
                const result = await client.getBestScore(GameID.TETRIS)
                expect(globalFetch).toHaveBeenCalled()
                expect(result.bestScore).toBe(7)
            } finally {
                globalThis.fetch = original
            }
        })
    })
})
