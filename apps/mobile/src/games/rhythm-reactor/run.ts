import { AppState } from 'react-native'
import type { RhythmReactorGame } from '@cetus/games/rhythm-reactor/RhythmReactorGame'
import {
    RHYTHM_REACTOR_RULES,
    type RhythmReactorHitResult,
} from '@cetus/games/rhythm-reactor/types'

/**
 * Calibration is a pre-run player-time correction. Positive values move the
 * chart "earlier" by subtracting from the media position; the bound keeps a
 * mistyped value from swallowing an entire hit range.
 */
export const RHYTHM_REACTOR_CALIBRATION_STEP_MS = 10
export const RHYTHM_REACTOR_CALIBRATION_LIMIT_MS = 200

/** A local asset that never loads must fail visibly instead of leaving the
 *  shared binding-pending shell up forever. */
const LOAD_TIMEOUT_MS = 10_000

/** Frames delivered without media playback confirmation before the run is
 *  aborted. This is the JS-side guard for a silently refused `play()`. */
const PLAYBACK_CONFIRM_SECONDS = 1.5

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
    private aborting = false
    private audioSessionReady = false
    private unconfirmedPlaybackSeconds = 0
    private disposed = false

    constructor(
        game: RhythmReactorGame,
        options: RhythmReactorRunOptions = {}
    ) {
        this.game = game
        this.createPlayer = options.createPlayer ?? createExpoAudioPlayer
    }

    /** Resolves only once the track is decoded/ready; rejects on load error
     *  or timeout so the host can show its setup-error retry path. */
    prepare(): Promise<void> {
        if (this.prepared === null) {
            this.prepared = this.prepareInternal()
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
     * Chrome Start/Replay seam. The model never starts unless the track is
     * loaded and `play()` is accepted; a rejection keeps it idle.
     */
    async start(): Promise<void> {
        if (this.starting) {
            return
        }
        const state = this.game.getState()
        if (state.isActive) {
            return
        }
        this.starting = true
        this.playError = null
        this.notice = null
        this.unconfirmedPlaybackSeconds = 0
        try {
            const player = this.player
            if (
                player === null ||
                this.audioState !== 'ready' ||
                !player.isLoaded
            ) {
                this.playError =
                    'The click track is not ready. Press Start to try again.'
                return
            }
            await this.ensureAudioSession()
            if (this.disposed || this.game.getState().isActive) {
                return
            }
            await player.seekTo(0)
            if (this.disposed || this.game.getState().isActive) {
                return
            }
            player.play()
            this.game.start()
        } catch {
            if (this.game.getState().isActive) {
                this.game.reset()
            }
            this.playError =
                'The click track could not start. Press Start to try again.'
        } finally {
            this.starting = false
            this.notify()
        }
    }

    /** Manual Reset: stop/rewind the track and clear the run locally. */
    reset(): void {
        this.stopAudio()
        this.unconfirmedPlaybackSeconds = 0
        this.playError = null
        this.notice = null
        this.game.reset()
        this.notify()
    }

    /** One shared-frame-loop step. The delta argument only drives the silent
     *  playback watchdog; chart time always comes from `player.currentTime`. */
    advance(deltaSeconds: number): void {
        const state = this.game.getState()
        if (!state.isActive || state.isPaused || state.isGameOver) {
            this.unconfirmedPlaybackSeconds = 0
            return
        }
        const player = this.player
        if (player === null || !player.isLoaded || !player.playing) {
            // A finished 60 s track stops reporting playback just before the
            // independent wall timer ends: never mistake that for a refused
            // start.
            if (
                player !== null &&
                player.currentTime >= RHYTHM_REACTOR_RULES.duration - 0.05
            ) {
                return
            }
            this.unconfirmedPlaybackSeconds += Math.max(0, deltaSeconds)
            if (this.unconfirmedPlaybackSeconds >= PLAYBACK_CONFIRM_SECONDS) {
                this.playError =
                    'The click track did not start. Press Start to try again.'
                this.abortActiveRun(null)
            }
            return
        }
        this.unconfirmedPlaybackSeconds = 0
        this.catchUpToAudio(player, state.elapsedSeconds)
    }

    /** Lane tap: catch up to the media position before the model judges it. */
    tap(laneIndex: number): RhythmReactorHitResult {
        const player = this.player
        if (player !== null && player.isLoaded && player.playing) {
            this.catchUpToAudio(player, this.game.getState().elapsedSeconds)
        }
        return this.game.hitLane(laneIndex)
    }

    /**
     * Rhythm-specific background policy: leaving the foreground aborts a
     * live run to idle. No pausing, no auto-resume, no score POST.
     */
    attachAppState(): () => void {
        if (this.appStateSubscription === null) {
            this.appStateSubscription = AppState.addEventListener(
                'change',
                next => {
                    if (next !== 'active' && this.game.getState().isActive) {
                        this.notice =
                            'Run stopped when the app left the foreground. Start again to replay.'
                        this.abortActiveRun(this.notice)
                    }
                }
            )
        }
        return () => this.detachAppState()
    }

    dispose(): void {
        if (this.disposed) {
            return
        }
        this.disposed = true
        this.detachAppState()
        this.clearLoadWait()
        this.statusSubscription?.remove()
        this.statusSubscription = null
        const player = this.player
        this.player = null
        if (player !== null) {
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
        this.wakeHandlers.clear()
    }

    private async prepareInternal(): Promise<void> {
        this.audioState = 'loading'
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
                if (player.isLoaded) {
                    resolve()
                    return
                }
                this.loadWaiter = { resolve, reject }
                this.loadTimer = setTimeout(() => {
                    const waiter = this.loadWaiter
                    this.loadWaiter = null
                    this.audioState = 'error'
                    this.notify()
                    waiter?.reject(new Error('Audio load timed out'))
                }, LOAD_TIMEOUT_MS)
            })
            if (this.disposed) {
                return
            }
            this.clearLoadWait()
            this.audioState = 'ready'
            this.notify()
        } catch (error) {
            this.clearLoadWait()
            if (!this.disposed) {
                this.audioState = 'error'
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
                this.abortActiveRun(null)
            } else {
                this.failLoad(new Error(status.error))
            }
            return
        }
        if (status.isLoaded && this.audioState !== 'ready') {
            this.audioState = 'ready'
            this.resolveLoadWait()
            this.notify()
        }
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
            this.unconfirmedPlaybackSeconds = 0
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
