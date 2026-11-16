import { useEffect, useRef } from 'react'
import { Pressable, Text, View, StyleSheet } from 'react-native'

export type HeldDpadDirection = 'up' | 'down' | 'left' | 'right'

export interface HeldDpadProps {
  onPressDirection: (direction: HeldDpadDirection) => void
  onReleaseDirection: (direction: HeldDpadDirection) => void
}

const BUTTONS = [
  { direction: 'up', label: 'Move up', glyph: '↑' },
  { direction: 'left', label: 'Move left', glyph: '←' },
  { direction: 'right', label: 'Move right', glyph: '→' },
  { direction: 'down', label: 'Move down', glyph: '↓' },
] as const

export function HeldDpad({
  onPressDirection,
  onReleaseDirection,
}: HeldDpadProps) {
  const heldRef = useRef<Set<HeldDpadDirection>>(new Set())
  const callbacksRef = useRef({ onPressDirection, onReleaseDirection })
  callbacksRef.current = { onPressDirection, onReleaseDirection }

  const press = (direction: HeldDpadDirection) => {
    if (heldRef.current.has(direction)) {
      return
    }
    heldRef.current.add(direction)
    callbacksRef.current.onPressDirection(direction)
  }

  const release = (direction: HeldDpadDirection) => {
    if (!heldRef.current.delete(direction)) {
      return
    }
    callbacksRef.current.onReleaseDirection(direction)
  }

  // A finger cut short must not leave a direction latched: RN reports an
  // interrupted press through onPressOut/onBlur, and an unmounting board
  // releases whatever is still held here.
  useEffect(
    () => () => {
      for (const direction of heldRef.current) {
        callbacksRef.current.onReleaseDirection(direction)
      }
      heldRef.current.clear()
    },
    []
  )

  const button = ({ direction, label, glyph }: (typeof BUTTONS)[number]) => (
    <Pressable
      key={direction}
      testID={`dpad-${direction}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => press(direction)}
      onPressOut={() => release(direction)}
      onBlur={() => release(direction)}
      className="h-14 w-14 items-center justify-center rounded-xl border-2 border-cetus-hairline bg-cetus-surface"
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Text className="text-2xl text-cetus-ink">{glyph}</Text>
    </Pressable>
  )

  return (
    <View testID="held-dpad" className="items-center gap-2">
      {button(BUTTONS[0])}
      <View className="flex-row items-center gap-14">
        {button(BUTTONS[1])}
        {button(BUTTONS[2])}
      </View>
      {button(BUTTONS[3])}
    </View>
  )
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.65,
  },
})
