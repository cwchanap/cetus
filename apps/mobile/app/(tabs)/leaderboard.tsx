import { Text, View } from 'react-native'

export default function LeaderboardScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-[#05070f] p-6">
      <Text className="font-display text-xl font-bold text-cetus-ink">
        Leaderboard
      </Text>
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        Rankings are not available on mobile yet — coming in a later update.
      </Text>
    </View>
  )
}
