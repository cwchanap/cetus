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
import { WordScrambleGame } from '@cetus/games/word-scramble/WordScrambleGame'
import { ChromaticTideGame } from '@cetus/games/chromatic-tide/ChromaticTideGame'

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
]

const hostDeps = (platform: 'ios' | 'android') => {
    const submitScore: ScoreSubmitter = async () => ({ success: true })
    return { submitScore, platform }
}

// HPA-425 wave 1: exactly these eight games are native-destined. The list
// is duplicated here on purpose — the test must fail if the registry drifts.
const EXPECTED_NATIVE_IDS = [
    GameID.CHROMATIC_TIDE,
    GameID.MEMORY_MATRIX,
    GameID.MINE_GRID,
    GameID.PATTERN_PULSE,
    GameID.POTION_SORTER,
    GameID.QUICK_MATH,
    GameID.SUDOKU,
    GameID.WORD_SCRAMBLE,
] as const

const process = jest.requireActual('node:process') as { cwd: () => string }

describe('NATIVE_GAMES registry', () => {
    test('contains exactly the eight wave-1 game ids', () => {
        expect(Object.keys(NATIVE_GAMES).sort()).toEqual(
            [...EXPECTED_NATIVE_IDS].sort()
        )
        for (const id of EXPECTED_NATIVE_IDS) {
            expect(getNativeGameEntry(id)).toBeDefined()
        }
    })

    test('registry and catalog counts line up: 8 playable, 15 disabled of 23', () => {
        expect(GAMES).toHaveLength(23)
        expect(getActiveGames()).toHaveLength(23)
        expect(Object.keys(NATIVE_GAMES)).toHaveLength(8)
        const playable = GAMES.filter(game => isNativePlayable(game.id))
        const disabled = GAMES.filter(game => !isNativePlayable(game.id))
        expect(playable.map(game => game.id).sort()).toEqual(
            [...EXPECTED_NATIVE_IDS].sort()
        )
        expect(disabled).toHaveLength(15)
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

    test('keys are computed from imported enum members, never bare strings', () => {
        const source = readFileSync(
            resolve(process.cwd(), 'src/games/registry.ts'),
            'utf-8'
        )
        for (const id of EXPECTED_NATIVE_IDS) {
            expect(source).toContain(`[GameID.${id.toUpperCase()}]:`)
        }
        for (const bare of EXPECTED_NATIVE_IDS) {
            expect(source).not.toContain(`'${bare}'`)
            expect(source).not.toContain(`"${bare}"`)
        }
        // There is exactly one registry map — no second id constant beside it.
        expect(source.match(/Record<GameID,/g)).toHaveLength(1)
    })
})
