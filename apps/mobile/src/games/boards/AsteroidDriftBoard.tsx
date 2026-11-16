import { useState } from 'react'
import { Text, View } from 'react-native'
import { Circle, Group, Path, Rect } from '@shopify/react-native-skia'
import type { AsteroidDriftGame } from '@cetus/games/asteroid-drift/AsteroidDriftGame'
import type { AsteroidDriftState } from '@cetus/games/asteroid-drift/types'

import { GameCanvas } from '../canvas/GameCanvas'
import { useGameLoop } from '../canvas/useGameLoop'
import type { NativeGameViewProps } from '../registry'
import { HeldDpad } from './HeldDpad'

const FIELD_FILL = '#020617'
const BORDER_COLOR = '#155e75'
const STAR_FILL = '#e2e8f0'
const ASTEROID_FILL = '#334155'
const ASTEROID_STROKE = '#94a3b8'
const CRATER_FILL = '#0f172a'
const ORB_HALO = '#facc15'
const ORB_CORE = '#fde047'
const SHIP_FILL = '#22d3ee'
const SHIP_STROKE = '#67e8f9'

const SHIP_HEADING_MIN_SPEED = 1

const STAR_DOTS = [
  { x: 0.05, y: 0.12, r: 1.6 },
  { x: 0.11, y: 0.55, r: 1.1 },
  { x: 0.18, y: 0.82, r: 1.4 },
  { x: 0.24, y: 0.28, r: 1.0 },
  { x: 0.32, y: 0.68, r: 1.5 },
  { x: 0.38, y: 0.08, r: 1.2 },
  { x: 0.45, y: 0.42, r: 1.0 },
  { x: 0.52, y: 0.88, r: 1.3 },
  { x: 0.58, y: 0.18, r: 1.6 },
  { x: 0.64, y: 0.6, r: 1.1 },
  { x: 0.71, y: 0.35, r: 1.4 },
  { x: 0.77, y: 0.78, r: 1.0 },
  { x: 0.83, y: 0.14, r: 1.2 },
  { x: 0.89, y: 0.5, r: 1.5 },
  { x: 0.94, y: 0.86, r: 1.1 },
  { x: 0.97, y: 0.3, r: 1.3 },
] as const

const ASTEROID_CRATERS = [
  { x: -0.35, y: -0.25, r: 0.18 },
  { x: 0.3, y: 0.35, r: 0.12 },
] as const

interface AsteroidDriftHud {
  orbs: number
}

interface AsteroidDriftScene {
  player: {
    x: number
    y: number
    velocityX: number
    velocityY: number
    radius: number
  }
  asteroids: Array<{ id: string; x: number; y: number; radius: number }>
  orb: { id: string; x: number; y: number; radius: number } | null
}

const readAsteroidDriftScene = (
  state: AsteroidDriftState
): AsteroidDriftScene => ({
  player: {
    x: state.player.x,
    y: state.player.y,
    velocityX: state.player.velocityX,
    velocityY: state.player.velocityY,
    radius: state.player.radius,
  },
  asteroids: state.asteroids.map(asteroid => ({
    id: asteroid.id,
    x: asteroid.x,
    y: asteroid.y,
    radius: asteroid.radius,
  })),
  orb: state.energyOrb
    ? {
        id: state.energyOrb.id,
        x: state.energyOrb.x,
        y: state.energyOrb.y,
        radius: state.energyOrb.radius,
      }
    : null,
})

const shipPath = (player: AsteroidDriftScene['player']): string => {
  const speed = Math.hypot(player.velocityX, player.velocityY)
  const heading =
    speed > SHIP_HEADING_MIN_SPEED
      ? Math.atan2(player.velocityY, player.velocityX)
      : 0
  const cos = Math.cos(heading)
  const sin = Math.sin(heading)
  const radius = player.radius
  const hull: Array<readonly [number, number]> = [
    [radius, 0],
    [-radius / 2, (-radius * Math.sqrt(3)) / 2],
    [-radius / 2, (radius * Math.sqrt(3)) / 2],
  ]
  const vertices = hull.map(
    ([lx, ly]) =>
      [player.x + lx * cos - ly * sin, player.y + lx * sin + ly * cos] as const
  )
  return (
    `M${vertices[0][0]} ${vertices[0][1]}` +
    `L${vertices[1][0]} ${vertices[1][1]}` +
    `L${vertices[2][0]} ${vertices[2][1]}Z`
  )
}

export function AsteroidDriftBoard({ projected, game }: NativeGameViewProps) {
  const drift = game as AsteroidDriftGame
  const config = drift.getConfig()
  const hud = projected as unknown as AsteroidDriftHud
  const [scene, setScene] = useState<AsteroidDriftScene>(() =>
    readAsteroidDriftScene(drift.getState())
  )

  useGameLoop(drift, () => {
    setScene(readAsteroidDriftScene(drift.getState()))
  })

  const speed = Math.hypot(scene.player.velocityX, scene.player.velocityY)
  const ship = shipPath(scene.player)
  const orb = scene.orb
  const orbDiamondRadius = orb === null ? 0 : orb.radius * 0.5
  const orbCrossRadius = orb === null ? 0 : orb.radius * 0.3
  const orbDetail =
    orb === null
      ? ''
      : `M${orb.x - orbDiamondRadius} ${orb.y}` +
        `L${orb.x} ${orb.y - orbDiamondRadius}` +
        `L${orb.x + orbDiamondRadius} ${orb.y}` +
        `L${orb.x} ${orb.y + orbDiamondRadius}Z` +
        `M${orb.x - orbCrossRadius} ${orb.y}` +
        `L${orb.x + orbCrossRadius} ${orb.y}` +
        `M${orb.x} ${orb.y - orbCrossRadius}` +
        `L${orb.x} ${orb.y + orbCrossRadius}`

  return (
    <View className="flex-1 gap-3 px-4 pb-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text
          testID="asteroid-orbs"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Orbs {hud.orbs}
        </Text>
        <Text
          testID="asteroid-speed"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Speed {Math.round(speed)}
        </Text>
      </View>
      <View
        testID="asteroid-board"
        className="w-full"
        style={{ aspectRatio: config.canvasWidth / config.canvasHeight }}
        accessible
        accessibilityLabel={`Asteroid Drift arena: ${scene.asteroids.length} asteroids incoming; hold the D-pad to thrust`}
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
            color={FIELD_FILL}
          />
          {STAR_DOTS.map((dot, index) => (
            <Circle
              key={`star-${index}`}
              cx={dot.x * config.canvasWidth}
              cy={dot.y * config.canvasHeight}
              r={dot.r}
              color={STAR_FILL}
              opacity={0.65}
            />
          ))}
          <Rect
            x={0.5}
            y={0.5}
            width={config.canvasWidth - 1}
            height={config.canvasHeight - 1}
            style="stroke"
            strokeWidth={1}
            color={BORDER_COLOR}
            opacity={0.8}
          />
          {scene.asteroids.map(asteroid => (
            <Group key={asteroid.id}>
              <Circle
                cx={asteroid.x}
                cy={asteroid.y}
                r={asteroid.radius}
                color={ASTEROID_FILL}
                opacity={0.95}
              />
              <Circle
                cx={asteroid.x}
                cy={asteroid.y}
                r={asteroid.radius}
                style="stroke"
                strokeWidth={1.5}
                color={ASTEROID_STROKE}
              />
              {ASTEROID_CRATERS.map((crater, index) => (
                <Circle
                  key={`${asteroid.id}-crater-${index}`}
                  cx={asteroid.x + crater.x * asteroid.radius}
                  cy={asteroid.y + crater.y * asteroid.radius}
                  r={crater.r * asteroid.radius}
                  color={CRATER_FILL}
                  opacity={0.55}
                />
              ))}
            </Group>
          ))}
          {orb === null ? null : (
            <Group>
              <Circle
                cx={orb.x}
                cy={orb.y}
                r={orb.radius}
                color={ORB_HALO}
                opacity={0.12}
              />
              <Circle
                cx={orb.x}
                cy={orb.y}
                r={orb.radius}
                style="stroke"
                strokeWidth={2}
                color={ORB_HALO}
              />
              <Path
                path={orbDetail}
                style="stroke"
                strokeWidth={1}
                color={ORB_CORE}
                opacity={0.9}
              />
            </Group>
          )}
          <Path path={ship} color={SHIP_FILL} opacity={0.9} />
          <Path
            path={ship}
            style="stroke"
            strokeWidth={2}
            color={SHIP_STROKE}
          />
        </GameCanvas>
      </View>
      <HeldDpad
        disabled={() => !drift.getState().isActive}
        onPressDirection={direction => drift.pressDirection(direction, 'touch')}
        onReleaseDirection={direction =>
          drift.releaseDirection(direction, 'touch')
        }
      />
    </View>
  )
}
