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
import type { BaseGame, BaseGameConfig } from '@cetus/games'
import { MemoryMatrixGame } from '@cetus/games/memory-matrix/MemoryMatrixGame'
import { MineGridGame } from '@cetus/games/mine-grid/MineGridGame'
import { PatternPulseGame } from '@cetus/games/pattern-pulse/PatternPulseGame'
import { PotionSorterGame } from '@cetus/games/potion-sorter/PotionSorterGame'
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
