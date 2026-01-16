import type { ColumnType, Selectable } from 'kysely'

// Better Auth table types (based on the generated schema)
export interface UserTable {
    id: string
    name: string
    email: string
    emailVerified: number // SQLite uses INTEGER for BOOLEAN
    image: string | null
    // New identity fields (nullable for backward compatibility)
    username: string | null
    displayName: string | null
    createdAt: ColumnType<Date, string | Date, never>
    updatedAt: ColumnType<Date, string | Date, string | Date>
}

export interface SessionTable {
    id: string
    expiresAt: ColumnType<Date, string | Date, never>
    token: string
    createdAt: ColumnType<Date, string | Date, never>
    updatedAt: ColumnType<Date, string | Date, string | Date>
    ipAddress: string | null
    userAgent: string | null
    userId: string
}

export interface AccountTable {
    id: string
    accountId: string
    providerId: string
    userId: string
    accessToken: string | null
    refreshToken: string | null
    idToken: string | null
    accessTokenExpiresAt: ColumnType<Date, string | Date, never> | null
    refreshTokenExpiresAt: ColumnType<Date, string | Date, never> | null
    scope: string | null
    password: string | null
    createdAt: ColumnType<Date, string | Date, never>
    updatedAt: ColumnType<Date, string | Date, string | Date>
}

export interface VerificationTable {
    id: string
    identifier: string
    value: string
    expiresAt: ColumnType<Date, string | Date, never>
    createdAt: ColumnType<Date, string | Date, never> | null
    updatedAt: ColumnType<Date, string | Date, string | Date> | null
}

// Game-specific table types
export interface GameScoresTable {
    id: ColumnType<number, never, never> // AUTO INCREMENT
    user_id: string
    game_id: string
    score: number
    created_at: ColumnType<Date, never, never> // DEFAULT CURRENT_TIMESTAMP
}

// Import GameID enum
import { GameID } from '../../games'

// Available games type - now using the enum
export type GameType = GameID

// Achievement tables - only stores user-achievement mapping
export interface UserAchievementsTable {
    id: ColumnType<number, never, never> // AUTO INCREMENT
    user_id: string
    achievement_id: string // References achievement ID from code definitions
    earned_at: ColumnType<Date, never, never> // DEFAULT CURRENT_TIMESTAMP
}

export interface UserStatsTable {
    id: ColumnType<number, never, never> // AUTO INCREMENT
    user_id: string
    total_games_played: number
    total_score: number
    favorite_game: string | null
    streak_days: number
    xp: number
    level: number
    challenge_streak: number
    last_challenge_date: string | null
    // Login rewards fields
    login_streak: number // 0-6 (7-day cycle, resets after claiming day 7)
    last_login_reward_date: string | null // YYYY-MM-DD of last claimed reward
    total_login_cycles: number // Total completed 7-day cycles
    // Notification preferences (server-side)
    email_notifications: number // SQLite boolean: 1=enabled, 0=disabled
    push_notifications: number
    challenge_reminders: number
    created_at: ColumnType<Date, never, never> // DEFAULT CURRENT_TIMESTAMP
    updated_at: ColumnType<Date, never, string | Date> // DEFAULT CURRENT_TIMESTAMP
}

// Uniqueness: (user_id, challenge_date, challenge_id) must be unique to avoid duplicate progress rows
export interface DailyChallengeProgressTable {
    id: ColumnType<number, never, never>
    user_id: string
    challenge_date: string // YYYY-MM-DD (UTC)
    challenge_id: string // References challenge definition in code
    current_value: number
    target_value: number
    completed_at: ColumnType<Date, string | Date, string | Date> | null
    xp_awarded: number
    created_at: ColumnType<Date, never, never>
}

// Complete database schema interface
export interface Database {
    // Better Auth tables
    user: UserTable
    session: SessionTable
    account: AccountTable
    verification: VerificationTable

    // Game-specific tables
    game_scores: GameScoresTable
    user_stats: UserStatsTable

    // Achievement system tables
    user_achievements: UserAchievementsTable

    // Daily challenge system tables
    daily_challenge_progress: DailyChallengeProgressTable
}

// Type helpers for common operations
export type NewUser = Omit<UserTable, 'id' | 'createdAt' | 'updatedAt'>
export type UserUpdate = Partial<
    Pick<
        UserTable,
        | 'name'
        | 'email'
        | 'emailVerified'
        | 'image'
        | 'displayName'
        | 'username'
    >
>

export type NewGameScore = Omit<GameScoresTable, 'id' | 'created_at'>
export type GameScore = Selectable<GameScoresTable>

export type NewUserStats = Omit<
    UserStatsTable,
    'id' | 'created_at' | 'updated_at'
>
export type UserStatsUpdate = Partial<{
    total_games_played: number
    total_score: number
    favorite_game: string | null
    streak_days: number
    xp: number
    level: number
    challenge_streak: number
    last_challenge_date: string | null
    // Login rewards fields
    login_streak: number
    last_login_reward_date: string | null
    total_login_cycles: number
    // Notification preferences
    email_notifications: number
    push_notifications: number
    challenge_reminders: number
}>

// User preferences type helpers
export interface UserPreferences {
    email_notifications: boolean
    push_notifications: boolean
    challenge_reminders: boolean
}
export type UserStats = Selectable<UserStatsTable>

// Achievement type helpers
export type NewUserAchievement = Omit<UserAchievementsTable, 'id' | 'earned_at'>
export type UserAchievementRecord = Selectable<UserAchievementsTable>

// Note: UserAchievementWithDetails type moved to achievements.ts to avoid circular dependency

// Daily challenge type helpers
export type NewDailyChallengeProgress = Omit<
    DailyChallengeProgressTable,
    'id' | 'created_at'
>
export type DailyChallengeProgress = Selectable<DailyChallengeProgressTable>
