import { memo, useEffect, useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { Button } from '@cetus/ui'
import type { Game2048 } from '@cetus/games/2048/Game2048'
import { GAME_CONSTANTS } from '@cetus/games/2048/types'
import {
  getTileColor,
  getTileFontSize,
  getTileTextColor,
} from '@cetus/games/2048/utils'

import { swipeDirection } from '../canvas/swipeDirection'
import type { NativeGameViewProps } from '../registry'

const cssColor = (hex: number): string =>
  `#${hex.toString(16).padStart(6, '0')}`

const MERGE_SCALE = 1.18

interface Game2048TileProjection {
  id: string
  value: number
  row: number
  col: number
  pop: boolean
}

interface Game2048Projection {
  tiles: Game2048TileProjection[]
  maxTile: number
  undosLeft: number
  won: boolean
  stuck: boolean
  canUndo: boolean
  canAct: boolean
}

interface TileGeometry {
  cell: number
  gap: number
  duration: number
}

const tileOffset = (index: number, { cell, gap }: TileGeometry) =>
  gap + index * (cell + gap)

const Tile2048View = memo(function Tile2048View({
  tile,
  geometry,
}: {
  tile: Game2048TileProjection
  geometry: TileGeometry
}) {
  const { cell, duration } = geometry
  const scale = useSharedValue(1)
  useEffect(() => {
    scale.value = tile.pop
      ? withSequence(
          withTiming(MERGE_SCALE, { duration: duration / 2 }),
          withTiming(1, { duration: duration / 2 })
        )
      : withTiming(1, { duration })
  }, [tile.pop, tile.value, scale, duration])
  const x = tileOffset(tile.col, geometry)
  const y = tileOffset(tile.row, geometry)
  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        { translateX: withTiming(x, { duration }) },
        { translateY: withTiming(y, { duration }) },
        { scale: scale.value },
      ],
    }),
    [x, y, duration]
  )
  return (
    <Animated.View
      testID={`game-2048-tile-${tile.id}`}
      entering={FadeIn.duration(duration)}
      accessibilityLabel={`Tile ${tile.value} row ${tile.row + 1} column ${tile.col + 1}`}
      style={[
        styles.tile,
        {
          width: cell,
          height: cell,
          borderRadius: cell * 0.1,
          backgroundColor: cssColor(getTileColor(tile.value)),
        },
        animatedStyle,
      ]}
    >
      <Text
        style={{
          color: cssColor(getTileTextColor(tile.value)),
          fontSize: getTileFontSize(tile.value, cell),
        }}
        className="font-display"
      >
        {tile.value}
      </Text>
    </Animated.View>
  )
})

const CELLS: Array<readonly [number, number]> = []
for (let row = 0; row < GAME_CONSTANTS.BOARD_SIZE; row++) {
  for (let col = 0; col < GAME_CONSTANTS.BOARD_SIZE; col++) {
    CELLS.push([row, col])
  }
}

export function Game2048Board({ projected, game }: NativeGameViewProps) {
  const view = projected as unknown as Game2048Projection
  const game2048 = game as Game2048
  const config = game2048.getConfig()
  const [boardWidth, setBoardWidth] = useState<number | null>(null)

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width
    setBoardWidth(current => (current === width ? current : width))
  }

  const scale = boardWidth === null ? 0 : boardWidth / config.gameWidth
  const geometry: TileGeometry = {
    cell: config.tileSize * scale,
    gap: config.gap * scale,
    duration: config.animationDuration,
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onEnd(event => {
      const direction = swipeDirection(event.translationX, event.translationY)
      if (direction) {
        game2048.move(direction)
      }
    })

  const status = view.won ? '2048 reached' : view.stuck ? 'No moves left' : ''

  return (
    <View className="flex-1 gap-3 px-4 pb-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text
          testID="game-2048-max"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Max {view.maxTile}
        </Text>
        <Text
          testID="game-2048-status"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {status}
        </Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          testID="game-2048-board"
          className="w-full"
          style={[
            styles.board,
            { backgroundColor: cssColor(config.boardBgColor) },
          ]}
          onLayout={onLayout}
          accessibilityLabel={`2048 board: ${view.tiles.length} tiles; swipe to move`}
        >
          {boardWidth === null
            ? null
            : CELLS.map(([row, col]) => (
                <View
                  key={`${row}-${col}`}
                  testID="game-2048-cell"
                  style={[
                    styles.cell,
                    {
                      left: tileOffset(col, geometry),
                      top: tileOffset(row, geometry),
                      width: geometry.cell,
                      height: geometry.cell,
                      borderRadius: geometry.cell * 0.1,
                      backgroundColor: cssColor(config.cellColor),
                    },
                  ]}
                />
              ))}
          {boardWidth === null
            ? null
            : view.tiles.map(tile => (
                <Tile2048View key={tile.id} tile={tile} geometry={geometry} />
              ))}
        </View>
      </GestureDetector>
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          variant="outline"
          accessibilityLabel="Undo move"
          accessibilityState={{ disabled: !(view.canAct && view.canUndo) }}
          disabled={!(view.canAct && view.canUndo)}
          onPress={() => game2048.undo()}
        >
          ↶ Undo · {view.undosLeft}
        </Button>
        {view.canAct && (view.stuck || view.won) ? (
          <Button
            variant="primary"
            accessibilityLabel="Finish run"
            onPress={() => void game2048.end()}
          >
            Finish run
          </Button>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  board: {
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cell: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(26, 42, 58, 0.6)',
  },
  tile: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(234, 246, 255, 0.14)',
  },
})
