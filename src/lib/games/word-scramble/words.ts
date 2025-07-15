import type { WordDatabase } from './types'

// Word database categorized by difficulty
export const WORD_DATABASE: WordDatabase = {
    easy: [
        // 3-4 letter words
        'cat',
        'dog',
        'sun',
        'moon',
        'star',
        'tree',
        'book',
        'door',
        'fire',
        'fish',
        'bird',
        'hand',
        'love',
        'time',
        'home',
        'food',
        'blue',
        'red',
        'big',
        'run',
        'walk',
        'sing',
        'play',
        'help',
        'good',
        'nice',
        'fast',
        'slow',
        'hot',
        'cold',
        'new',
        'old',
        'car',
        'bus',
        'key',
        'map',
        'hat',
        'cup',
        'pen',
        'box',
        'girl',
        'boy',
        'game',
        'ball',
        'cake',
        'milk',
        'rain',
        'snow',
    ],
    medium: [
        // 5-6 letter words
        'house',
        'water',
        'light',
        'world',
        'space',
        'music',
        'dance',
        'happy',
        'funny',
        'smart',
        'quick',
        'brave',
        'green',
        'white',
        'black',
        'brown',
        'plant',
        'flower',
        'river',
        'mountain',
        'forest',
        'beach',
        'ocean',
        'cloud',
        'magic',
        'dream',
        'story',
        'friend',
        'family',
        'school',
        'learn',
        'study',
        'write',
        'think',
        'create',
        'build',
        'travel',
        'explore',
        'wonder',
        'smile',
        'laugh',
        'strong',
        'gentle',
        'bright',
        'sweet',
        'fresh',
        'clean',
        'peace',
        'phone',
        'computer',
        'window',
        'garden',
        'bridge',
        'castle',
        'rocket',
        'planet',
    ],
    hard: [
        // 7+ letter words
        'adventure',
        'beautiful',
        'challenge',
        'discover',
        'elephant',
        'fantastic',
        'greatest',
        'happiness',
        'important',
        'journey',
        'knowledge',
        'language',
        'mountain',
        'notebook',
        'organize',
        'picture',
        'question',
        'rainbow',
        'science',
        'treasure',
        'universe',
        'victory',
        'wonderful',
        'excellent',
        'creative',
        'brilliant',
        'amazing',
        'perfect',
        'freedom',
        'harmony',
        'mystery',
        'enchanted',
        'powerful',
        'graceful',
        'magical',
        'legendary',
        'champion',
        'triumph',
        'courage',
        'wisdom',
        'splendid',
        'magnificent',
        'extraordinary',
        'imagination',
        'achievement',
        'spectacular',
        'incredible',
        'fantastic',
        'marvelous',
        'outstanding',
        'wonderful',
        'breathtaking',
    ],
}

/**
 * Scramble a word by randomly shuffling its letters
 */
export function scrambleWord(word: string): string {
    if (word.length <= 1) {
        return word
    }

    const letters = word.toLowerCase().split('')
    let scrambled: string
    let attempts = 0
    const maxAttempts = 50

    // Keep scrambling until we get a different arrangement
    // or hit max attempts to prevent infinite loops
    do {
        scrambled = shuffleArray([...letters]).join('')
        attempts++
    } while (scrambled === word.toLowerCase() && attempts < maxAttempts)

    return scrambled
}

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
}

/**
 * Get a random word from a specific difficulty level
 */
export function getRandomWord(difficulty: 'easy' | 'medium' | 'hard'): string {
    const words = WORD_DATABASE[difficulty]
    return words[Math.floor(Math.random() * words.length)]
}

/**
 * Get word difficulty based on length
 */
export function getWordDifficulty(word: string): 'easy' | 'medium' | 'hard' {
    const length = word.length
    if (length <= 4) {
        return 'easy'
    }
    if (length <= 6) {
        return 'medium'
    }
    return 'hard'
}

/**
 * Check if a word exists in our database
 */
export function isValidWord(word: string): boolean {
    const lowerWord = word.toLowerCase()
    return (
        WORD_DATABASE.easy.includes(lowerWord) ||
        WORD_DATABASE.medium.includes(lowerWord) ||
        WORD_DATABASE.hard.includes(lowerWord)
    )
}

/**
 * Get points for a word based on its difficulty
 */
export function getPointsForWord(
    difficulty: 'easy' | 'medium' | 'hard'
): number {
    switch (difficulty) {
        case 'easy':
            return 10
        case 'medium':
            return 20
        case 'hard':
            return 30
        default:
            return 10
    }
}
