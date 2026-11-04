// Deep per-weight imports: the package roots re-export every weight, which
// bundles ~6 MB of unused .ttf assets. Only these two are loaded.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular'
import { Orbitron_700Bold } from '@expo-google-fonts/orbitron/700Bold'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Appearance, Platform, View } from 'react-native'
import {
  useNativeVariable,
  VariableContextProvider,
} from 'react-native-css/native'
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

export const unstable_settings = {
  initialRouteName: '(tabs)',
}

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

  // Nav chrome resolves the shared solid tokens at runtime: header/tab props
  // take no className, and the token file is the single source of truth (no
  // copied color constants in the app).
  const canvas = useNativeVariable('--cetus-canvas')
  const chromeBg = useNativeVariable('--cetus-chrome')
  const chromeTint = useNativeVariable('--cetus-chrome-tint')

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
              headerStyle: { backgroundColor: chromeBg },
              headerTintColor: chromeTint,
              contentStyle: { backgroundColor: canvas },
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
