# Chromatic Tide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-633 as a 90-second 8×8 five-color flood-fill strategy minigame with finite random boards, fixed-point territory expansion, move/time efficiency scoring, keyboard/touch controls, DOM rendering, achievements, and the existing Cetus score/progress flow.

**Architecture:** `ChromaticTideGame` extends `BaseGame` and owns event-driven state/lifecycle only. `board.ts` owns finite board creation, deep-enough local cloning, fixed-point flood traversal, and the unit-proven greedy selector used by browser tests; `scoring.ts` owns arithmetic. `ChromaticTideRenderer` extends `DOMRenderer`; one local initializer owns stable color buttons, keys `1`–`5`, HUD/overlay updates, notifications, and cleanup. No shared flood/control framework is added.

**Tech Stack:** Astro 5, TypeScript 6, BaseGame/GameTimer/ScoreManager, DOMRenderer, Tailwind 4, Vitest 3, Playwright 1.54, Bun 1.3.

**Spec:** `docs/superpowers/specs/2026-08-25-chromatic-tide-design.md`

## Global Constraints

- One HPA-633 PR from planning through implementation.
- One 8×8 / five-color / 90-second ruleset; no difficulty selector.
- Generation consumes exactly 64 RNG samples and never retries. Repair only the all-one-color already-cleared case by changing bottom-right to the next palette color without extra RNG.
- Reuse `createGrid` / `inBounds` from `src/lib/games/shared/grid.ts`; keep `cloneBoard()` local because shared `cloneGrid()` is shallow and would retain cell-object aliases.
- Keep Chromatic Tide flood/capture semantics local. Do not reuse Mine Grid's 8-direction reveal, Circuit Hacker's wire connectivity, or add orthogonal flood to shared grid helpers.
- Current color is rejected; another color with zero immediate gain is a valid move and increments `movesUsed` once.
- Flood resolves to a fixed point before one state emission.
- No move-limit loss, optimal solver, hints, Daily/campaign, AI, persistence, API, auth, DB, schema, Pixi, rAF, worker, or new timer.
- BaseGame/GameTimer remain authoritative for timer, end/save, stale-run guard, achievements, reset/start, and final timer snapshots.
- BaseGame time bonus stays disabled; `scoring.ts` is the only arithmetic authority. The model synchronizes by positive delta to the pure score target.
- Board cells are presentation, not controls. Five stable Astro buttons and keys `1`–`5` both call `game.chooseColor()`.
- Use `isEditableTarget` for keyboard filtering.
- Do not rely on hue alone: cells show palette index and labels; controls show number + name.
- Copy existing organism palette hexes locally into page CSS; do not import `OrganismColor` or add global tokens.
- Bootstrap script stays after `</GamePage>`.
- Explicitly append `'chromatic-tide'` to `src/pages/game-board-markup.test.ts`'s hardcoded wrapper-sweep `games` array.
- Catalog identity: `chromatic_tide`, `🌈`, Strategy, Mid-water, `{ shape: 'frond', color: 'teal' }`; final depth counts `9 / 10 / 4`.
- `GameType` already follows `GameID`; no server/db type edit.
- `Button.astro` already forwards native button attributes; no Button change.
- Do not edit `e2e/games/all-games-navigation.spec.ts`; run it after catalog registration because it derives targets from `GAMES`.
- No changes to BaseGame, GameTimer, ScoreManager, GamePage, DOMRenderer, score service, API/DB/auth/schema/packages, or unrelated games.

---

## File Map

### New production

- `src/lib/games/chromatic-tide/types.ts` — rules, palette, config, board/state/stats/game-data types.
- `src/lib/games/chromatic-tide/board.ts` — finite generation, local deep clone, initial territory, fixed-point flood, captured count, greedy selector.
- `src/lib/games/chromatic-tide/scoring.ts` — pure score calculation.
- `src/lib/games/chromatic-tide/ChromaticTideGame.ts` — BaseGame model, `chooseColor()`, stats, protected save/achievement payload.
- `src/lib/games/chromatic-tide/ChromaticTideRenderer.ts` — DOM board.
- `src/lib/games/chromatic-tide/initFramework.ts` — DOM controls/lifecycle/HUD/overlay.
- `src/pages/chromatic-tide/index.astro` — route and local styling.

### New tests

- `src/lib/games/chromatic-tide/board.test.ts`
- `src/lib/games/chromatic-tide/scoring.test.ts`
- `src/lib/games/chromatic-tide/ChromaticTideGame.test.ts`
- `src/lib/games/chromatic-tide/ChromaticTideRenderer.test.ts`
- `src/lib/games/chromatic-tide/initFramework.test.ts`

### Existing files

- `src/lib/games.ts`, `src/lib/games.test.ts`
- `src/lib/games/shared/types.ts`
- `src/lib/organisms.test.ts`
- `src/lib/achievements.ts`, `src/lib/achievements.test.ts`
- `src/pages/game-board-markup.test.ts`
- `e2e/games/play-coverage.spec.ts`
- `CLAUDE.md` only if its existing factual game/debug lists become stale.

---

## Task 1: Rules, finite board semantics, greedy progress, and scoring

**Files:** create `types.ts`, `board.ts`, `board.test.ts`, `scoring.ts`, `scoring.test.ts` under `src/lib/games/chromatic-tide/`.

**Produces:** `CHROMATIC_TIDE_RULES`, `CHROMATIC_TIDE_PALETTE`, config/types, `createChromaticTideBoard`, `markInitialTerritory`, `floodChromaticTideBoard`, `countCapturedCells`, `selectGreedyChromaticTideColor`, `calculateChromaticTideScore`.

- [ ] **1.1 Write RED board tests**

Use:

```ts
function cell(color: ChromaticTideColor, captured = false) {
    return { color, captured }
}
```

Pin finite generation:

```ts
it('consumes exactly one RNG sample per cell and repairs all-one-color input without retrying', () => {
    const rng = vi.fn(() => 0)
    const config = createChromaticTideConfig()
    const board = createChromaticTideBoard(config, rng)

    expect(rng).toHaveBeenCalledTimes(config.rows * config.cols)
    expect(board[0][0].color).toBe('teal')
    expect(board[config.rows - 1][config.cols - 1].color).toBe('amber')
    expect(countCapturedCells(board)).toBe(config.rows * config.cols - 1)
})
```

Pin flood semantics:

```ts
it('captures an orthogonal chain to a fixed point without diagonal capture', () => {
    const board: ChromaticTideBoard = [
        [cell('teal', true), cell('amber'), cell('amber')],
        [cell('green'), cell('amber'), cell('ice')],
        [cell('amber'), cell('ice'), cell('magenta')],
    ]

    const next = floodChromaticTideBoard(board, 'amber')

    expect(next[0][0]).toEqual(cell('amber', true))
    expect(next[0][1].captured).toBe(true)
    expect(next[0][2].captured).toBe(true)
    expect(next[1][1].captured).toBe(true)
    expect(next[2][0].captured).toBe(false)
    expect(board[0][0]).toEqual(cell('teal', true))
})
```

Also cover `NaN`, negative, `1`, and >1 RNG samples; top-left component discovery; diagonal exclusion; source-row/cell non-mutation; exact captured count.

Run:

```bash
bun run test:run -- src/lib/games/chromatic-tide/board.test.ts
```

Expected RED: modules do not exist.

- [ ] **1.2 Implement canonical types/config**

```ts
export const CHROMATIC_TIDE_RULES = {
    duration: 90,
    rows: 8,
    cols: 8,
    progressPointsPerCell: 10,
    completionBonus: 500,
    efficiencyReferenceMoves: 28,
    efficiencyPointsPerMove: 25,
    timePointsPerSecond: 2,
} as const

export const CHROMATIC_TIDE_PALETTE = [
    'teal',
    'amber',
    'magenta',
    'ice',
    'green',
] as const
```

Define `ChromaticTideColor`, `ChromaticTideOutcome`, `ChromaticTideCell`, `ChromaticTideBoard`, `ChromaticTideState`, `ChromaticTideStats`, `ChromaticTideGameData`, `ChromaticTideConfig` and:

```ts
export function createChromaticTideConfig(
    overrides: Partial<ChromaticTideConfig> = {}
): ChromaticTideConfig {
    return {
        ...CHROMATIC_TIDE_RULES,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        rng: Math.random,
        ...overrides,
    }
}
```

- [ ] **1.3 Implement pure board helpers**

Use `createGrid` / `inBounds`, local orthogonal deltas, clamp-not-retry sample normalization, and local deep-enough clone:

```ts
function cloneBoard(board: ChromaticTideBoard): ChromaticTideBoard {
    return board.map(row => row.map(cell => ({ ...cell })))
}
```

Do not use shared `cloneGrid()`.

`createChromaticTideBoard(config, rng = config.rng)` calls RNG once per cell, repairs only all-one-color, then returns `markInitialTerritory(board)`.

`floodChromaticTideBoard` clones first, recolors existing territory, enqueues captured positions, captures matching orthogonal neighbors on enqueue, and drains the queue before return.

Run board tests; expected PASS.

- [ ] **1.4 Add RED greedy-progress fixtures**

Use several explicit connected-territory boards. For every fixture:

```ts
let board = deepFixtureCopy
let current = board[0][0].color
const total = board.length * board[0].length
const initiallyUncaptured = total - countCapturedCells(board)
let steps = 0

while (countCapturedCells(board) < total) {
    const before = countCapturedCells(board)
    const color = selectGreedyChromaticTideColor(board, current)
    const next = floodChromaticTideBoard(board, color)
    const after = countCapturedCells(next)

    expect(color).not.toBe(current)
    expect(after).toBeGreaterThan(before)

    board = next
    current = color
    steps++
}

expect(steps).toBeLessThanOrEqual(initiallyUncaptured)
```

Include an irregular boundary and a board where at least one legal non-current color has zero gain. This is the unit proof for the browser driver's progress claim.

- [ ] **1.5 Implement the greedy selector**

```ts
export function selectGreedyChromaticTideColor(
    board: ChromaticTideBoard,
    territoryColor: ChromaticTideColor
): ChromaticTideColor {
    const candidates = CHROMATIC_TIDE_PALETTE.filter(
        color => color !== territoryColor
    )
    let best = candidates[0]
    let bestCaptured = -1

    for (const color of candidates) {
        const captured = countCapturedCells(
            floodChromaticTideBoard(board, color)
        )
        if (captured > bestCaptured) {
            best = color
            bestCaptured = captured
        }
    }

    return best
}
```

No look-ahead/BFS/optimal solver.

- [ ] **1.6 Write RED scoring tests**

```ts
const config = createChromaticTideConfig()
const total = config.rows * config.cols

expect(
    calculateChromaticTideScore(
        {
            cleared: false,
            capturedCells: 20,
            initialCapturedCells: 5,
            movesUsed: 7,
            secondsRemaining: 42,
        },
        config
    )
).toBe(15 * config.progressPointsPerCell)

expect(
    calculateChromaticTideScore(
        {
            cleared: true,
            capturedCells: total,
            initialCapturedCells: 5,
            movesUsed: 20,
            secondsRemaining: 30.9,
        },
        config
    )
).toBe(
    total * config.progressPointsPerCell +
        config.completionBonus +
        (config.efficiencyReferenceMoves - 20) *
            config.efficiencyPointsPerMove +
        30 * config.timePointsPerSecond
)
```

Also cover non-finite/negative values, clamping, no negative efficiency bonus, seconds clamp, and unfinished score independence from time/moves.

- [ ] **1.7 Implement `calculateChromaticTideScore()` and run Task 1 gates**

Use one local finite-integer normalizer; unfinished score is gained cells only, clear score is full-board base + completion + non-negative efficiency + floored time.

Run:

```bash
bun run test:run -- \
  src/lib/games/chromatic-tide/board.test.ts \
  src/lib/games/chromatic-tide/scoring.test.ts
```

Expected PASS.

- [ ] **1.8 Commit**

```bash
git add src/lib/games/chromatic-tide/{types.ts,board.ts,board.test.ts,scoring.ts,scoring.test.ts}
git commit -m "feat(chromatic-tide): add board and scoring rules"
```

---

## Task 2: Stable identity and BaseGame model

**Files:** modify `src/lib/games.ts`, `src/lib/games.test.ts`; create `ChromaticTideGame.ts`, `ChromaticTideGame.test.ts`.

**Produces:** stable enum/icon and event-driven game model. `getGameStats()` is public reporting; protected `getGameData()` is the BaseGame save/achievement hook.

- [ ] **2.1 Add stable ID/icon only**

```ts
CHROMATIC_TIDE = 'chromatic_tide',
```

and:

```ts
[GameID.CHROMATIC_TIDE]: '🌈',
```

Test ID/icon/generated URL. Do not add the active `GAMES` row until Task 4. Do not touch DB/server types.

- [ ] **2.2 Write RED model/lifecycle tests**

Use RNG fixtures, e.g. 63 teal cells + one amber cell for one-move clear. Cover current-color rejection, legal zero-gain move, clear/end once, post-clear rejection, reset, timeout partial score, stats fields, and non-empty achievement payload.

Expose protected methods only in a test subclass:

```ts
class TestChromaticTideGame extends ChromaticTideGame {
    expireForTest(): void {
        this.handleTimeUp()
    }

    gameDataForTest(): Record<string, unknown> {
        return this.getGameData()
    }
}
```

Assert `gameDataForTest()` returns `cleared`, `movesUsed`, `capturedCells`, `initialCapturedCells`, `secondsRemaining` rather than `{}`.

- [ ] **2.3 Implement `ChromaticTideGame`**

Constructor:

```ts
super(GameID.CHROMATIC_TIDE, config, callbacks, {
    basePoints: 0,
    timeBonus: false,
})
```

`createInitialState()` uses `createChromaticTideBoard()` and records initial capture count.

`chooseColor()` rejects inactive/paused/game-over/non-playing/runtime-invalid/current color; otherwise floods, increments one move, updates board/current/capture count, classifies clear, synchronizes score, emits state, then on clear:

```ts
void this.end().catch((error: unknown) =>
    console.error('ChromaticTide end failed', error)
)
```

Use one private target-score sync:

```ts
const target = calculateChromaticTideScore(
    {
        cleared: this.state.outcome === 'cleared',
        capturedCells: this.state.capturedCells,
        initialCapturedCells: this.state.initialCapturedCells,
        movesUsed: this.state.movesUsed,
        secondsRemaining: this.getTimerStatus().currentTime,
    },
    this.config
)
const delta = target - this.state.score
if (delta > 0) this.addScore(delta, 'tide_progress')
```

`update`, `render`, `cleanup` are no-ops. `handleTimeUp()` sets timeout, syncs score, emits state, delegates to `super.handleTimeUp()`.

- [ ] **2.4 Implement the two data surfaces explicitly**

```ts
getGameStats(): ChromaticTideStats {
    const timer = this.getTimerStatus()
    return {
        finalScore: this.state.score,
        timeElapsed: Math.floor(timer.elapsedTime),
        gameCompleted: this.state.outcome === 'cleared',
        outcome: this.state.outcome,
        movesUsed: this.state.movesUsed,
        capturedCells: this.state.capturedCells,
        initialCapturedCells: this.state.initialCapturedCells,
        secondsRemaining: Math.floor(timer.currentTime),
    }
}

protected override getGameData(): Record<string, unknown> {
    const timer = this.getTimerStatus()
    return {
        cleared: this.state.outcome === 'cleared',
        movesUsed: this.state.movesUsed,
        capturedCells: this.state.capturedCells,
        initialCapturedCells: this.state.initialCapturedCells,
        secondsRemaining: Math.floor(timer.currentTime),
    }
}
```

Do not create a second public game-data method. BaseGame calls this protected hook during final score save/achievement evaluation.

- [ ] **2.5 Run and commit Task 2**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/games/chromatic-tide/{board.test.ts,scoring.test.ts,ChromaticTideGame.test.ts}

git add src/lib/games.ts src/lib/games.test.ts \
  src/lib/games/chromatic-tide/ChromaticTideGame.ts \
  src/lib/games/chromatic-tide/ChromaticTideGame.test.ts
git commit -m "feat(chromatic-tide): add game model"
```

---

## Task 3: DOM renderer, controls, initializer, route, and wrapper contract

**Files:** create renderer/init/page and tests; modify `src/pages/game-board-markup.test.ts`.

- [ ] **3.1 Write RED renderer tests**

Render a small state into `#chromatic-tide-board`; assert one `role=gridcell` per cell, row/col/color/captured data attributes, visible palette index, aria label containing position/name/territory, rerender replacement, cleanup.

- [ ] **3.2 Implement renderer**

Extend `DOMRenderer`, clear/rebuild cells only, no event delegation. Each cell gets `data-color`, `data-captured`, 1-based palette text, and descriptive aria label.

- [ ] **3.3 Write RED initializer tests**

Use stable five-button DOM. Cover idle disabled state, Start enabling four non-current colors, click and key `1`–`5` through same action, editable target rejection, current disabled/pressed state, reset/replay, overlay stats, idempotent cleanup, and no post-cleanup mutation.

- [ ] **3.4 Implement initializer**

Return:

```ts
export interface ChromaticTideInitResult {
    game: ChromaticTideGame
    renderer: ChromaticTideRenderer
    getGame: () => ChromaticTideGame
    getState: () => ReturnType<ChromaticTideGame['getState']>
    restart: () => void
    cleanup: () => void
}
```

Follow Mine Grid's local listener tracking, BaseGame callbacks, achievement/challenge end-event forwarding, before-unload guard, reset/replay presentation, and debug handle. Keep one `chooseColor(color)` adapter for clicks + keyboard. No GameInitializer/rAF.

- [ ] **3.5 Create phone-safe Astro route**

Use:

```astro
<GamePage
  gameId="chromatic-tide"
  title="Chromatic Tide"
  description="Shift your territory color and flood the whole board before time runs out"
  icon="🌈"
  showPause={false}
  showEnd={false}
  initialTime={90}
>
```

Board/control markup:

```astro
<div
  id="chromatic-tide-container"
  class="w-[min(560px,calc(100vw-2rem))] space-y-4"
>
  <div
    id="chromatic-tide-board"
    class="grid w-full aspect-square gap-1"
    role="grid"
    aria-label="Chromatic Tide board"
  ></div>

  <div
    id="chromatic-tide-colors"
    class="grid grid-cols-2 gap-2 sm:grid-cols-5"
    aria-label="Choose territory color"
  >
    <Button data-tide-color="teal" type="button">1 Teal</Button>
    <Button data-tide-color="amber" type="button">2 Amber</Button>
    <Button data-tide-color="magenta" type="button">3 Magenta</Button>
    <Button data-tide-color="ice" type="button">4 Ice</Button>
    <Button data-tide-color="green" type="button">5 Green</Button>
  </div>
</div>
```

Do **not** hide horizontal overflow. The layout must actually fit; Task 5 checks `scrollWidth`.

Copy palette hexes locally:

```text
teal    #1fe3c0
amber   #f2b33d
magenta #ff3d8a
ice     #6fe3ff
green   #5dff9f
```

Use page CSS for cell/button accents and captured border treatment. Keep numeric cell text and named buttons visible.

Add Moves/Captured HUD, How to Play/Scoring cards, final Outcome/Moves/Captured/Time. Bootstrap after `</GamePage>` with `window.chromaticTideGame` debug handle.

- [ ] **3.6 Explicitly extend both markup-test paths**

Append to the existing hardcoded array:

```ts
const games = [
    // existing games...
    'asteroid-drift',
    'chromatic-tide',
]
```

Also add dedicated assertions:

```ts
expect(chromaticTideMarkup).toContain('gameId="chromatic-tide"')
expect(chromaticTideMarkup).toContain('initialTime={90}')
expect(chromaticTideMarkup).toContain('showPause={false}')
expect(chromaticTideMarkup).toContain('showEnd={false}')
expect(chromaticTideMarkup).toContain('id="chromatic-tide-board"')
expect(chromaticTideMarkup).toContain('id="chromatic-tide-colors"')
expect(chromaticTideMarkup.match(/data-tide-color=/g)).toHaveLength(5)
expect(chromaticTideMarkup).toMatch(
    /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initChromaticTideGameFramework/
)
```

- [ ] **3.7 Run Task 3 tests + manual tuning/layout checkpoint**

```bash
bun run test:run -- \
  src/lib/games/chromatic-tide/ChromaticTideRenderer.test.ts \
  src/lib/games/chromatic-tide/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
bun run dev
```

Manual check: five representative boards, desktop + phone width; no board/control horizontal overflow; 90s and 28/24/18 move thresholds feel plausible; clear score dominates partial score; non-color encoding remains legible. Tune only numeric constants/thresholds if necessary.

- [ ] **3.8 Commit Task 3**

```bash
git add src/lib/games/chromatic-tide/ChromaticTideRenderer.ts \
  src/lib/games/chromatic-tide/ChromaticTideRenderer.test.ts \
  src/lib/games/chromatic-tide/initFramework.ts \
  src/lib/games/chromatic-tide/initFramework.test.ts \
  src/pages/chromatic-tide/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "feat(chromatic-tide): add playable DOM route"
```

---

## Task 4: Catalog, Mid-water identity, game data, and achievements

**Files:** `games.ts`, `games.test.ts`, `games/shared/types.ts`, `organisms.test.ts`, `achievements.ts`, `achievements.test.ts`, optional factual `CLAUDE.md` updates.

- [ ] **4.1 Write RED catalog/depth expectations**

```ts
expect(getGameById(GameID.CHROMATIC_TIDE)).toMatchObject({
    name: 'Chromatic Tide',
    category: 'strategy',
    estimatedDuration: '1-2 minutes',
    difficulty: 'medium',
    isActive: true,
    organism: { shape: 'frond', color: 'teal' },
    depth: 'mid',
})
```

Change depth counts to:

```ts
expect(getGamesByDepth('shallow')).toHaveLength(9)
expect(getGamesByDepth('mid')).toHaveLength(10)
expect(getGamesByDepth('abyssal')).toHaveLength(4)
```

Keep existing adjacency test unchanged.

- [ ] **4.2 Append active Mid-water catalog row**

```ts
{
    id: GameID.CHROMATIC_TIDE,
    name: 'Chromatic Tide',
    description:
        'Shift your territory color and flood the entire board before time runs out',
    category: 'strategy',
    maxPlayers: 1,
    estimatedDuration: '1-2 minutes',
    difficulty: 'medium',
    tags: ['strategy', 'colors', 'territory', 'single-player', 'flood'],
    isActive: true,
    organism: { shape: 'frond', color: 'teal' },
    depth: 'mid',
},
```

Mid-water is the product fit (“Focused sessions. A few minutes in.”), not a count-balancing choice. Gravity Flip already establishes a one-minute Mid-water game. Do not move old rows.

- [ ] **4.3 Add canonical game-data alias/union member**

```ts
export type ChromaticTideGameData =
    import('../chromatic-tide/types').ChromaticTideGameData
```

Add to `GameData` union only; canonical interface stays in game `types.ts`.

- [ ] **4.4 Add achievement boundary tests**

IDs:

```text
chromatic_tide_first_tide
chromatic_tide_current_reader
chromatic_tide_rapid_bloom
chromatic_tide_master_palette
```

Pin clear requirement plus boundaries at 24 moves, 30 seconds, and combined 18 moves/20 seconds. Uncleared payload earns none even with favorable numbers.

- [ ] **4.5 Add four typed achievements**

Use canonical `ChromaticTideGameData`:

- First Tide — `cleared`, Common.
- Current Reader — `cleared && movesUsed <= 24`, Rare.
- Rapid Bloom — `cleared && secondsRemaining >= 30`, Rare.
- Master Palette — `cleared && movesUsed <= 18 && secondsRemaining >= 20`, Epic.

Use tuned values from Task 3 if changed; keep spec/tests synchronized.

- [ ] **4.6 Run Task 4 gates and commit**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts \
  src/lib/games/chromatic-tide/*.test.ts \
  src/pages/game-board-markup.test.ts
bun run typecheck

git add src/lib/games.ts src/lib/games.test.ts \
  src/lib/games/shared/types.ts src/lib/organisms.test.ts \
  src/lib/achievements.ts src/lib/achievements.test.ts CLAUDE.md
git commit -m "feat(chromatic-tide): integrate catalog and achievements"
```

---

## Task 5: Browser proof, homepage navigation, and final gates

**Files:** modify only `e2e/games/play-coverage.spec.ts` plus HPA-633 files for defects found during verification. Do not modify `all-games-navigation.spec.ts`.

- [ ] **5.1 Import the unit-proven selector**

```ts
import {
    CHROMATIC_TIDE_PALETTE,
    type ChromaticTideState,
} from '../../src/lib/games/chromatic-tide/types'
import { selectGreedyChromaticTideColor } from '../../src/lib/games/chromatic-tide/board'
```

Do not define a second greedy implementation in Playwright.

- [ ] **5.2 Add real desktop clear/replay/keyboard path**

Start `/chromatic-tide`, read initial captured count, and use hard bound `64 - initialCaptured`:

```ts
for (let move = 0; move < maxMoves; move++) {
    const state = await readChromaticTideDebugState(page)
    if (state.outcome === 'cleared') break

    const color = selectGreedyChromaticTideColor(
        state.board,
        state.territoryColor
    )
    await page.locator(`[data-tide-color="${color}"]`).click()
}
```

Assert Cleared overlay and `64 / 64`, then Play Again, start, press one numbered key for a non-current color, assert Moves `1`.

Do not raise the bound on failure; Task 1 already proves strict progress for the rule.

- [ ] **5.3 Add mobile interaction + real overflow assertions**

At the suite's phone viewport, start, verify board visible/large enough, tap a non-current color, assert Moves `1` and new current button disabled/pressed.

Assert actual layout:

```ts
const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    controlsWidth:
        document.getElementById('chromatic-tide-colors')?.scrollWidth ?? 0,
    controlsClientWidth:
        document.getElementById('chromatic-tide-colors')?.clientWidth ?? 0,
}))
expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth)
expect(overflow.controlsWidth).toBeLessThanOrEqual(
    overflow.controlsClientWidth
)
```

If it fails, fix layout. Do not hide/clip overflow.

- [ ] **5.4 Run targeted browser proof**

```bash
bun run test:run -- src/lib/games/chromatic-tide/board.test.ts
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

- [ ] **5.5 Run full final gates, including the catalog path**

```bash
bun run test:run
bun run typecheck
bun run lint
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

The last spec derives `NAV_TARGETS` from active `GAMES` and clicks the actual homepage specimen card. It must remain source-unchanged.

- [ ] **5.6 Final manual acceptance**

Verify desktop + phone: Start → choices → clear/timeout → overlay → replay; current button state; keys ignored in editable fields; non-color encoding; no control overflow; monotonic score; timeout partial result; catalog shows Strategy / Mid-water and homepage specimen navigates correctly.

- [ ] **5.7 Commit final browser work**

```bash
git add e2e/games/play-coverage.spec.ts
git add src/lib/games/chromatic-tide src/pages/chromatic-tide \
  src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts \
  src/lib/organisms.test.ts src/lib/achievements.ts \
  src/lib/achievements.test.ts src/pages/game-board-markup.test.ts CLAUDE.md
git commit -m "test(chromatic-tide): prove browser gameplay"
```

Do not add `e2e/games/all-games-navigation.spec.ts` to the commit because it is only executed, not edited.

---

## Risks and Mitigations

### Greedy flood invariant regresses

A flood/recolor defect could otherwise surface only as a slow 64-click browser failure. Task 1 pins strict progress and bounded clear across several injected boards; Task 5 imports the exact same selector.

### Catalog registration breaks the real homepage path

Direct route play coverage does not prove the specimen card. Task 5 runs unchanged `all-games-navigation.spec.ts`, whose targets derive from active `GAMES` and click the actual homepage card.

### Five named controls overflow phones

The route uses two columns on phone widths and five on wider screens. Manual tuning plus Task 5 `scrollWidth` assertions fail real overflow; no clipping is allowed as a workaround.

---

## Self-review Checklist

- [ ] Board/rules/scoring/greedy proof are owned by Task 1.
- [ ] Model/lifecycle uses one `chooseColor()` and Task 2 explicitly overrides protected `getGameData()`.
- [ ] `getGameStats()` is presentation/reporting; `getGameData()` is save/achievement payload.
- [ ] Local `cloneBoard()` copies cell objects; shared `cloneGrid()` is not used.
- [ ] Markup Task 3 appends `'chromatic-tide'` to the hardcoded wrapper-sweep array.
- [ ] Five color controls have actual phone-fit layout and are not hidden by overflow clipping.
- [ ] Catalog is Strategy / Mid-water / frond+teal, with depth counts 9 / 10 / 4.
- [ ] Browser clear imports the Task 1 selector; no duplicate/optimal solver exists.
- [ ] Final gates run both play coverage and unchanged all-games navigation.
- [ ] No shared framework/backend/schema work entered scope.
- [ ] All design + implementation remains one HPA-633 PR.
