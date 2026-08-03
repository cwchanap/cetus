import { hashString32Hex } from '../shared/seeded-rng'
import type { BoardTransform, GridPosition } from './types'

export const BOARD_TRANSFORMS: readonly BoardTransform[] = [
    'identity',
    'rotate_90',
    'rotate_180',
    'rotate_270',
    'reflect_horizontal',
    'reflect_vertical',
    'reflect_main_diagonal',
    'reflect_anti_diagonal',
]

function validateRows(rows: readonly string[]): {
    rowCount: number
    columnCount: number
} {
    if (rows.length === 0) {
        throw new RangeError('board rows must not be empty')
    }
    const columnCount = rows[0].length
    if (columnCount === 0) {
        throw new RangeError('board rows must not have zero columns')
    }
    for (const row of rows) {
        if (row.length !== columnCount) {
            throw new RangeError('board rows must be rectangular')
        }
    }
    return { rowCount: rows.length, columnCount }
}

export function transformPosition(
    position: GridPosition,
    inputRows: number,
    inputCols: number,
    transform: BoardTransform
): GridPosition {
    if (
        !Number.isInteger(inputRows) ||
        !Number.isInteger(inputCols) ||
        !Number.isInteger(position.row) ||
        !Number.isInteger(position.col) ||
        inputRows < 1 ||
        inputCols < 1 ||
        position.row < 0 ||
        position.row >= inputRows ||
        position.col < 0 ||
        position.col >= inputCols
    ) {
        throw new RangeError('position is outside the input board')
    }

    const { row, col } = position
    switch (transform) {
        case 'identity':
            return { row, col }
        case 'rotate_90':
            return { row: col, col: inputRows - 1 - row }
        case 'rotate_180':
            return {
                row: inputRows - 1 - row,
                col: inputCols - 1 - col,
            }
        case 'rotate_270':
            return { row: inputCols - 1 - col, col: row }
        case 'reflect_horizontal':
            return { row: inputRows - 1 - row, col }
        case 'reflect_vertical':
            return { row, col: inputCols - 1 - col }
        case 'reflect_main_diagonal':
            return { row: col, col: row }
        case 'reflect_anti_diagonal':
            return {
                row: inputCols - 1 - col,
                col: inputRows - 1 - row,
            }
    }
}

function outputDimensions(
    inputRows: number,
    inputCols: number,
    transform: BoardTransform
): { rows: number; cols: number } {
    switch (transform) {
        case 'rotate_90':
        case 'rotate_270':
        case 'reflect_main_diagonal':
        case 'reflect_anti_diagonal':
            return { rows: inputCols, cols: inputRows }
        default:
            return { rows: inputRows, cols: inputCols }
    }
}

export function transformRows(
    rows: readonly string[],
    transform: BoardTransform
): string[] {
    const { rowCount, columnCount } = validateRows(rows)
    const dimensions = outputDimensions(rowCount, columnCount, transform)
    const output = Array.from({ length: dimensions.rows }, () =>
        Array<string>(dimensions.cols)
    )

    for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < columnCount; col++) {
            const target = transformPosition(
                { row, col },
                rowCount,
                columnCount,
                transform
            )
            output[target.row][target.col] = rows[row][col]
        }
    }

    return output.map(row => row.join(''))
}

export function inverseBoardTransform(
    transform: BoardTransform
): BoardTransform {
    switch (transform) {
        case 'rotate_90':
            return 'rotate_270'
        case 'rotate_270':
            return 'rotate_90'
        default:
            return transform
    }
}

export function serializeBoardRows(rows: readonly string[]): string {
    const { rowCount, columnCount } = validateRows(rows)
    return `${rowCount}x${columnCount}\u001f${rows.join('\u001e')}`
}

export function hashBoardRows(rows: readonly string[]): string {
    return hashString32Hex(serializeBoardRows(rows))
}

export interface TransformedBoardVariant {
    transform: BoardTransform
    rows: string[]
    canonicalKey: string
    hash: string
}

export function getUniqueBoardTransforms(
    rows: readonly string[]
): TransformedBoardVariant[] {
    validateRows(rows)
    const seen = new Set<string>()
    const variants: TransformedBoardVariant[] = []

    for (const transform of BOARD_TRANSFORMS) {
        const transformed = transformRows(rows, transform)
        const canonicalKey = serializeBoardRows(transformed)
        if (seen.has(canonicalKey)) {
            continue
        }
        seen.add(canonicalKey)
        variants.push({
            transform,
            rows: transformed,
            canonicalKey,
            hash: hashString32Hex(canonicalKey),
        })
    }

    return variants
}
