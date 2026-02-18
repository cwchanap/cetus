import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
    scoreSubmissionSchema,
    profileUpdateSchema,
    leaderboardQuerySchema,
    paginationQuerySchema,
    validateBody,
    validateQuery,
} from '@/lib/server/validations'
import { GameID } from '@/lib/games'

// Shared stub for schemas that intentionally return no issues (empty array)
const schemaWithoutIssues = {
    safeParse: () => ({
        success: false as const,
        error: { issues: [] },
    }),
}

describe('server validations', () => {
    describe('scoreSubmissionSchema', () => {
        it('accepts valid payload', () => {
            const result = scoreSubmissionSchema.safeParse({
                gameId: GameID.TETRIS,
                score: 123,
                gameData: { level: 2 },
            })

            expect(result.success).toBe(true)
        })

        it('rejects invalid game id and negative score', () => {
            const invalidGame = scoreSubmissionSchema.safeParse({
                gameId: 'unknown',
                score: 10,
            })

            const invalidScore = scoreSubmissionSchema.safeParse({
                gameId: GameID.TETRIS,
                score: -1,
            })

            expect(invalidGame.success).toBe(false)
            expect(invalidScore.success).toBe(false)
        })

        it('returns correct error message for invalid game id', () => {
            const result = scoreSubmissionSchema.safeParse({
                gameId: 'unknown',
                score: 10,
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.issues[0].message).toBe('Invalid game ID')
            }
        })

        it('rejects float scores', () => {
            const result = scoreSubmissionSchema.safeParse({
                gameId: GameID.TETRIS,
                score: 99.5,
            })

            expect(result.success).toBe(false)
        })

        it('rejects score exceeding maximum allowed value', () => {
            const tooHigh = scoreSubmissionSchema.safeParse({
                gameId: GameID.TETRIS,
                score: 1_000_000_000,
            })

            expect(tooHigh.success).toBe(false)
        })

        it('accepts score at maximum boundary', () => {
            const atMax = scoreSubmissionSchema.safeParse({
                gameId: GameID.TETRIS,
                score: 999_999_999,
            })

            expect(atMax.success).toBe(true)
        })

        it('accepts score at minimum boundary', () => {
            const atMin = scoreSubmissionSchema.safeParse({
                gameId: GameID.TETRIS,
                score: 0,
            })

            expect(atMin.success).toBe(true)
        })
    })

    describe('profileUpdateSchema', () => {
        it('normalizes whitespace and case', () => {
            const result = profileUpdateSchema.safeParse({
                name: '  Alice  ',
                displayName: '  Pilot  ',
                username: '  Neo_User  ',
            })

            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toEqual({
                    name: 'Alice',
                    displayName: 'Pilot',
                    username: 'neo_user',
                })
            }
        })

        it('maps empty displayName and username to null', () => {
            const result = profileUpdateSchema.safeParse({
                displayName: '   ',
                username: '   ',
            })

            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.displayName).toBeNull()
                expect(result.data.username).toBeNull()
            }
        })

        it('requires at least one field and validates username characters', () => {
            const empty = profileUpdateSchema.safeParse({})
            const badUsername = profileUpdateSchema.safeParse({
                username: 'not-valid!user',
            })

            expect(empty.success).toBe(false)
            expect(badUsername.success).toBe(false)
        })

        it('returns correct error message for invalid username characters', () => {
            const result = profileUpdateSchema.safeParse({
                username: 'not-valid!user',
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.issues[0].message).toBe(
                    'Username must contain only lowercase letters, numbers, or underscores'
                )
            }
        })
    })

    describe('leaderboardQuerySchema', () => {
        it('applies default limit and parses numeric limit', () => {
            const withDefault = leaderboardQuerySchema.safeParse({
                gameId: GameID.TETRIS,
            })
            const withLimit = leaderboardQuerySchema.safeParse({
                gameId: GameID.TETRIS,
                limit: '25',
            })

            expect(withDefault.success).toBe(true)
            expect(withLimit.success).toBe(true)
            if (withDefault.success) {
                expect(withDefault.data.limit).toBe(10)
            }
            if (withLimit.success) {
                expect(withLimit.data.limit).toBe(25)
            }
        })

        it('rejects invalid limit bounds', () => {
            const tooLow = leaderboardQuerySchema.safeParse({
                gameId: GameID.TETRIS,
                limit: '0',
            })
            const tooHigh = leaderboardQuerySchema.safeParse({
                gameId: GameID.TETRIS,
                limit: '101',
            })

            expect(tooLow.success).toBe(false)
            expect(tooHigh.success).toBe(false)
        })
    })

    describe('paginationQuerySchema', () => {
        it('uses defaults and transforms values to numbers', () => {
            const defaults = paginationQuerySchema.safeParse({})
            const provided = paginationQuerySchema.safeParse({
                page: '3',
                pageSize: '20',
            })

            expect(defaults.success).toBe(true)
            expect(provided.success).toBe(true)
            if (defaults.success) {
                expect(defaults.data).toEqual({ page: 1, pageSize: 10 })
            }
            if (provided.success) {
                expect(provided.data).toEqual({ page: 3, pageSize: 20 })
            }
        })

        it('rejects invalid page and pageSize', () => {
            const badPage = paginationQuerySchema.safeParse({ page: '0' })
            const badSize = paginationQuerySchema.safeParse({ pageSize: '999' })

            expect(badPage.success).toBe(false)
            expect(badSize.success).toBe(false)
        })
    })

    describe('validateBody', () => {
        const schema = z.object({
            name: z.string().min(2, { error: 'Too short' }),
        })

        it('returns parsed data for valid JSON body', async () => {
            const request = new Request('http://localhost/test', {
                method: 'POST',
                body: JSON.stringify({ name: 'Ada' }),
            })

            const result = await validateBody(request, schema)

            expect(result).toEqual({ success: true, data: { name: 'Ada' } })
        })

        it('returns first validation error for invalid body', async () => {
            const request = new Request('http://localhost/test', {
                method: 'POST',
                body: JSON.stringify({ name: 'A' }),
            })

            const result = await validateBody(request, schema)

            expect(result).toEqual({ success: false, error: 'Too short' })
        })

        it('returns invalid JSON message when parsing fails', async () => {
            const request = new Request('http://localhost/test', {
                method: 'POST',
                body: '{ invalid json',
            })

            const result = await validateBody(request, schema)

            expect(result).toEqual({
                success: false,
                error: 'Invalid JSON body',
            })
        })

        it('falls back to generic validation message when issue message is missing', async () => {
            const request = new Request('http://localhost/test', {
                method: 'POST',
                body: JSON.stringify({ anything: true }),
            })

            const result = await validateBody(
                request,
                schemaWithoutIssues as any
            )

            expect(result).toEqual({
                success: false,
                error: 'Validation failed',
            })
        })
    })

    describe('validateQuery', () => {
        const schema = z.object({
            count: z
                .string()
                .transform(v => parseInt(v, 10))
                .pipe(z.number().int().min(1, { error: 'count must be >= 1' })),
        })

        it('returns parsed data for valid query', () => {
            const url = new URL('http://localhost/test?count=3')

            const result = validateQuery(url, schema)

            expect(result).toEqual({ success: true, data: { count: 3 } })
        })

        it('returns first query validation error', () => {
            const url = new URL('http://localhost/test?count=0')

            const result = validateQuery(url, schema)

            expect(result).toEqual({
                success: false,
                error: 'count must be >= 1',
            })
        })

        it('falls back to generic query validation message when issue is missing', () => {
            const url = new URL('http://localhost/test?count=3')
            const result = validateQuery(url, schemaWithoutIssues as any)

            expect(result).toEqual({
                success: false,
                error: 'Validation failed',
            })
        })
    })
})
