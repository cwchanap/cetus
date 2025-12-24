import { GameID } from './games'

export enum ChallengeType {
    SCORE_TARGET = 'score_target', // Score X in specific game
    PLAY_GAMES = 'play_games', // Play N games (any type)
    VARIETY = 'variety', // Play N different game types
    TOTAL_SCORE = 'total_score', // Accumulate X total score today
}

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard'

export interface ChallengeDefinition {
    id: string
    name: string
    description: string
    icon: string
    type: ChallengeType
    gameId?: GameID // For game-specific challenges
    targetValue: number
    xpReward: number
    difficulty: ChallengeDifficulty
    weight: number // For rotation selection (higher = more likely)
}

export interface UserChallengeProgress {
    challengeId: string
    name: string
    description: string
    icon: string
    type: ChallengeType
    gameId?: GameID
    targetValue: number
    currentValue: number
    xpReward: number
    difficulty: ChallengeDifficulty
    completed: boolean
    completedAt: Date | null
}

// XP required for each level (index = level - 1)
export const LEVEL_THRESHOLDS: number[] = [
    0, // Level 1
    100, // Level 2
    250, // Level 3
    500, // Level 4
    1000, // Level 5
    2000, // Level 6
    4000, // Level 7
    7000, // Level 8
    11000, // Level 9
    16000, // Level 10+
]

// Challenge pool - varied challenges for daily rotation
export const CHALLENGE_POOL: ChallengeDefinition[] = [
    // === EASY CHALLENGES (30 XP) ===
    {
        id: 'play_2_games',
        name: 'Warm Up',
        description: 'Play 2 games today',
        icon: '🎮',
        type: ChallengeType.PLAY_GAMES,
        targetValue: 2,
        xpReward: 30,
        difficulty: 'easy',
        weight: 3,
    },
    {
        id: 'score_tetris_100',
        name: 'Tetris Starter',
        description: 'Score 100+ points in Tetris',
        icon: '🔲',
        type: ChallengeType.SCORE_TARGET,
        gameId: GameID.TETRIS,
        targetValue: 100,
        xpReward: 30,
        difficulty: 'easy',
        weight: 2,
    },
    {
        id: 'score_bubble_50',
        name: 'Bubble Beginner',
        description: 'Score 50+ points in Bubble Shooter',
        icon: '🫧',
        type: ChallengeType.SCORE_TARGET,
        gameId: GameID.BUBBLE_SHOOTER,
        targetValue: 50,
        xpReward: 30,
        difficulty: 'easy',
        weight: 2,
    },
    {
        id: 'total_score_200',
        name: 'Point Collector',
        description: 'Earn 200 total points today',
        icon: '⭐',
        type: ChallengeType.TOTAL_SCORE,
        targetValue: 200,
        xpReward: 30,
        difficulty: 'easy',
        weight: 2,
    },

    // === MEDIUM CHALLENGES (50 XP) ===
    {
        id: 'play_3_games',
        name: 'Daily Gamer',
        description: 'Play 3 games today',
        icon: '🎯',
        type: ChallengeType.PLAY_GAMES,
        targetValue: 3,
        xpReward: 50,
        difficulty: 'medium',
        weight: 2,
    },
    {
        id: 'variety_3_games',
        name: 'Variety Pack',
        description: 'Play 3 different game types',
        icon: '🎲',
        type: ChallengeType.VARIETY,
        targetValue: 3,
        xpReward: 50,
        difficulty: 'medium',
        weight: 2,
    },
    {
        id: 'score_tetris_300',
        name: 'Tetris Pro',
        description: 'Score 300+ points in Tetris',
        icon: '🔲',
        type: ChallengeType.SCORE_TARGET,
        gameId: GameID.TETRIS,
        targetValue: 300,
        xpReward: 50,
        difficulty: 'medium',
        weight: 1,
    },
    {
        id: 'score_bejeweled_200',
        name: 'Gem Hunter',
        description: 'Score 200+ points in Bejeweled',
        icon: '💎',
        type: ChallengeType.SCORE_TARGET,
        gameId: GameID.BEJEWELED,
        targetValue: 200,
        xpReward: 50,
        difficulty: 'medium',
        weight: 1,
    },
    {
        id: 'score_memory_150',
        name: 'Memory Master',
        description: 'Score 150+ points in Memory Matrix',
        icon: '🧠',
        type: ChallengeType.SCORE_TARGET,
        gameId: GameID.MEMORY_MATRIX,
        targetValue: 150,
        xpReward: 50,
        difficulty: 'medium',
        weight: 1,
    },
    {
        id: 'total_score_500',
        name: 'High Scorer',
        description: 'Earn 500 total points today',
        icon: '🏆',
        type: ChallengeType.TOTAL_SCORE,
        targetValue: 500,
        xpReward: 50,
        difficulty: 'medium',
        weight: 1,
    },

    // === HARD CHALLENGES (75 XP) ===
    {
        id: 'play_5_games',
        name: 'Marathon',
        description: 'Play 5 games today',
        icon: '🏃',
        type: ChallengeType.PLAY_GAMES,
        targetValue: 5,
        xpReward: 75,
        difficulty: 'hard',
        weight: 1,
    },
    {
        id: 'variety_5_games',
        name: 'Jack of All Trades',
        description: 'Play 5 different game types',
        icon: '🃏',
        type: ChallengeType.VARIETY,
        targetValue: 5,
        xpReward: 75,
        difficulty: 'hard',
        weight: 1,
    },
    {
        id: 'score_tetris_500',
        name: 'Tetris Champion',
        description: 'Score 500+ points in Tetris',
        icon: '👑',
        type: ChallengeType.SCORE_TARGET,
        gameId: GameID.TETRIS,
        targetValue: 500,
        xpReward: 75,
        difficulty: 'hard',
        weight: 1,
    },
    {
        id: 'score_quickmath_200',
        name: 'Math Wizard',
        description: 'Score 200+ points in Quick Math',
        icon: '🧮',
        type: ChallengeType.SCORE_TARGET,
        gameId: GameID.QUICK_MATH,
        targetValue: 200,
        xpReward: 75,
        difficulty: 'hard',
        weight: 1,
    },
    {
        id: 'total_score_1000',
        name: 'Point Master',
        description: 'Earn 1000 total points today',
        icon: '💫',
        type: ChallengeType.TOTAL_SCORE,
        targetValue: 1000,
        xpReward: 75,
        difficulty: 'hard',
        weight: 1,
    },
]

// Get challenge by ID
export function getChallengeById(id: string): ChallengeDefinition | undefined {
    return CHALLENGE_POOL.find(c => c.id === id)
}

// Calculate level from XP
export function getLevelFromXP(xp: number): number {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
        if (xp >= LEVEL_THRESHOLDS[i]) {
            return i + 1
        }
    }
    return 1
}

// Get XP progress to next level
export function getXPProgress(xp: number): {
    currentLevel: number
    currentLevelXP: number
    nextLevelXP: number
    progress: number
} {
    const currentLevel = getLevelFromXP(xp)
    const currentLevelXP = LEVEL_THRESHOLDS[currentLevel - 1] || 0
    const nextLevelXP =
        LEVEL_THRESHOLDS[currentLevel] ||
        LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]
    const xpInLevel = xp - currentLevelXP
    const xpNeeded = nextLevelXP - currentLevelXP
    const progress =
        xpNeeded > 0 ? Math.min(100, (xpInLevel / xpNeeded) * 100) : 100

    return { currentLevel, currentLevelXP, nextLevelXP, progress }
}

// Deterministic hash for date-based challenge selection
function hashDateToNumber(dateStr: string): number {
    let hash = 0
    for (let i = 0; i < dateStr.length; i++) {
        const char = dateStr.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
}

// Seeded random number generator
function seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
}

// Weighted random selection
function selectWeighted<T extends { weight: number }>(
    items: T[],
    seed: number
): T {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0)
    let random = seededRandom(seed) * totalWeight

    for (const item of items) {
        random -= item.weight
        if (random <= 0) {
            return item
        }
    }
    return items[items.length - 1]
}

// Generate daily challenges for a specific date
export function generateDailyChallenges(date: Date): ChallengeDefinition[] {
    const dateStr = date.toISOString().split('T')[0]
    const seed = hashDateToNumber(dateStr)

    const challenges: ChallengeDefinition[] = []
    const usedIds = new Set<string>()

    // 1. Always include one "play games" type challenge (easy engagement)
    const playGamesPool = CHALLENGE_POOL.filter(
        c => c.type === ChallengeType.PLAY_GAMES && !usedIds.has(c.id)
    )
    if (playGamesPool.length > 0) {
        const selected = selectWeighted(playGamesPool, seed)
        challenges.push(selected)
        usedIds.add(selected.id)
    }

    // 2. Add one game-specific score challenge
    const scorePool = CHALLENGE_POOL.filter(
        c => c.type === ChallengeType.SCORE_TARGET && !usedIds.has(c.id)
    )
    if (scorePool.length > 0) {
        const selected = selectWeighted(scorePool, seed + 1)
        challenges.push(selected)
        usedIds.add(selected.id)
    }

    // 3. Add a variety or total_score challenge (50% chance each day)
    if (seededRandom(seed + 2) > 0.5) {
        const bonusPool = CHALLENGE_POOL.filter(
            c =>
                (c.type === ChallengeType.VARIETY ||
                    c.type === ChallengeType.TOTAL_SCORE) &&
                !usedIds.has(c.id)
        )
        if (bonusPool.length > 0) {
            const selected = selectWeighted(bonusPool, seed + 3)
            challenges.push(selected)
            usedIds.add(selected.id)
        }
    }

    return challenges
}

// Get seconds until midnight UTC
export function getSecondsUntilMidnightUTC(): number {
    const now = new Date()
    const midnight = new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
            0,
            0,
            0,
            0
        )
    )
    return Math.floor((midnight.getTime() - now.getTime()) / 1000)
}

// Get today's date in YYYY-MM-DD format (UTC)
export function getTodayUTC(): string {
    return new Date().toISOString().split('T')[0]
}
