import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { cn } from '@cetus/ui'
import type { QuickMathFrameworkGame } from '@cetus/games/quick-math/game'

import type { NativeGameViewProps } from '../registry'

interface QuickMathProjection {
  question: string | null
  questionsAnswered: number
  correctAnswers: number
  incorrectAnswers: number
  accuracy: number
  canAnswer: boolean
}

/** Dialpad rows; the bottom row carries backspace, 0 and submit. */
type KeypadKey =
  '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0' | 'back' | 'submit'

const KEYPAD_ROWS: ReadonlyArray<ReadonlyArray<KeypadKey>> = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['back', '0', 'submit'],
]

const ANSWER_PLACEHOLDER = 'Enter answer'

/**
 * Quick Math native board (HPA-425 task 10). Renders the frozen
 * visible-state projection and routes every input to the live
 * host-created game's `submitAnswer` — question generation, scoring,
 * accuracy and the end-of-run save all stay in `@cetus/games`. The
 * typed answer is view-local state (the model keeps none: the web
 * renderer owns the DOM input the same way), cleared on submit and
 * whenever the keypad locks. Keys are 48pt-tall flex-1 columns, so the
 * three-across pad keeps accessible targets on narrow screens.
 */
export function QuickMathBoard({ projected, game }: NativeGameViewProps) {
  const view = projected as unknown as QuickMathProjection
  const quickMathGame = game as QuickMathFrameworkGame
  const [answer, setAnswer] = useState('')

  // A locked keypad (time-up, reset) never leaks a stale answer into
  // the next run — the only other clear is submit itself.
  useEffect(() => {
    if (!view.canAnswer) {
      setAnswer('')
    }
  }, [view.canAnswer])

  const submit = () => {
    if (!view.canAnswer || answer === '') {
      return
    }
    quickMathGame.submitAnswer(answer)
    setAnswer('')
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
      <View className="items-center gap-1">
        <Text
          testID="quick-math-question"
          accessibilityRole="header"
          className="text-center font-display text-4xl text-cetus-ink"
        >
          {view.question ?? 'Ready?'}
        </Text>
        <Text className="font-sans text-sm text-cetus-ink-muted">
          What&apos;s the answer?
        </Text>
        <Text
          testID="quick-math-answer"
          accessibilityLabel="Answer"
          className="w-full rounded-lg border-2 border-cetus-hairline bg-cetus-surface px-4 py-3 text-center font-display text-2xl text-cetus-ink"
        >
          {answer === '' ? ANSWER_PLACEHOLDER : answer}
        </Text>
      </View>

      <View className="flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Text
          testID="quick-math-questions"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Questions {view.questionsAnswered}
        </Text>
        <Text
          testID="quick-math-correct"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Correct {view.correctAnswers}
        </Text>
        <Text
          testID="quick-math-accuracy"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Accuracy {view.accuracy}%
        </Text>
      </View>

      <View className="gap-2" accessibilityLabel="Quick Math keypad">
        {KEYPAD_ROWS.map(row => (
          <View key={row.join('-')} className="flex-row gap-2">
            {row.map(key => {
              const disabled = !view.canAnswer
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={
                    key === 'back'
                      ? 'Backspace'
                      : key === 'submit'
                        ? 'Submit answer'
                        : `Type ${key}`
                  }
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={() => {
                    if (key === 'back') {
                      setAnswer(current => current.slice(0, -1))
                    } else if (key === 'submit') {
                      submit()
                    } else {
                      setAnswer(current => current + key)
                    }
                  }}
                  className={cn(
                    'h-12 flex-1 items-center justify-center rounded-lg border border-cetus-hairline bg-cetus-surface',
                    'active:opacity-80 disabled:opacity-50',
                    key === 'submit' && 'border-cetus-accent bg-cetus-accent/20'
                  )}
                >
                  <Text
                    className={cn(
                      'font-display text-cetus-ink',
                      key === 'submit' ? 'text-base' : 'text-xl'
                    )}
                  >
                    {key === 'back' ? '⌫' : key === 'submit' ? 'Submit' : key}
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
