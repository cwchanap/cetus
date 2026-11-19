import { useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Path, Rect } from '@shopify/react-native-skia'
import { Button } from '@cetus/ui'
import type { TetrisGame } from '@cetus/games/tetris/TetrisGame'
import type { Piece, TetrisState } from '@cetus/games/tetris/types'

import { GameCanvas } from '../canvas/GameCanvas'
import { cssColor } from '../canvas/cssColor'
import { swipeDirection } from '../canvas/swipeDirection'
import { useGameLoop } from '../canvas/useGameLoop'
import type { NativeGameViewProps } from '../registry'

interface TetrisHud {
  level: number
  lines: number
  holdUsed: boolean
  canAct: boolean
}

interface ScenePiece {
  type: string
  shape: number[][]
  color: number
  x: number
  y: number
}

interface TetrisScene {
  cells: Array<Array<number | null>>
  piece: ScenePiece | null
  next: ScenePiece | null
  held: ScenePiece | null
}

const copyPiece = (piece: Piece | null): ScenePiece | null =>
  piece === null
    ? null
    : {
        type: piece.type,
        shape: piece.shape.map(row => [...row]),
        color: piece.color,
        x: piece.x,
        y: piece.y,
      }

// Copied snapshot of everything the field draws: the model mutates board
// cells and the falling piece in place, so board references would freeze.
const readScene = (state: TetrisState): TetrisScene => ({
  cells: state.board.map(row => [...row]),
  piece: copyPiece(state.currentPiece),
  next: copyPiece(state.nextPiece),
  held: copyPiece(state.heldPiece),
})

const describeTetrisBoard = (scene: TetrisScene, hud: TetrisHud): string => {
  const placed = scene.cells.reduce(
    (total, row) => total + row.filter(cell => cell !== null).length,
    0
  )
  const parts = ['Tetris board, 10 by 20.']
  if (scene.piece === null && placed === 0) {
    parts.push('Waiting to start.')
  } else {
    parts.push(
      `Level ${hud.level}, ${hud.lines} lines cleared, ${placed} blocks placed.`
    )
    if (scene.piece) {
      parts.push(
        `${scene.piece.type} piece at row ${scene.piece.y + 1}, column ${
          scene.piece.x + 1
        }.`
      )
    }
  }
  parts.push(`Next ${scene.next?.type ?? 'none'}.`)
  parts.push(
    `Hold ${scene.held?.type ?? 'empty'}${
      hud.holdUsed ? ' (used this piece)' : ''
    }.`
  )
  return parts.join(' ')
}

const PREVIEW_CELL = 12

function PiecePreview({
  label,
  piece,
  testID,
}: {
  label: string
  piece: ScenePiece | null
  testID: string
}) {
  const color = piece === null ? 'transparent' : cssColor(piece.color)
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${piece ? `piece ${piece.type}` : 'empty'}`}
      className="items-center gap-1"
    >
      <Text testID={testID} className="font-sans text-xs text-cetus-ink-muted">
        {`${label} ${piece?.type ?? '—'}`}
      </Text>
      <View className="items-center justify-center" style={styles.preview}>
        {(piece?.shape ?? []).map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} className="flex-row">
            {row.map((filled, colIndex) => (
              <View
                key={`cell-${colIndex}`}
                style={{
                  width: PREVIEW_CELL,
                  height: PREVIEW_CELL,
                  backgroundColor: filled ? color : 'transparent',
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

const CONTROLS: ReadonlyArray<{
  label: string
  text: string
  action: (game: TetrisGame) => void
  hold?: boolean
}> = [
  { label: 'Move left', text: '←', action: game => game.moveLeft() },
  { label: 'Move right', text: '→', action: game => game.moveRight() },
  { label: 'Soft drop', text: '↓', action: game => game.softDrop() },
  { label: 'Rotate piece', text: '↻ Rotate', action: game => game.rotate() },
  {
    label: 'Hold piece',
    text: 'Hold',
    action: game => game.holdPiece(),
    hold: true,
  },
  { label: 'Hard drop', text: '⇓ Hard drop', action: game => game.hardDrop() },
]

/**
 * Tetris native board (HPA-535 Stage 4): Skia 10×20 field + next/hold
 * previews over a copied local scene, with the model's own `Date.now()`
 * gravity driven by the shared frame loop. One Pan commits at most one
 * command per completed gesture (cancelled and stale-run gestures are
 * dropped); every swipe has a labelled control equivalent and the board
 * carries a screen-reader description of the piece, next, hold and stack.
 */
export function TetrisBoard({ projected, game }: NativeGameViewProps) {
  const tetris = game as TetrisGame
  const hud = projected as unknown as TetrisHud
  const config = tetris.getConfig()
  const block = config.blockSize
  const boardWidth = config.boardWidth * block
  const boardHeight = config.boardHeight * block
  const [scene, setScene] = useState<TetrisScene>(() =>
    readScene(tetris.getState())
  )
  // Run id captured at gesture begin: a finalize that lands after a reset or
  // replay must not move the replacement run's piece.
  const gestureRunRef = useRef<number | null>(null)

  useGameLoop(tetris, () => {
    const state = tetris.getState()
    if (!state.needsRedraw) {
      return
    }
    setScene(readScene(state))
    tetris.markRendered()
  })

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          gestureRunRef.current = tetris.getRunId()
        })
        // onFinalize runs for completed AND cancelled gestures; clearing the
        // ref makes a duplicate finalize a no-op and success=false a no-op.
        .onFinalize((event, success) => {
          const runId = gestureRunRef.current
          gestureRunRef.current = null
          if (!success || runId === null || runId !== tetris.getRunId()) {
            return
          }
          const direction = swipeDirection(
            event.translationX ?? 0,
            event.translationY ?? 0
          )
          if (direction === 'left') {
            tetris.moveLeft()
          } else if (direction === 'right') {
            tetris.moveRight()
          } else if (direction === 'down') {
            tetris.softDrop()
          }
        }),
    [tetris]
  )

  const gridPath = useMemo(() => {
    const segments: string[] = []
    for (let column = 0; column <= config.boardWidth; column += 1) {
      segments.push(`M${column * block} 0L${column * block} ${boardHeight}`)
    }
    for (let row = 0; row <= config.boardHeight; row += 1) {
      segments.push(`M0 ${row * block}L${boardWidth} ${row * block}`)
    }
    return segments.join('')
  }, [block, boardHeight, boardWidth, config.boardHeight, config.boardWidth])

  const placedCells: Array<{ x: number; y: number; color: number }> = []
  for (let row = 0; row < scene.cells.length; row += 1) {
    for (let column = 0; column < scene.cells[row].length; column += 1) {
      const color = scene.cells[row][column]
      if (color !== null) {
        placedCells.push({ x: column, y: row, color })
      }
    }
  }
  const pieceCells: Array<{ x: number; y: number; color: number }> = []
  if (scene.piece !== null) {
    const piece = scene.piece
    for (let row = 0; row < piece.shape.length; row += 1) {
      for (let column = 0; column < piece.shape[row].length; column += 1) {
        if (piece.shape[row][column] && piece.y + row >= 0) {
          pieceCells.push({
            x: piece.x + column,
            y: piece.y + row,
            color: piece.color,
          })
        }
      }
    }
  }

  return (
    <View className="flex-1 gap-3 px-4 pb-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text
          testID="tetris-level"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {`Level ${hud.level}`}
        </Text>
        <Text
          testID="tetris-lines"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {`Lines ${hud.lines}`}
        </Text>
      </View>
      <View className="flex-row items-start gap-3">
        <GestureDetector gesture={pan}>
          <View
            testID="tetris-board"
            style={styles.board}
            accessible
            accessibilityLabel={describeTetrisBoard(scene, hud)}
          >
            <GameCanvas logicalWidth={boardWidth} logicalHeight={boardHeight}>
              <Rect
                x={0}
                y={0}
                width={boardWidth}
                height={boardHeight}
                color={cssColor(config.backgroundColor)}
              />
              <Path
                path={gridPath}
                style="stroke"
                strokeWidth={1}
                color={cssColor(config.gridColor, 0.35)}
              />
              {placedCells.map(cell => (
                <Rect
                  key={`placed-${cell.y}-${cell.x}`}
                  x={cell.x * block + 1}
                  y={cell.y * block + 1}
                  width={block - 2}
                  height={block - 2}
                  color={cssColor(cell.color)}
                />
              ))}
              {pieceCells.map(cell => (
                <Rect
                  key={`piece-${cell.y}-${cell.x}`}
                  x={cell.x * block + 1}
                  y={cell.y * block + 1}
                  width={block - 2}
                  height={block - 2}
                  color={cssColor(cell.color)}
                />
              ))}
            </GameCanvas>
          </View>
        </GestureDetector>
        <View className="flex-1 gap-2">
          <PiecePreview label="Next" piece={scene.next} testID="tetris-next" />
          <PiecePreview label="Hold" piece={scene.held} testID="tetris-hold" />
        </View>
      </View>
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityLabel="Tetris controls"
      >
        {CONTROLS.map(({ label, text, action, hold }) => {
          const disabled = !hud.canAct || (hold === true && hud.holdUsed)
          return (
            <Button
              key={label}
              variant="outline"
              size="sm"
              accessibilityLabel={label}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => action(tetris)}
            >
              {text}
            </Button>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  board: {
    width: '60%',
    aspectRatio: 0.5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  preview: {
    minHeight: PREVIEW_CELL * 2,
  },
})
