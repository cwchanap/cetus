import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameCallbacks,
    BaseGameStats,
} from '@/lib/games/core/types'
import type { WordChallenge } from './types'

export interface WordHistoryEntry {
    word: string
    scrambled: string
    userAnswer: string
    correct: boolean
    timeToAnswer: number
}

export interface WordScrambleState extends BaseGameState {
    currentChallenge: WordChallenge | null
    wordsUnscrambled: number
    correctAnswers: number
    incorrectAnswers: number
    currentAnswer: string
    wordHistory: WordHistoryEntry[]
}

export interface WordScrambleConfig extends BaseGameConfig {
    pointsPerWord: {
        easy: number
        medium: number
        hard: number
    }
    wordCategories: string[]
    minWordLength: number
    maxWordLength: number
}

export interface WordScrambleStats extends BaseGameStats {
    totalWords: number
    correctAnswers: number
    incorrectAnswers: number
    accuracy: number
    averageTimePerWord: number
    longestWord: string
    shortestWord: string
    wordsUnscrambled: WordHistoryEntry[]
}

export interface WordScrambleCallbacks extends BaseGameCallbacks {
    onChallengeUpdate?: (challenge: WordChallenge) => void
    onCorrectAnswer?: (word: string) => void
    onIncorrectAnswer?: (word: string, userAnswer: string) => void
}
