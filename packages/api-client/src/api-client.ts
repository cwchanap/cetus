/**
 * Typed HTTP client for the Cetus application API.
 *
 * One factory, one private request helper, shared TypeScript DTOs. There are
 * intentionally no Zod response parsers, retries, caches or middleware —
 * successful bodies are read as the canonical wire DTOs from
 * `@cetus/shared/api-dto`, and failures surface as {@link ApiClientError}.
 * The default (no `baseUrl`) client issues relative URLs for the web host; a
 * native host supplies an absolute base URL and a `getHeaders` session
 * provider.
 */

import type { GameID } from '@cetus/shared/games'
import type { ProfileUpdateInput } from '@cetus/shared/validations'
import type {
    AvatarUpdateResponse,
    BestScoreResponse,
    ChallengeXpResponse,
    ChallengesResponse,
    LeaderboardResponse,
    LoginRewardClaimResponse,
    LoginRewardStatusResponse,
    NotificationSettingsResponse,
    ScoreHistoryResponse,
    ScoreSubmitResponse,
    SettingsUpdateResponse,
    SuccessMessageResponse,
    UpdateStreaksResponse,
} from '@cetus/shared/api-dto'
import type { ScoreData, ScoreSubmissionResult } from '@cetus/shared/scores'

/** How an {@link ApiClientError} originated. */
export type ApiClientErrorKind =
    /** Non-2xx HTTP response. */
    | 'http'
    /** fetch itself rejected (offline, aborted, DNS…). */
    | 'network'
    /** 2xx response whose body was not valid JSON. */
    | 'parse'

/** Error thrown by every non-score client operation on failure. */
export class ApiClientError extends Error {
    /** HTTP status; 0 for network failures. */
    readonly status: number
    readonly kind: ApiClientErrorKind
    /** Machine-readable `code` from a coded error body, when present. */
    readonly code: string | undefined

    constructor(
        message: string,
        status: number,
        kind: ApiClientErrorKind,
        code?: string
    ) {
        super(message)
        this.name = 'ApiClientError'
        this.status = status
        this.kind = kind
        this.code = code
    }
}

export interface ApiClientOptions {
    /** Absolute base URL; omit for web-relative requests. */
    baseUrl?: string
    /** Fetch implementation; defaults to the ambient global `fetch`. */
    fetchImpl?: typeof fetch
    /** Headers merged under every request's own headers (session cookie etc.). */
    getHeaders?: () => Record<string, string> | Promise<Record<string, string>>
}

export interface LeaderboardQuery {
    gameId?: GameID
    limit?: number
    mode?: string
    competitionKey?: string
}

export interface ApiRequestOptions {
    /** Propagated to fetch for stale-run/abort suppression. */
    signal?: AbortSignal
}

export interface ApiClient {
    submitScore(data: ScoreData): Promise<ScoreSubmissionResult>
    getBestScore(gameId: GameID): Promise<BestScoreResponse>
    getScoreHistory(limit?: number): Promise<ScoreHistoryResponse>
    getLeaderboard(
        query?: LeaderboardQuery,
        options?: ApiRequestOptions
    ): Promise<LeaderboardResponse>
    getChallenges(options?: ApiRequestOptions): Promise<ChallengesResponse>
    getChallengeXp(): Promise<ChallengeXpResponse>
    getLoginRewardStatus(): Promise<LoginRewardStatusResponse>
    claimLoginReward(): Promise<LoginRewardClaimResponse>
    getSettings(): Promise<NotificationSettingsResponse>
    updateSettings(
        preferences: Partial<NotificationSettingsResponse>
    ): Promise<SettingsUpdateResponse>
    updateProfile(profile: ProfileUpdateInput): Promise<SuccessMessageResponse>
    uploadAvatar(avatar: FormData): Promise<AvatarUpdateResponse>
    deleteAvatar(): Promise<SuccessMessageResponse>
    updateStreaks(): Promise<UpdateStreaksResponse>
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
    const baseUrl = options.baseUrl?.replace(/\/+$/, '') ?? ''
    const fetchImpl = options.fetchImpl ?? fetch
    const getHeaders = options.getHeaders

    function url(path: string): string {
        return `${baseUrl}${path}`
    }

    async function headers(
        extra?: Record<string, string>
    ): Promise<Record<string, string>> {
        const base = getHeaders ? await getHeaders() : {}
        return extra ? { ...base, ...extra } : base
    }

    // Guarded unknown-body property check (same pattern as the coded
    // envelope handling in scoreService): a non-JSON or unexpectedly-shaped
    // error body must not throw here.
    async function readErrorBody(
        response: Response
    ): Promise<{ message: string | undefined; code: string | undefined }> {
        let body: { error?: unknown; code?: unknown } | null
        try {
            body = (await response.json()) as {
                error?: unknown
                code?: unknown
            }
        } catch {
            body = null
        }
        return {
            message: typeof body?.error === 'string' ? body.error : undefined,
            code: typeof body?.code === 'string' ? body.code : undefined,
        }
    }

    async function request<T>(
        method: string,
        path: string,
        init?: {
            body?: RequestInit['body']
            headers?: Record<string, string>
            signal?: AbortSignal
        }
    ): Promise<T> {
        let response: Response
        try {
            response = await fetchImpl(url(path), {
                method,
                headers: await headers(init?.headers),
                body: init?.body,
                signal: init?.signal,
            })
        } catch {
            throw new ApiClientError('Network error occurred', 0, 'network')
        }

        if (!response.ok) {
            const { message, code } = await readErrorBody(response)
            throw new ApiClientError(
                message ?? `Request failed with status ${response.status}`,
                response.status,
                'http',
                code
            )
        }

        try {
            return (await response.json()) as T
        } catch {
            throw new ApiClientError(
                'Invalid JSON response',
                response.status,
                'parse'
            )
        }
    }

    function jsonRequest<T>(
        method: string,
        path: string,
        body?: unknown
    ): Promise<T> {
        return request<T>(method, path, {
            body: body === undefined ? undefined : JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' },
        })
    }

    function get<T>(path: string, signal?: AbortSignal): Promise<T> {
        return request<T>('GET', path, { signal })
    }

    return {
        async submitScore(data: ScoreData): Promise<ScoreSubmissionResult> {
            try {
                const response = await fetchImpl(url('/api/scores'), {
                    method: 'POST',
                    headers: await headers({
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify(data),
                })

                if (!response.ok) {
                    let body: { code?: unknown } | null = null
                    try {
                        body = (await response.json()) as { code?: unknown }
                    } catch {
                        body = null
                    }

                    const code =
                        response.status === 401
                            ? 'UNAUTHENTICATED'
                            : body?.code === 'SCORE_CONTEXT_UNAVAILABLE'
                              ? body.code
                              : undefined

                    if (response.status === 401) {
                        return {
                            success: false,
                            error: 'You must be logged in to save scores',
                            code,
                        }
                    } else if (response.status === 400) {
                        return {
                            success: false,
                            error: 'Invalid score data',
                            code,
                        }
                    } else {
                        return {
                            success: false,
                            error: 'Failed to save score',
                            code,
                        }
                    }
                }

                const result = (await response.json()) as ScoreSubmitResponse
                return {
                    success: true,
                    newAchievements: result.newAchievements || [],
                    challengeUpdates: result.challengeUpdates,
                }
            } catch (_error) {
                return {
                    success: false,
                    error: 'Network error occurred',
                    code: 'NETWORK_ERROR',
                }
            }
        },

        getBestScore(gameId: GameID): Promise<BestScoreResponse> {
            return get(`/api/scores/best?gameId=${encodeURIComponent(gameId)}`)
        },

        getScoreHistory(limit: number = 10): Promise<ScoreHistoryResponse> {
            return get(`/api/scores/history?limit=${limit}`)
        },

        getLeaderboard(
            query: LeaderboardQuery = {},
            requestOptions?: ApiRequestOptions
        ): Promise<LeaderboardResponse> {
            const params = new URLSearchParams()
            if (query.gameId !== undefined) {
                params.set('gameId', query.gameId)
            }
            if (query.limit !== undefined) {
                params.set('limit', String(query.limit))
            }
            if (query.mode !== undefined) {
                params.set('mode', query.mode)
            }
            if (query.competitionKey !== undefined) {
                params.set('competitionKey', query.competitionKey)
            }
            const queryString = params.toString()
            return get(
                queryString
                    ? `/api/leaderboard?${queryString}`
                    : '/api/leaderboard',
                requestOptions?.signal
            )
        },

        getChallenges(
            options?: ApiRequestOptions
        ): Promise<ChallengesResponse> {
            return get('/api/challenges', options?.signal)
        },

        getChallengeXp(): Promise<ChallengeXpResponse> {
            return get('/api/challenges/xp')
        },

        getLoginRewardStatus(): Promise<LoginRewardStatusResponse> {
            return get('/api/login-rewards')
        },

        claimLoginReward(): Promise<LoginRewardClaimResponse> {
            return jsonRequest('POST', '/api/login-rewards/claim')
        },

        getSettings(): Promise<NotificationSettingsResponse> {
            return get('/api/settings')
        },

        updateSettings(
            preferences: Partial<NotificationSettingsResponse>
        ): Promise<SettingsUpdateResponse> {
            return jsonRequest('POST', '/api/settings', preferences)
        },

        updateProfile(
            profile: ProfileUpdateInput
        ): Promise<SuccessMessageResponse> {
            return jsonRequest('POST', '/api/user/profile', profile)
        },

        uploadAvatar(avatar: FormData): Promise<AvatarUpdateResponse> {
            // No manual Content-Type: the host sets the multipart boundary.
            return request('POST', '/api/user/avatar', { body: avatar })
        },

        deleteAvatar(): Promise<SuccessMessageResponse> {
            return request('DELETE', '/api/user/avatar')
        },

        updateStreaks(): Promise<UpdateStreaksResponse> {
            return jsonRequest('POST', '/api/user/update-streaks')
        },
    }
}
