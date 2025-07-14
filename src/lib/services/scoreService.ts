/**
 * Score Service - Centralized score management for all games
 */

import type { GameType } from '@/lib/db/types'

export interface ScoreSubmissionResult {
    success: boolean
    newAchievements?: Array<{
        id: string
        name: string
        description: string
        icon: string
    }>
    error?: string
}

export interface ScoreData {
    gameId: GameType
    score: number
}

export interface GameHistoryEntry {
    game_id: string
    game_name: string
    score: number
    created_at: string
}

/**
 * Submit a score to the server with comprehensive error handling
 */
export async function submitScore(
    scoreData: ScoreData
): Promise<ScoreSubmissionResult> {
    try {
        const response = await fetch('/api/scores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(scoreData),
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error(
                `HTTP error! status: ${response.status}, body: ${errorText}`
            )

            // Handle specific error cases
            if (response.status === 401) {
                return {
                    success: false,
                    error: 'You must be logged in to save scores',
                }
            } else if (response.status === 400) {
                return { success: false, error: 'Invalid score data' }
            } else {
                return { success: false, error: 'Failed to save score' }
            }
        }

        const result = await response.json()
        return {
            success: true,
            newAchievements: result.newAchievements || [],
        }
    } catch (error) {
        console.error('Error submitting score:', error)
        return { success: false, error: 'Network error occurred' }
    }
}

/**
 * Save score and handle achievements display
 */
export async function saveGameScore(
    gameId: GameType,
    score: number,
    onSuccess?: (result: ScoreSubmissionResult) => void,
    onError?: (error: string) => void
): Promise<void> {
    if (score <= 0) {
        console.log('Score is 0 or negative, not saving')
        return
    }

    try {
        const result = await submitScore({ gameId, score })

        if (result.success) {
            console.log('Score saved successfully!')

            // Handle newly earned achievements
            if (result.newAchievements && result.newAchievements.length > 0) {
                console.log('New achievements earned:', result.newAchievements)
                // You can add a notification system here in the future
            }

            onSuccess?.(result)
        } else {
            console.warn('Failed to save score:', result.error)
            onError?.(result.error || 'Failed to save score')
        }
    } catch (error) {
        console.error('Error saving score:', error)
        onError?.('Network error occurred')
    }
}

/**
 * Get user's game history
 */
export async function getUserGameHistory(
    limit: number = 10
): Promise<GameHistoryEntry[]> {
    try {
        const response = await fetch(`/api/scores/history?limit=${limit}`)

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()
        return result.history || []
    } catch (error) {
        console.error('Error fetching game history:', error)
        return []
    }
}

/**
 * Get user's best score for a specific game
 */
export async function getUserBestScore(
    gameId: GameType
): Promise<number | null> {
    try {
        const response = await fetch(
            `/api/scores/best?gameId=${encodeURIComponent(gameId)}`
        )

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()
        return result.bestScore
    } catch (error) {
        console.error('Error fetching best score:', error)
        return null
    }
}

/**
 * Format game name for display
 */
export function formatGameName(gameId: GameType): string {
    switch (gameId) {
        case 'tetris':
            return 'Tetris Challenge'
        case 'quick_draw':
            return 'Quick Draw'
        case 'quick_math':
            return 'Quick Math'
        case 'bubble_shooter':
            return 'Bubble Shooter'
        case 'memory_matrix':
            return 'Memory Matrix'
        default:
            return gameId.charAt(0).toUpperCase() + gameId.slice(1)
    }
}

/**
 * Format score for display
 */
export function formatScore(score: number): string {
    return score.toLocaleString()
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}
