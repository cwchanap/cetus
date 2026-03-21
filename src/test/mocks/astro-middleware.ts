// Mock for astro:middleware in test environment
export function defineMiddleware(handler: (...args: unknown[]) => unknown) {
    return handler
}
