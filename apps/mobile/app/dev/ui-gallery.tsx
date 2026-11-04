import { useState, type ReactNode } from 'react'
import { Stack, useRouter } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Badge,
  Button,
  Card,
  DailyMissionsPanel,
  Heading,
  LoginRewardModal,
  Select,
  Toggle,
  type BadgeVariant,
  type ButtonVariant,
  type CardVariant,
} from '@cetus/ui'
import type {
  ChallengeProgressResponse,
  LoginRewardClaimResponse,
  LoginRewardStatusResponse,
} from '@cetus/shared/api-dto'
import { ChallengeType } from '@cetus/shared/challenges'

declare const __DEV__: boolean

const BUTTON_VARIANTS: ButtonVariant[] = [
  'default',
  'destructive',
  'outline',
  'secondary',
  'ghost',
  'link',
  'primary',
]

const BADGE_VARIANTS: BadgeVariant[] = [
  'default',
  'secondary',
  'destructive',
  'outline',
  'success',
  'warning',
  'error',
]

const CARD_VARIANTS: CardVariant[] = ['default', 'sci-fi', 'glass', 'elevated']

const SELECT_OPTIONS = [
  { value: 'all', label: 'All games' },
  { value: 'tetris', label: 'Tetris Challenge' },
  { value: 'snake', label: 'Snake' },
]

const MISSIONS: ChallengeProgressResponse[] = [
  {
    challengeId: 'play_2_games',
    name: 'Warm Up',
    description: 'Play 2 games today',
    icon: '🎮',
    type: ChallengeType.PLAY_GAMES,
    targetValue: 2,
    currentValue: 1,
    xpReward: 30,
    difficulty: 'easy',
    completed: false,
    completedAt: null,
  },
  {
    challengeId: 'score_tetris_100',
    name: 'Tetris Starter',
    description: 'Score 100+ points in Tetris',
    icon: '🔲',
    type: ChallengeType.SCORE_TARGET,
    targetValue: 100,
    currentValue: 100,
    xpReward: 30,
    difficulty: 'medium',
    completed: true,
    completedAt: '2026-11-02T08:15:00.000Z',
  },
]

const RESPONSE_STAMP = { date: '2026-11-02' }

const REWARD_STATUS: LoginRewardStatusResponse = {
  loginStreak: 2,
  currentCycleDay: 3,
  totalCycles: 1,
  totalConsecutiveDays: 9,
  todayReward: {
    day: 3,
    xp: 30,
    icon: '✨',
    description: 'Day 3 - Building momentum!',
  },
  alreadyClaimed: false,
  canClaim: true,
  nextMilestone: {
    totalDays: 30,
    achievementId: 'login_streak_30',
    name: 'Monthly Master',
    description: 'Complete 30 days of consecutive logins',
    icon: '🎖️',
  },
  daysUntilMilestone: 21,
}

const CLAIM_RESULT: LoginRewardClaimResponse = {
  success: true,
  xpEarned: 30,
  newTotalXP: 480,
  newLevel: 4,
  leveledUp: true,
  previousLevel: 3,
  milestoneBadge: {
    totalDays: 30,
    achievementId: 'login_streak_30',
    name: 'Monthly Master',
    description: 'Complete 30 days of consecutive logins',
    icon: '🎖️',
  },
}

type RewardScenario = 'claimable' | 'claiming' | 'claimed' | 'error' | 'success'

const REWARD_SCENARIOS: { value: RewardScenario; label: string }[] = [
  { value: 'claimable', label: 'Claimable' },
  { value: 'claiming', label: 'Claiming' },
  { value: 'claimed', label: 'Already claimed' },
  { value: 'error', label: 'Claim error' },
  { value: 'success', label: 'Claim success' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Heading level={5} variant="subsection">
        {title}
      </Heading>
      <View className="gap-2">{children}</View>
    </View>
  )
}

function GalleryUnavailable() {
  const router = useRouter()
  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-cetus-canvas p-6">
      <Stack.Screen options={{ title: 'Not found' }} />
      <Heading level={4} variant="section" align="center">
        Not available
      </Heading>
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        This screen is only available in development builds.
      </Text>
      <Button
        variant="outline"
        accessibilityLabel="Back to games"
        accessibilityHint="Returns to the games catalog"
        onPress={() => router.replace('/')}
        className="mt-2"
      >
        Back to games
      </Button>
    </View>
  )
}

function DevGallery() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [pressCount, setPressCount] = useState(0)
  const [selected, setSelected] = useState('tetris')
  const [sciFiOn, setSciFiOn] = useState(true)
  const [defaultOn, setDefaultOn] = useState(false)
  const [scenario, setScenario] = useState<RewardScenario | null>(null)
  const [previewClaimed, setPreviewClaimed] = useState(false)

  const scenarioStatus =
    scenario === 'claimed'
      ? { ...REWARD_STATUS, canClaim: false, alreadyClaimed: true }
      : REWARD_STATUS
  const claimPhase: 'idle' | 'claiming' | 'success' | 'error' =
    previewClaimed || scenario === 'success'
      ? 'success'
      : scenario === 'claiming'
        ? 'claiming'
        : scenario === 'error'
          ? 'error'
          : 'idle'
  const claimError =
    scenario === 'error' ? 'Preview claim failed. Try again.' : null
  const claimResult = claimPhase === 'success' ? CLAIM_RESULT : null

  return (
    <View className="flex-1 bg-cetus-canvas">
      <Stack.Screen options={{ title: 'UI gallery' }} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-4 pb-8 pt-3"
      >
        <View className="gap-1">
          <Heading level={4} variant="section" kicker="DEV TOOLS">
            UI gallery
          </Heading>
          <Text className="font-sans text-xs text-cetus-ink-muted">
            Native components used by HPA-182 screens. Development builds only.
          </Text>
        </View>

        <Section title="Heading">
          <Heading level={3} variant="hero" kicker="HERO">
            Hero heading
          </Heading>
          <Heading level={4} variant="section">
            Section heading
          </Heading>
          <Heading level={5} variant="subsection">
            Subsection heading
          </Heading>
          <Heading level={6} variant="default" align="center">
            Default heading
          </Heading>
        </Section>

        <Section title="Button">
          <View className="flex-row flex-wrap gap-2">
            {BUTTON_VARIANTS.map(variant => (
              <Button
                key={variant}
                variant={variant}
                size="sm"
                accessibilityLabel={`Button variant ${variant}`}
              >
                {variant}
              </Button>
            ))}
          </View>
          <View className="flex-row flex-wrap items-center gap-2">
            <Button
              variant="primary"
              accessibilityLabel="Count presses"
              onPress={() => setPressCount(count => count + 1)}
            >
              Count presses
            </Button>
            <Button
              variant="primary"
              accessibilityLabel="Disabled button"
              disabled
            >
              Disabled
            </Button>
            <Text
              testID="button-press-count"
              className="font-sans text-xs text-cetus-ink-muted"
            >
              Pressed {pressCount} times
            </Text>
          </View>
        </Section>

        <Section title="Badge">
          <View className="flex-row flex-wrap gap-2">
            {BADGE_VARIANTS.map(variant => (
              <Badge
                key={variant}
                variant={variant}
                testID={`badge-${variant}`}
              >
                {variant}
              </Badge>
            ))}
          </View>
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge variant="outline" size="sm">
              sm
            </Badge>
            <Badge variant="outline">default</Badge>
            <Badge variant="outline" size="lg">
              lg
            </Badge>
          </View>
        </Section>

        <Section title="Card">
          {CARD_VARIANTS.map(variant => (
            <Card
              key={variant}
              variant={variant}
              className="gap-1 p-4"
              testID={`card-${variant}`}
            >
              <Text className="font-display text-sm font-bold text-cetus-ink">
                {variant}
              </Text>
              <Text className="font-sans text-xs text-cetus-ink-muted">
                Card variant {variant}
              </Text>
            </Card>
          ))}
          <Card
            variant="sci-fi"
            brackets
            className="gap-1 p-4"
            testID="card-brackets"
          >
            <Text className="font-display text-sm font-bold text-cetus-ink">
              brackets
            </Text>
            <Text className="font-sans text-xs text-cetus-ink-muted">
              HUD bracket corners
            </Text>
          </Card>
        </Section>

        <Section title="Select">
          <Select
            variant="default"
            options={SELECT_OPTIONS}
            value={selected}
            onValueChange={setSelected}
            accessibilityLabel="Select variant default"
          />
          <Select
            variant="glass"
            options={SELECT_OPTIONS}
            value="snake"
            onValueChange={() => {}}
            accessibilityLabel="Select variant glass"
          />
          <Select
            variant="outline"
            options={SELECT_OPTIONS}
            defaultValue="all"
            accessibilityLabel="Select variant outline"
          />
          <Select
            options={SELECT_OPTIONS}
            placeholder="Disabled select"
            disabled
            accessibilityLabel="Select disabled"
          />
          <Text
            testID="select-value"
            className="font-sans text-xs text-cetus-ink-muted"
          >
            Selected: {selected}
          </Text>
        </Section>

        <Section title="Toggle">
          <Card variant="sci-fi" className="gap-4 p-4">
            <Toggle
              variant="sci-fi"
              label="Sci-fi toggle"
              description="Variant used by Settings"
              checked={sciFiOn}
              onCheckedChange={setSciFiOn}
            />
            <Toggle
              variant="default"
              label="Default toggle"
              description="Standard switch styling"
              checked={defaultOn}
              onCheckedChange={setDefaultOn}
            />
            <Toggle
              label="Disabled toggle"
              description="State locked"
              checked={false}
              disabled
              onCheckedChange={() => {}}
            />
          </Card>
        </Section>

        <Section title="Daily missions panel">
          <DailyMissionsPanel
            challenges={MISSIONS}
            xp={120}
            level={3}
            xpProgress={40}
            xpToNextLevel={130}
            streak={4}
            resetIn={5415}
            responseStamp={RESPONSE_STAMP}
            onResetRefresh={() => {}}
          />
        </Section>

        <Section title="Login reward modal">
          <View className="flex-row flex-wrap gap-2">
            {REWARD_SCENARIOS.map(({ value, label }) => (
              <Button
                key={value}
                variant="outline"
                size="sm"
                accessibilityLabel={`Preview reward: ${value}`}
                onPress={() => {
                  setScenario(value)
                  setPreviewClaimed(false)
                }}
              >
                {label}
              </Button>
            ))}
          </View>
        </Section>

        {router.canGoBack() ? null : (
          <Button
            variant="outline"
            accessibilityLabel="Back to games"
            accessibilityHint="Returns to the games catalog"
            onPress={() => router.replace('/')}
          >
            Back to games
          </Button>
        )}
        <View style={{ height: Math.max(insets.bottom, 0) }} />
      </ScrollView>
      <LoginRewardModal
        status={scenarioStatus}
        open={scenario !== null}
        claimPhase={claimPhase}
        claimError={claimError}
        claimResult={claimResult}
        onClaim={() => setPreviewClaimed(true)}
        onClose={() => {
          setScenario(null)
          setPreviewClaimed(false)
        }}
      />
    </View>
  )
}

export default function UiGalleryRoute() {
  if (!__DEV__) {
    return <GalleryUnavailable />
  }
  return <DevGallery />
}
