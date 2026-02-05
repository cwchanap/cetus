import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    randomInt,
    randomFloat,
    randomElement,
    shuffleArray,
    clamp,
    lerp,
    distance,
    rectOverlap,
    pointInRect,
    pointInCircle,
    formatTime,
    formatNumber,
    debounce,
    throttle,
    generateId,
    create2DArray,
    deepClone,
    easeInOutCubic,
    easeOutElastic,
} from './utils'

describe('randomInt', () => {
    it('should return integer within range', () => {
        for (let i = 0; i < 100; i++) {
            const result = randomInt(1, 10)
            expect(Number.isInteger(result)).toBe(true)
            expect(result).toBeGreaterThanOrEqual(1)
            expect(result).toBeLessThanOrEqual(10)
        }
    })

    it('should handle same min and max', () => {
        expect(randomInt(5, 5)).toBe(5)
    })
})

describe('randomFloat', () => {
    it('should return float within range', () => {
        for (let i = 0; i < 100; i++) {
            const result = randomFloat(0, 1)
            expect(result).toBeGreaterThanOrEqual(0)
            expect(result).toBeLessThanOrEqual(1)
        }
    })
})

describe('randomElement', () => {
    it('should return element from array', () => {
        const arr = [1, 2, 3, 4, 5]
        for (let i = 0; i < 50; i++) {
            const result = randomElement(arr)
            expect(arr).toContain(result)
        }
    })

    it('should return undefined for empty array', () => {
        expect(randomElement([])).toBeUndefined()
    })
})

describe('shuffleArray', () => {
    it('should shuffle array in place', () => {
        const arr = [1, 2, 3, 4, 5]
        const original = [...arr]
        shuffleArray(arr)

        // Same elements (compare sorted copies to avoid mutating original)
        expect([...arr].sort()).toEqual([...original].sort())
    })

    it('should return same array reference', () => {
        const arr = [1, 2, 3]
        expect(shuffleArray(arr)).toBe(arr)
    })
})

describe('clamp', () => {
    it('should clamp value below min', () => {
        expect(clamp(-5, 0, 10)).toBe(0)
    })

    it('should clamp value above max', () => {
        expect(clamp(15, 0, 10)).toBe(10)
    })

    it('should return value within range', () => {
        expect(clamp(5, 0, 10)).toBe(5)
    })
})

describe('lerp', () => {
    it('should interpolate at 0', () => {
        expect(lerp(0, 100, 0)).toBe(0)
    })

    it('should interpolate at 1', () => {
        expect(lerp(0, 100, 1)).toBe(100)
    })

    it('should interpolate at 0.5', () => {
        expect(lerp(0, 100, 0.5)).toBe(50)
    })

    it('should clamp t value', () => {
        expect(lerp(0, 100, 2)).toBe(100)
        expect(lerp(0, 100, -1)).toBe(0)
    })
})

describe('distance', () => {
    it('should calculate distance between points', () => {
        expect(distance(0, 0, 3, 4)).toBe(5)
        expect(distance(0, 0, 0, 0)).toBe(0)
    })
})

describe('rectOverlap', () => {
    it('should detect overlapping rectangles', () => {
        const rect1 = { x: 0, y: 0, width: 10, height: 10 }
        const rect2 = { x: 5, y: 5, width: 10, height: 10 }

        expect(rectOverlap(rect1, rect2)).toBe(true)
    })

    it('should detect non-overlapping rectangles', () => {
        const rect1 = { x: 0, y: 0, width: 10, height: 10 }
        const rect2 = { x: 20, y: 20, width: 10, height: 10 }

        expect(rectOverlap(rect1, rect2)).toBe(false)
    })
})

describe('pointInRect', () => {
    it('should detect point inside rectangle', () => {
        const rect = { x: 0, y: 0, width: 10, height: 10 }

        expect(pointInRect(5, 5, rect)).toBe(true)
    })

    it('should detect point outside rectangle', () => {
        const rect = { x: 0, y: 0, width: 10, height: 10 }

        expect(pointInRect(15, 15, rect)).toBe(false)
    })
})

describe('pointInCircle', () => {
    it('should detect point inside circle', () => {
        expect(pointInCircle(5, 5, 5, 5, 10)).toBe(true)
    })

    it('should detect point outside circle', () => {
        expect(pointInCircle(20, 20, 5, 5, 10)).toBe(false)
    })
})

describe('formatTime', () => {
    it('should format seconds to M:SS or H:MM:SS', () => {
        expect(formatTime(65)).toBe('1:05')
        expect(formatTime(0)).toBe('0:00')
        expect(formatTime(3600)).toBe('1:00:00')
        expect(formatTime(3661)).toBe('1:01:01')
    })

    it('should handle negative values', () => {
        expect(formatTime(-65)).toBe('-1:05')
        expect(formatTime(-1)).toBe('-0:01')
    })
})

describe('formatNumber', () => {
    it('should format numbers with commas', () => {
        expect(formatNumber(1000)).toMatch(/1,?000/)
        expect(formatNumber(1000000)).toMatch(/1,?000,?000/)
    })
})

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('should debounce function calls', () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 100)

        debounced()
        debounced()
        debounced()

        expect(fn).not.toHaveBeenCalled()

        vi.advanceTimersByTime(100)

        expect(fn).toHaveBeenCalledTimes(1)
    })
})

describe('throttle', () => {
    it('should throttle function calls', () => {
        vi.useFakeTimers()
        const fn = vi.fn()
        const throttled = throttle(fn, 100)

        throttled()
        expect(fn).toHaveBeenCalledTimes(1)

        throttled()
        throttled()
        expect(fn).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(100)
        throttled()
        expect(fn).toHaveBeenCalledTimes(2)

        vi.useRealTimers()
    })
})

describe('generateId', () => {
    it('should generate unique IDs', () => {
        const ids = new Set()
        for (let i = 0; i < 100; i++) {
            ids.add(generateId())
        }
        expect(ids.size).toBe(100)
    })
})

describe('create2DArray', () => {
    it('should create 2D array with initial value', () => {
        const arr = create2DArray(3, 4, 0)

        expect(arr).toHaveLength(3)
        expect(arr[0]).toHaveLength(4)
        expect(arr[1][2]).toBe(0)
    })

    it('should create unique objects for each cell when using a factory', () => {
        const arr = create2DArray(2, 2, () => ({ value: 1 }))

        expect(arr[0][0]).not.toBe(arr[0][1])
        expect(arr[0][0]).not.toBe(arr[1][0])
        expect(arr[0][1]).not.toBe(arr[1][1])
    })
})

describe('deepClone', () => {
    it('should deep clone object', () => {
        const obj = { a: 1, b: { c: 2 } }
        const clone = deepClone(obj)

        expect(clone).toEqual(obj)
        expect(clone).not.toBe(obj)
        expect(clone.b).not.toBe(obj.b)
    })
})

describe('easeInOutCubic', () => {
    it('should return 0 at t=0', () => {
        expect(easeInOutCubic(0)).toBe(0)
    })

    it('should return 1 at t=1', () => {
        expect(easeInOutCubic(1)).toBe(1)
    })

    it('should return 0.5 at t=0.5', () => {
        expect(easeInOutCubic(0.5)).toBe(0.5)
    })
})

describe('easeOutElastic', () => {
    it('should return 0 at t=0', () => {
        expect(easeOutElastic(0)).toBe(0)
    })

    it('should return 1 at t=1', () => {
        expect(easeOutElastic(1)).toBe(1)
    })
})
