/**
 * Shared geometry and collision primitives for canvas games.
 */

export interface Point {
    x: number
    y: number
}

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

/** Euclidean distance between two points. */
export function distance(a: Point, b: Point): number {
    return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Clamp a value to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

/** Linear interpolation. */
export function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * clamp(t, 0, 1)
}

/**
 * Check if a point is inside a rectangle.
 *
 * Boundary semantics: **inclusive** — a point lying exactly on any edge
 * or corner of the rect is considered inside (uses `>=` and `<=`).
 * This differs from {@link rectOverlap}, which is exclusive.
 */
export function pointInRect(p: Point, rect: Rect): boolean {
    return (
        p.x >= rect.x &&
        p.x <= rect.x + rect.width &&
        p.y >= rect.y &&
        p.y <= rect.y + rect.height
    )
}

/** Check if a point is inside a circle. */
export function pointInCircle(
    p: Point,
    center: Point,
    radius: number
): boolean {
    return distance(p, center) <= radius
}

/**
 * Check if two rectangles overlap (AABB).
 *
 * Boundary semantics: **exclusive** — two rects that share only an edge
 * (touching but not penetrating) are NOT considered overlapping (uses
 * `<` and `>`). This differs from {@link pointInRect}, which is inclusive.
 */
export function rectOverlap(a: Rect, b: Rect): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    )
}

/** Check if two circles overlap. */
export function circleOverlap(
    a: Point,
    ra: number,
    b: Point,
    rb: number
): boolean {
    return distance(a, b) <= ra + rb
}

/** Quadratic Bezier point at parameter t. */
export function quadraticBezierPoint(
    t: number,
    p0: Point,
    p1: Point,
    p2: Point
): Point {
    const mt = 1 - t
    return {
        x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
        y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    }
}

/** Distance from a point to a line segment. Returns distance and projection param. */
export function distanceToSegment(
    p: Point,
    a: Point,
    b: Point
): { distance: number; param: number } {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) {
        return { distance: distance(p, a), param: 0 }
    }
    let param = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
    param = clamp(param, 0, 1)
    const proj: Point = { x: a.x + param * dx, y: a.y + param * dy }
    return { distance: distance(p, proj), param }
}

/** Normalize an angle to [-PI, PI]. */
export function normalizeAngle(angle: number): number {
    while (angle > Math.PI) {
        angle -= 2 * Math.PI
    }
    while (angle < -Math.PI) {
        angle += 2 * Math.PI
    }
    return angle
}

/** Absolute difference between two angles. */
export function angleDiff(a: number, b: number): number {
    return Math.abs(normalizeAngle(a - b))
}

/** Check if a line segment intersects a circle. */
export function segmentIntersectsCircle(
    a: Point,
    b: Point,
    center: Point,
    radius: number
): boolean {
    return distanceToSegment(center, a, b).distance <= radius
}
