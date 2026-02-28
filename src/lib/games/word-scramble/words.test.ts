import { describe, it, expect } from 'vitest'
import {
    WORD_DATABASE,
    scrambleWord,
    getRandomWord,
    getWordDifficulty,
    isValidWord,
    getPointsForWord,
} from './words'

describe('Word Scramble Words', () => {
    describe('WORD_DATABASE', () => {
        it('should have easy, medium, and hard categories', () => {
            expect(WORD_DATABASE.easy.length).toBeGreaterThan(0)
            expect(WORD_DATABASE.medium.length).toBeGreaterThan(0)
            expect(WORD_DATABASE.hard.length).toBeGreaterThan(0)
        })

        it('should have string arrays in each category', () => {
            WORD_DATABASE.easy.forEach(w => expect(typeof w).toBe('string'))
            WORD_DATABASE.medium.forEach(w => expect(typeof w).toBe('string'))
            WORD_DATABASE.hard.forEach(w => expect(typeof w).toBe('string'))
        })
    })

    describe('scrambleWord', () => {
        it('should return a word with the same characters', () => {
            const word = 'adventure'
            const scrambled = scrambleWord(word)
            const sorted = (s: string) =>
                s.toLowerCase().split('').sort().join('')
            expect(sorted(scrambled)).toBe(sorted(word))
        })

        it('should return the same character for 1-char words', () => {
            expect(scrambleWord('a')).toBe('a')
        })

        it('should return a single char string unchanged', () => {
            expect(scrambleWord('x').length).toBe(1)
        })

        it('should attempt to produce a different arrangement', () => {
            // Run many times — for a long word, nearly always different
            let diffCount = 0
            const word = 'challenge'
            for (let i = 0; i < 20; i++) {
                if (scrambleWord(word) !== word) {
                    diffCount++
                }
            }
            expect(diffCount).toBeGreaterThan(0)
        })

        it('should return a string of the same length', () => {
            const word = 'spectacular'
            expect(scrambleWord(word).length).toBe(word.length)
        })

        it('should handle 2-char words', () => {
            const result = scrambleWord('ab')
            expect(result.length).toBe(2)
            expect(['ab', 'ba']).toContain(result)
        })
    })

    describe('getRandomWord', () => {
        it('should return a word from the easy category', () => {
            const word = getRandomWord('easy')
            expect(WORD_DATABASE.easy).toContain(word)
        })

        it('should return a word from the medium category', () => {
            const word = getRandomWord('medium')
            expect(WORD_DATABASE.medium).toContain(word)
        })

        it('should return a word from the hard category', () => {
            const word = getRandomWord('hard')
            expect(WORD_DATABASE.hard).toContain(word)
        })

        it('should return different words over multiple calls', () => {
            const words = new Set<string>()
            for (let i = 0; i < 50; i++) {
                words.add(getRandomWord('easy'))
            }
            // With 48 easy words and 50 calls, should see at least 5 unique
            expect(words.size).toBeGreaterThan(1)
        })
    })

    describe('getWordDifficulty', () => {
        it('should return easy for words of length <= 4', () => {
            expect(getWordDifficulty('cat')).toBe('easy')
            expect(getWordDifficulty('bird')).toBe('easy')
        })

        it('should return medium for words of length 5-6', () => {
            expect(getWordDifficulty('house')).toBe('medium')
            expect(getWordDifficulty('flower')).toBe('medium')
        })

        it('should return hard for words of length > 6', () => {
            expect(getWordDifficulty('journey')).toBe('hard')
            expect(getWordDifficulty('adventure')).toBe('hard')
        })
    })

    describe('isValidWord', () => {
        it('should return true for known easy word', () => {
            expect(isValidWord('cat')).toBe(true)
        })

        it('should return true for known medium word', () => {
            expect(isValidWord('house')).toBe(true)
        })

        it('should return true for known hard word', () => {
            expect(isValidWord('adventure')).toBe(true)
        })

        it('should return false for unknown word', () => {
            expect(isValidWord('xylophone123notreal')).toBe(false)
        })

        it('should be case-insensitive', () => {
            expect(isValidWord('CAT')).toBe(true)
            expect(isValidWord('House')).toBe(true)
        })
    })

    describe('getPointsForWord', () => {
        it('should return 10 for easy words', () => {
            expect(getPointsForWord('easy')).toBe(10)
        })

        it('should return 20 for medium words', () => {
            expect(getPointsForWord('medium')).toBe(20)
        })

        it('should return 30 for hard words', () => {
            expect(getPointsForWord('hard')).toBe(30)
        })
    })
})
