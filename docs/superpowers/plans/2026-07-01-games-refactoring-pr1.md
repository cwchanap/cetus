# Cetus Games Refactoring — PR 1: Foundation (Phases 1-5)

> **Scope:** This plan covers PR 1 of the games consolidation effort. PR 2 (BaseGame migration, Phase 6) is a stacked dependency on this branch.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix active behavioral bugs, remove dead code, enforce GameData contracts, adopt shared utilities, and extract cross-game shared modules — establishing the foundation for the BaseGame framework migration in PR 2.

**Architecture:** The codebase has 14 games in 3 architectural camps (framework-native: 3 games; legacy-classic: 9 games; handle-based: 2 games). A shared utilities module (`shared/utils.ts`) exists but is imported by zero games. This plan consolidates the foundation in dependency order: bugs → dead code → contracts → shared utils → shared modules.

**Tech Stack:** Astro 5, TypeScript, PixiJS 8, Vitest, Kysely/LibSQL, Better Auth.

## Global Constraints

- **Package manager:** Bun (`bun@1.3.1`) — use `bun run` for all scripts
- **Test command:** `bun run test:run` (Vitest, jsdom environment)
- **Lint command:** `bun run lint` (ESLint)
- **Format command:** `bun run format` (Prettier)
- **Single test file:** `bun run test src/path/to/file.test.ts`
- **No comments** unless explicitly requested by existing code conventions
- **No innerHTML for DOM structure** — Astro owns HTML, TS mutates children only
- **GameID enum** lives in `src/lib/games.ts` — all game IDs registered there
- **GameData interfaces** live in `src/lib/games/shared/types.ts` (except SatelliteSync which owns its own)
- **Never commit** unless explicitly asked — leave commits to the executing engineer per task
- **14 games** exist: tetris, bubble-shooter, memory-matrix, quick-math, word-scramble, reflex, sudoku, bejeweled, path-navigator, evader, 2048, snake, circuit-hacker, satellite-sync

---

# Phase 1: P0 Behavioral Bug Fixes

Fix the 9 active defects before any refactoring. Each task is isolated and independently testable.

---

## Task 1.1: Quick Math — Restore achievement flags in FrameworkGame

The live `FrameworkGame.getGameData()` drops 4 achievement flags, silently breaking achievements `quick_math_one_plus_one_seen`, `quick_math_one_plus_one_wrong`, `quick_math_999_seen`, `quick_math_zero_answer_wrong` (defined in `src/lib/achievements.ts:797-849`).

**Files:**
- Modify: `src/lib/games/quick-math/game.ts` (add flag tracking + fix `getGameData`)
- Test: `src/lib/games/quick-math/game.test.ts`

**Interfaces:**
- Consumes: `QuickMathGameData` from `src/lib/games/shared/types.ts:61-68` (`{ seenOnePlusOne?, onePlusOneIncorrect?, seenOperand999?, zeroAnswerIncorrect?, correctAnswers, wrongAnswers }`)
- Produces: `getGameData()` returns an object satisfying `QuickMathGameData`

- [ ] **Step 1: Write failing tests for achievement flag tracking**

Add to `game.test.ts`:

```typescript
describe('QuickMathFrameworkGame achievement flags', () => {
    const baseConfig: QuickMathConfig = {
        duration: 60,
        achievementIntegration: true,
        pausable: true,
        resettable: true,
        pointsPerCorrectAnswer: 20,
        maxNumber: 999,
        operations: ['addition'],
    }

    it('tracks seenOnePlusOne when a 1+1 question appears', () => {
        // Deterministic seam: stub Math.random so the first generated
        // question is guaranteed to be 1 + 1 (addition, operand1=1, operand2=1).
        const randomSpy = vi.spyOn(Math, 'random')
        randomSpy.mockReturnValueOnce(0) // operation index -> addition
        randomSpy.mockReturnValueOnce(0) // operand1 = floor(0*999)+1 = 1
        randomSpy.mockReturnValueOnce(0) // operand2 = 1

        const game = new QuickMathFrameworkGame(GameID.QUICK_MATH, baseConfig)
        game.start()
        randomSpy.mockRestore()

        const data = (game as any).getGameData()
        expect(data.seenOnePlusOne).toBe(true)
        expect(data.seenOperand999).toBe(false)
    })

    it('includes all 4 achievement flags in getGameData output', () => {
        const game = new QuickMathFrameworkGame(GameID.QUICK_MATH, baseConfig)
        game.start()
        const data = (game as any).getGameData()
        expect(data).toHaveProperty('seenOnePlusOne')
        expect(data).toHaveProperty('onePlusOneIncorrect')
        expect(data).toHaveProperty('seenOperand999')
        expect(data).toHaveProperty('zeroAnswerIncorrect')
        expect(data).toHaveProperty('correctAnswers')
        expect(data).toHaveProperty('wrongAnswers')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/games/quick-math/game.test.ts`
Expected: FAIL — `getGameData()` output does not contain `seenOnePlusOne` etc.

- [ ] **Step 3: Add achievement flag tracking to FrameworkGame**

In `game.ts`, add private flag fields after `questionStartTime` (line 56):

```typescript
private achievementFlags: {
    seenOnePlusOne: boolean
    onePlusOneIncorrect: boolean
    seenOperand999: boolean
    zeroAnswerIncorrect: boolean
} = {
    seenOnePlusOne: false,
    onePlusOneIncorrect: false,
    seenOperand999: false,
    zeroAnswerIncorrect: false,
}
```

Reset them in `onGameStart()` (after line 85):

```typescript
protected onGameStart(): void {
    this.achievementFlags = {
        seenOnePlusOne: false,
        onePlusOneIncorrect: false,
        seenOperand999: false,
        zeroAnswerIncorrect: false,
    }
    this.generateNextQuestion()
}
```

Track flags in `generateNextQuestion()` — add after line 137 (`this.questionStartTime = Date.now()`):

```typescript
if (question.operation === 'addition' && question.operand1 === 1 && question.operand2 === 1) {
    this.achievementFlags.seenOnePlusOne = true
}
if (question.operand1 === 999 || question.operand2 === 999) {
    this.achievementFlags.seenOperand999 = true
}
```

Track flags in `submitAnswer()` — add after line 158 (`this.state.incorrectAnswers++`), inside an `else` block or after the if/else:

```typescript
if (!isCorrect) {
    const q = this.state.currentQuestion
    if (q) {
        if (q.operation === 'addition' && q.operand1 === 1 && q.operand2 === 1) {
            this.achievementFlags.onePlusOneIncorrect = true
        }
        if (q.answer === 0) {
            this.achievementFlags.zeroAnswerIncorrect = true
        }
    }
}
```

Fix `getGameData()` (replace lines 211-219):

```typescript
protected getGameData(): Record<string, unknown> {
    return {
        seenOnePlusOne: this.achievementFlags.seenOnePlusOne,
        onePlusOneIncorrect: this.achievementFlags.onePlusOneIncorrect,
        seenOperand999: this.achievementFlags.seenOperand999,
        zeroAnswerIncorrect: this.achievementFlags.zeroAnswerIncorrect,
        correctAnswers: this.state.correctAnswers,
        wrongAnswers: this.state.incorrectAnswers,
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/games/quick-math/FrameworkGame.test.ts`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
bun run lint
git add src/lib/games/quick-math/FrameworkGame.ts src/lib/games/quick-math/FrameworkGame.test.ts
git commit -m "fix(quick-math): restore achievement flags in FrameworkGame getGameData"
```

---

## Task 1.2: Bubble Shooter — Track shotsFired, bubblesPopped, largestCombo

Stats are never incremented in production code, so `accuracy` is permanently 0 and combo achievements are dead.

**Files:**
- Modify: `src/lib/games/bubble-shooter/game.ts` (increment `shotsFired` in `handleClick`)
- Modify: `src/lib/games/bubble-shooter/physics.ts` (increment `bubblesPopped` + `largestCombo` in `checkMatches`/`removeBubbles`)
- Modify: `src/lib/games/bubble-shooter/init.ts` (pass `BubbleShooterGameData` to `saveGameScore`)
- Test: `src/lib/games/bubble-shooter/game.pure.test.ts`

**Interfaces:**
- Consumes: `BubbleShooterGameData` from `src/lib/games/shared/types.ts:25-29` (`{ bubblesPopped, shotsFired, largestCombo }`)

- [ ] **Step 1: Write failing test for stat tracking**

Add to `game.pure.test.ts`:

```typescript
describe('Bubble Shooter stat tracking', () => {
    it('increments shotsFired on handleClick', () => {
        const state = createGameState()
        initializeGrid(state)
        generateBubble(state)
        generateNextBubble(state)
        state.gameStarted = true
        state.gameOver = false
        state.paused = false
        state.projectile = null

        const initialShots = state.shotsFired || 0
        handleClick({} as MouseEvent, state, () => {})

        expect(state.shotsFired).toBe(initialShots + 1)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/games/bubble-shooter/game.pure.test.ts`
Expected: FAIL — `shotsFired` is never incremented

- [ ] **Step 3: Increment shotsFired in handleClick**

In `game.ts`, inside `handleClick` (after line 233, after setting `state.projectile`):

```typescript
state.shotsFired = (state.shotsFired || 0) + 1
```

- [ ] **Step 4: Increment bubblesPopped and largestCombo in checkMatches**

In `physics.ts`, inside `checkMatches`, replace the `if (matches.length >= 3)` block (lines 250-255):

```typescript
if (matches.length >= 3) {
    removeBubbles(state, matches)
    state.score += matches.length * 10
    state.bubblesPopped = (state.bubblesPopped || 0) + matches.length
    state.largestCombo = Math.max(state.largestCombo || 0, matches.length)
    state.bubblesRemaining -= matches.length
    state.needsRedraw = true
}
```

- [ ] **Step 5: Pass BubbleShooterGameData to saveGameScore**

In `init.ts`, modify `saveScore` (lines 265-288). Replace the `undefined` argument (line 286) with:

```typescript
async function saveScore(
    score: number,
    state: GameState,
    isStale?: () => boolean
): Promise<void> {
    await saveGameScore(
        GameID.BUBBLE_SHOOTER,
        score,
        result => {
            if (result.newAchievements && result.newAchievements.length > 0) {
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
        {
            bubblesPopped: state.bubblesPopped || 0,
            shotsFired: state.shotsFired || 0,
            largestCombo: state.largestCombo || 0,
        },
        { isStale }
    )
}
```

Update the call site of `saveScore` in `init.ts` to pass the state object as the second argument.

- [ ] **Step 6: Run all bubble-shooter tests**

Run: `bun run test src/lib/games/bubble-shooter/`
Expected: PASS

- [ ] **Step 7: Lint and commit**

```bash
bun run lint
git add src/lib/games/bubble-shooter/
git commit -m "fix(bubble-shooter): track shotsFired, bubblesPopped, largestCombo and pass gameData"
```

---

## Task 1.3: Word Scramble — Remove duplicate dictionary words

`'mountain'` appears in both medium (line 77) and hard (line 129). `'fantastic'` is duplicated within hard (lines 122, 166). `'wonderful'` is duplicated within hard (lines 141, 169). This skews randomization.

**Files:**
- Modify: `src/lib/games/word-scramble/words.ts` (remove 3 duplicate entries)
- Test: `src/lib/games/word-scramble/words.test.ts`

- [ ] **Step 1: Write failing test for uniqueness**

Add to `words.test.ts`:

```typescript
describe('Word database uniqueness', () => {
    it('has no duplicate words within each difficulty', () => {
        for (const difficulty of ['easy', 'medium', 'hard'] as const) {
            const words = WORD_DATABASE[difficulty]
            const unique = new Set(words)
            expect(words.length).toBe(unique.size)
        }
    })

    it('has no words shared across difficulties', () => {
        const easy = new Set(WORD_DATABASE.easy)
        const medium = new Set(WORD_DATABASE.medium)
        const hard = new Set(WORD_DATABASE.hard)
        const easyMedium = [...easy].filter(w => medium.has(w))
        const easyHard = [...easy].filter(w => hard.has(w))
        const mediumHard = [...medium].filter(w => hard.has(w))
        expect(easyMedium).toEqual([])
        expect(easyHard).toEqual([])
        expect(mediumHard).toEqual([])
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/games/word-scramble/words.test.ts`
Expected: FAIL — duplicates found

- [ ] **Step 3: Remove duplicates**

In `words.ts`:
- Remove `'mountain'` from the `hard` array (line 129) — keep it in `medium` (line 77)
- Remove the second `'fantastic'` from `hard` (line 166) — keep line 122
- Remove the second `'wonderful'` from `hard` (line 169) — keep line 141

- [ ] **Step 4: Run tests to verify pass**

Run: `bun run test src/lib/games/word-scramble/words.test.ts`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
bun run lint
git add src/lib/games/word-scramble/words.ts src/lib/games/word-scramble/words.test.ts
git commit -m "fix(word-scramble): remove duplicate dictionary words"
```

---

## Task 1.4: Evader — Fix spawn ID collision

`spawnRandomObject` uses `${objectType}-${now}` which collides if two same-type objects spawn in the same millisecond, causing the renderer to drop graphics (keyed by `obj.id`).

**Files:**
- Modify: `src/lib/games/evader/game.ts:115` (use a unique counter)
- Test: `src/lib/games/evader/game.test.ts`

- [ ] **Step 1: Write failing test**

Add to `game.test.ts`:

```typescript
describe('Evader object ID uniqueness', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('generates unique IDs even when Date.now() returns the same value', () => {
        const FIXED_TIME = 1_700_000_000_000
        vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIME)

        game.startGame()

        for (let i = 0; i < 50; i++) {
            vi.advanceTimersByTime(config.spawnInterval * 1000)
        }

        const objects = game.getState().objects
        const ids = objects.map(o => o.id)
        const uniqueIds = new Set(ids)

        expect(ids.length).toBeGreaterThan(1)
        expect(uniqueIds.size).toBe(ids.length)
    })
})
```

- [ ] **Step 2: Run test (informational)**

Run: `bun run test src/lib/games/evader/game.test.ts`

- [ ] **Step 3: Add monotonic counter and use it in ID generation**

In `game.ts`, add a private counter field near line 13:

```typescript
private objectIdCounter = 0
```

In `spawnRandomObject` (line 115), replace:

```typescript
id: `${objectType}-${now}`,
```

with:

```typescript
id: `${objectType}-${now}-${this.objectIdCounter++}`,
```

- [ ] **Step 4: Run tests**

Run: `bun run test src/lib/games/evader/`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
bun run lint
git add src/lib/games/evader/game.ts src/lib/games/evader/game.test.ts
git commit -m "fix(evader): use monotonic counter for unique object IDs"
```

---

## Task 1.5: Reflex — Fix divergent accuracy formula

`game.ts:273-275` computes accuracy as `correctClicks / totalClicks * 100` (correct). `init.ts:55-58` computes it as `coinsCollected / totalClicks * 100` (diverges when bombs are clicked). The overlay shows the wrong value.

**Files:**
- Modify: `src/lib/games/reflex/init.ts:53-59` (use stats.accuracy instead of recomputing)
- Test: `src/lib/games/reflex/init.test.ts`

- [ ] **Step 1: Write failing test**

The init test should verify the accuracy display uses the stats object's accuracy. Add to `init.test.ts`:

```typescript
describe('Reflex accuracy display', () => {
    it('uses stats.accuracy for the display, not coinsCollected/totalClicks', () => {
        // Verify init.ts reads stats.accuracy — test by checking the DOM update
        // uses the same formula as game.ts
    })
})
```

- [ ] **Step 2: Run test**

Run: `bun run test src/lib/games/reflex/init.test.ts`

- [ ] **Step 3: Fix the accuracy computation in init.ts**

In `init.ts`, replace lines 53-59:

```typescript
const finalAccuracyElement = document.getElementById('final-accuracy')
if (finalAccuracyElement) {
    finalAccuracyElement.textContent = `${Math.round(stats.accuracy)}%`
}
```

This uses the `stats.accuracy` from `generateGameStats()` which already uses the correct formula (`correctClicks / totalClicks * 100`).

- [ ] **Step 4: Run tests**

Run: `bun run test src/lib/games/reflex/`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
bun run lint
git add src/lib/games/reflex/init.ts src/lib/games/reflex/init.test.ts
git commit -m "fix(reflex): use stats.accuracy for display instead of divergent formula"
```

---

## Task 1.6: Sudoku — Stop game loop on End Game

The End Game button (in `index.astro`) saves score but never sets `state.isGameOver` or calls cleanup, so the RAF loop (`init.ts:60`) and timer keep running in the background.

**Files:**
- Modify: `src/pages/sudoku/index.astro` (set `state.isGameOver` on End Game click)
- Modify: `src/lib/games/sudoku/init.ts` (expose a stop function)
- Test: `src/lib/games/sudoku/init.test.ts`

- [ ] **Step 1: Read the End Game handler in index.astro**

Read `src/pages/sudoku/index.astro` lines 310-375 to see the current End Game button handler.

- [ ] **Step 2: Expose a stopGame function from init.ts**

In `init.ts`, the returned cleanup function (line 69) cancels the RAF loop. Add a `stopGame` export that sets `state.isGameOver = true` and calls cleanup:

```typescript
return {
    cleanup: () => {
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId)
        }
        abortController.abort()
        if (gameElement.parentNode) {
            gameElement.parentNode.removeChild(gameElement)
        }
    },
    stopGame: () => {
        state.isGameOver = true
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId)
            gameLoopId = null
        }
    },
}
```

- [ ] **Step 3: Wire stopGame into the End Game button in index.astro**

In `index.astro`, in the End Game button handler, call `gameHandle.stopGame()` before saving the score. This stops the RAF loop and timer.

- [ ] **Step 4: Run tests**

Run: `bun run test src/lib/games/sudoku/`
Expected: PASS

- [ ] **Step 5: Manual verification**

```bash
bun run web:dev
```
Navigate to `/sudoku`, start a game, click End Game, verify the timer stops.

- [ ] **Step 6: Lint and commit**

```bash
bun run lint
git add src/lib/games/sudoku/init.ts src/pages/sudoku/index.astro
git commit -m "fix(sudoku): stop game loop and timer on End Game button"
```

---

## Task 1.7: Sudoku — Add uniqueness check to createPuzzle

`createPuzzle` (`utils.ts:80-114`) randomly removes cells without checking if the puzzle still has a unique solution, producing multi-solution puzzles on hard difficulty.

**Files:**
- Modify: `src/lib/games/sudoku/utils.ts` (add a countSolutions check)
- Test: `src/lib/games/sudoku/utils.test.ts`

- [ ] **Step 1: Write failing test for uniqueness**

Add to `utils.test.ts`:

```typescript
describe('Sudoku puzzle uniqueness', () => {
    it('generated puzzles have a unique solution', () => {
        for (let i = 0; i < 10; i++) {
            const { puzzle } = createPuzzle('medium')
            const solutionCount = countSolutions(puzzle, 2)
            expect(solutionCount).toBe(1)
        }
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/games/sudoku/utils.test.ts`
Expected: FAIL — `countSolutions` not exported

- [ ] **Step 3: Add countSolutions and use it in createPuzzle**

Add a `countSolutions(grid, limit)` function to `utils.ts` — a backtracking solver that counts solutions up to `limit`:

```typescript
export function countSolutions(
    grid: number[][],
    limit: number = 2
): number {
    let count = 0

    function solve(g: number[][]): void {
        if (count >= limit) return

        let row = -1
        let col = -1
        for (let r = 0; r < 9 && row === -1; r++) {
            for (let c = 0; c < 9 && row === -1; c++) {
                if (g[r][c] === 0) {
                    row = r
                    col = c
                }
            }
        }

        if (row === -1) {
            count++
            return
        }

        for (let num = 1; num <= 9; num++) {
            if (isValidPlacement(g, row, col, num)) {
                g[row][col] = num
                solve(g)
                g[row][col] = 0
            }
        }
    }

    solve(grid.map(row => [...row]))
    return count
}
```

Modify `createPuzzle` to check uniqueness after removing each cell — if removing a cell creates multiple solutions, restore it and try a different cell.

- [ ] **Step 4: Run tests**

Run: `bun run test src/lib/games/sudoku/utils.test.ts`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
bun run lint
git add src/lib/games/sudoku/utils.ts src/lib/games/sudoku/utils.test.ts
git commit -m "fix(sudoku): guarantee unique solution in generated puzzles"
```

---

## Task 1.8: Evader — Resolve EvaderGameData schema mismatch

Evader sends Reflex-shaped stats (`coinsCollected`, `bombsHit`) but `EvaderGameData` (`shared/types.ts:84-88`) expects `obstaclesEvaded`, `powerUpsCollected`, `longestSurvivalTime`. All Evader-specific achievements are unreachable.

**Files:**
- Modify: `src/lib/games/shared/types.ts:84-88` (align interface with actual game)
- Modify: `src/lib/games/evader/types.ts` (align GameStats)
- Modify: `src/lib/games/evader/init.ts` (pass correct gameData)
- Modify: `src/lib/achievements.ts` (verify Evader achievement predicates match)

- [ ] **Step 1: Read current Evader achievements**

Read `src/lib/achievements.ts` to find all `GameID.EVADER` achievements and see what fields they read from `gameData`.

- [ ] **Step 2: Decide the canonical shape**

Since the game implements a coin/bomb mechanic (not obstacle evasion), align the type to reality. Replace `EvaderGameData` in `shared/types.ts:84-88`:

```typescript
export interface EvaderGameData {
    coinsCollected: number
    bombsHit: number
    longestSurvivalTime: number
}
```

- [ ] **Step 3: Update init.ts to pass correct gameData**

In `evader/init.ts`, build and pass the typed gameData:

```typescript
{
    coinsCollected: stats.coinsCollected,
    bombsHit: stats.bombsHit,
    longestSurvivalTime: stats.gameTime || 0,
}
```

- [ ] **Step 4: Update Evader achievements in achievements.ts**

Update any Evader achievement predicates to read `coinsCollected`/`bombsHit` instead of `obstaclesEvaded`/`powerUpsCollected`.

- [ ] **Step 5: Run all tests**

Run: `bun run test:run`
Expected: PASS

- [ ] **Step 6: Lint and commit**

```bash
bun run lint
git add src/lib/games/shared/types.ts src/lib/games/evader/ src/lib/achievements.ts
git commit -m "fix(evader): align EvaderGameData with actual game mechanics"
```

---

## Task 1.9: Update AGENTS.md game count and documentation

**Status: already complete in the current branch.** AGENTS.md already states "14 fully implemented games", lists Circuit Hacker and Satellite Sync in the Project Overview, Project Structure tree, Game-Specific Notes, Game Count note, and Renderer Architecture (both as PixiJS Canvas). Snake is already classified under "PixiJS Canvas" (not DOM-based). No changes required.

**Files:**
- Already updated: `AGENTS.md`

- [x] **Step 1: Update game count and list** — done (14 games, Circuit Hacker + Satellite Sync present).
- [x] **Step 2: Fix Snake renderer classification** — done (Snake listed under PixiJS Canvas).
- [x] **Step 3: Commit** — already committed on this branch.

---

# Phase 2: Dead Code Removal

Remove verified-dead legacy implementations. Snake and Quick Math both have Framework versions that are live in production; their legacy files are unreachable.

---

## Task 2.1: Delete Snake legacy files

The Framework trio (`SnakeGame.ts`, `SnakeRenderer.ts`, `initFramework.ts`) is wired into the page (`src/pages/snake/index.astro:196`). The legacy trio (`game.ts`, `renderer.ts`, `init.ts`) + their tests are dead.

**Files to delete:**
- `src/lib/games/snake/game.ts`
- `src/lib/games/snake/renderer.ts`
- `src/lib/games/snake/init.ts`
- `src/lib/games/snake/game.pure.test.ts`
- `src/lib/games/snake/init.test.ts`
- `src/lib/games/snake/renderer.test.ts`

**Files to modify:**
- `src/lib/games/snake/types.ts` — remove the "Legacy types for backwards compatibility" block (`GameState`, `GameConstants`, `GameStats` at lines 58-99)
- `src/lib/games/snake/utils.ts` — remove the divergent local `hexToPixiColor` (line 7-9) if only used by legacy `game.ts`
- `src/pages/snake/index.astro` — remove the dead `<div id="snake-board">` element

- [ ] **Step 1: Verify legacy files are not imported by any production code**

Run: `rg "from '@/lib/games/snake/(game|init|renderer)'" src/ --glob='!*.test.ts'`
Expected: No matches (only Framework imports exist)

- [ ] **Step 2: Delete the 6 legacy files**

```bash
rm src/lib/games/snake/game.ts src/lib/games/snake/renderer.ts src/lib/games/snake/init.ts
rm src/lib/games/snake/game.pure.test.ts src/lib/games/snake/init.test.ts src/lib/games/snake/renderer.test.ts
```

- [ ] **Step 3: Remove legacy types from types.ts**

Remove `GameState`, `GameConstants`, `GameStats` (the local versions) and the "Legacy types" comment block from `types.ts`.

- [ ] **Step 4: Remove dead #snake-board div**

In `src/pages/snake/index.astro`, remove `<div id="snake-board"></div>`.

- [ ] **Step 5: Run all tests + lint**

```bash
bun run test:run && bun run lint
```
Expected: PASS (Snake tests should still pass with Framework files)

- [ ] **Step 6: Commit**

```bash
git add -A src/lib/games/snake/ src/pages/snake/index.astro
git commit -m "refactor(snake): remove ~2600 LOC of dead legacy implementation"
```

---

## Task 2.2: Delete Quick Math legacy files

The Framework trio (`FrameworkGame.ts`, `FrameworkInit.ts`, `FrameworkRenderer.ts`) is wired into the page (`src/pages/quick-math/index.astro:219`). Legacy files are dead.

**Files to delete:**
- `src/lib/games/quick-math/game.ts`
- `src/lib/games/quick-math/init.ts`
- `src/lib/games/quick-math/game.test.ts`
- `src/lib/games/quick-math/init.test.ts`

**Files to modify:**
- `src/lib/games/quick-math/types.ts` — after removing legacy, check if any exports are still used; if not, delete the file
- Rename Framework files to canonical names:
  - `FrameworkGame.ts` → `game.ts`
  - `FrameworkInit.ts` → `init.ts`
  - `FrameworkRenderer.ts` → `renderer.ts`
  - (and their test files)
- Update `src/pages/quick-math/index.astro:219` import path

- [ ] **Step 1: Verify legacy files are not imported by production code**

Run: `rg "from '@/lib/games/quick-math/(game|init)'" src/ --glob='!*.test.ts' --glob='!Framework*'`
Expected: No production matches to legacy files

- [ ] **Step 2: Delete legacy files**

```bash
rm src/lib/games/quick-math/game.ts src/lib/games/quick-math/init.ts
rm src/lib/games/quick-math/game.test.ts src/lib/games/quick-math/init.test.ts
```

- [ ] **Step 3: Rename Framework files to canonical names**

```bash
git mv src/lib/games/quick-math/FrameworkGame.ts src/lib/games/quick-math/game.ts
git mv src/lib/games/quick-math/FrameworkInit.ts src/lib/games/quick-math/init.ts
git mv src/lib/games/quick-math/FrameworkRenderer.ts src/lib/games/quick-math/renderer.ts
git mv src/lib/games/quick-math/FrameworkGame.test.ts src/lib/games/quick-math/game.test.ts
git mv src/lib/games/quick-math/FrameworkInit.test.ts src/lib/games/quick-math/init.test.ts
git mv src/lib/games/quick-math/FrameworkRenderer.test.ts src/lib/games/quick-math/renderer.test.ts
```

- [ ] **Step 4: Update imports in renamed files**

Update internal imports within the renamed files (any `./FrameworkGame` → `./game`, etc.). Update the page import in `src/pages/quick-math/index.astro:219`:

```typescript
import { initQuickMathFramework } from '@/lib/games/quick-math/init'
```

- [ ] **Step 5: Delete orphaned types.ts if no longer used**

Check if `types.ts` (the legacy one) is still referenced. If not, delete it. If `MathQuestion` is still needed, keep it or move to `game.ts`.

- [ ] **Step 6: Run all tests + lint**

```bash
bun run test:run && bun run lint
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A src/lib/games/quick-math/ src/pages/quick-math/index.astro
git commit -m "refactor(quick-math): remove legacy files and rename Framework to canonical names"
```

---

# Phase 3: GameData Contract Fixes

Make every game populate its declared `*GameData` interface in `shared/types.ts` when calling `saveGameScore`. This unblocks achievement correctness.

---

## Task 3.1: Tetris — Populate TetrisGameData

**File:** `src/lib/games/tetris/init.ts:105-129`

The `onGameOver` callback receives ad-hoc stats typed as `any`. Replace with the canonical `TetrisGameData` shape.

- [ ] **Step 1:** Read `init.ts:56-130` to see the current stats object.
- [ ] **Step 2:** Build `TetrisGameData` (`{ doubles, triples, tetrises, consecutiveLineClears, piecesPlaced, level }`) and pass it as the 5th argument to `saveGameScore`.
- [ ] **Step 3:** Remove the `any` cast on the stats parameter.
- [ ] **Step 4:** Run `bun run test src/lib/games/tetris/` — fix any test mocks.
- [ ] **Step 5:** `git commit -m "fix(tetris): pass TetrisGameData to saveGameScore"`

## Task 3.2: Memory Matrix — Populate MemoryMatrixGameData

**File:** `src/lib/games/memory-matrix/init.ts:218-237`

Currently passes `undefined` for gameData. Pass `{ matchesFound, moves: totalAttempts, perfectGame: accuracy === 100 }`.

- [ ] **Step 1:** Read `init.ts:218-237` to see the current call.
- [ ] **Step 2:** Build `MemoryMatrixGameData` from the game stats and pass it.
- [ ] **Step 3:** Run tests. Commit: `"fix(memory-matrix): pass MemoryMatrixGameData to saveGameScore"`

## Task 3.3: Word Scramble — Populate totalWordsScrambled

**File:** `src/lib/games/word-scramble/init.ts:266-276`

`totalWordsScrambled` is declared in `WordScrambleGameData` but never sent.

- [ ] **Step 1:** Add `totalWordsScrambled: stats.totalWordsScrambled` to the gameData object.
- [ ] **Step 2:** Run tests. Commit: `"fix(word-scramble): populate totalWordsScrambled in gameData"`

## Task 3.4: Path Navigator — Fix field name mismatch

**File:** `src/lib/games/path-navigator/init.ts:53-60`

Sends `{ levelsCompleted, perfectLevels, pathViolations }` but `PathNavigatorGameData` expects `{ pathsCompleted, perfectPaths }`.

- [ ] **Step 1:** Map `levelsCompleted → pathsCompleted`, `perfectLevels → perfectPaths` in the gameData payload.
- [ ] **Step 2:** Run tests. Commit: `"fix(path-navigator): align gameData with PathNavigatorGameData contract"`

## Task 3.5: 2048 — Fix field name mismatch

**File:** `src/lib/games/2048/init.ts:163-167`

Sends `{ maxTile, mergeCount, gameWon }` but `Game2048Data` expects `{ maxTile, moves, merges }`.

- [ ] **Step 1:** Map `mergeCount → merges`, add `moves: stats.moveCount`. Drop `gameWon` (not in interface) or add it to the interface.
- [ ] **Step 2:** Run tests. Commit: `"fix(2048): align gameData with Game2048Data contract"`

## Task 3.6: Snake — Fix field name drift

**File:** `src/lib/games/snake/SnakeGame.ts:162-169` (getGameData)

`SnakeGameData` in `src/lib/games/shared/types.ts:98-101` is already aligned with the implementation and uses the canonical fields `{ foodsEaten, maxLength }` — the game uses "food" not "apples", so `applesEaten` is not part of the contract. `SnakeGame.getGameData` sends `{ foodsEaten, maxLength, timeElapsed }`; the `timeElapsed` field is extra (not in `SnakeGameData`) and can be dropped or added to the interface. Achievement predicates referencing Snake should use `foodsEaten` (not `applesEaten`).

- [ ] **Step 1:** Drop the extra `timeElapsed` from the `getGameData` payload (or add it to `SnakeGameData`). Verify any achievement predicates reference `foodsEaten`.
- [ ] **Step 2:** Run tests. Commit: `"fix(snake): align SnakeGameData field names with implementation"`

## Task 3.7: Sudoku — Populate SudokuGameData

**File:** `src/lib/games/sudoku/init.ts:354-357` and `src/pages/sudoku/index.astro:339-348`

Both save calls pass `undefined` for gameData. Pass `{ difficulty, cellsFilled, hintsUsed: 0 }`.

- [ ] **Step 1:** Build `SudokuGameData` from the game state.
- [ ] **Step 2:** Consolidate the two save calls into one path (the dual runGuard race is a separate issue).
- [ ] **Step 3:** Run tests. Commit: `"fix(sudoku): pass SudokuGameData to saveGameScore"`

---

# Phase 4: Adopt shared/utils.ts

`shared/utils.ts` is imported by zero games. Each game reinvents its utilities. This phase makes mechanical import swaps to adopt the shared module.

**Reference:** `src/lib/games/shared/utils.ts` exports: `randomInt`, `randomFloat`, `randomElement`, `shuffleArray`, `clamp`, `lerp`, `distance`, `rectOverlap`, `pointInRect`, `pointInCircle`, `formatTime`, `formatNumber`, `debounce`, `throttle`, `generateId`, `create2DArray`, `deepClone`, `easeInOutCubic`, `easeOutElastic`.

**Reference:** `src/lib/games/shared/types.ts` exports: `hexToPixiColor`, `pixiColorToHex` (validated versions).

---

## Task 4.1: Remove local hexToPixiColor from snake/utils.ts and tetris/utils.ts

**Files:**
- `src/lib/games/snake/utils.ts:7-9` — delete local `hexToPixiColor`, re-export from shared
- `src/lib/games/tetris/utils.ts:4-10` — delete local `hexToPixiColor` + `pixiColorToHex`, re-export from shared

- [ ] **Step 1:** In `snake/utils.ts`, replace the function body with:
```typescript
export { hexToPixiColor } from '@/lib/games/shared/types'
```
- [ ] **Step 2:** In `tetris/utils.ts`, replace with:
```typescript
export { hexToPixiColor, pixiColorToHex } from '@/lib/games/shared/types'
```
- [ ] **Step 3:** Run tests for both games. Commit: `"refactor: adopt shared hexToPixiColor in snake and tetris"`

## Task 4.2: Remove local shuffleArray from memory-matrix and word-scramble

**Files:**
- `src/lib/games/memory-matrix/utils.ts:25-32` — local shuffleArray (non-mutating)
- `src/lib/games/word-scramble/words.ts:200-207` — local shuffleArray (non-mutating)

**Note:** The shared `shuffleArray` mutates in place. The local versions return a new array. Either:
(a) Add a non-mutating variant to shared, or
(b) Change call sites to spread-then-shuffle: `shuffleArray([...arr])`

- [ ] **Step 1:** Add `shuffleArrayCopy` to `shared/utils.ts`:
```typescript
export function shuffleArrayCopy<T>(array: T[]): T[] {
    return shuffleArray([...array])
}
```
- [ ] **Step 2:** Replace local versions with imports of `shuffleArrayCopy`.
- [ ] **Step 3:** Run tests. Commit: `"refactor: adopt shared shuffleArrayCopy in memory-matrix and word-scramble"`

## Task 4.3: Adopt shared utils in each legacy game (batch)

For each game, replace local reinventions with shared imports. This is a mechanical task — one commit per game.

| Game | File | Replace | With |
|------|------|---------|------|
| Tetris | `game.ts:82-84` | `Array(H).fill(null).map(...)` | `create2DArray(H, W, null)` |
| Tetris | `game.ts:108-111` | `Math.floor(Math.random()*len)` | `randomElement(arr)` |
| Tetris | `game.ts:114` | `structuredClone(...)` | `deepClone(...)` |
| Sudoku | `utils.ts:5-7` | `Array(9).fill(null).map(...)` | `create2DArray(9, 9, 0)` |
| Sudoku | `utils.ts:52-57` | inline Fisher-Yates | `shuffleArray` |
| Sudoku | `utils.ts:84` | `grid.map(r=>[...r])` | `deepClone` |
| Sudoku | `init.ts:92-97` | inline mm:ss | `formatTime` |
| Sudoku | `utils.ts:104-105` | `Math.floor(Math.random()*9)` | `randomInt(0, 8)` |
| 2048 | `utils.ts:167-173` | `createEmptyBoard` | `create2DArray(4, 4, null)` |
| 2048 | `utils.ts:178-184` | inline random pick | `randomElement(emptyCells)` |
| Bejeweled | `utils.ts:4-6` | `randomChoice` | `randomElement` |
| Bejeweled | `utils.ts:20-24` | `cloneGrid` | `deepClone` (or keep for perf) |
| Bejeweled | `utils.ts:32-34` | `Array.from(...)` grid init | `create2DArray` |
| Bejeweled | `renderer.ts:365-367` | local `lerp` | shared `lerp` |
| Bubble Shooter | `physics.ts:62-65,175-178` | inline `Math.sqrt(...)` | `distance(...)` |
| Bubble Shooter | `utils.ts:4-6` | local `pixiColorToHex` | shared `pixiColorToHex` |
| Path Navigator | `game.ts:458-462` | local `distance` | shared `distance` |
| Path Navigator | `game.ts:349-358` | buffer hit-test | `pointInCircle` |
| Path Navigator | `init.ts:164-174` | manual clamps | `clamp` |
| Evader | `game.ts:153-159,169-175` | manual clamps | `clamp` |
| Evader | `game.ts:191-207` | manual AABB | `rectOverlap` |
| Evader | `game.ts:115` | bespoke ID | `generateId()` |
| Reflex | `game.ts:144` | inline random pick | `randomElement` |
| Reflex | `game.ts:154` | bespoke ID | `generateId()` |
| Word Scramble | `words.ts:214` | inline random pick | `randomElement` |
| Word Scramble | `game.ts:62` | bespoke ID | `generateId()` |

- [ ] **Step 1:** For each game, add the import line: `import { specificUtils } from '@/lib/games/shared/utils'`
- [ ] **Step 2:** Replace the local reinvention with the shared call.
- [ ] **Step 3:** Run that game's tests.
- [ ] **Step 4:** Commit per game: `"refactor(<game>): adopt shared utils"`.

---

# Phase 5: Shared Module Extraction

Extract generic, cross-game patterns into new shared modules. Each module is created first, then consumers are migrated.

---

## Task 5.1: Create shared/grid.ts

Grid operations duplicated across Tetris, 2048, Bejeweled, Sudoku, Memory Matrix, Circuit Hacker, Snake.

**File:** Create `src/lib/games/shared/grid.ts`

```typescript
/**
 * Generic 2D grid operations shared across grid-based games.
 */

export type Grid<T> = T[][]

/** Create a rows×cols grid filled with a value or factory. */
export function createGrid<T>(
    rows: number,
    cols: number,
    fill: T | (() => T)
): Grid<T> {
    const factory = typeof fill === 'function' ? (fill as () => T) : () => fill
    return Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => factory())
    )
}

/** Iterate every cell in a grid. */
export function forEachCell<T>(
    grid: Grid<T>,
    cb: (value: T, row: number, col: number) => void
): void {
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            cb(grid[r][c], r, c)
        }
    }
}

/** Shallow clone a grid (copies each row). */
export function cloneGrid<T>(grid: Grid<T>): Grid<T> {
    return grid.map(row => [...row])
}

/** Deep clone a grid of plain data via JSON. */
export function deepCloneGrid<T>(grid: Grid<T>): Grid<T> {
    return JSON.parse(JSON.stringify(grid))
}

/** Check if a position is within grid bounds. */
export function inBounds<T>(
    grid: Grid<T>,
    row: number,
    col: number
): boolean {
    return row >= 0 && row < grid.length && col >= 0 && col < grid[row].length
}

/** Find all cells matching a predicate. */
export function findCells<T>(
    grid: Grid<T>,
    predicate: (value: T, row: number, col: number) => boolean
): Array<{ row: number; col: number; value: T }> {
    const result: Array<{ row: number; col: number; value: T }> = []
    forEachCell(grid, (value, row, col) => {
        if (predicate(value, row, col)) {
            result.push({ row, col, value })
        }
    })
    return result
}

/** Swap two cells in a grid. */
export function swapCells<T>(
    grid: Grid<T>,
    a: { row: number; col: number },
    b: { row: number; col: number }
): void {
    const temp = grid[a.row][a.col]
    grid[a.row][a.col] = grid[b.row][b.col]
    grid[b.row][b.col] = temp
}

/** Check if two positions are adjacent (4-directional). */
export function isAdjacent(
    a: { row: number; col: number },
    b: { row: number; col: number }
): boolean {
    const dr = Math.abs(a.row - b.row)
    const dc = Math.abs(a.col - b.col)
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
}

/** Find a random free cell on a grid (null = free). */
export function findRandomFreeCell<T>(
    grid: Grid<T | null>,
    occupied: Array<{ row: number; col: number }> = []
): { row: number; col: number } | null {
    const occupiedSet = new Set(occupied.map(p => `${p.row},${p.col}`))
    const free = findCells(
        grid,
        (value, r, c) => value === null && !occupiedSet.has(`${r},${c}`)
    )
    if (free.length === 0) {
        return null
    }
    const pick = free[Math.floor(Math.random() * free.length)]
    return { row: pick.row, col: pick.col }
}
```

- [ ] **Step 1:** Create the file.
- [ ] **Step 2:** Create `shared/grid.test.ts` with unit tests for each function.
- [ ] **Step 3:** Run tests. Commit: `"feat: add shared/grid.ts module"`

## Task 5.2: Create shared/geometry.ts

Geometry/collision primitives duplicated across Path Navigator, Satellite Sync, Bubble Shooter, Evader, Reflex.

**File:** Create `src/lib/games/shared/geometry.ts`

```typescript
/**
 * Shared geometry and collision primitives for canvas games.
 */

export interface Point {
    x: number
    y: number
}

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

/** Euclidean distance between two points. */
export function distance(a: Point, b: Point): number {
    return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Clamp a value to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

/** Linear interpolation. */
export function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * clamp(t, 0, 1)
}

/** Check if a point is inside a rectangle. */
export function pointInRect(p: Point, rect: Rect): boolean {
    return (
        p.x >= rect.x &&
        p.x <= rect.x + rect.width &&
        p.y >= rect.y &&
        p.y <= rect.y + rect.height
    )
}

/** Check if a point is inside a circle. */
export function pointInCircle(p: Point, center: Point, radius: number): boolean {
    return distance(p, center) <= radius
}

/** Check if two rectangles overlap (AABB). */
export function rectOverlap(a: Rect, b: Rect): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    )
}

/** Check if two circles overlap. */
export function circleOverlap(
    a: Point,
    ra: number,
    b: Point,
    rb: number
): boolean {
    return distance(a, b) <= ra + rb
}

/** Quadratic Bezier point at parameter t. */
export function quadraticBezierPoint(
    t: number,
    p0: Point,
    p1: Point,
    p2: Point
): Point {
    const mt = 1 - t
    return {
        x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
        y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    }
}

/** Distance from a point to a line segment. Returns distance and projection param. */
export function distanceToSegment(
    p: Point,
    a: Point,
    b: Point
): { distance: number; param: number } {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) {
        return { distance: distance(p, a), param: 0 }
    }
    let param = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
    param = clamp(param, 0, 1)
    const proj: Point = { x: a.x + param * dx, y: a.y + param * dy }
    return { distance: distance(p, proj), param }
}

/** Normalize an angle to [-PI, PI]. */
export function normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI
    while (angle < -Math.PI) angle += 2 * Math.PI
    return angle
}

/** Absolute difference between two angles. */
export function angleDiff(a: number, b: number): number {
    return Math.abs(normalizeAngle(a - b))
}

/** Check if a line segment intersects a circle. */
export function segmentIntersectsCircle(
    a: Point,
    b: Point,
    center: Point,
    radius: number
): boolean {
    return distanceToSegment(center, a, b).distance <= radius
}
```

- [ ] **Step 1:** Create the file + test file.
- [ ] **Step 2:** Run tests. Commit: `"feat: add shared/geometry.ts module"`

## Task 5.3: Create shared/match3.ts

Match-3 logic in Bejeweled's `utils.ts:79-231` is fully generic (parameterized over cell type). Extract it.

**File:** Create `src/lib/games/shared/match3.ts`

Extract `findMatches`, `removeMatches`, `applyGravity`, `refill`, `swap` from `bejeweled/utils.ts` as generic functions over `Grid<T | null>`.

- [ ] **Step 1:** Create the module with generic functions.
- [ ] **Step 2:** Create tests (port from `bejeweled/utils.test.ts`).
- [ ] **Step 3:** Migrate `bejeweled/utils.ts` to import from `shared/match3.ts`.
- [ ] **Step 4:** Run tests. Commit: `"feat: extract shared/match3.ts from bejeweled"`

## Task 5.4: Create shared/direction.ts

Direction logic in `snake/utils.ts:84-120` (`getNextPosition`, `isValidDirectionChange`, opposites table) is generic.

**File:** Create `src/lib/games/shared/direction.ts`

```typescript
export type Direction = 'up' | 'down' | 'left' | 'right'

const DELTAS: Record<Direction, { dr: number; dc: number }> = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
}

const OPPOSITES: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
}

export function nextPosition(
    pos: { row: number; col: number },
    dir: Direction
): { row: number; col: number } {
    const d = DELTAS[dir]
    return { row: pos.row + d.dr, col: pos.col + d.dc }
}

export function isValidTurn(from: Direction, to: Direction): boolean {
    return OPPOSITES[from] !== to
}

export function opposite(dir: Direction): Direction {
    return OPPOSITES[dir]
}
```

- [ ] **Step 1:** Create file + tests.
- [ ] **Step 2:** Migrate `snake/utils.ts` to import from it.
- [ ] **Step 3:** Run tests. Commit: `"feat: extract shared/direction.ts from snake"`

## Task 5.5: Create shared/spawner.ts (Reflex + Evader coin/bomb)

Both Reflex and Evader share identical coin/bomb spawning logic.

**File:** Create `src/lib/games/shared/spawner.ts`

```typescript
/**
 * Shared spawning utilities for coin/bomb style games.
 */

export type SpawnType = 'coin' | 'bomb'

/** Decide coin vs bomb based on a coinToBombRatio (coins per bomb). */
export function rollSpawnType(
    coinToBombRatio: number,
    rng: () => number = Math.random
): SpawnType {
    return rng() < coinToBombRatio / (coinToBombRatio + 1) ? 'coin' : 'bomb'
}

/** Weighted random pick. */
export function weightedPick<T>(
    items: Array<{ item: T; weight: number }>,
    rng: () => number = Math.random
): T | undefined {
    const total = items.reduce((sum, i) => sum + i.weight, 0)
    let roll = rng() * total
    for (const entry of items) {
        roll -= entry.weight
        if (roll <= 0) return entry.item
    }
    return items[items.length - 1]?.item
}
```

- [ ] **Step 1:** Create file + tests.
- [ ] **Step 2:** Migrate `reflex/game.ts:147-149` and `evader/game.ts:108-110` to use `rollSpawnType`.
- [ ] **Step 3:** Run tests. Commit: `"feat: extract shared/spawner.ts from reflex and evader"`

## Task 5.6: Migrate games to new shared modules

For each new shared module, migrate consumers one game at a time:

- [ ] **6a:** Tetris → `shared/grid.ts` (board init, forEachFilledCell)
- [ ] **6b:** 2048 → `shared/grid.ts` (createEmptyBoard, findEmptyCells, cloneBoard)
- [ ] **6c:** Sudoku → `shared/grid.ts` (board init, deepClone)
- [ ] **6d:** Memory Matrix → `shared/grid.ts` (createGameBoard)
- [ ] **6e:** Path Navigator → `shared/geometry.ts` (distance, pointInCircle, quadraticBezierPoint, distanceToSegment, clamp)
- [ ] **6f:** Bubble Shooter → `shared/geometry.ts` (distance, circleOverlap)
- [ ] **6g:** Satellite Sync → `shared/geometry.ts` (normalizeAngle, angleDiff, segmentIntersectsCircle, clamp)
- [ ] **6h:** Evader → `shared/geometry.ts` (rectOverlap, clamp) + `shared/spawner.ts`
- [ ] **6i:** Reflex → `shared/grid.ts` (findRandomFreeCell) + `shared/spawner.ts`

Each migration: update imports, delete local copies, run tests, commit.

---

## Post-Phase Verification (PR 1)

After all 5 phases:

- [ ] **Full test suite:** `bun run test:run` — all green
- [ ] **Lint:** `bun run lint` — no errors
- [ ] **Format:** `bun run format:check` — clean
- [ ] **Build:** `bun run build` — succeeds

---

## Summary

| Phase | Tasks | Risk | Est. Effort |
|-------|-------|------|-------------|
| 1. P0 bugs | 9 | Low | 1-2 days |
| 2. Dead code | 2 | Low | 0.5 days |
| 3. GameData contracts | 7 | Low-Med | 1 day |
| 4. shared/utils adoption | ~15 | Low | 1-2 days |
| 5. Shared modules | 6 + 9 migrations | Medium | 3-5 days |
| **Total** | **~40 tasks** | | **1-2 weeks** |

**Next:** PR 2 (BaseGame framework migration, Phase 6) builds on this foundation.
