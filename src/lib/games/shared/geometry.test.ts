import { describe, it, expect } from 'vitest'
import {
    distance,
    clamp,
    lerp,
    pointInRect,
    pointInCircle,
    rectOverlap,
    circleOverlap,
    quadraticBezierPoint,
    distanceToSegment,
    normalizeAngle,
    angleDiff,
    segmentIntersectsCircle,
} from './geometry'

describe('distance', () => {
    it('computes the Euclidean distance', () => {
        expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    })

    it('is zero for identical points', () => {
        expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0)
    })
})

describe('clamp', () => {
    it('clamps below min', () => {
        expect(clamp(-5, 0, 10)).toBe(0)
    })
    it('clamps above max', () => {
        expect(clamp(15, 0, 10)).toBe(10)
    })
    it('leaves in-range values untouched', () => {
        expect(clamp(5, 0, 10)).toBe(5)
    })
})

describe('lerp', () => {
    it('interpolates endpoints', () => {
        expect(lerp(0, 100, 0)).toBe(0)
        expect(lerp(0, 100, 1)).toBe(100)
        expect(lerp(0, 100, 0.5)).toBe(50)
    })
    it('clamps t', () => {
        expect(lerp(0, 100, 2)).toBe(100)
        expect(lerp(0, 100, -1)).toBe(0)
    })
})

describe('pointInRect', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 }
    it('detects a point inside', () => {
        expect(pointInRect({ x: 5, y: 5 }, rect)).toBe(true)
    })
    it('includes the boundary', () => {
        expect(pointInRect({ x: 0, y: 0 }, rect)).toBe(true)
        expect(pointInRect({ x: 10, y: 10 }, rect)).toBe(true)
    })
    it('rejects a point outside', () => {
        expect(pointInRect({ x: 15, y: 15 }, rect)).toBe(false)
    })
})

describe('pointInCircle', () => {
    it('detects a point inside', () => {
        expect(pointInCircle({ x: 3, y: 4 }, { x: 0, y: 0 }, 10)).toBe(true)
    })
    it('includes the boundary', () => {
        expect(pointInCircle({ x: 10, y: 0 }, { x: 0, y: 0 }, 10)).toBe(true)
    })
    it('rejects a point outside', () => {
        expect(pointInCircle({ x: 20, y: 20 }, { x: 0, y: 0 }, 10)).toBe(false)
    })
})

describe('rectOverlap', () => {
    it('detects overlapping rectangles', () => {
        expect(
            rectOverlap(
                { x: 0, y: 0, width: 10, height: 10 },
                { x: 5, y: 5, width: 10, height: 10 }
            )
        ).toBe(true)
    })
    it('rejects non-overlapping rectangles', () => {
        expect(
            rectOverlap(
                { x: 0, y: 0, width: 10, height: 10 },
                { x: 20, y: 20, width: 10, height: 10 }
            )
        ).toBe(false)
    })
    it('treats touching edges as not overlapping (exclusive)', () => {
        expect(
            rectOverlap(
                { x: 0, y: 0, width: 10, height: 10 },
                { x: 10, y: 0, width: 10, height: 10 }
            )
        ).toBe(false)
    })
})

describe('circleOverlap', () => {
    it('detects overlapping circles', () => {
        expect(circleOverlap({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5)).toBe(true)
    })
    it('rejects non-overlapping circles', () => {
        expect(circleOverlap({ x: 0, y: 0 }, 5, { x: 20, y: 0 }, 5)).toBe(false)
    })
    it('treats touching circles as overlapping', () => {
        expect(circleOverlap({ x: 0, y: 0 }, 5, { x: 10, y: 0 }, 5)).toBe(true)
    })
})

describe('quadraticBezierPoint', () => {
    it('returns p0 at t=0', () => {
        const p0 = { x: 0, y: 0 }
        expect(
            quadraticBezierPoint(0, p0, { x: 5, y: 5 }, { x: 10, y: 0 })
        ).toEqual(p0)
    })
    it('returns p2 at t=1', () => {
        const p2 = { x: 10, y: 0 }
        expect(
            quadraticBezierPoint(1, { x: 0, y: 0 }, { x: 5, y: 5 }, p2)
        ).toEqual(p2)
    })
    it('returns the midpoint at t=0.5', () => {
        const result = quadraticBezierPoint(
            0.5,
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 0, y: 0 }
        )
        expect(result).toEqual({ x: 5, y: 0 })
    })
})

describe('distanceToSegment', () => {
    it('returns zero distance when the point is on the segment', () => {
        const result = distanceToSegment(
            { x: 5, y: 0 },
            { x: 0, y: 0 },
            { x: 10, y: 0 }
        )
        expect(result.distance).toBe(0)
        expect(result.param).toBe(0.5)
    })
    it('clamps param past the segment end', () => {
        const result = distanceToSegment(
            { x: 20, y: 0 },
            { x: 0, y: 0 },
            { x: 10, y: 0 }
        )
        expect(result.param).toBe(1)
        expect(result.distance).toBe(10)
    })
    it('clamps param before the segment start', () => {
        const result = distanceToSegment(
            { x: -5, y: 0 },
            { x: 0, y: 0 },
            { x: 10, y: 0 }
        )
        expect(result.param).toBe(0)
        expect(result.distance).toBe(5)
    })
    it('handles a degenerate (zero-length) segment', () => {
        const result = distanceToSegment(
            { x: 3, y: 4 },
            { x: 0, y: 0 },
            { x: 0, y: 0 }
        )
        expect(result.distance).toBe(5)
        expect(result.param).toBe(0)
    })
})

describe('normalizeAngle', () => {
    it('leaves angles in range untouched', () => {
        expect(normalizeAngle(0)).toBe(0)
        expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI)
        expect(normalizeAngle(-Math.PI)).toBeCloseTo(-Math.PI)
    })
    it('wraps large angles into [-PI, PI]', () => {
        const wrapped = normalizeAngle(Math.PI * 3)
        expect(wrapped).toBeLessThanOrEqual(Math.PI)
        expect(wrapped).toBeGreaterThanOrEqual(-Math.PI)
        expect(wrapped).toBeCloseTo(Math.PI)
    })
    it('wraps very negative angles', () => {
        const wrapped = normalizeAngle(-Math.PI * 3)
        expect(wrapped).toBeGreaterThanOrEqual(-Math.PI)
        expect(wrapped).toBeCloseTo(-Math.PI)
    })
})

describe('angleDiff', () => {
    it('returns the absolute normalized difference', () => {
        expect(angleDiff(0, 0)).toBe(0)
        expect(angleDiff(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2)
    })
    it('is symmetric', () => {
        expect(angleDiff(1, 4)).toBeCloseTo(angleDiff(4, 1))
    })
    it('returns the smallest signed distance around the circle', () => {
        expect(angleDiff(Math.PI * 1.9, -Math.PI * 1.9)).toBeCloseTo(
            2 * Math.PI - Math.PI * 1.8
        )
    })
})

describe('segmentIntersectsCircle', () => {
    it('returns true when the segment crosses the circle', () => {
        expect(
            segmentIntersectsCircle(
                { x: -10, y: 0 },
                { x: 10, y: 0 },
                { x: 0, y: 0 },
                5
            )
        ).toBe(true)
    })
    it('returns false when the segment misses the circle', () => {
        expect(
            segmentIntersectsCircle(
                { x: -10, y: 20 },
                { x: 10, y: 20 },
                { x: 0, y: 0 },
                5
            )
        ).toBe(false)
    })
    it('returns true when the segment endpoint touches the circle', () => {
        expect(
            segmentIntersectsCircle(
                { x: 5, y: 0 },
                { x: 20, y: 0 },
                { x: 0, y: 0 },
                5
            )
        ).toBe(true)
    })
})
