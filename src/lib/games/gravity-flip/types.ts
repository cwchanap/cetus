import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

export type GravityDirection = 'down' | 'up'
export type GravityFlipOutcome = 'playing' | 'collision' | 'survived'
export type GravityFlipHazardKind =
    | 'floor-spike'
    | 'ceiling-spike'
    | 'floor-gap'
    | 'ceiling-gap'
    | 'mover'

export type GravityFlipHazardDescriptor =
    | {
          shape: 'spike' | 'gap'
          surface: 'floor' | 'ceiling'
          hasStar: boolean
      }
    | {
          shape: 'mover'
          hasStar: false
      }

export const GRAVITY_FLIP_HAZARD_CATALOG: Readonly<
    Record<GravityFlipHazardKind, GravityFlipHazardDescriptor>
> = {
    'floor-spike': { shape: 'spike', surface: 'floor', hasStar: true },
    'ceiling-spike': { shape: 'spike', surface: 'ceiling', hasStar: true },
    'floor-gap': { shape: 'gap', surface: 'floor', hasStar: true },
    'ceiling-gap': { shape: 'gap', surface: 'ceiling', hasStar: true },
    mover: { shape: 'mover', hasStar: false },
}

export const GRAVITY_FLIP_RULES = {
    duration: 60,
    canvasWidth: 800,
    canvasHeight: 320,
    corridorInset: 36,
    playerX: 150,
    playerSize: 28,
    gravityAcceleration: 1800,
    maxVerticalSpeed: 700,
    maxPhysicsStep: 1 / 120,
    initialWorldSpeed: 220,
    finalWorldSpeed: 360,
    initialChallengeSpacing: 520,
    finalChallengeSpacing: 400,
    moverUnlockSeconds: 15,
    spawnOffsetX: 80,
    spikeWidth: 52,
    spikeHeight: 34,
    gapWidth: 90,
    gapHeight: 18,
    gapRailTolerance: 0.5,
    moverSize: 40,
    moverVerticalSpeed: 180,
    moverRailClearance: 28,
    starRadius: 10,
} as const

export interface GravityFlipConfig extends BaseGameConfig {
    canvasWidth: number
    canvasHeight: number
    corridorInset: number
    playerX: number
    playerSize: number
    gravityAcceleration: number
    maxVerticalSpeed: number
    maxPhysicsStep: number
    initialWorldSpeed: number
    finalWorldSpeed: number
    initialChallengeSpacing: number
    finalChallengeSpacing: number
    moverUnlockSeconds: number
    spawnOffsetX: number
    spikeWidth: number
    spikeHeight: number
    gapWidth: number
    gapHeight: number
    gapRailTolerance: number
    moverSize: number
    moverVerticalSpeed: number
    moverRailClearance: number
    starRadius: number
    rng: () => number
}

export function createGravityFlipConfig(
    overrides: Partial<GravityFlipConfig> = {}
): GravityFlipConfig {
    return {
        ...GRAVITY_FLIP_RULES,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        rng: Math.random,
        ...overrides,
    }
}

export interface GravityFlipPlayer {
    x: number
    y: number
    velocityY: number
    size: number
}

export interface GravityFlipHazard {
    id: string
    kind: GravityFlipHazardKind
    x: number
    y: number
    width: number
    height: number
    verticalVelocity: number
}

export interface GravityFlipStar {
    id: string
    x: number
    y: number
    radius: number
}

export interface GravityFlipState extends BaseGameState {
    outcome: GravityFlipOutcome
    gravity: GravityDirection
    player: GravityFlipPlayer
    hazards: GravityFlipHazard[]
    stars: GravityFlipStar[]
    distance: number
    starsCollected: number
    flips: number
    worldSpeed: number
}

export interface GravityFlipStats extends BaseGameStats {
    outcome: GravityFlipOutcome
    distance: number
    starsCollected: number
    flips: number
}

export interface GravityFlipGameData {
    distance: number
    starsCollected: number
    flips: number
    survivedFullRun: boolean
}

export function getGravityFlipMoverBounds(config: GravityFlipConfig): {
    minY: number
    maxY: number
} {
    const clearance = Math.max(config.playerSize, config.moverRailClearance)
    const minY = config.corridorInset + clearance
    const maxY =
        config.canvasHeight -
        config.corridorInset -
        clearance -
        config.moverSize
    if (maxY < minY) {
        throw new RangeError('Gravity Flip mover bounds have no safe corridor')
    }
    return { minY, maxY }
}
