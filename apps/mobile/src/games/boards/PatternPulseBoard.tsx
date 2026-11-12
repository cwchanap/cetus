import { useEffect, useRef } from 'react'
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { cn } from '@cetus/ui'
import type { PatternPulseGame } from '@cetus/games/pattern-pulse/PatternPulseGame'
import type {
  PatternPad,
  PatternPulseFeedback,
  PatternPulseOutcome,
  PatternPulsePhase,
} from '@cetus/games/pattern-pulse/types'

import type { NativeGameViewProps } from '../registry'

interface PatternPulseProjection {
  phase: PatternPulsePhase
  outcome: PatternPulseOutcome
  activePad: PatternPad | null
  feedback: PatternPulseFeedback
  sequenceLength: number
  completedRounds: number
  streak: number
  mistakes: number
  canPress: boolean
}

/** Web-pad parity: glyph, visible number and accessible name per pad. */
const PADS: ReadonlyArray<{ pad: PatternPad; glyph: string; label: string }> = [
  { pad: 0, glyph: '▲', label: 'Pad 1, triangle' },
  { pad: 1, glyph: '●', label: 'Pad 2, circle' },
  { pad: 2, glyph: '◆', label: 'Pad 3, diamond' },
  { pad: 3, glyph: '✦', label: 'Pad 4, star' },
]

/** Status line — the same mapping the web screen's statusText uses. */
function statusText(pulse: PatternPulseProjection): string {
  if (pulse.outcome === 'timeout') {
    return 'TIME'
  }
  if (pulse.outcome === 'mistakes') {
    return 'SIGNAL LOST'
  }
  if (pulse.phase === 'idle') {
    return 'READY'
  }
  if (pulse.phase === 'watch') {
    return 'WATCH'
  }
  if (pulse.phase === 'input') {
    return 'REPEAT'
  }
  if (pulse.feedback === 'correct') {
    return 'CORRECT'
  }
  if (pulse.feedback === 'wrong') {
    return 'WRONG — WATCH AGAIN'
  }
  return 'READY'
}

/**
 * Pattern Pulse native board (HPA-425 task 7). Renders the frozen
 * visible-state projection (phase, lit pad, feedback, streak/mistake HUD)
 * and routes every tap to the live host-created game's `pressPad` —
 * sequence generation, playback pacing, mistake handling and scoring all
 * stay in `@cetus/games`; the view owns no timers of its own. Pads are
 * hit targets only while the model is in its input phase, and the wrong
 * answer gets the one sensory extra the brief allows: a haptic keyed off
 * the model's own feedback state (no SFX).
 */
export function PatternPulseBoard({ projected, game }: NativeGameViewProps) {
  const pulse = projected as unknown as PatternPulseProjection

  useEffect(() => {
    if (pulse.feedback === 'wrong') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }, [pulse.feedback])

  // VoiceOver/TalkBack receive none of the lit-pad styling or test IDs, so
  // the model's own projection is announced directly: each playback phase
  // switch, and each lit pad by its accessible name. Repeated pads still
  // announce once per cue because the model nulls activePad between cues —
  // every cue is a value change. No sequence rules are duplicated here:
  // phase and activePad are the game's projection, not a local re-derivation.
  const announcedPhaseRef = useRef(pulse.phase)
  useEffect(() => {
    if (pulse.phase === announcedPhaseRef.current) {
      return
    }
    announcedPhaseRef.current = pulse.phase
    if (pulse.phase === 'watch') {
      void AccessibilityInfo.announceForAccessibility('Watch the pattern')
    } else if (pulse.phase === 'input') {
      void AccessibilityInfo.announceForAccessibility(
        'Your turn — repeat the pattern'
      )
    }
  }, [pulse.phase])

  useEffect(() => {
    if (pulse.phase === 'watch' && pulse.activePad !== null) {
      void AccessibilityInfo.announceForAccessibility(
        PADS[pulse.activePad].label
      )
    }
  }, [pulse.phase, pulse.activePad])

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
        testID="pp-status"
        accessibilityLiveRegion="polite"
        className="text-center font-display text-base text-cetus-accent"
      >
        {statusText(pulse)}
      </Text>

      <View className="flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Text
          testID="pp-length"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Length {pulse.sequenceLength}
        </Text>
        <Text
          testID="pp-rounds"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Rounds {pulse.completedRounds}
        </Text>
        <Text
          testID="pp-streak"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Streak {pulse.streak}
        </Text>
        <Text
          testID="pp-mistakes"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Mistakes {pulse.mistakes}
        </Text>
      </View>

      <View
        className="aspect-square w-full gap-3"
        accessibilityLabel="Pattern Pulse signal pads"
      >
        {[0, 1].map(row => (
          <View
            key={row}
            testID={`pp-row-${row}`}
            className="flex-1 flex-row gap-3"
          >
            {PADS.slice(row * 2, row * 2 + 2).map(({ pad, glyph, label }) => {
              const active = pulse.activePad === pad
              const wrong = active && pulse.feedback === 'wrong'
              return (
                <Pressable
                  key={pad}
                  testID={`pp-pad-${wrong ? 'wrong' : active ? 'active' : 'idle'}-${pad}`}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{
                    disabled: !pulse.canPress,
                  }}
                  disabled={!pulse.canPress}
                  onPress={() => (game as PatternPulseGame).pressPad(pad)}
                  className={cn(
                    'flex flex-1 items-center justify-center rounded-lg border-2',
                    wrong
                      ? 'border-cetus-accent-3 bg-cetus-accent-3/20'
                      : active
                        ? 'border-cetus-accent bg-cetus-accent/20'
                        : 'border-cetus-hairline bg-cetus-surface'
                  )}
                >
                  <Text
                    className={cn(
                      'text-3xl',
                      wrong ? 'text-cetus-accent-3' : 'text-cetus-accent'
                    )}
                  >
                    {glyph}
                  </Text>
                  <Text className="text-sm text-cetus-ink-muted">
                    {pad + 1}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}
