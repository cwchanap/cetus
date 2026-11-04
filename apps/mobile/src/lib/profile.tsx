import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
import { Button, Heading } from '@cetus/ui'
import type { ScoreHistoryEntryResponse } from '@cetus/shared/api-dto'
import { getGameById, type GameID } from '@cetus/shared/games'

import { isNetworkError } from './refetch'

export const RECENT_SCORE_LIMIT = 5
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const AVATAR_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]

const EXTENSION_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export interface PickedAsset {
  uri: string
  fileName?: string | null
  fileSize?: number
  mimeType?: string
}

export function avatarMimeTypeFor(asset: PickedAsset): string | null {
  const direct = asset.mimeType?.toLowerCase()
  if (direct !== undefined) {
    return AVATAR_MIME_TYPES.includes(direct) ? direct : null
  }
  const name = (asset.fileName ?? asset.uri).split('?')[0]
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_MIME_TYPES[extension] ?? null
}

export function avatarFileNameFor(asset: PickedAsset, mime: string): string {
  return asset.fileName ?? `avatar.${MIME_EXTENSIONS[mime] ?? 'png'}`
}

export function avatarValidationError(asset: PickedAsset): string | null {
  if (avatarMimeTypeFor(asset) === null) {
    return 'Choose a PNG, JPEG, WebP, or GIF image.'
  }
  if (asset.fileSize !== undefined && asset.fileSize > AVATAR_MAX_BYTES) {
    return 'Choose an image under 5 MB.'
  }
  return null
}

export function AvatarBadge({
  name,
  uri,
}: {
  name: string
  uri: string | null
}) {
  if (uri !== null && uri !== '') {
    return (
      <View className="h-20 w-20 overflow-hidden rounded-full border-2 border-cetus-accent/40">
        <Image
          testID="profile-avatar-image"
          source={{ uri }}
          accessibilityLabel="Profile avatar"
          className="h-full w-full"
        />
      </View>
    )
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <View
      testID="profile-avatar-initial"
      accessible
      accessibilityLabel="Profile avatar placeholder"
      className="h-20 w-20 items-center justify-center rounded-full border-2 border-cetus-accent/40 bg-cetus-accent/20"
    >
      <Text className="font-display text-2xl font-bold text-cetus-accent">
        {initial}
      </Text>
    </View>
  )
}

export function ProfileLoading() {
  return (
    <View
      testID="profile-loading"
      className="flex-1 items-center justify-center gap-3 py-16"
    >
      <ActivityIndicator accessibilityLabel="Loading your profile" />
      <Text className="font-sans text-sm text-cetus-ink-muted">
        Loading your profile…
      </Text>
    </View>
  )
}

export function ProfileError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  const offline = isNetworkError(error)
  const title = offline
    ? "Couldn't reach the profile service"
    : "Couldn't load your profile"
  const body = offline
    ? 'Check your connection and try again.'
    : 'Something went wrong. Try again.'
  return (
    <View
      testID="profile-error"
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
        accessibilityLabel="Retry loading your profile"
        onPress={onRetry}
        className="mt-1"
      >
        Retry
      </Button>
    </View>
  )
}

export function ProfileSignIn({
  expired,
  onSignIn,
}: {
  expired?: boolean
  onSignIn: () => void
}) {
  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-cetus-canvas p-6">
      <Heading level={4} variant="section" align="center">
        Profile
      </Heading>
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        {expired
          ? 'Your session has expired. Sign in again to view your profile.'
          : 'Sign in to sync your profile, scores, and achievements across devices.'}
      </Text>
      <Button
        variant="primary"
        accessibilityRole="button"
        accessibilityLabel="Sign in to view your profile"
        onPress={onSignIn}
        className="mt-2"
      >
        Sign in
      </Button>
    </View>
  )
}

export function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[45%] flex-1 gap-0.5 rounded-xl border border-cetus-hairline bg-cetus-canvas px-3 py-2.5">
      <Text className="font-sans text-[11px] uppercase tracking-wide text-cetus-ink-muted">
        {label}
      </Text>
      <Text className="font-display text-base font-bold text-cetus-ink">
        {value}
      </Text>
    </View>
  )
}

export function favoriteGameLabel(gameId: string | null): string {
  if (gameId === null) {
    return '—'
  }
  return getGameById(gameId as GameID)?.name ?? gameId
}

export function HistoryRow({ entry }: { entry: ScoreHistoryEntryResponse }) {
  return (
    <View
      accessible
      accessibilityLabel={`${entry.game_name}, score ${entry.score.toLocaleString()}`}
      className="flex-row items-center gap-3 rounded-xl border border-cetus-hairline bg-cetus-canvas px-3 py-2.5"
    >
      <View className="flex-1 gap-0.5">
        <Text
          className="font-sans text-sm font-semibold text-cetus-ink"
          numberOfLines={1}
        >
          {entry.game_name}
        </Text>
        <Text
          className="font-sans text-xs text-cetus-ink-muted"
          numberOfLines={1}
        >
          {new Date(entry.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Text className="font-sans text-base font-bold text-cetus-accent">
        {entry.score.toLocaleString()}
      </Text>
    </View>
  )
}

export function HistoryError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  const offline = isNetworkError(error)
  return (
    <View className="items-center gap-2 rounded-xl border border-cetus-hairline px-4 py-5">
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        {offline
          ? "Couldn't load recent scores. Check your connection."
          : "Couldn't load recent scores. Try again."}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry loading recent scores"
        onPress={onRetry}
        className="active:opacity-80"
      >
        <Text className="font-sans text-sm font-semibold text-cetus-accent">
          Retry
        </Text>
      </Pressable>
    </View>
  )
}

export function HistoryEmpty() {
  return (
    <View className="items-center gap-1 rounded-xl border border-cetus-hairline px-4 py-5">
      <Text className="font-sans text-sm text-cetus-ink-muted">
        No recent scores
      </Text>
      <Text className="font-sans text-center text-xs text-cetus-ink-muted">
        Play a game to start your history.
      </Text>
    </View>
  )
}
