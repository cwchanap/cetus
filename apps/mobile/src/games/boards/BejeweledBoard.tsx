import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Rect, RoundedRect } from '@shopify/react-native-skia'
import type { BejeweledGame } from '@cetus/games/bejeweled/game'
import {
  JEWEL_COLORS,
  type BejeweledAnimator,
  type JewelType,
  type Position,
} from '@cetus/games/bejeweled/types'

import {
  GameCanvas,
  toGamePoint,
  type GameCanvasGeometry,
} from '../canvas/GameCanvas'
import { cssColor } from '../canvas/cssColor'
import { swipeDirection } from '../canvas/swipeDirection'
import type { NativeGameViewProps } from '../registry'

interface BejeweledProjection {
  cells: Array<Array<JewelType | null>>
  selected: Position | null
  movesMade: number
  combo: number
  isAnimating: boolean
  phase: 'idle' | 'paused' | 'running' | 'finished'
  canAct: boolean
}

type FeedbackKind = 'swap' | 'swap-back' | 'clear'

interface Feedback {
  kind: FeedbackKind
  cells: Position[]
  runId: number
}

const CELL = 40
const GEM_INSET = 5
const MIN_BOARD = 160
const SCREEN_PADDING = 16
// Static reserve under the board for the HUD, one status line and padding.
// Enlarged text can exceed it; the ScrollView is the fallback then.
const RESERVED_HEIGHT = 150
// Web "swift" pace parity: the renderer plays the model's nominal duration
// at a quarter speed, keeping cascades responsive on a phone.
const FEEDBACK_SCALE = 0.25
const FEEDBACK_FLOOR_MS = 60
const SWAP_MS = 500
const CLEAR_MS = 1000

const BOARD_BG = 0x070b16
const CELL_FILL = 0x0b1020
const SELECTED_COLOR = 0x00e5ff
const SWAP_COLOR = 0x4dfff2
const SWAP_BACK_COLOR = 0xffc24a
const CLEAR_OVERLAY = 'rgba(255, 255, 255, 0.55)'

/** Detached animator: resolves immediately and never touches React state. */
const INERT_ANIMATOR: BejeweledAnimator = {
  animateSwap: () => Promise.resolve(),
  animateSwapBack: () => Promise.resolve(),
  animateClear: () => Promise.resolve(),
}

const cellLabel = (
  row: number,
  col: number,
  jewel: JewelType | null,
  selected: boolean
): string =>
  `Row ${row + 1}, column ${col + 1}, ${jewel ?? 'empty'} gem${
    selected ? ', selected' : ''
  }`

/**
 * Bejeweled native board (HPA-535 Stage 4): Skia 8×8 gem grid over the
 * model's copied visible state. Taps select cells and adjacent swipes swap
 * the two gems through `clickCell`; match detection, cascades and scoring
 * all stay in `BejeweledGame`. The board installs a modest animator that
 * only draws a swap/swap-back ring or a fading clear overlay for the
 * model's own await windows — no frame loop drives the rules — and drops
 * input while `isAnimating`. A reset starts a new run id, which discards
 * stale overlay state; unmount swaps in an inert animator and settles any
 * pending waits. Every cell is a labelled, selectable control, the status
 * line announces moves/selection, and the square board fits the measured
 * viewport height with the ScrollView as the fallback.
 */
export function BejeweledBoard({ projected, game }: NativeGameViewProps) {
  const view = projected as unknown as BejeweledProjection
  const bejeweled = game as BejeweledGame
  const rows = view.cells.length
  const cols = view.cells[0]?.length ?? 0
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [viewport, setViewport] = useState<{
    width: number
    height: number
  } | null>(null)
  const geometryRef = useRef<GameCanvasGeometry | null>(null)
  // Run id captured at gesture begin: a finalize that lands after a reset or
  // replay must not command the replacement run.
  const gestureRunRef = useRef<number | null>(null)
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null)

  const boardSize =
    viewport === null
      ? null
      : Math.max(
          MIN_BOARD,
          Math.min(
            viewport.width - SCREEN_PADDING * 2,
            viewport.height - RESERVED_HEIGHT
          )
        )

  const onViewport = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setViewport(current =>
      current !== null && current.width === width && current.height === height
        ? current
        : { width, height }
    )
  }

  // Modest animator feedback for the model's own async swap/cascade chain.
  // The model owns timing and rules: each await settles after a shortened
  // display window, and a reset's new run id drops any overlay it started.
  useEffect(() => {
    let disposed = false
    const pending = new Set<() => void>()
    const wait = (durationMs: number) =>
      new Promise<void>(resolve => {
        const handle: { timer?: ReturnType<typeof setTimeout> } = {}
        const finish = () => {
          clearTimeout(handle.timer)
          pending.delete(finish)
          resolve()
        }
        handle.timer = setTimeout(
          finish,
          Math.max(FEEDBACK_FLOOR_MS, Math.round(durationMs * FEEDBACK_SCALE))
        )
        pending.add(finish)
      })
    const show = (
      kind: FeedbackKind,
      cells: Position[],
      durationMs: number
    ) => {
      const entry: Feedback = {
        kind,
        cells: cells.map(cell => ({ ...cell })),
        runId: bejeweled.getRunId(),
      }
      if (!disposed) {
        setFeedback(entry)
      }
      return { entry, done: wait(durationMs) }
    }
    const settle = async (entry: Feedback, done: Promise<void>) => {
      await done
      if (!disposed) {
        setFeedback(current => (current === entry ? null : current))
      }
    }
    const animator: BejeweledAnimator = {
      animateSwap: (a, b, _state, durationMs = SWAP_MS) => {
        if (disposed) {
          return Promise.resolve()
        }
        const { entry, done } = show('swap', [a, b], durationMs)
        return settle(entry, done)
      },
      animateSwapBack: (a, b, _state, durationMs = SWAP_MS) => {
        if (disposed) {
          return Promise.resolve()
        }
        const { entry, done } = show('swap-back', [a, b], durationMs)
        return settle(entry, done)
      },
      animateClear: (cells, _state, durationMs = CLEAR_MS) => {
        if (disposed) {
          return Promise.resolve()
        }
        // L/T matches repeat their intersection cell in two runs.
        const unique: Position[] = []
        const seen = new Set<string>()
        for (const cell of cells) {
          const key = `${cell.row}:${cell.col}`
          if (!seen.has(key)) {
            seen.add(key)
            unique.push({ ...cell })
          }
        }
        const { entry, done } = show('clear', unique, durationMs)
        return settle(entry, done)
      },
    }
    bejeweled.setAnimator(animator)
    const onStateChange = () => {
      const runId = bejeweled.getRunId()
      setFeedback(current =>
        current !== null && current.runId !== runId ? null : current
      )
    }
    bejeweled.on('state-change', onStateChange)
    return () => {
      disposed = true
      bejeweled.off('state-change', onStateChange)
      bejeweled.setAnimator(INERT_ANIMATOR)
      // Settle awaits so a mid-animation teardown never leaks a pending
      // model promise; the model's own run check then discards the swap.
      for (const finish of [...pending]) {
        finish()
      }
    }
  }, [bejeweled])

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(event => {
          gestureRunRef.current = bejeweled.getRunId()
          gestureStartRef.current = { x: event.x, y: event.y }
        })
        // onFinalize runs for completed AND cancelled gestures; clearing the
        // refs makes a duplicate finalize a no-op and success=false a no-op.
        .onFinalize((event, success) => {
          const runId = gestureRunRef.current
          const start = gestureStartRef.current
          gestureRunRef.current = null
          gestureStartRef.current = null
          if (
            !success ||
            runId === null ||
            start === null ||
            runId !== bejeweled.getRunId()
          ) {
            return
          }
          const state = bejeweled.getState()
          if (!state.isActive || state.isPaused || state.isAnimating) {
            return
          }
          const direction = swipeDirection(
            event.translationX ?? 0,
            event.translationY ?? 0
          )
          const geometry = geometryRef.current
          if (direction === null || geometry === null) {
            return
          }
          const point = toGamePoint(start.x, start.y, geometry)
          if (point === null) {
            return
          }
          const row = Math.floor(point.y / CELL)
          const col = Math.floor(point.x / CELL)
          const target =
            direction === 'left'
              ? { row, col: col - 1 }
              : direction === 'right'
                ? { row, col: col + 1 }
                : direction === 'up'
                  ? { row: row - 1, col }
                  : { row: row + 1, col }
          if (
            row < 0 ||
            row >= rows ||
            col < 0 ||
            col >= cols ||
            target.row < 0 ||
            target.row >= rows ||
            target.col < 0 ||
            target.col >= cols
          ) {
            return
          }
          const selected = state.selected
          const originSelected =
            selected !== null && selected.row === row && selected.col === col
          if (!originSelected) {
            bejeweled.clickCell(row, col)
          }
          bejeweled.clickCell(target.row, target.col)
        }),
    [bejeweled, rows, cols]
  )

  const status =
    view.phase === 'finished'
      ? 'Run complete'
      : view.phase === 'paused'
        ? 'Paused'
        : view.phase !== 'running'
          ? 'Waiting to start'
          : view.isAnimating
            ? view.combo > 1
              ? `Chain ×${view.combo}`
              : 'Swapping'
            : view.selected !== null
              ? `Selected row ${view.selected.row + 1} column ${
                  view.selected.col + 1
                }`
              : 'Select two adjacent gems'

  const boardSummary = [
    `Bejeweled board, ${rows} by ${cols}.`,
    `Moves ${view.movesMade}.`,
    view.isAnimating ? `Chain ${Math.max(view.combo, 1)} in motion.` : null,
    view.selected !== null
      ? `Selected row ${view.selected.row + 1} column ${view.selected.col + 1}.`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ')

  const baseCells: ReactNode[] = []
  const gemCells: ReactNode[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      baseCells.push(
        <RoundedRect
          key={`cell-${row}-${col}`}
          x={col * CELL + 1}
          y={row * CELL + 1}
          width={CELL - 2}
          height={CELL - 2}
          r={6}
          color={cssColor(CELL_FILL)}
        />
      )
      const jewel = view.cells[row]?.[col] ?? null
      if (jewel !== null) {
        gemCells.push(
          <RoundedRect
            key={`gem-${row}-${col}`}
            x={col * CELL + GEM_INSET}
            y={row * CELL + GEM_INSET}
            width={CELL - GEM_INSET * 2}
            height={CELL - GEM_INSET * 2}
            r={4}
            color={cssColor(JEWEL_COLORS[jewel])}
          />
        )
      }
    }
  }

  // A reset/replay replaces the run; never paint a superseded run's overlay.
  const visibleFeedback =
    feedback !== null && feedback.runId === bejeweled.getRunId()
      ? feedback
      : null

  return (
    <ScrollView
      testID="bejeweled-scroll"
      className="flex-1"
      contentContainerStyle={styles.content}
      onLayout={onViewport}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text
          testID="bejeweled-moves"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {`Moves ${view.movesMade}`}
        </Text>
        <Text
          testID="bejeweled-status"
          accessibilityLabel={boardSummary}
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {status}
        </Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          testID="bejeweled-board"
          style={[
            styles.board,
            boardSize === null
              ? styles.boardFluid
              : { width: boardSize, height: boardSize },
          ]}
        >
          <GameCanvas
            logicalWidth={cols * CELL}
            logicalHeight={rows * CELL}
            geometryRef={geometryRef}
          >
            <Rect
              x={0}
              y={0}
              width={cols * CELL}
              height={rows * CELL}
              color={cssColor(BOARD_BG)}
            />
            {baseCells}
            {gemCells}
            {view.selected !== null ? (
              <RoundedRect
                key="selection"
                x={view.selected.col * CELL + 2}
                y={view.selected.row * CELL + 2}
                width={CELL - 4}
                height={CELL - 4}
                r={6}
                style="stroke"
                strokeWidth={3}
                color={cssColor(SELECTED_COLOR)}
              />
            ) : null}
            {visibleFeedback !== null
              ? visibleFeedback.cells.map((cell, index) =>
                  visibleFeedback.kind === 'clear' ? (
                    <RoundedRect
                      key={`clear-${cell.row}-${cell.col}-${index}`}
                      x={cell.col * CELL + 3}
                      y={cell.row * CELL + 3}
                      width={CELL - 6}
                      height={CELL - 6}
                      r={6}
                      color={CLEAR_OVERLAY}
                    />
                  ) : (
                    <RoundedRect
                      key={`${visibleFeedback.kind}-${cell.row}-${cell.col}-${index}`}
                      x={cell.col * CELL + 2}
                      y={cell.row * CELL + 2}
                      width={CELL - 4}
                      height={CELL - 4}
                      r={6}
                      style="stroke"
                      strokeWidth={3}
                      color={cssColor(
                        visibleFeedback.kind === 'swap'
                          ? SWAP_COLOR
                          : SWAP_BACK_COLOR
                      )}
                    />
                  )
                )
              : null}
          </GameCanvas>
          {view.cells.map((row, rowIndex) =>
            row.map((jewel, colIndex) => {
              const selected =
                view.selected !== null &&
                view.selected.row === rowIndex &&
                view.selected.col === colIndex
              return (
                <Pressable
                  key={`control-${rowIndex}-${colIndex}`}
                  testID={`bejeweled-cell-${rowIndex}-${colIndex}`}
                  accessibilityRole="button"
                  accessibilityLabel={cellLabel(
                    rowIndex,
                    colIndex,
                    jewel,
                    selected
                  )}
                  accessibilityState={{
                    selected,
                    disabled: !view.canAct,
                  }}
                  disabled={!view.canAct}
                  onPress={() => bejeweled.clickCell(rowIndex, colIndex)}
                  style={{
                    position: 'absolute',
                    left: `${(colIndex / cols) * 100}%`,
                    top: `${(rowIndex / rows) * 100}%`,
                    width: `${100 / cols}%`,
                    height: `${100 / rows}%`,
                  }}
                />
              )
            })
          )}
        </View>
      </GestureDetector>
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
    aspectRatio: 1,
  },
})
