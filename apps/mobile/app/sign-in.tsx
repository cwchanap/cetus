import { useState } from 'react'
import { useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { authClient } from '../src/lib/auth-client'

type Provider = 'google' | 'apple'

// Browser OAuth on both platforms: the expo client plugin opens the system
// browser and returns via the cetus:// deep link; no native provider SDKs.
export default function SignInScreen() {
  const router = useRouter()
  const [pending, setPending] = useState<Provider | null>(null)
  const [error, setError] = useState<string | null>(null)

  const signInWith = async (provider: Provider) => {
    setError(null)
    setPending(provider)
    try {
      const { error: signInError } = await authClient.signIn.social({
        provider,
        callbackURL: '/profile',
      })
      if (signInError) {
        setError(
          `Sign-in was rejected (${signInError.message ?? provider}). Please try again.`
        )
      } else {
        router.replace('/(tabs)/profile')
      }
    } catch {
      // Canceled browser flow or network failure — surface, never crash.
      setError('Sign-in was canceled or failed. Please try again.')
    } finally {
      setPending(null)
    }
  }

  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-[#05070f] p-6">
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
