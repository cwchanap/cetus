import type { GameType } from './server/db/types'

// Game system types
export interface Game {
    id: GameType
    name: string
    description: string
    category: 'puzzle' | 'drawing' | 'action' | 'strategy'
    maxPlayers?: number
    estimatedDuration?: string // e.g., "5-10 minutes"
    difficulty: 'easy' | 'medium' | 'hard'
    tags: string[]
    isActive: boolean
}

// Game definitions for all available games
export const GAMES: Game[] = [
    {
        id: 'tetris',
        name: 'Tetris Challenge',
        description: 'Classic block-stacking puzzle game',
        category: 'puzzle',
        maxPlayers: 1,
        estimatedDuration: '5-15 minutes',
        difficulty: 'medium',
        tags: ['classic', 'puzzle', 'blocks', 'single-player'],
        isActive: true,
    },
    {
        id: 'quick_draw',
        name: 'Quick Draw',
        description: 'Fast-paced drawing and guessing game',
        category: 'drawing',
        maxPlayers: 8,
        estimatedDuration: '3-5 minutes',
        difficulty: 'easy',
        tags: ['drawing', 'multiplayer', 'creative', 'quick'],
        isActive: true,
    },
    {
        id: 'bubble_shooter',
        name: 'Bubble Shooter',
        description:
            'Classic bubble shooter game with color matching mechanics',
        category: 'puzzle',
        maxPlayers: 1,
        estimatedDuration: '10-20 minutes',
        difficulty: 'easy',
        tags: ['bubbles', 'matching', 'single-player', 'casual'],
        isActive: true,
    },
    {
        id: 'quick_math',
        name: 'Quick Math',
        description:
            'Fast-paced math challenge - solve as many problems as you can in 60 seconds',
        category: 'puzzle',
        maxPlayers: 1,
        estimatedDuration: '1 minute',
        difficulty: 'medium',
        tags: ['math', 'arithmetic', 'speed', 'single-player', 'educational'],
        isActive: true,
    },
    {
        id: 'memory_matrix',
        name: 'Memory Matrix',
        description:
            'Test your memory by matching pairs of shapes in this grid-based puzzle game',
        category: 'puzzle',
        maxPlayers: 1,
        estimatedDuration: '3-10 minutes',
        difficulty: 'hard',
        tags: ['memory', 'matching', 'shapes', 'single-player', 'cognitive'],
        isActive: true,
    },
    {
        id: 'word_scramble',
        name: 'Word Scramble',
        description:
            'Unscramble words as fast as you can in this 60-second word puzzle challenge',
        category: 'puzzle',
        maxPlayers: 1,
        estimatedDuration: '1 minute',
        difficulty: 'medium',
        tags: ['words', 'anagram', 'vocabulary', 'single-player', 'speed'],
        isActive: true,
    },
]

// Helper functions
export function getGameById(id: GameType): Game | undefined {
    return GAMES.find(game => game.id === id)
}

export function getAllGames(): Game[] {
    return GAMES
}

export function getActiveGames(): Game[] {
    return GAMES.filter(game => game.isActive)
}

export function getGamesByCategory(category: Game['category']): Game[] {
    return GAMES.filter(game => game.category === category && game.isActive)
}

export function getMultiplayerGames(): Game[] {
    return GAMES.filter(
        game => game.maxPlayers && game.maxPlayers > 1 && game.isActive
    )
}

export function getSinglePlayerGames(): Game[] {
    return GAMES.filter(game => game.maxPlayers === 1 && game.isActive)
}

export function searchGames(query: string): Game[] {
    const lowerQuery = query.toLowerCase()
    return GAMES.filter(
        game =>
            game.isActive &&
            (game.name.toLowerCase().includes(lowerQuery) ||
                game.description.toLowerCase().includes(lowerQuery) ||
                game.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
    )
}

// Game category styling helpers
export function getCategoryColor(category: Game['category']): string {
    switch (category) {
        case 'puzzle':
            return 'text-blue-400 border-blue-400/30'
        case 'drawing':
            return 'text-pink-400 border-pink-400/30'
        case 'action':
            return 'text-red-400 border-red-400/30'
        case 'strategy':
            return 'text-purple-400 border-purple-400/30'
        default:
            return 'text-gray-400 border-gray-400/30'
    }
}

export function getDifficultyColor(difficulty: Game['difficulty']): string {
    switch (difficulty) {
        case 'easy':
            return 'text-green-400'
        case 'medium':
            return 'text-yellow-400'
        case 'hard':
            return 'text-red-400'
        default:
            return 'text-gray-400'
    }
}
