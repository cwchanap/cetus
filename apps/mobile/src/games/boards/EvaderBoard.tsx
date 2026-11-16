import { useState } from 'react'
import { Text, View } from 'react-native'
import { Circle, Path, Rect, RoundedRect } from '@shopify/react-native-skia'
import type { EvaderGame } from '@cetus/games/evader/EvaderGame'
import type { EvaderState } from '@cetus/games/evader/frameworkTypes'

import { GameCanvas } from '../canvas/GameCanvas'
import { useGameLoop } from '../canvas/useGameLoop'
import type { NativeGameViewProps } from '../registry'
import { HeldDpad, type HeldDpadDirection } from './HeldDpad'

const cssColor = (hex: number, alpha = 1): string => {
  const r = (hex >> 16) & 0xff
  const g = (hex >> 8) & 0xff
  const b = hex & 0xff
  return alpha === 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const PLAYER_FILL = '#00ff66'
const PLAYER_STROKE = '#6bffae'
const COIN_FILL = '#ffd700'
const COIN_STROKE = '#ffed4e'
const BOMB_FILL = '#cc0000'
const BOMB_STROKE = '#ff4444'
const GRID_COLOR = 'rgba(6, 182, 212, 0.12)'
const BORDER_COLOR = 'rgba(6, 182, 212, 0.35)'
const GRID_STEP = 40

const KEY_BY_DIRECTION: Record<HeldDpadDirection, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
}

interface EvaderHud {
  coins: number
  bombs: number
}

interface EvaderScene {
  player: { x: number; y: number }
  objects: Array<{ id: string; type: 'coin' | 'bomb'; x: number; y: number }>
}

const readEvaderScene = (state: EvaderState): EvaderScene => ({
  player: { x: state.player.x, y: state.player.y },
  objects: state.objects.map(object => ({
    id: object.id,
    type: object.type,
    x: object.x,
    y: object.y,
  })),
})

export function EvaderBoard({ projected, game }: NativeGameViewProps) {
  const evader = game as EvaderGame
  const config = evader.getConfig()
  const hud = projected as unknown as EvaderHud
  const [scene, setScene] = useState<EvaderScene>(() =>
    readEvaderScene(evader.getState())
  )

  useGameLoop(evader, () => {
    setScene(readEvaderScene(evader.getState()))
  })

  const gridLines: string[] = []
  for (let x = 0; x <= config.canvasWidth; x += GRID_STEP) {
    gridLines.push(`M${x} 0L${x} ${config.canvasHeight}`)
  }
  for (let y = 0; y <= config.canvasHeight; y += GRID_STEP) {
    gridLines.push(`M0 ${y}L${config.canvasWidth} ${y}`)
  }

  const playerSize = config.playerSize
  const objectRadius = config.objectSize / 2

  return (
    <View className="flex-1 gap-3 px-4 pb-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text
          testID="evader-coins"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Coins {hud.coins}
        </Text>
        <Text
          testID="evader-bombs"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Bombs {hud.bombs}
        </Text>
      </View>
      <View
        testID="evader-board"
        className="w-full"
        style={{ aspectRatio: config.canvasWidth / config.canvasHeight }}
        accessible
        accessibilityLabel={`Evader arena: ${scene.objects.length} objects incoming; hold the D-pad to dodge`}
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
            color={cssColor(config.backgroundColor)}
          />
          <Path
            path={gridLines.join('')}
            style="stroke"
            strokeWidth={1}
            color={GRID_COLOR}
          />
          <Rect
            x={1}
            y={1}
            width={config.canvasWidth - 2}
            height={config.canvasHeight - 2}
            style="stroke"
            strokeWidth={2}
            color={BORDER_COLOR}
          />
          {scene.objects.map(object => (
            <Circle
              key={object.id}
              cx={object.x}
              cy={object.y}
              r={objectRadius}
              color={object.type === 'coin' ? COIN_FILL : BOMB_FILL}
            />
          ))}
          {scene.objects.map(object => (
            <Circle
              key={`${object.id}-stroke`}
              cx={object.x}
              cy={object.y}
              r={objectRadius}
              style="stroke"
              strokeWidth={2}
              color={object.type === 'coin' ? COIN_STROKE : BOMB_STROKE}
            />
          ))}
          <RoundedRect
            x={scene.player.x - playerSize / 2}
            y={scene.player.y - playerSize / 2}
            width={playerSize}
            height={playerSize}
            r={6}
            color={PLAYER_FILL}
          />
          <RoundedRect
            x={scene.player.x - playerSize / 2}
            y={scene.player.y - playerSize / 2}
            width={playerSize}
            height={playerSize}
            r={6}
            style="stroke"
            strokeWidth={2}
            color={PLAYER_STROKE}
          />
        </GameCanvas>
      </View>
      <HeldDpad
        onPressDirection={direction => {
          if (evader.getState().isActive) {
            evader.pressKey(KEY_BY_DIRECTION[direction], 'touch')
          }
        }}
        onReleaseDirection={direction =>
          evader.releaseKey(KEY_BY_DIRECTION[direction], 'touch')
        }
      />
    </View>
  )
}
