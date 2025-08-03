import type { GameType, UserAchievementRecord } from './server/db/types'
import { GameID } from './games'

// Achievement system types
export enum AchievementRarity {
    COMMON = 'common',
    RARE = 'rare',
    EPIC = 'epic',
    LEGENDARY = 'legendary',
}
export interface Achievement {
    id: string
    name: string
    description: string
    logo: string
    gameId: GameID | 'global' // 'global' for system-wide achievements
    condition: {
        type: 'score_threshold' | 'games_played' | 'in_game' | 'custom'
        threshold?: number
        // For in-game achievements, a check function is required
        check?: (gameData: any, score: number) => boolean
        customCheck?: string // For future extensibility
    }
    isHidden?: boolean // Hidden until unlocked
    rarity: AchievementRarity
}

// Combined type for user achievements with details
export type UserAchievementWithDetails = UserAchievementRecord & {
    achievement: Achievement
}

// Achievement definitions for all games
export const ACHIEVEMENTS: Achievement[] = [
    // Global achievements
    {
        id: 'space_explorer',
        name: 'Space Explorer',
        description: 'Welcome to the Cetus universe!',
        logo: '🚀',
        gameId: 'global',
        condition: {
            type: 'custom',
            customCheck: 'user_registration',
        },
        rarity: AchievementRarity.COMMON,
    },

    // Welcome achievements for games
    {
        id: 'tetris_welcome',
        name: 'First Drop',
        description: 'Welcome to Tetris! You scored your first points.',
        logo: '🎮',
        gameId: GameID.TETRIS,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'bubble_shooter_welcome',
        name: 'First Pop',
        description: 'Welcome to Bubble Shooter! You popped your first bubble.',
        logo: '🎮',
        gameId: GameID.BUBBLE_SHOOTER,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'quick_math_welcome',
        name: 'First Calculation',
        description: 'Welcome to Quick Math! You solved your first problem.',
        logo: '🎮',
        gameId: GameID.QUICK_MATH,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'memory_matrix_welcome',
        name: 'First Memory',
        description: 'Welcome to Memory Matrix! You completed your first game.',
        logo: '🎮',
        gameId: GameID.MEMORY_MATRIX,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'word_scramble_welcome',
        name: 'First Unscramble',
        description:
            'Welcome to Word Scramble! You unscrambled your first word.',
        logo: '🎮',
        gameId: GameID.WORD_SCRAMBLE,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'reflex_welcome',
        name: 'First Reflex',
        description:
            'Welcome to Reflex Coin Collection! You scored your first points.',
        logo: '🎮',
        gameId: GameID.REFLEX,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },

    // Sudoku achievements
    {
        id: 'sudoku_welcome',
        name: 'First Grid',
        description: 'Welcome to Sudoku! You played your first game.',
        logo: '🎮',
        gameId: GameID.SUDOKU,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'sudoku_novice',
        name: 'Sudoku Novice',
        description: 'Score 1000 points in Sudoku',
        logo: '🔰',
        gameId: GameID.SUDOKU,
        condition: {
            type: 'score_threshold',
            threshold: 1000,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'sudoku_adept',
        name: 'Sudoku Adept',
        description: 'Score 2000 points in Sudoku',
        logo: '⭐',
        gameId: GameID.SUDOKU,
        condition: {
            type: 'score_threshold',
            threshold: 2000,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'sudoku_master',
        name: 'Sudoku Master',
        description: 'Score 3000 points in Sudoku',
        logo: '👑',
        gameId: GameID.SUDOKU,
        condition: {
            type: 'score_threshold',
            threshold: 3000,
        },
        rarity: AchievementRarity.EPIC,
    },

    // Tetris achievements
    {
        id: 'tetris_novice',
        name: 'Tetris Novice',
        description: 'Score 100 points in Tetris',
        logo: '🔰',
        gameId: GameID.TETRIS,
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'tetris_apprentice',
        name: 'Tetris Apprentice',
        description: 'Score 250 points in Tetris',
        logo: '⭐',
        gameId: GameID.TETRIS,
        condition: {
            type: 'score_threshold',
            threshold: 250,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'tetris_expert',
        name: 'Tetris Expert',
        description: 'Score 500 points in Tetris',
        logo: '💫',
        gameId: GameID.TETRIS,
        condition: {
            type: 'score_threshold',
            threshold: 500,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'tetris_master',
        name: 'Tetris Master',
        description: 'Score 1000 points in Tetris',
        logo: '👑',
        gameId: GameID.TETRIS,
        condition: {
            type: 'score_threshold',
            threshold: 1000,
        },
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'tetris_double_clear',
        name: 'Double Clear',
        description: 'Clear 2 rows in a single strike',
        logo: '⚡',
        gameId: GameID.TETRIS,
        condition: {
            type: 'in_game',
            check: (gameData: { doubles: number }) => gameData.doubles > 0,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'tetris_double_streak',
        name: 'Double Streak',
        description: 'Clear 2 rows consecutively',
        logo: '🎯',
        gameId: GameID.TETRIS,
        condition: {
            type: 'in_game',
            check: (gameData: { consecutiveLineClears: number }) =>
                gameData.consecutiveLineClears >= 2,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'tetris_combo_streak',
        name: 'Combo Streak',
        description: 'Clear 4 rows consecutively',
        logo: '🔥',
        gameId: GameID.TETRIS,
        condition: {
            type: 'in_game',
            check: (gameData: { consecutiveLineClears: number }) =>
                gameData.consecutiveLineClears >= 4,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'tetris_quadruple_clear',
        name: 'Tetris',
        description: 'Clear 4 rows in a single strike',
        logo: '💥',
        gameId: GameID.TETRIS,
        condition: {
            type: 'in_game',
            check: (gameData: { tetrises: number }) => gameData.tetrises > 0,
        },
        rarity: AchievementRarity.RARE,
    },

    // Bubble Shooter achievements
    {
        id: 'bubble_beginner',
        name: 'Bubble Beginner',
        description: 'Score 100 points in Bubble Shooter',
        logo: '🫧',
        gameId: GameID.BUBBLE_SHOOTER,
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'bubble_shooter',
        name: 'Bubble Shooter',
        description: 'Score 200 points in Bubble Shooter',
        logo: '🎯',
        gameId: GameID.BUBBLE_SHOOTER,
        condition: {
            type: 'score_threshold',
            threshold: 200,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'bubble_marksman',
        name: 'Bubble Marksman',
        description: 'Score 400 points in Bubble Shooter',
        logo: '🏹',
        gameId: GameID.BUBBLE_SHOOTER,
        condition: {
            type: 'score_threshold',
            threshold: 400,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'bubble_legend',
        name: 'Bubble Legend',
        description: 'Score 800 points in Bubble Shooter',
        logo: '🌟',
        gameId: GameID.BUBBLE_SHOOTER,
        condition: {
            type: 'score_threshold',
            threshold: 800,
        },
        rarity: AchievementRarity.EPIC,
    },

    // Memory Matrix achievements
    {
        id: 'memory_novice',
        name: 'Memory Novice',
        description: 'Score 100 points in Memory Matrix',
        logo: '🧠',
        gameId: GameID.MEMORY_MATRIX,
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'memory_apprentice',
        name: 'Memory Apprentice',
        description: 'Score 200 points in Memory Matrix',
        logo: '🔍',
        gameId: GameID.MEMORY_MATRIX,
        condition: {
            type: 'score_threshold',
            threshold: 200,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'memory_expert',
        name: 'Memory Expert',
        description: 'Score 500 points in Memory Matrix',
        logo: '🎯',
        gameId: GameID.MEMORY_MATRIX,
        condition: {
            type: 'score_threshold',
            threshold: 500,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'memory_master',
        name: 'Memory Master',
        description: 'Score 1000 points in Memory Matrix',
        logo: '👑',
        gameId: GameID.MEMORY_MATRIX,
        condition: {
            type: 'score_threshold',
            threshold: 1000,
        },
        rarity: AchievementRarity.EPIC,
    },

    // Word Scramble achievements
    {
        id: 'word_novice',
        name: 'Word Novice',
        description: 'Score 100 points in Word Scramble',
        logo: '📝',
        gameId: GameID.WORD_SCRAMBLE,
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'word_apprentice',
        name: 'Word Apprentice',
        description: 'Score 200 points in Word Scramble',
        logo: '📚',
        gameId: GameID.WORD_SCRAMBLE,
        condition: {
            type: 'score_threshold',
            threshold: 200,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'word_expert',
        name: 'Word Expert',
        description: 'Score 400 points in Word Scramble',
        logo: '🔤',
        gameId: GameID.WORD_SCRAMBLE,
        condition: {
            type: 'score_threshold',
            threshold: 400,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'word_master',
        name: 'Word Master',
        description: 'Score 600 points in Word Scramble',
        logo: '🏆',
        gameId: GameID.WORD_SCRAMBLE,
        condition: {
            type: 'score_threshold',
            threshold: 600,
        },
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'vocabulary_virtuoso',
        name: 'Vocabulary Virtuoso',
        description: 'Score 800 points in Word Scramble',
        logo: '✨',
        gameId: GameID.WORD_SCRAMBLE,
        condition: {
            type: 'score_threshold',
            threshold: 800,
        },
        rarity: AchievementRarity.LEGENDARY,
    },

    // Path Navigator achievements
    {
        id: 'path_navigator_welcome',
        name: 'First Path',
        description:
            'Welcome to Path Navigator! You completed your first path.',
        logo: '🎮',
        gameId: GameID.PATH_NAVIGATOR,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'path_navigator_explorer',
        name: 'Path Explorer',
        description: 'Score 100 points in Path Navigator',
        logo: '🗺️',
        gameId: GameID.PATH_NAVIGATOR,
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'path_navigator_navigator',
        name: 'Master Navigator',
        description: 'Score 250 points in Path Navigator',
        logo: '🧭',
        gameId: GameID.PATH_NAVIGATOR,
        condition: {
            type: 'score_threshold',
            threshold: 250,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'path_navigator_expert',
        name: 'Path Expert',
        description: 'Score 500 points in Path Navigator',
        logo: '⭐',
        gameId: GameID.PATH_NAVIGATOR,
        condition: {
            type: 'score_threshold',
            threshold: 500,
        },
        rarity: AchievementRarity.EPIC,
    },

    // Quick Math achievements
    {
        id: 'math_novice',
        name: 'Math Novice',
        description: 'Score 100 points in Quick Math',
        logo: '🔰',
        gameId: GameID.QUICK_MATH,
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'math_apprentice',
        name: 'Math Apprentice',
        description: 'Score 250 points in Quick Math',
        logo: '⭐',
        gameId: GameID.QUICK_MATH,
        condition: {
            type: 'score_threshold',
            threshold: 250,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'math_expert',
        name: 'Math Expert',
        description: 'Score 500 points in Quick Math',
        logo: '💫',
        gameId: GameID.QUICK_MATH,
        condition: {
            type: 'score_threshold',
            threshold: 500,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'math_master',
        name: 'Math Master',
        description: 'Score 1000 points in Quick Math',
        logo: '👑',
        gameId: GameID.QUICK_MATH,
        condition: {
            type: 'score_threshold',
            threshold: 1000,
        },
        rarity: AchievementRarity.EPIC,
    },

    // Reflex achievements
    {
        id: 'reflex_novice',
        name: 'Reflex Novice',
        description: 'Score 100 points in Reflex Coin Collection',
        logo: '⚡',
        gameId: GameID.REFLEX,
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'reflex_apprentice',
        name: 'Reflex Apprentice',
        description: 'Score 250 points in Reflex Coin Collection',
        logo: '🪙',
        gameId: GameID.REFLEX,
        condition: {
            type: 'score_threshold',
            threshold: 250,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'reflex_expert',
        name: 'Reflex Expert',
        description: 'Score 500 points in Reflex Coin Collection',
        logo: '💰',
        gameId: GameID.REFLEX,
        condition: {
            type: 'score_threshold',
            threshold: 500,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'reflex_master',
        name: 'Reflex Master',
        description: 'Score 1000 points in Reflex Coin Collection',
        logo: '👑',
        gameId: GameID.REFLEX,
        condition: {
            type: 'score_threshold',
            threshold: 1000,
        },
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'lightning_reflexes',
        name: 'Lightning Reflexes',
        description: 'Score 1500 points in Reflex Coin Collection',
        logo: '⚡',
        gameId: GameID.REFLEX,
        condition: {
            type: 'score_threshold',
            threshold: 1500,
        },
        rarity: AchievementRarity.LEGENDARY,
    },

    // New Reflex achievements for coin/bomb collection patterns
    {
        id: 'reflex_coin_streak',
        name: 'Coin Collector',
        description: 'Collect 10 coins in a row without hitting a bomb',
        logo: '🪙',
        gameId: GameID.REFLEX,
        condition: {
            type: 'in_game',
            check: (gameData: { gameHistory: any[] }) =>
                checkConsecutiveObjectType(gameData.gameHistory, 'coin', 10),
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'reflex_bomb_streak',
        name: 'Bomb Magnet',
        description: 'Hit 10 bombs in a row without collecting a coin',
        logo: '💣',
        gameId: GameID.REFLEX,
        condition: {
            type: 'in_game',
            check: (gameData: { gameHistory: any[] }) =>
                checkConsecutiveObjectType(gameData.gameHistory, 'bomb', 10),
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'reflex_perfect_run',
        name: 'Perfect Reflexes',
        description: 'Score over 500 points without hitting any bombs',
        logo: '✨',
        gameId: GameID.REFLEX,
        condition: {
            type: 'in_game',
            check: (gameData: { bombsHit: number }, score: number) =>
                score > 500 && gameData.bombsHit === 0,
        },
        rarity: AchievementRarity.LEGENDARY,
    },
    {
        id: 'reflex_balanced_collector',
        name: 'Balanced Collector',
        description:
            'End a game with exactly the same number of coins and bombs collected',
        logo: '⚖️',
        gameId: GameID.REFLEX,
        condition: {
            type: 'in_game',
            check: (gameData: { coinsCollected: number; bombsHit: number }) =>
                gameData.coinsCollected === gameData.bombsHit &&
                gameData.coinsCollected > 0,
        },
        rarity: AchievementRarity.RARE,
    },
]

// Helper functions
function checkConsecutiveObjectType(
    gameHistory: Array<{
        objectId: string
        type: 'coin' | 'bomb'
        clicked: boolean
        timeToClick?: number
        pointsAwarded: number
    }>,
    targetType: 'coin' | 'bomb',
    requiredCount: number
): boolean {
    let consecutiveCount = 0
    let maxConsecutiveCount = 0

    // Only consider clicked objects for streaks
    const clickedObjects = gameHistory.filter(entry => entry.clicked)

    for (const entry of clickedObjects) {
        if (entry.type === targetType) {
            consecutiveCount++
            maxConsecutiveCount = Math.max(
                maxConsecutiveCount,
                consecutiveCount
            )
        } else {
            consecutiveCount = 0
        }
    }

    return maxConsecutiveCount >= requiredCount
}

export function getAchievementById(id: string): Achievement | undefined {
    return ACHIEVEMENTS.find(achievement => achievement.id === id)
}

export function getAchievementsByGame(
    gameId: GameID | 'global'
): Achievement[] {
    return ACHIEVEMENTS.filter(achievement => achievement.gameId === gameId)
}

export function getGlobalAchievements(): Achievement[] {
    return ACHIEVEMENTS.filter(achievement => achievement.gameId === 'global')
}

export function getAllAchievements(): Achievement[] {
    return ACHIEVEMENTS
}

// Pagination helper functions
export function getPaginatedAchievements(
    achievements: Achievement[],
    page: number = 1,
    pageSize: number = 10
): {
    achievements: Achievement[]
    total: number
    page: number
    pageSize: number
    totalPages: number
} {
    const total = achievements.length
    const totalPages = Math.ceil(total / pageSize)
    const offset = (page - 1) * pageSize
    const paginatedAchievements = achievements.slice(offset, offset + pageSize)

    return {
        achievements: paginatedAchievements,
        total,
        page,
        pageSize,
        totalPages,
    }
}

// Rarity styling helpers
export function getRarityColor(rarity: Achievement['rarity']): string {
    switch (rarity) {
        case AchievementRarity.COMMON:
            return 'text-gray-400 border-gray-400/30'
        case AchievementRarity.RARE:
            return 'text-blue-400 border-blue-400/30'
        case AchievementRarity.EPIC:
            return 'text-purple-400 border-purple-400/30'
        case AchievementRarity.LEGENDARY:
            return 'text-yellow-400 border-yellow-400/30'
        default:
            return 'text-gray-400 border-gray-400/30'
    }
}

export function getRarityGlow(rarity: Achievement['rarity']): string {
    switch (rarity) {
        case AchievementRarity.COMMON:
            return 'shadow-gray-400/25'
        case AchievementRarity.RARE:
            return 'shadow-blue-400/25'
        case AchievementRarity.EPIC:
            return 'shadow-purple-400/25'
        case AchievementRarity.LEGENDARY:
            return 'shadow-yellow-400/25'
        default:
            return 'shadow-gray-400/25'
    }
}
