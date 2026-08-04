import { describe, expect, it } from 'vitest'
import type { BoardTransform, GridPosition } from './types'
import {
    BOARD_TRANSFORMS,
    getUniqueBoardTransforms,
    hashBoardRows,
    inverseBoardTransform,
    serializeBoardRows,
    transformPosition,
    transformRows,
} from './transforms'

describe('Ice Slide board transforms', () => {
    const rows = ['ABC', 'DEF'] as const

    it.each([
        ['identity', ['ABC', 'DEF']],
        ['rotate_90', ['DA', 'EB', 'FC']],
        ['rotate_180', ['FED', 'CBA']],
        ['rotate_270', ['CF', 'BE', 'AD']],
        ['reflect_horizontal', ['DEF', 'ABC']],
        ['reflect_vertical', ['CBA', 'FED']],
        ['reflect_main_diagonal', ['AD', 'BE', 'CF']],
        ['reflect_anti_diagonal', ['FC', 'EB', 'DA']],
    ] as const)(
        'applies %s',
        (transform: BoardTransform, expected: readonly string[]) => {
            expect(transformRows(rows, transform)).toEqual(expected)
        }
    )

    it('locks transform enumeration order', () => {
        expect(BOARD_TRANSFORMS).toEqual([
            'identity',
            'rotate_90',
            'rotate_180',
            'rotate_270',
            'reflect_horizontal',
            'reflect_vertical',
            'reflect_main_diagonal',
            'reflect_anti_diagonal',
        ])
    })
})

it.each(BOARD_TRANSFORMS)(
    'keeps transformed coordinates aligned for %s',
    (transform: BoardTransform) => {
        const source = ['ABC', 'DEF']
        const transformed = transformRows(source, transform)

        const sourceRows = source.length
        const sourceCols = source[0].length

        for (let row = 0; row < sourceRows; row++) {
            for (let col = 0; col < sourceCols; col++) {
                const target = transformPosition(
                    { row, col },
                    sourceRows,
                    sourceCols,
                    transform
                )
                expect(transformed[target.row][target.col]).toBe(
                    source[row][col]
                )
            }
        }
    }
)

it('throws RangeError for an out-of-range position', () => {
    expect(() =>
        transformPosition({ row: 5, col: 0 }, 2, 3, 'identity')
    ).toThrow(RangeError)
})

it.each(BOARD_TRANSFORMS)(
    'round-trips rows through inverse %s',
    (transform: BoardTransform) => {
        const source = ['ABC', 'DEF']
        const transformed = transformRows(source, transform)
        expect(
            transformRows(transformed, inverseBoardTransform(transform))
        ).toEqual(source)
    }
)

it('serializes dimensions and row boundaries exactly', () => {
    expect(serializeBoardRows(['AB', 'CD'])).toBe('2x2\u001fAB\u001eCD')
    expect(hashBoardRows(['AB', 'CD'])).toMatch(/^[0-9a-f]{8}$/)
})

it.each([
    [[]] as [string[]],
    [['']] as [string[]],
    [['ABC', 'DE']] as [string[]],
])('rejects malformed canonical rows %j', (rows: string[]) => {
    expect(() => serializeBoardRows(rows)).toThrow(RangeError)
    expect(() => hashBoardRows(rows)).toThrow(RangeError)
})

it.each([
    ['negative row', { row: -1, col: 0 }, 2, 2],
    ['negative col', { row: 0, col: -1 }, 2, 2],
    ['row out of range', { row: 2, col: 0 }, 2, 2],
    ['col out of range', { row: 0, col: 2 }, 2, 2],
    ['fractional inputRows', { row: 0, col: 0 }, 1.5, 2],
    ['fractional inputCols', { row: 0, col: 0 }, 2, 1.5],
    ['fractional position row', { row: 0.5, col: 0 }, 2, 2],
    ['fractional position col', { row: 0, col: 0.5 }, 2, 2],
    ['zero inputCols', { row: 0, col: 0 }, 2, 0],
] as const)(
    'rejects out-of-bounds position for %s',
    (
        _name: string,
        position: GridPosition,
        inputRows: number,
        inputCols: number
    ) => {
        expect(() =>
            transformPosition(position, inputRows, inputCols, 'identity')
        ).toThrow(RangeError)
    }
)

it('deduplicates by complete canonical serialization', () => {
    const variants = getUniqueBoardTransforms(['AAA', 'ABA', 'AAA'])
    expect(variants).toHaveLength(1)
    expect(variants[0].transform).toBe('identity')
})

it('retains all variants for an asymmetric rectangle', () => {
    const variants = getUniqueBoardTransforms(['ABC', 'DEF'])
    expect(variants).toHaveLength(8)
    expect(variants.map(variant => variant.transform)).toEqual(BOARD_TRANSFORMS)
    expect(new Set(variants.map(variant => variant.canonicalKey)).size).toBe(8)
})

it('keeps exactly two variants for a board with fourfold rotation symmetry', () => {
    const variants = getUniqueBoardTransforms(['ABCA', 'CDDB', 'BDDC', 'ACBA'])
    expect(variants).toHaveLength(2)
    expect(variants.map(variant => variant.transform)).toEqual([
        'identity',
        'reflect_horizontal',
    ])
    expect(new Set(variants.map(variant => variant.canonicalKey)).size).toBe(2)
})

it('keeps exactly four variants for a board with half-turn symmetry', () => {
    const variants = getUniqueBoardTransforms(['ABC', 'CBA'])
    expect(variants).toHaveLength(4)
    expect(variants.map(variant => variant.transform)).toEqual([
        'identity',
        'rotate_90',
        'reflect_horizontal',
        'reflect_main_diagonal',
    ])
    expect(new Set(variants.map(variant => variant.canonicalKey)).size).toBe(4)
})
