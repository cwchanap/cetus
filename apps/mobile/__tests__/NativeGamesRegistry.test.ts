/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
    getNativeGameEntry,
    isNativePlayable,
    NATIVE_GAMES,
} from '../src/games/registry'
import { GAMES, GameID, getActiveGames } from '@cetus/shared/games'

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
