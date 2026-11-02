import { Link } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

// Minimal placeholder: Google/Apple browser sign-in buttons and the mobile
// auth client arrive in Stage 4 (HPA-179).
export default function SignInScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Sign in to Cetus</Text>
      <Text style={styles.body}>
        Google and Apple sign-in arrive in a later update.
      </Text>
      <Link href="/(tabs)/profile" style={styles.link}>
        Back to profile
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
