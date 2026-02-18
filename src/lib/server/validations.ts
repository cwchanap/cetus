/**
 * Zod validation schemas for API endpoints
 */

import { z } from 'zod'
import { GameID } from '../games'

// Game ID enum values for Zod
const gameIdValues = Object.values(GameID) as [string, ...string[]]

/**
 * Score submission schema
 */
export const scoreSubmissionSchema = z.object({
    gameId: z.enum(gameIdValues, {
        message: 'Invalid game ID',
    }),
    score: z
        .number()
        .int()
        .min(0, { message: 'Score must be a non-negative integer' })
        .max(999_999_999, { message: 'Score exceeds maximum allowed value' }),
    gameData: z.record(z.string(), z.unknown()).optional(),
})

export type ScoreSubmissionInput = z.infer<typeof scoreSubmissionSchema>

/**
 * Profile update schema
 */
export const profileUpdateSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, { message: 'Name cannot be empty' })
            .max(100, { message: 'Name must be 100 characters or less' })
            .optional(),
        displayName: z.preprocess(
            val => {
                if (typeof val === 'string') {
                    const trimmed = val.trim()
                    return trimmed === '' ? null : trimmed
                }
                return val
            },
            z
                .string()
                .min(1, { message: 'Display name cannot be empty' })
                .max(100, {
                    message: 'Display name must be 100 characters or less',
                })
                .nullable()
                .optional()
        ),
        username: z.preprocess(
            val => {
                if (typeof val === 'string') {
                    const trimmed = val.trim().toLowerCase()
                    return trimmed === '' ? null : trimmed
                }
                return val
            },
            z
                .string()
                .min(3, { message: 'Username must be at least 3 characters' })
                .max(20, { message: 'Username must be 20 characters or less' })
                .regex(/^[a-z0-9_]+$/, {
                    message:
                        'Username must contain only lowercase letters, numbers, or underscores',
                })
                .nullable()
                .optional()
        ),
    })
    .refine(
        data =>
            data.name !== undefined ||
            data.displayName !== undefined ||
            data.username !== undefined,
        { message: 'At least one field must be provided' }
    )

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>

/**
 * Leaderboard query schema
 */
export const leaderboardQuerySchema = z.object({
    gameId: z.enum(gameIdValues, {
        message: 'Invalid game ID',
    }),
    limit: z
        .string()
        .transform(s => parseInt(s, 10))
        .pipe(z.number().int().min(1).max(100))
        .optional()
        .default(10),
})

export type LeaderboardQueryInput = z.infer<typeof leaderboardQuerySchema>

/**
 * Pagination query schema
 */
export const paginationQuerySchema = z.object({
    page: z
        .string()
        .transform(s => parseInt(s, 10))
        .pipe(z.number().int().min(1))
        .optional()
        .default(1),
    pageSize: z
        .string()
        .transform(s => parseInt(s, 10))
        .pipe(z.number().int().min(1).max(100))
        .optional()
        .default(10),
})

export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>

/**
 * Helper to validate and parse request body
 */
export async function validateBody<T>(
    request: Request,
    schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
    try {
        const text = await request.text()
        const body: unknown = JSON.parse(text)
        const result = schema.safeParse(body)

        if (!result.success) {
            const firstIssue = result.error.issues?.[0]
            return {
                success: false,
                error: firstIssue?.message || 'Validation failed',
            }
        }

        return { success: true, data: result.data }
    } catch {
        return { success: false, error: 'Invalid JSON body' }
    }
}

/**
 * Helper to validate URL search params
 */
export function validateQuery<T>(
    url: URL,
    schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
    const params = Object.fromEntries(url.searchParams.entries())
    const result = schema.safeParse(params)

    if (!result.success) {
        const firstIssue = result.error.issues?.[0]
        return {
            success: false,
            error: firstIssue?.message || 'Validation failed',
        }
    }

    return { success: true, data: result.data }
}
