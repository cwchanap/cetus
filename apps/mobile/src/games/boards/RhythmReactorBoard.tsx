import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, ScrollView, Text, View } from 'react-native'
import { Button } from '@cetus/ui'
import type { RhythmReactorGame } from '@cetus/games/rhythm-reactor/RhythmReactorGame'
import {
  RHYTHM_REACTOR_RULES,
  type RhythmReactorNote,
  type RhythmReactorState,
} from '@cetus/games/rhythm-reactor/types'
import { Rect } from '@shopify/react-native-skia'

import { GameCanvas } from '../canvas/GameCanvas'
import { useFrameLoop } from '../canvas/useFrameLoop'
import type { NativeGameViewProps } from '../registry'
import {
  RHYTHM_REACTOR_CALIBRATION_STEP_MS,
  getRhythmReactorRun,
  type RhythmReactorRunSnapshot,
} from '../rhythm-reactor/run'

const {
  canvasWidth: BOARD_WIDTH,
  canvasHeight: BOARD_HEIGHT,
  laneCount: LANE_COUNT,
  beatStepSeconds: BEAT_STEP_SECONDS,
  firstHitTimeSeconds: FIRST_HIT_SECONDS,
  approachSeconds: APPROACH_SECONDS,
  missWindowSeconds: MISS_WINDOW_SECONDS,
  noteSpawnY: NOTE_SPAWN_Y,
  hitLineY: HIT_LINE_Y,
} = RHYTHM_REACTOR_RULES

const LANE_WIDTH = BOARD_WIDTH / LANE_COUNT
const NOTE_HEIGHT = 18
const NOTE_WIDTH = LANE_WIDTH * 0.55
const NOTE_COLOR = '#f472b6'
const BACKGROUND = '#020817'
const LANE_COLORS = ['#0f172a', '#111827'] as const
const LANE_DIVIDER = '#334155'
const SPAWN_LINE = '#64748b'
const HIT_LINE = '#22d3ee'
const STABILITY_TRACK = '#1e293b'
const STABILITY_FILL = '#34d399'
const STABILITY_X = 20
const STABILITY_Y = 16
const STABILITY_WIDTH = 100
const STABILITY_HEIGHT = 8

interface BoardView {
  state: RhythmReactorState
  run: RhythmReactorRunSnapshot
}

const phaseOf = (state: RhythmReactorState): string => {
  if (state.isGameOver) {
    return 'Run complete'
  }
  if (!state.isActive) {
    return 'Waiting to start'
  }
  if (state.isPaused) {
    return 'Paused'
  }
  if (state.elapsedSeconds < FIRST_HIT_SECONDS) {
    return 'Count-in — get ready'
  }
  return `Playing — Beat ${
    Math.floor(state.elapsedSeconds / BEAT_STEP_SECONDS) + 1
  }`
}

const feedbackOf = (state: RhythmReactorState): string => {
  if (state.isGameOver) {
    return 'Run complete'
  }
  if (!state.isActive) {
    return 'Tap lanes as notes cross the hit line'
  }
  if (state.lastJudgment === 'perfect') {
    return 'Perfect!'
  }
  if (state.lastJudgment === 'good') {
    return 'Good'
  }
  if (state.lastJudgment === 'miss') {
    return 'Miss'
  }
  return 'Tap the lit lanes on the beat'
}

const audioStateLabel = (snapshot: RhythmReactorRunSnapshot): string => {
  if (snapshot.audioState === 'loading') {
    return 'Loading click track…'
  }
  if (snapshot.audioState === 'error') {
    return 'Click track failed to load'
  }
  return 'Click track ready'
}

const calibrationLabel = (calibrationMs: number): string =>
  `Calibration ${calibrationMs >= 0 ? '+' : ''}${calibrationMs} ms`

const CUE_LEAD_SECONDS = 1.5
// shortcut: speech may exceed this interval; use cross-platform completion when available.
const CUE_INTERVAL_MS = 1500
const UPCOMING_LIMIT = 4

const approachNotes = (state: RhythmReactorState) =>
  state.pendingNotes
    .filter(
      note =>
        note.hitTimeSeconds - state.elapsedSeconds <= APPROACH_SECONDS &&
        state.elapsedSeconds - note.hitTimeSeconds <= MISS_WINDOW_SECONDS
    )
    .sort((a, b) => a.hitTimeSeconds - b.hitTimeSeconds)

const remainingOf = (note: RhythmReactorNote, elapsedSeconds: number): number =>
  Math.max(0, note.hitTimeSeconds - elapsedSeconds)

const spokenSeconds = (seconds: number): string =>
  `${seconds.toFixed(1)} seconds`

/**
 * The falling notes and lane colours are Skia-only: the same approach window
 * is spelled out for screen readers so a lane and its time are available
 * without sight. This text is read on focus; the spoken cue below is the
 * anticipation channel.
 */
const upcomingLabel = (state: RhythmReactorState): string => {
  if (state.isGameOver) {
    return 'Run complete.'
  }
  if (!state.isActive) {
    return 'Upcoming notes appear when the run starts.'
  }
  const notes = approachNotes(state)
  if (notes.length === 0) {
    return 'No notes approaching.'
  }
  return `Upcoming: ${notes
    .slice(0, UPCOMING_LIMIT)
    .map(
      note =>
        `lane ${note.laneIndex + 1} in ${spokenSeconds(
          remainingOf(note, state.elapsedSeconds)
        )}`
    )
    .join(', ')}.`
}

/** Notes inside the spoken cue lead, earliest first. */
const cueNotes = (state: RhythmReactorState) =>
  approachNotes(state).filter(note => {
    const remaining = note.hitTimeSeconds - state.elapsedSeconds
    return remaining >= 0 && remaining <= CUE_LEAD_SECONDS
  })

/**
 * Rhythm Reactor native board (HPA-535 Stage 5). Skia draws the four lanes
 * and falling notes from the MODEL's `elapsedSeconds`; the runtime companion
 * (not this board) owns the expo-audio player, the media clock and the
 * background-abort policy. Lane buttons are the guaranteed screen-reader
 * path, the calibration control is bounded and pre-run only, and the shared
 * chrome keeps Start/Replay gated until the bundled track is ready.
 */
export function RhythmReactorBoard({ game }: NativeGameViewProps) {
  const rhythmGame = game as RhythmReactorGame
  const run = getRhythmReactorRun(rhythmGame)
  const [view, setView] = useState<BoardView>(() => ({
    state: rhythmGame.getState(),
    run: run.getSnapshot(),
  }))

  const sync = (): void => {
    setView({
      state: rhythmGame.getState(),
      run: run.getSnapshot(),
    })
  }

  useEffect(() => run.subscribe(sync), [run])

  useFrameLoop(
    {
      isRunning: () => run.isLoopRunning(),
      step: () => run.advance(),
      subscribe: (wake, resetTimestamp) => run.subscribe(wake, resetTimestamp),
      onFrame: sync,
      lifecycleKey: () => run.lifecycleKey(),
    },
    run
  )

  const { state, run: audio } = view
  const running = state.isActive && !state.isPaused && !state.isGameOver
  const calibrationLocked = state.isActive
  const hits = state.perfectHits + state.goodHits
  const status = phaseOf(state)
  const feedback = feedbackOf(state)
  const calibration = calibrationLabel(audio.calibrationMs)
  const upcoming = upcomingLabel(state)
  const approached = approachNotes(state)

  const announcedNotesRef = useRef<Set<string>>(new Set())
  const lastCueAtRef = useRef<number | null>(null)
  useEffect(() => {
    if (!running) {
      announcedNotesRef.current.clear()
      lastCueAtRef.current = null
      return
    }
    const now = Date.now()
    if (
      lastCueAtRef.current !== null &&
      now - lastCueAtRef.current < CUE_INTERVAL_MS
    ) {
      return
    }
    const due = cueNotes(state).filter(
      candidate => !announcedNotesRef.current.has(candidate.id)
    )
    if (due.length === 0) {
      return
    }
    const notes = state.pendingNotes
      .filter(
        note =>
          !announcedNotesRef.current.has(note.id) &&
          note.hitTimeSeconds >= state.elapsedSeconds &&
          note.hitTimeSeconds - state.elapsedSeconds <=
            CUE_LEAD_SECONDS + CUE_INTERVAL_MS / 1000
      )
      .sort((a, b) => a.hitTimeSeconds - b.hitTimeSeconds)
    notes.forEach(note => announcedNotesRef.current.add(note.id))
    lastCueAtRef.current = now
    void AccessibilityInfo.announceForAccessibility(
      `${notes
        .map(
          (note, index) =>
            `${index === 0 ? 'Lane' : 'lane'} ${note.laneIndex + 1}, in ${spokenSeconds(
              remainingOf(note, state.elapsedSeconds)
            )}`
        )
        .join('; ')}.`
    )
  }, [running, state])

  const laneCue = (laneIndex: number): string => {
    if (!running) {
      return 'Lane available when the run starts'
    }
    const note = approached.find(candidate => candidate.laneIndex === laneIndex)
    return note
      ? `Note in ${spokenSeconds(remainingOf(note, state.elapsedSeconds))}`
      : 'No approaching note'
  }

  const summary = [
    'Rhythm Reactor board',
    `${LANE_COUNT} lanes`,
    status,
    `Hits ${hits}`,
    `Combo ${state.combo}`,
    `Stability ${state.stability}`,
    `Calibration ${audio.calibrationMs >= 0 ? '+' : ''}${
      audio.calibrationMs
    } milliseconds`,
  ].join('. ')

  const pressLane = (laneIndex: number): void => {
    if (!rhythmGame.getState().isActive) {
      return
    }
    run.tap(laneIndex)
    sync()
  }

  const adjustCalibration = (deltaMs: number): void => {
    run.adjustCalibration(deltaMs)
    sync()
  }

  return (
    <ScrollView
      testID="rhythm-scroll"
      className="flex-1"
      contentContainerStyle={{
        gap: 12,
        paddingHorizontal: 16,
        paddingBottom: 24,
      }}
    >
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <Text
          testID="rr-audio-state"
          className="font-sans text-xs text-cetus-ink-muted"
        >
          {audioStateLabel(audio)}
        </Text>
        <Text
          testID="rr-calibration"
          className="font-sans text-xs text-cetus-ink-muted"
        >
          {calibration}
        </Text>
        <Text className="font-sans text-xs text-cetus-ink-muted">
          Hits {hits}
        </Text>
        <Text className="font-sans text-xs text-cetus-ink-muted">
          Combo ×{state.combo}
        </Text>
        <Text className="font-sans text-xs text-cetus-ink-muted">
          Stability {state.stability}
        </Text>
      </View>

      <View
        testID="rhythm-board"
        accessible
        accessibilityLabel={summary}
        style={{
          width: '100%',
          aspectRatio: BOARD_WIDTH / BOARD_HEIGHT,
        }}
      >
        <GameCanvas logicalWidth={BOARD_WIDTH} logicalHeight={BOARD_HEIGHT}>
          <Rect
            x={0}
            y={0}
            width={BOARD_WIDTH}
            height={BOARD_HEIGHT}
            color={BACKGROUND}
          />
          {Array.from({ length: LANE_COUNT }, (_, lane) => (
            <Rect
              key={`lane-${lane}`}
              x={lane * LANE_WIDTH}
              y={0}
              width={LANE_WIDTH}
              height={BOARD_HEIGHT}
              color={LANE_COLORS[lane % LANE_COLORS.length]}
              opacity={0.8}
            />
          ))}
          {Array.from({ length: LANE_COUNT - 1 }, (_, index) => (
            <Rect
              key={`divider-${index}`}
              x={(index + 1) * LANE_WIDTH}
              y={0}
              width={2}
              height={BOARD_HEIGHT}
              color={LANE_DIVIDER}
            />
          ))}
          <Rect
            x={0}
            y={NOTE_SPAWN_Y}
            width={BOARD_WIDTH}
            height={1}
            color={SPAWN_LINE}
            opacity={0.5}
          />
          <Rect
            x={0}
            y={HIT_LINE_Y}
            width={BOARD_WIDTH}
            height={3}
            color={HIT_LINE}
            opacity={0.9}
          />
          {approached.map(note => {
            const progress =
              1 -
              (note.hitTimeSeconds - state.elapsedSeconds) / APPROACH_SECONDS
            const centerY =
              NOTE_SPAWN_Y + (HIT_LINE_Y - NOTE_SPAWN_Y) * progress
            return (
              <Rect
                key={note.id}
                x={note.laneIndex * LANE_WIDTH + (LANE_WIDTH - NOTE_WIDTH) / 2}
                y={centerY - NOTE_HEIGHT / 2}
                width={NOTE_WIDTH}
                height={NOTE_HEIGHT}
                color={NOTE_COLOR}
                opacity={0.95}
              />
            )
          })}
          <Rect
            x={STABILITY_X}
            y={STABILITY_Y}
            width={STABILITY_WIDTH}
            height={STABILITY_HEIGHT}
            color={STABILITY_TRACK}
            opacity={0.9}
          />
          <Rect
            x={STABILITY_X}
            y={STABILITY_Y}
            width={
              (STABILITY_WIDTH * Math.max(0, Math.min(100, state.stability))) /
              100
            }
            height={STABILITY_HEIGHT}
            color={STABILITY_FILL}
            opacity={0.95}
          />
        </GameCanvas>
      </View>

      <Text
        testID="rr-status"
        className="font-sans text-sm text-cetus-ink-muted"
      >
        {status}
      </Text>
      <Text
        testID="rr-feedback"
        className="font-display text-lg text-cetus-ink"
      >
        {feedback}
      </Text>
      <Text
        testID="rr-upcoming"
        accessibilityLabel={upcoming}
        className="font-sans text-sm text-cetus-ink-muted"
      >
        {upcoming}
      </Text>

      {audio.playError ? (
        <Text
          testID="rr-play-error"
          className="font-sans text-sm text-cetus-accent"
        >
          {audio.playError}
        </Text>
      ) : null}
      {audio.notice ? (
        <Text
          testID="rr-notice"
          className="font-sans text-sm text-cetus-ink-muted"
        >
          {audio.notice}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap gap-2" accessibilityLabel="Tap lanes">
        {Array.from({ length: LANE_COUNT }, (_, lane) => (
          <Button
            key={`lane-button-${lane}`}
            testID={`rr-lane-${lane + 1}`}
            variant="primary"
            size="sm"
            accessibilityLabel={`Tap lane ${lane + 1}`}
            accessibilityHint="Tap when this lane's note reaches the cyan line"
            accessibilityValue={{ text: laneCue(lane) }}
            accessibilityState={{ disabled: !running }}
            disabled={!running}
            className="min-w-[22%] flex-1"
            onPress={() => pressLane(lane)}
          >
            {`Lane ${lane + 1} · ${'DFJK'[lane] ?? lane + 1}`}
          </Button>
        ))}
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          accessibilityLabel={`Calibration -${RHYTHM_REACTOR_CALIBRATION_STEP_MS} ms`}
          accessibilityState={{ disabled: calibrationLocked }}
          disabled={calibrationLocked}
          onPress={() => adjustCalibration(-RHYTHM_REACTOR_CALIBRATION_STEP_MS)}
        >
          {`-${RHYTHM_REACTOR_CALIBRATION_STEP_MS} ms`}
        </Button>
        <Button
          variant="outline"
          size="sm"
          accessibilityLabel={`Calibration +${RHYTHM_REACTOR_CALIBRATION_STEP_MS} ms`}
          accessibilityState={{ disabled: calibrationLocked }}
          disabled={calibrationLocked}
          onPress={() => adjustCalibration(RHYTHM_REACTOR_CALIBRATION_STEP_MS)}
        >
          {`+${RHYTHM_REACTOR_CALIBRATION_STEP_MS} ms`}
        </Button>
      </View>

      <Text className="font-sans text-xs text-cetus-ink-muted">
        Tap the lane when its note crosses the cyan line. Calibration is locked
        during a run; positive values delay the chart by that many milliseconds
        (the media position is shifted back).
      </Text>
    </ScrollView>
  )
}
