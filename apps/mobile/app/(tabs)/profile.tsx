import { useEffect, useState } from 'react'
import { Link } from 'expo-router'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { api } from '../../src/lib/api'
import { authClient } from '../../src/lib/auth-client'

// Session proof against the real backend: identity from Better Auth
// `useSession`, authorization from the protected `GET /api/settings`
// (200 signed in, 401 signed out). Profile editing stays in HPA-182.
function ConnectionStatus({ signedIn }: { signedIn: boolean }) {
  const [status, setStatus] = useState<'checking' | 'ok' | 'failed'>('checking')

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
      .catch(() => {
        if (active) {
          setStatus('failed')
        }
      })
    return () => {
      active = false
    }
  }, [signedIn])

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
        : 'API: request failed (signed out returns 401)'}
    </Text>
  )
}

export default function ProfileScreen() {
  const { data: session, isPending } = authClient.useSession()

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
      </View>
    )
  }

  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-[#05070f] p-6">
      <Text className="font-display text-xl font-bold text-cetus-ink">
        {session.user.name ?? session.user.email}
      </Text>
      {session.user.name !== undefined && (
        <Text className="font-sans text-sm text-cetus-ink-muted">
          {session.user.email}
        </Text>
      )}
      <ConnectionStatus signedIn />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => authClient.signOut()}
        className="mt-4 rounded-xl border border-cetus-hairline px-5 py-3"
      >
        <Text className="font-sans text-[15px] font-semibold text-cetus-ink">
          Sign out
        </Text>
      </Pressable>
    </View>
  )
}
