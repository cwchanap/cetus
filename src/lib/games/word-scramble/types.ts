export interface WordChallenge {
    id: string
    originalWord: string
    scrambledWord: string
    difficulty: 'easy' | 'medium' | 'hard'
    points: number
    category?: string
}

export interface WordDatabase {
    easy: string[]
    medium: string[]
    hard: string[]
}
