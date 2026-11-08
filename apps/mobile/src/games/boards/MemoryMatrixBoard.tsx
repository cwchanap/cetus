import { Pressable, ScrollView, Text, View } from 'react-native'
import { cn } from '@cetus/ui'
import { CONSTANTS } from '@cetus/games/memory-matrix/utils'
import type { MemoryMatrixGame } from '@cetus/games/memory-matrix/MemoryMatrixGame'

import type { NativeGameViewProps } from '../registry'

interface MemoryCardSnapshot {
  shape: string
  color: string
  isFlipped: boolean
  isMatched: boolean
}

interface MemoryMatrixProjection {
  cards: MemoryCardSnapshot[][]
  isProcessing: boolean
  matchedPairs: number
  totalPairs: number
  canFlip: boolean
}

/**
 * Minimum board width keeping every card at the 44×44pt HIG touch target:
 * 8 columns × 44 + 7 1px gaps. Narrower viewports scroll horizontally
 * instead of shrinking the cards.
 */
export const BOARD_MIN_WIDTH =
  CONSTANTS.BOARD_COLS * 44 + (CONSTANTS.BOARD_COLS - 1)

const cardAccessibilityLabel = (
  row: number,
  col: number,
  card: MemoryCardSnapshot
): string => {
  const where = `Card row ${row + 1}, column ${col + 1}`
  if (card.isMatched) {
    return `${where}, matched, ${card.shape}`
  }
  if (card.isFlipped) {
    return `${where}, face up, ${card.shape}`
  }
  return `${where}, face down`
}

/**
 * Memory Matrix native board (HPA-425 pilot). Renders the frozen
 * visible-state snapshot (6×8 copied card faces, matched pairs, processing
 * flag) and routes every tap to the live host-created game's `flipCard`
 * — pair matching, the processing gate and the configured flip delay all
 * stay in `@cetus/games`. Each card is a real hit target (unlike the
 * display-only Tide grid), so the 48 controls stay individually
 * accessible; a vertical ScrollView keeps the board usable on short
 * screens and a horizontal one keeps cards ≥ 44×44pt on narrow ones.
 */
export function MemoryMatrixBoard({ projected, game }: NativeGameViewProps) {
  const memory = projected as unknown as MemoryMatrixProjection
  const inputOpen = memory.canFlip && !memory.isProcessing

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        gap: 12,
        paddingHorizontal: 16,
        paddingBottom: 24,
      }}
    >
      <Text
        testID="mm-matched"
        className="font-sans text-sm text-cetus-ink-muted"
      >
        Matched {memory.matchedPairs} / {memory.totalPairs}
      </Text>

      <ScrollView
        horizontal
        testID="mm-board-scroller"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View
          testID="mm-board"
          className="aspect-[4/3] gap-px"
          style={{ flex: 1, minWidth: BOARD_MIN_WIDTH }}
        >
          {memory.cards.map((row, rowIndex) => (
            <View
              key={rowIndex}
              testID="mm-row"
              className="flex-1 flex-row gap-px"
            >
              {row.map((card, colIndex) => {
                const revealed = card.isFlipped || card.isMatched
                const disabled = !inputOpen || revealed
                return (
                  <Pressable
                    key={colIndex}
                    testID={`mm-card-${
                      card.isMatched
                        ? 'matched'
                        : card.isFlipped
                          ? 'up'
                          : 'down'
                    }-r${rowIndex}c${colIndex}`}
                    accessibilityRole={revealed ? 'image' : 'button'}
                    accessibilityLabel={cardAccessibilityLabel(
                      rowIndex,
                      colIndex,
                      card
                    )}
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() =>
                      (game as MemoryMatrixGame).flipCard({
                        row: rowIndex,
                        col: colIndex,
                      })
                    }
                    className={cn(
                      'flex flex-1 items-center justify-center rounded-md border-2 border-cetus-hairline',
                      card.isMatched && 'opacity-60',
                      !revealed && 'bg-cetus-surface'
                    )}
                    // Face-up cards carry their own game-data color (web
                    // board parity); face-down stays a neutral tile.
                    style={revealed ? { borderColor: card.color } : undefined}
                  >
                    <Text
                      className={cn(
                        'font-bold',
                        card.isMatched || card.isFlipped
                          ? 'text-2xl'
                          : 'text-lg text-cetus-ink-muted'
                      )}
                    >
                      {revealed ? card.shape : '?'}
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
