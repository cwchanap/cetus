import { Link } from 'expo-router'
import { Text, View } from 'react-native'

// Static anonymous placeholder: real session state (useSession) arrives in
// Stage 4 (HPA-179) with the mobile auth client.
export default function ProfileScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-[#05070f] p-6">
      <Text className="font-display text-xl font-bold text-cetus-ink">
        Anonymous diver
      </Text>
      <Text className="text-center text-sm text-cetus-ink-muted">
        You are browsing Cetus without an account. Sign in to sync scores and
        achievements.
      </Text>
      <Link href="/sign-in">
        <Text className="mt-1.5 text-[15px] font-semibold text-cetus-accent">
          Sign in
        </Text>
      </Link>
    </View>
  )
}
