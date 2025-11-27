// Game ID enum class
export enum GameID {
    TETRIS = 'tetris',
    BUBBLE_SHOOTER = 'bubble_shooter',
    BEJEWELED = 'bejeweled',
    QUICK_MATH = 'quick_math',
    MEMORY_MATRIX = 'memory_matrix',
    WORD_SCRAMBLE = 'word_scramble',
    REFLEX = 'reflex',
    SUDOKU = 'sudoku',
    PATH_NAVIGATOR = 'path_navigator',
    EVADER = 'evader',
    SNAKE = 'snake',
    GAME_2048 = '2048',
}

// Game system types
export interface Game {
    id: GameID
    name: string
    description: string
    category: 'puzzle' | 'action' | 'strategy'
    maxPlayers?: number
    estimatedDuration?: string // e.g., "5-10 minutes"
    difficulty: 'easy' | 'medium' | 'hard'
    tags: string[]
    isActive: boolean
}

// Game definitions for all available games
export const GAMES: Game[] = [
    {
        id: GameID.TETRIS,
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
        id: GameID.BUBBLE_SHOOTER,
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
        id: GameID.BEJEWELED,
        name: 'Bejeweled',
        description: 'Swap gems to match 3+ and trigger cascading combos',
        category: 'puzzle',
        maxPlayers: 1,
        estimatedDuration: '1-3 minutes',
        difficulty: 'easy',
        tags: ['match-3', 'gems', 'puzzle', 'single-player', 'casual'],
        isActive: true,
    },
    {
        id: GameID.QUICK_MATH,
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
        id: GameID.MEMORY_MATRIX,
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
        id: GameID.WORD_SCRAMBLE,
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
    {
        id: GameID.REFLEX,
        name: 'Reflex Coin Collection',
        description:
            'Test your reflexes by collecting coins and avoiding bombs in this fast-paced grid game',
        category: 'action',
        maxPlayers: 1,
        estimatedDuration: '1 minute',
        difficulty: 'medium',
        tags: ['reflex', 'reaction', 'coins', 'single-player', 'speed'],
        isActive: true,
    },
    {
        id: GameID.SUDOKU,
        name: 'Sudoku',
        description:
            'Classic number puzzle game - fill the grid so each row, column, and 3x3 box contains digits 1-9',
        category: 'puzzle',
        maxPlayers: 1,
        estimatedDuration: '5-20 minutes',
        difficulty: 'medium',
        tags: ['numbers', 'logic', 'puzzle', 'single-player', 'classic'],
        isActive: true,
    },
    {
        id: GameID.PATH_NAVIGATOR,
        name: 'Path Navigator',
        description:
            'Guide your cursor through challenging paths to the goal without touching the edges',
        category: 'action',
        maxPlayers: 1,
        estimatedDuration: '1-2 minutes',
        difficulty: 'medium',
        tags: ['precision', 'mouse', 'navigation', 'single-player', 'skill'],
        isActive: true,
    },
    {
        id: GameID.EVADER,
        name: 'Evader',
        description:
            'Control your character to collect coins and avoid bombs in 60 seconds',
        category: 'action',
        maxPlayers: 1,
        estimatedDuration: '1 minute',
        difficulty: 'medium',
        tags: ['reflex', 'avoidance', 'coins', 'single-player', 'speed'],
        isActive: true,
    },
    {
        id: GameID.SNAKE,
        name: 'Snake',
        description:
            'Classic snake game - eat food to grow longer without hitting walls or yourself',
        category: 'action',
        maxPlayers: 1,
        estimatedDuration: '1 minute',
        difficulty: 'easy',
        tags: ['classic', 'arcade', 'survival', 'single-player', 'snake'],
        isActive: true,
    },
    {
        id: GameID.GAME_2048,
        name: '2048',
        description:
            'Slide tiles to combine matching numbers and reach the 2048 tile',
        category: 'puzzle',
        maxPlayers: 1,
        estimatedDuration: '5-10 minutes',
        difficulty: 'medium',
        tags: ['puzzle', 'numbers', 'strategy', 'single-player', 'classic'],
        isActive: true,
    },
]

// Helper functions
export function getGameById(id: GameID): Game | undefined {
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

// Game icon mapping
const GAME_ICONS: Record<GameID, string> = {
    [GameID.TETRIS]: '🔲',
    [GameID.BUBBLE_SHOOTER]: '🫧',
    [GameID.BEJEWELED]: '💎',
    [GameID.QUICK_MATH]: '🧮',
    [GameID.MEMORY_MATRIX]: '🧠',
    [GameID.WORD_SCRAMBLE]: '📝',
    [GameID.REFLEX]: '⚡',
    [GameID.SUDOKU]: '🧩',
    [GameID.PATH_NAVIGATOR]: '🧭',
    [GameID.EVADER]: '🏃',
    [GameID.SNAKE]: '🐍',
    [GameID.GAME_2048]: '🎯',
}

// Game icon helper function
export function getGameIcon(gameId: GameID | string): string {
    return GAME_ICONS[gameId as GameID] || '🎮'
}

// Game category styling helpers
export function getCategoryColor(category: Game['category']): string {
    switch (category) {
        case 'puzzle':
            return 'text-blue-400 border-blue-400/30'
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
