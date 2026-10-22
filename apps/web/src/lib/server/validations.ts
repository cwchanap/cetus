/**
 * HTTP host adapters for the shared API request schemas.
 *
 * The Zod schemas and types themselves are portable and live in
 * `@cetus/shared/validations`; only the Request/URL parsing helpers stay
 * next to the web API routes.
 */

import type { z } from 'zod'

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
