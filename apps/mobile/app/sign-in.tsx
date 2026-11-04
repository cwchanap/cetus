import { useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { authClient } from '../src/lib/auth-client'

type Provider = 'google' | 'apple'

// Only known tab roots may be used as a post-login destination.
const RETURN_TO_ALLOWED = [
  '/(tabs)/profile',
  '/(tabs)/achievements',
  '/',
] as const

// Browser OAuth on both platforms: the expo client plugin opens the system
// browser and returns via the cetus:// deep link; no native provider SDKs.
export default function SignInScreen() {
  const router = useRouter()
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>()
  const destination = RETURN_TO_ALLOWED.includes(
    returnTo as (typeof RETURN_TO_ALLOWED)[number]
  )
    ? (returnTo as string)
    : '/(tabs)/profile'
  const [pending, setPending] = useState<Provider | null>(null)
  const [error, setError] = useState<string | null>(null)

  const signInWith = async (provider: Provider) => {
    setError(null)
    setPending(provider)
    try {
      const { error: signInError } = await authClient.signIn.social({
        provider,
        // The destination rides through the browser round-trip as the
        // callback URL (the expo client plugin rewrites it to the cetus://
        // deep link on mobile requests), preserving return-to-Games/Profile.
        callbackURL: destination,
        // Provider errors (deny/cancel at Google/Apple) redirect here too —
        // without it the browser lands on the server's https error page and
        // is stranded outside the app.
        errorCallbackURL: destination,
      })
      if (signInError) {
        setError(
          `Sign-in was rejected (${signInError.message ?? provider}). Please try again.`
        )
        return
      }
      // A dismissed/canceled browser session resolves with error: null and
      // no session — confirm the session before navigating.
      const { data: session } = await authClient.getSession()
      if (!session) {
        setError('Sign-in was canceled. Please try again.')
        return
      }
      // dismissTo pops this screen back to the existing (tabs) navigator
      // (and selects the destination tab) — replace() would stack a second
      // (tabs), which Android back would resurface.
      router.dismissTo(destination)
    } catch {
      // Network failure or unexpected client error — surface, never crash.
      setError('Sign-in was canceled or failed. Please try again.')
    } finally {
      setPending(null)
    }
  }

  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-cetus-canvas p-6">
      <Text className="font-display text-xl font-bold text-cetus-ink">
        Sign in to Cetus
      </Text>
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        Continue with your Google or Apple account in a secure browser window.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        disabled={pending !== null}
        onPress={() => signInWith('google')}
        className="mt-4 w-full max-w-sm items-center rounded-xl bg-cetus-accent px-5 py-3.5"
      >
        {pending === 'google' ? (
          <ActivityIndicator />
        ) : (
          <Text className="font-sans text-[15px] font-semibold">
            Continue with Google
          </Text>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Apple"
        disabled={pending !== null}
        onPress={() => signInWith('apple')}
        className="mt-2 w-full max-w-sm items-center rounded-xl border border-cetus-hairline px-5 py-3.5"
      >
        {pending === 'apple' ? (
          <ActivityIndicator />
        ) : (
          <Text className="font-sans text-[15px] font-semibold text-cetus-ink">
            Continue with Apple
          </Text>
        )}
      </Pressable>

      {error !== null && (
        <Text
          accessibilityRole="alert"
          testID="sign-in-error"
          className="font-sans mt-3 text-center text-sm text-red-400"
        >
          {error}
        </Text>
      )}
    </View>
  )
}
