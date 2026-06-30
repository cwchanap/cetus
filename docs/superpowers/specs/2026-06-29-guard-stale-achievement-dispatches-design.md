# Guard Stale Achievement Dispatches — Design Spec

- **Linear issue:** [HPA-91 — Guard stale achievement dispatches across all games (run-id token)](https://linear.app/cwchanap/issue/HPA-91/guard-stale-achievement-dispatches-across-all-games-run-id-token)
- **Date:** 2026-06-29
- **Status:** Approved design, ready for implementation planning

## Problem

`onSolved` / `onGameOver` callbacks are async (network I/O via `saveGameScore`)
but invoked fire-and-forget in every game's `init.ts`. If a user starts a new
run mid-submit (e.g. clicks "Play Again" while the previous score is still
saving), achievement toasts from the stale run can fire during the new run.

Exploration found the race is wider than the issue text describes: the stale
toast can surface through **three** independent UI paths, all of which fire
after an `await` on the score submission:

1. **`scoreService.saveGameScore` → `window.showAchievementAward` /
   `window.showChallengeComplete`** (`scoreService.ts:138,148`). Shared by every
   caller. Notably `path-navigator/index.astro` and `sudoku/index.astro` pass
   **no** `onSuccess` callback and rely entirely on these direct calls.
2. **Per-game `onSuccess` → `achievementsEarned` `CustomEvent`** — the path
   called out in the issue.
3. **Core-framework `game.on('end')` → `window.showAchievementAward`** — in
   `GameInitializer.ts:276`, `bejeweled/init.ts:147`, and
   `snake/initFramework.ts:140`. `BaseGame.end()` does
   `await scoreManager.saveFinalScore()` **then** `emit('end', { newAchievements })`
   (`BaseGame.ts:162-170`), so a reset during the save makes the stale `end`
   event fire afterwards. `ScoreManager` uses its **own** `fetch` (not
   `saveGameScore`) when `achievementIntegration` is on (`ScoreManager.ts:129`),
   so the central `saveGameScore` guard does not reach this path.

A per-game-only guard (as literally suggested in the issue) closes only path
#2 and leaves paths #1 and #3 racy. This spec closes all three.

## Non-goals

- Aborting in-flight score submissions. The score **must** still be saved
  server-side; only the client-side UI side-effects of the stale run are
  suppressed.
- Changing the toast/achievement UI components themselves.
- Refactoring the heterogeneous `init.ts` architectures beyond what is needed
  to thread the guard.

## Design — guard at the two async boundaries

A single concept (a per-run token) is checked at each boundary where an async
gap precedes a UI side-effect. Two chokepoints cover all three paths, plus a
small shared helper to standardize the token bookkeeping for the legacy
callers.

### 1. Shared helper: `createRunGuard()`

New file `src/lib/games/core/runGuard.ts`:

```ts
export interface RunGuard {
    /** Advance to a new run. Call at each run start. Returns the new run id. */
    next: () => number
    /** The current run id (capture this at game-over before awaiting). */
    current: () => number
    /** True if `runId` is no longer the current run. */
    isStale: (runId: number) => boolean
}

export function createRunGuard(): RunGuard {
    let currentRun = 0
    return {
        next: () => ++currentRun,
        current: () => currentRun,
        isStale: runId => runId !== currentRun,
    }
}
```

Exported from `src/lib/games/core/index.ts`.

A monotonic counter (not `Symbol`) is used: cheaper, `===`-comparable, and
serializable. Each game instance owns its own guard so tokens never collide
across games.

### 2. Chokepoint one — `scoreService.saveGameScore` (paths #1, #2, and `.astro`)

Add an optional options object carrying an `isStale` callback:

```ts
export interface SaveScoreOptions {
    /** If set and returns true after the save resolves, suppress all UI callbacks. */
    isStale?: () => boolean
}

export async function saveGameScore(
    gameId: GameType,
    score: number,
    onSuccess?: (result: ScoreSubmissionResult) => void,
    onError?: (error: string) => void,
    gameData?: GameData | Record<string, unknown>,
    options?: SaveScoreOptions
): Promise<void>
```

Behavior change, inside `saveGameScore`:

```ts
if (score <= 0) return
const result = await submitScore({ gameId, score, gameData })
if (options?.isStale?.()) return   // stale run — suppress every UI side-effect
// …existing success / error branching (showAchievementAward,
//   showChallengeComplete, onSuccess, onError) unchanged…
```

Rationale for suppressing `onError` too: an error toast ("Score Not Saved")
about an old run is just as stale/confusing during a new run as an achievement
toast. The submission itself still completed (or failed) server-side; only the
client notification is suppressed. This also keeps the guard in one place
rather than forcing each caller to wrap both callbacks.

This is fully backward-compatible: existing positional callers (including the
two `.astro` pages, which will be updated to pass the guard) continue to work
unchanged if `options` is omitted — they simply remain unguarded, which is no
worse than today.

### 3. Chokepoint two — `BaseGame` + `ScoreManager` (path #3)

`BaseGame` owns an internal run token:

- `start()` and `reset()` bump the token (`this.runGuard.next()`).
- `end()` captures `const runId = this.runGuard.current()` **before** the await,
  then after `await saveFinalScore(...)`, if `this.runGuard.isStale(runId)` it
  emits the `end` event **without** `newAchievements` (the only field the
  achievement listeners consume). `score`, `stats`, and `onEnd` are unaffected
  — only achievement toasts are suppressed for the stale run.

`ScoreManager.saveFinalScore` forwards the guard to `saveGameScore` so its
direct `showAchievementAward` / `showChallengeComplete` calls are also
suppressed when `achievementIntegration` is off (the path that hits
`saveGameScore` at `ScoreManager.ts:152`):

```ts
async saveFinalScore(
    gameData?: Record<string, unknown>,
    isStale?: () => boolean
): Promise<{ success: boolean; newAchievements?: string[] }>
```

`BaseGame.end()` passes `() => this.runGuard.isStale(runId)` through. The
`achievementIntegration`-on raw-fetch branch returns `newAchievements`
regardless; `BaseGame.end()` strips them from the `end` event when stale, so
listeners (the only consumers) never see them.

This covers `GameInitializer`, `bejeweled/init.ts`, and
`snake/initFramework.ts` automatically — they all listen to `end` — with **no
edits** to those listener sites.

### Caller wiring (the ~14 `init.ts` files + 2 `.astro` pages)

Each legacy caller:

1. Constructs a `RunGuard` in the closure that lives across runs.
2. Calls `guard.next()` at its run-start point (the existing `startGame` /
   `resetGame` / handle `start()` / `initGame` / "Play Again" handler).
3. At game-over, captures `const runId = guard.current()` before awaiting and
   passes `options: { isStale: () => guard.isStale(runId) }` to `saveGameScore`.

The run-start point varies by architecture and will be enumerated in the
implementation plan:

- **Legacy state-machine games** (tetris, bubble-shooter, memory-matrix,
  quick-math, word-scramble, reflex, 2048, evader, snake-legacy) — bump in the
  function that begins a run (e.g. `startGame` / `resetGame` / `handleStart`).
- **Handle-based games** (circuit-hacker, satellite-sync) — bump at the top of
  the handle's `start()` (which is re-invoked on every play).
- **`.astro` inline games** (path-navigator, sudoku) — bump in the inline
  start / `initGame` handler; thread `isStale` into the existing dynamic-import
  `saveGameScore` call.
- **Core-framework games** (bejeweled, snake-framework, any `GameInitializer`
  consumer) — **no caller change**; covered by `BaseGame`.

### What gets guarded vs. not

- **Guarded (suppressed when stale):** achievement toasts, challenge toasts,
  the `achievementsEarned` event, and `onError` score-error toasts.
- **Not guarded (still shown):** the game-over overlay, final-score text, and
  button-state resets — these are synchronous UI for the run that just ended
  and are shown *before* the await, so they are not part of the race. They are
  intentionally left alone.

## Testing

- **Unit: `runGuard.test.ts`** — `next()` increments, `isStale()` true after a
  `next()`, false otherwise, independent instances don't collide.
- **Unit: `scoreService.test.ts`** — extend the existing suite: when `isStale`
  returns true after the await, none of `showAchievementAward`,
  `showChallengeComplete`, `onSuccess`, `onError` are invoked; when false or
  omitted, behavior is unchanged (existing tests stay green).
- **Unit: `BaseGame` / `core.test.ts`** — after `end()` awaits, if the run was
  reset during the save the emitted `end` event has no `newAchievements`; if
  not reset, `newAchievements` are present as today.
- **Per-game `init.test.ts`** — for one representative legacy game and one
  handle-based game, assert that starting a new run before the prior
  `saveGameScore` resolves suppresses the `achievementsEarned` dispatch (and
  vice-versa for the in-progress run). Existing "dispatches achievementsEarned"
  tests remain valid (no stale bump → still dispatched) and stay green.

## Files touched (summary)

- **New:** `src/lib/games/core/runGuard.ts`, `runGuard.test.ts`.
- **Core:** `src/lib/services/scoreService.ts`,
  `src/lib/games/core/BaseGame.ts`, `src/lib/games/core/ScoreManager.ts`,
  `src/lib/games/core/index.ts`.
- **Callers:** the ~9 legacy `init.ts` files, `circuit-hacker/init.ts`,
  `satellite-sync/init.ts`, `snake/game.ts` (legacy path), and the
  `path-navigator/index.astro` + `sudoku/index.astro` inline scripts.
- **Untouched:** `GameInitializer.ts`, `bejeweled/init.ts`,
  `snake/initFramework.ts` (covered automatically via `BaseGame`); the toast UI
  components.

## Future games

Any new game extending `BaseGame` gets path #3 protection automatically. Any
new legacy-style game gets protection by constructing a `RunGuard` and passing
`isStale` to `saveGameScore`. The `runGuard` helper + the `saveGameScore`
option are the documented contract.
