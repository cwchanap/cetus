import { useState } from 'react'
import { Text, View } from 'react-native'
import { Button } from '@cetus/ui'
import { Group, Path, Rect, RoundedRect } from '@shopify/react-native-skia'
import type { GravityFlipGame } from '@cetus/games/gravity-flip/GravityFlipGame'
import {
  GRAVITY_FLIP_HAZARD_CATALOG,
  type GravityFlipHazardKind,
  type GravityFlipState,
} from '@cetus/games/gravity-flip/types'

import { GameCanvas } from '../canvas/GameCanvas'
import { useGameLoop } from '../canvas/useGameLoop'
import type { NativeGameViewProps } from '../registry'

const CORRIDOR_BACKGROUND = '#020817'
const RAIL_FILL = '#0f172a'
const RAIL_LINE = '#22d3ee'
const SPIKE_FILL = '#f43f5e'
const SPIKE_STROKE = '#fb7185'
const MOVER_FILL = '#a855f7'
const MOVER_STROKE = '#e879f9'
const PLAYER_FILL = '#22d3ee'
const PLAYER_STROKE = '#67e8f9'
const STAR_FILL = '#facc15'
const STAR_STROKE = '#fef08a'

interface GravityFlipHud {
  gravityLabel: string
  stars: number
  flips: number
  canFlip: boolean
}

interface GravityFlipScene {
  gravity: GravityFlipState['gravity']
  distance: number
  worldSpeed: number
  player: { x: number; y: number; size: number }
  hazards: Array<{
    id: string
    kind: GravityFlipHazardKind
    x: number
    y: number
    width: number
    height: number
  }>
  stars: Array<{ id: string; x: number; y: number; radius: number }>
}

const readGravityFlipScene = (state: GravityFlipState): GravityFlipScene => ({
  gravity: state.gravity,
  distance: state.distance,
  worldSpeed: state.worldSpeed,
  player: { x: state.player.x, y: state.player.y, size: state.player.size },
  hazards: state.hazards.map(hazard => ({
    id: hazard.id,
    kind: hazard.kind,
    x: hazard.x,
    y: hazard.y,
    width: hazard.width,
    height: hazard.height,
  })),
  stars: state.stars.map(star => ({
    id: star.id,
    x: star.x,
    y: star.y,
    radius: star.radius,
  })),
})

const starPath = (x: number, y: number, radius: number): string => {
  const inner = radius * 0.45
  return (
    `M${x} ${y - radius}` +
    `L${x + inner * 0.588} ${y - inner * 0.809}` +
    `L${x + radius * 0.951} ${y - radius * 0.309}` +
    `L${x + inner * 0.951} ${y + inner * 0.309}` +
    `L${x + radius * 0.588} ${y + radius * 0.809}` +
    `L${x} ${y + inner}` +
    `L${x - radius * 0.588} ${y + radius * 0.809}` +
    `L${x - inner * 0.951} ${y + inner * 0.309}` +
    `L${x - radius * 0.951} ${y - radius * 0.309}` +
    `L${x - inner * 0.588} ${y - inner * 0.809}` +
    `L${x} ${y - radius}`
  )
}

export function GravityFlipBoard({ projected, game }: NativeGameViewProps) {
  const flip = game as GravityFlipGame
  const config = flip.getConfig()
  const hud = projected as unknown as GravityFlipHud
  const [scene, setScene] = useState<GravityFlipScene>(() =>
    readGravityFlipScene(flip.getState())
  )

  useGameLoop(flip, () => {
    setScene(readGravityFlipScene(flip.getState()))
  })

  const floorY = config.canvasHeight - config.corridorInset
  const playerRadius = scene.player.size / 2
  const playerPath =
    `M${scene.player.x} ${scene.player.y - playerRadius}` +
    `L${scene.player.x + playerRadius} ${scene.player.y}` +
    `L${scene.player.x} ${scene.player.y + playerRadius}` +
    `L${scene.player.x - playerRadius} ${scene.player.y}` +
    `L${scene.player.x} ${scene.player.y - playerRadius}`

  return (
    <View className="flex-1 gap-3 px-4 pb-4">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text
          testID="gf-gravity"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Gravity {hud.gravityLabel}
        </Text>
        <Text
          testID="gf-distance"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Distance {Math.floor(scene.distance)}
        </Text>
        <Text
          testID="gf-stars"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Stars {hud.stars}
        </Text>
        <Text
          testID="gf-flips"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Flips {hud.flips}
        </Text>
        <Text
          testID="gf-speed"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Speed {Math.round(scene.worldSpeed)}
        </Text>
      </View>
      <View
        testID="gf-board"
        className="w-full"
        style={{ aspectRatio: config.canvasWidth / config.canvasHeight }}
        accessible
        accessibilityLabel={`Gravity Flip corridor: gravity ${scene.gravity}, distance ${Math.floor(scene.distance)}, ${scene.hazards.length} hazards`}
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
            color={CORRIDOR_BACKGROUND}
          />
          <Rect
            x={0}
            y={0}
            width={config.canvasWidth}
            height={config.corridorInset}
            color={RAIL_FILL}
            opacity={0.95}
          />
          <Rect
            x={0}
            y={floorY}
            width={config.canvasWidth}
            height={config.corridorInset}
            color={RAIL_FILL}
            opacity={0.95}
          />
          <Rect
            x={0}
            y={config.corridorInset - 1}
            width={config.canvasWidth}
            height={2}
            color={RAIL_LINE}
            opacity={0.8}
          />
          <Rect
            x={0}
            y={floorY - 1}
            width={config.canvasWidth}
            height={2}
            color={RAIL_LINE}
            opacity={0.8}
          />
          {scene.hazards.map(hazard => {
            const descriptor = GRAVITY_FLIP_HAZARD_CATALOG[hazard.kind]
            if (descriptor.shape === 'gap') {
              return (
                <Rect
                  key={hazard.id}
                  x={hazard.x}
                  y={descriptor.surface === 'floor' ? hazard.y : 0}
                  width={hazard.width}
                  height={
                    descriptor.surface === 'floor'
                      ? config.canvasHeight - hazard.y
                      : hazard.y + hazard.height
                  }
                  color={CORRIDOR_BACKGROUND}
                />
              )
            }
            if (descriptor.shape === 'mover') {
              return (
                <Group key={hazard.id}>
                  <RoundedRect
                    x={hazard.x}
                    y={hazard.y}
                    width={hazard.width}
                    height={hazard.height}
                    r={8}
                    color={MOVER_FILL}
                    opacity={0.9}
                  />
                  <RoundedRect
                    x={hazard.x}
                    y={hazard.y}
                    width={hazard.width}
                    height={hazard.height}
                    r={8}
                    style="stroke"
                    strokeWidth={2}
                    color={MOVER_STROKE}
                  />
                </Group>
              )
            }
            const spikePath =
              descriptor.surface === 'floor'
                ? `M${hazard.x} ${hazard.y + hazard.height}` +
                  `L${hazard.x + hazard.width / 2} ${hazard.y}` +
                  `L${hazard.x + hazard.width} ${hazard.y + hazard.height}` +
                  `L${hazard.x} ${hazard.y + hazard.height}`
                : `M${hazard.x} ${hazard.y}` +
                  `L${hazard.x + hazard.width / 2} ${hazard.y + hazard.height}` +
                  `L${hazard.x + hazard.width} ${hazard.y}` +
                  `L${hazard.x} ${hazard.y}`
            return (
              <Group key={hazard.id}>
                <Path path={spikePath} color={SPIKE_FILL} opacity={0.9} />
                <Path
                  path={spikePath}
                  style="stroke"
                  strokeWidth={2}
                  color={SPIKE_STROKE}
                />
              </Group>
            )
          })}
          <Path path={playerPath} color={PLAYER_FILL} opacity={0.9} />
          <Path
            path={playerPath}
            style="stroke"
            strokeWidth={3}
            color={PLAYER_STROKE}
          />
          {scene.stars.map(star => (
            <Group key={star.id}>
              <Path
                path={starPath(star.x, star.y, star.radius)}
                color={STAR_FILL}
                opacity={0.95}
              />
              <Path
                path={starPath(star.x, star.y, star.radius)}
                style="stroke"
                strokeWidth={1.5}
                color={STAR_STROKE}
              />
            </Group>
          ))}
        </GameCanvas>
      </View>
      <Button
        variant="primary"
        accessibilityLabel="Flip gravity"
        accessibilityState={{ disabled: !hud.canFlip }}
        disabled={!hud.canFlip}
        onPress={() => flip.flipGravity()}
      >
        FLIP GRAVITY
      </Button>
    </View>
  )
}
