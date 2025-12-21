/**
 * API utility functions for consistent response handling
 */

/**
 * Create a JSON response with proper headers
 */
export function jsonResponse<T>(data: T, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

/**
 * Create an error response
 */
export function errorResponse(message: string, status: number = 500): Response {
    return jsonResponse({ error: message }, status)
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse(
    message: string = 'Unauthorized'
): Response {
    return errorResponse(message, 401)
}

/**
 * Create a bad request response
 */
export function badRequestResponse(message: string = 'Bad request'): Response {
    return errorResponse(message, 400)
}

/**
 * Create a not found response
 */
export function notFoundResponse(message: string = 'Not found'): Response {
    return errorResponse(message, 404)
}

/**
 * Create a success response
 */
export function successResponse<T extends Record<string, unknown>>(
    data?: T
): Response {
    return jsonResponse({ ...data, success: true }, 200)
}
