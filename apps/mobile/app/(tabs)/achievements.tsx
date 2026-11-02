import { StyleSheet, Text, View } from 'react-native'

export default function AchievementsScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Achievements</Text>
      <Text style={styles.body}>
        Achievement tracking is not available on mobile yet — coming in a later
        update.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#05070f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: { color: '#e8ecff', fontSize: 20, fontWeight: '600' },
  body: { color: '#8b93b0', fontSize: 14, textAlign: 'center' },
})
