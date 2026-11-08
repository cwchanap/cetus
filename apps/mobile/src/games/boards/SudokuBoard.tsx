import { useCallback } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Select, cn } from '@cetus/ui'
import type { SudokuGame } from '@cetus/games/sudoku/SudokuGame'

import type { NativeGameViewProps } from '../registry'
import { MemoSudokuGrid, type SudokuGridSnapshot } from './SudokuGrid'

const DIFFICULTY_OPTIONS: Array<{
  value: 'easy' | 'medium' | 'hard'
  label: string
}> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const PAD_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

type SudokuDifficulty = 'easy' | 'medium' | 'hard'

interface SudokuProjection {
  grid: SudokuGridSnapshot
  difficulty: SudokuDifficulty
  mistakes: number
  canAct: boolean
  difficultyLocked: boolean
}

/**
 * Sudoku native board (HPA-425). Renders the frozen visible-state
 * snapshot and routes every input to the live host-created game's
 * `selectCell`/`placeNumber`/`clearSelectedCell`/`newGame` — puzzle
 * generation, conflict detection, scoring and the end-of-run save all
 * stay in `@cetus/games`. The 9×9 grid is a memoized component fed the
 * separately stabilized grid snapshot plus a stable tap callback, so the
 * count-up clock (`projected.clock`, rendered by the shared chrome HUD)
 * ticks without redrawing all 81 cells.
 */
export function SudokuBoard({ projected, game }: NativeGameViewProps) {
  const view = projected as unknown as SudokuProjection
  const sudokuGame = game as SudokuGame
  const onSelectCell = useCallback(
    (row: number, col: number) => sudokuGame.selectCell(row, col),
    [sudokuGame]
  )

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
            testID="sudoku-difficulty"
            accessibilityLabel="Difficulty"
            options={DIFFICULTY_OPTIONS}
            value={view.difficulty}
            onValueChange={value =>
              sudokuGame.newGame(value as SudokuDifficulty)
            }
            disabled={view.difficultyLocked}
          />
        </View>
        <Text
          testID="sudoku-mistakes"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Mistakes {view.mistakes}
        </Text>
      </View>

      <ScrollView
        horizontal
        testID="sudoku-board-scroller"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <MemoSudokuGrid
          grid={view.grid}
          canAct={view.canAct}
          onSelectCell={onSelectCell}
        />
      </ScrollView>

      <View className="flex-row flex-wrap gap-2">
        {PAD_NUMBERS.map(number => (
          <Pressable
            key={number}
            testID={`sudoku-pad-${number}`}
            accessibilityRole="button"
            accessibilityLabel={`Place ${number}`}
            accessibilityState={{ disabled: !view.canAct }}
            disabled={!view.canAct}
            onPress={() => sudokuGame.placeNumber(number)}
            className={cn(
              'h-12 min-w-12 flex-1 items-center justify-center rounded-lg border border-cetus-hairline bg-cetus-surface',
              'active:opacity-80 disabled:opacity-50'
            )}
          >
            <Text className="font-display text-base text-cetus-ink">
              {number}
            </Text>
          </Pressable>
        ))}
        <Pressable
          testID="sudoku-erase"
          accessibilityRole="button"
          accessibilityLabel="Erase"
          accessibilityState={{ disabled: !view.canAct }}
          disabled={!view.canAct}
          onPress={() => sudokuGame.clearSelectedCell()}
          className={cn(
            'h-12 min-w-16 items-center justify-center rounded-lg border border-cetus-hairline bg-cetus-surface',
            'active:opacity-80 disabled:opacity-50'
          )}
        >
          <Text className="font-display text-base text-cetus-ink">⌫</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}
