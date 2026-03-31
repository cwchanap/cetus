import { describe, it, expect, vi } from 'vitest'
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
            for (const word of WORD_DATABASE.easy) {
                expect(typeof word).toBe('string')
            }
            for (const word of WORD_DATABASE.medium) {
                expect(typeof word).toBe('string')
            }
            for (const word of WORD_DATABASE.hard) {
                expect(typeof word).toBe('string')
            }
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

        it('should hit maxAttempts when shuffle keeps returning original (line 192 && right branch)', () => {
            // Mock Math.random so shuffleArray always produces identity permutation for 'ab'
            // Fisher-Yates for ['a','b']: i=1, j=Math.floor(0.5*2)=1, swap [1] with [1] → no change
            vi.spyOn(Math, 'random').mockReturnValue(0.5)
            const result = scrambleWord('ab')
            vi.restoreAllMocks()
            // After 50 attempts all returning 'ab', falls back to returning 'ab'
            expect(result).toBe('ab')
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

        it('should return 10 as default for unknown difficulty (line 256 default branch)', () => {
            // TypeScript type is 'easy'|'medium'|'hard' but test runtime with unknown value
            expect(getPointsForWord('unknown' as any)).toBe(10)
        })
    })
})
