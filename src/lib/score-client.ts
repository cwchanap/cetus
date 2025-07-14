/**
 * @deprecated Use @/lib/services/scoreService instead
 * Client-side score management utilities - maintained for backward compatibility
 */

import {
    submitScore as serviceSubmitScore,
    getUserGameHistory as serviceGetUserGameHistory,
    getUserBestScore as serviceGetUserBestScore,
    formatGameName as serviceFormatGameName,
    formatScore as serviceFormatScore,
    formatDate as serviceFormatDate,
    type GameHistoryEntry as ServiceGameHistoryEntry,
    type ScoreData as ServiceScoreData,
} from '@/lib/services/scoreService'
import type { GameType } from '@/lib/db/types'

export interface ScoreData {
    gameId: string
    score: number
}

export interface GameHistoryEntry {
    game_id: string
    game_name: string
    score: number
    created_at: string
}

/**
 * @deprecated Use saveGameScore from @/lib/services/scoreService instead
 * Submit a score to the server
 */
export async function submitScore(scoreData: ScoreData): Promise<boolean> {
    const result = await serviceSubmitScore({
        gameId: scoreData.gameId as GameType,
        score: scoreData.score,
    })
    return result.success
}

/**
 * @deprecated Use getUserGameHistory from @/lib/services/scoreService instead
 * Get user's game history
 */
export async function getUserGameHistory(
    limit: number = 10
): Promise<GameHistoryEntry[]> {
    return serviceGetUserGameHistory(limit)
}

/**
 * @deprecated Use getUserBestScore from @/lib/services/scoreService instead
 * Get user's best score for a specific game
 */
export async function getUserBestScore(gameId: string): Promise<number | null> {
    return serviceGetUserBestScore(gameId as GameType)
}

/**
 * @deprecated Use formatGameName from @/lib/services/scoreService instead
 * Format game name for display
 */
export function formatGameName(gameId: string): string {
    return serviceFormatGameName(gameId as GameType)
}

/**
 * @deprecated Use formatScore from @/lib/services/scoreService instead
 * Format score for display
 */
export function formatScore(score: number): string {
    return serviceFormatScore(score)
}

/**
 * @deprecated Use formatDate from @/lib/services/scoreService instead
 * Format date for display
 */
export function formatDate(dateString: string): string {
    return serviceFormatDate(dateString)
}
