import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Circle, Path, Rect, RoundedRect } from '@shopify/react-native-skia'
import type { SnakeGame } from '@cetus/games/snake/SnakeGame'
import type { SnakeState } from '@cetus/games/snake/types'

import { GameCanvas } from '../canvas/GameCanvas'
import { swipeDirection } from '../canvas/swipeDirection'
import { useGameLoop } from '../canvas/useGameLoop'
import type { NativeGameViewProps } from '../registry'
import { cssColor } from '../canvas/cssColor'

const SEGMENT_PADDING = 2
const SEGMENT_RADIUS = 4

interface SnakeHud {
  length: number
  foodsEaten: number
}

interface SnakeScene {
  segments: Array<{ x: number; y: number }>
  food: { x: number; y: number } | null
}

const readSnakeScene = (state: SnakeState): SnakeScene => ({
  segments: state.snake.map(segment => ({ x: segment.x, y: segment.y })),
  food: state.food === null ? null : { x: state.food.x, y: state.food.y },
})

export function SnakeBoard({ projected, game }: NativeGameViewProps) {
  const snake = game as SnakeGame
  const config = snake.getConfig()
  const cell = config.cellSize
  const hud = projected as unknown as SnakeHud
  const [scene, setScene] = useState<SnakeScene>(() =>
    readSnakeScene(snake.getState())
  )

  useGameLoop(snake, () => {
    const state = snake.getState()
    if (!state.needsRedraw) {
      return
    }
    setScene(readSnakeScene(state))
    snake.markRendered()
  })

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onEnd(event => {
          const direction = swipeDirection(
            event.translationX,
            event.translationY
          )
          if (direction) {
            snake.changeDirection(direction)
          }
        }),
    [snake]
  )

  const gridLines: string[] = []
  for (let x = 0; x <= config.gridWidth; x++) {
    gridLines.push(`M${x * cell} 0L${x * cell} ${config.gameHeight}`)
  }
  for (let y = 0; y <= config.gridHeight; y++) {
    gridLines.push(`M0 ${y * cell}L${config.gameWidth} ${y * cell}`)
  }

  return (
    <View className="flex-1 gap-3 px-4 pb-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text
          testID="snake-length"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Length {hud.length}
        </Text>
        <Text
          testID="snake-foods"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Food {hud.foodsEaten}
        </Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          testID="snake-board"
          className="w-full"
          style={{ aspectRatio: config.gameWidth / config.gameHeight }}
          accessible
          accessibilityLabel={`Snake board: length ${scene.segments.length}; swipe to steer`}
        >
          <GameCanvas
            logicalWidth={config.gameWidth}
            logicalHeight={config.gameHeight}
          >
            <Rect
              x={0}
              y={0}
              width={config.gameWidth}
              height={config.gameHeight}
              color={cssColor(config.backgroundColor)}
            />
            <Path
              path={gridLines.join('')}
              style="stroke"
              strokeWidth={1}
              color={cssColor(config.gridColor, 0.15)}
            />
            {scene.segments.map((segment, index) => (
              <RoundedRect
                key={index}
                x={segment.x * cell + SEGMENT_PADDING}
                y={segment.y * cell + SEGMENT_PADDING}
                width={cell - SEGMENT_PADDING * 2}
                height={cell - SEGMENT_PADDING * 2}
                r={SEGMENT_RADIUS}
                color={cssColor(config.snakeColor)}
              />
            ))}
            {scene.segments[0] ? (
              <RoundedRect
                x={scene.segments[0].x * cell + SEGMENT_PADDING}
                y={scene.segments[0].y * cell + SEGMENT_PADDING}
                width={cell - SEGMENT_PADDING * 2}
                height={cell - SEGMENT_PADDING * 2}
                r={SEGMENT_RADIUS}
                style="stroke"
                strokeWidth={2}
                color="rgba(255, 255, 255, 0.8)"
              />
            ) : null}
            {scene.food ? (
              <>
                <Circle
                  cx={scene.food.x * cell + cell / 2}
                  cy={scene.food.y * cell + cell / 2}
                  r={cell / 2 - 3}
                  color={cssColor(config.foodColor)}
                />
                <Circle
                  cx={scene.food.x * cell + cell / 2}
                  cy={scene.food.y * cell + cell / 2}
                  r={cell / 2 - 3}
                  style="stroke"
                  strokeWidth={2}
                  color="rgba(255, 255, 255, 0.5)"
                />
              </>
            ) : null}
          </GameCanvas>
        </View>
      </GestureDetector>
    </View>
  )
}
