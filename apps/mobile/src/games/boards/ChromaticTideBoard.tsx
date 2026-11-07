import { ScrollView, Text, View } from 'react-native'
import { Button, cn } from '@cetus/ui'
import {
  CHROMATIC_TIDE_PALETTE,
  CHROMATIC_TIDE_RULES,
  type ChromaticTideColor,
} from '@cetus/games/chromatic-tide/types'
import type { ChromaticTideGame } from '@cetus/games/chromatic-tide/ChromaticTideGame'

import type { NativeGameViewProps } from '../registry'

/** Tide palette hexes (web board parity — game data, not theme tokens). */
const TIDE_COLORS: Record<ChromaticTideColor, string> = {
  teal: '#1fe3c0',
  amber: '#f2b33d',
  magenta: '#ff3d8a',
  ice: '#6fe3ff',
  green: '#5dff9f',
}

const TOTAL_CELLS = CHROMATIC_TIDE_RULES.rows * CHROMATIC_TIDE_RULES.cols

const colorLabel = (color: ChromaticTideColor): string =>
  `${color[0].toUpperCase()}${color.slice(1)}`

interface TideCellSnapshot {
  color: ChromaticTideColor
  captured: boolean
}

interface TideProjection {
  cells: TideCellSnapshot[][]
  territoryColor: ChromaticTideColor
  movesUsed: number
  capturedCells: number
  canChooseColor: boolean
}

/**
 * Chromatic Tide native board (HPA-425 pilot). Renders the frozen
 * visible-state snapshot (12×12 cells, captured territory, palette, moves)
 * and routes every input to the live host-created game's `chooseColor` —
 * the flood-fill rules stay in `@cetus/games`. The board grid itself is a
 * display surface (web parity): the five full-size palette buttons are the
 * only hit targets, so nothing shrinks to an inaccessible size on narrow
 * devices.
 */
export function ChromaticTideBoard({ projected, game }: NativeGameViewProps) {
  const tide = projected as unknown as TideProjection

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        gap: 12,
        paddingHorizontal: 16,
        paddingBottom: 24,
      }}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text
          testID="tide-moves"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Moves {tide.movesUsed}
        </Text>
        <Text
          testID="tide-captured"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {tide.capturedCells} / {TOTAL_CELLS} captured
        </Text>
        <Text
          testID="tide-territory"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Territory {tide.territoryColor}
        </Text>
      </View>

      <View
        className="aspect-square w-full gap-px"
        accessible
        accessibilityLabel={`Chromatic Tide board: ${tide.capturedCells} of ${TOTAL_CELLS} cells captured, territory ${tide.territoryColor}, ${tide.movesUsed} moves used`}
        // 144 non-interactive cells would bury the palette buttons for
        // screen-reader users; the summary label above carries the state.
        importantForAccessibility="no-hide-descendants"
      >
        {tide.cells.map((row, rowIndex) => (
          <View
            key={rowIndex}
            testID="tide-row"
            className="flex-1 flex-row gap-px"
          >
            {row.map((cell, colIndex) => (
              <View
                key={colIndex}
                testID={`tide-cell-${cell.color}${cell.captured ? '-captured' : ''}`}
                className={cn(
                  'flex-1 items-center justify-center rounded-sm',
                  cell.captured && 'border border-white'
                )}
                style={{ backgroundColor: TIDE_COLORS[cell.color] }}
              >
                <Text
                  className="text-[9px] font-bold"
                  style={{ color: 'rgba(3, 10, 20, 0.82)' }}
                >
                  {CHROMATIC_TIDE_PALETTE.indexOf(cell.color) + 1}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View
        className="flex-row flex-wrap gap-2"
        accessibilityLabel="Choose territory color"
      >
        {CHROMATIC_TIDE_PALETTE.map((color, index) => {
          const isTerritory = color === tide.territoryColor
          const disabled = !tide.canChooseColor || isTerritory
          return (
            <Button
              key={color}
              variant="ghost"
              testID={`tide-color-${color}`}
              accessibilityLabel={`Choose ${color}`}
              accessibilityState={{ disabled, selected: isTerritory }}
              disabled={disabled}
              className={cn(
                'min-w-[64px] flex-1',
                isTerritory && 'border-2 border-white'
              )}
              style={{ backgroundColor: TIDE_COLORS[color] }}
              onPress={() => (game as ChromaticTideGame).chooseColor(color)}
            >
              {index + 1} {colorLabel(color)}
            </Button>
          )
        })}
      </View>
    </ScrollView>
  )
}
