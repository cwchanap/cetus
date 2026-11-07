import { Badge, Button, Card, Heading } from '@cetus/ui'
import { Text, View } from 'react-native'
import type {
  GameSessionActions,
  GameSessionCapabilities,
  GameSessionSnapshot,
} from '@cetus/app-core'
import { formatTime } from '@cetus/games/shared/utils'
import type { ChallengeUpdates } from '@cetus/games'
import type { AchievementNotification } from '@cetus/shared/achievements'

import type { NativeGameProjection } from './registry'

/** Latest committed reward delivery shown in one mounted-account banner. */
export interface NativeRewardBanner {
  achievements?: AchievementNotification[]
  challenges?: ChallengeUpdates
}

export interface NativeGameChromeProps {
  snapshot: GameSessionSnapshot<NativeGameProjection>
  actions: GameSessionActions
  capabilities: GameSessionCapabilities
  rewardBanner: NativeRewardBanner | null
}

/**
 * Minimal shared native chrome: score, time, start/pause/reset/replay and
 * one result sheet plus one reward banner. Board rendering belongs to each
 * game's ported view — this is deliberately not a web GameScreen port.
 */
export function NativeGameChrome({
  snapshot,
  actions,
  capabilities,
  rewardBanner,
}: NativeGameChromeProps) {
  // Sudoku-style games count up via projected.clock; countdown games use
  // the session's timeRemaining snapshot.
  const time =
    typeof snapshot.projected.clock === 'number'
      ? snapshot.projected.clock
      : snapshot.timeRemaining
  const { status, result } = snapshot

  return (
    <View className="gap-3 p-4">
      <View className="flex-row items-center justify-between gap-2">
        <Badge variant="secondary" size="sm">
          Score {snapshot.score}
        </Badge>
        <Text
          testID="game-time"
          className="font-display text-base text-cetus-ink"
        >
          {formatTime(time)}
        </Text>
        <Badge variant="outline" size="sm">
          {status}
        </Badge>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {status === 'idle' ? (
          <Button
            variant="primary"
            accessibilityLabel="Start game"
            onPress={actions.start}
          >
            Start
          </Button>
        ) : null}
        {status === 'running' && capabilities.pausable ? (
          <Button
            variant="outline"
            accessibilityLabel="Pause game"
            onPress={actions.pause}
          >
            Pause
          </Button>
        ) : null}
        {status === 'paused' && capabilities.pausable ? (
          <Button
            variant="primary"
            accessibilityLabel="Resume game"
            onPress={actions.resume}
          >
            Resume
          </Button>
        ) : null}
        {status !== 'idle' &&
        status !== 'finished' &&
        capabilities.resettable ? (
          <Button
            variant="ghost"
            accessibilityLabel="Reset game"
            onPress={actions.reset}
          >
            Reset
          </Button>
        ) : null}
        {status === 'finished' ? (
          <Button
            variant="primary"
            accessibilityLabel="Play again"
            onPress={actions.start}
          >
            Play again
          </Button>
        ) : null}
      </View>

      {rewardBanner ? (
        <Card variant="sci-fi" className="gap-1 p-3">
          <View testID="reward-banner" className="gap-0.5">
            {(rewardBanner.achievements ?? []).map(achievement => (
              <Text
                key={`achievement-${achievement.id}`}
                className="font-sans text-sm text-cetus-ink"
              >
                {achievement.icon} Achievement unlocked — {achievement.name}
              </Text>
            ))}
            {(rewardBanner.challenges?.completedChallenges ?? []).map(
              challenge => (
                <Text
                  key={`challenge-${challenge.id}`}
                  className="font-sans text-sm text-cetus-ink"
                >
                  {challenge.icon} Challenge complete — {challenge.name}
                </Text>
              )
            )}
          </View>
        </Card>
      ) : null}

      {status === 'finished' && result ? (
        <Card variant="sci-fi" className="gap-2 p-4">
          <Heading level={5} variant="section" align="center">
            Run complete
          </Heading>
          <Text
            testID="final-score"
            className="text-center font-display text-2xl text-cetus-ink"
          >
            {result.score}
          </Text>
          {result.saveStatus === 'pending' ? (
            <Text
              testID="result-save-status"
              className="text-center font-sans text-xs text-cetus-ink-muted"
            >
              Saving score…
            </Text>
          ) : null}
          {result.saveStatus === 'saved' ? (
            <Text
              testID="result-save-status"
              className="text-center font-sans text-xs text-cetus-ink-muted"
            >
              Score saved
            </Text>
          ) : null}
          {result.saveStatus === 'unconfirmed' ? (
            <Text
              testID="result-save-status"
              className="text-center font-sans text-xs text-cetus-ink-muted"
            >
              Score not confirmed
              {result.saveCode ? ` (${result.saveCode})` : ''}
            </Text>
          ) : null}
        </Card>
      ) : null}
    </View>
  )
}
