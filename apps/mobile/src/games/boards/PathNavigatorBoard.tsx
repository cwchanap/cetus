import { useEffect, useMemo, useRef, useState } from 'react'
import { Text, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Circle, Path, Rect } from '@shopify/react-native-skia'
import type { PathNavigatorGame } from '@cetus/games/path-navigator/PathNavigatorGame'
import type { PathSegment } from '@cetus/games/path-navigator/types'
import {
  pointInCircle,
  quadraticBezierPoint,
} from '@cetus/games/shared/geometry'

import {
  GameCanvas,
  toGamePoint,
  toLogicalPoint,
  type GameCanvasGeometry,
  type GamePoint,
} from '../canvas/GameCanvas'
import type { NativeGameViewProps } from '../registry'

const cssColor = (hex: number, alpha = 1): string => {
  const r = (hex >> 16) & 0xff
  const g = (hex >> 8) & 0xff
  const b = hex & 0xff
  return alpha === 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const START_BUFFER = 30
const GOAL_BUFFER = 25
const MARKER_RADIUS = 15
const CURVE_STEPS = 50
const GRID_STEP = 50
const GRID_COLOR = 'rgba(51, 51, 51, 0.3)'
const PATH_OUTLINE = '#00dddd'

interface PathNavigatorHud {
  currentLevel: number
  totalLevels: number
  isGameWon: boolean
  canNavigate: boolean
}

const straightStrip = (segment: PathSegment): string => {
  const { start, end, width } = segment
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) {
    return ''
  }
  const px = (-dy / length) * (width / 2)
  const py = (dx / length) * (width / 2)
  return (
    `M${start.x + px} ${start.y + py}` +
    `L${end.x + px} ${end.y + py}` +
    `L${end.x - px} ${end.y - py}` +
    `L${start.x - px} ${start.y - py}Z`
  )
}

const curvedStrip = (segment: PathSegment): string => {
  const { start, end, width, controlPoint } = segment
  if (!controlPoint) {
    return ''
  }
  const offsetAt = (i: number) => {
    const t = i / CURVE_STEPS
    const point = quadraticBezierPoint(t, start, controlPoint, end)
    if (i >= CURVE_STEPS) {
      return { point, px: 0, py: 0 }
    }
    const next = quadraticBezierPoint(
      (i + 1) / CURVE_STEPS,
      start,
      controlPoint,
      end
    )
    const dx = next.x - point.x
    const dy = next.y - point.y
    const length = Math.hypot(dx, dy)
    const px = length > 0 ? (-dy / length) * (width / 2) : 0
    const py = length > 0 ? (dx / length) * (width / 2) : 0
    return { point, px, py }
  }
  let path = ''
  for (let i = 0; i <= CURVE_STEPS; i++) {
    const { point, px, py } = offsetAt(i)
    path += `${i === 0 ? 'M' : 'L'}${point.x + px} ${point.y + py}`
  }
  for (let i = CURVE_STEPS; i >= 0; i--) {
    const { point, px, py } = offsetAt(i)
    path += `L${point.x - px} ${point.y - py}`
  }
  return `${path}Z`
}

const segmentStrip = (segment: PathSegment): string =>
  segment.type === 'straight' ? straightStrip(segment) : curvedStrip(segment)

export function PathNavigatorBoard({ projected, game }: NativeGameViewProps) {
  const nav = game as PathNavigatorGame
  const config = nav.getConfig()
  const hud = projected as unknown as PathNavigatorHud
  const [viewSize, setViewSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [cursor, setCursor] = useState(() => {
    const modelCursor = nav.getState().cursor
    return { x: modelCursor.x, y: modelCursor.y }
  })
  const armedRef = useRef(false)
  const geometryRef = useRef<GameCanvasGeometry | null>(null)
  geometryRef.current =
    viewSize === null
      ? null
      : {
          logicalWidth: config.gameWidth,
          logicalHeight: config.gameHeight,
          viewWidth: viewSize.width,
          viewHeight: viewSize.height,
        }

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setViewSize(current =>
      current !== null && current.width === width && current.height === height
        ? current
        : { width, height }
    )
  }

  useEffect(() => {
    armedRef.current = false
    const modelCursor = nav.getState().cursor
    setCursor(current =>
      current.x === modelCursor.x && current.y === modelCursor.y
        ? current
        : { x: modelCursor.x, y: modelCursor.y }
    )
  }, [nav, hud.currentLevel, hud.canNavigate])

  const applyGamePoint = (point: GamePoint) => {
    const levelBefore = nav.getState().currentLevel
    nav.updatePlayerPosition(point.x, point.y)
    const state = nav.getState()
    setCursor({ x: state.cursor.x, y: state.cursor.y })
    if (
      state.currentLevel !== levelBefore ||
      !state.isActive ||
      state.isPaused ||
      state.isGameOver
    ) {
      armedRef.current = false
    }
  }

  // clampToBoard keeps margin touches from arming a pan; an armed drag
  // reports unclamped positions so leaving the playfield fails the run.
  const sample = (
    event: { x?: number; y?: number },
    clampToBoard: boolean
  ): GamePoint | null => {
    const geometry = geometryRef.current
    if (
      geometry === null ||
      typeof event.x !== 'number' ||
      typeof event.y !== 'number'
    ) {
      return null
    }
    return clampToBoard
      ? toGamePoint(event.x, event.y, geometry)
      : toLogicalPoint(event.x, event.y, geometry)
  }

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(event => {
          const point = sample(event, true)
          if (point === null) {
            return
          }
          const state = nav.getState()
          if (!state.isActive || state.isPaused || state.isGameOver) {
            return
          }
          const start = nav.getCurrentLevel().path.startPoint
          if (
            !pointInCircle(point, start, START_BUFFER) &&
            !pointInCircle(point, state.cursor, START_BUFFER)
          ) {
            return
          }
          armedRef.current = true
          applyGamePoint(point)
        })
        .onUpdate(event => {
          if (!armedRef.current) {
            return
          }
          const point = sample(event, false)
          if (point === null) {
            return
          }
          applyGamePoint(point)
        })
        .onFinalize(() => {
          armedRef.current = false
        }),
    [nav]
  )

  const level = nav.getCurrentLevel()
  const start = level.path.startPoint
  const goal = level.path.endPoint
  const strips = useMemo(() => level.path.segments.map(segmentStrip), [level])

  const gridLines: string[] = []
  for (let x = 0; x <= config.gameWidth; x += GRID_STEP) {
    gridLines.push(`M${x} 0L${x} ${config.gameHeight}`)
  }
  for (let y = 0; y <= config.gameHeight; y += GRID_STEP) {
    gridLines.push(`M0 ${y}L${config.gameWidth} ${y}`)
  }

  return (
    <View className="flex-1 gap-3 px-4 pb-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text
          testID="path-level"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Level {hud.currentLevel} / {hud.totalLevels}
        </Text>
        <Text className="font-sans text-sm text-cetus-ink-muted">
          {hud.isGameWon ? 'Cleared' : level.name}
        </Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          testID="path-board"
          className="w-full"
          style={{ aspectRatio: config.gameWidth / config.gameHeight }}
          onLayout={onLayout}
          accessible
          accessibilityLabel={`Path Navigator board: level ${hud.currentLevel} ${level.name}; drag from the cyan start`}
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
              color={GRID_COLOR}
            />
            <Circle
              cx={start.x}
              cy={start.y}
              r={START_BUFFER}
              color={cssColor(config.pathColor, 0.2)}
            />
            <Circle
              cx={start.x}
              cy={start.y}
              r={MARKER_RADIUS}
              color={cssColor(config.pathColor)}
            />
            <Circle
              cx={goal.x}
              cy={goal.y}
              r={GOAL_BUFFER}
              color={cssColor(config.goalColor, 0.2)}
            />
            <Circle
              cx={goal.x}
              cy={goal.y}
              r={MARKER_RADIUS}
              color={cssColor(config.goalColor)}
            />
            <Circle
              cx={goal.x}
              cy={goal.y}
              r={MARKER_RADIUS + 5}
              style="stroke"
              strokeWidth={3}
              color={cssColor(config.goalColor, 0.5)}
            />
            {strips.map((strip, index) => (
              <Path
                key={index}
                path={strip}
                color={cssColor(config.pathColor)}
              />
            ))}
            {strips.map((strip, index) => (
              <Path
                key={`${index}-outline`}
                path={strip}
                style="stroke"
                strokeWidth={2}
                color={PATH_OUTLINE}
              />
            ))}
            <Circle
              cx={cursor.x}
              cy={cursor.y}
              r={config.cursorRadius + 3}
              style="stroke"
              strokeWidth={2}
              color={cssColor(config.cursorColor, 0.3)}
            />
            <Circle
              cx={cursor.x}
              cy={cursor.y}
              r={config.cursorRadius}
              color={cssColor(config.cursorColor)}
            />
          </GameCanvas>
        </View>
      </GestureDetector>
      <Text className="font-sans text-xs text-cetus-ink-muted">
        Drag from the cyan start to the green goal and stay inside the path.
      </Text>
    </View>
  )
}
