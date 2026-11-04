/// <reference types="react-native-css/types" />
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type {
  LoginRewardClaimResponse,
  LoginRewardStatusResponse,
} from '@cetus/shared/api-dto'
import { LOGIN_REWARD_CYCLE } from '@cetus/shared/loginRewards'
import { cn } from '../lib/utils'
import { Button } from './ui/button.native'
import { Heading } from './ui/heading.native'

export interface LoginRewardModalProps {
  status: LoginRewardStatusResponse | null
  open: boolean
  claimPhase: 'idle' | 'claiming' | 'success' | 'error'
  claimError: string | null
  claimResult: LoginRewardClaimResponse | null
  onClaim: () => void
  onClose: () => void
}

export function LoginRewardModal({
  status,
  open,
  claimPhase,
  claimError,
  claimResult,
  onClaim,
  onClose,
}: LoginRewardModalProps) {
  const insets = useSafeAreaInsets()
  const canClaim = status?.canClaim === true
  const claiming = claimPhase === 'claiming'
  const showClaimButton = canClaim && claimPhase !== 'success'
  const showLevelUp =
    claimResult?.leveledUp === true && claimResult.newLevel !== undefined
  const milestone = claimResult?.milestoneBadge
  const todayReward = status?.todayReward ?? {
    icon: '🌟',
    xp: 10,
    description: 'Day 1 - Welcome back!',
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/70">
        <Pressable
          accessibilityLabel="Dismiss daily login reward"
          accessibilityHint="Closes the daily login reward dialog"
          className="absolute inset-0"
          onPress={onClose}
        />
        <View
          pointerEvents="box-none"
          className="absolute inset-0 items-center justify-center"
          style={{
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 16),
            paddingLeft: Math.max(insets.left, 16),
            paddingRight: Math.max(insets.right, 16),
          }}
        >
          <View
            accessibilityViewIsModal
            className="max-h-full w-full max-w-lg rounded-2xl border border-cetus-hairline bg-cetus-surface"
          >
            <ScrollView
              contentContainerClassName="items-center gap-5 px-6 py-6"
              keyboardShouldPersistTaps="handled"
            >
              <View className="items-center gap-1">
                <Text className="text-4xl">🎁</Text>
                <Text className="font-sans text-xs tracking-widest text-cetus-ink-muted uppercase">
                  {'▸ DAILY REWARD'}
                </Text>
                <Heading level={4} variant="section" align="center">
                  Daily Login Reward
                </Heading>
                <Text className="font-sans text-sm text-cetus-ink-muted">
                  Welcome back! Claim your reward!
                </Text>
              </View>

              <View className="w-full flex-row gap-2">
                {LOGIN_REWARD_CYCLE.map((reward, index) => {
                  const claimed = status !== null && index < status.loginStreak
                  const current =
                    status !== null && index === status.loginStreak && canClaim
                  const state = claimed
                    ? 'claimed'
                    : current
                      ? 'today'
                      : 'upcoming'
                  return (
                    <View
                      key={reward.day}
                      accessible
                      accessibilityLabel={`Day ${reward.day}, ${reward.xp} XP, ${state}`}
                      className={cn(
                        'flex-1 items-center rounded-lg border p-2',
                        claimed && 'border-cetus-accent/40 bg-cetus-accent/10',
                        current && 'border-cetus-accent bg-cetus-accent/20',
                        state === 'upcoming' &&
                          'border-cetus-hairline bg-cetus-canvas'
                      )}
                    >
                      <Text className="font-sans text-xs text-cetus-ink-muted">
                        Day {reward.day}
                      </Text>
                      <Text className="text-lg">{reward.icon}</Text>
                      <Text className="font-sans text-xs font-semibold text-cetus-accent">
                        +{reward.xp}
                      </Text>
                    </View>
                  )
                })}
              </View>

              <View className="w-full items-center rounded-xl border border-cetus-accent/30 bg-cetus-accent/10 px-6 py-4">
                <Text className="text-3xl">{todayReward.icon}</Text>
                <Text
                  accessibilityLiveRegion="polite"
                  className="font-mono text-2xl font-bold text-cetus-accent"
                >
                  +{todayReward.xp} XP
                </Text>
                <Text className="mt-1 text-center font-sans text-sm text-cetus-ink-muted">
                  {todayReward.description}
                </Text>
              </View>

              <View className="flex-row justify-center gap-6">
                <View className="items-center">
                  <Text className="font-mono text-xl font-bold text-cetus-accent">
                    {status?.currentCycleDay ?? 0}
                  </Text>
                  <Text className="font-sans text-sm text-cetus-ink-muted">
                    Day Streak
                  </Text>
                </View>
                <View className="items-center">
                  <Text className="font-mono text-xl font-bold text-cetus-accent-3">
                    {status?.totalCycles ?? 0}
                  </Text>
                  <Text className="font-sans text-sm text-cetus-ink-muted">
                    Cycles
                  </Text>
                </View>
                <View className="items-center">
                  <Text className="font-mono text-xl font-bold text-cetus-accent-3">
                    {status?.daysUntilMilestone ?? 7}
                  </Text>
                  <Text className="font-sans text-sm text-cetus-ink-muted">
                    Days to 🏅
                  </Text>
                </View>
              </View>

              {showLevelUp ? (
                <View className="rounded-full bg-cetus-accent-3 px-4 py-2">
                  <Text className="font-sans font-bold text-white">
                    {`🎉 LEVEL UP! Level ${claimResult?.newLevel}`}
                  </Text>
                </View>
              ) : null}

              {milestone ? (
                <View className="w-full items-center rounded-xl border border-cetus-accent-2/30 bg-cetus-accent-2/20 px-4 py-3">
                  <Text className="text-2xl">{milestone.icon}</Text>
                  <Text className="font-sans font-bold text-cetus-accent-2">
                    {milestone.name}
                  </Text>
                  <Text className="text-center font-sans text-sm text-cetus-ink-muted">
                    {milestone.description}
                  </Text>
                </View>
              ) : null}

              {showClaimButton ? (
                <Button
                  variant="primary"
                  size="lg"
                  accessibilityRole="button"
                  accessibilityLabel="Claim daily login reward"
                  accessibilityHint="Claims today's login reward"
                  accessibilityState={{
                    disabled: claiming,
                    busy: claiming,
                  }}
                  disabled={claiming}
                  onPress={onClaim}
                  className="rounded-full"
                >
                  {claiming
                    ? 'Claiming...'
                    : claimPhase === 'error'
                      ? claimError
                      : 'Claim Reward'}
                </Button>
              ) : null}

              {!canClaim || claimPhase === 'success' ? (
                <View className="items-center">
                  <Text className="font-sans font-semibold text-green-400">
                    ✓ Claimed Today
                  </Text>
                  <Text className="mt-1 font-sans text-sm text-cetus-ink-muted">
                    Come back tomorrow!
                  </Text>
                </View>
              ) : null}

              <Text className="font-sans text-xs text-cetus-ink-muted">
                Tap outside or use the back button to close
              </Text>
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close daily login reward"
              accessibilityHint="Closes the daily login reward dialog"
              onPress={onClose}
              className="absolute right-2 top-2 rounded-full p-2 active:opacity-70"
            >
              <Text className="text-lg text-cetus-ink-muted">✕</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}
