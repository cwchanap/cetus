import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native'
import {
  Gesture,
  GestureDetector,
  type GestureTouchEvent,
} from 'react-native-gesture-handler'

export type HeldDpadDirection = 'up' | 'down' | 'left' | 'right'

export interface HeldDpadProps {
  onPressDirection: (direction: HeldDpadDirection) => void
  onReleaseDirection: (direction: HeldDpadDirection) => void
  disabled?: boolean | (() => boolean)
}

const BUTTONS = [
  { direction: 'up', label: 'Move up', glyph: '↑' },
  { direction: 'left', label: 'Move left', glyph: '←' },
  { direction: 'right', label: 'Move right', glyph: '→' },
  { direction: 'down', label: 'Move down', glyph: '↓' },
] as const

const PHYSICAL_TAP_WINDOW_MS = 400

interface DpadButtonProps extends HeldDpadProps {
  direction: HeldDpadDirection
  label: string
  glyph: string
}

function DpadButton({
  direction,
  label,
  glyph,
  disabled = false,
  onPressDirection,
  onReleaseDirection,
}: DpadButtonProps) {
  const touchIdsRef = useRef(new Set<number>())
  const assistiveHoldRef = useRef(false)
  const lastTouchEndRef = useRef(Number.NEGATIVE_INFINITY)
  const activationLockRef = useRef(false)
  const sizeRef = useRef({ width: 0, height: 0 })
  const heldRef = useRef(false)
  const [held, setHeld] = useState(false)
  const callbacksRef = useRef({ onPressDirection, onReleaseDirection })
  callbacksRef.current = { onPressDirection, onReleaseDirection }
  const disabledRef = useRef<() => boolean>(() => false)
  disabledRef.current =
    typeof disabled === 'function' ? disabled : () => disabled === true
  const disabledNow = disabledRef.current()

  const controls = useMemo(() => {
    const sync = () => {
      const next =
        !disabledRef.current() &&
        (touchIdsRef.current.size > 0 || assistiveHoldRef.current)
      if (next === heldRef.current) {
        return
      }
      heldRef.current = next
      setHeld(next)
      if (next) {
        callbacksRef.current.onPressDirection(direction)
      } else {
        callbacksRef.current.onReleaseDirection(direction)
      }
    }
    const onTouchEnd = (event: GestureTouchEvent) => {
      for (const touch of event.changedTouches) {
        touchIdsRef.current.delete(touch.id)
      }
      lastTouchEndRef.current = Date.now()
      sync()
    }
    const gesture = Gesture.Manual()
      .runOnJS(true)
      .onTouchesDown((event: GestureTouchEvent) => {
        if (disabledRef.current()) {
          return
        }
        for (const touch of event.changedTouches) {
          touchIdsRef.current.add(touch.id)
        }
        sync()
      })
      .onTouchesMove((event: GestureTouchEvent) => {
        if (touchIdsRef.current.size === 0) {
          return
        }
        const { width, height } = sizeRef.current
        for (const touch of event.allTouches) {
          if (
            touchIdsRef.current.has(touch.id) &&
            (touch.x < 0 || touch.y < 0 || touch.x > width || touch.y > height)
          ) {
            touchIdsRef.current.delete(touch.id)
          }
        }
        sync()
      })
      .onTouchesUp(onTouchEnd)
      .onTouchesCancelled(onTouchEnd)
    const activate = () => {
      if (disabledRef.current() || activationLockRef.current) {
        return
      }
      activationLockRef.current = true
      queueMicrotask(() => {
        activationLockRef.current = false
      })
      assistiveHoldRef.current = !assistiveHoldRef.current
      sync()
    }
    return { gesture, sync, activate }
  }, [direction])

  const releaseEverySource = () => {
    touchIdsRef.current.clear()
    assistiveHoldRef.current = false
    controls.sync()
  }

  useEffect(() => {
    if (disabledNow) {
      touchIdsRef.current.clear()
      assistiveHoldRef.current = false
      controls.sync()
    }
  }, [disabledNow, controls])

  useEffect(
    () => () => {
      if (heldRef.current) {
        callbacksRef.current.onReleaseDirection(direction)
      }
    },
    [direction]
  )

  return (
    <GestureDetector gesture={controls.gesture}>
      <Pressable
        testID={`dpad-${direction}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Hold to move, or activate to keep moving until you activate again"
        accessibilityState={{ checked: held, disabled: disabledNow }}
        accessibilityActions={[{ name: 'activate', label }]}
        onAccessibilityTap={controls.activate}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'activate') {
            controls.activate()
          }
        }}
        onPress={() => {
          if (Date.now() - lastTouchEndRef.current < PHYSICAL_TAP_WINDOW_MS) {
            return
          }
          controls.activate()
        }}
        onBlur={releaseEverySource}
        onLayout={(event: LayoutChangeEvent) => {
          sizeRef.current = event.nativeEvent.layout
        }}
        className="h-14 w-14 items-center justify-center rounded-xl border-2 border-cetus-hairline bg-cetus-surface"
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        <Text className="text-2xl text-cetus-ink">{glyph}</Text>
      </Pressable>
    </GestureDetector>
  )
}

export function HeldDpad(props: HeldDpadProps) {
  const button = ({ direction, label, glyph }: (typeof BUTTONS)[number]) => (
    <DpadButton
      key={direction}
      direction={direction}
      label={label}
      glyph={glyph}
      {...props}
    />
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
