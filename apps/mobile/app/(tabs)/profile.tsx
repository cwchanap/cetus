import { useEffect, useState } from 'react'
import { Link } from 'expo-router'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { api } from '../../src/lib/api'
import { authClient } from '../../src/lib/auth-client'

// Protected-API proof: the same `GET /api/settings` must succeed while
// signed in and return 401 once signed out. Mounted in both session states
// so the post-sign-out 401 is observable in the UI (live checks against the
// real backend are the manual/device acceptance gate).
function ConnectionStatus({ sessionKey }: { sessionKey: string }) {
  const [status, setStatus] = useState<
    'checking' | 'ok' | 'signed-out' | 'failed'
  >('checking')

  useEffect(() => {
    let active = true
    setStatus('checking')
    api
      .getSettings()
      .then(() => {
        if (active) {
          setStatus('ok')
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return
        }
        if ((error as { status?: number }).status === 401) {
          setStatus('signed-out')
        } else {
          setStatus('failed')
        }
      })
    return () => {
      active = false
    }
  }, [sessionKey])

  if (status === 'checking') {
    return <ActivityIndicator testID="api-checking" />
  }
  return (
    <Text
      testID="api-status"
      className="font-sans text-center text-sm text-cetus-ink-muted"
    >
      {status === 'ok'
        ? 'API: authenticated connection verified'
        : status === 'signed-out'
          ? 'API: signed out — protected endpoint rejected (401)'
          : 'API: request failed (network or server error)'}
    </Text>
  )
}

export default function ProfileScreen() {
  // useSession is Better Auth's react binding over getSession.
  const { data: session, isPending } = authClient.useSession()
  const sessionKey = session?.user.id ?? 'anonymous'

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-[#05070f]">
        <ActivityIndicator />
      </View>
    )
  }

  if (!session) {
    return (
      <View className="flex-1 items-center justify-center gap-2.5 bg-[#05070f] p-6">
        <Text className="font-display text-xl font-bold text-cetus-ink">
          Anonymous diver
        </Text>
        <Text className="font-sans text-center text-sm text-cetus-ink-muted">
          You are browsing Cetus without an account. Sign in to sync scores and
          achievements.
        </Text>
        <Link href="/sign-in">
          <Text className="font-sans mt-1.5 text-[15px] font-semibold text-cetus-accent">
            Sign in
          </Text>
        </Link>
        <ConnectionStatus sessionKey={sessionKey} />
      </View>
    )
  }

  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-[#05070f] p-6">
      <Text className="font-display text-xl font-bold text-cetus-ink">
        {session.user.name ?? session.user.email}
      </Text>
      {session.user.name ? (
        <Text className="font-sans text-sm text-cetus-ink-muted">
          {session.user.email}
        </Text>
      ) : null}
      <ConnectionStatus sessionKey={sessionKey} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => {
          // Surface sign-out failures instead of an unhandled rejection.
          authClient.signOut().catch(() => {})
        }}
        className="mt-4 rounded-xl border border-cetus-hairline px-5 py-3"
      >
        <Text className="font-sans text-[15px] font-semibold text-cetus-ink">
          Sign out
        </Text>
      </Pressable>
    </View>
  )
}
