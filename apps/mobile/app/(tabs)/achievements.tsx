import { Text, View } from 'react-native'

export default function AchievementsScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-cetus-canvas p-6">
      <Text className="font-display text-xl font-bold text-cetus-ink">
        Achievements
      </Text>
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        Achievement tracking is not available on mobile yet — coming in a later
        update.
      </Text>
    </View>
  )
}
