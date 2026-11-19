import { useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Circle, Rect } from '@shopify/react-native-skia'
import { Button } from '@cetus/ui'
import type { BubbleShooterGame } from '@cetus/games/bubble-shooter/BubbleShooterGame'
import type {
  BubbleShooterState,
  GameConstants,
} from '@cetus/games/bubble-shooter/types'

import {
  GameCanvas,
  toGamePoint,
  type GameCanvasGeometry,
  type GamePoint,
} from '../canvas/GameCanvas'
import { cssColor } from '../canvas/cssColor'
import { useGameLoop } from '../canvas/useGameLoop'
import type { NativeGameViewProps } from '../registry'

interface BubbleShooterHud {
  aimAngle: number
  currentColor: number | null
  nextColor: number | null
  projectile: boolean
  shotsFired: number
  bubblesRemaining: number
  phase: 'idle' | 'paused' | 'running' | 'finished'
  canShoot: boolean
}

interface SceneBubble {
  color: number
  x: number
  y: number
}

/** Board-local drawing scene: the model mutates bubbles, the projectile and
 *  the grid in place, so board references would freeze the canvas. */
interface BubbleShooterScene {
  grid: Array<Array<SceneBubble | null>>
  shooter: GamePoint
  currentBubble: SceneBubble | null
  projectile: SceneBubble | null
  aimAngle: number
}

const COLOR_NAMES: Record<number, string> = {
  0xff4444: 'red',
  0x44ff44: 'green',
  0x4444ff: 'blue',
}

const colorName = (color: number): string =>
  COLOR_NAMES[color] ?? `#${color.toString(16).padStart(6, '0')}`

const colorLine = (color: number | null): string =>
  color === null ? '—' : colorName(color)

/** Degrees either side of straight up, clamped by the model to ±72°. */
const aimDescription = (angle: number): string => {
  const offset = Math.round(((angle + Math.PI / 2) * 180) / Math.PI)
  if (offset === 0) {
    return 'straight up'
  }
  return `${Math.abs(offset)}° ${offset > 0 ? 'right' : 'left'} of straight up`
}

const copyBubble = (bubble: SceneBubble | null): SceneBubble | null =>
  bubble === null ? null : { color: bubble.color, x: bubble.x, y: bubble.y }

const readScene = (state: BubbleShooterState): BubbleShooterScene => ({
  grid: state.grid.map(row => (row ?? []).map(copyBubble)),
  shooter: { x: state.shooter.x, y: state.shooter.y },
  currentBubble: copyBubble(state.currentBubble),
  projectile: copyBubble(state.projectile),
  aimAngle: state.aimAngle,
})

const phaseText = (hud: BubbleShooterHud): string => {
  if (hud.phase === 'finished') {
    return 'Run complete'
  }
  if (hud.phase === 'paused') {
    return 'Paused'
  }
  if (hud.phase !== 'running') {
    return 'Waiting to start'
  }
  return hud.projectile
    ? 'Bubble in flight'
    : `Aim ${aimDescription(hud.aimAngle)}`
}

/** One occupied row as contiguous same-color column runs. */
const describeRow = (
  row: Array<SceneBubble | null>,
  index: number
): string | null => {
  const runs: Array<{ color: number; start: number; end: number }> = []
  for (let col = 0; col < row.length; col += 1) {
    const bubble = row[col]
    if (bubble === null) {
      continue
    }
    const last = runs[runs.length - 1]
    if (
      last !== undefined &&
      last.color === bubble.color &&
      last.end === col - 1
    ) {
      last.end = col
    } else {
      runs.push({ color: bubble.color, start: col, end: col })
    }
  }
  if (runs.length === 0) {
    return null
  }
  const parts = runs.map(run =>
    run.start === run.end
      ? `${colorName(run.color)} column ${run.start + 1}`
      : `${colorName(run.color)} columns ${run.start + 1} to ${run.end + 1}`
  )
  return `Row ${index + 1}: ${parts.join(', ')}.`
}

const describeBoard = (
  hud: BubbleShooterHud,
  scene: BubbleShooterScene,
  constants: GameConstants
): string => {
  const parts = [
    `Bubble Shooter board, ${constants.GRID_WIDTH} columns by ${constants.GRID_HEIGHT} rows.`,
    `${phaseText(hud)}.`,
    `${hud.bubblesRemaining} bubbles remaining.`,
    `Aim ${aimDescription(hud.aimAngle)}.`,
    `Now ${colorLine(hud.currentColor)}, next ${colorLine(hud.nextColor)}.`,
  ]
  scene.grid.forEach((row, index) => {
    const line = describeRow(row, index)
    if (line !== null) {
      parts.push(line)
    }
  })
  return parts.join(' ')
}

const MIN_BOARD_WIDTH = 150
const SCREEN_PADDING = 16
// Static reserve under the board for the HUD, aim controls, status and
// padding. Enlarged text can exceed it; the ScrollView is the fallback then.
const RESERVED_HEIGHT = 240
// Web keyboard parity: one aim step per press, clamped by the model.
const AIM_STEP = 0.06
const GUIDE_START = 30
const GUIDE_END = 180
const GUIDE_STEP = 15
const GUIDE_DOT_RADIUS = 2
const BUBBLE_HIGHLIGHT_RATIO = 0.3
const SHOOTER_RING_RATIO = 1.4
const AIM_GUIDE_COLOR = '#eaf6ff'
const SHOOTER_COLOR = '#22d3ee'
const SHOOTER_BASE_COLOR = '#1e3a5f'

/**
 * Bubble Shooter native board (HPA-535 Stage 4): Skia hex grid over a copied,
 * board-local scene. One Pan maps touches through the canvas letterbox
 * (`toGamePoint`), feeds `setAimAngle` while dragging and calls `shoot()`
 * exactly once on a valid release; cancelled, duplicate and off-board
 * gestures, and gestures begun before a reset, never fire. The model owns
 * clamping, projectile physics, attachment, elimination and scoring, driven
 * by the shared `useGameLoop` in seconds. Screen readers aim with the
 * labelled Aim left/right controls (announced angle) and Shoot, and the
 * board label spells out the grid rows, aim, queue and remaining bubbles.
 */
export function BubbleShooterBoard({ projected, game }: NativeGameViewProps) {
  const shooterGame = game as BubbleShooterGame
  const hud = projected as unknown as BubbleShooterHud
  const constants = shooterGame.getConstantsView()
  const config = shooterGame.getConfig()
  const [scene, setScene] = useState<BubbleShooterScene>(() =>
    readScene(shooterGame.getState())
  )
  const [viewport, setViewport] = useState<{
    width: number
    height: number
  } | null>(null)
  const geometryRef = useRef<GameCanvasGeometry | null>(null)
  // Run id and in-board start captured at gesture begin: a finalize that
  // lands after a reset, from a cancelled pan, or from a touch that began
  // outside the letterboxed board must not fire.
  const gestureRunRef = useRef<number | null>(null)
  const gestureStartRef = useRef<GamePoint | null>(null)

  const onViewport = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setViewport(current =>
      current !== null && current.width === width && current.height === height
        ? current
        : { width, height }
    )
  }

  useGameLoop(shooterGame, () => {
    const state = shooterGame.getState()
    if (!state.needsRedraw) {
      return
    }
    setScene(readScene(state))
    shooterGame.markRendered()
  })

  const boardWidth =
    viewport === null
      ? null
      : Math.max(
          MIN_BOARD_WIDTH,
          Math.min(
            viewport.width - SCREEN_PADDING * 2,
            (viewport.height - RESERVED_HEIGHT) *
              (config.gameWidth / config.gameHeight)
          )
        )

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(event => {
          gestureRunRef.current = shooterGame.getRunId()
          const geometry = geometryRef.current
          gestureStartRef.current =
            geometry === null ? null : toGamePoint(event.x, event.y, geometry)
        })
        // Aim only while the model accepts input; the model itself also
        // refuses aim while paused, over, or with a projectile in flight.
        .onUpdate(event => {
          const runId = gestureRunRef.current
          if (gestureStartRef.current === null) {
            return
          }
          if (runId === null || runId !== shooterGame.getRunId()) {
            return
          }
          const state = shooterGame.getState()
          if (
            !state.isActive ||
            state.isPaused ||
            state.isGameOver ||
            state.projectile
          ) {
            return
          }
          const geometry = geometryRef.current
          if (geometry === null) {
            return
          }
          const point = toGamePoint(event.x, event.y, geometry)
          if (point === null) {
            return
          }
          const origin = state.currentBubble ?? state.shooter
          shooterGame.setAimAngle(
            Math.atan2(point.y - origin.y, point.x - origin.x)
          )
        })
        // onFinalize runs for completed AND cancelled gestures: success is
        // the only valid release, the refs clear on first use (a duplicate
        // finalize is a no-op) and a stale run is refused. Recognition
        // success alone does not mean the finger is still on the board: a
        // pan can wander into the letterbox or leave the view without being
        // cancelled, so the release point must also map onto the board.
        .onFinalize((event, success) => {
          const runId = gestureRunRef.current
          const start = gestureStartRef.current
          gestureRunRef.current = null
          gestureStartRef.current = null
          if (
            !success ||
            runId === null ||
            start === null ||
            runId !== shooterGame.getRunId()
          ) {
            return
          }
          const geometry = geometryRef.current
          if (geometry === null) {
            return
          }
          const release = toGamePoint(event.x, event.y, geometry)
          if (
            release === null ||
            !Number.isFinite(release.x) ||
            !Number.isFinite(release.y)
          ) {
            return
          }
          const state = shooterGame.getState()
          if (
            !state.isActive ||
            state.isPaused ||
            state.isGameOver ||
            state.projectile
          ) {
            return
          }
          shooterGame.shoot()
        }),
    [shooterGame]
  )

  const adjustAim = (delta: number) => {
    shooterGame.setAimAngle(shooterGame.getState().aimAngle + delta)
    const message = `Aim ${aimDescription(shooterGame.getState().aimAngle)}.`
    void AccessibilityInfo.announceForAccessibility(message)
  }

  const aimOrigin = scene.currentBubble ?? scene.shooter
  const guideDots: GamePoint[] = []
  if (hud.canShoot) {
    for (
      let distance = GUIDE_START;
      distance <= GUIDE_END;
      distance += GUIDE_STEP
    ) {
      guideDots.push({
        x: aimOrigin.x + Math.cos(scene.aimAngle) * distance,
        y: aimOrigin.y + Math.sin(scene.aimAngle) * distance,
      })
    }
  }

  const gridBubbles: SceneBubble[] = []
  scene.grid.forEach(row => {
    row.forEach(bubble => {
      if (bubble !== null) {
        gridBubbles.push(bubble)
      }
    })
  })

  return (
    <ScrollView
      testID="bubble-scroll"
      className="flex-1"
      contentContainerStyle={styles.content}
      onLayout={onViewport}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text
          testID="bubble-shots"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {`Shots ${hud.shotsFired}`}
        </Text>
        <Text
          testID="bubble-bubbles"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {`Bubbles ${hud.bubblesRemaining}`}
        </Text>
      </View>
      <View className="flex-row items-center justify-between gap-2">
        <Text
          testID="bubble-colors"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {`Now ${colorLine(hud.currentColor)} · Next ${colorLine(
            hud.nextColor
          )}`}
        </Text>
        <Text
          testID="bubble-status"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {phaseText(hud)}
        </Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          testID="bubble-board"
          style={[
            styles.board,
            boardWidth === null
              ? styles.boardFluid
              : {
                  width: boardWidth,
                  height: boardWidth * (config.gameHeight / config.gameWidth),
                },
          ]}
          accessible
          accessibilityLabel={describeBoard(hud, scene, constants)}
        >
          <GameCanvas
            logicalWidth={config.gameWidth}
            logicalHeight={config.gameHeight}
            geometryRef={geometryRef}
          >
            <Rect
              x={0}
              y={0}
              width={config.gameWidth}
              height={config.gameHeight}
              color={cssColor(config.backgroundColor)}
            />
            {gridBubbles.map(bubble => (
              <Circle
                key={`bubble-${bubble.x}-${bubble.y}`}
                cx={bubble.x}
                cy={bubble.y}
                r={config.bubbleRadius}
                color={cssColor(bubble.color)}
              />
            ))}
            {gridBubbles.map(bubble => (
              <Circle
                key={`bubble-shine-${bubble.x}-${bubble.y}`}
                cx={bubble.x - config.bubbleRadius * BUBBLE_HIGHLIGHT_RATIO}
                cy={bubble.y - config.bubbleRadius * BUBBLE_HIGHLIGHT_RATIO}
                r={config.bubbleRadius * BUBBLE_HIGHLIGHT_RATIO}
                color="rgba(255, 255, 255, 0.4)"
              />
            ))}
            <Rect
              x={scene.shooter.x - 30}
              y={scene.shooter.y + 18}
              width={60}
              height={8}
              color={SHOOTER_BASE_COLOR}
            />
            <Circle
              cx={scene.shooter.x}
              cy={scene.shooter.y}
              r={config.bubbleRadius * SHOOTER_RING_RATIO}
              style="stroke"
              strokeWidth={2}
              color={SHOOTER_COLOR}
            />
            {guideDots.map(dot => (
              <Circle
                key={`guide-${dot.x}-${dot.y}`}
                cx={dot.x}
                cy={dot.y}
                r={GUIDE_DOT_RADIUS}
                color={AIM_GUIDE_COLOR}
                opacity={0.45}
              />
            ))}
            {scene.projectile === null && scene.currentBubble !== null ? (
              <Circle
                cx={scene.currentBubble.x}
                cy={scene.currentBubble.y}
                r={config.bubbleRadius}
                color={cssColor(scene.currentBubble.color)}
              />
            ) : null}
            {scene.projectile !== null ? (
              <Circle
                cx={scene.projectile.x}
                cy={scene.projectile.y}
                r={config.bubbleRadius}
                color={cssColor(scene.projectile.color)}
              />
            ) : null}
          </GameCanvas>
        </View>
      </GestureDetector>
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityLabel="Bubble Shooter aiming"
      >
        <Button
          variant="outline"
          size="sm"
          accessibilityLabel="Aim left"
          accessibilityState={{ disabled: !hud.canShoot }}
          disabled={!hud.canShoot}
          className="flex-1"
          onPress={() => adjustAim(-AIM_STEP)}
        >
          ← Aim
        </Button>
        <Button
          variant="outline"
          size="sm"
          accessibilityLabel="Aim right"
          accessibilityState={{ disabled: !hud.canShoot }}
          disabled={!hud.canShoot}
          className="flex-1"
          onPress={() => adjustAim(AIM_STEP)}
        >
          Aim →
        </Button>
        <Button
          variant="primary"
          size="sm"
          accessibilityLabel="Shoot"
          accessibilityState={{ disabled: !hud.canShoot }}
          disabled={!hud.canShoot}
          className="flex-1"
          onPress={() => shooterGame.shoot()}
        >
          Shoot
        </Button>
      </View>
      <Text className="font-sans text-xs text-cetus-ink-muted">
        Drag on the board to aim, then release to shoot. Screen readers can aim
        left and right and shoot with the buttons.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: 24,
  },
  board: {
    alignSelf: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  boardFluid: {
    width: '100%',
    aspectRatio: 600 / 800,
  },
})
