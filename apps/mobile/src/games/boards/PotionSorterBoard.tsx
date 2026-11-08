import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Button, Select, cn } from '@cetus/ui'
import { hasLegalMove } from '@cetus/games/potion-sorter/puzzle'
import type { PotionSorterGame } from '@cetus/games/potion-sorter/PotionSorterGame'
import {
  POTION_TUBE_CAPACITY,
  type PotionColor,
  type PotionSorterDifficulty,
  type PotionSorterResult,
  type PotionTube,
} from '@cetus/games/potion-sorter/types'

import type { NativeGameViewProps } from '../registry'

/** Web board parity: every liquid keeps its fill, glyph and label from
 *  the web renderer (game data, not theme tokens). */
const LIQUID_VISUALS: Record<
  PotionColor,
  { label: string; glyph: string; hex: string }
> = {
  cyan: { label: 'Cyan', glyph: '▲', hex: '#22d3ee' },
  magenta: { label: 'Magenta', glyph: '●', hex: '#e879f9' },
  amber: { label: 'Amber', glyph: '◆', hex: '#fbbf24' },
  lime: { label: 'Lime', glyph: '✦', hex: '#a3e635' },
  violet: { label: 'Violet', glyph: '⬢', hex: '#a78bfa' },
  coral: { label: 'Coral', glyph: '■', hex: '#fb7185' },
  azure: { label: 'Azure', glyph: '✚', hex: '#60a5fa' },
}

/** Web layer-marker parity: a dark glyph on the bright liquid fills. */
const LAYER_TEXT_COLOR = '#06131f'

const DIFFICULTY_OPTIONS: Array<{
  value: PotionSorterDifficulty
  label: string
}> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

interface PotionSorterProjection {
  tubes: PotionTube[]
  selectedTubeIndex: number | null
  movesMade: number
  undosUsed: number
  difficulty: PotionSorterDifficulty
  result: PotionSorterResult
  canUndo: boolean
  canAct: boolean
}

/** Web tube-label parity: contents read bottom → top. */
function tubeLabel(index: number, tube: PotionTube): string {
  if (tube.length === 0) {
    return `Tube ${index + 1}: empty`
  }
  const contents = tube.map(color => LIQUID_VISUALS[color].label).join(', ')
  return `Tube ${index + 1}: ${contents}`
}

function isComplete(tube: PotionTube): boolean {
  return tube.length === POTION_TUBE_CAPACITY && new Set(tube).size === 1
}

/**
 * Potion Sorter native board (HPA-425 task 8). Renders the frozen
 * visible-state projection (copied tube layers, selection, move/undo
 * counters) and routes every tap to the live host-created game's
 * `activateTube`/`undo`/`newGame` — pour legality, undo history, dead-end
 * detection and scoring all stay in `@cetus/games` (only the shared
 * `hasLegalMove` helper is re-used, exactly like the web initializer).
 * The status line mirrors the web action announcer verbatim; the Undo
 * button carries the web dead-end emphasis. Tubes keep full 56×184pt hit
 * targets and wrap to extra rows on narrow screens instead of shrinking.
 */
export function PotionSorterBoard({ projected, game }: NativeGameViewProps) {
  const sorter = projected as unknown as PotionSorterProjection
  const potionGame = game as PotionSorterGame
  const [status, setStatus] = useState('Ready.')
  const canAct = sorter.canAct
  const result = sorter.result

  // Web syncControls parity: a fresh idle board re-announces 'Ready.',
  // and a newly started run clears the previous run's last action;
  // finished runs keep their last text under the result sheet.
  useEffect(() => {
    if (result === 'playing') {
      setStatus('Ready.')
    }
  }, [canAct, result])

  const deadEnded = sorter.canAct && !hasLegalMove(sorter.tubes)

  const handleTubePress = (index: number): void => {
    const action = potionGame.activateTube(index)
    switch (action) {
      case 'selected':
        setStatus(`Selected tube ${index + 1}.`)
        break
      case 'deselected':
        setStatus('Selection cleared.')
        break
      case 'poured': {
        const state = potionGame.getState()
        setStatus(
          state.result === 'playing' && !hasLegalMove(state.tubes)
            ? 'No pours left — undo or reset.'
            : 'Potion poured.'
        )
        break
      }
      case 'invalid':
        setStatus('That pour is not allowed.')
        break
    }
  }

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
        testID="ps-status"
        accessibilityLiveRegion="polite"
        className="text-center font-display text-base text-cetus-accent"
      >
        {status}
      </Text>

      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Select
            testID="ps-difficulty"
            accessibilityLabel="Difficulty"
            options={DIFFICULTY_OPTIONS}
            value={sorter.difficulty}
            onValueChange={value =>
              potionGame.newGame(value as PotionSorterDifficulty)
            }
            disabled={sorter.canAct}
          />
        </View>
        <Text
          testID="ps-moves"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Moves {sorter.movesMade}
        </Text>
        <Text
          testID="ps-undos"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Undos {sorter.undosUsed}
        </Text>
      </View>

      <View
        className="flex-row flex-wrap justify-center gap-2"
        accessibilityLabel="Potion tubes"
      >
        {sorter.tubes.map((tube, index) => {
          const selected = sorter.selectedTubeIndex === index
          const complete = isComplete(tube)
          return (
            <Pressable
              key={index}
              testID={`ps-tube-${selected ? 'selected' : complete ? 'complete' : 'idle'}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={tubeLabel(index, tube)}
              accessibilityState={{
                selected,
                disabled: !sorter.canAct,
              }}
              disabled={!sorter.canAct}
              onPress={() => handleTubePress(index)}
              // Constant border width: selection/completion change
              // only the color, never the tube's footprint (web parity
              // keeps a stable 1px border too).
              className={cn(
                'flex h-[184px] w-14 flex-col gap-0.5 rounded-t-lg rounded-b-2xl border-2 bg-cetus-surface p-1',
                selected
                  ? 'border-cetus-accent-2'
                  : complete
                    ? 'border-cetus-accent-3'
                    : 'border-cetus-hairline'
              )}
            >
              {/* Tube array index 0 is the bottom layer, so render the
                  slots top-down (capacity-1 → 0). */}
              {Array.from(
                { length: POTION_TUBE_CAPACITY },
                (_, offset) => POTION_TUBE_CAPACITY - 1 - offset
              ).map(slot => {
                const color = tube[slot]
                return (
                  <View
                    key={slot}
                    testID={color ? `ps-layer-${color}` : undefined}
                    className="flex-1 items-center justify-center rounded"
                    style={
                      color
                        ? { backgroundColor: LIQUID_VISUALS[color].hex }
                        : undefined
                    }
                  >
                    {color ? (
                      <Text
                        className="text-xs"
                        style={{ color: LAYER_TEXT_COLOR }}
                      >
                        {LIQUID_VISUALS[color].glyph}
                      </Text>
                    ) : null}
                  </View>
                )
              })}
            </Pressable>
          )
        })}
      </View>

      <Button
        testID="ps-undo"
        variant="outline"
        size="sm"
        accessibilityLabel="Undo"
        accessibilityState={{ disabled: !sorter.canUndo }}
        disabled={!sorter.canUndo}
        className={cn(
          'self-start',
          deadEnded && 'border-2 border-cetus-accent-3'
        )}
        onPress={() => {
          if (potionGame.undo()) {
            setStatus('Last pour undone.')
          }
        }}
      >
        Undo
      </Button>
    </ScrollView>
  )
}
