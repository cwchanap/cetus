import { useCallback, useMemo } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useRemoteData } from '@cetus/app-core'
import { Button } from '@cetus/ui'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Circle, Group, Rect } from '@shopify/react-native-skia'
import { createIceSlideDailyCompetitionKey } from '@cetus/games/ice-slide/daily'
import type { CellType, Direction } from '@cetus/games/ice-slide/types'
import { GameID, getGameById } from '@cetus/shared/games'
import type { LeaderboardEntryResponse } from '@cetus/shared/api-dto'

import {
  EmptyBoard,
  isSingleBoard,
  LeaderboardError,
  LeaderboardLoading,
  LeaderboardRow,
  useRefetchOnFocus,
} from '../../lib/leaderboard'
import { GameCanvas } from '../canvas/GameCanvas'
import {
  ICE_SLIDE_DAILY_LEADERBOARD_LIMIT,
  ICE_SLIDE_MODES,
  type IceSlideController,
  type IceSlideProjection,
} from '../ice-slide/controller'
import type { NativeHandleGameViewProps } from '../registry'

/** Logical pixels per grid cell; the canvas letterboxes to the screen. */
export const ICE_SLIDE_CELL_SIZE = 40

/** Minimum drag distance before a pan counts as a directional slide. */
const SWIPE_THRESHOLD = 24

const BACKGROUND = '#020617'
const CELL_BORDER = 'rgba(56, 189, 248, 0.18)'
const PLAYER = '#fbbf24'

const CELL_COLORS: Record<CellType, string> = {
  wall: '#0b1220',
  ice: '#1e3a5f',
  start: '#22d3ee',
  goal: '#4ade80',
  rock: '#475569',
  hazard: '#ef4444',
  crystal: '#67e8f9',
  snow: '#e2e8f0',
  fragile: '#93c5fd',
  collapsed: '#1e293b',
}

const MODE_LABEL: Record<IceSlideProjection['mode'], string> = {
  campaign: 'Campaign',
  daily: 'Daily',
  expedition: 'Expedition',
}

const DIRECTION_CONTROLS: ReadonlyArray<{
  direction: Direction
  label: string
}> = [
  { direction: 'N', label: 'Slide north' },
  { direction: 'W', label: 'Slide west' },
  { direction: 'S', label: 'Slide south' },
  { direction: 'E', label: 'Slide east' },
]

const ICE_SLIDE_GAME = getGameById(GameID.ICE_SLIDE)

/**
 * Resolve the app's cookie-backed client only when a Daily board loads.
 * A static import would pull the auth stack into every consumer of the game
 * registry (hub, native tests); the lazy `require` keeps Jest's module mock
 * in the loop, which a native `import()` would bypass.
 */
const loadApi = (): typeof import('../../lib/api') => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../lib/api') as typeof import('../../lib/api')
}

const swipeDirection = (
  translationX: number,
  translationY: number
): Direction | null => {
  const dx = Math.abs(translationX)
  const dy = Math.abs(translationY)
  if (Math.max(dx, dy) < SWIPE_THRESHOLD) {
    return null
  }
  if (dx > dy) {
    return translationX > 0 ? 'E' : 'W'
  }
  return translationY > 0 ? 'S' : 'N'
}

/**
 * Ice Slide native board (HPA-535 Stage 3). Draws the copied cell grid with
 * Skia and routes swipes plus the labelled direction pad through the
 * per-host controller; the model owns physics, scoring and the run clock.
 * The mode chooser is pre-run only, Stop is board-local, and the Daily
 * panel reuses the shared leaderboard kit with a run-keyed query cache.
 */
export function IceSlideBoard({
  projected,
  binding,
}: NativeHandleGameViewProps) {
  const controller = binding as IceSlideController
  const scene = projected as unknown as IceSlideProjection
  const playing = scene.status === 'playing'
  const logicalWidth = scene.cols * ICE_SLIDE_CELL_SIZE
  const logicalHeight = scene.rows * ICE_SLIDE_CELL_SIZE

  const competitionKey =
    scene.mode === 'daily' && scene.dailyDateKey !== null
      ? createIceSlideDailyCompetitionKey(scene.dailyDateKey)
      : null
  const dailyEnabled = scene.mode === 'daily' && competitionKey !== null

  const loadDaily = useCallback(
    async (signal: AbortSignal): Promise<LeaderboardEntryResponse[]> => {
      if (competitionKey === null) {
        return []
      }
      const { api } = loadApi()
      const response = await api.getLeaderboard(
        {
          gameId: GameID.ICE_SLIDE,
          mode: 'daily',
          competitionKey,
          limit: ICE_SLIDE_DAILY_LEADERBOARD_LIMIT,
        },
        { signal }
      )
      if (!isSingleBoard(response)) {
        throw new Error('Unexpected leaderboard response shape')
      }
      return response.leaderboard
    },
    [competitionKey]
  )
  const {
    data: dailyEntries,
    loading,
    error,
    refresh,
  } = useRemoteData(
    loadDaily,
    ['leaderboard', GameID.ICE_SLIDE, 'daily', competitionKey ?? ''],
    dailyEnabled
  )
  useRefetchOnFocus(refresh)

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        // A cancelled pan must never move the player: commit on END only.
        .onFinalize((event, success) => {
          if (!success) {
            return
          }
          const direction = swipeDirection(
            event.translationX ?? 0,
            event.translationY ?? 0
          )
          if (direction !== null) {
            controller.move(direction)
          }
        }),
    [controller]
  )

  const summary =
    scene.rows === 0
      ? `Ice Slide board: ${MODE_LABEL[scene.mode]}, waiting to start`
      : `Ice Slide board: stage ${scene.level} of ${scene.levelsTotal}, ${
          scene.stageName
        }, row ${scene.player.row + 1} column ${scene.player.col + 1}, ${
          scene.moves
        } moves`

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        gap: 12,
        paddingHorizontal: 16,
        paddingBottom: 24,
      }}
    >
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text
          testID="ice-mode"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {MODE_LABEL[scene.mode]}
        </Text>
        <Text
          testID="ice-stage"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {scene.rows === 0
            ? 'Stage –'
            : `Stage ${scene.level} / ${scene.levelsTotal} · ${scene.stageName}`}
        </Text>
        <Text
          testID="ice-moves"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {scene.rows === 0
            ? 'Moves 0'
            : `Moves ${scene.moves} · Par ${scene.parMoves}`}
        </Text>
        <Text
          testID="ice-crystals"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          Crystals {scene.crystals}
        </Text>
      </View>

      <View
        className="flex-row flex-wrap gap-2"
        accessibilityLabel="Ice Slide mode"
      >
        {ICE_SLIDE_MODES.map(mode => {
          const selected = scene.mode === mode
          const disabled = !scene.canChooseMode
          return (
            <Button
              key={mode}
              testID={`ice-mode-${mode}`}
              variant={selected ? 'primary' : 'outline'}
              size="sm"
              accessibilityLabel={`Select mode ${mode}`}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              className="min-w-[30%] flex-1"
              onPress={() => controller.selectMode(mode)}
            >
              {MODE_LABEL[mode]}
            </Button>
          )
        })}
      </View>

      {scene.startError ? (
        <Text
          testID="ice-start-error"
          accessibilityRole="alert"
          className="font-sans text-sm text-red-400"
        >
          {scene.startError}
        </Text>
      ) : null}

      {scene.mode === 'daily' && scene.dailyDateKey !== null ? (
        <View className="gap-2">
          <Text
            testID="ice-daily-date"
            className="font-sans text-sm text-cetus-ink-muted"
          >
            Daily run · {scene.dailyDateKey} UTC
          </Text>
          <View testID="ice-daily-leaderboard" className="gap-2">
            {dailyEntries === undefined ? (
              loading ? (
                <LeaderboardLoading />
              ) : (
                <LeaderboardError
                  error={error ?? new Error('Leaderboard request failed')}
                  onRetry={refresh}
                />
              )
            ) : dailyEntries.length === 0 ? (
              ICE_SLIDE_GAME ? (
                <EmptyBoard game={ICE_SLIDE_GAME} />
              ) : null
            ) : (
              dailyEntries.map(entry => (
                <LeaderboardRow
                  key={`${entry.rank}-${entry.username ?? entry.name}`}
                  entry={entry}
                />
              ))
            )}
          </View>
        </View>
      ) : null}

      {scene.mode === 'expedition' ? (
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <Text
            testID="ice-seed"
            className="font-sans text-sm text-cetus-ink-muted"
          >
            Seed {scene.seed ?? '—'}
          </Text>
          <Text
            testID="ice-stars"
            className="font-sans text-sm text-cetus-ink-muted"
          >
            Stars {scene.starsEarned} / {scene.starsPossible}
          </Text>
        </View>
      ) : null}

      {scene.objectiveLabels.length > 0 ? (
        <Text
          testID="ice-objectives"
          className="font-sans text-xs text-cetus-ink-muted"
        >
          {`Bonus: ${scene.objectiveLabels.join(' · ')}`}
        </Text>
      ) : null}

      {scene.rows > 0 ? (
        <GestureDetector gesture={pan}>
          <View
            testID="ice-board"
            className="w-full"
            style={{ aspectRatio: logicalWidth / logicalHeight }}
            accessible
            accessibilityLabel={summary}
          >
            <GameCanvas
              logicalWidth={logicalWidth}
              logicalHeight={logicalHeight}
            >
              <Rect
                x={0}
                y={0}
                width={logicalWidth}
                height={logicalHeight}
                color={BACKGROUND}
              />
              {scene.grid.map((row, rowIndex) =>
                row.map((cell, colIndex) => (
                  <Group key={`cell-${rowIndex}-${colIndex}`}>
                    <Rect
                      x={colIndex * ICE_SLIDE_CELL_SIZE + 1}
                      y={rowIndex * ICE_SLIDE_CELL_SIZE + 1}
                      width={ICE_SLIDE_CELL_SIZE - 2}
                      height={ICE_SLIDE_CELL_SIZE - 2}
                      color={CELL_COLORS[cell]}
                    />
                    <Rect
                      x={colIndex * ICE_SLIDE_CELL_SIZE + 1}
                      y={rowIndex * ICE_SLIDE_CELL_SIZE + 1}
                      width={ICE_SLIDE_CELL_SIZE - 2}
                      height={ICE_SLIDE_CELL_SIZE - 2}
                      style="stroke"
                      strokeWidth={1}
                      color={CELL_BORDER}
                    />
                  </Group>
                ))
              )}
              <Circle
                cx={(scene.player.col + 0.5) * ICE_SLIDE_CELL_SIZE}
                cy={(scene.player.row + 0.5) * ICE_SLIDE_CELL_SIZE}
                r={ICE_SLIDE_CELL_SIZE * 0.3}
                color={PLAYER}
              />
            </GameCanvas>
          </View>
        </GestureDetector>
      ) : (
        <Text className="font-sans text-sm text-cetus-ink-muted">
          The ice field appears when you start a run.
        </Text>
      )}

      {scene.pendingRouteChoice !== null ? (
        <View
          testID="ice-route-choice"
          className="gap-2 rounded-xl border border-cetus-hairline p-3"
          accessibilityLabel={`Route choice after stage ${scene.pendingRouteChoice}`}
        >
          <Text className="font-sans text-sm text-cetus-ink">
            Route choice after stage {scene.pendingRouteChoice}
          </Text>
          <Text className="font-sans text-xs text-cetus-ink-muted">
            Safe grants an undo charge. Risky raises the next stage multiplier
            and adds an extra objective.
          </Text>
          <Button
            accessibilityLabel="Choose safe route"
            onPress={() => controller.chooseExpeditionRoute('safe')}
          >
            Safe route · +1 undo
          </Button>
          <Button
            variant="outline"
            accessibilityLabel="Choose risky route"
            onPress={() => controller.chooseExpeditionRoute('risky')}
          >
            Risky route · bonus
          </Button>
        </View>
      ) : null}

      <View
        className="flex-row flex-wrap gap-2"
        accessibilityLabel="Ice Slide directions"
      >
        {DIRECTION_CONTROLS.map(({ direction, label }) => (
          <Button
            key={direction}
            variant="outline"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !scene.canMove }}
            disabled={!scene.canMove}
            className="min-w-[46%] flex-1"
            onPress={() => controller.move(direction)}
          >
            {label}
          </Button>
        ))}
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="outline"
          accessibilityLabel="Undo last move"
          accessibilityHint={`${scene.undoCharges} undo charges available`}
          accessibilityState={{ disabled: !scene.canUndo }}
          disabled={!scene.canUndo}
          className="min-w-[30%] flex-1"
          onPress={() => controller.undo()}
        >
          {`Undo (${scene.undoCharges})`}
        </Button>
        <Button
          variant="ghost"
          accessibilityLabel="Reset level"
          accessibilityState={{ disabled: !scene.canReset }}
          disabled={!scene.canReset}
          className="min-w-[30%] flex-1"
          onPress={() => controller.resetLevel()}
        >
          Reset level
        </Button>
        {playing ? (
          <Button
            variant="ghost"
            accessibilityLabel="Stop run"
            className="min-w-[30%] flex-1"
            onPress={() => controller.stop()}
          >
            Stop run
          </Button>
        ) : null}
      </View>

      {scene.canStartNewExpedition ? (
        <Button
          variant="outline"
          accessibilityLabel="New expedition"
          onPress={() => controller.newExpedition()}
        >
          New expedition
        </Button>
      ) : null}

      <Text className="font-sans text-xs text-cetus-ink-muted">
        Swipe the board or use the direction buttons. Undo is Expedition-only
        and spends one charge from a Safe route.
      </Text>
    </ScrollView>
  )
}
