/**
 * Plain TypeScript response DTOs for the application API (wire contracts).
 *
 * One canonical type per response shape, named for its wire role. Route
 * handlers type their success literals with `jsonResponse<SpecificDto>(...)`
 * so `astro check` rejects drift between payloads and these contracts. There
 * are intentionally NO Zod parsers for first-party response bodies — clients
 * narrow `unknown` (e.g. the `SCORE_CONTEXT_UNAVAILABLE` coded envelope) as
 * scoreService already does.
 */

import type { AchievementNotification } from './achievements'
import type { UserChallengeProgress } from './challenges'
import type { LoginRewardDefinition, MilestoneBadge } from './loginRewards'

// --- Shared envelope -------------------------------------------------------

/** Body produced by the web `codedErrorResponse` helper. */
export interface CodedErrorBody {
    error: string
    code: string
}

// --- POST /api/scores ------------------------------------------------------

/** Completed-challenge payload echoed inside a successful score submission. */
export interface ChallengeUpdatesPayload {
    completedChallenges: Array<{
        id: string
        name: string
        description: string
        icon: string
        xpReward: number
    }>
    xpEarned: number
    levelUp: boolean
    newLevel?: number
}

export interface ScoreSubmitResponse {
    success: true
    newAchievements: AchievementNotification[]
    challengeUpdates?: ChallengeUpdatesPayload
}

// --- GET /api/scores/best --------------------------------------------------

export interface BestScoreResponse {
    bestScore: number | null
}

// --- GET /api/scores/history -----------------------------------------------

export interface ScoreHistoryEntryResponse {
    game_id: string
    game_name: string
    score: number
    created_at: string
}

export interface ScoreHistoryResponse {
    history: ScoreHistoryEntryResponse[]
}

// --- GET /api/leaderboard --------------------------------------------------

export interface LeaderboardEntryResponse {
    rank: number
    name: string
    username: string | null
    score: number
    created_at: string
    image: string | null
}

export interface ScopedLeaderboardEntryResponse {
    rank: number
    name: string
    username: string | null
    image: string | null
    score: number
    created_at: string
    mode: string
    competitionKey: string | null
    rulesetVersion: number
    elapsedSeconds: number | null
    totalMoves: number | null
    isCurrentUser: boolean
}

/** All-games branch (no gameId in the query). */
export interface AllGamesLeaderboardResponse {
    leaderboards: Record<string, LeaderboardEntryResponse[]>
}

/** Unscoped single-game branch. */
export interface GameLeaderboardResponse {
    gameId: string
    gameName: string
    leaderboard: LeaderboardEntryResponse[]
}

/** Mode/competitionKey-scoped branch. */
export interface ScopedLeaderboardResponse {
    gameId: string
    gameName: string
    viewerAuthenticated: boolean
    leaderboard: ScopedLeaderboardEntryResponse[]
}

export type LeaderboardResponse =
    | AllGamesLeaderboardResponse
    | GameLeaderboardResponse
    | ScopedLeaderboardResponse

// --- GET /api/challenges ---------------------------------------------------

/**
 * Wire shape of a daily challenge with progress. Mirrors
 * `UserChallengeProgress` with `completedAt` serialized to a JSON date
 * string (ISO-8601) or null.
 */
export type ChallengeProgressResponse = Omit<
    UserChallengeProgress,
    'completedAt'
> & { completedAt: string | null }

export interface ChallengesResponse {
    challenges: ChallengeProgressResponse[]
    xp: number
    level: number
    xpProgress: number
    xpToNextLevel: number
    streak: number
    resetIn: number
    /** Today's UTC date, YYYY-MM-DD */
    date: string
}

// --- GET /api/challenges/xp ------------------------------------------------

export interface ChallengeXpResponse {
    xp: number
    level: number
    currentLevelXP: number
    nextLevelXP: number
    progress: number
    streak: number
    maxLevel: number
}

// --- GET /api/login-rewards ------------------------------------------------

export interface LoginRewardStatusResponse {
    /** Current position in 7-day cycle (0-7).
     *  0 = first day, 1-6 = days 2-7, 7 = transient value when a cycle completes */
    loginStreak: number
    /** Day number to display (1-7) */
    currentCycleDay: number
    /** Total completed 7-day cycles */
    totalCycles: number
    /** Total consecutive days (cycles * 7 + current streak) */
    totalConsecutiveDays: number
    /** Today's reward if claimable */
    todayReward: LoginRewardDefinition
    /** Whether reward has been claimed today */
    alreadyClaimed: boolean
    /** Whether user can claim today */
    canClaim: boolean
    /** Next milestone badge to earn */
    nextMilestone: MilestoneBadge | null
    /** Days until next milestone */
    daysUntilMilestone: number | null
}

// --- POST /api/login-rewards/claim -----------------------------------------

export interface LoginRewardClaimResponse {
    success: boolean
    error?: string
    /** XP earned from this claim */
    xpEarned?: number
    /** New total XP */
    newTotalXP?: number
    /** New level after claim */
    newLevel?: number
    /** Whether user leveled up */
    leveledUp?: boolean
    /** Previous level before claim */
    previousLevel?: number
    /** Milestone badge earned (if any) */
    milestoneBadge?: MilestoneBadge
    /** Updated status after claim */
    updatedStatus?: LoginRewardStatusResponse
}

/** 400 body when the reward was already claimed or the claim failed. */
export interface LoginRewardClaimErrorResponse {
    success: false
    error: string
}

// --- GET /api/settings · POST /api/settings --------------------------------

export interface NotificationSettingsResponse {
    email_notifications: boolean
    push_notifications: boolean
    challenge_reminders: boolean
}

export interface SettingsUpdateResponse {
    success: true
    preferences: NotificationSettingsResponse
}

// --- POST /api/user/profile · POST+DELETE /api/user/avatar -----------------

export interface SuccessMessageResponse {
    success: true
    message: string
}

export interface AvatarUpdateResponse {
    success: true
    message: string
    avatar: string
}

// --- POST /api/user/update-streaks -----------------------------------------

export interface UpdateStreaksResponse {
    success: true
    processed: number
    incremented: number
    reset: number
}
