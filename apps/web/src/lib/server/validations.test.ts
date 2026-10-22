import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { validateBody, validateQuery } from './validations'

// Shared stub for schemas that intentionally return no issues (empty array)
const schemaWithoutIssues = {
    safeParse: () => ({
        success: false as const,
        error: { issues: [] },
    }),
}

describe('server validation helpers', () => {
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
