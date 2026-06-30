# Guard Stale Achievement Dispatches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent achievement/challenge toasts from a stale game run (a previous run whose async score save is still in flight) from firing during a new run, across every game.

**Architecture:** A per-run monotonic-token guard is checked at the two async boundaries where a stale UI side-effect can fire: (1) `scoreService.saveGameScore` (covers its direct `showAchievementAward`/`showChallengeComplete` calls and every caller's `onSuccess`/`onError`), and (2) `BaseGame.end()` (covers the core-framework `game.on('end')` listeners, which use a separate `ScoreManager` fetch path). A shared `createRunGuard()` helper standardizes the token bookkeeping for the legacy callers.

**Tech Stack:** TypeScript, Astro, Vitest (jsdom), the existing core game framework (`src/lib/games/core/`).

## Global Constraints

- Package manager is **Bun** (`bun@1.3.1`). Run a single test file with `bun run test src/lib/.../x.test.ts` (watch) or `bun run test:run src/lib/.../x.test.ts` (once).
- Full verification commands: `bun run test:run` (all unit tests), `bun run lint` (ESLint), `bun run astro check` (TypeScript typecheck via Astro).
- The score **must still be saved** server-side. Only client-side UI side-effects of the stale run are suppressed. Never abort the `saveGameScore`/`submitScore` fetch.
- Do **not** add comments to code unless asked (per AGENTS.md). The code snippets below contain comments only where they document the non-obvious guard semantics — keep them; they are the "why" for future readers.
- Do not touch `GameInitializer.ts`, `bejeweled/init.ts`, or `snake/initFramework.ts` — path #3 for those is covered automatically by the `BaseGame` change.
- `saveGameScore`'s new `options` parameter is optional and last (6th positional arg) so all existing positional callers keep working unmodified until wired.

---

### Task 1: `createRunGuard()` helper + export + unit tests

**Files:**
- Create: `src/lib/games/core/runGuard.ts`
- Create: `src/lib/games/core/runGuard.test.ts`
- Modify: `src/lib/games/core/index.ts`

**Interfaces:**
- Produces: `createRunGuard(): RunGuard` where `RunGuard = { next(): number; current(): number; isStale(runId: number): boolean }`. `next()` advances the run and returns the new id; `current()` returns the active id; `isStale(runId)` returns `runId !== current()`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/games/core/runGuard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createRunGuard } from './runGuard'

describe('createRunGuard', () => {
    it('next() returns an incrementing run id starting at 1', () => {
        const g = createRunGuard()
        expect(g.next()).toBe(1)
        expect(g.next()).toBe(2)
    })

    it('isStale() is false for the current run and true after next()', () => {
        const g = createRunGuard()
        const run = g.next()
        expect(g.isStale(run)).toBe(false)
        g.next()
        expect(g.isStale(run)).toBe(true)
    })

    it('current() reflects the latest run id', () => {
        const g = createRunGuard()
        expect(g.current()).toBe(0)
        g.next()
        expect(g.current()).toBe(1)
    })

    it('independent guards do not share run ids', () => {
        const a = createRunGuard()
        const b = createRunGuard()
        const aRun = a.next()
        const bRun = b.next()
        expect(aRun).toBe(1)
        expect(bRun).toBe(1)
        expect(a.isStale(bRun)).toBe(true)
        expect(b.isStale(aRun)).toBe(true)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/lib/games/core/runGuard.test.ts`
Expected: FAIL — `Cannot find module './runGuard'` (or similar resolution error).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/games/core/runGuard.ts`:

```ts
export interface RunGuard {
    /** Advance to a new run. Call at each run start. Returns the new run id. */
    next: () => number
    /** The current run id (capture this before awaiting on game-over). */
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

- [ ] **Step 4: Export from the core barrel**

In `src/lib/games/core/index.ts`, add this line immediately after the `BaseGame` export (after line 2):

```ts
export { createRunGuard } from './runGuard'
export type { RunGuard } from './runGuard'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test:run src/lib/games/core/runGuard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/games/core/runGuard.ts src/lib/games/core/runGuard.test.ts src/lib/games/core/index.ts
git commit -m "feat(games): add createRunGuard run-token helper"
```

---

### Task 2: `saveGameScore` staleness guard + tests

**Files:**
- Modify: `src/lib/services/scoreService.ts`
- Test: `src/lib/services/scoreService.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `saveGameScore` gains an optional 6th parameter `options?: SaveScoreOptions` where `SaveScoreOptions = { isStale?: () => boolean }`. When `options.isStale?.()` returns true after the submit resolves, `saveGameScore` returns early, suppressing `showAchievementAward`, `showChallengeComplete`, `onSuccess`, and `onError`.

- [ ] **Step 1: Write failing tests**

Append a new `describe` block inside the top-level `describe('Score Service', ...)` in `src/lib/services/scoreService.test.ts`, immediately before its closing `})` (the one that precedes `describe('getUserGameHistory - non-ok response', ...)`):

```ts
    describe('saveGameScore stale-run guard', () => {
        it('suppresses all callbacks when isStale returns true on success', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        success: true,
                        newAchievements: [{ id: 'x', name: 'X' }],
                        challengeUpdates: {
                            completedChallenges: [{ id: 'c' }],
                            xpEarned: 10,
                            levelUp: false,
                        },
                    }),
            })

            const onSuccess = vi.fn()
            const onError = vi.fn()
            mockWindow.showAchievementAward = vi.fn()
            mockWindow.showChallengeComplete = vi.fn()

            await saveGameScore(
                GameID.TETRIS,
                100,
                onSuccess,
                onError,
                undefined,
                { isStale: () => true }
            )

            expect(onSuccess).not.toHaveBeenCalled()
            expect(onError).not.toHaveBeenCalled()
            expect(mockWindow.showAchievementAward).not.toHaveBeenCalled()
            expect(mockWindow.showChallengeComplete).not.toHaveBeenCalled()
        })

        it('suppresses onError when isStale returns true on a failed submit', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Server Error'),
            })

            const onError = vi.fn()
            await saveGameScore(
                GameID.TETRIS,
                100,
                undefined,
                onError,
                undefined,
                { isStale: () => true }
            )

            expect(onError).not.toHaveBeenCalled()
        })

        it('behaves normally when isStale returns false', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({ success: true, newAchievements: [] }),
            })

            const onSuccess = vi.fn()
            await saveGameScore(
                GameID.TETRIS,
                100,
                onSuccess,
                undefined,
                undefined,
                { isStale: () => false }
            )

            expect(onSuccess).toHaveBeenCalled()
        })

        it('behaves normally when options is omitted', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({ success: true, newAchievements: [] }),
            })

            const onSuccess = vi.fn()
            await saveGameScore(GameID.TETRIS, 100, onSuccess)

            expect(onSuccess).toHaveBeenCalled()
        })
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run src/lib/services/scoreService.test.ts`
Expected: the 4 new tests FAIL (the `isStale` option is ignored today, so `onSuccess`/`onError`/the window fns are still called).

- [ ] **Step 3: Add the `SaveScoreOptions` type**

In `src/lib/services/scoreService.ts`, add this interface immediately after the `ScoreData` interface (after line 64):

```ts
export interface SaveScoreOptions {
    /** If set and returns true after the save resolves, suppress all UI callbacks. */
    isStale?: () => boolean
}
```

- [ ] **Step 4: Add the `options` parameter and staleness check**

In `src/lib/services/scoreService.ts`, replace the `saveGameScore` signature and the body's opening with the guarded version. Replace this exact block:

```ts
export async function saveGameScore(
    gameId: GameType,
    score: number,
    onSuccess?: (result: ScoreSubmissionResult) => void,
    onError?: (error: string) => void,
    gameData?: GameData | Record<string, unknown>
): Promise<void> {
    if (score <= 0) {
        return
    }

    try {
        const result = await submitScore({ gameId, score, gameData })

        if (result.success) {
```

with:

```ts
export async function saveGameScore(
    gameId: GameType,
    score: number,
    onSuccess?: (result: ScoreSubmissionResult) => void,
    onError?: (error: string) => void,
    gameData?: GameData | Record<string, unknown>,
    options?: SaveScoreOptions
): Promise<void> {
    if (score <= 0) {
        return
    }

    try {
        const result = await submitScore({ gameId, score, gameData })

        // Stale run: a newer run began while this save was in flight. The
        // score was still persisted server-side; only suppress this run's
        // client-side UI side-effects (toasts + callbacks).
        if (options?.isStale?.()) {
            return
        }

        if (result.success) {
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test:run src/lib/services/scoreService.test.ts`
Expected: PASS — all existing tests plus the 4 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/scoreService.ts src/lib/services/scoreService.test.ts
git commit -m "feat(scores): guard saveGameScore UI callbacks with isStale option"
```

---

### Task 3: `BaseGame` + `ScoreManager` staleness guard (path #3)

**Files:**
- Modify: `src/lib/games/core/ScoreManager.ts`
- Modify: `src/lib/games/core/BaseGame.ts`
- Test: `src/lib/games/core/core.test.ts`

**Interfaces:**
- Consumes: `createRunGuard` from `./runGuard`, `SaveScoreOptions` shape (`{ isStale?: () => boolean }`).
- Produces: `ScoreManager.saveFinalScore(gameData?, isStale?)` forwards `isStale` to `saveGameScore`; `BaseGame.end()` suppresses `newAchievements` in the `end` event when the run is stale. `BaseGame` bumps its internal guard on `start()` and `reset()`.

- [ ] **Step 1: Write failing tests**

In `src/lib/games/core/core.test.ts`, add a new `describe` block at the end of the file (after the final `})`):

```ts
describe('BaseGame stale-run guard', () => {
    it('includes newAchievements in end event when the run is not stale', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ newAchievements: ['first_win'] }),
        })
        vi.stubGlobal('fetch', fetchMock)

        class MiniGame extends BaseGame {
            createInitialState() {
                return {
                    score: 0,
                    timeRemaining: 60,
                    isActive: false,
                    isPaused: false,
                    isGameOver: false,
                    gameStarted: false,
                }
            }
            update() {}
            render() {}
            cleanup() {}
            getGameStats() {
                return { finalScore: 0, timeElapsed: 0, gameCompleted: false }
            }
        }

        const game = new MiniGame(
            GameID.QUICK_MATH,
            {
                duration: 60,
                achievementIntegration: true,
                pausable: false,
                resettable: true,
            },
            {}
        )
        const endEvents: Array<{ data: { newAchievements?: string[] } }> = []
        game.on('end', e => endEvents.push(e as any))

        game.start()
        await game.end()

        expect(endEvents).toHaveLength(1)
        expect(endEvents[0].data.newAchievements).toEqual(['first_win'])

        vi.unstubAllGlobals()
    })

    it('suppresses newAchievements in end event when reset happens during the save', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ newAchievements: ['first_win'] }),
        })
        vi.stubGlobal('fetch', fetchMock)

        class MiniGame extends BaseGame {
            createInitialState() {
                return {
                    score: 0,
                    timeRemaining: 60,
                    isActive: false,
                    isPaused: false,
                    isGameOver: false,
                    gameStarted: false,
                }
            }
            update() {}
            render() {}
            cleanup() {}
            getGameStats() {
                return { finalScore: 0, timeElapsed: 0, gameCompleted: false }
            }
        }

        const game = new MiniGame(
            GameID.QUICK_MATH,
            {
                duration: 60,
                achievementIntegration: true,
                pausable: false,
                resettable: true,
            },
            {}
        )
        const endEvents: Array<{ data: { newAchievements?: string[] } }> = []
        game.on('end', e => endEvents.push(e as any))

        game.start()
        const endPromise = game.end() // do not await yet; save is in flight
        game.reset() // user starts a new run -> stale
        await endPromise

        expect(endEvents).toHaveLength(1)
        expect(endEvents[0].data.newAchievements).toBeUndefined()

        vi.unstubAllGlobals()
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run src/lib/games/core/core.test.ts`
Expected: the second test FAILS (`newAchievements` is `['first_win']` today instead of `undefined`). The first test passes already (it documents current behavior) but keep it as a regression guard.

- [ ] **Step 3: Forward `isStale` through `ScoreManager.saveFinalScore`**

In `src/lib/games/core/ScoreManager.ts`, replace the `saveFinalScore` method signature and the non-integration `saveGameScore` call. Replace this exact block:

```ts
    async saveFinalScore(
        gameData?: Record<string, unknown>
    ): Promise<{ success: boolean; newAchievements?: string[] }> {
        try {
            if (this.config.achievementIntegration) {
```

with:

```ts
    async saveFinalScore(
        gameData?: Record<string, unknown>,
        isStale?: () => boolean
    ): Promise<{ success: boolean; newAchievements?: string[] }> {
        try {
            if (this.config.achievementIntegration) {
```

Then, in the same method's `else` branch, replace:

```ts
            } else {
                // Use the simple save method
                await saveGameScore(this.config.gameId, this.currentScore)
                return { success: true }
            }
```

with:

```ts
            } else {
                // Use the simple save method
                await saveGameScore(
                    this.config.gameId,
                    this.currentScore,
                    undefined,
                    undefined,
                    undefined,
                    { isStale }
                )
                return { success: true }
            }
```

- [ ] **Step 4: Add a run guard to `BaseGame` and bump on start/reset**

In `src/lib/games/core/BaseGame.ts`, add the import at the top with the other local imports (after line 3, `import { ScoreManager } from './ScoreManager'`):

```ts
import { createRunGuard } from './runGuard'
```

Add a private field. After the field declarations (after line 23, `protected gameId: GameID`), add:

```ts
    private runGuard = createRunGuard()
```

Bump on start. In the `start()` method, replace:

```ts
    start(): void {
        if (this.state.isActive) {
            return
        }

        this.state.isActive = true
```

with:

```ts
    start(): void {
        if (this.state.isActive) {
            return
        }

        this.runGuard.next()
        this.state.isActive = true
```

Bump on reset. In the `reset()` method, replace:

```ts
    reset(): void {
        if (!this.config.resettable) {
            return
        }

        this.timer.reset()
```

with:

```ts
    reset(): void {
        if (!this.config.resettable) {
            return
        }

        this.runGuard.next()
        this.timer.reset()
```

- [ ] **Step 5: Capture the token and suppress `newAchievements` in `end()`**

In `src/lib/games/core/BaseGame.ts`, replace the `end()` method's save/emit section. Replace this exact block:

```ts
        // Save score
        const saveResult = await this.scoreManager.saveFinalScore(
            this.getGameData()
        )

        this.emit('end', {
            score: finalScore,
            stats: finalStats,
            newAchievements: saveResult.newAchievements,
        })
```

with:

```ts
        // Save score
        const runId = this.runGuard.current()
        const saveResult = await this.scoreManager.saveFinalScore(
            this.getGameData(),
            () => this.runGuard.isStale(runId)
        )

        this.emit('end', {
            score: finalScore,
            stats: finalStats,
            // Suppress achievement toasts if a new run began while saving.
            newAchievements: this.runGuard.isStale(runId)
                ? undefined
                : saveResult.newAchievements,
        })
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test:run src/lib/games/core/core.test.ts`
Expected: PASS — both new tests plus all existing core tests.

- [ ] **Step 7: Run the GameInitializer suite to confirm path #3 coverage is intact**

Run: `bun run test:run src/lib/games/core/GameInitializer.test.ts`
Expected: PASS (the `setupAchievementHandling` listener now never receives stale `newAchievements`).

- [ ] **Step 8: Commit**

```bash
git add src/lib/games/core/BaseGame.ts src/lib/games/core/ScoreManager.ts src/lib/games/core/core.test.ts
git commit -m "feat(games): guard BaseGame end-event achievements with run token"
```

---

### Task 4: Wire closure-pattern legacy games (tetris, bubble-shooter, 2048, word-scramble)

These four games keep all run state in the `init` function's closure. Add a shared `runGuard` in the closure, bump at each run entry point, and pass `isStale` into the existing `saveGameScore` call.

**Files:**
- Modify: `src/lib/games/tetris/init.ts`
- Modify: `src/lib/games/bubble-shooter/init.ts`
- Modify: `src/lib/games/2048/init.ts`
- Modify: `src/lib/games/word-scramble/init.ts`
- Test: `src/lib/games/tetris/init.test.ts` (representative)

**Interfaces:**
- Consumes: `createRunGuard` from `@/lib/games/core`; `saveGameScore`'s new 6th `options` arg from Task 2.

#### Tetris (`src/lib/games/tetris/init.ts`)

- [ ] **Step 1: Add import + guard**

After line 21 (`import { GameID } from '@/lib/games'`), add:

```ts
import { createRunGuard } from '@/lib/games/core'
```

After the line `const abortController = new AbortController()` (line 45), add:

```ts
    const runGuard = createRunGuard()
```

- [ ] **Step 2: Bump on every run entry**

Replace the four run-starting handler definitions:

```ts
    const startHandler = () => startGame(enhancedState, gameLoopFn)
    const pauseHandler = () => togglePause(enhancedState, gameLoopFn)
    const resetHandler = () =>
        resetGame(enhancedState, updateNextPieceDisplayFn)
    const restartHandler = () =>
        resetGame(enhancedState, updateNextPieceDisplayFn)
```

with:

```ts
    const startHandler = () => {
        runGuard.next()
        startGame(enhancedState, gameLoopFn)
    }
    const pauseHandler = () => togglePause(enhancedState, gameLoopFn)
    const resetHandler = () => {
        runGuard.next()
        resetGame(enhancedState, updateNextPieceDisplayFn)
    }
    const restartHandler = () => {
        runGuard.next()
        resetGame(enhancedState, updateNextPieceDisplayFn)
    }
```

- [ ] **Step 3: Capture token + pass `isStale` in `onGameOver`**

Replace the `// Submit score` block inside `onGameOver`:

```ts
            // Submit score
            await saveGameScore(
                GameID.TETRIS,
                finalScore,
                result => {
```

with:

```ts
            // Submit score
            const runId = runGuard.current()
            await saveGameScore(
                GameID.TETRIS,
                finalScore,
                result => {
```

Then replace the tail of that `saveGameScore` call (the `stats` arg + closing):

```ts
                error => {
                    console.error('Failed to submit score:', error)
                },
                stats
            )
```

with:

```ts
                error => {
                    console.error('Failed to submit score:', error)
                },
                stats,
                { isStale: () => runGuard.isStale(runId) }
            )
```

#### Bubble Shooter (`src/lib/games/bubble-shooter/init.ts`)

- [ ] **Step 4: Thread `isStale` through the module-level `saveScore`**

Replace the module-level `saveScore` function (bottom of file):

```ts
async function saveScore(score: number): Promise<void> {
    await saveGameScore(
        GameID.BUBBLE_SHOOTER,
        score,
        result => {
            // Handle newly earned achievements
            if (result.newAchievements && result.newAchievements.length > 0) {
                // Dispatch an event for achievement notifications
                window.dispatchEvent(
                    new CustomEvent('achievementsEarned', {
                        detail: { achievementIds: result.newAchievements },
                    })
                )
            }
        },
        error => {
            console.error('Failed to submit score:', error)
        }
    )
}
```

with:

```ts
async function saveScore(
    score: number,
    isStale?: () => boolean
): Promise<void> {
    await saveGameScore(
        GameID.BUBBLE_SHOOTER,
        score,
        result => {
            // Handle newly earned achievements
            if (result.newAchievements && result.newAchievements.length > 0) {
                // Dispatch an event for achievement notifications
                window.dispatchEvent(
                    new CustomEvent('achievementsEarned', {
                        detail: { achievementIds: result.newAchievements },
                    })
                )
            }
        },
        error => {
            console.error('Failed to submit score:', error)
        },
        undefined,
        { isStale }
    )
}
```

- [ ] **Step 5: Add import + guard in the closure**

After line 20 (`import { GameID } from '@/lib/games'`), add:

```ts
import { createRunGuard } from '@/lib/games/core'
```

After the line `const abortController = new AbortController()` (line 93), add:

```ts
    const runGuard = createRunGuard()
```

- [ ] **Step 6: Bump on run entries + capture in `onGameOver`**

In `onGameOver`, replace:

```ts
            } else {
                // Fallback to original behavior
                await saveScore(finalScore)
            }
```

with:

```ts
            } else {
                // Fallback to original behavior
                const runId = runGuard.current()
                await saveScore(finalScore, () => runGuard.isStale(runId))
            }
```

Bump in the three handlers that begin a run. Replace:

```ts
        startBtn?.addEventListener(
            'click',
            () => {
                startGame(enhancedState, gameLoopFn)
```

with:

```ts
        startBtn?.addEventListener(
            'click',
            () => {
                runGuard.next()
                startGame(enhancedState, gameLoopFn)
```

Replace both reset/restart `resetGame(...)` invocations inside `setupEventListeners` (the `resetBtn` and `restartBtn` handlers). Each currently begins:

```ts
                resetGame(
                    enhancedState,
                    updateCurrentBubbleDisplayFn,
                    updateNextBubbleDisplayFn
                )
```

Prefix each with `runGuard.next()`:

```ts
                runGuard.next()
                resetGame(
                    enhancedState,
                    updateCurrentBubbleDisplayFn,
                    updateNextBubbleDisplayFn
                )
```

#### 2048 (`src/lib/games/2048/init.ts`)

- [ ] **Step 7: Add import + guard**

After line 25 (`import { GameID } from '@/lib/games'`), add:

```ts
import { createRunGuard } from '@/lib/games/core'
```

After the line `const abortController = new AbortController()` (line 50), add:

```ts
    const runGuard = createRunGuard()
```

- [ ] **Step 8: Bump in `start()` and `restart()`**

In `function start()`, after the opening line `function start(): void {`, add:

```ts
        runGuard.next()
```

In `function restart()`, after the opening line `function restart(): void {`, add:

```ts
        runGuard.next()
```

- [ ] **Step 9: Capture token + pass `isStale` in `onGameOver`**

In `gameCallbacks.onGameOver`, replace the `// Submit score` block:

```ts
            // Submit score
            await saveGameScore(
                GameID.GAME_2048,
                finalScore,
                result => {
```

with:

```ts
            // Submit score
            const runId = runGuard.current()
            await saveGameScore(
                GameID.GAME_2048,
                finalScore,
                result => {
```

Replace the tail of the call:

```ts
                error => {
                    console.error('Failed to submit score:', error)
                },
                {
                    maxTile: stats.maxTile,
                    mergeCount: stats.mergeCount,
                    gameWon: stats.gameWon,
                }
            )
```

with:

```ts
                error => {
                    console.error('Failed to submit score:', error)
                },
                {
                    maxTile: stats.maxTile,
                    mergeCount: stats.mergeCount,
                    gameWon: stats.gameWon,
                },
                { isStale: () => runGuard.isStale(runId) }
            )
```

#### Word Scramble (`src/lib/games/word-scramble/init.ts`)

- [ ] **Step 10: Add import + guard**

After line 4 (`import { GameID } from '@/lib/games'`), add:

```ts
import { createRunGuard } from '@/lib/games/core'
```

After the line `const abortController = new AbortController()` (line 285), add:

```ts
    const runGuard = createRunGuard()
```

- [ ] **Step 11: Bump in `startButton` and `playAgainButton` handlers**

Replace:

```ts
        startButton.addEventListener(
            'click',
            () => {
                gameInstance?.startGame()
            },
            { signal }
        )
```

with:

```ts
        startButton.addEventListener(
            'click',
            () => {
                runGuard.next()
                gameInstance?.startGame()
            },
            { signal }
        )
```

Replace:

```ts
        playAgainButton.addEventListener(
            'click',
            () => {
                gameInstance?.startGame()
            },
            { signal }
        )
```

with:

```ts
        playAgainButton.addEventListener(
            'click',
            () => {
                runGuard.next()
                gameInstance?.startGame()
            },
            { signal }
        )
```

- [ ] **Step 12: Capture token + pass `isStale` in `onGameOver`**

Replace the `// Submit score and handle achievements` block:

```ts
            // Submit score and handle achievements
            await saveGameScore(
                GameID.WORD_SCRAMBLE,
                finalScore,
                result => {
```

with:

```ts
            // Submit score and handle achievements
            const runId = runGuard.current()
            await saveGameScore(
                GameID.WORD_SCRAMBLE,
                finalScore,
                result => {
```

Replace the tail of the call:

```ts
                _error => {
                    callbacks.onScoreUpload?.(false)
                },
                {
                    lastCorrectWord: (() => {
```

— stop. The gameData object is a multi-line literal. Instead, add the options after the gameData object closes. Replace:

```ts
                    correctWords: stats.wordsUnscrambled
                        .filter(w => w.correct)
                        .map(w => w.word),
                }
            )
```

with:

```ts
                    correctWords: stats.wordsUnscrambled
                        .filter(w => w.correct)
                        .map(w => w.word),
                },
                { isStale: () => runGuard.isStale(runId) }
            )
```

- [ ] **Step 13: Add a representative wiring test (tetris)**

In `src/lib/games/tetris/init.test.ts`, inside the `describe` that contains the "should dispatch achievementsEarned event" test (around line 461), add this test after it:

```ts
        it('passes an isStale option that flips to true after a new run starts', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            gameInst = await initTetrisGame()
            const state = gameInst!.getState() as any

            document.getElementById('start-btn')!.click() // run 1
            await state.onGameOver(200, {}) // triggers saveGameScore

            const call = vi.mocked(saveGameScore).mock.calls[0]
            const opts = call[5] as
                | { isStale: () => boolean }
                | undefined
            expect(opts?.isStale).toBeTypeOf('function')
            expect(opts!.isStale()).toBe(false) // still run 1

            document.getElementById('start-btn')!.click() // run 2 -> stale
            expect(opts!.isStale()).toBe(true)
        })
```

- [ ] **Step 14: Run the affected test files**

Run: `bun run test:run src/lib/games/tetris/init.test.ts src/lib/games/bubble-shooter/init.test.ts src/lib/games/2048/init.test.ts src/lib/games/word-scramble/init.test.ts`
Expected: PASS — all existing tests plus the new tetris wiring test.

- [ ] **Step 15: Commit**

```bash
git add src/lib/games/tetris/init.ts src/lib/games/tetris/init.test.ts src/lib/games/bubble-shooter/init.ts src/lib/games/2048/init.ts src/lib/games/word-scramble/init.ts
git commit -m "feat(games): wire run guard in tetris, bubble-shooter, 2048, word-scramble"
```

---

### Task 5: Wire module-level `handleGameOver` games (reflex, evader)

`reflex` and `evader` define `handleGameOver` as a module-level function. Add a closure-scoped guard in the init function, bump in the returned `startGame`, and thread `isStale` into `handleGameOver`.

**Files:**
- Modify: `src/lib/games/reflex/init.ts`
- Modify: `src/lib/games/evader/init.ts`

**Interfaces:**
- Consumes: `createRunGuard` from `@/lib/games/core`; `saveGameScore` options arg.

#### Reflex (`src/lib/games/reflex/init.ts`)

- [ ] **Step 1: Add import**

After line 13 (`import { GameID } from '@/lib/games'`), add:

```ts
import { createRunGuard } from '@/lib/games/core'
```

- [ ] **Step 2: Make `handleGameOver` accept `isStale`**

Change the module-level signature:

```ts
async function handleGameOver(
    finalScore: number,
    stats: GameStats
): Promise<void> {
```

to:

```ts
async function handleGameOver(
    finalScore: number,
    stats: GameStats,
    isStale?: () => boolean
): Promise<void> {
```

Replace the tail of its `saveGameScore` call:

```ts
        stats // Pass game statistics for achievement checking
    )
```

with:

```ts
        stats, // Pass game statistics for achievement checking
        { isStale }
    )
```

- [ ] **Step 3: Add guard in the init closure + wire `startGame` and `onGameOver`**

After the line `const finalConfig: GameConfig = { ...DEFAULT_CONFIG, ...config }` (line 106), add:

```ts
    const runGuard = createRunGuard()
```

In `enhancedCallbacks.onGameOver`, replace:

```ts
            onGameOver: async (finalScore: number, stats: GameStats) => {
                await handleGameOver(finalScore, stats)
                callbacks.onGameOver?.(finalScore, stats)
            },
```

with:

```ts
            onGameOver: async (finalScore: number, stats: GameStats) => {
                const runId = runGuard.current()
                await handleGameOver(finalScore, stats, () =>
                    runGuard.isStale(runId)
                )
                callbacks.onGameOver?.(finalScore, stats)
            },
```

In the returned object, replace:

```ts
            startGame: () => game.startGame(),
```

with:

```ts
            startGame: () => {
                runGuard.next()
                game.startGame()
            },
```

#### Evader (`src/lib/games/evader/init.ts`)

- [ ] **Step 4: Add import**

After line 10 (`import { GameID } from '@/lib/games'`), add:

```ts
import { createRunGuard } from '@/lib/games/core'
```

- [ ] **Step 5: Make `handleGameOver` accept `isStale`**

Change the module-level signature:

```ts
async function handleGameOver(
    finalScore: number,
    stats: GameStats
): Promise<void> {
```

to:

```ts
async function handleGameOver(
    finalScore: number,
    stats: GameStats,
    isStale?: () => boolean
): Promise<void> {
```

Replace the tail of its `saveGameScore` call:

```ts
        stats
    )
```

with:

```ts
        stats,
        { isStale }
    )
```

- [ ] **Step 6: Add guard in the init closure + wire `startGame` and `onGameOver`**

After the line `const finalConfig: GameConfig = { ...DEFAULT_CONFIG, ...config }` (line 96), add:

```ts
    const runGuard = createRunGuard()
```

In `enhancedCallbacks.onGameOver`, replace:

```ts
            onGameOver: async (finalScore: number, stats: GameStats) => {
                await handleGameOver(finalScore, stats)
                callbacks.onGameOver?.(finalScore, stats)
            },
```

with:

```ts
            onGameOver: async (finalScore: number, stats: GameStats) => {
                const runId = runGuard.current()
                await handleGameOver(finalScore, stats, () =>
                    runGuard.isStale(runId)
                )
                callbacks.onGameOver?.(finalScore, stats)
            },
```

In the returned object, replace:

```ts
            startGame: () => game.startGame(),
```

with:

```ts
            startGame: () => {
                runGuard.next()
                game.startGame()
            },
```

- [ ] **Step 7: Run the affected test files**

Run: `bun run test:run src/lib/games/reflex/init.test.ts src/lib/games/evader/init.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/games/reflex/init.ts src/lib/games/evader/init.ts
git commit -m "feat(games): wire run guard in reflex and evader"
```

---

### Task 6: Wire module-level `saveScore` games (quick-math, memory-matrix)

`quick-math` and `memory-matrix` keep `gameInstance`/`game` and a module-level `saveScore` function at module scope. Add a module-level guard there.

**Files:**
- Modify: `src/lib/games/quick-math/init.ts`
- Modify: `src/lib/games/memory-matrix/init.ts`

#### Quick Math (`src/lib/games/quick-math/init.ts`)

- [ ] **Step 1: Add import + module-level guard**

After line 4 (`import { GameID } from '@/lib/games'`), add:

```ts
import { createRunGuard } from '@/lib/games/core'
```

After the line `let gameCallbacks: GameCallbacks | null = null` (line 7), add:

```ts
let runGuard = createRunGuard()
```

- [ ] **Step 2: Bump in `handleStart` and `handlePlayAgain`**

Replace:

```ts
    const handleStart = () => {
        if (gameInstance) {
            gameInstance.startGame()
        }
    }

    const handlePlayAgain = () => {
        if (gameInstance) {
            gameInstance.startGame()
            startButton.textContent = 'Start Game'
            startButton.disabled = false
        }
    }
```

with:

```ts
    const handleStart = () => {
        if (gameInstance) {
            runGuard.next()
            gameInstance.startGame()
        }
    }

    const handlePlayAgain = () => {
        if (gameInstance) {
            runGuard.next()
            gameInstance.startGame()
            startButton.textContent = 'Start Game'
            startButton.disabled = false
        }
    }
```

- [ ] **Step 3: Thread `isStale` through `saveScore`**

In `onGameOver`, replace:

```ts
            } else {
                // Fallback to original behavior
                saveScore(finalScore)
            }
```

with:

```ts
            } else {
                // Fallback to original behavior
                const runId = runGuard.current()
                saveScore(finalScore, () => runGuard.isStale(runId))
            }
```

Replace the module-level `saveScore` signature:

```ts
async function saveScore(score: number): Promise<void> {
```

with:

```ts
async function saveScore(
    score: number,
    isStale?: () => boolean
): Promise<void> {
```

Replace the tail of its `saveGameScore` call:

```ts
        // Include achievement flags in gameData for in-game achievements
        gameInstance?.getAchievementFlags()
    )
}
```

with:

```ts
        // Include achievement flags in gameData for in-game achievements
        gameInstance?.getAchievementFlags(),
        { isStale }
    )
}
```

#### Memory Matrix (`src/lib/games/memory-matrix/init.ts`)

- [ ] **Step 4: Add import + module-level guard**

After line 4 (`import { GameID } from '@/lib/games'`), add:

```ts
import { createRunGuard } from '@/lib/games/core'
```

After the line `let abortController: AbortController | null = null` (line 9), add:

```ts
let runGuard = createRunGuard()
```

- [ ] **Step 5: Bump in the start and reset control handlers**

In `setupGameControls`, replace the start button handler:

```ts
                if (game) {
                    const state = game.getGameState()
                    if (!state.gameStarted) {
                        game.startGame()
                        startBtn.textContent = 'Game Started'
                        ;(startBtn as HTMLButtonElement).disabled = true
                    }
```

with:

```ts
                if (game) {
                    const state = game.getGameState()
                    if (!state.gameStarted) {
                        runGuard.next()
                        game.startGame()
                        startBtn.textContent = 'Game Started'
                        ;(startBtn as HTMLButtonElement).disabled = true
                    }
```

Replace the reset button handler body:

```ts
                if (game) {
                    game.resetGame()
                    if (startBtn) {
```

with:

```ts
                if (game) {
                    runGuard.next()
                    game.resetGame()
                    if (startBtn) {
```

Also bump in the returned `restart` instance method and the `memory-matrix-restart` event listener. Replace:

```ts
        restart: () => {
            if (!game) {
                throw new Error(
                    'Memory Matrix game has been cleaned up. Please reinitialize.'
                )
            }
            return game.resetGame()
        },
```

with:

```ts
        restart: () => {
            if (!game) {
                throw new Error(
                    'Memory Matrix game has been cleaned up. Please reinitialize.'
                )
            }
            runGuard.next()
            return game.resetGame()
        },
```

And replace:

```ts
    window.addEventListener(
        'memory-matrix-restart',
        () => {
            game?.resetGame()
        },
        { signal }
    )
```

with:

```ts
    window.addEventListener(
        'memory-matrix-restart',
        () => {
            runGuard.next()
            game?.resetGame()
        },
        { signal }
    )
```

- [ ] **Step 6: Thread `isStale` through `saveScore`**

In the game end callback, replace:

```ts
            } else {
                // Fallback to original behavior
                await saveScore(finalScore)
            }
```

with:

```ts
            } else {
                // Fallback to original behavior
                const runId = runGuard.current()
                await saveScore(finalScore, () => runGuard.isStale(runId))
            }
```

Replace the module-level `saveScore` signature:

```ts
async function saveScore(score: number): Promise<void> {
```

with:

```ts
async function saveScore(
    score: number,
    isStale?: () => boolean
): Promise<void> {
```

Replace the tail of its `saveGameScore` call:

```ts
        error => {
            console.error('[MemoryMatrix] Failed to save score:', error)
        }
    )
}
```

with:

```ts
        error => {
            console.error('[MemoryMatrix] Failed to save score:', error)
        },
        undefined,
        { isStale }
    )
}
```

- [ ] **Step 7: Run the affected test files**

Run: `bun run test:run src/lib/games/quick-math/init.test.ts src/lib/games/memory-matrix/init.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/games/quick-math/init.ts src/lib/games/memory-matrix/init.ts
git commit -m "feat(games): wire run guard in quick-math and memory-matrix"
```

---

### Task 7: Wire handle-based games (circuit-hacker, satellite-sync)

Both expose a handle whose `start()` is re-invoked on every play. Bump at the top of `start()`, and capture the token where the score is submitted.

**Files:**
- Modify: `src/lib/games/circuit-hacker/init.ts`
- Modify: `src/lib/games/satellite-sync/init.ts`
- Test: `src/lib/games/circuit-hacker/init.test.ts` (representative)

#### Circuit Hacker (`src/lib/games/circuit-hacker/init.ts`)

- [ ] **Step 1: Add import + guard**

After line 13 (`import { GameID } from '@/lib/games'`), add:

```ts
import { createRunGuard } from '@/lib/games/core'
```

After the line `let pointerHandler: ((event: PointerEvent) => void) | null = null` (line 71), add:

```ts
    const runGuard = createRunGuard()
```

- [ ] **Step 2: Bump at the top of `start`**

In `const start = async (difficulty: Difficulty): Promise<void> => {`, replace:

```ts
    const start = async (difficulty: Difficulty): Promise<void> => {
        if (game) {
            game.cleanup()
        }
```

with:

```ts
    const start = async (difficulty: Difficulty): Promise<void> => {
        runGuard.next()
        if (game) {
            game.cleanup()
        }
```

- [ ] **Step 3: Capture token + pass `isStale` in `onSolved`**

Replace the `try {` opening of the save block in `onSolved`:

```ts
                    try {
                        await saveGameScore(
                            GameID.CIRCUIT_HACKER,
                            finalScore,
                            result => {
```

with:

```ts
                    const runId = runGuard.current()
                    try {
                        await saveGameScore(
                            GameID.CIRCUIT_HACKER,
                            finalScore,
                            result => {
```

Replace the tail of the `saveGameScore` call:

```ts
                            {
                                difficulty: stats.difficulty,
                                secondsRemaining: stats.secondsRemaining,
                                rotationsUsed: stats.rotationsUsed,
                                solved: stats.solved,
                            }
                        )
```

with:

```ts
                            {
                                difficulty: stats.difficulty,
                                secondsRemaining: stats.secondsRemaining,
                                rotationsUsed: stats.rotationsUsed,
                                solved: stats.solved,
                            },
                            { isStale: () => runGuard.isStale(runId) }
                        )
```

#### Satellite Sync (`src/lib/games/satellite-sync/init.ts`)

- [ ] **Step 4: Add import + guard**

After line 13 (`import { GameID } from '@/lib/games'`), add:

```ts
import { createRunGuard } from '@/lib/games/core'
```

After the line `let lastFrame = 0` (line 55), add:

```ts
    const runGuard = createRunGuard()
```

- [ ] **Step 5: Bump at the top of `start`**

Replace:

```ts
    const start = async (): Promise<void> => {
        if (game) {
            game.cleanup()
        }
```

with:

```ts
    const start = async (): Promise<void> => {
        runGuard.next()
        if (game) {
            game.cleanup()
        }
```

- [ ] **Step 6: Capture token + pass `isStale` in `submitScore`**

In `const submitScore`, replace:

```ts
    const submitScore = async (score: number): Promise<void> => {
        if (!game) {
            return
        }
        const surfaceError = (message: string) =>
            callbacks.onError?.(
                'Score Not Saved',
                `Score could not be submitted: ${message}`
            )
        try {
            await saveGameScore(
                GameID.SATELLITE_SYNC,
                score,
```

with:

```ts
    const submitScore = async (score: number): Promise<void> => {
        if (!game) {
            return
        }
        const runId = runGuard.current()
        const surfaceError = (message: string) =>
            callbacks.onError?.(
                'Score Not Saved',
                `Score could not be submitted: ${message}`
            )
        try {
            await saveGameScore(
                GameID.SATELLITE_SYNC,
                score,
```

Replace the tail of the `saveGameScore` call:

```ts
                error =>
                    surfaceError(
                        typeof error === 'string' ? error : 'Unknown error'
                    ),
                game.getGameData()
            )
```

with:

```ts
                error =>
                    surfaceError(
                        typeof error === 'string' ? error : 'Unknown error'
                    ),
                game.getGameData(),
                { isStale: () => runGuard.isStale(runId) }
            )
```

- [ ] **Step 7: Add a representative wiring test (circuit-hacker)**

In `src/lib/games/circuit-hacker/init.test.ts`, inside the top `describe('initializeCircuitHackerGame', ...)`, add this test (e.g. after the "submits the score with gameData when solved" test):

```ts
    it('passes an isStale option that flips to true after a new run starts', async () => {
        const container = setupDom()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        solveGameForTest(handle.getGame()!)
        await vi.runAllTimersAsync()

        expect(saveGameScore).toHaveBeenCalledTimes(1)
        const opts = saveGameScore.mock.calls[0][5] as
            | { isStale: () => boolean }
            | undefined
        expect(opts?.isStale).toBeTypeOf('function')
        expect(opts!.isStale()).toBe(false)

        await handle.start('easy') // new run -> stale
        expect(opts!.isStale()).toBe(true)
        handle.cleanup()
    })
```

- [ ] **Step 8: Run the affected test files**

Run: `bun run test:run src/lib/games/circuit-hacker/init.test.ts src/lib/games/satellite-sync/init.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/games/circuit-hacker/init.ts src/lib/games/circuit-hacker/init.test.ts src/lib/games/satellite-sync/init.ts
git commit -m "feat(games): wire run guard in circuit-hacker and satellite-sync"
```

---

### Task 8: Wire snake legacy path (`snake/game.ts`)

The legacy snake path (`snake/init.ts` → `snake/game.ts`) submits the score fire-and-forget inside `endGame` in `game.ts`. `startGame` and `resetGame` (also in `game.ts`) are the run entries. Use a module-level guard.

**Files:**
- Modify: `src/lib/games/snake/game.ts`

**Interfaces:**
- Consumes: `createRunGuard` from `@/lib/games/core`; `saveGameScore` options arg.

- [ ] **Step 1: Establish a green baseline**

Run: `bun run test:run src/lib/games/snake/game.pure.test.ts`
Expected: PASS before any changes.

- [ ] **Step 2: Add import + module-level guard**

After the existing `import { GameID } from '@/lib/games'` line (line 14), add:

```ts
import { createRunGuard } from '@/lib/games/core'
```

After the `GAME_CONSTANTS` object literal closes (after line 29, the `}` that ends `export const GAME_CONSTANTS: GameConstants = { ... }`), add:

```ts
const runGuard = createRunGuard()
```

- [ ] **Step 3: Bump in `startGame`**

Replace:

```ts
export function startGame(state: GameState, gameLoopFn: () => void): void {
    if (!state.gameStarted) {
        // Reset game flags to allow restart after game over
        state.gameOver = false
```

with:

```ts
export function startGame(state: GameState, gameLoopFn: () => void): void {
    if (!state.gameStarted) {
        runGuard.next()
        // Reset game flags to allow restart after game over
        state.gameOver = false
```

- [ ] **Step 4: Bump in `resetGame`**

Replace:

```ts
export function resetGame(state: GameState): void {
    // Cache externally injected callbacks before reset
    const cachedOnGameOver = state.onGameOver
```

with:

```ts
export function resetGame(state: GameState): void {
    runGuard.next()
    // Cache externally injected callbacks before reset
    const cachedOnGameOver = state.onGameOver
```

- [ ] **Step 5: Capture token + pass `isStale` in `endGame`'s `saveGameScore` call**

The fire-and-forget `saveGameScore(...)` call lives in `endGame` (around line 244). Replace:

```ts
    // Don't await to avoid blocking UI on slow/offline connections
    saveGameScore(
        GameID.SNAKE,
        state.score,
        result => {
```

with:

```ts
    // Don't await to avoid blocking UI on slow/offline connections
    const runId = runGuard.current()
    saveGameScore(
        GameID.SNAKE,
        state.score,
        result => {
```

Replace the tail of the call (the `stats` arg + the `.catch` continuation):

```ts
        stats
    ).catch(error => {
```

with:

```ts
        stats,
        { isStale: () => runGuard.isStale(runId) }
    ).catch(error => {
```

- [ ] **Step 6: Run the snake test**

Run: `bun run test:run src/lib/games/snake/game.pure.test.ts src/lib/games/snake/initFramework.test.ts`
Expected: PASS — existing "dispatches achievementsEarned" tests stay green (no second run is started in those tests, so the guard never goes stale).

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/snake/game.ts
git commit -m "feat(games): wire run guard in snake legacy game.ts"
```

---

### Task 9: Wire `.astro` inline games (path-navigator, sudoku)

These call `saveGameScore` from inline `<script>` blocks via dynamic import. Add a guard via dynamic import of `createRunGuard`, bump at run start, and pass `isStale` in the existing call.

**Files:**
- Modify: `src/pages/path-navigator/index.astro` (inline script)
- Modify: `src/pages/sudoku/index.astro` (inline script)

#### Path Navigator (`src/pages/path-navigator/index.astro`)

- [ ] **Step 1: Add a static import + module-scoped guard**

The inline `<script>` already has a static import at the top. After that block:

```ts
      import {
        initializePathNavigatorGame,
        type PathNavigatorGameInstance,
      } from '@/lib/games/path-navigator/init'
```

add:

```ts
      import { createRunGuard } from '@/lib/games/core'
```

After the existing module-scoped declaration `let gameInstance: PathNavigatorGameInstance | undefined` (line 239), add:

```ts
      const runGuard = createRunGuard()
```

This single guard instance is closed over by both the `onGameOver` callback and the start-button handler below.

- [ ] **Step 2: Capture token + pass `isStale` in `onGameOver`'s `saveGameScore` call**

The `saveGameScore` dynamic import (around line 304) stays as-is. Replace the call itself:

```ts
                  await saveGameScore(
                    'PATH_NAVIGATOR',
                    finalScore,
                    undefined,
                    undefined,
                    gameData
                  )
```

with:

```ts
                  const runId = runGuard.current()
                  await saveGameScore(
                    'PATH_NAVIGATOR',
                    finalScore,
                    undefined,
                    undefined,
                    gameData,
                    { isStale: () => runGuard.isStale(runId) }
                  )
```

- [ ] **Step 3: Bump on run start**

Locate the start button handler (around line 338) that calls `gameInstance.startGame()`:

```ts
            startBtn.addEventListener('click', () => {
              if (gameInstance && gameInstance.startGame) {
                gameInstance.startGame()
```

Add the bump as the first line inside the `if`:

```ts
            startBtn.addEventListener('click', () => {
              if (gameInstance && gameInstance.startGame) {
                runGuard.next()
                gameInstance.startGame()
```

#### Sudoku (`src/pages/sudoku/index.astro`)

- [ ] **Step 4: Add the guard alongside the existing dynamic imports**

Locate the dynamic imports (around line 189-193):

```ts
            const { initSudokuGame } = await import('@/lib/games/sudoku/init')
            const { saveGameScore } = await import(
              '@/lib/services/scoreService'
            )
            const { GameID } = await import('@/lib/games')
```

Add after them:

```ts
            const { createRunGuard } = await import('@/lib/games/core')
            const runGuard = createRunGuard()
```

- [ ] **Step 5: Bump in `initGame`**

Locate `const initGame = (...) => {` (around line 210) and add the bump as its first line, after the opening brace and before `if (gameCleanup)`:

```ts
              runGuard.next()
              if (gameCleanup) {
                gameCleanup()
              }
```

- [ ] **Step 6: Capture token + pass `isStale` in the end-btn `saveGameScore` call**

Locate the `saveGameScore(GameID.SUDOKU, score)` call (around line 335). Replace:

```ts
                      saveGameScore(GameID.SUDOKU, score)
```

with:

```ts
                      const runId = runGuard.current()
                      saveGameScore(GameID.SUDOKU, score, undefined, undefined, undefined, {
                        isStale: () => runGuard.isStale(runId),
                      })
```

- [ ] **Step 7: Verify the pages build/typecheck**

Run: `bun run astro check`
Expected: PASS — no TypeScript errors in either `.astro` inline script.

- [ ] **Step 8: Commit**

```bash
git add src/pages/path-navigator/index.astro src/pages/sudoku/index.astro
git commit -m "feat(games): wire run guard in path-navigator and sudoku pages"
```

---

### Task 10: Full verification

- [ ] **Step 1: Run the entire unit test suite**

Run: `bun run test:run`
Expected: PASS — all suites green, including every game's `init.test.ts`, `core.test.ts`, `GameInitializer.test.ts`, `scoreService.test.ts`, and `runGuard.test.ts`.

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: PASS. If lint reports unused `_` vars or formatting, run `bun run lint:fix` and `bun run format`, then re-run.

- [ ] **Step 3: Typecheck**

Run: `bun run astro check`
Expected: PASS — no errors. This confirms every `saveGameScore` call site passes the new optional `options` arg correctly and every `createRunGuard` import resolves.

- [ ] **Step 4: Final commit (if any formatting/lint fixes)**

```bash
git add -A
git commit -m "chore: lint/format after stale-guard wiring"
```

If there is nothing to commit, skip this step.

---

## Spec coverage map

- Path #1 (`scoreService` direct `showAchievementAward`/`showChallengeComplete`) → Task 2.
- Path #2 (per-game `onSuccess` `achievementsEarned`) → Task 2 (central suppression) + Tasks 4–9 (each caller passes `isStale`).
- Path #3 (core-framework `game.on('end')`) → Task 3 (`BaseGame` + `ScoreManager`).
- `.astro` callers with no `onSuccess` (path-navigator, sudoku) → Task 9.
- `createRunGuard` helper → Task 1.
- Tests: helper (Task 1), scoreService stale (Task 2), BaseGame stale (Task 3), representative legacy wiring (Task 4), representative handle-based wiring (Task 7), snake green-after-wire (Task 8), full suite + lint + typecheck (Task 10).
- Untouched (by design): `GameInitializer.ts`, `bejeweled/init.ts`, `snake/initFramework.ts`, toast UI components.
