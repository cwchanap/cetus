import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { cn } from '@cetus/ui'
import {
  Circle,
  Group,
  Path,
  Rect,
  RoundedRect,
} from '@shopify/react-native-skia'
import type { SignalSwitchGame } from '@cetus/games/signal-switch/SignalSwitchGame'
import {
  SIGNAL_SWITCH_SIGNALS,
  type SignalSwitchConfig,
  type SignalSwitchSignal,
  type SignalSwitchState,
} from '@cetus/games/signal-switch/types'

import { GameCanvas } from '../canvas/GameCanvas'
import { useGameLoop } from '../canvas/useGameLoop'
import type { NativeGameViewProps } from '../registry'

const LANE_BACKGROUND = '#020817'
const LANE_SEPARATOR = '#1e293b'
const GATE_LINE = 'rgba(34, 211, 238, 0.35)'
const LOCKED_LANE_COVER = 'rgba(2, 8, 23, 0.55)'
const DRONE_FILL = 'rgba(15, 23, 42, 0.95)'
const GATE_MARKER_RADIUS = 9
const DRONE_MARKER_RADIUS = 7

const cssColor = (hex: number, alpha = 1): string => {
  const r = (hex >> 16) & 0xff
  const g = (hex >> 8) & 0xff
  const b = hex & 0xff
  return alpha === 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface SignalSwitchHud {
  integrity: number
  combo: number
  safePasses: number
  lanes: string
}

interface SignalSwitchScene {
  drones: Array<{
    id: string
    laneIndex: number
    signal: SignalSwitchSignal
    x: number
  }>
  gateSignals: SignalSwitchSignal[]
  activeLaneCount: number
  droneSpeed: number
  active: boolean
}

const readSignalSwitchScene = (
  state: SignalSwitchState
): SignalSwitchScene => ({
  drones: state.drones.map(drone => ({
    id: drone.id,
    laneIndex: drone.laneIndex,
    signal: drone.signal,
    x: drone.x,
  })),
  gateSignals: [...state.gateSignals],
  activeLaneCount: state.activeLaneCount,
  droneSpeed: state.droneSpeed,
  active: state.isActive && !state.isGameOver,
})

const signalMarker = (
  signal: SignalSwitchSignal,
  x: number,
  y: number,
  radius: number
) => {
  const color = cssColor(SIGNAL_SWITCH_SIGNALS[signal].color, 0.9)
  if (signal === 'cyan') {
    return <Circle cx={x} cy={y} r={radius} color={color} />
  }
  const path =
    signal === 'magenta'
      ? `M${x} ${y - radius}L${x + radius} ${y + radius}L${x - radius} ${y + radius}L${x} ${y - radius}`
      : `M${x} ${y - radius}L${x + radius} ${y}L${x} ${y + radius}L${x - radius} ${y}L${x} ${y - radius}`
  return <Path path={path} color={color} />
}

export function SignalSwitchBoard({ projected, game }: NativeGameViewProps) {
  const signalSwitch = game as SignalSwitchGame
  const config = (signalSwitch as unknown as { config: SignalSwitchConfig })
    .config
  const hud = projected as unknown as SignalSwitchHud
  const [scene, setScene] = useState<SignalSwitchScene>(() =>
    readSignalSwitchScene(signalSwitch.getState())
  )

  useGameLoop(signalSwitch, () => {
    setScene(readSignalSwitchScene(signalSwitch.getState()))
  })

  const laneCount = config.laneUnlockSeconds.length
  const laneHeight = config.canvasHeight / laneCount
  const laneCenterY = (laneIndex: number) => laneHeight * (laneIndex + 0.5)

  const laneSeparators: string[] = []
  for (let lane = 1; lane < laneCount; lane++) {
    const y = lane * laneHeight
    laneSeparators.push(`M0 ${y}L${config.canvasWidth} ${y}`)
  }

  return (
    <View className="flex-1 gap-3 px-4 pb-4">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text
          testID="ss-integrity"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Integrity {hud.integrity}
        </Text>
        <Text
          testID="ss-combo"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Combo {hud.combo}
        </Text>
        <Text
          testID="ss-passes"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Safe passes {hud.safePasses}
        </Text>
        <Text
          testID="ss-lanes"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Lanes {hud.lanes}
        </Text>
        <Text
          testID="ss-speed"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Speed {Math.round(scene.droneSpeed)}
        </Text>
      </View>
      <View
        testID="ss-board"
        className="w-full"
        style={{ aspectRatio: config.canvasWidth / config.canvasHeight }}
        accessible
        accessibilityLabel={`Signal Switch board: ${scene.activeLaneCount} of ${laneCount} lanes active, integrity ${hud.integrity}`}
      >
        <GameCanvas
          logicalWidth={config.canvasWidth}
          logicalHeight={config.canvasHeight}
        >
          <Rect
            x={0}
            y={0}
            width={config.canvasWidth}
            height={config.canvasHeight}
            color={LANE_BACKGROUND}
          />
          <Path
            path={laneSeparators.join('')}
            style="stroke"
            strokeWidth={2}
            color={LANE_SEPARATOR}
          />
          <Path
            path={`M${config.gateX} 0L${config.gateX} ${config.canvasHeight}`}
            style="stroke"
            strokeWidth={2}
            color={GATE_LINE}
          />
          {scene.gateSignals.map((signal, laneIndex) =>
            laneIndex >= scene.activeLaneCount ? (
              <Rect
                key={`locked-${laneIndex}`}
                x={0}
                y={laneIndex * laneHeight}
                width={config.canvasWidth}
                height={laneHeight}
                color={LOCKED_LANE_COVER}
              />
            ) : (
              <Group key={`gate-${laneIndex}`}>
                {signalMarker(
                  signal,
                  config.gateX,
                  laneCenterY(laneIndex),
                  GATE_MARKER_RADIUS
                )}
              </Group>
            )
          )}
          {scene.drones.map(drone => {
            const y = laneCenterY(drone.laneIndex)
            return (
              <Group key={drone.id}>
                <RoundedRect
                  x={drone.x - config.droneWidth / 2}
                  y={y - config.droneHeight / 2}
                  width={config.droneWidth}
                  height={config.droneHeight}
                  r={6}
                  color={DRONE_FILL}
                />
                {signalMarker(drone.signal, drone.x, y, DRONE_MARKER_RADIUS)}
              </Group>
            )
          })}
        </GameCanvas>
      </View>
      <Text className="font-sans text-xs text-cetus-ink-muted">
        Tap a lane's gate to switch its signal — match the incoming drone before
        it reaches the gate line.
      </Text>
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityLabel="Lane gates"
      >
        {scene.gateSignals.map((signal, laneIndex) => {
          const locked = laneIndex >= scene.activeLaneCount
          const disabled = locked || !scene.active
          const { glyph, label } = SIGNAL_SWITCH_SIGNALS[signal]
          const text = locked
            ? `Lane ${laneIndex + 1}: locked`
            : `Lane ${laneIndex + 1}: ${glyph} ${label}`
          return (
            <Pressable
              key={laneIndex}
              testID={`ss-gate-${laneIndex}`}
              accessibilityRole="button"
              accessibilityLabel={text}
              accessibilityState={{ disabled }}
              disabled={disabled}
              className={cn(
                'min-w-[46%] flex-1 items-center rounded-md border border-cetus-hairline bg-cetus-surface px-3 py-2',
                disabled && 'opacity-40'
              )}
              onPress={() => signalSwitch.cycleGate(laneIndex)}
            >
              <Text className="font-sans text-sm text-cetus-ink">{text}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
