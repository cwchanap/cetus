import { useState } from 'react'
import { Text, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Circle, Group, Path, Rect } from '@shopify/react-native-skia'
import type { ReflexGame } from '@cetus/games/reflex/ReflexGame'

import { GameCanvas, toGamePoint } from '../canvas/GameCanvas'
import type { NativeGameViewProps } from '../registry'

const COIN_FILL = '#ffd700'
const COIN_GLOW = 'rgba(255, 215, 0, 0.3)'
const COIN_SHINE = 'rgba(255, 255, 153, 0.6)'
const BOMB_FILL = '#cc0000'
const BOMB_GLOW = 'rgba(255, 0, 0, 0.4)'
const BOMB_STROKE = '#ff0000'
const FUSE_COLOR = '#8b4513'
const SPARK_COLOR = '#ffff00'

const cssColor = (hex: number, alpha = 1): string => {
  const r = (hex >> 16) & 0xff
  const g = (hex >> 8) & 0xff
  const b = hex & 0xff
  return alpha === 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface ReflexHud {
  objects: Array<{
    id: string
    type: 'coin' | 'bomb'
    row: number
    col: number
  }>
  coins: number
  bombs: number
  accuracy: number
}

export function ReflexBoard({ projected, game }: NativeGameViewProps) {
  const reflex = game as ReflexGame
  const config = reflex.getConfig()
  const cell = config.cellSize
  const logicalSize = config.gridSize * cell
  const hud = projected as unknown as ReflexHud
  const [viewSize, setViewSize] = useState<{
    width: number
    height: number
  } | null>(null)

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setViewSize(current =>
      current !== null && current.width === width && current.height === height
        ? current
        : { width, height }
    )
  }

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(event => {
      if (viewSize === null) {
        return
      }
      const point = toGamePoint(event.x, event.y, {
        logicalWidth: logicalSize,
        logicalHeight: logicalSize,
        viewWidth: viewSize.width,
        viewHeight: viewSize.height,
      })
      if (point === null) {
        return
      }
      const row = Math.floor(point.y / cell)
      const col = Math.floor(point.x / cell)
      if (
        row < 0 ||
        row >= config.gridSize ||
        col < 0 ||
        col >= config.gridSize
      ) {
        return
      }
      reflex.handleCellClick(row, col)
    })

  const gridLines: string[] = []
  for (let x = 0; x <= config.gridSize; x++) {
    gridLines.push(`M${x * cell} 0L${x * cell} ${logicalSize}`)
  }
  for (let y = 0; y <= config.gridSize; y++) {
    gridLines.push(`M0 ${y * cell}L${logicalSize} ${y * cell}`)
  }

  const radius = Math.min(cell * 0.35, 20)

  return (
    <View className="flex-1 gap-3 px-4 pb-4">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text
          testID="reflex-coins"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Coins {hud.coins}
        </Text>
        <Text
          testID="reflex-bombs"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Bombs {hud.bombs}
        </Text>
        <Text
          testID="reflex-accuracy"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Accuracy {hud.accuracy}%
        </Text>
      </View>
      <Text
        testID="reflex-hint"
        className="font-sans text-xs text-cetus-ink-muted"
        accessibilityLabel={`Reflex board: ${hud.objects.length} targets on a ${config.gridSize} by ${config.gridSize} grid. Tap coins before they fade — avoid the bombs.`}
      >
        Tap coins before they fade — avoid the bombs.
      </Text>
      <GestureDetector gesture={tap}>
        <View
          testID="reflex-board"
          className="w-full"
          style={{ aspectRatio: 1 }}
          onLayout={onLayout}
        >
          <GameCanvas logicalWidth={logicalSize} logicalHeight={logicalSize}>
            <Rect
              x={0}
              y={0}
              width={logicalSize}
              height={logicalSize}
              color={cssColor(config.backgroundColor)}
            />
            <Path
              path={gridLines.join('')}
              style="stroke"
              strokeWidth={1}
              color={cssColor(config.gridLineColor, 0.2)}
            />
            {hud.objects.map(object => {
              const cx = object.col * cell + cell / 2
              const cy = object.row * cell + cell / 2
              if (object.type === 'coin') {
                return (
                  <Group key={object.id}>
                    <Circle cx={cx} cy={cy} r={radius + 3} color={COIN_GLOW} />
                    <Circle cx={cx} cy={cy} r={radius} color={COIN_FILL} />
                    <Circle
                      cx={cx - radius * 0.3}
                      cy={cy - radius * 0.3}
                      r={radius * 0.4}
                      color={COIN_SHINE}
                    />
                  </Group>
                )
              }
              return (
                <Group key={object.id}>
                  <Circle cx={cx} cy={cy} r={radius + 4} color={BOMB_GLOW} />
                  <Circle cx={cx} cy={cy} r={radius} color={BOMB_FILL} />
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    style="stroke"
                    strokeWidth={2}
                    color={BOMB_STROKE}
                  />
                  <Rect
                    x={cx - 1}
                    y={cy - radius - 8}
                    width={2}
                    height={8}
                    color={FUSE_COLOR}
                  />
                  <Circle
                    cx={cx}
                    cy={cy - radius - 8}
                    r={2}
                    color={SPARK_COLOR}
                  />
                </Group>
              )
            })}
          </GameCanvas>
          {hud.objects.map(object => (
            <View
              key={object.id}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`${object.type === 'coin' ? 'Coin' : 'Bomb'} at row ${object.row + 1} column ${object.col + 1}`}
              accessibilityActions={[{ name: 'activate', label: 'Tap target' }]}
              onAccessibilityTap={() =>
                reflex.handleCellClick(object.row, object.col)
              }
              onAccessibilityAction={event => {
                if (event.nativeEvent.actionName === 'activate') {
                  reflex.handleCellClick(object.row, object.col)
                }
              }}
              style={{
                position: 'absolute',
                left: `${(object.col / config.gridSize) * 100}%`,
                top: `${(object.row / config.gridSize) * 100}%`,
                width: `${100 / config.gridSize}%`,
                height: `${100 / config.gridSize}%`,
              }}
            />
          ))}
        </View>
      </GestureDetector>
    </View>
  )
}
