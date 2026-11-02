import { Inter_400Regular } from '@expo-google-fonts/inter'
import { Orbitron_700Bold } from '@expo-google-fonts/orbitron'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '../global.css'

// Family names match the shared tokens: --cetus-display-font resolves to
// 'Orbitron' (700 = --cetus-display-weight) and global.css maps --font-sans
// to 'Inter'. Mobile uses the dark non-abyssal theme from @cetus/tokens.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Keep booting if the splash cannot be held (e.g. already hidden).
})

export default function RootLayout() {
  // Splash stays up until the fonts load or definitively fail; on failure the
  // families stay unregistered, so React Native falls back to the system font.
  const [fontsLoaded, fontError] = useFonts({
    Inter: Inter_400Regular,
    Orbitron: Orbitron_700Bold,
  })
  const appReady = fontsLoaded || fontError !== null

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync().catch(() => {})
    }
  }, [appReady])

  if (!appReady) {
    return null
  }

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

// Nav chrome keeps plain colors: expo-router header style props take no
// className, and the canvas has no solid token (--cetus-page-bg is a
// CSS-only gradient that native does not support).
const styles = StyleSheet.create({
  header: { backgroundColor: '#0b1020' },
  content: { backgroundColor: '#05070f' },
})
