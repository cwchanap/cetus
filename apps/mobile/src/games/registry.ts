import type { ComponentType } from 'react'
import { GameID } from '@cetus/shared/games'
import type { ScoreSubmitter } from '@cetus/shared/scores'
import type { ScorePlatform } from '@cetus/shared/validations'
import type { BaseGame, BaseGameState, BaseGameStats } from '@cetus/games'
import { MemoryMatrixGame } from '@cetus/games/memory-matrix/MemoryMatrixGame'
import type { MemoryMatrixState } from '@cetus/games/memory-matrix/frameworkTypes'
import { MineGridGame } from '@cetus/games/mine-grid/MineGridGame'
import type { MineGridState } from '@cetus/games/mine-grid/types'
import { PatternPulseGame } from '@cetus/games/pattern-pulse/PatternPulseGame'
import type { PatternPulseState } from '@cetus/games/pattern-pulse/types'
import { PotionSorterGame } from '@cetus/games/potion-sorter/PotionSorterGame'
import type { PotionSorterState } from '@cetus/games/potion-sorter/types'
import {
    QuickMathFrameworkGame,
    type QuickMathState,
} from '@cetus/games/quick-math/game'
import { SudokuGame } from '@cetus/games/sudoku/SudokuGame'
import type { SudokuState } from '@cetus/games/sudoku/frameworkTypes'
import { WordScrambleGame } from '@cetus/games/word-scramble/WordScrambleGame'
import type { WordScrambleState } from '@cetus/games/word-scramble/frameworkTypes'
import { ChromaticTideGame } from '@cetus/games/chromatic-tide/ChromaticTideGame'
import type {
    ChromaticTideState,
    ChromaticTideStats,
} from '@cetus/games/chromatic-tide/types'
import { ChromaticTideBoard } from './boards/ChromaticTideBoard'
import { MemoryMatrixBoard } from './boards/MemoryMatrixBoard'

/**
 * Host-injected transport every native game run receives: the cookie-backed
 * `/api/scores` submitter plus the OS label that lands on `ScoreData`.
 */
export interface NativeGameHostDeps {
    submitScore: ScoreSubmitter
    platform: ScorePlatform
}

/**
 * Serializable visible-state snapshot a native view renders (copied cell
 * values, never board references). `clock` is the optional elapsed-time HUD
 * (Sudoku counts up instead of down); the shared chrome prefers it over the
 * session's `timeRemaining` snapshot when present.
 */
export interface NativeGameProjection {
    clock?: number
    [key: string]: unknown
}

export interface NativeGameViewProps {
    projected: NativeGameProjection
    /**
     * Per-instance binding: the live game this host created. Board inputs
     * call model commands on it (e.g. ChromaticTideGame.chooseColor) —
     * never on the frozen projection.
     */
    game: BaseGame
}

/**
 * One game's native port. `createGame` wires the concrete `@cetus/games`
 * class with the host deps; `project` also receives the constructed
 * instance so instance-dependent reads (Sudoku's elapsed clock) work
 * beside the state. The board `view` is each port's Stage 2/3 deliverable —
 * until it lands the host renders its placeholder board behind a fully
 * live session.
 */
export interface NativeGamePort {
    createGame(deps: NativeGameHostDeps): BaseGame
    project(state: BaseGameState, game: BaseGame): NativeGameProjection
    /** Optional result-sheet outcome label derived from the finished
     * run's stats (e.g. Chromatic Tide Cleared/Timeout); null hides it. */
    resultOutcomeLabel?: (stats: BaseGameStats) => string | null
    view?: ComponentType<NativeGameViewProps>
}

export interface NativeGameEntry {
    port?: NativeGamePort
}

const memoryMatrixPort: NativeGamePort = {
    createGame: deps =>
        new MemoryMatrixGame({
            submitScore: deps.submitScore,
            platform: deps.platform,
        }),
    // Copy every visible cell value: the model mutates card flags in
    // place, so returning board references would freeze the view.
    project: state => {
        const { board, isProcessing, matchedPairs, totalPairs, isActive } =
            state as MemoryMatrixState
        return {
            cards: board.map(row =>
                row.map(card => ({
                    shape: card.shape,
                    color: card.color,
                    isFlipped: card.isFlipped,
                    isMatched: card.isMatched,
                }))
            ),
            isProcessing,
            matchedPairs,
            totalPairs,
            canFlip: isActive,
        }
    },
    view: MemoryMatrixBoard,
}

const mineGridPort: NativeGamePort = {
    createGame: deps =>
        new MineGridGame({
            submitScore: deps.submitScore,
            platform: deps.platform,
        }),
    project: state => ({
        cells: (state as MineGridState).board.map(row =>
            row.map(cell => ({
                revealed: cell.revealed,
                flagged: cell.flagged,
                adjacentMines: cell.adjacentMines,
                hasMine: cell.hasMine,
            }))
        ),
    }),
}

const patternPulsePort: NativeGamePort = {
    createGame: deps =>
        new PatternPulseGame({
            submitScore: deps.submitScore,
            platform: deps.platform,
        }),
    project: state => {
        const { phase, activePad, feedback, completedRounds, streak } =
            state as PatternPulseState
        // The sequence is the answer key; playback surfaces via activePad.
        return { phase, activePad, feedback, completedRounds, streak }
    },
}

const potionSorterPort: NativeGamePort = {
    createGame: deps =>
        new PotionSorterGame({
            submitScore: deps.submitScore,
            platform: deps.platform,
        }),
    project: state => {
        const { tubes, selectedTubeIndex, movesMade } =
            state as PotionSorterState
        return {
            tubes: tubes.map(tube => [...tube]),
            selectedTubeIndex,
            movesMade,
        }
    },
}

const quickMathPort: NativeGamePort = {
    createGame: deps =>
        // Quick Math's ctor takes its catalog id before the config.
        new QuickMathFrameworkGame(GameID.QUICK_MATH, {
            submitScore: deps.submitScore,
            platform: deps.platform,
        }),
    project: state => ({
        question: (state as QuickMathState).currentQuestion?.question ?? null,
    }),
}

const sudokuPort: NativeGamePort = {
    createGame: deps =>
        new SudokuGame({
            submitScore: deps.submitScore,
            platform: deps.platform,
        }),
    project: (state, game) => {
        const { grid, mistakes } = state as SudokuState
        return {
            cells: grid.cells.map(row =>
                row.map(cell => ({
                    value: cell.value,
                    isGiven: cell.isGiven,
                    isConflicting: cell.isConflicting,
                }))
            ),
            mistakes,
            // Elapsed clock read off the constructed instance: the count-up
            // HUD ticks without a per-second state event.
            clock: game.getTimerStatus().elapsedTime,
        }
    },
}

const wordScramblePort: NativeGamePort = {
    createGame: deps =>
        new WordScrambleGame({
            submitScore: deps.submitScore,
            platform: deps.platform,
        }),
    project: state => {
        const { currentChallenge, wordsUnscrambled } =
            state as WordScrambleState
        return {
            scrambledWord: currentChallenge?.scrambledWord ?? null,
            difficulty: currentChallenge?.difficulty ?? null,
            wordsUnscrambled,
        }
    },
}

const chromaticTidePort: NativeGamePort = {
    createGame: deps =>
        new ChromaticTideGame({
            submitScore: deps.submitScore,
            platform: deps.platform,
        }),
    project: state => {
        const {
            board,
            territoryColor,
            movesUsed,
            capturedCells,
            outcome,
            isActive,
        } = state as ChromaticTideState
        return {
            cells: board.map(row =>
                row.map(cell => ({
                    color: cell.color,
                    captured: cell.captured,
                }))
            ),
            territoryColor,
            movesUsed,
            capturedCells,
            canChooseColor: isActive && outcome === 'playing',
        }
    },
    resultOutcomeLabel: stats => {
        const outcome = (stats as ChromaticTideStats).outcome
        return outcome === 'cleared'
            ? 'Cleared'
            : outcome === 'timeout'
              ? 'Timeout'
              : null
    },
    view: ChromaticTideBoard,
}

/**
 * The single native game registry (HPA-425 wave 1). Keys are computed from
 * the imported `GameID` enum members — never bare id strings — and presence
 * in this map is what the Games hub, the detail Play button and the play
 * route all consult. Eight playable, fifteen disabled.
 */
export const NATIVE_GAMES: Partial<Record<GameID, NativeGameEntry>> = {
    [GameID.MEMORY_MATRIX]: { port: memoryMatrixPort },
    [GameID.MINE_GRID]: { port: mineGridPort },
    [GameID.PATTERN_PULSE]: { port: patternPulsePort },
    [GameID.POTION_SORTER]: { port: potionSorterPort },
    [GameID.QUICK_MATH]: { port: quickMathPort },
    [GameID.SUDOKU]: { port: sudokuPort },
    [GameID.WORD_SCRAMBLE]: { port: wordScramblePort },
    [GameID.CHROMATIC_TIDE]: { port: chromaticTidePort },
}

/** Own-key lookup so unknown strings (even "__proto__") never resolve. */
export function getNativeGameEntry(
    gameId: string
): NativeGameEntry | undefined {
    return Object.hasOwn(NATIVE_GAMES, gameId)
        ? NATIVE_GAMES[gameId as GameID]
        : undefined
}

export function isNativePlayable(gameId: string): boolean {
    return getNativeGameEntry(gameId) !== undefined
}
