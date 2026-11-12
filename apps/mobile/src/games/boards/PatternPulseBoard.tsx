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

/** The ordered pad labels — repeated pads stay repeated in the speech. */
function spokenSequence(sequence: ReadonlyArray<PatternPad>): string {
  return sequence.map(pad => PADS[pad].label).join('. ')
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
  // the model's own projection drives the announcements — but per-cue
  // announceForAccessibility calls fire every few hundred ms and interrupt
  // each other on VoiceOver (iOS default) while TalkBack's queue would
  // trail the gameplay. Instead: one short cue when playback starts, then
  // ONE complete ordered recap when the input phase opens. The recap is
  // read from the live model at input entry — beginInput() only runs after
  // a full playback pass, so the recap can never be partial — and repeated
  // pads stay distinguishable as ordered repeats inside the one utterance.
  // No sequence rules are re-derived here: sequence is the game's state.
  //
  // RN exposes NO speech cancellation and its queue/priority options are
  // iOS-only (Android/TalkBack ignores them), so a recap already in flight
  // when the phase moves on cannot be revoked. The honest mitigation:
  // terminal and reset transitions speak a short status utterance — iOS
  // interrupts the stale recap with it, Android queues it after — and the
  // labeled replay control below lets the user re-hear the CURRENT run's
  // sequence on demand whenever anything interrupted earlier speech.
  const announcedPhaseRef = useRef(pulse.phase)
  useEffect(() => {
    if (pulse.phase === announcedPhaseRef.current) {
      return
    }
    announcedPhaseRef.current = pulse.phase
    if (pulse.phase === 'watch') {
      void AccessibilityInfo.announceForAccessibility('Watch the pattern')
    } else if (pulse.phase === 'input') {
      const sequence = (game as PatternPulseGame).getState().sequence
      if (sequence.length > 0) {
        void AccessibilityInfo.announceForAccessibility(
          `Your turn — repeat the pattern: ${spokenSequence(sequence)}.`
        )
      }
    } else if (pulse.phase === 'ended') {
      void AccessibilityInfo.announceForAccessibility(
        pulse.outcome === 'timeout'
          ? 'Run ended — time is up.'
          : 'Run ended — signal lost.'
      )
    } else if (pulse.phase === 'idle') {
      void AccessibilityInfo.announceForAccessibility('Game reset.')
    }
  }, [pulse.phase, pulse.outcome, game])

  // Interruption recovery: the user can always re-hear the CURRENT run's
  // complete ordered sequence — but only while the input phase is valid,
  // so the control can never speak a stale or discarded run.
  const replayCurrentSequence = () => {
    const sequence = (game as PatternPulseGame).getState().sequence
    if (sequence.length > 0) {
      void AccessibilityInfo.announceForAccessibility(
        `Current pattern: ${spokenSequence(sequence)}.`
      )
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

      <Pressable
        testID="pp-replay-sequence"
        accessibilityRole="button"
        accessibilityLabel="Repeat pattern sequence"
        accessibilityState={{ disabled: !pulse.canPress }}
        disabled={!pulse.canPress}
        onPress={replayCurrentSequence}
        className={cn(
          'self-center rounded-lg border px-4 py-2',
          pulse.canPress
            ? 'border-cetus-accent bg-cetus-accent/10'
            : 'border-cetus-hairline bg-cetus-surface opacity-50'
        )}
      >
        <Text
          className={cn(
            'text-sm',
            pulse.canPress ? 'text-cetus-accent' : 'text-cetus-ink-muted'
          )}
        >
          Repeat pattern
        </Text>
      </Pressable>
    </ScrollView>
  )
}
