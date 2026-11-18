import { useMemo, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { Button } from '@cetus/ui'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Circle, Group, Path, Rect } from '@shopify/react-native-skia'
import {
  bearing,
  pointAlongBearing,
  polarToWorld,
  ringRadius,
  type WorldPoint,
} from '@cetus/games/satellite-sync/geometry'
import { SATELLITE_SYNC_LEVELS } from '@cetus/games/satellite-sync/levels'
import type {
  BeamColor,
  SatelliteSyncState,
} from '@cetus/games/satellite-sync/types'

import {
  GameCanvas,
  toLogicalPoint,
  type GameCanvasGeometry,
} from '../canvas/GameCanvas'
import { useFrameLoop } from '../canvas/useFrameLoop'
import type { NativeHandleGameViewProps } from '../registry'
import type {
  SatelliteSyncController,
  SatelliteSyncProjection,
} from '../satellite-sync/controller'

const SCENE_SIZE = 360
const CENTER = SCENE_SIZE / 2
// Same fit as the web renderer: the widest authored ring set fills 42% of
// the canvas per side, so satellite world positions never jump by level.
const SCENE_RINGS = Math.max(...SATELLITE_SYNC_LEVELS.map(level => level.rings))
const SCENE_SCALE = (SCENE_SIZE * 0.42) / ringRadius(SCENE_RINGS - 1)
const BEAM_LENGTH = ringRadius(SCENE_RINGS - 1) * 1.25 * SCENE_SCALE

/** Grab radius in world units (web parity: renderer GRAB_RADIUS_WORLD). */
const GRAB_RADIUS_WORLD = 0.4

const BACKGROUND = '#02030a'
const RING_COLOR = '#1e3a5f'
const BODY_COLOR = '#fbbf24'
const OBSTACLE_COLOR = '#475569'

const BEAM_COLORS: Record<BeamColor, string> = {
  cyan: '#22d3ee',
  magenta: '#f472b6',
  yellow: '#facc15',
  green: '#4ade80',
}

interface ScenePoint {
  x: number
  y: number
}

const scenePoint = (ring: number, angleDeg: number): ScenePoint => {
  const world = polarToWorld(ring, angleDeg)
  return {
    x: CENTER + world.x * SCENE_SCALE,
    y: CENTER + world.y * SCENE_SCALE,
  }
}

/**
 * Satellite Sync native board (HPA-535 Stage 2). Draws the copied scene with
 * Skia (rings, moving targets/obstacles, beams) and routes pan aim
 * begin/update/end to the per-host controller through the portable
 * `satellite-sync/geometry` helpers — no orbital math or timer engine is
 * re-derived here. The model expects MILLISECONDS: the shared frame loop
 * hands over seconds and the step converts once. One loop, one wake
 * subscription; a manual Stop wakes it for one final idle render.
 */
export function SatelliteSyncBoard({
  projected,
  binding,
}: NativeHandleGameViewProps) {
  const controller = binding as SatelliteSyncController
  const hud = projected as unknown as SatelliteSyncProjection
  const [scene, setScene] = useState<SatelliteSyncState | null>(() =>
    controller.getScene()
  )
  const geometryRef = useRef<GameCanvasGeometry | null>(null)
  const draggingRef = useRef<string | null>(null)

  const syncScene = () => {
    setScene(controller.getScene())
  }

  useFrameLoop(
    {
      isRunning: () => controller.isRunning(),
      // The frame loop measures seconds; SatelliteSyncGame.update() takes ms.
      step: dtSeconds => controller.update(dtSeconds * 1000),
      subscribe: (wake, resetTimestamp) =>
        controller.subscribe(wake, resetTimestamp),
      onFrame: syncScene,
      lifecycleKey: () => controller.getStatus(),
    },
    controller
  )

  const worldPointOf = (x: number, y: number): WorldPoint | null => {
    const geometry = geometryRef.current
    if (!geometry) {
      return null
    }
    const logical = toLogicalPoint(x, y, geometry)
    if (!logical) {
      return null
    }
    return {
      x: (logical.x - CENTER) / SCENE_SCALE,
      y: (logical.y - CENTER) / SCENE_SCALE,
    }
  }

  const satelliteIdAt = (point: WorldPoint): string | null => {
    const current = controller.getScene()
    if (!current) {
      return null
    }
    let nearest: string | null = null
    let bestDistance = GRAB_RADIUS_WORLD
    for (const satellite of current.satellites) {
      const world = polarToWorld(satellite.ring, satellite.angle)
      const distance = Math.hypot(world.x - point.x, world.y - point.y)
      if (distance <= bestDistance) {
        bestDistance = distance
        nearest = satellite.id
      }
    }
    return nearest
  }

  const aimAngleAt = (
    satelliteId: string,
    point: WorldPoint
  ): number | null => {
    const satellite = controller
      .getScene()
      ?.satellites.find(entry => entry.id === satelliteId)
    if (!satellite) {
      return null
    }
    return bearing(polarToWorld(satellite.ring, satellite.angle), point)
  }

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(event => {
          if (!controller.isRunning()) {
            return
          }
          const point = worldPointOf(event.x, event.y)
          if (!point) {
            return
          }
          const satelliteId = satelliteIdAt(point)
          if (!satelliteId) {
            return
          }
          draggingRef.current = satelliteId
          controller.beginAim(satelliteId)
          const angle = aimAngleAt(satelliteId, point)
          if (angle !== null) {
            controller.updateAim(satelliteId, angle)
          }
          syncScene()
        })
        .onUpdate(event => {
          const satelliteId = draggingRef.current
          if (!satelliteId) {
            return
          }
          const point = worldPointOf(event.x, event.y)
          if (!point) {
            return
          }
          const angle = aimAngleAt(satelliteId, point)
          if (angle !== null) {
            controller.updateAim(satelliteId, angle)
          }
          syncScene()
        })
        .onFinalize(() => {
          const satelliteId = draggingRef.current
          draggingRef.current = null
          if (!satelliteId) {
            return
          }
          controller.endAim(satelliteId)
          syncScene()
        }),
    [controller]
  )

  const satellites = scene?.satellites ?? []
  const targets = scene?.targets ?? []
  const obstacles = scene?.obstacles ?? []
  const snapCandidateIds = new Set(
    satellites
      .map(satellite => satellite.snapCandidateId)
      .filter((id): id is string => id !== null)
  )
  const lockedCount = targets.filter(target => target.locked).length
  const level = hud.level ?? 1
  const levelName = scene?.levelName ?? SATELLITE_SYNC_LEVELS[level - 1]?.name
  const playing = scene?.status === 'playing'

  const summary =
    scene === null
      ? 'Satellite Sync board: waiting to start'
      : `Satellite Sync board: level ${level} ${levelName ?? ''}, ${lockedCount} of ${targets.length} targets locked, combo ×${scene.multiplier}`

  return (
    <View className="flex-1 gap-3 px-4 pb-4">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text
          testID="ss-level"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Level {level} / {SATELLITE_SYNC_LEVELS.length}
        </Text>
        <Text
          testID="ss-targets"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {scene === null
            ? 'Targets –'
            : `Targets ${lockedCount} / ${targets.length}`}
        </Text>
        <Text
          testID="ss-combo"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Combo ×{scene?.multiplier ?? 1}
        </Text>
      </View>

      <GestureDetector gesture={pan}>
        <View
          testID="satellite-board"
          className="w-full"
          style={{ aspectRatio: 1 }}
          accessible
          accessibilityLabel={summary}
        >
          <GameCanvas
            logicalWidth={SCENE_SIZE}
            logicalHeight={SCENE_SIZE}
            geometryRef={geometryRef}
          >
            <Rect
              x={0}
              y={0}
              width={SCENE_SIZE}
              height={SCENE_SIZE}
              color={BACKGROUND}
            />
            {Array.from({ length: SCENE_RINGS }, (_, ring) => (
              <Circle
                key={`ring-${ring}`}
                cx={CENTER}
                cy={CENTER}
                r={ringRadius(ring) * SCENE_SCALE}
                style="stroke"
                strokeWidth={1}
                color={RING_COLOR}
                opacity={0.4}
              />
            ))}
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={SCENE_SCALE * 0.18}
              color={BODY_COLOR}
            />
            {obstacles.map(obstacle => {
              const point = scenePoint(obstacle.ring, obstacle.currentAngle)
              return (
                <Circle
                  key={obstacle.id}
                  cx={point.x}
                  cy={point.y}
                  r={obstacle.radius * SCENE_SCALE}
                  color={OBSTACLE_COLOR}
                />
              )
            })}
            {satellites.map(satellite => {
              const point = scenePoint(satellite.ring, satellite.angle)
              const beamEnd = pointAlongBearing(
                point,
                satellite.aimAngle,
                BEAM_LENGTH
              )
              const color = BEAM_COLORS[satellite.color]
              return (
                <Group key={satellite.id}>
                  <Path
                    path={`M${point.x} ${point.y}L${beamEnd.x} ${beamEnd.y}`}
                    style="stroke"
                    strokeWidth={satellite.lockedTargetId ? 5 : 3}
                    color={color}
                    opacity={satellite.lockedTargetId ? 1 : 0.7}
                  />
                  <Circle
                    cx={point.x}
                    cy={point.y}
                    r={SCENE_SCALE * 0.12}
                    color={color}
                  />
                </Group>
              )
            })}
            {targets.map(target => {
              const point = scenePoint(target.ring, target.currentAngle)
              const color = BEAM_COLORS[target.color]
              const radius = SCENE_SCALE * (target.locked ? 0.16 : 0.12)
              return (
                <Group key={target.id}>
                  <Circle
                    cx={point.x}
                    cy={point.y}
                    r={radius}
                    color={color}
                    opacity={target.locked ? 1 : 0.45}
                  />
                  <Circle
                    cx={point.x}
                    cy={point.y}
                    r={radius}
                    style="stroke"
                    strokeWidth={2}
                    color={color}
                  />
                  {snapCandidateIds.has(target.id) && !target.locked ? (
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={radius + SCENE_SCALE * 0.08}
                      style="stroke"
                      strokeWidth={2}
                      color={color}
                      opacity={0.9}
                    />
                  ) : null}
                </Group>
              )
            })}
          </GameCanvas>
        </View>
      </GestureDetector>

      <Text className="font-sans text-xs text-cetus-ink-muted">
        Drag a satellite beam onto a matching-colour target, then release to
        lock it. Asteroids block the beam — find a clear path.
      </Text>

      {playing ? (
        <Button
          variant="ghost"
          accessibilityLabel="Stop run"
          onPress={() => {
            controller.stop()
            syncScene()
          }}
        >
          Stop run
        </Button>
      ) : null}
    </View>
  )
}
