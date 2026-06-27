import type { BeamColor } from './types'

export const RING_RADIUS_BASE = 0.8
export const RING_RADIUS_STEP = 0.55

export interface WorldPoint {
    x: number
    y: number
}

export interface GeoTarget {
    id: string
    ring: number
    currentAngle: number
    color: BeamColor
    locked: boolean
}

export interface GeoObstacle {
    ring: number
    currentAngle: number
    radius: number
}

export function ringRadius(ring: number): number {
    return RING_RADIUS_BASE + ring * RING_RADIUS_STEP
}

export function polarToWorld(ring: number, angleDeg: number): WorldPoint {
    const r = ringRadius(ring)
    const rad = (angleDeg * Math.PI) / 180
    return { x: r * Math.sin(rad), y: -r * Math.cos(rad) }
}

export function normalizeAngle(angle: number): number {
    return ((angle % 360) + 360) % 360
}

export function angleDiff(a: number, b: number): number {
    const d = Math.abs(normalizeAngle(a) - normalizeAngle(b)) % 360
    return d > 180 ? 360 - d : d
}

export function bearing(from: WorldPoint, to: WorldPoint): number {
    const dx = to.x - from.x
    const dy = to.y - from.y
    return normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI)
}

export function segmentIntersectsCircle(
    p1: WorldPoint,
    p2: WorldPoint,
    center: WorldPoint,
    radius: number
): boolean {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const l2 = dx * dx + dy * dy
    let t = 0
    if (l2 > 0) {
        t = ((center.x - p1.x) * dx + (center.y - p1.y) * dy) / l2
        t = Math.max(0, Math.min(1, t))
    }
    const closestX = p1.x + t * dx
    const closestY = p1.y + t * dy
    const ddx = center.x - closestX
    const ddy = center.y - closestY
    return ddx * ddx + ddy * ddy <= radius * radius
}

export function findLockableTarget(
    satWorld: WorldPoint,
    satColor: BeamColor,
    aimAngle: number,
    targets: GeoTarget[],
    obstacles: GeoObstacle[],
    snapThreshold: number
): GeoTarget | null {
    let best: GeoTarget | null = null
    let bestDiff = Infinity
    for (const target of targets) {
        if (target.locked || target.color !== satColor) {
            continue
        }
        const targetWorld = polarToWorld(target.ring, target.currentAngle)
        const diff = angleDiff(bearing(satWorld, targetWorld), aimAngle)
        if (diff > snapThreshold || diff >= bestDiff) {
            continue
        }
        const blocked = obstacles.some(o =>
            segmentIntersectsCircle(
                satWorld,
                targetWorld,
                polarToWorld(o.ring, o.currentAngle),
                o.radius
            )
        )
        if (blocked) {
            continue
        }
        best = target
        bestDiff = diff
    }
    return best
}
