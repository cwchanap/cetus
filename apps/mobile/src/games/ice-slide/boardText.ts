import type { CellType, GridPosition } from '@cetus/games/ice-slide/types'

import type { IceSlideProjection } from './controller'

/**
 * Native-accessible text for the Skia-only Ice Slide grid. Screen readers
 * cannot see cell colours, so the board's goal/terrain/cursor are described
 * from the same copied projection the renderer draws — refreshed on every
 * publish (move, Undo, Reset, route choice, Stop).
 */

const CELL_LABEL: Record<CellType, string> = {
    wall: 'wall',
    ice: 'ice',
    start: 'start',
    goal: 'goal',
    rock: 'rock',
    hazard: 'hazard',
    crystal: 'crystal',
    snow: 'snow',
    fragile: 'fragile',
    collapsed: 'collapsed',
}

const MODE_LABEL: Record<IceSlideProjection['mode'], string> = {
    campaign: 'Campaign',
    daily: 'Daily',
    expedition: 'Expedition',
}

/** "column 3", "columns 1 and 5", "columns 2, 4 and 6". */
export function formatIceSlideColumns(columns: readonly number[]): string {
    const labels = columns.map(column => String(column + 1))
    if (labels.length === 1) {
        return `column ${labels[0]}`
    }
    return `columns ${labels.slice(0, -1).join(', ')} and ${
        labels[labels.length - 1]
    }`
}

export function describeIceSlideRow(
    row: readonly CellType[],
    rowIndex: number,
    player: GridPosition
): string {
    const groups = new Map<string, number[]>()
    for (let column = 0; column < row.length; column += 1) {
        const label =
            rowIndex === player.row && column === player.col
                ? 'you'
                : (CELL_LABEL[row[column]] ?? 'terrain')
        const columns = groups.get(label)
        if (columns) {
            columns.push(column)
        } else {
            groups.set(label, [column])
        }
    }
    const parts = [...groups].map(
        ([label, columns]) => `${label} at ${formatIceSlideColumns(columns)}`
    )
    return `Row ${rowIndex + 1}: ${parts.join('; ')}.`
}

/** One textual description per grid row (empty while idle). */
export function iceSlideRowLabels(
    scene: Pick<IceSlideProjection, 'grid' | 'player'>
): string[] {
    return scene.grid.map((row, rowIndex) =>
        describeIceSlideRow(row, rowIndex, scene.player)
    )
}

function findCell(
    grid: readonly (readonly CellType[])[],
    type: CellType
): GridPosition | null {
    for (let row = 0; row < grid.length; row += 1) {
        for (let column = 0; column < grid[row].length; column += 1) {
            if (grid[row][column] === type) {
                return { row, col: column }
            }
        }
    }
    return null
}

function countCell(
    grid: readonly (readonly CellType[])[],
    type: CellType
): number {
    let count = 0
    for (const row of grid) {
        for (const cell of row) {
            if (cell === type) {
                count += 1
            }
        }
    }
    return count
}

/** Accessible board summary: stage, cursor, goal and remaining crystals. */
export function describeIceSlideBoard(scene: IceSlideProjection): string {
    if (scene.rows === 0) {
        return `Ice Slide board: ${MODE_LABEL[scene.mode]}, waiting to start`
    }
    const goal = findCell(scene.grid, 'goal')
    const crystals = countCell(scene.grid, 'crystal')
    return [
        `Ice Slide board: stage ${scene.level} of ${scene.levelsTotal}, ${
            scene.stageName
        }.`,
        `You at row ${scene.player.row + 1}, column ${scene.player.col + 1}.`,
        goal
            ? `Goal at row ${goal.row + 1}, column ${goal.col + 1}.`
            : 'Goal reached.',
        `${scene.moves} moves, ${crystals} crystals remaining.`,
    ].join(' ')
}
