import { Tabs } from 'expo-router'
import { useNativeVariable } from 'react-native-css/native'

export default function TabsLayout() {
  // Nav chrome resolves the shared solid tokens at runtime — header/tab props
  // take no className, and @cetus/tokens is the single source of truth.
  const chromeBg = useNativeVariable('--cetus-chrome')
  const chromeInk = useNativeVariable('--cetus-chrome-ink')
  const chromeTint = useNativeVariable('--cetus-chrome-tint')
  const chromeMuted = useNativeVariable('--cetus-chrome-muted')
  const chromeBorder = useNativeVariable('--cetus-chrome-border')

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: chromeBg },
        headerTintColor: chromeTint,
        headerTitleStyle: { color: chromeInk },
        tabBarStyle: {
          backgroundColor: chromeBg,
          borderTopColor: chromeBorder,
        },
        tabBarActiveTintColor: chromeTint,
        tabBarInactiveTintColor: chromeMuted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Games' }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
      <Tabs.Screen name="achievements" options={{ title: 'Achievements' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}
