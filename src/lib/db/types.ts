import type { ColumnType, Selectable } from 'kysely'

// Better Auth table types (based on the generated schema)
export interface UserTable {
    id: string
    name: string
    email: string
    emailVerified: number // SQLite uses INTEGER for BOOLEAN
    image: string | null
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

// Games table for storing game definitions
export interface GamesTable {
    id: string // Primary key
    name: string
    description: string | null
    created_at: ColumnType<Date, never, never> // DEFAULT CURRENT_TIMESTAMP
}

// Game-specific table types
export interface GameScoresTable {
    id: ColumnType<number, never, never> // AUTO INCREMENT
    user_id: string
    game_id: string
    score: number
    created_at: ColumnType<Date, never, never> // DEFAULT CURRENT_TIMESTAMP
}

// Available games enum
export type GameType = 'tetris' | 'quick_draw'

export interface UserStatsTable {
    id: ColumnType<number, never, never> // AUTO INCREMENT
    user_id: string
    total_games_played: number
    total_score: number
    favorite_game: string | null
    created_at: ColumnType<Date, never, never> // DEFAULT CURRENT_TIMESTAMP
    updated_at: ColumnType<Date, never, string | Date> // DEFAULT CURRENT_TIMESTAMP
}

// Complete database schema interface
export interface Database {
    // Better Auth tables
    user: UserTable
    session: SessionTable
    account: AccountTable
    verification: VerificationTable

    // Game-specific tables
    games: GamesTable
    game_scores: GameScoresTable
    user_stats: UserStatsTable
}

// Type helpers for common operations
export type NewUser = Omit<UserTable, 'id' | 'createdAt' | 'updatedAt'>
export type UserUpdate = Partial<
    Pick<UserTable, 'name' | 'email' | 'emailVerified' | 'image'>
>

export type NewGame = Omit<GamesTable, 'created_at'>
export type Game = Selectable<GamesTable>

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
}>
export type UserStats = Selectable<UserStatsTable>
