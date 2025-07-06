/**
 * Client-side score management utilities
 */

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
 * Submit a score to the server
 */
export async function submitScore(scoreData: ScoreData): Promise<boolean> {
  try {
    const response = await fetch('/api/scores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scoreData),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    return result.success
  } catch (error) {
    console.error('Error submitting score:', error)
    return false
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
export async function getUserBestScore(gameId: string): Promise<number | null> {
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
export function formatGameName(gameId: string): string {
  switch (gameId) {
    case 'tetris':
      return 'Tetris Challenge'
    case 'quick_draw':
      return 'Quick Draw'
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
