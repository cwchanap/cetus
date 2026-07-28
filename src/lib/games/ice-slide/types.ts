export type Direction = 'N' | 'E' | 'S' | 'W'

export type CellType =
    | 'wall'
    | 'ice'
    | 'start'
    | 'goal'
    | 'rock'
    | 'hazard'
    | 'crystal'

export interface GridPosition {
    row: number
    col: number
}

export interface IceSlideLevel {
    id: number
    name: string
    /** Row-major string rows using # . S G O H C glyphs */
    rows: string[]
    parMoves: number
}

export type IceSlideStatus = 'idle' | 'playing' | 'won'

export interface IceSlideState {
    levelIndex: number
    levelName: string
    rows: number
    cols: number
    grid: CellType[][]
    player: GridPosition
    start: GridPosition
    moves: number
    levelMoves: number
    crystalsCollected: number
    levelCrystalsCollected: number
    score: number
    elapsedSeconds: number
    status: IceSlideStatus
    perfectLevels: number
    levelsCleared: number
    lastSlidePath: GridPosition[]
}

export interface IceSlideGameData {
    levelsCleared: number
    totalMoves: number
    crystalsCollected: number
    elapsedSeconds: number
    solved: boolean
    perfectLevels: number
}

export interface IceSlideCallbacks {
    onGameStart: () => void
    onMove: (info: { moves: number; levelMoves: number }) => void
    onCrystal: (total: number) => void
    onLevelClear: (level: number) => void
    onHazard: () => void
    onScoreUpdate: (score: number) => void
    onTimeUpdate: (elapsedSeconds: number) => void
    onWin: (finalScore: number) => void
}

export const DIRECTION_DELTA: Record<Direction, GridPosition> = {
    N: { row: -1, col: 0 },
    E: { row: 0, col: 1 },
    S: { row: 1, col: 0 },
    W: { row: 0, col: -1 },
}

export const GLYPH_TO_CELL: Record<string, CellType> = {
    '#': 'wall',
    '.': 'ice',
    S: 'start',
    G: 'goal',
    O: 'rock',
    H: 'hazard',
    C: 'crystal',
}
