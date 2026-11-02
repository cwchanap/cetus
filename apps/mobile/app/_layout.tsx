import { Inter_400Regular } from '@expo-google-fonts/inter'
import { Orbitron_700Bold } from '@expo-google-fonts/orbitron'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Appearance, Platform, StyleSheet, View } from 'react-native'
import { VariableContextProvider } from 'react-native-css'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '../global.css'

// app.json locks the app dark (userInterfaceStyle: "dark"); expo-system-ui
// enforces that setting on Android, and pinning React Native's own Appearance
// API makes every color-scheme consumer read dark regardless of OS setting.
Appearance.setColorScheme('dark')

// One runtime font decision (HPA-179 review): only when BOTH families have
// loaded do we expose Orbitron/Inter; any failure — including a partial one,
// where expo-font still registers the other family — serves the system font
// for everything. These feed the CSS variables that the font-sans and
// font-display utilities resolve at runtime (see global.css).
const CUSTOM_FONTS = {
  '--font-sans': 'Inter',
  '--cetus-display-font': 'Orbitron',
}
const systemFont = Platform.select({ ios: 'System', default: 'sans-serif' })
const SYSTEM_FONTS = {
  '--font-sans': systemFont,
  '--cetus-display-font': systemFont,
}

// Family names match the shared tokens: --cetus-display-font resolves to
// 'Orbitron' (700 = --cetus-display-weight) and --font-sans carries 'Inter'.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Keep booting if the splash cannot be held (e.g. already hidden).
})

export default function RootLayout() {
  // Splash stays up until the fonts load or definitively fail — or a
  // bounded timeout expires so a stalled font promise cannot hold startup
  // forever; the timeout falls back to system fonts like any other failure.
  const FONT_TIMEOUT_MS = 5000
  const [fontsLoaded, fontError] = useFonts({
    Inter: Inter_400Regular,
    Orbitron: Orbitron_700Bold,
  })
  const fontsReady = fontsLoaded && fontError === null
  const appReady = fontsLoaded || fontError !== null
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (appReady) {
      return
    }
    const timer = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [appReady])

  const ready = appReady || timedOut

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {})
    }
  }, [ready])

  if (!ready) {
    return null
  }

  return (
    <VariableContextProvider
      value={fontsReady && !timedOut ? CUSTOM_FONTS : SYSTEM_FONTS}
    >
      <SafeAreaProvider>
        <StatusBar style="light" />
        {/* `dark` activates the shared .dark token scope from @cetus/tokens —
            react-native-css cascades its variables to every descendant, so
            mobile reuses the exact dark declarations web serves. */}
        <View className="dark flex-1">
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
        </View>
      </SafeAreaProvider>
    </VariableContextProvider>
  )
}

// Nav chrome keeps plain colors: expo-router header style props take no
// className, and the canvas has no solid token (--cetus-page-bg is a
// CSS-only gradient that native does not support).
const styles = StyleSheet.create({
  header: { backgroundColor: '#0b1020' },
  content: { backgroundColor: '#05070f' },
})
