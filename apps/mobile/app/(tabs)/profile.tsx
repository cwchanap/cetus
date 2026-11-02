import { Link } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

// Static anonymous placeholder: real session state (useSession) arrives in
// Stage 4 (HPA-179) with the mobile auth client.
export default function ProfileScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Anonymous diver</Text>
      <Text style={styles.body}>
        You are browsing Cetus without an account. Sign in to sync scores and
        achievements.
      </Text>
      <Link href="/sign-in" style={styles.link}>
        Sign in
      </Link>
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
    gap: 10,
  },
  title: { color: '#e8ecff', fontSize: 20, fontWeight: '600' },
  body: { color: '#8b93b0', fontSize: 14, textAlign: 'center' },
  link: { color: '#7ee7ff', fontSize: 15, fontWeight: '600', marginTop: 6 },
})
