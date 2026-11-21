import type { HandleSessionHandlers } from '@cetus/app-core'
import type { BaseGameStats } from '@cetus/games'
import {
    createIceSlideDailyRunDefinition,
    toIceSlideUtcDateKey,
} from '@cetus/games/ice-slide/daily'
import {
    createIceSlideExpeditionRunDefinition,
    createIceSlideExpeditionSeed,
    type IceSlideExpeditionRouteChoice,
} from '@cetus/games/ice-slide/expedition'
import { IceSlideGame } from '@cetus/games/ice-slide/game'
import { ICE_SLIDE_OBJECTIVE_LABELS } from '@cetus/games/ice-slide/objectives'
import { cloneIceSlideRunDefinition } from '@cetus/games/ice-slide/run'
import { iceSlideScoreSubmission } from '@cetus/games/ice-slide/scoreSubmission'
import type {
    CellType,
    Direction,
    GridPosition,
    IceSlidePlayableMode,
    IceSlideRunDefinition,
    IceSlideState,
} from '@cetus/games/ice-slide/types'

import type { HandleResultHelper } from '../handleResult'
import type { NativeGameProjection } from '../registry'

export const ICE_SLIDE_MODES: readonly IceSlidePlayableMode[] = [
    'campaign',
    'daily',
    'expedition',
] as const

/** Same row count the web Daily panel requests. */
export const ICE_SLIDE_DAILY_LEADERBOARD_LIMIT = 10

export interface IceSlideProjection extends NativeGameProjection {
    mode: IceSlidePlayableMode
    status: IceSlideState['status']
    rows: number
    cols: number
    grid: CellType[][]
    player: GridPosition
    level: number
    levelsTotal: number
    stageName: string
    parMoves: number
    levelMoves: number
    moves: number
    crystals: number
    objectiveLabels: string[]
    pendingRouteChoice: 2 | 4 | null
    undoCharges: number
    starsEarned: number
    starsPossible: number
    /** Daily run date key captured at Start (never rolls at midnight). */
    dailyDateKey: string | null
    /** Committed Daily saves this session; the board refetches on change. */
    dailySaves: number
    /** Expedition seed retained for Replay (and shown as the run identity). */
    seed: string | null
    canMove: boolean
    canUndo: boolean
    canReset: boolean
    canChooseMode: boolean
    canStartNewExpedition: boolean
    /** Honest, recoverable Start failure (e.g. run generation); else null. */
    startError: string | null
}

/** Pre-start snapshot the shared host shows before any controller action. */
export const ICE_SLIDE_INITIAL_PROJECTION: IceSlideProjection = {
    mode: 'campaign',
    status: 'idle',
    rows: 0,
    cols: 0,
    grid: [],
    player: { row: 0, col: 0 },
    level: 0,
    levelsTotal: 0,
    stageName: '',
    parMoves: 0,
    levelMoves: 0,
    moves: 0,
    crystals: 0,
    objectiveLabels: [],
    pendingRouteChoice: null,
    undoCharges: 0,
    starsEarned: 0,
    starsPossible: 0,
    dailyDateKey: null,
    dailySaves: 0,
    seed: null,
    canMove: false,
    canUndo: false,
    canReset: false,
    canChooseMode: true,
    canStartNewExpedition: false,
    startError: null,
}

export interface IceSlideControllerOptions {
    /** Injectable UTC clock (Daily date capture); defaults to `new Date()`. */
    now?: () => Date
    /** Injectable Expedition seed source; defaults to the shared helper. */
    createExpeditionSeed?: () => string
}

/**
 * Per-host Ice Slide controller (the board binding). One model instance per
 * run, mapped onto the shared handle session/result path; the zero-argument
 * chrome Start/Replay reads the pre-run mode selection here.
 *
 * Mode binding: Campaign replays `game.start()`; Daily captures the UTC
 * date at a fresh Start and retains the materialized run so Play again
 * replays the same runKey/competitionKey even across UTC midnight (web
 * `retryRun` parity — only a separately initiated new Daily binds
 * today); Expedition builds `createIceSlideExpeditionRunDefinition`
 * from a seed. The last finished Expedition run is retained so Play
 * again replays the same seed, while the board-local New Expedition
 * draws a fresh one.
 *
 * `undo()`, `resetLevel()`, `chooseExpeditionRoute()` and `stop()` emit no
 * model callbacks, so every wrapper republishes the copied scene and the
 * stabilized score/time HUD synchronously. The one shared
 * `iceSlideScoreSubmission` policy decides whether a Stop or win POSTs:
 * Daily early stops and already-stopped runs never save, a non-saving
 * Stop on a live Daily/Expedition run ends it with a local no-save
 * result (web `RUN ENDED`), `onIdle()` with a reset HUD is only for a
 * Stop that shows no result (an already-ended run or a zero-score
 * Campaign), and Campaign/Expedition early stops save only with a
 * positive score.
 */
export class IceSlideController {
    private game: IceSlideGame | null = null
    private mode: IceSlidePlayableMode = 'campaign'
    private retainedRun: IceSlideRunDefinition | null = null
    private dailyDateKey: string | null = null
    private publishedDailyDateKey: string | null = null
    private dailySaves = 0
    private ended = false
    private startError: string | null = null
    private readonly now: () => Date
    private readonly createSeed: () => string

    constructor(
        private readonly deps: {
            handlers: HandleSessionHandlers<NativeGameProjection>
            results: HandleResultHelper
        },
        options: IceSlideControllerOptions = {}
    ) {
        this.now = options.now ?? (() => new Date())
        this.createSeed =
            options.createExpeditionSeed ?? createIceSlideExpeditionSeed
    }

    /** Debug/test seam (web parity: `iceSlideGame.getGame()`). */
    getGame(): IceSlideGame | null {
        return this.game
    }

    getMode(): IceSlidePlayableMode {
        return this.mode
    }

    getNow(): Date {
        return this.now()
    }

    /** If the board is idle in Daily mode and the UTC date has rolled over
     *  since the last publish, publish the new date so the board and its
     *  run-keyed leaderboard follow today's UTC date. */
    syncIdleDailyDate(): boolean {
        if (this.mode !== 'daily' || this.game !== null) {
            return false
        }
        const currentKey = toIceSlideUtcDateKey(this.now())
        if (currentKey === this.publishedDailyDateKey) {
            return false
        }
        this.publish()
        return true
    }

    isRunning(): boolean {
        return this.game?.getState().status === 'playing'
    }

    getProjection(): IceSlideProjection {
        const state = this.game?.getState() ?? null
        const playing = state?.status === 'playing'
        const pending = state?.pendingRouteChoiceAfterStage ?? null
        return {
            mode: this.mode,
            status: state?.status ?? 'idle',
            rows: state?.rows ?? 0,
            cols: state?.cols ?? 0,
            grid: state ? state.grid.map(row => [...row]) : [],
            player: state ? { ...state.player } : { row: 0, col: 0 },
            level: state ? state.levelIndex + 1 : 0,
            levelsTotal: state?.stagesTotal ?? 0,
            stageName: state?.levelName ?? '',
            parMoves: state?.parMoves ?? 0,
            levelMoves: state?.levelMoves ?? 0,
            moves: state?.moves ?? 0,
            crystals: state?.crystalsCollected ?? 0,
            objectiveLabels:
                state?.objectiveIds.map(id => ICE_SLIDE_OBJECTIVE_LABELS[id]) ??
                [],
            pendingRouteChoice: pending,
            undoCharges: state?.undoChargesAvailable ?? 0,
            starsEarned: state?.starsEarned ?? 0,
            starsPossible: state?.starsPossible ?? 0,
            dailyDateKey:
                this.mode === 'daily'
                    ? state !== null
                        ? (this.dailyDateKey ??
                          toIceSlideUtcDateKey(this.now()))
                        : toIceSlideUtcDateKey(this.now())
                    : null,
            dailySaves: this.dailySaves,
            seed:
                this.mode === 'expedition'
                    ? (this.retainedRun?.seed ?? null)
                    : null,
            canMove: playing && pending === null,
            canUndo: this.game?.canUndo() ?? false,
            canReset: playing && pending === null,
            canChooseMode: !playing,
            canStartNewExpedition: this.mode === 'expedition' && !playing,
            startError: this.startError,
        }
    }

    /** Pre-run only: a live run keeps the mode it was built with.
     *  Re-selecting the current mode is a no-op only before any run;
     *  over a finished scene it still resets to idle so a fresh Daily
     *  or Expedition can be started without a throwaway mode switch
     *  (web Change Mode parity — Play again alone only replays the
     *  retained run, even once its Daily date has passed). */
    selectMode(mode: IceSlidePlayableMode): void {
        if (this.isRunning() || (mode === this.mode && this.game === null)) {
            return
        }
        this.mode = mode
        this.retainedRun = null
        this.dailyDateKey = null
        this.ended = false
        this.startError = null
        // A finished run's board must not sit under a different mode.
        const hadGame = this.game !== null
        this.game?.destroy()
        this.game = null
        if (hadGame) {
            this.deps.results.idle()
        }
        this.deps.handlers.onScore?.(0)
        this.deps.handlers.onTime?.(0)
        this.publish()
    }

    /** Chrome Start AND Play again: binds the selected mode / retained run. */
    start(): void {
        const mode = this.mode
        let run: IceSlideRunDefinition | undefined
        try {
            if (mode === 'daily') {
                // A finished Daily's materialized run is retained for
                // replay: Play again reuses the original UTC date/runKey
                // (and leaderboard competitionKey) even across midnight,
                // matching web `retryRun`. Only a separately initiated
                // new Daily binds today's UTC date.
                if (this.ended && this.retainedRun?.mode === 'daily') {
                    run = cloneIceSlideRunDefinition(this.retainedRun)
                } else {
                    this.dailyDateKey = toIceSlideUtcDateKey(this.now())
                    run = createIceSlideDailyRunDefinition(this.dailyDateKey)
                    this.retainedRun = cloneIceSlideRunDefinition(run)
                }
            } else if (mode === 'expedition') {
                if (this.ended && this.retainedRun?.mode === 'expedition') {
                    run = cloneIceSlideRunDefinition(this.retainedRun)
                } else {
                    run = createIceSlideExpeditionRunDefinition(
                        this.createSeed()
                    )
                    this.retainedRun = cloneIceSlideRunDefinition(run)
                }
            } else {
                this.retainedRun = null
            }
        } catch (error) {
            this.failStart(error)
            return
        }

        this.game?.destroy()
        this.game = null
        this.ended = false
        this.startError = null
        const game = new IceSlideGame(this.createCallbacks())
        this.game = game
        try {
            game.start(run)
        } catch (error) {
            game.destroy()
            this.game = null
            this.failStart(error)
        }
    }

    move(direction: Direction): void {
        this.game?.move(direction)
    }

    /** No model callback: republish the restored cursor/grid + HUD here. */
    undo(): boolean {
        const undone = this.game?.undo() ?? false
        if (undone) {
            this.publish()
        }
        return undone
    }

    /** No model callback: republish the reloaded stage + HUD here. */
    resetLevel(): void {
        this.game?.resetLevel()
        this.publish()
    }

    /** No model callback: republish the rerouted run metadata + HUD here. */
    chooseExpeditionRoute(choice: IceSlideExpeditionRouteChoice): boolean {
        const applied = this.game?.chooseExpeditionRoute(choice) ?? false
        if (applied) {
            this.publish()
        }
        return applied
    }

    /** Board-local New Expedition: a fresh seed, never the retained one. */
    newExpedition(): void {
        if (this.isRunning()) {
            return
        }
        this.mode = 'expedition'
        this.retainedRun = null
        this.dailyDateKey = null
        this.ended = false
        this.start()
    }

    /** Board-local Stop: the shared policy decides save, local result
     *  or idle. */
    stop(): void {
        if (!this.game) {
            return
        }
        this.finish('stop')
    }

    cleanup(): void {
        this.game?.destroy()
        this.game = null
        this.retainedRun = null
        this.dailyDateKey = null
        this.publishedDailyDateKey = null
        this.dailySaves = 0
        this.ended = false
    }

    private failStart(error: unknown): void {
        this.ended = false
        this.dailyDateKey = null
        this.startError = `Unable to start the Ice Slide run: ${
            error instanceof Error ? error.message : String(error)
        }`
        // The shared idle transition also invalidates the run token, so a
        // save in flight from the previous run cannot settle over this UI.
        this.deps.results.idle()
        this.deps.handlers.onScore?.(0)
        this.deps.handlers.onTime?.(0)
        this.publish()
    }

    private finish(reason: 'win' | 'stop'): void {
        const game = this.game
        if (!game) {
            return
        }
        const state = game.getState()
        const wasPlaying = state.status === 'playing'
        const submission = iceSlideScoreSubmission({
            score: state.score,
            gameData: game.getGameData(),
            reason,
            wasPlaying,
        })
        if (reason === 'stop') {
            // The model fires nothing on stop; end the timer here.
            game.stop()
        }
        if (submission) {
            this.ended = true
            this.deps.results.finishAndSave(
                {
                    score: submission.score,
                    stats: {
                        finalScore: submission.score,
                        timeElapsed: state.elapsedSeconds,
                        gameCompleted: submission.gameData.solved,
                    } satisfies BaseGameStats,
                    gameData: { ...submission.gameData },
                    context: submission.context,
                },
                // Only a Daily save feeds the board's run-keyed ranking;
                // bump its revision once the POST has committed.
                submission.context?.mode === 'daily'
                    ? () => {
                          this.dailySaves += 1
                          this.publish()
                      }
                    : undefined
            )
        } else if (reason === 'win') {
            // A win always has a positive score in practice; stay honest if
            // it does not by reporting a local result with no save status.
            this.ended = true
            this.deps.results.finishLocal({
                score: state.score,
                stats: {
                    finalScore: state.score,
                    timeElapsed: state.elapsedSeconds,
                    gameCompleted: true,
                } satisfies BaseGameStats,
            })
        } else if (wasPlaying && state.mode !== 'campaign') {
            // A non-saving Stop on a live Daily/Expedition run still ends
            // it with the local RUN ENDED result like web — no saveStatus,
            // and the stopped scene plus its retained run stay for Play
            // again.
            this.ended = true
            this.deps.results.finishLocal({
                score: state.score,
                stats: {
                    finalScore: state.score,
                    timeElapsed: state.elapsedSeconds,
                    gameCompleted: false,
                } satisfies BaseGameStats,
            })
        } else {
            // A Stop that shows no result (an already-ended run or a
            // zero-score Campaign): back to the pre-start UI with a
            // cleared result. No replay is offered, so the retained
            // run/seed and frozen Daily date key are dropped too.
            this.ended = false
            this.retainedRun = null
            this.dailyDateKey = null
            game.destroy()
            this.game = null
            this.deps.results.idle()
            this.deps.handlers.onScore?.(0)
            this.deps.handlers.onTime?.(0)
        }
        this.publish()
    }

    private createCallbacks(): ConstructorParameters<typeof IceSlideGame>[0] {
        return {
            onGameStart: () => {
                // Synchronous inside start(): opens the run, clears a stale
                // result and resets the visible score/time.
                this.deps.results.beginRun(0)
                this.publish()
            },
            onMove: () => this.publish(),
            onLevelClear: () => this.publish(),
            onTimeUpdate: elapsedSeconds =>
                this.deps.handlers.onTime?.(elapsedSeconds),
            onScoreUpdate: score => this.deps.handlers.onScore?.(score),
            onWin: () => this.finish('win'),
        }
    }

    /** Copied scene + stabilized score/time HUD in one synchronous refresh. */
    private publish(): void {
        const state = this.game?.getState()
        const projection = this.getProjection()
        this.publishedDailyDateKey = projection.dailyDateKey
        this.deps.handlers.onScore?.(state?.score ?? 0)
        this.deps.handlers.onTime?.(state?.elapsedSeconds ?? 0)
        this.deps.handlers.setProjected(
            projection as unknown as NativeGameProjection
        )
    }
}
