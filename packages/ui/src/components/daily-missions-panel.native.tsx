/// <reference types="react-native-css/types" />
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { ChallengeProgressResponse } from '@cetus/shared/api-dto'
import { LEVEL_THRESHOLDS } from '@cetus/shared/challenges'
import { Badge } from './ui/badge.native'
import { Card } from './ui/card.native'
import { cn } from '../lib/utils'

export interface DailyMissionsPanelProps {
  challenges: ChallengeProgressResponse[]
  xp: number
  level: number
  xpProgress: number
  xpToNextLevel: number
  streak: number
  resetIn: number
  responseStamp: unknown
  onResetRefresh?: () => void
}

const difficultyColors: Record<string, string> = {
  easy: 'text-cetus-accent',
  medium: 'text-cetus-accent-2',
  hard: 'text-cetus-accent-3',
}

function formatCountdown(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `Resets in ${pad(hours)}:${pad(mins)}:${pad(secs)}`
}

function ResetCountdown({
  resetIn,
  responseStamp,
  onResetRefresh,
}: {
  resetIn: number
  responseStamp: unknown
  onResetRefresh?: () => void
}) {
  const [clock, setClock] = useState(() => {
    const now = Date.now()
    return {
      responseStamp,
      resetIn,
      deadline: now + Math.max(0, resetIn) * 1000,
      now,
    }
  })
  if (clock.responseStamp !== responseStamp || clock.resetIn !== resetIn) {
    const now = Date.now()
    setClock({
      responseStamp,
      resetIn,
      deadline: now + Math.max(0, resetIn) * 1000,
      now,
    })
  }
  const remaining = Math.max(0, Math.ceil((clock.deadline - clock.now) / 1000))

  useEffect(() => {
    if (clock.deadline - clock.now <= 0) {
      return
    }
    const timer = setTimeout(
      () => setClock(current => ({ ...current, now: Date.now() })),
      1000
    )
    return () => clearTimeout(timer)
  }, [clock])

  if (remaining <= 0) {
    return (
      <View className="shrink flex-row flex-wrap items-center gap-2">
        <Text
          numberOfLines={2}
          className="shrink font-sans text-sm text-cetus-ink-muted"
        >
          Daily missions reset
        </Text>
        {onResetRefresh ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh daily missions"
            onPress={onResetRefresh}
            className="active:opacity-80"
          >
            <Text className="font-sans text-sm font-semibold text-cetus-accent">
              Refresh
            </Text>
          </Pressable>
        ) : null}
      </View>
    )
  }

  return (
    <Text
      numberOfLines={1}
      className="shrink font-sans text-sm text-cetus-ink-muted"
    >
      {formatCountdown(remaining)}
    </Text>
  )
}

function MissionRow({ challenge }: { challenge: ChallengeProgressResponse }) {
  const progress =
    challenge.targetValue > 0
      ? Math.min(100, (challenge.currentValue / challenge.targetValue) * 100)
      : 0
  const state = challenge.completed ? 'completed' : 'in progress'
  const label = `${challenge.name}, ${challenge.difficulty} mission, ${challenge.description}, ${challenge.currentValue} of ${challenge.targetValue} complete, ${challenge.xpReward} XP reward, ${state}`
  return (
    <View
      accessible
      accessibilityLabel={label}
      className={cn(
        'rounded-xl border p-4',
        challenge.completed
          ? 'border-cetus-accent/30 bg-cetus-accent/10'
          : 'border-cetus-hairline bg-cetus-canvas'
      )}
    >
      <View className="flex-row items-start gap-3">
        <Text className="text-2xl">{challenge.icon}</Text>
        <View className="flex-1 gap-1.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-sans font-bold text-cetus-ink">
              {challenge.name}
            </Text>
            <Text
              className={cn(
                'font-sans text-xs',
                difficultyColors[challenge.difficulty]
              )}
            >
              {challenge.difficulty.toUpperCase()}
            </Text>
            {challenge.completed ? (
              <Badge variant="success" size="sm">
                Completed
              </Badge>
            ) : null}
          </View>
          <Text className="font-sans text-sm text-cetus-ink-muted">
            {challenge.description}
          </Text>
          {challenge.completed ? null : (
            <View className="flex-row items-center gap-3">
              <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-cetus-surface">
                <View
                  className="h-full bg-cetus-accent"
                  style={{ width: `${progress}%` }}
                />
              </View>
              <Text className="font-sans text-xs text-cetus-ink-muted">
                {challenge.currentValue}/{challenge.targetValue}
              </Text>
            </View>
          )}
        </View>
        <Text
          className={cn(
            'font-sans text-sm font-bold',
            challenge.completed ? 'text-green-400' : 'text-cetus-accent'
          )}
        >
          +{challenge.xpReward} XP
        </Text>
      </View>
    </View>
  )
}

export function DailyMissionsPanel({
  challenges,
  xp,
  level,
  xpProgress,
  xpToNextLevel,
  streak,
  resetIn,
  responseStamp,
  onResetRefresh,
}: DailyMissionsPanelProps) {
  const clampedProgress = Math.min(100, Math.max(0, xpProgress))
  return (
    <Card variant="glass" className="gap-5 p-5">
      <View className="gap-2.5">
        <View className="flex-row items-center gap-2.5">
          <Text className="text-2xl">🎯</Text>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            className="flex-1 font-display text-lg font-bold text-cetus-accent"
          >
            DAILY MISSIONS
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Badge variant="outline" size="sm" className="bg-cetus-accent-2/20">
            Level {level}
          </Badge>
          <ResetCountdown
            resetIn={resetIn}
            responseStamp={responseStamp}
            onResetRefresh={onResetRefresh}
          />
        </View>
      </View>

      <View className="gap-1.5">
        <View className="flex-row justify-between">
          <Text className="font-sans text-sm text-cetus-ink-muted">
            XP Progress
          </Text>
          <Text className="font-sans text-sm text-cetus-accent">{xp} XP</Text>
        </View>
        <View className="h-2 w-full overflow-hidden rounded-full border border-cetus-hairline bg-cetus-canvas">
          <View
            className="h-full bg-cetus-accent"
            style={{ width: `${clampedProgress}%` }}
          />
        </View>
        <Text className="font-sans text-xs text-cetus-ink-muted">
          {level >= LEVEL_THRESHOLDS.length
            ? 'Maximum level reached'
            : `${xpToNextLevel} XP to Level ${level + 1}`}
        </Text>
      </View>

      <View className="gap-3">
        {challenges.map(challenge => (
          <MissionRow key={challenge.challengeId} challenge={challenge} />
        ))}
      </View>

      {streak > 0 ? (
        <View className="flex-row items-center gap-2 border-t border-cetus-hairline pt-4">
          <Text className="text-orange-400">🔥</Text>
          <Text className="font-sans text-sm text-cetus-ink-muted">
            Challenge Streak:{' '}
            <Text className="font-bold text-orange-400">{streak} days</Text>
          </Text>
        </View>
      ) : null}
    </Card>
  )
}
