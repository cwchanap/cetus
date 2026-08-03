import { describe, expect, it } from 'vitest'
import {
    cloneGrid,
    countCrystals,
    findStart,
    parseGrid,
    slide,
} from './physics'
import { getLevel, ICE_SLIDE_LEVELS } from './levels'
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
    function minMoves(level: (typeof ICE_SLIDE_LEVELS)[number]): number | null {
        const base = parseGrid(level)
        const start = findStart(base)
        const crystalPositions: Array<[number, number]> = []
        for (let r = 0; r < base.length; r++) {
            for (let c = 0; c < base[r].length; c++) {
                if (base[r][c] === 'crystal') {
                    crystalPositions.push([r, c])
                }
            }
        }
        const key = (r: number, c: number, mask: number) => `${r},${c},${mask}`
        const queue = [
            {
                r: start.row,
                c: start.col,
                moves: 0,
                grid: cloneGrid(base),
            },
        ]
        queue[0].grid[start.row][start.col] = 'ice'
        const seen = new Set([key(start.row, start.col, 0)])
        let best: number | null = null
        const dirs = ['N', 'E', 'S', 'W'] as const

        while (queue.length) {
            const cur = queue.shift()
            if (!cur) {
                break
            }
            for (const d of dirs) {
                const g = cloneGrid(cur.grid)
                const outcome = slide(
                    g,
                    { row: cur.r, col: cur.c },
                    DIRECTION_DELTA[d]
                )
                if (outcome.kind === 'noop' || outcome.kind === 'hazard') {
                    continue
                }
                let newMask = 0
                for (let i = 0; i < crystalPositions.length; i++) {
                    const [cr, cc] = crystalPositions[i]
                    if (g[cr][cc] !== 'crystal') {
                        newMask |= 1 << i
                    }
                }
                const nk = key(outcome.end.row, outcome.end.col, newMask)
                if (seen.has(nk)) {
                    continue
                }
                seen.add(nk)
                const moves = cur.moves + 1
                if (outcome.reachedGoal) {
                    if (best === null || moves < best) {
                        best = moves
                    }
                    continue
                }
                if (moves < 25) {
                    queue.push({
                        r: outcome.end.row,
                        c: outcome.end.col,
                        moves,
                        grid: g,
                    })
                }
            }
        }
        return best
    }

    it('ships exactly 8 solvable levels with matching parMoves', () => {
        expect(ICE_SLIDE_LEVELS).toHaveLength(8)
        for (const level of ICE_SLIDE_LEVELS) {
            const min = minMoves(level)
            expect(min, `level ${level.id} solvable`).not.toBeNull()
            expect(min, `level ${level.id} par`).toBe(level.parMoves)
        }
    })

    it('makes every authored crystal collectable on a reachable slide', () => {
        for (const level of ICE_SLIDE_LEVELS) {
            const base = parseGrid(level)
            const start = findStart(base)
            const crystalKeys: string[] = []
            for (let r = 0; r < base.length; r++) {
                for (let c = 0; c < base[r].length; c++) {
                    if (base[r][c] === 'crystal') {
                        crystalKeys.push(`${r},${c}`)
                    }
                }
            }
            if (crystalKeys.length === 0) {
                continue
            }

            type Node = {
                r: number
                c: number
                grid: ReturnType<typeof cloneGrid>
                collected: Set<string>
            }
            const queue: Node[] = [
                {
                    r: start.row,
                    c: start.col,
                    grid: cloneGrid(base),
                    collected: new Set(),
                },
            ]
            queue[0].grid[start.row][start.col] = 'ice'
            const seen = new Set([`${start.row},${start.col},`])
            const collectable = new Set<string>()
            const dirs = ['N', 'E', 'S', 'W'] as const

            while (queue.length) {
                const cur = queue.shift()
                if (!cur) {
                    break
                }
                for (const d of dirs) {
                    const g = cloneGrid(cur.grid)
                    const before = new Set<string>()
                    for (let r = 0; r < g.length; r++) {
                        for (let c = 0; c < g[r].length; c++) {
                            if (g[r][c] === 'crystal') {
                                before.add(`${r},${c}`)
                            }
                        }
                    }
                    const outcome = slide(
                        g,
                        { row: cur.r, col: cur.c },
                        DIRECTION_DELTA[d]
                    )
                    if (outcome.kind === 'noop' || outcome.kind === 'hazard') {
                        continue
                    }
                    const collected = new Set(cur.collected)
                    if (outcome.kind === 'moved' && outcome.crystals > 0) {
                        for (const key of before) {
                            const [rr, cc] = key.split(',').map(Number)
                            if (g[rr][cc] !== 'crystal') {
                                collected.add(key)
                                collectable.add(key)
                            }
                        }
                    }
                    const mask = [...collected].sort().join('|')
                    const nk = `${outcome.end.row},${outcome.end.col},${mask}`
                    if (seen.has(nk)) {
                        continue
                    }
                    seen.add(nk)
                    if (!outcome.reachedGoal) {
                        queue.push({
                            r: outcome.end.row,
                            c: outcome.end.col,
                            grid: g,
                            collected,
                        })
                    }
                }
            }

            for (const key of crystalKeys) {
                expect(
                    collectable.has(key),
                    `level ${level.id} crystal ${key} reachable`
                ).toBe(true)
            }
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
