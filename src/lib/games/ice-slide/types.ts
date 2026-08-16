import type { IceSlideExpeditionRouteChoice } from './expedition'

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
    parMoves: number
    objectiveIds: IceSlideObjectiveId[]
    pendingRouteChoiceAfterStage: 2 | 4 | null
    routeChoices: IceSlideExpeditionRouteChoice[]
    undoChargesAvailable: number
    undoChargesUsed: number
    starsPossible: number
    levelFalls: number
    levelResets: number
    crystalsCollected: number
    levelCrystalsCollected: number
    score: number
    elapsedSeconds: number
    status: IceSlideStatus
    perfectLevels: number
    levelsCleared: number
    lastSlidePath: GridPosition[]
    mode: IceSlideMode
    runKey: string
    runSchemaVersion: 1
    generatorVersion: number
    rulesetVersion: number
    stagesTotal: number
    starsEarned: number
    falls: number
    resets: number
    stageSignatures: string[]
}

export interface IceSlideGameData {
    levelsCleared: number
    totalMoves: number
    crystalsCollected: number
    elapsedSeconds: number
    solved: boolean
    perfectLevels: number
    mode: IceSlideMode
    runKey: string
    runSchemaVersion: 1
    generatorVersion: number
    rulesetVersion: number
    stagesTotal: number
    starsEarned: number
    falls: number
    resets: number
    stageSignatures: string[]
    routeChoices: IceSlideExpeditionRouteChoice[]
    undoChargesAvailable: number
    undoChargesUsed: number
    starsPossible: number
    stageObjectiveIds: IceSlideObjectiveId[][]
    stageScoreMultipliersBps: number[]
}

export interface IceSlideCallbacks {
    onGameStart: () => void
    onMove: (info: { moves: number; levelMoves: number }) => void
    onCrystal: (total: number) => void
    onLevelClear: (result: IceSlideStageClearResult) => void
    onHazard: () => void
    onScoreUpdate: (score: number) => void
    onTimeUpdate: (elapsedSeconds: number) => void
    onWin: (finalScore: number) => void
}

export type IceSlidePlayableMode = 'campaign' | 'daily' | 'expedition'

export interface IceSlideStageClearResult {
    stageNumber: number
    stageName: string
    parMoves: number
    movesUsed: number
    crystalsCollected: number
    scoreGained: number
    stars: {
        clear: boolean
        efficient: boolean
        bonuses: Array<{ id: IceSlideObjectiveId; earned: boolean }>
        earnedCount: number
    }
}

export const DIRECTION_DELTA: Record<Direction, GridPosition> = {
    N: { row: -1, col: 0 },
    E: { row: 0, col: 1 },
    S: { row: 1, col: 0 },
    W: { row: 0, col: -1 },
}

export type IceSlideMode = 'campaign' | 'daily' | 'expedition'
export type IceSlideDifficulty = 'tutorial' | 'easy' | 'medium' | 'hard'

export type IceSlideObjectiveId =
    | 'collect_all_crystals'
    | 'no_falls'
    | 'no_reset'

export type BoardTransform =
    | 'identity'
    | 'rotate_90'
    | 'rotate_180'
    | 'rotate_270'
    | 'reflect_horizontal'
    | 'reflect_vertical'
    | 'reflect_main_diagonal'
    | 'reflect_anti_diagonal'

export interface IceSlideRunDefinition {
    schemaVersion: 1
    generatorVersion: number
    rulesetVersion: number
    mode: IceSlideMode
    runKey: string
    seed: string | null
    stages: IceSlideStageDefinition[]
}

export interface IceSlideStageDefinition {
    id: string
    name: string
    templateId: string
    difficulty: IceSlideDifficulty
    rows: string[]
    parMoves: number
    transform: BoardTransform
    mutationIds: string[]
    objectiveIds: IceSlideObjectiveId[]
    scoreMultiplierBps: number
    signature: string
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
