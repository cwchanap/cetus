/**
 * Shared utility functions for all games
 */

/**
 * Generate a random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Generate a random float between min and max
 */
export function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min
}

/**
 * Pick a random element from an array
 */
export function randomElement<T>(array: T[]): T | undefined {
    if (array.length === 0) {
        return undefined
    }
    return array[Math.floor(Math.random() * array.length)]
}

/**
 * Shuffle an array in place using Fisher-Yates algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[array[i], array[j]] = [array[j], array[i]]
    }
    return array
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

/**
 * Linear interpolation between two values
 */
export function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * clamp(t, 0, 1)
}

/**
 * Calculate distance between two points
 */
export function distance(
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number {
    const dx = x2 - x1
    const dy = y2 - y1
    return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Check if two rectangles overlap (AABB collision)
 */
export function rectOverlap(
    rect1: { x: number; y: number; width: number; height: number },
    rect2: { x: number; y: number; width: number; height: number }
): boolean {
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    )
}

/**
 * Check if a point is inside a rectangle
 */
export function pointInRect(
    px: number,
    py: number,
    rect: { x: number; y: number; width: number; height: number }
): boolean {
    return (
        px >= rect.x &&
        px <= rect.x + rect.width &&
        py >= rect.y &&
        py <= rect.y + rect.height
    )
}

/**
 * Check if a point is inside a circle
 */
export function pointInCircle(
    px: number,
    py: number,
    cx: number,
    cy: number,
    radius: number
): boolean {
    return distance(px, py, cx, cy) <= radius
}

/**
 * Format time in seconds to MM:SS string
 */
export function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format a large number with commas
 */
export function formatNumber(num: number): string {
    return num.toLocaleString()
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => void>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
        timeoutId = setTimeout(() => fn(...args), delay)
    }
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => void>(
    fn: T,
    limit: number
): (...args: Parameters<T>) => void {
    let lastCall = 0

    return (...args: Parameters<T>) => {
        const now = Date.now()
        if (now - lastCall >= limit) {
            lastCall = now
            fn(...args)
        }
    }
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Create a 2D array filled with a value
 */
export function create2DArray<T>(
    rows: number,
    cols: number,
    initialValue: T | (() => T)
): T[][] {
    const valueFactory =
        typeof initialValue === 'function'
            ? (initialValue as () => T)
            : () => initialValue
    return Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => valueFactory())
    )
}

/**
 * Deep clone an object (simple version using JSON)
 */
export function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
}

/**
 * Ease in out cubic function for smooth animations
 */
export function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Ease out elastic function for bouncy animations
 */
export function easeOutElastic(t: number): number {
    const c4 = (2 * Math.PI) / 3
    return t === 0
        ? 0
        : t === 1
          ? 1
          : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}
