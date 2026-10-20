// Mock for astro:middleware in test environment
export function defineMiddleware<T extends (...args: any[]) => any>(
    handler: T
): T {
    return handler
}
