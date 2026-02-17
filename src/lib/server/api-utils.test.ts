import { describe, it, expect } from 'vitest'
import {
    jsonResponse,
    errorResponse,
    unauthorizedResponse,
    badRequestResponse,
    notFoundResponse,
    successResponse,
} from '@/lib/server/api-utils'

describe('api-utils', () => {
    it('jsonResponse returns JSON response with default status', async () => {
        const response = jsonResponse({ hello: 'world' })

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toContain(
            'application/json'
        )
        await expect(response.json()).resolves.toEqual({ hello: 'world' })
    })

    it('jsonResponse supports custom status', () => {
        const response = jsonResponse({ ok: true }, 201)
        expect(response.status).toBe(201)
    })

    it('errorResponse returns expected shape and status', async () => {
        const response = errorResponse('boom', 418)

        expect(response.status).toBe(418)
        await expect(response.json()).resolves.toEqual({ error: 'boom' })
    })

    it('unauthorizedResponse uses default message and status', async () => {
        const response = unauthorizedResponse()

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toEqual({
            error: 'Unauthorized',
        })
    })

    it('badRequestResponse and notFoundResponse use defaults', async () => {
        const bad = badRequestResponse()
        const notFound = notFoundResponse()

        expect(bad.status).toBe(400)
        expect(notFound.status).toBe(404)
        await expect(bad.json()).resolves.toEqual({ error: 'Bad request' })
        await expect(notFound.json()).resolves.toEqual({ error: 'Not found' })
    })

    it('successResponse merges data with success flag', async () => {
        const withData = successResponse({ count: 2, feature: 'x' })
        const noData = successResponse()

        expect(withData.status).toBe(200)
        expect(noData.status).toBe(200)
        await expect(withData.json()).resolves.toEqual({
            success: true,
            count: 2,
            feature: 'x',
        })
        await expect(noData.json()).resolves.toEqual({ success: true })
    })
})
