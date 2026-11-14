import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Select, Toggle, cn } from '@cetus/ui'
import {
  MINE_GRID_PRESETS,
  type MineGridDifficulty,
} from '@cetus/games/mine-grid/types'
import type { MineGridGame } from '@cetus/games/mine-grid/MineGridGame'

import type { NativeGameViewProps } from '../registry'

/** HIG minimum touch target: grid cells never shrink below 44×44pt —
 *  narrower viewports scroll the board horizontally instead. */
export const BOARD_CELL_MIN = 44

const DIFFICULTY_OPTIONS: Array<{ value: MineGridDifficulty; label: string }> =
  [
    {
      value: 'easy',
      label: `Easy ${MINE_GRID_PRESETS.easy.rows}×${MINE_GRID_PRESETS.easy.cols}`,
    },
    {
      value: 'medium',
      label: `Medium ${MINE_GRID_PRESETS.medium.rows}×${MINE_GRID_PRESETS.medium.cols}`,
    },
    {
      value: 'hard',
      label: `Hard ${MINE_GRID_PRESETS.hard.rows}×${MINE_GRID_PRESETS.hard.cols}`,
    },
  ]

interface MineCellSnapshot {
  revealed: boolean
  flagged: boolean
  adjacentMines: number
  hasMine: boolean
}

interface MineGridProjection {
  cells: MineCellSnapshot[][]
  difficulty: MineGridDifficulty
  flagsPlaced: number
  mines: number
  canAct: boolean
}

type CellViewState = 'hidden' | 'flagged' | 'revealed' | 'mine'

// Same precedence as the web DOM renderer (MineGridRenderer.getCellState).
const cellViewState = (cell: MineCellSnapshot): CellViewState => {
  if (cell.hasMine && cell.revealed) {
    return 'mine'
  }
  if (cell.flagged) {
    return 'flagged'
  }
  if (cell.revealed) {
    return 'revealed'
  }
  return 'hidden'
}

const cellContent = (state: CellViewState, cell: MineCellSnapshot): string => {
  switch (state) {
    case 'flagged':
      return '⚑'
    case 'revealed':
      return String(cell.adjacentMines)
    case 'mine':
      return '💣'
    default:
      return ''
  }
}

const cellAccessibilityLabel = (
  row: number,
  col: number,
  state: CellViewState,
  cell: MineCellSnapshot
): string => {
  const where = `Row ${row + 1}, column ${col + 1}`
  switch (state) {
    case 'flagged':
      return `${where}, flagged`
    case 'revealed':
      return `${where}, ${cell.adjacentMines} adjacent mines`
    case 'mine':
      return `${where}, mine`
    default:
      return `${where}, hidden`
  }
}

/**
 * Mine Grid native board (HPA-425). Renders the frozen visible-state
 * snapshot (copied cell values, flag count, difficulty) and routes every
 * input to the live host-created game's `revealCell`/`toggleFlag`/
 * `newGame` — mine placement, flood reveal, scoring and end-of-run saves
 * all stay in `@cetus/games`. Direct flagging rides on
 * `Pressable.onLongPress`: Pressability's own cancellation suppresses the
 * trailing `onPress` after a successful long press, so the board keeps no
 * hand-rolled suppression state. The visible Reveal/Flag `Toggle` is the
 * accessible alternative to the long-press gesture (web flag-mode parity).
 */
export function MineGridBoard({ projected, game }: NativeGameViewProps) {
  const grid = projected as unknown as MineGridProjection
  const mineGame = game as MineGridGame
  const [flagMode, setFlagMode] = useState(false)

  // Web parity: a fresh idle board restores Reveal mode.
  useEffect(() => {
    if (!grid.canAct) {
      setFlagMode(false)
    }
  }, [grid.canAct])

  const cols = grid.cells[0]?.length ?? 0
  const boardMinWidth = cols * BOARD_CELL_MIN + Math.max(0, cols - 1)

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        gap: 12,
        paddingHorizontal: 16,
        paddingBottom: 24,
      }}
    >
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Select
            testID="mg-difficulty"
            accessibilityLabel="Difficulty"
            options={DIFFICULTY_OPTIONS}
            value={grid.difficulty}
            onValueChange={value =>
              mineGame.newGame(value as MineGridDifficulty)
            }
            disabled={grid.canAct}
          />
        </View>
        <Text
          testID="mg-flags"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Flags {grid.flagsPlaced} / {grid.mines}
        </Text>
      </View>

      <Toggle
        label="Flag mode"
        description="Long-press also flags"
        checked={flagMode}
        onCheckedChange={setFlagMode}
      />

      <ScrollView
        horizontal
        testID="mg-board-scroller"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View
          testID="mg-board"
          className="aspect-square gap-px"
          style={{ flex: 1, minWidth: boardMinWidth }}
        >
          {grid.cells.map((row, rowIndex) => (
            <View
              key={rowIndex}
              testID="mg-row"
              className="flex-1 flex-row gap-px"
            >
              {row.map((cell, colIndex) => {
                const state = cellViewState(cell)
                const disabled = !grid.canAct || cell.revealed
                return (
                  <Pressable
                    key={colIndex}
                    testID={`mg-cell-${state}-r${rowIndex}c${colIndex}`}
                    accessibilityRole="button"
                    accessibilityLabel={cellAccessibilityLabel(
                      rowIndex,
                      colIndex,
                      state,
                      cell
                    )}
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() =>
                      flagMode
                        ? mineGame.toggleFlag(rowIndex, colIndex)
                        : mineGame.revealCell(rowIndex, colIndex)
                    }
                    onLongPress={() => mineGame.toggleFlag(rowIndex, colIndex)}
                    className={cn(
                      'flex flex-1 items-center justify-center rounded-sm border border-cetus-hairline',
                      state === 'hidden' && 'bg-cetus-surface',
                      state === 'flagged' &&
                        'border-amber-400 bg-cetus-surface',
                      state === 'revealed' && 'bg-cetus-canvas',
                      state === 'mine' && 'border-red-400 bg-red-500/25'
                    )}
                  >
                    <Text
                      className={cn(
                        'font-bold text-cetus-ink',
                        state === 'flagged' && 'text-lg text-amber-400'
                      )}
                    >
                      {cellContent(state, cell)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  )
}
