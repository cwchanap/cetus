import type { BaseGameStats } from '@cetus/games'
import type { ScoreSubmissionResult } from '@cetus/shared/scores'

/**
 * Display-only data for a finished run, built from the structured `end`
 * event BaseGame emits after its injected `submitScore` resolves. It feeds
 * UI surfaces (results sheet); it is never a notification source and the
 * score is never re-submitted from it. Reward fields are absent for stale
 * runs — BaseGame already suppresses them.
 */
export interface GameSessionResult {
    score: number
    stats: BaseGameStats
    newAchievements?: NonNullable<ScoreSubmissionResult['newAchievements']>
    challengeUpdates?: NonNullable<ScoreSubmissionResult['challengeUpdates']>
}

/**
 * One immutable cached snapshot of the adapted game. `projected` carries the
 * game's own HUD fields; keep its identity stable for unchanged values so
 * `useSyncExternalStore` never loops on `BaseGame.getState()`'s fresh
 * objects. `result` is provisional (live score + stats) until the
 * structured end event lands after the score save; the timer-forwarded
 * bare `end` finishes the run without carrying one.
 */
export interface GameSessionSnapshot<TProjected> {
    status: 'idle' | 'running' | 'paused' | 'finished'
    score: number
    timeRemaining: number
    projected: TProjected
    result: GameSessionResult | null
}

/** Controls derived from the game config; callers hide unavailable ones. */
export interface GameSessionCapabilities {
    pausable: boolean
    resettable: boolean
}

/** Actions delegated to the game. No `end`: games end via gameplay. */
export interface GameSessionActions {
    start(): void
    pause(): void
    resume(): void
    reset(): void
}

/**
 * Stable session adapter over one game run. `subscribe`/`getCachedSnapshot`
 * are bound closures safe to hand to `useSyncExternalStore` directly.
 */
export interface GameSession<TProjected> {
    subscribe(onStoreChange: () => void): () => void
    getCachedSnapshot(): GameSessionSnapshot<TProjected>
    readonly capabilities: GameSessionCapabilities
    readonly actions: GameSessionActions
    dispose(): void
}
