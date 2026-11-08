import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { cn } from '@cetus/ui'

/** HIG minimum touch target: grid cells never shrink below 44×44pt —
 *  narrower viewports scroll the board horizontally instead. */
export const BOARD_CELL_MIN = 44

/** Serializable 9×9 grid snapshot the memoized board renders. Kept as
 *  one separately stabilized reference so count-up clock ticks (which
 *  change the top-level projection) never invalidate the memo barrier. */
export interface SudokuGridSnapshot {
  cells: Array<
    Array<{
      value: number | null
      isGiven: boolean
      isHighlighted: boolean
      isConflicting: boolean
    }>
  >
  selectedCell: { row: number; col: number } | null
}

export interface SudokuGridProps {
  grid: SudokuGridSnapshot
  canAct: boolean
  onSelectCell: (row: number, col: number) => void
}

type SudokuCellSnapshot = SudokuGridSnapshot['cells'][number][number]

type CellViewState = 'conflict' | 'selected' | 'highlight' | 'given' | 'plain'

/** Same precedence as the web DOM renderer: conflict wins, then the
 *  selection ring, then the row/box highlight tint (the web paints it
 *  over given cells too), then the plain given treatment. */
const cellViewState = (
  cell: SudokuCellSnapshot,
  isSelected: boolean
): CellViewState => {
  if (cell.isConflicting) {
    return 'conflict'
  }
  if (isSelected) {
    return 'selected'
  }
  if (cell.isHighlighted) {
    return 'highlight'
  }
  if (cell.isGiven) {
    return 'given'
  }
  return 'plain'
}

const cellAccessibilityLabel = (
  row: number,
  col: number,
  cell: SudokuCellSnapshot
): string => {
  const where = `Row ${row + 1}, column ${col + 1}`
  const value = cell.value === null ? 'empty' : String(cell.value)
  const parts = [where, value]
  if (cell.isGiven) {
    parts.push('given')
  }
  if (cell.isConflicting) {
    parts.push('conflicting')
  }
  return parts.join(', ')
}

/** Test seam: counts real renders of the 81-cell grid (memo barrier
 *  openings). Clock-only ticks must not bump it — that is the whole
 *  point of the separately stabilized grid prop. */
export const sudokuGridRenders = { count: 0 }

export function SudokuGrid({ grid, canAct, onSelectCell }: SudokuGridProps) {
  sudokuGridRenders.count++
  const boardMinWidth = 9 * BOARD_CELL_MIN + 8

  return (
    <View
      testID="sudoku-board"
      className="aspect-square gap-px"
      style={{ flex: 1, minWidth: boardMinWidth }}
    >
      {grid.cells.map((row, rowIndex) => (
        <View
          key={rowIndex}
          testID="sudoku-row"
          className="flex-1 flex-row gap-px"
        >
          {row.map((cell, colIndex) => {
            const isSelected =
              grid.selectedCell?.row === rowIndex &&
              grid.selectedCell?.col === colIndex
            const state = cellViewState(cell, isSelected)
            return (
              <Pressable
                key={colIndex}
                testID={`sudoku-cell-${state}-r${rowIndex}c${colIndex}`}
                accessibilityRole="button"
                accessibilityLabel={cellAccessibilityLabel(
                  rowIndex,
                  colIndex,
                  cell
                )}
                accessibilityState={{ disabled: !canAct }}
                disabled={!canAct}
                onPress={() => onSelectCell(rowIndex, colIndex)}
                className={cn(
                  'flex flex-1 items-center justify-center rounded-sm border border-cetus-hairline',
                  // Web parity: 3×3 box separators.
                  colIndex % 3 === 0 &&
                    colIndex !== 0 &&
                    'border-l-2 border-l-cetus-accent/50',
                  rowIndex % 3 === 0 &&
                    rowIndex !== 0 &&
                    'border-t-2 border-t-cetus-accent/50',
                  state === 'given' && 'bg-cetus-surface',
                  state === 'plain' && 'bg-cetus-canvas',
                  state === 'highlight' && 'bg-cetus-accent-2/10',
                  state === 'selected' &&
                    'border-cetus-accent bg-cetus-accent/20',
                  state === 'conflict' && 'border-red-400 bg-red-500/25'
                )}
              >
                <Text
                  className={cn(
                    'font-display text-base',
                    cell.isGiven ? 'text-cetus-accent' : 'text-cetus-ink',
                    cell.isConflicting && 'text-red-400'
                  )}
                >
                  {cell.value ?? ''}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

/** The memo barrier: re-renders only when the stabilized grid reference,
 *  the input gate or the tap callback actually changes. */
export const MemoSudokuGrid = memo(SudokuGrid)
