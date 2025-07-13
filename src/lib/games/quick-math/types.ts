export interface MathQuestion {
    id: string
    question: string
    answer: number
    operation: 'addition' | 'subtraction'
    operand1: number
    operand2: number
}

export interface GameState {
    score: number
    currentQuestion: MathQuestion | null
    questionsAnswered: number
    correctAnswers: number
    incorrectAnswers: number
    timeRemaining: number
    isGameActive: boolean
    isGameOver: boolean
    gameStartTime: number | null
    currentAnswer: string
}

export interface GameConfig {
    gameDuration: number // in seconds
    pointsPerCorrectAnswer: number
    maxNumber: number
    operations: Array<'addition' | 'subtraction'>
}

export interface GameCallbacks {
    onScoreUpdate: (score: number) => void
    onTimeUpdate: (timeRemaining: number) => void
    onQuestionUpdate: (question: MathQuestion) => void
    onGameOver: (finalScore: number, stats: GameStats) => void
    onGameStart: () => void
    onScoreUpload?: (success: boolean) => void
}

export interface GameStats {
    totalQuestions: number
    correctAnswers: number
    incorrectAnswers: number
    accuracy: number
    averageTimePerQuestion: number
    finalScore: number
}
