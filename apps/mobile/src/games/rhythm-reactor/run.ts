import { AppState } from 'react-native'
import type { GameEvent } from '@cetus/games'
import type { RhythmReactorGame } from '@cetus/games/rhythm-reactor/RhythmReactorGame'
import {
    RHYTHM_REACTOR_RULES,
    type RhythmReactorHitResult,
} from '@cetus/games/rhythm-reactor/types'

/**
 * Calibration is a pre-run player-time correction. Positive values subtract
 * from the media position, so the chart runs that much later than the audio;
 * the bound keeps a mistyped value from swallowing an entire hit range.
 */
export const RHYTHM_REACTOR_CALIBRATION_STEP_MS = 10
export const RHYTHM_REACTOR_CALIBRATION_LIMIT_MS = 200

/** A local asset that never loads must fail visibly instead of leaving the
 *  shared binding-pending shell up forever. */
const LOAD_TIMEOUT_MS = 10_000

/** Bounded confirmation window after `play()`: expo's `play()` can return
 *  without actually starting playback (notably Android). The model and its
 *  independent wall timer stay idle until the player proves it is playing. */
const PLAYBACK_CONFIRM_TIMEOUT_MS = 1_500

/** Cumulative media/wall gap tolerated after confirmation. Audio that falls
 *  this far behind the wall timer means the last chart notes would otherwise
 *  be cut off by a scored wall-clock finish. */
const MEDIA_CONTINUITY_TOLERANCE_SECONDS = 0.4

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset id
const METRONOME_SOURCE = require('../../../assets/audio/rhythm-reactor-metronome.m4a')

export type RhythmReactorAudioState = 'loading' | 'ready' | 'error'

/** The subset of expo-audio's AudioStatus the run relies on. */
export interface RhythmAudioStatus {
    currentTime: number
    playing: boolean
    isLoaded: boolean
    error: string | null
    didJustFinish: boolean
    duration: number
}

/**
 * The AudioPlayer surface this run owns. expo-audio's player satisfies it
 * structurally; tests supply a fake with the same shape.
 */
export interface RhythmAudioPlayer {
    readonly isLoaded: boolean
    readonly playing: boolean
    readonly currentTime: number
    play(): void
    pause(): void
    seekTo(seconds: number): Promise<void>
    remove(): void
    addListener(
        event: 'playbackStatusUpdate',
        listener: (status: RhythmAudioStatus) => void
    ): { remove(): void }
}

export type RhythmAudioPlayerFactory = () =>
    RhythmAudioPlayer | Promise<RhythmAudioPlayer>

export interface RhythmReactorRunSnapshot {
    audioState: RhythmReactorAudioState
    calibrationMs: number
    playError: string | null
    notice: string | null
}

export interface RhythmReactorRunOptions {
    createPlayer?: RhythmAudioPlayerFactory
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module
const loadExpoAudio = () => require('expo-audio') as typeof import('expo-audio')

const createExpoAudioPlayer: RhythmAudioPlayerFactory = async () => {
    // Required lazily so registry/type-only consumers never pull the native
    // module until a Rhythm run actually prepares. A static import would
    // also make every registry test load the unimplemented native module.
    const { createAudioPlayer } = loadExpoAudio()
    return createAudioPlayer(METRONOME_SOURCE, {
        updateInterval: 80,
    }) as unknown as RhythmAudioPlayer
}

/**
 * Native Rhythm Reactor runtime companion (HPA-535 Stage 5).
 *
 * The portable model keeps its own rules and chart; this class owns exactly
 * the native-only concerns:
 * - preloads/verifies the bundled HPA-1140 click track before Start unlocks;
 * - turns `player.currentTime` into model time through the shared frame loop;
 * - aborts a live run on background instead of faking a pause;
 * - keeps the bounded pre-run calibration offset.
 *
 * The model stays the only scoring/timing authority: audio failure before a
 * run never calls `game.start()`, and an abort uses `game.reset()` so no
 * zero-score run is posted.
 */
export class RhythmReactorRun {
    private readonly game: RhythmReactorGame
    private readonly createPlayer: RhythmAudioPlayerFactory
    private readonly wakeHandlers = new Set<() => void>()
    private player: RhythmAudioPlayer | null = null
    private statusSubscription: { remove(): void } | null = null
    private appStateSubscription: { remove(): void } | null = null
    private audioState: RhythmReactorAudioState = 'loading'
    private calibrationMs = 0
    private playError: string | null = null
    private notice: string | null = null
    private prepared: Promise<void> | null = null
    private loadWaiter: {
        resolve: () => void
        reject: (error: Error) => void
    } | null = null
    private loadTimer: ReturnType<typeof setTimeout> | null = null
    private starting = false
    private startAttempt = 0
    private aborting = false
    private audioLoaded = false
    private audioSessionReady = false
    private runStartedAtMs: number | null = null
    private readonly finalNoteResolvedSeconds: number
    private timeUpdateAttached = false
    private appIsActive =
        typeof AppState.currentState === 'string'
            ? AppState.currentState === 'active'
            : true
    private playbackGate: {
        attempt: number
        check: () => boolean
        resolve: () => void
        reject: (error: Error) => void
    } | null = null
    private playbackGateTimer: ReturnType<typeof setTimeout> | null = null
    private playbackGateInterval: ReturnType<typeof setInterval> | null = null
    private disposed = false

    constructor(
        game: RhythmReactorGame,
        options: RhythmReactorRunOptions = {}
    ) {
        this.game = game
        this.createPlayer = options.createPlayer ?? createExpoAudioPlayer
        const config = (
            game as unknown as {
                config: {
                    chart: ReadonlyArray<{ hitTimeSeconds: number }>
                    missWindowSeconds: number
                }
            }
        ).config
        const finalNoteTime = config.chart.reduce(
            (latest, note) => Math.max(latest, note.hitTimeSeconds),
            0
        )
        this.finalNoteResolvedSeconds = finalNoteTime + config.missWindowSeconds
    }

    /** Resolves only once the track is decoded/ready; rejects on load error
     *  or timeout so the host can show its setup-error retry path. */
    prepare(): Promise<void> {
        if (this.prepared === null) {
            this.prepared = this.prepareInternal().catch(error => {
                // A failed preparation must not stay cached: Start/Replay is
                // the documented retry path and re-runs preparation.
                this.prepared = null
                throw error
            })
        }
        return this.prepared
    }

    /** True while the shared frame loop should keep scheduling. */
    isLoopRunning(): boolean {
        const state = this.game.getState()
        return state.isActive && !state.isPaused && !state.isGameOver
    }

    lifecycleKey(): string {
        const state = this.game.getState()
        const phase = state.isGameOver
            ? 'finished'
            : !state.isActive
              ? 'idle'
              : state.isPaused
                ? 'paused'
                : 'running'
        return [
            phase,
            this.audioState,
            this.calibrationMs,
            this.playError ?? '',
            this.notice ?? '',
        ].join('|')
    }

    subscribe(wake: () => void, _resetTimestamp?: () => void): () => void {
        this.wakeHandlers.add(wake)
        return () => {
            this.wakeHandlers.delete(wake)
        }
    }

    getSnapshot(): RhythmReactorRunSnapshot {
        return {
            audioState: this.audioState,
            calibrationMs: this.calibrationMs,
            playError: this.playError,
            notice: this.notice,
        }
    }

    /** Bounded, idle-only calibration; locked while a run is live. */
    adjustCalibration(deltaMs: number): boolean {
        if (this.game.getState().isActive || !Number.isFinite(deltaMs)) {
            return false
        }
        const next = Math.max(
            -RHYTHM_REACTOR_CALIBRATION_LIMIT_MS,
            Math.min(
                RHYTHM_REACTOR_CALIBRATION_LIMIT_MS,
                this.calibrationMs + deltaMs
            )
        )
        if (next === this.calibrationMs) {
            return false
        }
        this.calibrationMs = next
        this.notify()
        return true
    }

    /**
     * Chrome Start/Replay seam. Playback must be confirmed (and the source
     * rewound) before the model and its independent wall timer start; a
     * refused/delayed start keeps both idle. Backgrounding invalidates the
     * pending attempt at every async boundary.
     */
    async start(): Promise<void> {
        if (this.starting || this.game.getState().isActive) {
            return
        }
        const attempt = ++this.startAttempt
        this.starting = true
        this.playError = null
        this.notice = null
        let failureMessage =
            'The click track could not start. Press Start to try again.'
        try {
            if (!this.isStartCurrent(attempt)) {
                return
            }
            failureMessage =
                'The click track failed to load. Press Start to try again.'
            try {
                await this.ensureAudioReady()
            } catch {
                throw new Error(failureMessage)
            }
            if (!this.isStartCurrent(attempt)) {
                return
            }
            if (this.player === null || !this.audioLoaded) {
                throw new Error(failureMessage)
            }
            failureMessage =
                'The click track could not start. Press Start to try again.'
            try {
                await this.ensureAudioSession()
            } catch {
                throw new Error(failureMessage)
            }
            if (!this.isStartCurrent(attempt)) {
                return
            }
            const player = this.player
            if (player === null) {
                throw new Error(failureMessage)
            }
            try {
                await player.seekTo(0)
            } catch {
                throw new Error(failureMessage)
            }
            if (!this.isStartCurrent(attempt)) {
                return
            }
            if (this.player === null || !this.audioLoaded) {
                throw new Error(failureMessage)
            }
            try {
                player.play()
            } catch {
                throw new Error(failureMessage)
            }
            await this.waitForPlayback(attempt)
            if (!this.isStartCurrent(attempt)) {
                return
            }
            // Align with BaseGame's own GameTimer.start(): both measure the
            // same uncapped wall clock from this instant.
            this.runStartedAtMs = Date.now()
            this.game.start()
        } catch (error) {
            // A background/disposal invalidation is not a failure to show:
            // the attempt simply must not start later.
            if (!this.isStartCurrent(attempt)) {
                return
            }
            this.playError =
                error instanceof Error && error.message
                    ? error.message
                    : failureMessage
            this.stopAudio()
        } finally {
            if (attempt === this.startAttempt) {
                this.starting = false
            }
            this.notify()
        }
    }

    /** Manual Reset: stop/rewind the track and clear the run locally. */
    reset(): void {
        this.stopAudio()
        this.runStartedAtMs = null
        this.playError = null
        this.notice = null
        this.game.reset()
        this.notify()
    }

    /** One shared-frame-loop step. Chart time always comes from
     *  player.currentTime; continuity uses the uncapped wall clock the
     *  independent BaseGame timer also uses. */
    advance(): void {
        const state = this.game.getState()
        if (!state.isActive || state.isPaused || state.isGameOver) {
            this.runStartedAtMs = null
            return
        }
        const player = this.player
        if (player === null || !this.audioLoaded) {
            this.playError =
                'Playback was interrupted. Press Start to try again.'
            this.abortActiveRun(null)
            return
        }
        const elapsedWallSeconds =
            this.runStartedAtMs === null
                ? 0
                : Math.max(0, (Date.now() - this.runStartedAtMs) / 1000)
        const atMediaEnd =
            player.currentTime >= RHYTHM_REACTOR_RULES.duration - 0.05
        const modelResolved = state.pendingNotes.length === 0
        const finalNoteWindowResolved =
            modelResolved ||
            player.currentTime + 0.05 >= this.finalNoteResolvedSeconds
        const mediaGap = elapsedWallSeconds - player.currentTime
        if (!player.playing) {
            // A finished track / fully resolved chart stops reporting
            // playback before or as the wall timer ends; catch up so the
            // completion gate sees the model's final position.
            if (atMediaEnd || finalNoteWindowResolved) {
                this.catchUpToAudio(player, state.elapsedSeconds)
                return
            }
            if (mediaGap > MEDIA_CONTINUITY_TOLERANCE_SECONDS) {
                this.playError =
                    'Playback was interrupted. Press Start to try again.'
                this.abortActiveRun(null)
            }
            return
        }
        if (
            !atMediaEnd &&
            !finalNoteWindowResolved &&
            mediaGap > MEDIA_CONTINUITY_TOLERANCE_SECONDS
        ) {
            this.playError =
                'Playback was interrupted. Press Start to try again.'
            this.abortActiveRun(null)
            return
        }
        this.catchUpToAudio(player, state.elapsedSeconds)
    }

    /** Lane tap: catch up to the media position before the model judges it. */
    tap(laneIndex: number): RhythmReactorHitResult {
        const player = this.player
        if (player !== null && this.audioLoaded && player.playing) {
            this.catchUpToAudio(player, this.game.getState().elapsedSeconds)
        }
        return this.game.hitLane(laneIndex)
    }

    /**
     * Rhythm-specific background policy: leaving the foreground aborts a
     * live run to idle and invalidates any pending Start/Replay. No pausing,
     * no auto-resume, no score POST.
     */
    attachAppState(): () => void {
        if (this.appStateSubscription === null) {
            this.attachTimeUpdates()
            this.appStateSubscription = AppState.addEventListener(
                'change',
                next => {
                    if (next === 'active') {
                        this.appIsActive = true
                        return
                    }
                    this.appIsActive = false
                    this.invalidatePendingStart()
                    if (this.game.getState().isActive) {
                        this.notice =
                            'Run stopped when the app left the foreground. Start again to replay.'
                        this.abortActiveRun(this.notice)
                    }
                }
            )
        }
        return () => {
            this.detachAppState()
            this.detachTimeUpdates()
        }
    }

    dispose(): void {
        if (this.disposed) {
            return
        }
        this.disposed = true
        this.startAttempt += 1
        this.starting = false
        this.settlePlaybackGate(new Error(''))
        this.detachAppState()
        this.detachTimeUpdates()
        this.clearLoadWait()
        this.disposePlayer()
        this.wakeHandlers.clear()
    }

    /**
     * BaseGame's independent timer tick is the last boundary before its
     * `handleTimeUp()` posts a score. Reject a completion whose media or
     * model never reached the final chart note, even when no animation frame
     * arrived near the deadline.
     */
    private readonly handleTimeUpdate = (event: GameEvent): void => {
        const time = event.data?.time
        if (typeof time !== 'number' || time > 0) {
            return
        }
        const state = this.game.getState()
        if (!state.isActive || state.isGameOver) {
            return
        }
        const player = this.player
        const mediaReachedFinalNote =
            player !== null &&
            this.audioLoaded &&
            player.currentTime + 0.05 >= this.finalNoteResolvedSeconds
        // Every note already consumed (hit, missed or expired) is a finished
        // chart even if its last judged clock position is short of the final
        // miss-window boundary. This preserves an earned score when frames
        // stop after the final hit; unresolved charts still abort.
        const modelResolved =
            state.pendingNotes.length === 0 ||
            state.elapsedSeconds + 0.05 >= this.finalNoteResolvedSeconds
        if (!mediaReachedFinalNote || !modelResolved) {
            this.playError =
                'Playback was interrupted. Press Start to try again.'
            this.abortActiveRun(null)
        }
    }

    private attachTimeUpdates(): void {
        if (this.timeUpdateAttached) {
            return
        }
        this.timeUpdateAttached = true
        this.game.on('time-update', this.handleTimeUpdate)
    }

    private detachTimeUpdates(): void {
        if (!this.timeUpdateAttached) {
            return
        }
        this.timeUpdateAttached = false
        this.game.off('time-update', this.handleTimeUpdate)
    }

    private async prepareInternal(): Promise<void> {
        this.audioState = 'loading'
        this.audioLoaded = false
        this.notify()
        try {
            const player = await this.createPlayer()
            if (this.disposed) {
                try {
                    player.remove()
                } catch {
                    // Disposal won the race; release is best-effort.
                }
                return
            }
            this.player = player
            this.statusSubscription = player.addListener(
                'playbackStatusUpdate',
                status => this.handleStatus(status)
            )
            await new Promise<void>((resolve, reject) => {
                if (player.isLoaded || this.audioLoaded) {
                    resolve()
                    return
                }
                if (this.audioState === 'error') {
                    reject(new Error('Audio failed to load'))
                    return
                }
                this.loadWaiter = { resolve, reject }
                this.loadTimer = setTimeout(() => {
                    const waiter = this.loadWaiter
                    this.loadWaiter = null
                    this.audioState = 'error'
                    this.audioLoaded = false
                    this.notify()
                    waiter?.reject(new Error('Audio load timed out'))
                }, LOAD_TIMEOUT_MS)
            })
            if (this.disposed) {
                return
            }
            this.clearLoadWait()
            this.audioLoaded = true
            this.audioState = 'ready'
            this.notify()
        } catch (error) {
            this.clearLoadWait()
            if (!this.disposed) {
                this.audioState = 'error'
                this.audioLoaded = false
                this.notify()
            }
            throw error
        }
    }

    private handleStatus(status: RhythmAudioStatus): void {
        if (this.disposed) {
            return
        }
        if (status.error) {
            if (this.game.getState().isActive) {
                this.playError = 'Playback failed. Press Start to try again.'
                this.audioState = 'error'
                this.audioLoaded = false
                this.prepared = null
                this.abortActiveRun(null)
            } else {
                this.failLoad(new Error(status.error))
                this.settlePlaybackGate(
                    new Error('Playback failed. Press Start to try again.')
                )
            }
            return
        }
        if (status.isLoaded) {
            // Expo on Android excludes STATE_ENDED from the player getter,
            // while the status still reports ended audio as loaded. Track
            // status readiness separately so a natural EOF can be rewound
            // and replayed.
            this.audioLoaded = true
            // Only an in-flight preparation can transition to ready; an
            // already-failed run must go through the explicit reprepare path.
            if (this.audioState === 'loading') {
                this.audioState = 'ready'
                this.resolveLoadWait()
                this.notify()
            }
        }
        this.checkPlaybackGate()
    }

    private async ensureAudioReady(): Promise<void> {
        if (
            this.audioState === 'ready' &&
            this.player !== null &&
            this.audioLoaded
        ) {
            return
        }
        if (this.audioState === 'loading' && this.prepared !== null) {
            await this.prepare()
            return
        }
        // Post-preparation failure: recreate the player rather than reusing
        // a dead one; the cached rejected/resolved preparation is cleared.
        this.disposePlayer()
        this.prepared = null
        this.audioState = 'loading'
        this.audioLoaded = false
        await this.prepare()
    }

    /**
     * Configure the shared audio session only when a run actually starts:
     * loading the track should not steal other audio focus or pause music.
     */
    private async ensureAudioSession(): Promise<void> {
        if (this.audioSessionReady) {
            return
        }
        const { setAudioModeAsync } = loadExpoAudio()
        await setAudioModeAsync({
            playsInSilentMode: true,
            interruptionMode: 'doNotMix',
        })
        this.audioSessionReady = true
    }

    private waitForPlayback(attempt: number): Promise<void> {
        const check = (): boolean =>
            this.player !== null &&
            this.audioLoaded &&
            this.player.playing &&
            // A failed Android EOF rewind would still report the old 60 s
            // position; requiring a rewound position proves the seek landed.
            this.player.currentTime < RHYTHM_REACTOR_RULES.duration - 0.5
        if (check()) {
            return Promise.resolve()
        }
        return new Promise<void>((resolve, reject) => {
            this.playbackGate = { attempt, check, resolve, reject }
            this.playbackGateTimer = setTimeout(() => {
                this.settlePlaybackGate(
                    new Error(
                        'The click track did not start. Press Start to try again.'
                    )
                )
            }, PLAYBACK_CONFIRM_TIMEOUT_MS)
            this.playbackGateInterval = setInterval(() => {
                this.checkPlaybackGate()
            }, 50)
        })
    }

    private checkPlaybackGate(): void {
        const gate = this.playbackGate
        if (gate === null) {
            return
        }
        if (!this.isStartCurrent(gate.attempt)) {
            this.settlePlaybackGate(new Error(''))
            return
        }
        if (gate.check()) {
            this.settlePlaybackGate(null)
        }
    }

    private settlePlaybackGate(error: Error | null): void {
        if (this.playbackGateTimer !== null) {
            clearTimeout(this.playbackGateTimer)
            this.playbackGateTimer = null
        }
        if (this.playbackGateInterval !== null) {
            clearInterval(this.playbackGateInterval)
            this.playbackGateInterval = null
        }
        const gate = this.playbackGate
        this.playbackGate = null
        if (gate === null) {
            return
        }
        if (error !== null) {
            gate.reject(error)
        } else {
            gate.resolve()
        }
    }

    private isStartCurrent(attempt: number): boolean {
        return (
            !this.disposed &&
            this.appIsActive &&
            attempt === this.startAttempt &&
            !this.game.getState().isActive
        )
    }

    private invalidatePendingStart(): void {
        this.startAttempt += 1
        if (this.starting || this.playbackGate !== null) {
            this.starting = false
            this.settlePlaybackGate(new Error(''))
            this.stopAudio()
            this.notify()
        }
    }

    private disposePlayer(): void {
        this.statusSubscription?.remove()
        this.statusSubscription = null
        const player = this.player
        this.player = null
        this.audioLoaded = false
        if (player === null) {
            return
        }
        try {
            player.pause()
        } catch {
            // A released native player may already be paused/gone.
        }
        try {
            player.remove()
        } catch {
            // Release is best-effort during teardown.
        }
    }

    private catchUpToAudio(
        player: RhythmAudioPlayer,
        elapsedSeconds: number
    ): void {
        const target = this.targetSeconds(player.currentTime)
        const delta = Math.max(0, target - elapsedSeconds)
        if (delta > 0) {
            // The model must accept the full media duration so a 200 ms
            // frame hitch catches up in one step (web keeps its 0.1 s cap).
            this.game.update(delta)
        }
    }

    private targetSeconds(currentTime: number): number {
        const corrected = currentTime - this.calibrationMs / 1000
        return Math.min(RHYTHM_REACTOR_RULES.duration, Math.max(0, corrected))
    }

    private abortActiveRun(notice: string | null): void {
        if (this.aborting || !this.game.getState().isActive) {
            return
        }
        this.aborting = true
        try {
            this.stopAudio()
            this.runStartedAtMs = null
            this.game.reset()
            this.notice = notice
        } finally {
            this.aborting = false
        }
        this.notify()
    }

    private stopAudio(): void {
        const player = this.player
        if (player === null) {
            return
        }
        try {
            player.pause()
        } catch {
            // Already stopped/finished: rewind below is still attempted.
        }
        try {
            void Promise.resolve(player.seekTo(0)).catch(() => {})
        } catch {
            // Seek refusal cannot keep a scored run alive.
        }
    }

    private failLoad(error: Error): void {
        this.clearLoadWait(error)
        this.audioState = 'error'
        this.audioLoaded = false
        this.prepared = null
        this.notify()
    }

    private resolveLoadWait(): void {
        this.clearLoadWait()
    }

    private clearLoadWait(error?: Error): void {
        if (this.loadTimer !== null) {
            clearTimeout(this.loadTimer)
            this.loadTimer = null
        }
        const waiter = this.loadWaiter
        this.loadWaiter = null
        if (waiter === null) {
            return
        }
        if (error) {
            waiter.reject(error)
        } else {
            waiter.resolve()
        }
    }

    private detachAppState(): void {
        this.appStateSubscription?.remove()
        this.appStateSubscription = null
    }

    private notify(): void {
        for (const handler of [...this.wakeHandlers]) {
            handler()
        }
    }
}

const runs = new WeakMap<RhythmReactorGame, RhythmReactorRun>()

/** Create the one runtime companion for a game instance (idempotent). */
export function createRhythmReactorRun(
    game: RhythmReactorGame,
    options: RhythmReactorRunOptions = {}
): RhythmReactorRun {
    const existing = runs.get(game)
    if (existing !== undefined) {
        return existing
    }
    const run = new RhythmReactorRun(game, options)
    runs.set(game, run)
    return run
}

export function getRhythmReactorRun(game: RhythmReactorGame): RhythmReactorRun {
    const run = runs.get(game)
    if (run === undefined) {
        throw new Error('Rhythm Reactor runtime run missing')
    }
    return run
}
