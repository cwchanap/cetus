import { Pressable, Text, View } from 'react-native'
import { Button } from '@cetus/ui'
import { Circle, Group, Path, Rect } from '@shopify/react-native-skia'
import type {
  Difficulty,
  Direction,
  TileType,
} from '@cetus/games/circuit-hacker/types'
import {
  DIFFICULTY_CONFIGS,
  getBaseConnectors,
  rotateConnectors,
} from '@cetus/games/circuit-hacker/utils'

import { GameCanvas } from '../canvas/GameCanvas'
import {
  CIRCUIT_HACKER_CELL_SIZE,
  type CircuitHackerCellSnapshot,
  type CircuitHackerController,
  type CircuitHackerProjection,
} from '../circuit-hacker/controller'
import type { NativeHandleGameViewProps } from '../registry'

const BACKGROUND = '#000a14'
const WIRE_OFF = 'rgba(51, 85, 119, 0.9)'
const WIRE_ON = 'rgba(34, 211, 238, 0.95)'
const SOURCE = '#22c55e'
const CORE_OFF = '#9333ea'
const CORE_ON = '#f472b6'
const BLOCKER = '#1e293b'
const CELL_FILL = 'rgba(0, 17, 34, 0.5)'
const CELL_BORDER = 'rgba(14, 165, 233, 0.15)'

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'expert']

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
}

const DIR_OFFSET: Record<Direction, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
}

const DIRECTION_LABEL: Record<Direction, string> = {
  N: 'north',
  E: 'east',
  S: 'south',
  W: 'west',
}

const TILE_TYPE_LABEL: Record<TileType, string> = {
  straight: 'Straight wire',
  elbow: 'Elbow wire',
  't-junction': 'T-junction wire',
  cross: 'Cross wire',
  source: 'Power source',
  core: 'Core',
  blocker: 'Blocker',
}

const connectorsOf = (cell: CircuitHackerCellSnapshot): Direction[] =>
  rotateConnectors(getBaseConnectors(cell.type), cell.orientation)

/**
 * Spoken tile description: the wire type, its current connector directions,
 * power and lock state are Skia-only shapes, so screen readers receive them
 * through the cell's accessibility hint/value instead. Rotation changes the
 * connector list, so the description stays truthful after every tap.
 */
const describeCell = (cell: CircuitHackerCellSnapshot): string => {
  const type = TILE_TYPE_LABEL[cell.type]
  if (cell.type === 'blocker') {
    return `${type}: no connectors, unpowered, locked`
  }
  const connectors = connectorsOf(cell).map(dir => DIRECTION_LABEL[dir])
  return `${type}: connectors ${
    connectors.length > 0 ? connectors.join(' and ') : 'none'
  }, ${cell.powered ? 'powered' : 'unpowered'}, ${
    cell.locked ? 'locked' : 'unlocked'
  }`
}

const cellValue = (cell: CircuitHackerCellSnapshot): string =>
  `${cell.powered ? 'Powered' : 'Unpowered'}${cell.locked ? ', locked' : ''}`

/** Cell hit label (1-based for screen readers). */
export const circuitCellLabel = (row: number, col: number): string =>
  `Rotate tile row ${row + 1} column ${col + 1}`

/**
 * Circuit Hacker native board (HPA-535 Stage 1). Renders the copied visible
 * grid with Skia and routes cell taps to the per-host controller binding —
 * the model itself stays in `@cetus/games`, generates its grid lazily on
 * Start and owns the countdown. Difficulty is pre-run only; the
 * controller rebuilds the model for a new run.
 */
export function CircuitHackerBoard({
  projected,
  binding,
}: NativeHandleGameViewProps) {
  const controller = binding as CircuitHackerController
  const scene = projected as unknown as CircuitHackerProjection
  const cell = CIRCUIT_HACKER_CELL_SIZE
  const logicalWidth = scene.cols * cell
  const logicalHeight = scene.rows * cell

  const offWires: string[] = []
  const onWires: string[] = []
  for (let row = 0; row < scene.cells.length; row++) {
    const cellsRow = scene.cells[row]
    for (let col = 0; col < cellsRow.length; col++) {
      const tile = cellsRow[col]
      if (tile.type === 'blocker') {
        continue
      }
      const cx = col * cell + cell / 2
      const cy = row * cell + cell / 2
      for (const dir of connectorsOf(tile)) {
        const { dx, dy } = DIR_OFFSET[dir]
        const path = `M${cx} ${cy}L${cx + dx * (cell / 2)} ${cy + dy * (cell / 2)}`
        ;(tile.powered ? onWires : offWires).push(path)
      }
    }
  }

  const boardSummary =
    scene.phase === 'idle'
      ? `Circuit Hacker board: ${scene.difficulty} difficulty, waiting to start`
      : `Circuit Hacker board: ${scene.poweredCores} of ${scene.cores} cores powered, ${scene.rotationsUsed} rotations used`

  return (
    <View className="flex-1 gap-3 px-4 pb-4">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text
          testID="circuit-core-count"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Cores {scene.poweredCores} / {scene.cores}
        </Text>
        <Text
          testID="circuit-rotations"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Rotations {scene.rotationsUsed}
        </Text>
        <Text
          testID="circuit-difficulty"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {DIFFICULTY_LABEL[scene.difficulty]}
        </Text>
      </View>

      <View
        testID="circuit-board"
        className="w-full"
        style={{ aspectRatio: logicalWidth / logicalHeight }}
      >
        <GameCanvas logicalWidth={logicalWidth} logicalHeight={logicalHeight}>
          <Rect
            x={0}
            y={0}
            width={logicalWidth}
            height={logicalHeight}
            color={BACKGROUND}
          />
          {scene.cells.map((cellsRow, row) =>
            cellsRow.map((tile, col) => (
              <Group key={`cell-${row}-${col}`}>
                <Rect
                  x={col * cell + 1}
                  y={row * cell + 1}
                  width={cell - 2}
                  height={cell - 2}
                  color={CELL_FILL}
                />
                <Rect
                  x={col * cell + 1}
                  y={row * cell + 1}
                  width={cell - 2}
                  height={cell - 2}
                  style="stroke"
                  strokeWidth={1}
                  color={CELL_BORDER}
                />
                {tile.type === 'blocker' ? (
                  <Rect
                    x={col * cell + 6}
                    y={row * cell + 6}
                    width={cell - 12}
                    height={cell - 12}
                    color={BLOCKER}
                  />
                ) : null}
              </Group>
            ))
          )}
          <Path
            path={offWires.join('')}
            style="stroke"
            strokeWidth={4}
            color={WIRE_OFF}
          />
          <Path
            path={onWires.join('')}
            style="stroke"
            strokeWidth={6}
            color={WIRE_ON}
          />
          {scene.cells.map((cellsRow, row) =>
            cellsRow.map((tile, col) => {
              if (tile.type === 'blocker') {
                return null
              }
              const cx = col * cell + cell / 2
              const cy = row * cell + cell / 2
              if (tile.type === 'source') {
                return (
                  <Circle
                    key={`node-${row}-${col}`}
                    cx={cx}
                    cy={cy}
                    r={cell * 0.18}
                    color={SOURCE}
                  />
                )
              }
              if (tile.type === 'core') {
                return (
                  <Circle
                    key={`node-${row}-${col}`}
                    cx={cx}
                    cy={cy}
                    r={cell * 0.18}
                    color={tile.powered ? CORE_ON : CORE_OFF}
                  />
                )
              }
              return (
                <Circle
                  key={`node-${row}-${col}`}
                  cx={cx}
                  cy={cy}
                  r={4}
                  color={tile.powered ? WIRE_ON : WIRE_OFF}
                />
              )
            })
          )}
        </GameCanvas>
        {/*
         * One transparent Pressable per cell: a plain tap is a tile
         * rotation, and each cell stays an individually labelled screen
         * reader target instead of an unlabelled canvas.
         */}
        {scene.cells.map((cellsRow, row) =>
          cellsRow.map((tile, col) => {
            const disabled = !scene.canRotate || tile.locked
            return (
              <Pressable
                key={`hit-${row}-${col}`}
                testID={`circuit-cell-${row}-${col}`}
                accessibilityRole="button"
                accessibilityLabel={circuitCellLabel(row, col)}
                accessibilityHint={describeCell(tile)}
                accessibilityValue={{ text: cellValue(tile) }}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => controller.rotateTile(row, col)}
                style={{
                  position: 'absolute',
                  left: `${(col / scene.cols) * 100}%`,
                  top: `${(row / scene.rows) * 100}%`,
                  width: `${100 / scene.cols}%`,
                  height: `${100 / scene.rows}%`,
                }}
              />
            )
          })
        )}
      </View>

      <Text
        className="font-sans text-xs text-cetus-ink-muted"
        accessibilityLabel={boardSummary}
      >
        Tap tiles to rotate the wires until every core is powered.
      </Text>

      {scene.startError ? (
        <Text
          testID="circuit-start-error"
          accessibilityRole="alert"
          className="font-sans text-sm text-red-400"
        >
          {scene.startError}
        </Text>
      ) : null}

      <View
        className="flex-row flex-wrap gap-2"
        accessibilityLabel="Circuit difficulty"
      >
        {DIFFICULTY_ORDER.map(difficulty => {
          const selected = scene.difficulty === difficulty
          const disabled = !scene.canSelectDifficulty
          return (
            <Button
              key={difficulty}
              testID={`circuit-difficulty-${difficulty}`}
              variant={selected ? 'primary' : 'outline'}
              accessibilityLabel={`Select difficulty ${difficulty}`}
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              className="min-w-[46%] flex-1"
              onPress={() => controller.selectDifficulty(difficulty)}
            >
              {`${DIFFICULTY_LABEL[difficulty]} · ${DIFFICULTY_CONFIGS[difficulty].duration}s`}
            </Button>
          )
        })}
      </View>

      {scene.phase === 'running' ? (
        <Button
          variant="ghost"
          accessibilityLabel="Stop run"
          onPress={() => controller.stop()}
        >
          Stop run
        </Button>
      ) : null}
    </View>
  )
}
