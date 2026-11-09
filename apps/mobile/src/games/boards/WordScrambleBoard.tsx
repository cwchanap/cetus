import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { cn } from '@cetus/ui'
import type { WordScrambleGame } from '@cetus/games/word-scramble/WordScrambleGame'

import type { NativeGameViewProps } from '../registry'

interface WordScrambleProjection {
  challengeId: string | null
  scrambledWord: string | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  wordsUnscrambled: number
  correctAnswers: number
  canAnswer: boolean
}

const ANSWER_PLACEHOLDER = 'Your answer'

/**
 * Word Scramble native board (HPA-425 task 11). Renders the frozen
 * visible-state projection and routes every input to the live
 * host-created game's `submitAnswer`/`skipCurrentChallenge` — challenge
 * generation, scoring and the end-of-run save all stay in
 * `@cetus/games`. The tray is the scrambled word itself: each letter
 * occurrence is an independent tile (repeated letters included), and the
 * assembled answer is view-local state — cleared whenever the challenge
 * or the input gate changes, so no letters leak across challenges. Tiles
 * wrap at 48pt, so long words stay accessible on narrow screens.
 */
export function WordScrambleBoard({ projected, game }: NativeGameViewProps) {
  const view = projected as unknown as WordScrambleProjection
  const scrambleGame = game as WordScrambleGame
  const [answer, setAnswer] = useState('')
  // Tile indices in typed order — undo history within one challenge.
  const [picked, setPicked] = useState<number[]>([])

  // A fresh challenge (id change on answer/skip) or a locked board
  // (time-up, reset) empties the tray; there is nothing to carry over.
  useEffect(() => {
    setAnswer('')
    setPicked([])
  }, [view.challengeId, view.canAnswer])

  const letters = view.scrambledWord ? view.scrambledWord.split('') : []
  const usedAt = new Set(picked)
  const canType = view.canAnswer

  const pressTile = (index: number) => {
    if (!canType || usedAt.has(index)) {
      return
    }
    setAnswer(current => current + letters[index])
    setPicked(current => [...current, index])
  }

  const undo = () => {
    if (picked.length === 0) {
      return
    }
    setPicked(current => current.slice(0, -1))
    setAnswer(current => current.slice(0, -1))
  }

  const submit = () => {
    if (!canType || answer === '') {
      return
    }
    scrambleGame.submitAnswer(answer)
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
        <Text className="font-sans text-sm text-cetus-ink-muted">
          Unscramble this word:
        </Text>
        <Text
          testID="word-scramble-word"
          accessibilityRole="header"
          className="text-center font-display text-4xl text-cetus-ink"
        >
          {view.scrambledWord ? view.scrambledWord.toUpperCase() : 'READY?'}
        </Text>
        <Text
          testID="word-scramble-difficulty"
          className="font-sans text-xs uppercase tracking-wider text-cetus-ink-muted"
        >
          {view.difficulty ?? ''}
        </Text>
        <Text
          testID="word-scramble-answer"
          // The label replaces the visible text for screen readers, so
          // it must carry the assembled letters (or the placeholder) for
          // users to review their answer before submitting.
          accessibilityLabel={`Answer, ${answer === '' ? ANSWER_PLACEHOLDER : answer}`}
          className="w-full rounded-lg border-2 border-cetus-hairline bg-cetus-surface px-4 py-3 text-center font-display text-2xl text-cetus-ink"
        >
          {answer === '' ? ANSWER_PLACEHOLDER : answer}
        </Text>
      </View>

      <View className="flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Text
          testID="word-scramble-words"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Words {view.wordsUnscrambled}
        </Text>
        <Text
          testID="word-scramble-correct"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Correct {view.correctAnswers}
        </Text>
      </View>

      <View
        className="flex-row flex-wrap justify-center gap-2"
        accessibilityLabel="Word Scramble letters"
      >
        {letters.map((letter, index) => {
          const used = usedAt.has(index)
          const disabled = used || !canType
          return (
            <Pressable
              key={`${view.challengeId}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Letter ${letter.toUpperCase()}`}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => pressTile(index)}
              className={cn(
                'h-12 min-w-12 items-center justify-center rounded-lg border border-cetus-hairline bg-cetus-surface px-3',
                'active:opacity-80 disabled:opacity-40'
              )}
            >
              <Text className="font-display text-xl text-cetus-ink">
                {letter.toUpperCase()}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo letter"
          accessibilityState={{ disabled: !canType }}
          disabled={!canType}
          onPress={undo}
          className={cn(
            'h-12 flex-1 items-center justify-center rounded-lg border border-cetus-hairline bg-cetus-surface',
            'active:opacity-80 disabled:opacity-50'
          )}
        >
          <Text className="font-display text-base text-cetus-ink">↩ Undo</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear answer"
          accessibilityState={{ disabled: !canType }}
          disabled={!canType}
          onPress={() => {
            setAnswer('')
            setPicked([])
          }}
          className={cn(
            'h-12 flex-1 items-center justify-center rounded-lg border border-cetus-hairline bg-cetus-surface',
            'active:opacity-80 disabled:opacity-50'
          )}
        >
          <Text className="font-display text-base text-cetus-ink">Clear</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Submit answer"
          accessibilityState={{ disabled: !canType }}
          disabled={!canType}
          onPress={submit}
          className={cn(
            'h-12 flex-1 items-center justify-center rounded-lg border border-cetus-accent bg-cetus-accent/20',
            'active:opacity-80 disabled:opacity-50'
          )}
        >
          <Text className="font-display text-base text-cetus-ink">Submit</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip word"
          accessibilityState={{ disabled: !canType }}
          disabled={!canType}
          onPress={() => {
            if (canType) {
              scrambleGame.skipCurrentChallenge()
            }
          }}
          className={cn(
            'h-12 flex-1 items-center justify-center rounded-lg border border-cetus-hairline bg-cetus-surface',
            'active:opacity-80 disabled:opacity-50'
          )}
        >
          <Text className="font-display text-base text-cetus-ink">Skip</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}
