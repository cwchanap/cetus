import { ActivityIndicator, Text, View } from 'react-native'
import { Button, Heading } from '@cetus/ui'
import type {
  ChallengeProgressResponse,
  ChallengesResponse,
} from '@cetus/shared/api-dto'
import { ChallengeType } from '@cetus/shared/challenges'
import { GameID } from '@cetus/shared/games'

import { isNetworkError, isServiceUnavailable } from './refetch'

const CHALLENGE_TYPES = new Set<string>(Object.values(ChallengeType))
const GAME_IDS = new Set<string>(Object.values(GameID))
const DIFFICULTIES = new Set(['easy', 'medium', 'hard'])
const MAX_RESET_IN_SECONDS = 86_400
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

const isPercent = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 100

function isUtcDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

function isCanonicalTimestamp(value: string): boolean {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return false
  }
  return parsed.toISOString() === value
}

function isMissionProgress(mission: unknown): boolean {
  if (mission === null || typeof mission !== 'object') {
    return false
  }
  const entry = mission as Partial<ChallengeProgressResponse>
  return (
    typeof entry.challengeId === 'string' &&
    entry.challengeId.length > 0 &&
    typeof entry.name === 'string' &&
    entry.name.length > 0 &&
    typeof entry.description === 'string' &&
    typeof entry.icon === 'string' &&
    entry.icon.length > 0 &&
    typeof entry.type === 'string' &&
    CHALLENGE_TYPES.has(entry.type) &&
    isPositiveInteger(entry.targetValue) &&
    isNonNegativeInteger(entry.currentValue) &&
    isNonNegativeInteger(entry.xpReward) &&
    typeof entry.difficulty === 'string' &&
    DIFFICULTIES.has(entry.difficulty) &&
    typeof entry.completed === 'boolean' &&
    (entry.completedAt === null ||
      (typeof entry.completedAt === 'string' &&
        isCanonicalTimestamp(entry.completedAt))) &&
    (entry.gameId === undefined || GAME_IDS.has(entry.gameId))
  )
}

export function challengesResponseFor(
  data: unknown
): ChallengesResponse | null {
  if (data === null || typeof data !== 'object') {
    return null
  }
  const candidate = data as Partial<ChallengesResponse>
  if (
    !isNonNegativeInteger(candidate.xp) ||
    !isPositiveInteger(candidate.level) ||
    !isPercent(candidate.xpProgress) ||
    !isNonNegativeInteger(candidate.xpToNextLevel) ||
    !isNonNegativeInteger(candidate.streak) ||
    !isNonNegativeInteger(candidate.resetIn) ||
    candidate.resetIn > MAX_RESET_IN_SECONDS
  ) {
    return null
  }
  if (typeof candidate.date !== 'string' || !isUtcDate(candidate.date)) {
    return null
  }
  if (
    !Array.isArray(candidate.challenges) ||
    !candidate.challenges.every(isMissionProgress)
  ) {
    return null
  }
  return candidate as ChallengesResponse
}

export function ChallengesLoading() {
  return (
    <View
      testID="challenges-loading"
      className="flex-1 items-center justify-center gap-3 py-16"
    >
      <ActivityIndicator accessibilityLabel="Loading daily missions" />
      <Text className="font-sans text-sm text-cetus-ink-muted">
        Loading daily missions…
      </Text>
    </View>
  )
}

export function ChallengesError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  const unavailable = isServiceUnavailable(error)
  const offline = isNetworkError(error)
  const title = unavailable
    ? 'Daily missions temporarily unavailable'
    : offline
      ? "Couldn't reach the missions service"
      : "Couldn't load daily missions"
  const body = unavailable
    ? 'The missions service cannot respond right now. Try again shortly.'
    : offline
      ? 'Check your connection and try again.'
      : 'Something went wrong. Try again.'
  return (
    <View
      testID={unavailable ? 'challenges-unavailable' : 'challenges-error'}
      className="flex-1 items-center justify-center gap-3 px-6 py-16"
    >
      <Text className="font-display text-center text-base font-bold text-cetus-ink">
        {title}
      </Text>
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        {body}
      </Text>
      <Button
        variant="outline"
        accessibilityRole="button"
        accessibilityLabel="Retry loading daily missions"
        onPress={onRetry}
        className="mt-1"
      >
        Retry
      </Button>
    </View>
  )
}

export function ChallengesEmpty() {
  return (
    <View
      testID="challenges-empty"
      className="items-center gap-1 rounded-xl border border-cetus-hairline px-4 py-5"
    >
      <Text className="font-sans text-sm text-cetus-ink-muted">
        No missions today
      </Text>
      <Text className="font-sans text-center text-xs text-cetus-ink-muted">
        Check back after the daily UTC reset.
      </Text>
    </View>
  )
}

export function ChallengesSignIn({
  expired,
  onSignIn,
}: {
  expired?: boolean
  onSignIn: () => void
}) {
  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-cetus-canvas p-6">
      <Heading level={4} variant="section" align="center">
        Challenges
      </Heading>
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        {expired
          ? 'Your session has expired. Sign in again to keep tracking daily missions.'
          : 'Sign in to take on daily missions, earn XP and build your streak.'}
      </Text>
      <Button
        variant="primary"
        accessibilityRole="button"
        accessibilityLabel="Sign in to view daily missions"
        onPress={onSignIn}
        className="mt-2"
      >
        Sign in
      </Button>
    </View>
  )
}
