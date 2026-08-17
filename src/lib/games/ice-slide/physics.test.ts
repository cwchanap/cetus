import { describe, expect, it } from 'vitest'
import {
    cloneGrid,
    countCrystals,
    findStart,
    parseGrid,
    slide,
} from './physics'
import { getLevel, ICE_SLIDE_LEVELS } from './levels'
import { solveIceSlideBoard } from './solver'
import { DIRECTION_DELTA } from './types'
import {
    crystalBonus,
    levelClearPoints,
    levelScore,
    moveBonus,
    timeBonus,
} from './scoring'

describe('ice-slide physics', () => {
    it('parses glyphs and finds start', () => {
        const grid = parseGrid({
            id: 99,
            rows: ['####', '#SG#', '####'],
        })
        expect(grid[1][1]).toBe('start')
        expect(grid[1][2]).toBe('goal')
        expect(findStart(grid)).toEqual({ row: 1, col: 1 })
    })

    it('parses the snow glyph', () => {
        const grid = parseGrid({
            id: 'snow-parse',
            rows: ['#####', '#SNG#', '#####'],
        })
        expect(grid[1][2]).toBe('snow')
    })

    it('rejects empty, jagged, and unknown glyphs', () => {
        expect(() => parseGrid({ id: 1, rows: [] })).toThrow(/no rows/)
        expect(() =>
            parseGrid({
                id: 2,
                rows: ['###', '##'],
            })
        ).toThrow(/length/)
        expect(() =>
            parseGrid({
                id: 3,
                rows: ['###', '#X#', '###'],
            })
        ).toThrow(/unknown glyph/)
    })

    it('throws when start is missing', () => {
        const grid = parseGrid({
            id: 99,
            rows: ['###', '#.#', '###'],
        })
        expect(() => findStart(grid)).toThrow(/missing a start/)
    })

    it('slides until a wall and stops before it', () => {
        const grid = parseGrid({
            id: 99,
            rows: ['#####', '#S..#', '#####'],
        })
        const start = findStart(grid)
        grid[start.row][start.col] = 'ice'
        const outcome = slide(grid, start, DIRECTION_DELTA.E)
        expect(outcome.kind).toBe('moved')
        if (outcome.kind === 'moved') {
            expect(outcome.end).toEqual({ row: 1, col: 3 })
            expect(outcome.reachedGoal).toBe(false)
        }
    })

    it('stops at the board edge when there is no wall border', () => {
        const grid: ReturnType<typeof parseGrid> = [
            ['ice', 'ice', 'ice'],
            ['ice', 'ice', 'ice'],
            ['ice', 'ice', 'ice'],
        ]
        const outcome = slide(grid, { row: 1, col: 0 }, DIRECTION_DELTA.E)
        expect(outcome.kind).toBe('moved')
        if (outcome.kind === 'moved') {
            expect(outcome.end).toEqual({ row: 1, col: 2 })
        }
    })

    it('stops before a rock', () => {
        const grid = parseGrid({
            id: 99,
            rows: ['#####', '#S.O#', '#####'],
        })
        const start = findStart(grid)
        grid[start.row][start.col] = 'ice'
        const outcome = slide(grid, start, DIRECTION_DELTA.E)
        expect(outcome.kind).toBe('moved')
        if (outcome.kind === 'moved') {
            expect(outcome.end).toEqual({ row: 1, col: 2 })
        }
    })

    it('stops on the goal', () => {
        const grid = parseGrid({
            id: 99,
            rows: ['#####', '#S.G#', '#####'],
        })
        const start = findStart(grid)
        grid[start.row][start.col] = 'ice'
        const outcome = slide(grid, start, DIRECTION_DELTA.E)
        expect(outcome.kind).toBe('moved')
        if (outcome.kind === 'moved') {
            expect(outcome.end).toEqual({ row: 1, col: 3 })
            expect(outcome.reachedGoal).toBe(true)
        }
    })

    it('stops when entering a snow tile', () => {
        const grid = parseGrid({
            id: 'snow-stop',
            rows: ['#######', '#S.N..#', '#######'],
        })
        const start = findStart(grid)
        grid[start.row][start.col] = 'ice'
        const outcome = slide(grid, start, DIRECTION_DELTA.E)

        expect(outcome.kind).toBe('moved')
        if (outcome.kind === 'moved') {
            expect(outcome.end).toEqual({ row: 1, col: 3 })
            expect(outcome.path.at(-1)).toEqual({ row: 1, col: 3 })
            expect(outcome.path).not.toContainEqual({ row: 1, col: 4 })
            expect(outcome.path).not.toContainEqual({ row: 1, col: 5 })
        }
        expect(grid[1][3]).toBe('snow')
    })

    it('can leave a snow tile in either direction', () => {
        const grid = parseGrid({
            id: 'leave-snow',
            rows: ['#######', '#..N..#', '#######'],
        })

        expect(
            slide(grid, { row: 1, col: 3 }, DIRECTION_DELTA.E)
        ).toMatchObject({
            kind: 'moved',
            end: { row: 1, col: 5 },
        })
        expect(
            slide(grid, { row: 1, col: 3 }, DIRECTION_DELTA.W)
        ).toMatchObject({
            kind: 'moved',
            end: { row: 1, col: 1 },
        })
    })

    it('collects a crystal before stopping on snow', () => {
        const grid = parseGrid({
            id: 'crystal-then-snow',
            rows: ['#######', '#S.CN.#', '#######'],
        })
        const start = findStart(grid)
        grid[start.row][start.col] = 'ice'
        const outcome = slide(grid, start, DIRECTION_DELTA.E)

        expect(outcome.kind).toBe('moved')
        if (outcome.kind === 'moved') {
            expect(outcome.crystals).toBe(1)
            expect(outcome.end).toEqual({ row: 1, col: 4 })
            expect(outcome.path).not.toContainEqual({ row: 1, col: 5 })
        }
        expect(grid[1][3]).toBe('ice')
        expect(grid[1][4]).toBe('snow')
    })

    it('collects crystals while sliding', () => {
        const grid = parseGrid({
            id: 99,
            rows: ['######', '#S.C.#', '######'],
        })
        const start = findStart(grid)
        grid[start.row][start.col] = 'ice'
        expect(countCrystals(grid)).toBe(1)
        const outcome = slide(grid, start, DIRECTION_DELTA.E)
        expect(outcome.kind).toBe('moved')
        if (outcome.kind === 'moved') {
            expect(outcome.crystals).toBe(1)
            expect(countCrystals(grid)).toBe(0)
        }
    })

    it('reports hazard when entering a hole', () => {
        const grid = parseGrid({
            id: 99,
            rows: ['#####', '#S.H#', '#####'],
        })
        const start = findStart(grid)
        grid[start.row][start.col] = 'ice'
        const outcome = slide(grid, start, DIRECTION_DELTA.E)
        expect(outcome.kind).toBe('hazard')
    })

    it('no-ops when the adjacent cell is blocked', () => {
        const grid = parseGrid({
            id: 99,
            rows: ['###', '#S#', '###'],
        })
        const start = findStart(grid)
        grid[start.row][start.col] = 'ice'
        expect(slide(grid, start, DIRECTION_DELTA.N).kind).toBe('noop')
    })

    it('cloneGrid is deep enough to isolate mutations', () => {
        const grid = parseGrid(ICE_SLIDE_LEVELS[0])
        const copy = cloneGrid(grid)
        copy[1][1] = 'hazard'
        expect(grid[1][1]).not.toBe('hazard')
    })
})

describe('ice-slide scoring', () => {
    it('computes level clear, move, crystal, and time bonuses', () => {
        expect(levelClearPoints(3)).toBe(600)
        // At-par earns one step; one under earns two steps.
        expect(moveBonus(5, 5)).toBe(25)
        expect(moveBonus(5, 4)).toBe(50)
        expect(moveBonus(5, 3)).toBe(75)
        expect(moveBonus(3, 5)).toBe(0)
        expect(crystalBonus(2)).toBe(100)
        expect(timeBonus(60)).toBe(1500)
        expect(timeBonus(400)).toBe(0)
        expect(
            levelScore({
                levelNumber: 2,
                parMoves: 4,
                movesUsed: 4,
                crystalsCollected: 1,
            })
        ).toBe(400 + 25 + 50)
    })
})

describe('ice-slide levels', () => {
    it('ships exactly 8 solvable levels with matching parMoves', () => {
        expect(ICE_SLIDE_LEVELS).toHaveLength(8)
        for (const level of ICE_SLIDE_LEVELS) {
            const result = solveIceSlideBoard(level, { maxStates: 10_000 })
            expect(result.truncated, `level ${level.id} truncated`).toBe(false)
            expect(result.solvable, `level ${level.id} solvable`).toBe(true)
            expect(result.minMoves, `level ${level.id} par`).toBe(
                level.parMoves
            )
        }
    })

    it('makes every authored crystal collectable on a reachable slide', () => {
        for (const level of ICE_SLIDE_LEVELS) {
            const expected: string[] = []
            for (let r = 0; r < level.rows.length; r++) {
                for (let c = 0; c < level.rows[r].length; c++) {
                    if (level.rows[r][c] === 'C') {
                        expected.push(`${r},${c}`)
                    }
                }
            }
            const result = solveIceSlideBoard(level, { maxStates: 10_000 })
            expect(result.truncated, `level ${level.id} truncated`).toBe(false)
            expect(
                result.reachableCrystalIds,
                `level ${level.id} crystal coverage`
            ).toEqual(expected)
        }
    })

    it('getLevel throws out of range', () => {
        expect(() => getLevel(-1)).toThrow(/out of range/)
        expect(() => getLevel(ICE_SLIDE_LEVELS.length)).toThrow(/out of range/)
    })
})

it('parses materialized stage rows with a string id', () => {
    const grid = parseGrid({
        id: 'campaign:1',
        rows: ['#####', '#S.G#', '#####'],
    })
    expect(grid[1][1]).toBe('start')
    expect(grid[1][3]).toBe('goal')
})
