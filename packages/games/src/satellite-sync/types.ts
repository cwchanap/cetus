export type BeamColor = 'cyan' | 'magenta' | 'yellow' | 'green'

export interface SatelliteDef {
    ring: number
    angle: number
    color: BeamColor
}

export interface MovingConfig {
    speed: number
    direction: 1 | -1
}

export interface TargetDef {
    ring: number
    angle: number
    color: BeamColor
    moving?: MovingConfig
}

export interface ObstacleDef {
    ring: number
    angle: number
    radius: number
    moving?: MovingConfig
}

export interface SatelliteSyncLevel {
    id: number
    name: string
    timeBudget: number
    rings: number
    satellites: SatelliteDef[]
    targets: TargetDef[]
    obstacles: ObstacleDef[]
}

export interface RuntimeSatellite {
    id: string
    ring: number
    angle: number
    color: BeamColor
    aimAngle: number
    lockedTargetId: string | null
    snapCandidateId: string | null
}

export interface RuntimeTarget {
    id: string
    ring: number
    defAngle: number
    currentAngle: number
    color: BeamColor
    moving: MovingConfig | null
    locked: boolean
    lockedBySatId: string | null
}

export interface RuntimeObstacle {
    id: string
    ring: number
    defAngle: number
    currentAngle: number
    radius: number
    moving: MovingConfig | null
}

/** Identity of the model instance and entity generation a gesture began
 *  against; lifetime changes invalidate outstanding gesture events. */
export interface SatelliteAimIdentity {
    modelInstanceId: number
    entityGeneration: number
}

/** Pre-drag aim/lock state captured before `beginAim` mutates a satellite,
 *  so a cancelled drag can be restored without scoring. `modelInstanceId`
 *  and `entityGeneration` bind the snapshot to the model/run and level
 *  entity set that produced it; a stale snapshot is rejected. */
export interface SatelliteAimSnapshot {
    modelInstanceId: number
    entityGeneration: number
    satelliteId: string
    aimAngle: number
    snapCandidateId: string | null
    lockedTargetId: string | null
    combo: number
    multiplier: number
}

export type SatelliteSyncStatus = 'idle' | 'playing' | 'won' | 'lost'

export interface SatelliteSyncState {
    levelIndex: number
    levelName: string
    timeBudget: number
    timeRemaining: number
    satellites: RuntimeSatellite[]
    targets: RuntimeTarget[]
    obstacles: RuntimeObstacle[]
    combo: number
    multiplier: number
    score: number
    status: SatelliteSyncStatus
}

export interface LockInfo {
    combo: number
    multiplier: number
}

export interface SatelliteSyncCallbacks {
    onGameStart: () => void
    onTimeUpdate: (seconds: number) => void
    onScoreUpdate: (score: number) => void
    onLock: (info: LockInfo) => void
    onComboReset: () => void
    onLevelClear: (levelNumber: number) => void
    onFail: (levelNumber: number, finalScore: number) => void
    onWin: (finalScore: number) => void
}

// Canonical definition in @cetus/shared (consumed by achievement predicates)
export type { SatelliteSyncGameData } from '@cetus/shared/game-data'
