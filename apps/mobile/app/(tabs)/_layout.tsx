import { Tabs } from 'expo-router'
import { StyleSheet } from 'react-native'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: styles.header,
        headerTintColor: '#7ee7ff',
        headerTitleStyle: styles.headerTitle,
        tabBarStyle: styles.bar,
        tabBarActiveTintColor: '#7ee7ff',
        tabBarInactiveTintColor: '#5b6480',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Games' }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
      <Tabs.Screen name="achievements" options={{ title: 'Achievements' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}

// Nav chrome keeps plain colors: expo-router tab/header style props take no
// className, and the canvas has no solid token (--cetus-page-bg is a
// CSS-only gradient that native does not support).
const styles = StyleSheet.create({
  header: { backgroundColor: '#0b1020' },
  headerTitle: { color: '#e8ecff' },
  bar: { backgroundColor: '#0b1020', borderTopColor: '#1b2440' },
})
