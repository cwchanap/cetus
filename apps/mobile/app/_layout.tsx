import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StyleSheet } from 'react-native'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: styles.header,
          headerTintColor: '#7ee7ff',
          contentStyle: styles.content,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      </Stack>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  header: { backgroundColor: '#0b1020' },
  content: { backgroundColor: '#05070f' },
})
