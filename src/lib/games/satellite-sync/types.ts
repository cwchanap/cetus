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

export interface SatelliteSyncGameData {
    levelsCleared: number
    maxCombo: number
    totalLocks: number
    solved: boolean
    minTimeRemainingRatio: number
}
