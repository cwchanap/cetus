import type { UserAchievementRecord } from './server/db/types'
import { GameID } from './games'
import type {
    TetrisGameData,
    BejeweledGameData,
    ReflexGameData,
    QuickMathGameData,
    Game2048Data,
    SnakeGameData,
    WordScrambleGameData,
    CircuitHackerGameData,
    SatelliteSyncGameData,
    GameHistoryEntry,
} from './games/shared/types'

// Achievement system types
export enum AchievementRarity {
    COMMON = 'common',
    RARE = 'rare',
    EPIC = 'epic',
    LEGENDARY = 'legendary',
}

// Type for achievement check function - uses union of known game data types
export type AchievementCheckData =
    | TetrisGameData
    | BejeweledGameData
    | ReflexGameData
    | QuickMathGameData
    | Game2048Data
    | SnakeGameData
    | WordScrambleGameData
    | CircuitHackerGameData
    | SatelliteSyncGameData
    | Record<string, unknown>

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
        check?: (gameData: AchievementCheckData, score: number) => boolean
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

    // Login streak achievements
    {
        id: 'login_streak_7',
        name: 'Weekly Warrior',
        description: 'Complete a 7-day login streak',
        logo: '🏅',
        gameId: 'global',
        condition: {
            type: 'custom',
            customCheck: 'login_streak_7',
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'login_streak_30',
        name: 'Monthly Master',
        description: 'Complete 30 days of consecutive logins',
        logo: '🎖️',
        gameId: 'global',
        condition: {
            type: 'custom',
            customCheck: 'login_streak_30',
        },
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'login_streak_100',
        name: 'Legendary Loyalist',
        description: 'Complete 100 days of consecutive logins',
        logo: '👑',
        gameId: 'global',
        condition: {
            type: 'custom',
            customCheck: 'login_streak_100',
        },
        rarity: AchievementRarity.LEGENDARY,
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
        id: 'bejeweled_welcome',
        name: 'First Gem',
        description: 'Welcome to Bejeweled! You cleared your first match.',
        logo: '💎',
        gameId: GameID.BEJEWELED,
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

    // Bejeweled achievements
    {
        id: 'bejeweled_novice',
        name: 'Gem Novice',
        description: 'Score 100 points in Bejeweled',
        logo: '🔰',
        gameId: GameID.BEJEWELED,
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'bejeweled_apprentice',
        name: 'Gem Apprentice',
        description: 'Score 250 points in Bejeweled',
        logo: '⭐',
        gameId: GameID.BEJEWELED,
        condition: {
            type: 'score_threshold',
            threshold: 250,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'bejeweled_expert',
        name: 'Gem Expert',
        description: 'Score 500 points in Bejeweled',
        logo: '💫',
        gameId: GameID.BEJEWELED,
        condition: {
            type: 'score_threshold',
            threshold: 500,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'bejeweled_master',
        name: 'Gem Master',
        description: 'Score 1000 points in Bejeweled',
        logo: '👑',
        gameId: GameID.BEJEWELED,
        condition: {
            type: 'score_threshold',
            threshold: 1000,
        },
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'bejeweled_combo_artist',
        name: 'Combo Artist',
        description: 'Reach a combo of 3 or more in a single cascade',
        logo: '🎨',
        gameId: GameID.BEJEWELED,
        condition: {
            type: 'in_game',
            check: (gameData: { maxCombo: number }) => gameData.maxCombo >= 3,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'bejeweled_big_gem',
        name: 'Big Match',
        description: 'Clear a match of 5 or more gems',
        logo: '💎',
        gameId: GameID.BEJEWELED,
        condition: {
            type: 'in_game',
            check: (gameData: { largestMatch: number }) =>
                gameData.largestMatch >= 5,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'bejeweled_straight_five',
        name: 'Five in a Row',
        description: 'Clear 5 gems in a straight line',
        logo: '➖',
        gameId: GameID.BEJEWELED,
        condition: {
            type: 'in_game',
            check: (gameData: { straightFive?: boolean }) =>
                Boolean(gameData.straightFive),
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'bejeweled_match_maker',
        name: 'Match Maker',
        description: 'Clear 20 total matches in a game',
        logo: '🔗',
        gameId: GameID.BEJEWELED,
        condition: {
            type: 'in_game',
            check: (gameData: { totalMatches: number }) =>
                gameData.totalMatches >= 20,
        },
        rarity: AchievementRarity.COMMON,
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

    // Word Scramble hidden word-specific achievements
    {
        id: 'word_secret_dog',
        name: 'Pawsitive Thinker',
        description: 'Unscramble the hidden word: dog',
        logo: '🐶',
        gameId: GameID.WORD_SCRAMBLE,
        condition: {
            type: 'in_game',
            check: (gameData: {
                lastCorrectWord?: string
                correctWords?: string[]
            }) => {
                const target = 'dog'
                const last = (gameData?.lastCorrectWord || '').toLowerCase()
                const words = Array.isArray(gameData?.correctWords)
                    ? gameData.correctWords
                    : []
                return (
                    last === target ||
                    words.some(w => (w || '').toLowerCase() === target)
                )
            },
        },
        isHidden: true,
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'word_secret_supernova',
        name: 'Stellar Mind',
        description: 'Unscramble the hidden word: supernova',
        logo: '🌌',
        gameId: GameID.WORD_SCRAMBLE,
        condition: {
            type: 'in_game',
            check: (gameData: {
                lastCorrectWord?: string
                correctWords?: string[]
            }) => {
                const target = 'supernova'
                const last = (gameData?.lastCorrectWord || '').toLowerCase()
                const words = Array.isArray(gameData?.correctWords)
                    ? gameData.correctWords
                    : []
                return (
                    last === target ||
                    words.some(w => (w || '').toLowerCase() === target)
                )
            },
        },
        isHidden: true,
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'word_secret_mercury',
        name: 'Swift Messenger',
        description: 'Unscramble the hidden word: mercury',
        logo: '🪐',
        gameId: GameID.WORD_SCRAMBLE,
        condition: {
            type: 'in_game',
            check: (gameData: {
                lastCorrectWord?: string
                correctWords?: string[]
            }) => {
                const target = 'mercury'
                const last = (gameData?.lastCorrectWord || '').toLowerCase()
                const words = Array.isArray(gameData?.correctWords)
                    ? gameData.correctWords
                    : []
                return (
                    last === target ||
                    words.some(w => (w || '').toLowerCase() === target)
                )
            },
        },
        isHidden: true,
        rarity: AchievementRarity.RARE,
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

    // Quick Math special in-game achievements
    {
        id: 'quick_math_one_plus_one_seen',
        name: 'Elementary Encounter',
        description: 'A classic 1 + 1 question appeared during your game',
        logo: '➕',
        gameId: GameID.QUICK_MATH,
        condition: {
            type: 'in_game',
            check: (gameData: { seenOnePlusOne?: boolean }) =>
                Boolean(gameData?.seenOnePlusOne),
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'quick_math_one_plus_one_wrong',
        name: 'Not This Time…',
        description: 'You answered 1 + 1 incorrectly',
        logo: '🙈',
        gameId: GameID.QUICK_MATH,
        condition: {
            type: 'in_game',
            check: (gameData: { onePlusOneIncorrect?: boolean }) =>
                Boolean(gameData?.onePlusOneIncorrect),
        },
        isHidden: true,
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'quick_math_999_seen',
        name: 'Edge of Infinity',
        description: 'A question featured the number 999',
        logo: '9️⃣',
        gameId: GameID.QUICK_MATH,
        condition: {
            type: 'in_game',
            check: (gameData: { seenOperand999?: boolean }) =>
                Boolean(gameData?.seenOperand999),
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'quick_math_zero_answer_wrong',
        name: 'Zeroed Out',
        description:
            'A zero-answer question appeared and you answered it incorrectly',
        logo: '0️⃣',
        gameId: GameID.QUICK_MATH,
        condition: {
            type: 'in_game',
            check: (gameData: { zeroAnswerIncorrect?: boolean }) =>
                Boolean(gameData?.zeroAnswerIncorrect),
        },
        rarity: AchievementRarity.RARE,
    },

    // Evader achievements
    {
        id: 'evader_welcome',
        name: 'First Evasion',
        description: 'Welcome to Evader! You scored your first points.',
        logo: '🎮',
        gameId: GameID.EVADER,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'evader_novice',
        name: 'Evader Novice',
        description: 'Score 100 points in Evader',
        logo: '🔰',
        gameId: GameID.EVADER,
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'evader_apprentice',
        name: 'Evader Apprentice',
        description: 'Score 250 points in Evader',
        logo: '⭐',
        gameId: GameID.EVADER,
        condition: {
            type: 'score_threshold',
            threshold: 250,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'evader_expert',
        name: 'Evader Expert',
        description: 'Score 500 points in Evader',
        logo: '💫',
        gameId: GameID.EVADER,
        condition: {
            type: 'score_threshold',
            threshold: 500,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'evader_master',
        name: 'Evader Master',
        description: 'Score 1000 points in Evader',
        logo: '👑',
        gameId: GameID.EVADER,
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
            check: (gameData: { gameHistory: GameHistoryEntry[] }) =>
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
            check: (gameData: { gameHistory: GameHistoryEntry[] }) =>
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

    // Snake achievements
    {
        id: 'snake_welcome',
        name: 'First Bite',
        description: 'Welcome to Snake! You ate your first food.',
        logo: '🎮',
        gameId: GameID.SNAKE,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'snake_novice',
        name: 'Snake Novice',
        description: 'Score 50 points in Snake',
        logo: '🔰',
        gameId: GameID.SNAKE,
        condition: {
            type: 'score_threshold',
            threshold: 50,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'snake_apprentice',
        name: 'Snake Apprentice',
        description: 'Score 100 points in Snake',
        logo: '⭐',
        gameId: GameID.SNAKE,
        condition: {
            type: 'score_threshold',
            threshold: 100,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'snake_expert',
        name: 'Snake Expert',
        description: 'Score 200 points in Snake',
        logo: '💫',
        gameId: GameID.SNAKE,
        condition: {
            type: 'score_threshold',
            threshold: 200,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'snake_master',
        name: 'Snake Master',
        description: 'Score 300 points in Snake',
        logo: '👑',
        gameId: GameID.SNAKE,
        condition: {
            type: 'score_threshold',
            threshold: 300,
        },
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'snake_growth_spurt',
        name: 'Growth Spurt',
        description: 'Grow your snake to a length of 10 or more',
        logo: '📏',
        gameId: GameID.SNAKE,
        condition: {
            type: 'in_game',
            check: (gameData: { maxLength: number }) =>
                gameData.maxLength >= 10,
        },
        rarity: AchievementRarity.RARE,
    },

    // 2048 achievements - Welcome and Score-based
    {
        id: '2048_welcome',
        name: 'First Slide',
        description: 'Welcome to 2048! You scored your first points.',
        logo: '🎮',
        gameId: GameID.GAME_2048,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: '2048_novice',
        name: '2048 Novice',
        description: 'Score 500 points in 2048',
        logo: '🔰',
        gameId: GameID.GAME_2048,
        condition: {
            type: 'score_threshold',
            threshold: 500,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: '2048_apprentice',
        name: '2048 Apprentice',
        description: 'Score 1000 points in 2048',
        logo: '⭐',
        gameId: GameID.GAME_2048,
        condition: {
            type: 'score_threshold',
            threshold: 1000,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: '2048_expert',
        name: '2048 Expert',
        description: 'Score 2500 points in 2048',
        logo: '💫',
        gameId: GameID.GAME_2048,
        condition: {
            type: 'score_threshold',
            threshold: 2500,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: '2048_master',
        name: '2048 Master',
        description: 'Score 5000 points in 2048',
        logo: '👑',
        gameId: GameID.GAME_2048,
        condition: {
            type: 'score_threshold',
            threshold: 5000,
        },
        rarity: AchievementRarity.EPIC,
    },

    // 2048 achievements - Tile milestones
    {
        id: '2048_tile_256',
        name: 'Power of Two',
        description: 'Create a 256 tile in 2048',
        logo: '🔢',
        gameId: GameID.GAME_2048,
        condition: {
            type: 'in_game',
            check: (gameData: { maxTile: number }) => gameData.maxTile >= 256,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: '2048_tile_512',
        name: 'Halfway There',
        description: 'Create a 512 tile in 2048',
        logo: '📈',
        gameId: GameID.GAME_2048,
        condition: {
            type: 'in_game',
            check: (gameData: { maxTile: number }) => gameData.maxTile >= 512,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: '2048_tile_1024',
        name: 'Almost There',
        description: 'Create a 1024 tile in 2048',
        logo: '🎯',
        gameId: GameID.GAME_2048,
        condition: {
            type: 'in_game',
            check: (gameData: { maxTile: number }) => gameData.maxTile >= 1024,
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: '2048_tile_2048',
        name: '2048 Champion',
        description: 'Create a 2048 tile and win the game!',
        logo: '🏆',
        gameId: GameID.GAME_2048,
        condition: {
            type: 'in_game',
            check: (gameData: { maxTile: number }) => gameData.maxTile >= 2048,
        },
        rarity: AchievementRarity.EPIC,
    },
    {
        id: '2048_tile_4096',
        name: 'Beyond 2048',
        description: 'Create a 4096 tile - a true master!',
        logo: '🌟',
        gameId: GameID.GAME_2048,
        condition: {
            type: 'in_game',
            check: (gameData: { maxTile: number }) => gameData.maxTile >= 4096,
        },
        rarity: AchievementRarity.LEGENDARY,
    },

    // Circuit Hacker achievements
    {
        id: 'circuit_hacker_welcome',
        name: 'First Connection',
        description:
            'Welcome to Circuit Hacker! You powered your first circuit.',
        logo: '🔌',
        gameId: GameID.CIRCUIT_HACKER,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'circuit_hacker_hard',
        name: 'Hard Wired',
        description: 'Solve a Circuit Hacker puzzle on Hard difficulty.',
        logo: '⚡',
        gameId: GameID.CIRCUIT_HACKER,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as CircuitHackerGameData
                return data.difficulty === 'hard' && data.solved === true
            },
        },
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'circuit_hacker_expert',
        name: 'Master Hacker',
        description: 'Solve a Circuit Hacker puzzle on Expert difficulty.',
        logo: '🧠',
        gameId: GameID.CIRCUIT_HACKER,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as CircuitHackerGameData
                return data.difficulty === 'expert' && data.solved === true
            },
        },
        rarity: AchievementRarity.LEGENDARY,
    },
    {
        id: 'circuit_hacker_speed',
        name: 'Quick Hack',
        description:
            'Solve a Circuit Hacker puzzle with at least 60 seconds left.',
        logo: '⏱️',
        gameId: GameID.CIRCUIT_HACKER,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as CircuitHackerGameData
                return data.solved === true && data.secondsRemaining >= 60
            },
        },
        rarity: AchievementRarity.RARE,
    },

    // Satellite Sync achievements
    {
        id: 'satellite_sync_welcome',
        name: 'First Sync',
        description: 'Welcome to Satellite Sync! You locked your first beam.',
        logo: '🛰️',
        gameId: GameID.SATELLITE_SYNC,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'satellite_sync_combo',
        name: 'Combo Commander',
        description: 'Reach a ×3 combo multiplier in Satellite Sync.',
        logo: '🔗',
        gameId: GameID.SATELLITE_SYNC,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as SatelliteSyncGameData
                return data.maxCombo >= 5
            },
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'satellite_sync_complete',
        name: 'Mission Complete',
        description: 'Clear all 8 Satellite Sync levels.',
        logo: '🏆',
        gameId: GameID.SATELLITE_SYNC,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as SatelliteSyncGameData
                return data.solved === true && data.levelsCleared === 8
            },
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'satellite_sync_untouchable',
        name: 'Untouchable',
        description:
            'Clear the Satellite Sync mission keeping every level timer above 25%.',
        logo: '🛡️',
        gameId: GameID.SATELLITE_SYNC,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as SatelliteSyncGameData
                return (
                    data.solved === true && data.minTimeRemainingRatio >= 0.25
                )
            },
        },
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'satellite_sync_highcommand',
        name: 'High Command',
        description: 'Score 15,000 or more in Satellite Sync.',
        logo: '⭐',
        gameId: GameID.SATELLITE_SYNC,
        condition: {
            type: 'score_threshold',
            threshold: 15000,
        },
        rarity: AchievementRarity.LEGENDARY,
    },
]

// Helper functions
function checkConsecutiveObjectType(
    gameHistory: GameHistoryEntry[],
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
export function getPaginatedAchievements<T extends Achievement>(
    achievements: T[],
    page: number = 1,
    pageSize: number = 10
): {
    achievements: T[]
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
