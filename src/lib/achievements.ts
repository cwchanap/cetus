import type { GameType, UserAchievementRecord } from './db/types'

// Achievement system types
export interface Achievement {
    id: string
    name: string
    description: string
    logo: string
    gameId: GameType | 'global' // 'global' for system-wide achievements
    condition: {
        type: 'score_threshold' | 'games_played' | 'custom'
        threshold?: number
        customCheck?: string // For future extensibility
    }
    isHidden?: boolean // Hidden until unlocked
    rarity: 'common' | 'rare' | 'epic' | 'legendary'
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
        rarity: 'common',
    },

    // Welcome achievements for games
    {
        id: 'tetris_welcome',
        name: 'First Drop',
        description: 'Welcome to Tetris! You scored your first points.',
        logo: '🎮',
        gameId: 'tetris',
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: 'common',
    },
    {
        id: 'bubble_shooter_welcome',
        name: 'First Pop',
        description: 'Welcome to Bubble Shooter! You popped your first bubble.',
        logo: '🎮',
        gameId: 'bubble_shooter',
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: 'common',
    },
    {
        id: 'quick_math_welcome',
        name: 'First Calculation',
        description: 'Welcome to Quick Math! You solved your first problem.',
        logo: '🎮',
        gameId: 'quick_math',
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: 'common',
    },
    {
        id: 'quick_draw_welcome',
        name: 'First Sketch',
        description: 'Welcome to Quick Draw! You completed your first drawing.',
        logo: '🎮',
        gameId: 'quick_draw',
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: 'common',
    },
    {
        id: 'memory_matrix_welcome',
        name: 'First Memory',
        description: 'Welcome to Memory Matrix! You completed your first game.',
        logo: '🎮',
        gameId: 'memory_matrix',
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: 'common',
    },

    // Tetris achievements
    {
        id: 'tetris_novice',
        name: 'Tetris Novice',
        description: 'Score 100 points in Tetris',
        logo: '🔰',
        gameId: 'tetris',
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: 'common',
    },
    {
        id: 'tetris_apprentice',
        name: 'Tetris Apprentice',
        description: 'Score 250 points in Tetris',
        logo: '⭐',
        gameId: 'tetris',
        condition: {
            type: 'score_threshold',
            threshold: 250,
        },
        rarity: 'common',
    },
    {
        id: 'tetris_expert',
        name: 'Tetris Expert',
        description: 'Score 500 points in Tetris',
        logo: '💫',
        gameId: 'tetris',
        condition: {
            type: 'score_threshold',
            threshold: 500,
        },
        rarity: 'rare',
    },
    {
        id: 'tetris_master',
        name: 'Tetris Master',
        description: 'Score 1000 points in Tetris',
        logo: '👑',
        gameId: 'tetris',
        condition: {
            type: 'score_threshold',
            threshold: 1000,
        },
        rarity: 'epic',
    },

    // Bubble Shooter achievements
    {
        id: 'bubble_beginner',
        name: 'Bubble Beginner',
        description: 'Score 100 points in Bubble Shooter',
        logo: '🫧',
        gameId: 'bubble_shooter',
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: 'common',
    },
    {
        id: 'bubble_shooter',
        name: 'Bubble Shooter',
        description: 'Score 200 points in Bubble Shooter',
        logo: '🎯',
        gameId: 'bubble_shooter',
        condition: {
            type: 'score_threshold',
            threshold: 200,
        },
        rarity: 'common',
    },
    {
        id: 'bubble_marksman',
        name: 'Bubble Marksman',
        description: 'Score 400 points in Bubble Shooter',
        logo: '🏹',
        gameId: 'bubble_shooter',
        condition: {
            type: 'score_threshold',
            threshold: 400,
        },
        rarity: 'rare',
    },
    {
        id: 'bubble_legend',
        name: 'Bubble Legend',
        description: 'Score 800 points in Bubble Shooter',
        logo: '🌟',
        gameId: 'bubble_shooter',
        condition: {
            type: 'score_threshold',
            threshold: 800,
        },
        rarity: 'epic',
    },

    // Memory Matrix achievements
    {
        id: 'memory_novice',
        name: 'Memory Novice',
        description: 'Score 100 points in Memory Matrix',
        logo: '🧠',
        gameId: 'memory_matrix',
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: 'common',
    },
    {
        id: 'memory_apprentice',
        name: 'Memory Apprentice',
        description: 'Score 200 points in Memory Matrix',
        logo: '🔍',
        gameId: 'memory_matrix',
        condition: {
            type: 'score_threshold',
            threshold: 200,
        },
        rarity: 'common',
    },
    {
        id: 'memory_expert',
        name: 'Memory Expert',
        description: 'Score 500 points in Memory Matrix',
        logo: '🎯',
        gameId: 'memory_matrix',
        condition: {
            type: 'score_threshold',
            threshold: 500,
        },
        rarity: 'rare',
    },
    {
        id: 'memory_master',
        name: 'Memory Master',
        description: 'Score 1000 points in Memory Matrix',
        logo: '👑',
        gameId: 'memory_matrix',
        condition: {
            type: 'score_threshold',
            threshold: 1000,
        },
        rarity: 'epic',
    },
]

// Helper functions
export function getAchievementById(id: string): Achievement | undefined {
    return ACHIEVEMENTS.find(achievement => achievement.id === id)
}

export function getAchievementsByGame(gameId: string): Achievement[] {
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
        case 'common':
            return 'text-gray-400 border-gray-400/30'
        case 'rare':
            return 'text-blue-400 border-blue-400/30'
        case 'epic':
            return 'text-purple-400 border-purple-400/30'
        case 'legendary':
            return 'text-yellow-400 border-yellow-400/30'
        default:
            return 'text-gray-400 border-gray-400/30'
    }
}

export function getRarityGlow(rarity: Achievement['rarity']): string {
    switch (rarity) {
        case 'common':
            return 'shadow-gray-400/25'
        case 'rare':
            return 'shadow-blue-400/25'
        case 'epic':
            return 'shadow-purple-400/25'
        case 'legendary':
            return 'shadow-yellow-400/25'
        default:
            return 'shadow-gray-400/25'
    }
}
