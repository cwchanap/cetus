export interface WordChallenge {
    id: string
    originalWord: string
    scrambledWord: string
    difficulty: 'easy' | 'medium' | 'hard'
    points: number
    category?: string
}

export interface GameState {
    score: number
    currentChallenge: WordChallenge | null
    wordsUnscrambled: number
    correctAnswers: number
    incorrectAnswers: number
    timeRemaining: number
    isGameActive: boolean
    isGameOver: boolean
    gameStartTime: number | null
    currentAnswer: string
    wordHistory: Array<{
        word: string
        scrambled: string
        userAnswer: string
        correct: boolean
        timeToAnswer: number
    }>
}

export interface GameConfig {
    gameDuration: number // in seconds
    pointsPerWord: {
        easy: number
        medium: number
        hard: number
    }
    wordCategories: string[]
    minWordLength: number
    maxWordLength: number
}

export interface GameCallbacks {
    onScoreUpdate: (score: number) => void
    onTimeUpdate: (timeRemaining: number) => void
    onChallengeUpdate: (challenge: WordChallenge) => void
    onGameOver: (finalScore: number, stats: GameStats) => void
    onGameStart: () => void
    onCorrectAnswer: (word: string) => void
    onIncorrectAnswer: (word: string, userAnswer: string) => void
    onScoreUpload?: (success: boolean) => void
}

export interface GameStats {
    totalWords: number
    correctAnswers: number
    incorrectAnswers: number
    accuracy: number
    averageTimePerWord: number
    finalScore: number
    longestWord: string
    shortestWord: string
    wordsUnscrambled: Array<{
        word: string
        scrambled: string
        userAnswer: string
        correct: boolean
        timeToAnswer: number
    }>
}

export interface WordDatabase {
    easy: string[]
    medium: string[]
    hard: string[]
}
