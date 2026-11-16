/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
    getNativeGameEntry,
    isNativePlayable,
    NATIVE_GAMES,
} from '../src/games/registry'
import { GAMES, GameID, getActiveGames } from '@cetus/shared/games'
import type { ScoreSubmitter } from '@cetus/shared/scores'
import type { BaseGame, BaseGameConfig, BaseGameStats } from '@cetus/games'
import { MemoryMatrixGame } from '@cetus/games/memory-matrix/MemoryMatrixGame'
import { MineGridGame } from '@cetus/games/mine-grid/MineGridGame'
import type { MineGridState } from '@cetus/games/mine-grid/types'
import { PatternPulseGame } from '@cetus/games/pattern-pulse/PatternPulseGame'
import { PotionSorterGame } from '@cetus/games/potion-sorter/PotionSorterGame'
import type { PotionSorterState } from '@cetus/games/potion-sorter/types'
import { QuickMathFrameworkGame } from '@cetus/games/quick-math/game'
import { SudokuGame } from '@cetus/games/sudoku/SudokuGame'
import type { SudokuState } from '@cetus/games/sudoku/frameworkTypes'
import { WordScrambleGame } from '@cetus/games/word-scramble/WordScrambleGame'
import { ChromaticTideGame } from '@cetus/games/chromatic-tide/ChromaticTideGame'
import { SnakeGame } from '@cetus/games/snake/SnakeGame'
import { GravityFlipGame } from '@cetus/games/gravity-flip/GravityFlipGame'
import type { GravityFlipState } from '@cetus/games/gravity-flip/types'
import { Game2048 } from '@cetus/games/2048/Game2048'
import type {
    Game2048State,
    Game2048Stats,
} from '@cetus/games/2048/frameworkTypes'
import type { Tile } from '@cetus/games/2048/types'
import { ReflexGame } from '@cetus/games/reflex/ReflexGame'
import { SignalSwitchGame } from '@cetus/games/signal-switch/SignalSwitchGame'
import {
    SIGNAL_SWITCH_RULES,
    type SignalSwitchState,
    type SignalSwitchStats,
} from '@cetus/games/signal-switch/types'
import { EvaderGame } from '@cetus/games/evader/EvaderGame'
import type { EvaderState } from '@cetus/games/evader/frameworkTypes'
import {
    GAME_LEVELS,
    PathNavigatorGame,
} from '@cetus/games/path-navigator/PathNavigatorGame'
import type {
    PathNavigatorState,
    PathNavigatorStats,
} from '@cetus/games/path-navigator/types'

// Any-constructor shape: `never` params accept every concrete ctor.
type AnyGameCtor = abstract new (...args: never[]) => unknown

const CONCRETE_GAMES: ReadonlyArray<readonly [GameID, AnyGameCtor]> = [
    [GameID.MEMORY_MATRIX, MemoryMatrixGame],
    [GameID.MINE_GRID, MineGridGame],
    [GameID.PATTERN_PULSE, PatternPulseGame],
    [GameID.POTION_SORTER, PotionSorterGame],
    [GameID.QUICK_MATH, QuickMathFrameworkGame],
    [GameID.SUDOKU, SudokuGame],
    [GameID.WORD_SCRAMBLE, WordScrambleGame],
    [GameID.CHROMATIC_TIDE, ChromaticTideGame],
    [GameID.SNAKE, SnakeGame],
    [GameID.GRAVITY_FLIP, GravityFlipGame],
    [GameID.GAME_2048, Game2048],
    [GameID.REFLEX, ReflexGame],
    [GameID.SIGNAL_SWITCH, SignalSwitchGame],
    [GameID.EVADER, EvaderGame],
    [GameID.PATH_NAVIGATOR, PathNavigatorGame],
]

const hostDeps = (platform: 'ios' | 'android') => {
    const submitScore: ScoreSubmitter = async () => ({ success: true })
    return { submitScore, platform }
}

// HPA-425 wave 1: exactly these eight games are native-destined. The list
// is duplicated here on purpose — the test must fail if the registry drifts.
const EXPECTED_NATIVE_IDS = [
    GameID.CHROMATIC_TIDE,
    GameID.EVADER,
    GameID.GAME_2048,
    GameID.GRAVITY_FLIP,
    GameID.MEMORY_MATRIX,
    GameID.MINE_GRID,
    GameID.PATH_NAVIGATOR,
    GameID.PATTERN_PULSE,
    GameID.POTION_SORTER,
    GameID.QUICK_MATH,
    GameID.REFLEX,
    GameID.SIGNAL_SWITCH,
    GameID.SNAKE,
    GameID.SUDOKU,
    GameID.WORD_SCRAMBLE,
] as const

const process = jest.requireActual('node:process') as { cwd: () => string }

describe('NATIVE_GAMES registry', () => {
    test('contains exactly the fifteen registry game ids', () => {
        expect(Object.keys(NATIVE_GAMES).sort()).toEqual(
            [...EXPECTED_NATIVE_IDS].sort()
        )
        for (const id of EXPECTED_NATIVE_IDS) {
            expect(getNativeGameEntry(id)).toBeDefined()
        }
    })

    test('registry and catalog counts line up: 15 playable, 8 disabled of 23', () => {
        expect(GAMES).toHaveLength(23)
        expect(getActiveGames()).toHaveLength(23)
        expect(Object.keys(NATIVE_GAMES)).toHaveLength(15)
        const playable = GAMES.filter(game => isNativePlayable(game.id))
        const disabled = GAMES.filter(game => !isNativePlayable(game.id))
        expect(playable.map(game => game.id).sort()).toEqual(
            [...EXPECTED_NATIVE_IDS].sort()
        )
        expect(disabled).toHaveLength(8)
    })

    test('resolves each expected id through the own-key lookup', () => {
        for (const id of EXPECTED_NATIVE_IDS) {
            expect(isNativePlayable(id)).toBe(true)
            expect(getNativeGameEntry(id)).toBe(NATIVE_GAMES[id])
        }
    })

    test('own-key check rejects unknown strings and inherited keys', () => {
        expect(getNativeGameEntry('definitely-not-a-game')).toBeUndefined()
        expect(getNativeGameEntry('memory-matrix')).toBeUndefined()
        expect(getNativeGameEntry('toString')).toBeUndefined()
        expect(getNativeGameEntry('constructor')).toBeUndefined()
        expect(isNativePlayable('__proto__')).toBe(false)
        // The fifteen unported registry games stay disabled.
        expect(isNativePlayable(GameID.TETRIS)).toBe(false)
        expect(isNativePlayable(GameID.ICE_SLIDE)).toBe(false)
        expect(isNativePlayable(GameID.EVADER)).toBe(true)
        expect(isNativePlayable(GameID.PATH_NAVIGATOR)).toBe(true)
    })

    test('production entries construct their concrete game with the injected deps', () => {
        for (const [id, Ctor] of CONCRETE_GAMES) {
            const port = getNativeGameEntry(id)?.port
            expect(port).toBeDefined()
            if (!port) {
                continue
            }
            const { submitScore, platform } = hostDeps('android')
            const game: BaseGame = port.createGame({ submitScore, platform })
            expect(game).toBeInstanceOf(Ctor)
            // The host deps land in the game config: this submitter identity
            // and OS label are what a finished run stamps onto ScoreData.
            const config = (game as unknown as { config: BaseGameConfig })
                .config
            expect(config.submitScore).toBe(submitScore)
            expect(config.platform).toBe('android')
            expect(typeof game.getState().score).toBe('number')
            game.destroy()
        }
    })

    test('production projections are JSON-serializable visible snapshots', () => {
        for (const [id] of CONCRETE_GAMES) {
            const port = getNativeGameEntry(id)?.port
            if (!port) {
                continue
            }
            const game = port.createGame(hostDeps('ios'))
            const projected = port.project(game.getState(), game)
            expect(JSON.parse(JSON.stringify(projected))).toEqual(projected)
            game.destroy()
        }
    })

    test('the Sudoku projector reads the elapsed clock off the constructed instance', async () => {
        const port = getNativeGameEntry(GameID.SUDOKU)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        const game = port.createGame(hostDeps('ios'))
        game.start()
        await new Promise(resolve => setTimeout(resolve, 1100))
        const projected = port.project(game.getState(), game)
        expect(projected.clock).toBe(game.getTimerStatus().elapsedTime)
        expect(projected.clock).toBeGreaterThan(0)
        game.destroy()
    })

    test('the Chromatic Tide pilot ships a board view and a captured-cell projection', () => {
        const port = getNativeGameEntry(GameID.CHROMATIC_TIDE)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        const projected = port.project(game.getState(), game) as {
            cells: Array<Array<{ color: string; captured: boolean }>>
            territoryColor: string
            capturedCells: number
        }
        // The 12×12 visible board carries each cell's color and captured
        // flag; the captured count lines up with the captured cells.
        expect(projected.cells).toHaveLength(12)
        expect(projected.cells.every(row => row.length === 12)).toBe(true)
        expect(projected.capturedCells).toBe(
            projected.cells.flat().filter(cell => cell.captured).length
        )
        expect(projected.territoryColor).toBe(projected.cells[0][0].color)
        game.destroy()
    })

    test('the Chromatic Tide port labels finished-run outcomes', () => {
        const port = getNativeGameEntry(GameID.CHROMATIC_TIDE)?.port
        expect(port).toBeDefined()
        if (!port?.resultOutcomeLabel) {
            return
        }
        const stats = (outcome: string) =>
            ({ outcome }) as unknown as BaseGameStats
        expect(port.resultOutcomeLabel(stats('cleared'))).toBe('Cleared')
        expect(port.resultOutcomeLabel(stats('timeout'))).toBe('Timeout')
        expect(port.resultOutcomeLabel(stats('playing'))).toBeNull()
    })

    test('the Memory Matrix pilot ships a board view and a copied-cell projection', () => {
        const port = getNativeGameEntry(GameID.MEMORY_MATRIX)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        const projected = port.project(game.getState(), game) as {
            cards: Array<
                Array<{
                    shape: string
                    color: string
                    isFlipped: boolean
                    isMatched: boolean
                }>
            >
            isProcessing: boolean
            matchedPairs: number
            totalPairs: number
            canFlip: boolean
        }
        // The 6×8 visible board copies each cell's face values.
        expect(projected.cards).toHaveLength(6)
        expect(projected.cards.every(row => row.length === 8)).toBe(true)
        expect(
            projected.cards
                .flat()
                .every(
                    card =>
                        typeof card.shape === 'string' &&
                        !card.isFlipped &&
                        !card.isMatched
                )
        ).toBe(true)
        expect(projected.isProcessing).toBe(false)
        expect(projected.matchedPairs).toBe(0)
        expect(projected.totalPairs).toBe(24)
        expect(projected.canFlip).toBe(false)

        // Copies, not board references: an in-place model mutation must
        // surface through the next projection as a fresh cell value.
        const memoryGame = game as MemoryMatrixGame
        memoryGame.getBoard()[3][4].isFlipped = true
        const mutated = port.project(game.getState(), game) as {
            cards: Array<Array<{ isFlipped: boolean }>>
        }
        expect(mutated.cards[3][4].isFlipped).toBe(true)
        game.destroy()
    })

    test('the Mine Grid pilot ships a board view and a copied-cell projection', () => {
        const port = getNativeGameEntry(GameID.MINE_GRID)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        const projected = port.project(game.getState(), game) as {
            cells: Array<
                Array<{
                    revealed: boolean
                    flagged: boolean
                    adjacentMines: number
                    hasMine: boolean
                }>
            >
            difficulty: string
            flagsPlaced: number
            mines: number
            canAct: boolean
        }
        // The default medium board is a 10×10 grid with 15 mines, idle.
        expect(projected.cells).toHaveLength(10)
        expect(projected.cells.every(row => row.length === 10)).toBe(true)
        expect(
            projected.cells
                .flat()
                .every(cell => !cell.revealed && !cell.flagged)
        ).toBe(true)
        expect(projected.difficulty).toBe('medium')
        expect(projected.flagsPlaced).toBe(0)
        expect(projected.mines).toBe(15)
        expect(projected.canAct).toBe(false)

        // Copies, not board references: an in-place model mutation must
        // surface through the next projection as a fresh cell value.
        const liveState = game.getState() as MineGridState
        liveState.board[3][4].flagged = true
        const mutated = port.project(liveState, game) as {
            cells: Array<Array<{ flagged: boolean }>>
        }
        expect(mutated.cells[3][4].flagged).toBe(true)
        game.destroy()
    })

    test('the Mine Grid port labels finished-run outcomes', () => {
        const port = getNativeGameEntry(GameID.MINE_GRID)?.port
        expect(port).toBeDefined()
        if (!port?.resultOutcomeLabel) {
            return
        }
        const stats = (result: string) =>
            ({ result }) as unknown as BaseGameStats
        expect(port.resultOutcomeLabel(stats('cleared'))).toBe('Cleared')
        expect(port.resultOutcomeLabel(stats('mine'))).toBe('Mine hit')
        expect(port.resultOutcomeLabel(stats('timeout'))).toBe('Timeout')
        expect(port.resultOutcomeLabel(stats('playing'))).toBeNull()
    })

    test('the Pattern Pulse pilot ships a board view and a phase/feedback projection', () => {
        const port = getNativeGameEntry(GameID.PATTERN_PULSE)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        const idle = port.project(game.getState(), game)
        // All primitives: playback phase/outcome, the lit pad, feedback,
        // HUD counters and the input gate. The sequence array itself is
        // the answer key — only its length is visible.
        expect(idle).toEqual({
            phase: 'idle',
            outcome: 'playing',
            activePad: null,
            feedback: null,
            sequenceLength: 3,
            completedRounds: 0,
            streak: 0,
            mistakes: 0,
            canPress: false,
        })

        // beginPlayback emits synchronously from start(); input outside
        // the input phase is rejected by the model, so canPress stays off.
        game.start()
        expect(port.project(game.getState(), game)).toMatchObject({
            phase: 'watch',
            canPress: false,
        })
        expect((game as PatternPulseGame).pressPad(0)).toBe(false)
        expect(port.project(game.getState(), game)).toMatchObject({
            phase: 'watch',
        })
        game.destroy()
    })

    test('the Pattern Pulse port labels finished-run outcomes', () => {
        const port = getNativeGameEntry(GameID.PATTERN_PULSE)?.port
        expect(port).toBeDefined()
        if (!port?.resultOutcomeLabel) {
            return
        }
        const stats = (outcome: string) =>
            ({ outcome }) as unknown as BaseGameStats
        expect(port.resultOutcomeLabel(stats('timeout'))).toBe('Timeout')
        expect(port.resultOutcomeLabel(stats('mistakes'))).toBe('Mistake Limit')
        expect(port.resultOutcomeLabel(stats('playing'))).toBeNull()
    })

    test('the Potion Sorter pilot ships a board view and a copied-tube projection', () => {
        const port = getNativeGameEntry(GameID.POTION_SORTER)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        const projected = port.project(game.getState(), game) as {
            tubes: string[][]
            selectedTubeIndex: number | null
            movesMade: number
            undosUsed: number
            difficulty: string
            result: string
            canUndo: boolean
            canAct: boolean
        }
        // The default medium board: seven tubes, the preset's layers,
        // idle controls and an empty undo history.
        expect(projected.tubes).toHaveLength(7)
        expect(projected.tubes[0]).toEqual([
            'magenta',
            'magenta',
            'amber',
            'cyan',
        ])
        expect(projected.tubes[5]).toEqual([])
        expect(projected).toMatchObject({
            selectedTubeIndex: null,
            movesMade: 0,
            undosUsed: 0,
            difficulty: 'medium',
            result: 'playing',
            canUndo: false,
            canAct: false,
        })

        // Copies, not tube references: a live-state mutation must
        // surface through the next projection as fresh values.
        const liveState = game.getState() as PotionSorterState
        liveState.tubes[6].push('lime')
        const mutated = port.project(liveState, game) as {
            tubes: string[][]
        }
        expect(mutated.tubes[6]).toEqual(['lime'])
        game.destroy()
    })

    test('the Potion Sorter port labels finished-run outcomes', () => {
        const port = getNativeGameEntry(GameID.POTION_SORTER)?.port
        expect(port).toBeDefined()
        if (!port?.resultOutcomeLabel) {
            return
        }
        const stats = (result: string) =>
            ({ result }) as unknown as BaseGameStats
        expect(port.resultOutcomeLabel(stats('solved'))).toBe('Solved')
        expect(port.resultOutcomeLabel(stats('timeout'))).toBe('Timeout')
        expect(port.resultOutcomeLabel(stats('playing'))).toBeNull()
    })

    test('the Sudoku pilot ships a board view and a separately stabilized grid projection', () => {
        const port = getNativeGameEntry(GameID.SUDOKU)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        const projected = port.project(game.getState(), game) as {
            grid: {
                cells: Array<
                    Array<{
                        value: number | null
                        isGiven: boolean
                        isConflicting: boolean
                    }>
                >
                selectedCell: { row: number; col: number } | null
            }
            difficulty: string
            mistakes: number
            clock: number
            canAct: boolean
            difficultyLocked: boolean
        }
        // The default medium board: a 9×9 copied-cell grid, idle controls
        // and the count-up clock starting at zero.
        expect(projected.grid.cells).toHaveLength(9)
        expect(projected.grid.cells.every(row => row.length === 9)).toBe(true)
        expect(projected.grid.selectedCell).toBeNull()
        expect(projected.difficulty).toBe('medium')
        expect(projected.mistakes).toBe(0)
        expect(projected.clock).toBe(0)
        expect(projected.canAct).toBe(false)
        expect(projected.difficultyLocked).toBe(false)

        // The grid is separately stabilized: an unchanged grid keeps the
        // same snapshot reference across projections (clock-only ticks).
        expect(port.project(game.getState(), game).grid).toBe(projected.grid)

        // An in-place model mutation must surface as a NEW snapshot
        // carrying the fresh value — the memo barrier opens on it.
        const liveState = (game as unknown as { state: SudokuState }).state
        const flatIndex = liveState.grid.cells
            .flat()
            .findIndex(cell => cell.value === null)
        liveState.grid.cells[Math.floor(flatIndex / 9)][flatIndex % 9].value = 9
        const mutated = port.project(game.getState(), game) as {
            grid: { cells: Array<Array<{ value: number | null }>> }
        }
        expect(mutated.grid).not.toBe(projected.grid)
        expect(
            mutated.grid.cells[Math.floor(flatIndex / 9)][flatIndex % 9].value
        ).toBe(9)
        game.destroy()
    })

    test('the Sudoku port labels finished-run outcomes', () => {
        const port = getNativeGameEntry(GameID.SUDOKU)?.port
        expect(port).toBeDefined()
        if (!port?.resultOutcomeLabel) {
            return
        }
        const stats = (isComplete: boolean) =>
            ({ isComplete }) as unknown as BaseGameStats
        expect(port.resultOutcomeLabel(stats(true))).toBe('Solved')
        expect(port.resultOutcomeLabel(stats(false))).toBeNull()
    })

    test('the Quick Math pilot ships a board view and a question/accuracy projection', () => {
        const port = getNativeGameEntry(GameID.QUICK_MATH)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        const quickMath = game as QuickMathFrameworkGame
        const idle = port.project(game.getState(), game)
        // All primitives: the question text read through
        // getCurrentQuestion(), the counters, the model-owned accuracy
        // and the keypad gate. Idle shows no question at all.
        expect(idle).toEqual({
            question: null,
            questionsAnswered: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            accuracy: 0,
            canAnswer: false,
        })

        game.start()
        const running = port.project(game.getState(), game) as {
            question: string | null
            canAnswer: boolean
        }
        expect(typeof running.question).toBe('string')
        expect(running.canAnswer).toBe(true)

        // One correct answer drives the model's own accuracy formula.
        const answer = quickMath.getCurrentQuestion()?.answer
        expect(answer).toBeDefined()
        quickMath.submitAnswer(String(answer))
        expect(port.project(game.getState(), game)).toMatchObject({
            questionsAnswered: 1,
            correctAnswers: 1,
            incorrectAnswers: 0,
            accuracy: 100,
        })

        // A wrong answer still advances the quiz (Stage-1 state-change
        // fix): the fresh question reaches the projection.
        const wrongQuestion = quickMath.getCurrentQuestion()
        expect(wrongQuestion).toBeDefined()
        quickMath.submitAnswer(String((wrongQuestion?.answer ?? 0) + 1))
        const afterWrong = port.project(game.getState(), game) as {
            question: string | null
            incorrectAnswers: number
            accuracy: number
            questionsAnswered: number
        }
        expect(afterWrong.incorrectAnswers).toBe(1)
        expect(afterWrong.accuracy).toBe(50)
        expect(afterWrong.question).toBe(
            quickMath.getCurrentQuestion()?.question
        )
        // Stable advance: the model regenerated its question object (new
        // question each answer). Text inequality is flaky — random
        // consecutive questions can repeat the same text.
        expect(afterWrong.questionsAnswered).toBe(2)
        expect(quickMath.getCurrentQuestion()).not.toBe(wrongQuestion)
        game.destroy()
    })

    test('the Word Scramble pilot ships a board view and a challenge/counters projection', () => {
        const port = getNativeGameEntry(GameID.WORD_SCRAMBLE)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        const words = game as WordScrambleGame
        const idle = port.project(game.getState(), game)
        // All primitives: the challenge read through getCurrentChallenge()
        // (id for tray resets, scrambled letters, difficulty), the two
        // web-parity counters and the input gate. Idle shows no challenge.
        expect(idle).toEqual({
            challengeId: null,
            scrambledWord: null,
            difficulty: null,
            wordsUnscrambled: 0,
            correctAnswers: 0,
            canAnswer: false,
        })

        game.start()
        const first = words.getCurrentChallenge()
        expect(first).toBeDefined()
        if (!first) {
            return
        }
        expect(port.project(game.getState(), game)).toMatchObject({
            challengeId: first.id,
            scrambledWord: first.scrambledWord,
            difficulty: first.difficulty,
            canAnswer: true,
        })

        // A correct answer counts on both counters.
        words.submitAnswer(first.originalWord)
        expect(port.project(game.getState(), game)).toMatchObject({
            wordsUnscrambled: 1,
            correctAnswers: 1,
        })

        // A wrong answer (Stage-1 state-change fix) still advances: the
        // fresh challenge reaches the projection while Correct holds.
        const second = words.getCurrentChallenge()
        expect(second).toBeDefined()
        if (!second) {
            return
        }
        words.submitAnswer(second.originalWord.split('').reverse().join(''))
        const afterWrong = port.project(game.getState(), game) as {
            challengeId: string | null
            scrambledWord: string | null
            wordsUnscrambled: number
            correctAnswers: number
        }
        expect(afterWrong.correctAnswers).toBe(1)
        expect(afterWrong.wordsUnscrambled).toBe(2)
        expect(afterWrong.challengeId).not.toBe(second.id)
        expect(afterWrong.scrambledWord).toBe(
            words.getCurrentChallenge()?.scrambledWord
        )

        // A skip advances too, without touching Correct.
        words.skipCurrentChallenge()
        expect(port.project(game.getState(), game)).toMatchObject({
            wordsUnscrambled: 3,
            correctAnswers: 1,
        })
        expect(words.getCurrentChallenge()?.id).not.toBe(afterWrong.challengeId)

        // Reset returns the exact idle snapshot.
        game.reset()
        expect(port.project(game.getState(), game)).toEqual(idle)
        game.destroy()
    })

    test('the Snake pilot ships a board view and a HUD-only length/food projection', () => {
        const port = getNativeGameEntry(GameID.SNAKE)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios')) as SnakeGame
        expect(port.project(game.getState(), game)).toEqual({
            length: 3,
            foodsEaten: 0,
        })

        const project = port.createProjector?.(game)
        expect(project).toBeDefined()
        if (!project) {
            return
        }
        const idle = project(game.getState())
        game.start()
        const started = project(game.getState())
        expect(started).toBe(idle)

        const snakeGame = game as SnakeGame
        const mutable = snakeGame as unknown as {
            state: { lastMoveTime: number; food: unknown }
        }
        mutable.state.food = null
        mutable.state.lastMoveTime = Date.now() - 200
        snakeGame.update(0.016)
        const moved = project(game.getState())
        expect(moved).toBe(idle)

        mutable.state.food = {
            x: snakeGame.getHead().x + 1,
            y: snakeGame.getHead().y,
            id: 'registry-test-food',
            spawnTime: Date.now(),
        }
        mutable.state.lastMoveTime = Date.now() - 200
        snakeGame.update(0.016)
        const afterFood = project(game.getState())
        expect(afterFood).not.toBe(idle)
        expect(afterFood).toMatchObject({ length: 4, foodsEaten: 1 })
        game.destroy()
    })

    test('the Gravity Flip pilot ships a board view and a HUD-only badge projection', () => {
        const port = getNativeGameEntry(GameID.GRAVITY_FLIP)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        expect(port.project(game.getState(), game)).toEqual({
            gravityLabel: 'FLOOR ↓',
            stars: 0,
            flips: 0,
            canFlip: false,
        })

        game.start()
        game.update(0.016)
        const running = port.project(game.getState(), game)
        expect(running).toMatchObject({ canFlip: true })
        expect(running).not.toHaveProperty('distance')
        expect(running).not.toHaveProperty('speed')
        expect((game.getState() as GravityFlipState).distance).toBeGreaterThan(
            0
        )
        game.destroy()
    })

    test('the Gravity Flip frame projector stays value-stable across 60 normal-timestep frames', () => {
        const port = getNativeGameEntry(GameID.GRAVITY_FLIP)?.port
        expect(port).toBeDefined()
        if (!port?.createProjector) {
            return
        }
        const game = port.createGame(hostDeps('ios'))
        const project = port.createProjector(game)
        game.start()
        const first = project(game.getState())
        for (let frame = 0; frame < 60; frame++) {
            game.update(1 / 60)
            expect(project(game.getState())).toBe(first)
        }
        expect((game.getState() as GravityFlipState).distance).toBeGreaterThan(
            150
        )
        ;(game as GravityFlipGame).flipGravity()
        const afterFlip = project(game.getState())
        expect(afterFlip).not.toBe(first)
        expect(afterFlip.gravityLabel).toBe('CEILING ↑')
        expect(afterFlip.flips).toBe(1)
        game.destroy()
    })

    test('the Gravity Flip port labels finished-run outcomes', () => {
        const port = getNativeGameEntry(GameID.GRAVITY_FLIP)?.port
        expect(port).toBeDefined()
        if (!port?.resultOutcomeLabel) {
            return
        }
        const stats = (outcome: string) =>
            ({ outcome }) as unknown as BaseGameStats
        expect(port.resultOutcomeLabel(stats('survived'))).toBe('Survived')
        expect(port.resultOutcomeLabel(stats('collision'))).toBe('Collision')
        expect(port.resultOutcomeLabel(stats('playing'))).toBeNull()
    })

    test('the 2048 pilot ships a board view and a copied-tile projection', () => {
        const port = getNativeGameEntry(GameID.GAME_2048)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        const idle = port.project(game.getState(), game)
        expect(idle).toEqual({
            tiles: [],
            maxTile: 0,
            undosLeft: 1,
            won: false,
            stuck: false,
            canUndo: false,
            canAct: false,
            clock: 0,
        })

        game.start()
        const running = port.project(game.getState(), game) as {
            tiles: Array<{
                id: string
                value: number
                row: number
                col: number
                pop: boolean
            }>
            canAct: boolean
        }
        expect(running.tiles).toHaveLength(2)
        for (const tile of running.tiles) {
            expect(typeof tile.id).toBe('string')
            expect([2, 4]).toContain(tile.value)
            expect(tile.row).toBeGreaterThanOrEqual(0)
            expect(tile.row).toBeLessThan(4)
            expect(tile.col).toBeGreaterThanOrEqual(0)
            expect(tile.col).toBeLessThan(4)
            expect(tile.pop).toBe(false)
        }
        expect(running.canAct).toBe(true)

        const liveState = game.getState() as Game2048State
        const liveTile = liveState.board.flat().find(Boolean) as Tile
        liveTile.value = 128
        const mutated = port.project(game.getState(), game) as {
            tiles: Array<{ id: string; value: number }>
        }
        expect(mutated.tiles.find(tile => tile.id === liveTile.id)?.value).toBe(
            128
        )
        game.destroy()
    })

    test('the 2048 projector keeps the tile list stable across clock-only ticks', async () => {
        const port = getNativeGameEntry(GameID.GAME_2048)?.port
        expect(port).toBeDefined()
        expect(port?.createProjector).toBeDefined()
        if (!port?.createProjector) {
            return
        }
        const game = port.createGame(hostDeps('ios'))
        const project = port.createProjector(game)
        game.start()
        const first = project(game.getState())
        await new Promise(resolve => setTimeout(resolve, 1100))
        const afterTick = project(game.getState())
        expect(afterTick).not.toBe(first)
        expect(afterTick.clock).toBeGreaterThan(0)
        expect(afterTick.tiles).toBe(first.tiles)

        const liveState = game.getState() as Game2048State
        const emptyIndex = liveState.board.flat().findIndex(cell => !cell)
        const row = Math.floor(emptyIndex / 4)
        const col = emptyIndex % 4
        liveState.board[row][col] = {
            id: 'registry-extra',
            value: 16,
            position: { row, col },
        }
        const afterEdit = project(game.getState())
        expect(afterEdit.tiles).not.toBe(first.tiles)
        expect(afterEdit.tiles).toHaveLength(3)
        game.destroy()
    })

    test('the 2048 port labels finished-run outcomes', () => {
        const port = getNativeGameEntry(GameID.GAME_2048)?.port
        expect(port).toBeDefined()
        expect(port?.resultOutcomeLabel).toBeDefined()
        if (!port?.resultOutcomeLabel) {
            return
        }
        const stats = (won: boolean) => ({ won }) as unknown as Game2048Stats
        expect(port.resultOutcomeLabel(stats(true))).toBe('Reached 2048')
        expect(port.resultOutcomeLabel(stats(false))).toBeNull()
    })

    test('the Reflex pilot ships a board view and a copied-object projection', () => {
        const port = getNativeGameEntry(GameID.REFLEX)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios')) as ReflexGame
        const idle = port.project(game.getState(), game)
        expect(idle).toEqual({
            objects: [],
            coins: 0,
            bombs: 0,
            accuracy: 0,
        })

        game.start()
        const spawn = game.spawnRandomObject()
        expect(spawn.success).toBe(true)
        const live = game.getActiveObjects()[0]
        const running = port.project(game.getState(), game) as {
            objects: Array<{
                id: string
                type: string
                row: number
                col: number
            }>
        }
        expect(running.objects).toEqual([
            {
                id: live.id,
                type: live.type,
                row: live.cell.row,
                col: live.cell.col,
            },
        ])

        live.cell.row = 3
        live.cell.col = 4
        const moved = port.project(game.getState(), game) as {
            objects: Array<{ row: number; col: number }>
        }
        expect(moved.objects[0]).toMatchObject({ row: 3, col: 4 })
        game.destroy()
    })

    test('the Reflex projector stays value-stable across 60 no-op updates and re-projects on real changes', () => {
        const port = getNativeGameEntry(GameID.REFLEX)?.port
        expect(port).toBeDefined()
        expect(port?.createProjector).toBeDefined()
        if (!port?.createProjector) {
            return
        }
        const game = port.createGame(hostDeps('ios')) as ReflexGame
        const project = port.createProjector(game)
        game.start()
        game.spawnRandomObject()
        const first = project(game.getState())
        for (let frame = 0; frame < 60; frame++) {
            game.update(1 / 60)
            expect(project(game.getState())).toBe(first)
        }

        const live = game.getActiveObjects()[0]
        game.handleCellClick(live.cell.row, live.cell.col)
        const afterClick = project(game.getState())
        expect(afterClick).not.toBe(first)
        expect(afterClick).toMatchObject({ objects: [] })
        game.destroy()
    })

    test('the Signal Switch pilot ships a board view and a HUD-only projection', () => {
        const port = getNativeGameEntry(GameID.SIGNAL_SWITCH)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        expect(port.project(game.getState(), game)).toEqual({
            integrity: 3,
            combo: 0,
            safePasses: 0,
            lanes: '2 / 4',
        })

        game.start()
        game.update(0.1)
        const running = port.project(game.getState(), game)
        expect(running).not.toHaveProperty('drones')
        expect(running).not.toHaveProperty('gateSignals')
        expect(running).not.toHaveProperty('speed')
        expect(running).not.toHaveProperty('activeLaneCount')
        game.destroy()
    })

    test('the Signal Switch frame projector stays value-stable across 60 moving frames', () => {
        const port = getNativeGameEntry(GameID.SIGNAL_SWITCH)?.port
        expect(port).toBeDefined()
        expect(port?.createProjector).toBeDefined()
        if (!port?.createProjector) {
            return
        }
        const game = port.createGame(hostDeps('ios')) as SignalSwitchGame
        const project = port.createProjector(game)
        game.start()
        const first = project(game.getState())
        for (let frame = 0; frame < 60; frame++) {
            game.update(1 / 60)
            expect(project(game.getState())).toBe(first)
        }
        const state = game.getState() as SignalSwitchState
        expect(state.drones[0]?.x).toBeGreaterThan(
            SIGNAL_SWITCH_RULES.droneSpawnX
        )

        ;(game as unknown as { state: SignalSwitchState }).state.integrity = 2
        const afterHit = project(game.getState())
        expect(afterHit).not.toBe(first)
        expect(afterHit.integrity).toBe(2)
        game.destroy()
    })

    test('the Signal Switch port labels finished-run outcomes', () => {
        const port = getNativeGameEntry(GameID.SIGNAL_SWITCH)?.port
        expect(port).toBeDefined()
        expect(port?.resultOutcomeLabel).toBeDefined()
        if (!port?.resultOutcomeLabel) {
            return
        }
        const stats = (outcome: string) =>
            ({ outcome }) as unknown as SignalSwitchStats
        expect(port.resultOutcomeLabel(stats('survived'))).toBe('Survived')
        expect(port.resultOutcomeLabel(stats('systems-failed'))).toBe(
            'Systems failed'
        )
        expect(port.resultOutcomeLabel(stats('playing'))).toBeNull()
    })

    test('the Evader pilot ships a board view and a HUD-only coins/bombs projection', () => {
        const port = getNativeGameEntry(GameID.EVADER)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        expect(port.project(game.getState(), game)).toEqual({
            coins: 0,
            bombs: 0,
        })

        game.start()
        const running = port.project(game.getState(), game)
        expect(running).not.toHaveProperty('objects')
        expect(running).not.toHaveProperty('player')
        game.destroy()
    })

    test('the Evader frame projector stays value-stable across 60 moving frames', () => {
        const port = getNativeGameEntry(GameID.EVADER)?.port
        expect(port).toBeDefined()
        expect(port?.createProjector).toBeDefined()
        if (!port?.createProjector) {
            return
        }
        const game = port.createGame(hostDeps('ios')) as EvaderGame
        const project = port.createProjector(game)
        game.start()
        game.spawnRandomObject()
        const first = project(game.getState())
        for (let frame = 0; frame < 60; frame++) {
            game.update(1 / 60)
            expect(project(game.getState())).toBe(first)
        }
        const state = game.getState() as EvaderState
        expect(state.objects.length).toBeGreaterThan(0)
        expect(state.objects[0].x).toBeLessThan(800)

        ;(game as unknown as { state: EvaderState }).state.coinsCollected = 2
        const afterCoin = project(game.getState())
        expect(afterCoin).not.toBe(first)
        expect(afterCoin.coins).toBe(2)
        game.destroy()
    })

    test('the Path Navigator pilot ships a board view and a HUD-only level projection', () => {
        const port = getNativeGameEntry(GameID.PATH_NAVIGATOR)?.port
        expect(port).toBeDefined()
        if (!port) {
            return
        }
        expect(port.view).toBeDefined()
        const game = port.createGame(hostDeps('ios'))
        expect(port.project(game.getState(), game)).toEqual({
            currentLevel: 1,
            totalLevels: GAME_LEVELS.length,
            isGameWon: false,
            canNavigate: false,
        })

        game.start()
        const running = port.project(game.getState(), game)
        expect(running).toMatchObject({ canNavigate: true })
        expect(running).not.toHaveProperty('cursor')
        expect(running).not.toHaveProperty('isOnPath')
        game.destroy()
    })

    test('the Path Navigator projector ignores cursor samples and re-projects on pause and level changes', () => {
        const port = getNativeGameEntry(GameID.PATH_NAVIGATOR)?.port
        expect(port).toBeDefined()
        expect(port?.createProjector).toBeDefined()
        if (!port?.createProjector) {
            return
        }
        const game = port.createGame(hostDeps('ios')) as PathNavigatorGame
        const project = port.createProjector(game)
        game.start()
        const first = project(game.getState())

        game.updatePlayerPosition(200, 300)
        game.updatePlayerPosition(400, 300)
        expect((game.getState() as PathNavigatorState).cursor.x).toBe(400)
        expect(project(game.getState())).toBe(first)

        game.pause()
        const paused = project(game.getState())
        expect(paused).not.toBe(first)
        expect(paused.canNavigate).toBe(false)

        game.resume()
        expect(project(game.getState())).toMatchObject({ canNavigate: true })

        const endPoint = GAME_LEVELS[0].path.endPoint
        game.updatePlayerPosition(endPoint.x, endPoint.y)
        const afterLevel = project(game.getState())
        expect(afterLevel).not.toBe(first)
        expect(afterLevel).toMatchObject({ currentLevel: 2 })
        game.destroy()
    })

    test('the Path Navigator port labels only genuine clears, never a cause it cannot verify', async () => {
        const port = getNativeGameEntry(GameID.PATH_NAVIGATOR)?.port
        expect(port).toBeDefined()
        expect(port?.resultOutcomeLabel).toBeDefined()
        if (!port?.resultOutcomeLabel) {
            return
        }
        const label = port.resultOutcomeLabel
        expect(
            label({
                levelsCompleted: GAME_LEVELS.length,
            } as PathNavigatorStats)
        ).toBe('Cleared')

        jest.useFakeTimers()
        try {
            const game = port.createGame(hostDeps('ios')) as PathNavigatorGame
            game.start()
            await jest.advanceTimersByTimeAsync(61_000)

            expect(game.getState().isGameOver).toBe(true)
            const stats = game.getGameStats() as PathNavigatorStats
            expect(stats.levelsCompleted).toBe(0)
            expect(stats.pathViolations).toBe(1)
            expect(label(stats)).toBeNull()
            game.destroy()
        } finally {
            jest.useRealTimers()
        }
    })

    test('keys are computed from imported enum members, never bare strings', () => {
        const source = readFileSync(
            resolve(process.cwd(), 'src/games/registry.ts'),
            'utf-8'
        )
        const memberName = (id: GameID): string | undefined =>
            Object.entries(GameID).find(([, value]) => value === id)?.[0]
        for (const id of EXPECTED_NATIVE_IDS) {
            expect(source).toContain(`[GameID.${String(memberName(id))}]:`)
        }
        for (const bare of EXPECTED_NATIVE_IDS) {
            expect(source).not.toContain(`'${bare}'`)
            expect(source).not.toContain(`"${bare}"`)
        }
        // There is exactly one registry map — no second id constant beside it.
        expect(source.match(/Record<GameID,/g)).toHaveLength(1)
    })
})
