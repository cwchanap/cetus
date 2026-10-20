export const GRAVITY_FLIP_STAR_POINTS = 250

export interface GravityFlipScoreInput {
    distancePx: number
    starsCollected: number
}

export function calculateGravityFlipScore({
    distancePx,
    starsCollected,
}: GravityFlipScoreInput): number {
    const safeDistance = Number.isFinite(distancePx)
        ? Math.max(0, distancePx)
        : 0
    const safeStars = Number.isFinite(starsCollected)
        ? Math.max(0, Math.floor(starsCollected))
        : 0
    return (
        Math.floor(safeDistance / 50) * 10 +
        safeStars * GRAVITY_FLIP_STAR_POINTS
    )
}
