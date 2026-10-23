/**
 * Canonical game-result DTOs shared across hosts.
 *
 * These shapes describe what a game reports about a completed run. They are
 * consumed by the portable achievement predicates (`achievements.ts`) and,
 * from Stage 2 onward, by the `@cetus/games` simulation packages. The
 * definitions live here so `@cetus/shared` never imports from
 * `@cetus/games`/web, and so game-local `types.ts` modules re-export instead
 * of forking duplicates.
 *
 * Browser/runtime-only game types (state, entities, configs, renderers) stay
 * with each game; only the portable result DTOs are extracted here.
 */

// Base game history entry for tracking clicked objects
export interface GameHistoryEntry {
    objectId: string
    type: 'coin' | 'bomb'
    clicked: boolean
    timeToClick?: number
    pointsAwarded: number
}

// Tetris-specific game data
export interface TetrisGameData {
    doubles: number
    triples: number
    tetrises: number
    consecutiveLineClears: number
    piecesPlaced: number
    level: number
}

// Bubble Shooter-specific game data
export interface BubbleShooterGameData {
    bubblesPopped: number
    shotsFired: number
    largestCombo: number
}

// Bejeweled-specific game data
export interface BejeweledGameData {
    maxCombo: number
    largestMatch: number
    straightFive?: boolean
    totalMatches: number
}

// Memory Matrix-specific game data
export interface MemoryMatrixGameData {
    matchesFound: number
    moves: number
    perfectGame?: boolean
}

// Word Scramble-specific game data
export interface WordScrambleGameData {
    lastCorrectWord?: string
    correctWords?: string[]
    totalWordsScrambled: number
}

// Reflex-specific game data
export interface ReflexGameData {
    gameHistory: GameHistoryEntry[]
    coinsCollected: number
    bombsHit: number
}

// Quick Math-specific game data
export interface QuickMathGameData {
    seenOnePlusOne?: boolean
    onePlusOneIncorrect?: boolean
    seenOperand999?: boolean
    zeroAnswerIncorrect?: boolean
    correctAnswers: number
    wrongAnswers: number
}

// Sudoku-specific game data
export interface SudokuGameData {
    difficulty: 'easy' | 'medium' | 'hard'
    cellsFilled: number
}

// Path Navigator-specific game data
export interface PathNavigatorGameData {
    pathsCompleted: number
    perfectPaths: number
}

// Evader-specific game data
export interface EvaderGameData {
    coinsCollected: number
    bombsHit: number
    survivalTime: number
}

// 2048-specific game data
export interface Game2048Data {
    maxTile: number
    moves: number
    merges: number
}

// Snake-specific game data
export interface SnakeGameData {
    foodsEaten: number
    maxLength: number
}

// Circuit Hacker difficulty tiers (canonical home; re-exported by the game)
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'

// Circuit Hacker-specific game data
export interface CircuitHackerGameData {
    difficulty: Difficulty
    secondsRemaining: number
    rotationsUsed: number
    solved: boolean
}

// Satellite Sync-specific game data
export interface SatelliteSyncGameData {
    levelsCleared: number
    maxCombo: number
    totalLocks: number
    solved: boolean
    minTimeRemainingRatio: number
}

// Ice Slide run context unions (canonical home; re-exported by the game)
export type IceSlideMode = 'campaign' | 'daily' | 'expedition'

export type IceSlideObjectiveId =
    'collect_all_crystals' | 'no_falls' | 'no_reset'

export type IceSlideExpeditionRouteChoice = 'safe' | 'risky'

// Ice Slide-specific game data
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

// Mine Grid difficulty (canonical home; re-exported by the game)
export type MineGridDifficulty = 'easy' | 'medium' | 'hard'

// Mine Grid-specific game data
export interface MineGridGameData {
    difficulty: MineGridDifficulty
    cleared: boolean
    revealedSafeCells: number
    incorrectFlagActions: number
    elapsedSeconds: number
}

// Pattern Pulse-specific game data
export interface PatternPulseGameData {
    completedRounds: number
    longestSequence: number
    mistakes: number
    maxStreak: number
}

// Gravity Flip-specific game data
export interface GravityFlipGameData {
    distance: number
    starsCollected: number
    flips: number
    survivedFullRun: boolean
}

// Potion Sorter difficulty (canonical home; re-exported by the game)
export type PotionSorterDifficulty = 'easy' | 'medium' | 'hard'

// Potion Sorter-specific game data
export interface PotionSorterGameData {
    difficulty: PotionSorterDifficulty
    solved: boolean
    movesMade: number
    undosUsed: number
    elapsedSeconds: number
}

// Signal Switch-specific game data
export interface SignalSwitchGameData {
    safePasses: number
    crashes: number
    maxCombo: number
    integrityRemaining: number
    survivedFullRun: boolean
}

// Rhythm Reactor-specific game data
export interface RhythmReactorGameData {
    hits: number
    perfectHits: number
    goodHits: number
    misses: number
    strayPresses: number
    maxCombo: number
    accuracy: number
    finalStability: number
}

// Asteroid Drift-specific game data
export interface AsteroidDriftGameData {
    survivalSeconds: number
    orbsCollected: number
    survivedFullRun: boolean
}

// Chromatic Tide-specific game data
export interface ChromaticTideGameData {
    cleared: boolean
    movesUsed: number
    capturedCells: number
    initialCapturedCells: number
    secondsRemaining: number
}

/**
 * Union of every game's result DTO — the canonical `gameData` payload on
 * score submission (see `./scores`) and the shape the achievement
 * predicates consume.
 */
export type GameData =
    | TetrisGameData
    | BubbleShooterGameData
    | BejeweledGameData
    | MemoryMatrixGameData
    | WordScrambleGameData
    | ReflexGameData
    | QuickMathGameData
    | SudokuGameData
    | PathNavigatorGameData
    | EvaderGameData
    | Game2048Data
    | SnakeGameData
    | CircuitHackerGameData
    | SatelliteSyncGameData
    | IceSlideGameData
    | MineGridGameData
    | PatternPulseGameData
    | GravityFlipGameData
    | PotionSorterGameData
    | SignalSwitchGameData
    | RhythmReactorGameData
    | AsteroidDriftGameData
    | ChromaticTideGameData
