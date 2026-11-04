import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useNativeVariable } from 'react-native-css/native'
import { useRemoteData } from '@cetus/app-core'
import { Button, Card, Heading } from '@cetus/ui'
import type {
  ScoreHistoryResponse,
  UserOverviewResponse,
} from '@cetus/shared/api-dto'
import { profileUpdateSchema } from '@cetus/shared/validations'

import { api } from '../../src/lib/api'
import { authClient } from '../../src/lib/auth-client'
import {
  AvatarBadge,
  avatarFileNameFor,
  avatarMimeTypeFor,
  avatarValidationError,
  favoriteGameLabel,
  HistoryEmpty,
  HistoryError,
  HistoryRow,
  ProfileError,
  ProfileLoading,
  ProfileSignIn,
  RECENT_SCORE_LIMIT,
  StatChip,
} from '../../src/lib/profile'
import { LoginRewardHost } from '../../src/lib/login-rewards'
import { isUnauthorizedError, useRefetchOnFocus } from '../../src/lib/refetch'
import { sessionKeyFor, useExpiredSessionGate } from '../../src/lib/session'

const toError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new Error(String(reason))

// Protected-API proof: the same `GET /api/settings` must succeed while
// signed in and return 401 once signed out. Mounted in both session states
// so the post-sign-out 401 is observable in the UI (live checks against the
// real backend are the manual/device acceptance gate).
function ProfileScreenBody() {
  const router = useRouter()
  const accent = useNativeVariable('--cetus-accent')
  const inkMuted = useNativeVariable('--cetus-ink-muted')
  // useSession is Better Auth's react binding over getSession.
  const {
    data: session,
    isPending,
    refetch: refetchSession,
  } = authClient.useSession()
  const userId = session?.user.id ?? null
  const sessionKey = sessionKeyFor(session)
  const { authExpired, markSessionExpired } = useExpiredSessionGate(sessionKey)
  const canFetch = userId !== null && !isPending && !authExpired

  const mutationSeqRef = useRef(0)
  const {
    data: overviewResult,
    loading: overviewLoading,
    error: overviewError,
    refresh: refreshOverview,
  } = useRemoteData<{ overview: UserOverviewResponse; seq: number }>(
    useCallback(() => {
      const seq = mutationSeqRef.current
      return api.getUserOverview().then(overview => ({ overview, seq }))
    }, []),
    ['profile', userId ?? 'anonymous', sessionKey ?? 'none'],
    canFetch
  )
  const overviewData = overviewResult?.overview
  const overviewSeq = overviewResult?.seq
  const {
    data: historyData,
    loading: historyLoading,
    error: historyError,
    refresh: refreshHistory,
  } = useRemoteData<ScoreHistoryResponse>(
    useCallback(() => api.getScoreHistory(RECENT_SCORE_LIMIT), []),
    ['profile-history', userId ?? 'anonymous', sessionKey ?? 'none'],
    canFetch
  )
  const refreshAll = useCallback(() => {
    refreshOverview()
    refreshHistory()
  }, [refreshOverview, refreshHistory])
  useRefetchOnFocus(refreshAll)

  const [mutationError, setMutationError] = useState<Error | null>(null)
  const reconciledForRef = useRef<string | null>(null)
  useEffect(() => {
    const unauthorized =
      isUnauthorizedError(overviewError) ||
      isUnauthorizedError(historyError) ||
      isUnauthorizedError(mutationError)
    if (!unauthorized || sessionKey === null) {
      return
    }
    markSessionExpired()
    if (reconciledForRef.current !== sessionKey) {
      reconciledForRef.current = sessionKey
      void Promise.resolve(refetchSession?.()).catch(() => undefined)
    }
  }, [
    overviewError,
    historyError,
    mutationError,
    sessionKey,
    markSessionExpired,
    refetchSession,
  ])

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const eligible =
    sessionKey !== null &&
    !isPending &&
    !authExpired &&
    !isUnauthorizedError(overviewError) &&
    !isUnauthorizedError(historyError) &&
    !isUnauthorizedError(mutationError)
  const epochRef = useRef(0)
  const latestRef = useRef({ key: sessionKey, eligible, epoch: 0 })
  if (
    latestRef.current.key !== sessionKey ||
    latestRef.current.eligible !== eligible
  ) {
    epochRef.current += 1
  }
  latestRef.current = { key: sessionKey, eligible, epoch: epochRef.current }
  const epoch = latestRef.current.epoch
  const saveBusyFor = useRef<number | null>(null)
  const avatarBusyFor = useRef<number | null>(null)
  const isStale = (operationEpoch: number) =>
    !mountedRef.current || latestRef.current.epoch !== operationEpoch

  const [draftFor, setDraftFor] = useState<string | null>(sessionKey)
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [usernameDraft, setUsernameDraft] = useState('')
  const [syncedFor, setSyncedFor] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileNotice, setProfileNotice] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null)
  const [avatarOverride, setAvatarOverride] = useState<{
    epoch: number
    uri: string | null
    seq: number
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [busyResetEpoch, setBusyResetEpoch] = useState(epoch)

  if (draftFor !== sessionKey) {
    setDraftFor(sessionKey)
    setSyncedFor(null)
    setDisplayNameDraft('')
    setUsernameDraft('')
    setProfileError(null)
    setProfileNotice(null)
    setAvatarError(null)
    setAvatarNotice(null)
    setAvatarOverride(null)
    setMutationError(null)
    setSaving(false)
    setUploading(false)
  }
  if (
    overviewData !== undefined &&
    sessionKey !== null &&
    syncedFor !== sessionKey
  ) {
    setSyncedFor(sessionKey)
    setDisplayNameDraft(overviewData.profile.displayName ?? '')
    setUsernameDraft(overviewData.profile.username ?? '')
  }
  if (busyResetEpoch !== epoch) {
    setBusyResetEpoch(epoch)
    setSaving(false)
    setUploading(false)
  }
  if (avatarOverride !== null) {
    if (
      avatarOverride.epoch !== epoch ||
      (overviewSeq !== undefined && overviewSeq >= avatarOverride.seq)
    ) {
      setAvatarOverride(null)
    }
  }

  const openSignIn = useCallback(() => {
    router.push({
      pathname: '/sign-in',
      params: { returnTo: '/(tabs)/profile' },
    })
  }, [router])

  const saveProfile = async () => {
    const opEpoch = latestRef.current.epoch
    if (!latestRef.current.eligible || saveBusyFor.current === opEpoch) {
      return
    }
    setProfileError(null)
    setProfileNotice(null)
    const parsed = profileUpdateSchema.safeParse({
      displayName: displayNameDraft,
      username: usernameDraft,
    })
    if (!parsed.success) {
      setProfileError(
        parsed.error.issues[0]?.message ?? 'Check the fields and try again.'
      )
      return
    }
    saveBusyFor.current = opEpoch
    setSaving(true)
    try {
      await api.updateProfile(parsed.data)
      if (isStale(opEpoch)) {
        return
      }
      mutationSeqRef.current += 1
      setProfileNotice('Profile updated.')
      refreshOverview()
    } catch (reason) {
      const error = toError(reason)
      if (isStale(opEpoch)) {
        return
      }
      setMutationError(error)
      if (!isUnauthorizedError(error)) {
        setProfileError(error.message || 'Could not save your profile.')
      }
    } finally {
      if (saveBusyFor.current === opEpoch) {
        saveBusyFor.current = null
        setSaving(false)
      }
    }
  }

  const pickAvatar = async () => {
    const opEpoch = latestRef.current.epoch
    if (!latestRef.current.eligible || avatarBusyFor.current === opEpoch) {
      return
    }
    avatarBusyFor.current = opEpoch
    setUploading(true)
    setAvatarError(null)
    setAvatarNotice(null)
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (isStale(opEpoch)) {
        return
      }
      if (!permission.granted) {
        setAvatarError('Allow photo library access to choose an avatar.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      })
      if (isStale(opEpoch) || result.canceled) {
        return
      }
      const asset = result.assets?.[0]
      if (asset === undefined || asset === null) {
        return
      }
      const problem = avatarValidationError(asset)
      if (problem !== null) {
        setAvatarError(problem)
        return
      }
      const mime = avatarMimeTypeFor(asset)
      if (mime === null) {
        return
      }
      const formData = new FormData()
      formData.append('avatar', {
        uri: asset.uri,
        name: avatarFileNameFor(asset, mime),
        type: mime,
      } as unknown as Blob)
      if (isStale(opEpoch)) {
        return
      }
      const updated = await api.uploadAvatar(formData)
      if (isStale(opEpoch)) {
        return
      }
      mutationSeqRef.current += 1
      setAvatarOverride({
        epoch: opEpoch,
        uri: updated.avatar,
        seq: mutationSeqRef.current,
      })
      setAvatarNotice('Avatar updated.')
      refreshOverview()
    } catch (reason) {
      const error = toError(reason)
      if (isStale(opEpoch)) {
        return
      }
      setMutationError(error)
      if (!isUnauthorizedError(error)) {
        setAvatarError("Couldn't update your avatar. Try again.")
      }
    } finally {
      if (avatarBusyFor.current === opEpoch) {
        avatarBusyFor.current = null
        setUploading(false)
      }
    }
  }

  const removeAvatar = async () => {
    const opEpoch = latestRef.current.epoch
    if (!latestRef.current.eligible || avatarBusyFor.current === opEpoch) {
      return
    }
    avatarBusyFor.current = opEpoch
    setUploading(true)
    setAvatarError(null)
    setAvatarNotice(null)
    try {
      await api.deleteAvatar()
      if (isStale(opEpoch)) {
        return
      }
      mutationSeqRef.current += 1
      setAvatarOverride({
        epoch: opEpoch,
        uri: null,
        seq: mutationSeqRef.current,
      })
      setAvatarNotice('Avatar removed.')
      refreshOverview()
    } catch (reason) {
      const error = toError(reason)
      if (isStale(opEpoch)) {
        return
      }
      setMutationError(error)
      if (!isUnauthorizedError(error)) {
        setAvatarError("Couldn't remove your avatar. Try again.")
      }
    } finally {
      if (avatarBusyFor.current === opEpoch) {
        avatarBusyFor.current = null
        setUploading(false)
      }
    }
  }

  const handleSignOut = () => {
    // The expo client clears the local session in its fetch `init`
    // hook — before the request resolves — so a failed sign-out is
    // never observable here: the screen is already on the signed-out
    // view (and the user IS signed out locally regardless). Swallow
    // rejections; there is nothing to surface.
    void authClient.signOut().catch(() => {})
  }

  const signOutControl = (
    <Button
      variant="outline"
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      onPress={handleSignOut}
      className="mt-1"
    >
      Sign out
    </Button>
  )

  if (isPending) {
    return (
      <View className="flex-1 bg-cetus-canvas">
        <ProfileLoading />
        {session ? <View className="px-4 pb-10">{signOutControl}</View> : null}
      </View>
    )
  }

  if (!session) {
    return <ProfileSignIn onSignIn={openSignIn} />
  }

  if (
    authExpired ||
    isUnauthorizedError(overviewError) ||
    isUnauthorizedError(historyError) ||
    isUnauthorizedError(mutationError)
  ) {
    return (
      <View className="flex-1 bg-cetus-canvas">
        <ProfileSignIn expired onSignIn={openSignIn} />
        <View className="px-4 pb-10">{signOutControl}</View>
      </View>
    )
  }

  if (overviewData === undefined) {
    return (
      <View className="flex-1 bg-cetus-canvas">
        {overviewLoading ? (
          <ProfileLoading />
        ) : (
          <ProfileError
            error={overviewError ?? new Error('Profile request failed')}
            onRetry={refreshOverview}
          />
        )}
        <View className="px-4 pb-10">{signOutControl}</View>
      </View>
    )
  }

  const { profile, stats } = overviewData
  const displayName =
    profile.displayName ?? session.user.name ?? session.user.email
  const serverImage =
    avatarOverride !== null && avatarOverride.epoch === epoch
      ? avatarOverride.uri
      : profile.image
  const memberSince = new Date(profile.createdAt).toLocaleDateString()

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-cetus-canvas"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pb-10 pt-4"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={overviewLoading}
            onRefresh={refreshAll}
            tintColor={accent}
          />
        }
      >
        <View className="gap-1">
          <Heading level={4} variant="section" kicker="DIVER FILE">
            Profile
          </Heading>
        </View>

        <Card variant="sci-fi" className="gap-3 p-4">
          <View className="flex-row items-center gap-4">
            <AvatarBadge name={displayName} uri={serverImage} />
            <View className="flex-1 gap-0.5">
              <Text
                className="font-display text-lg font-bold text-cetus-ink"
                numberOfLines={1}
              >
                {displayName}
              </Text>
              {profile.username !== null ? (
                <Text
                  className="font-sans text-sm text-cetus-accent"
                  numberOfLines={1}
                >
                  @{profile.username}
                </Text>
              ) : null}
              <Text
                className="font-sans text-xs text-cetus-ink-muted"
                numberOfLines={1}
              >
                {session.user.email}
              </Text>
              <Text className="font-sans text-xs text-cetus-ink-muted">
                Member since {memberSince}
              </Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              accessibilityRole="button"
              accessibilityLabel="Change avatar"
              disabled={uploading}
              onPress={() => {
                void pickAvatar()
              }}
            >
              {uploading ? 'Working…' : 'Change avatar'}
            </Button>
            {serverImage !== null && serverImage !== '' ? (
              <Button
                variant="ghost"
                size="sm"
                accessibilityRole="button"
                accessibilityLabel="Remove avatar"
                disabled={uploading}
                onPress={() => {
                  void removeAvatar()
                }}
              >
                Remove avatar
              </Button>
            ) : null}
          </View>
          {avatarError !== null ? (
            <Text
              accessibilityRole="alert"
              testID="profile-avatar-error"
              className="font-sans text-sm text-red-400"
            >
              {avatarError}
            </Text>
          ) : null}
          {avatarNotice !== null ? (
            <Text
              testID="profile-avatar-notice"
              className="font-sans text-sm text-cetus-accent"
            >
              {avatarNotice}
            </Text>
          ) : null}
        </Card>

        <Card variant="sci-fi" className="gap-2.5 p-4">
          <Text className="font-display text-sm font-bold text-cetus-ink">
            Dive stats
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <StatChip
              label="Level"
              value={`${stats.level} · ${stats.xp.toLocaleString()} XP`}
            />
            <StatChip
              label="Games played"
              value={stats.totalGamesPlayed.toLocaleString()}
            />
            <StatChip
              label="Total score"
              value={stats.totalScore.toLocaleString()}
            />
            <StatChip label="Streak" value={`${stats.streakDays} days`} />
            <StatChip
              label="Favorite"
              value={favoriteGameLabel(stats.favoriteGame)}
            />
          </View>
        </Card>

        <Card variant="sci-fi" className="gap-3 p-4">
          <Text className="font-display text-sm font-bold text-cetus-ink">
            Edit profile
          </Text>
          <View className="gap-1">
            <Text className="font-sans text-xs text-cetus-ink-muted">
              Display name
            </Text>
            <TextInput
              accessibilityLabel="Display name"
              value={displayNameDraft}
              onChangeText={setDisplayNameDraft}
              placeholder="How other divers see you"
              placeholderTextColor={inkMuted}
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={100}
              editable={!saving}
              className="rounded-xl border border-cetus-hairline bg-cetus-canvas px-3 py-2.5 font-sans text-sm text-cetus-ink"
            />
          </View>
          <View className="gap-1">
            <Text className="font-sans text-xs text-cetus-ink-muted">
              Username
            </Text>
            <TextInput
              accessibilityLabel="Username"
              value={usernameDraft}
              onChangeText={setUsernameDraft}
              placeholder="lowercase, numbers, underscores"
              placeholderTextColor={inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              maxLength={20}
              editable={!saving}
              className="rounded-xl border border-cetus-hairline bg-cetus-canvas px-3 py-2.5 font-sans text-sm text-cetus-ink"
            />
          </View>
          {profileError !== null ? (
            <Text
              accessibilityRole="alert"
              testID="profile-edit-error"
              className="font-sans text-sm text-red-400"
            >
              {profileError}
            </Text>
          ) : null}
          {profileNotice !== null ? (
            <Text
              testID="profile-edit-notice"
              className="font-sans text-sm text-cetus-accent"
            >
              {profileNotice}
            </Text>
          ) : null}
          <Button
            variant="primary"
            accessibilityRole="button"
            accessibilityLabel="Save profile"
            disabled={saving}
            onPress={() => {
              void saveProfile()
            }}
          >
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
        </Card>

        <Card variant="sci-fi" className="gap-2 p-4">
          <Text className="font-display text-sm font-bold text-cetus-ink">
            Recent scores
          </Text>
          {historyData === undefined ? (
            historyLoading ? (
              <View className="items-center py-4">
                <ActivityIndicator accessibilityLabel="Loading recent scores" />
              </View>
            ) : (
              <HistoryError
                error={historyError ?? new Error('History request failed')}
                onRetry={refreshHistory}
              />
            )
          ) : historyData.history.length === 0 ? (
            <HistoryEmpty />
          ) : (
            <View className="gap-2">
              {historyData.history.map(entry => (
                <HistoryRow
                  key={`${entry.game_id}-${entry.created_at}-${entry.score}`}
                  entry={entry}
                />
              ))}
            </View>
          )}
        </Card>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notification settings"
          accessibilityHint="Opens email, push and reminder preferences"
          onPress={() => router.push('/settings')}
          className="active:opacity-80"
        >
          <Card variant="sci-fi" className="flex-row items-center gap-3 p-4">
            <Text className="text-xl">🔔</Text>
            <View className="flex-1 gap-0.5">
              <Text className="font-display text-sm font-bold text-cetus-ink">
                Notification settings
              </Text>
              <Text className="font-sans text-xs text-cetus-ink-muted">
                Email, push and daily challenge reminders
              </Text>
            </View>
            <Text className="font-sans text-sm text-cetus-ink-muted">›</Text>
          </Card>
        </Pressable>

        {signOutControl}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export default function ProfileScreen() {
  return (
    <>
      <ProfileScreenBody />
      <LoginRewardHost />
    </>
  )
}
