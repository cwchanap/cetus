import { Link } from 'expo-router'
import { Text, View } from 'react-native'

// Minimal placeholder: Google/Apple browser sign-in buttons and the mobile
// auth client arrive in Stage 4 (HPA-179).
export default function SignInScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-[#05070f] p-6">
      <Text className="font-display text-xl font-bold text-cetus-ink">
        Sign in to Cetus
      </Text>
      <Text className="text-center text-sm text-cetus-ink-muted">
        Google and Apple sign-in arrive in a later update.
      </Text>
      <Link href="/(tabs)/profile">
        <Text className="mt-1.5 text-[15px] font-semibold text-cetus-accent">
          Back to profile
        </Text>
      </Link>
    </View>
  )
}
