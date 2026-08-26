# Chromatic Tide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`; implement test-first and verify each task before continuing.

**Goal:** Ship HPA-633 as a 90-second **12×12**, five-color flood-fill strategy minigame with finite generation, fixed-point orthogonal territory expansion, calibrated move scoring/achievements, keyboard/touch controls, DOM rendering, and existing Cetus score/progress integration.

**Architecture:** `ChromaticTideGame` extends `BaseGame` and owns event-driven state/lifecycle only. `board.ts` owns production generation/flood rules. `scoring.ts` owns arithmetic. `test-fixtures.ts` owns the greedy immediate-gain driver used by calibration/unit tests and Playwright, so production code does not expose a solver. `ChromaticTideRenderer` renders presentational cells; one initializer owns stable controls, live status, HUD/overlay updates, and cleanup. No shared flood/control framework is added.

**Tech stack:** Astro, TypeScript, BaseGame/GameTimer/ScoreManager, DOMRenderer, Tailwind 4, Vitest, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-08-25-chromatic-tide-design.md`

## Global constraints

- One HPA-633 PR from planning through implementation.
- One v1 ruleset: 12×12, five colors, 90 seconds. No runtime difficulty selector.
- Palette remains exactly five colors and keys/buttons remain `1`–`5`.
- Board generation consumes exactly `12 * 12 = 144` RNG samples and never retries.
- All-one-color already-cleared board gets one deterministic bottom-right repair with no extra RNG.
- Keep production flood/capture semantics local to Chromatic Tide.
- Reuse `createGrid()` / `inBounds()` where useful.
- Keep `cloneBoard()` local with row/cell map-spread. `deepCloneGrid()` exists but JSON round-trip is intentionally not used in the flood path; shallow `cloneGrid()` would alias cells.
- Copy Asteroid Drift's tiny clamp-not-retry RNG normalization semantics locally; do not refactor its private `unitSample()` or add a shared helper in this ticket.
- Keep the greedy immediate-gain driver in `test-fixtures.ts`; production `board.ts` must have no solver/heuristic export.
- Use `isEditableTarget()` for keyboard filtering.
- Current color remains an enabled, reachable `aria-pressed="true"` button while playing; the model rejects it as a no-op.
- Board is presentational, not an ARIA grid. No `role="grid"` / `role="gridcell"` machinery.
- Add one `#chromatic-tide-status.sr-only[aria-live="polite"]` region updated by the initializer.
- Use GamePage **named slots**; `slot="game-board"` is mandatory.
- Catalog identity: `chromatic_tide`, `🌈`, Strategy, Mid-water, `{ shape: 'frond', color: 'teal' }`; depth counts 9 / 10 / 4.
- Add `GameID` before the active `GAMES` row; do not register a homepage card before the route exists.
- Do not edit `e2e/games/all-games-navigation.spec.ts`; run it after registration.
- No changes to BaseGame, GameTimer, ScoreManager, GamePage, DOMRenderer, Button, API/DB/auth/schema/packages, or unrelated games.
- No move cap, production solver/hints, Daily/campaign, AI, Pixi, rAF, worker, or extra timer.

---

## File map

### New production files

- `src/lib/games/chromatic-tide/types.ts`
- `src/lib/games/chromatic-tide/board.ts`
- `src/lib/games/chromatic-tide/scoring.ts`
- `src/lib/games/chromatic-tide/ChromaticTideGame.ts`
- `src/lib/games/chromatic-tide/ChromaticTideRenderer.ts`
- `src/lib/games/chromatic-tide/initFramework.ts`
- `src/pages/chromatic-tide/index.astro`

### New test/support files

- `src/lib/games/chromatic-tide/test-fixtures.ts` — **test-only** greedy driver
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
- `CLAUDE.md` only if an existing factual game/debug list becomes stale

---

# Task 1 — Rules, finite board, greedy calibration, and scoring

**Files:** create `types.ts`, `board.ts`, `test-fixtures.ts`, `board.test.ts`, `scoring.ts`, `scoring.test.ts`.

**Outcome:** production board/scoring rules exist; deterministic move calibration is proven before the rest of the game relies on thresholds.

## 1.1 Write RED board-generation tests

Start with both ordinary and degenerate generation. Do not make `rng = () => 0` the only materialization test.

Required cases:

- exactly 144 RNG calls on normal varied input;
- normal input maps samples to expected palette values and produces a non-empty top-left territory;
- `rng = () => 0` consumes exactly 144 calls, repairs only bottom-right to the next color, and therefore does not begin cleared;
- `NaN`, negative, `1`, and `>1` samples normalize into a valid palette index without retrying;
- initial capture includes the full orthogonal top-left component;
- diagonal same-color cells do not directly connect;
- helpers do not mutate source rows/cell objects.

Example fixture helper:

```ts
function cell(color: ChromaticTideColor, captured = false) {
    return { color, captured }
}
```

Run RED:

```bash
bun run test:run -- src/lib/games/chromatic-tide/board.test.ts
```

## 1.2 Implement canonical types/config

After calibration expectations below are understood, create:

```ts
export const CHROMATIC_TIDE_RULES = {
    duration: 90,
    rows: 12,
    cols: 12,
    progressPointsPerCell: 10,
    completionBonus: 500,
    efficiencyReferenceMoves: 22,
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

Add `ChromaticTideColor`, outcome, cell/board/state/stats/game-data/config types and `createChromaticTideConfig()` with `achievementIntegration: true`, `pausable: false`, `resettable: true`, `rng: Math.random`.

Do not add difficulty or palette registries.

## 1.3 Implement finite production board helpers

Use existing structural helpers only where they reduce code:

```ts
import { createGrid, inBounds } from '@/lib/games/shared/grid'
```

Local RNG sample normalization deliberately mirrors Asteroid Drift's private clamp semantics:

```ts
function normalizeUnitSample(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.min(1 - Number.EPSILON, Math.max(0, value))
}
```

Do not extract/re-export Asteroid Drift's `unitSample()` in this ticket.

Keep exact local clone:

```ts
function cloneBoard(board: ChromaticTideBoard): ChromaticTideBoard {
    return board.map(row => row.map(cell => ({ ...cell })))
}
```

Comment why `deepCloneGrid()` is not used: JSON round-trip is unnecessary in the flood hot path; `cloneGrid()` is too shallow.

Implement:

- `createChromaticTideBoard()`
- `markInitialTerritory()`
- `floodChromaticTideBoard()`
- `countCapturedCells()`

Flood uses only four orthogonal deltas, mark-on-enqueue, and returns after queue exhaustion.

## 1.4 Write RED strict-progress tests for the test driver

Create `test-fixtures.ts`, not a production selector API.

```ts
export function selectGreedyChromaticTideColor(
    board: ChromaticTideBoard,
    territoryColor: ChromaticTideColor
): ChromaticTideColor
```

It evaluates each non-current color using production `floodChromaticTideBoard()` + `countCapturedCells()` and chooses largest immediate gain, tie-breaking by palette order.

In `board.test.ts`, use several deterministic injected boards to prove:

- selector never returns current color;
- while incomplete, selected color strictly increases captured count;
- irregular boundaries work;
- zero-gain alternatives do not defeat the selector;
- repeatedly applying the selector clears within `initialUncapturedCells` moves.

This test is the unit owner of the browser loop's progress argument.

## 1.5 Add deterministic 12×12 calibration coverage

Use existing shared seeded RNG in the **test only**:

```ts
import { createSeededRng } from '@/lib/games/shared/seeded-rng'
```

Materialize 512 boards with seed keys:

```text
chromatic-tide-calibration:0
...
chromatic-tide-calibration:511
```

For each board, repeatedly apply `selectGreedyChromaticTideColor()` until clear and collect move counts.

Pin the baseline produced by the intended rules:

```text
p10 = 16
p50 = 19
p90 = 22
<=17 moves ≈ lower quartile
<=15 moves ≈ lower 5%
```

Prefer exact deterministic percentile assertions plus broad percentage sanity bands (for example, `<=17` roughly 20–30%, `<=15` roughly 3–7%) rather than logging only.

If production TypeScript output materially disagrees with this planning baseline, investigate generator/flood parity before changing constants. Do not tune around a defect.

This calibration is why v1 is 12×12 and why `efficiencyReferenceMoves = 22`, `Current Reader <=17`, `Master Palette <=15`.

## 1.6 Write RED scoring tests

Cover:

- unfinished score = only cells gained beyond initial territory;
- clear score = full 144-cell base + completion + non-negative move bonus + floored remaining-time bonus;
- non-finite/negative normalization;
- capture clamps to total;
- initial capture clamps to captured;
- excess moves produce zero efficiency bonus;
- seconds clamp `0..90`;
- unfinished score is independent of time/moves.

## 1.7 Implement pure scorer and run Task 1 gates

No shared numeric helper for one scorer.

```bash
bun run test:run -- \
  src/lib/games/chromatic-tide/board.test.ts \
  src/lib/games/chromatic-tide/scoring.test.ts
```

Expected: PASS, including deterministic calibration.

## 1.8 Commit Task 1

```bash
git add src/lib/games/chromatic-tide/{types.ts,board.ts,test-fixtures.ts,board.test.ts,scoring.ts,scoring.test.ts}
git commit -m "feat(chromatic-tide): add calibrated board rules"
```

---

# Task 2 — Stable identity and BaseGame model

**Files:** modify `src/lib/games.ts`, `src/lib/games.test.ts`; create `ChromaticTideGame.ts`, `ChromaticTideGame.test.ts`.

## 2.1 Add stable ID/icon only

Add:

```ts
CHROMATIC_TIDE = 'chromatic_tide'
```

and exhaustive icon:

```ts
[GameID.CHROMATIC_TIDE]: '🌈'
```

Focused tests pin:

```ts
expect(GameID.CHROMATIC_TIDE).toBe('chromatic_tide')
expect(getGameIcon(GameID.CHROMATIC_TIDE)).toBe('🌈')
expect(getGameUrl(GameID.CHROMATIC_TIDE)).toBe('/chromatic-tide')
```

Do **not** add active `GAMES` row yet. Do not touch server/DB types; `GameType = GameID` already follows the enum.

## 2.2 Write RED model/lifecycle tests

Use injected RNG only; no production board-injection seam.

A one-move clear fixture now uses **143 teal samples + one amber sample**.

Cover:

- initial territory count and score 0;
- current-color action returns false, no move, no score change;
- different absent color is accepted and can gain zero cells while incrementing one move;
- final amber choice on 143+1 board clears exactly once;
- actions after clear rejected;
- reset consumes a fresh board and restores idle/moves/score/outcome;
- timeout keeps partial score and delegates to BaseGame end path;
- public stats include reporting fields;
- protected game-data hook returns non-empty canonical achievement payload.

Test-only subclass:

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

## 2.3 Implement model minimally

Constructor:

```ts
super(GameID.CHROMATIC_TIDE, config, callbacks, {
    basePoints: 0,
    timeBonus: false,
})
```

`chooseColor()` rejects inactive/paused/game-over/non-playing/runtime-invalid/current color. Accepted flow:

1. flood;
2. increment moves once;
3. replace board;
4. update territory/captured count;
5. classify clear if 144 captured;
6. synchronize canonical score using live BaseGame timer;
7. emit once;
8. if clear, caught fire-and-forget `end()`.

Use one positive-delta `synchronizeScore()`; never independently decrement score.

`update`, `render`, `cleanup` are no-ops.

`handleTimeUp()` sets timeout → sync partial score → emit → `super.handleTimeUp()`.

## 2.4 Implement the two BaseGame data surfaces

```ts
getGameStats(): ChromaticTideStats
protected override getGameData(): Record<string, unknown>
```

Both use `getTimerStatus()`; stats own overlay/reporting, protected data owns save/achievement payload. Do not add a public `getGameData` wrapper in production.

## 2.5 Run and commit Task 2

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/games/chromatic-tide/board.test.ts \
  src/lib/games/chromatic-tide/scoring.test.ts \
  src/lib/games/chromatic-tide/ChromaticTideGame.test.ts

git add src/lib/games.ts src/lib/games.test.ts \
  src/lib/games/chromatic-tide/ChromaticTideGame.ts \
  src/lib/games/chromatic-tide/ChromaticTideGame.test.ts
git commit -m "feat(chromatic-tide): add game model"
```

---

# Task 3 — DOM renderer, live status, controls, named-slot route

**Files:** create renderer/init/page and tests; modify `src/pages/game-board-markup.test.ts`.

## 3.1 Write RED renderer tests

Render a small typed board into `#chromatic-tide-board`.

Assert:

- one plain cell node per board cell;
- `data-row`, `data-col`, `data-color`, `data-captured`;
- visible palette index `1`–`5`;
- **no** `role="gridcell"` or per-cell verbose aria label;
- rerender replaces children and reflects state;
- cleanup empties board.

## 3.2 Implement presentational renderer

Extend `DOMRenderer`; no board event listeners.

Each cell is a plain `div` with data attributes and visible palette number. Board element is presentational/`aria-hidden` in Astro markup, not an ARIA grid.

## 3.3 Write RED initializer interaction/accessibility tests

Minimal DOM includes five stable buttons and:

```html
<p id="chromatic-tide-status" class="sr-only" aria-live="polite"></p>
```

Cover:

- idle: all five color buttons disabled;
- Start: all five enabled;
- current button has `aria-pressed="true"` **and remains enabled**;
- activating current button is harmless/no move because model returns false;
- clicking a different color increments one move;
- keyboard `1`–`5` uses same action path;
- editable targets ignore number keys;
- after a move, new current button is pressed/reachable and status text reports territory/captured/moves;
- reset/play-again restores idle UI and fresh board;
- end populates final stats/overlay and status;
- cleanup is idempotent and later DOM events do not mutate destroyed game.

Delete the old expectation that current color is disabled while active.

## 3.4 Implement initializer

Keep Mine Grid's local lifecycle shape and listener tracking.

One `syncColorControls(state)` rule:

```text
if active + playing:
  disabled = false for all five
  aria-pressed = color === territoryColor
else:
  disabled = true for all five
```

One `announceState(state)` writes a concise live-region summary such as:

```text
Territory teal, 23 of 144 captured, 7 moves.
```

Both button clicks and number keys call one `chooseColor(color)` adapter. Keep achievement/challenge notification forwarding, beforeunload, reset/replay, and debug handle local. No GameInitializer/rAF.

## 3.5 Create the route with required named slots

This is load-bearing: GamePage has no default slot.

Skeleton:

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
  <div
    slot="game-board"
    id="chromatic-tide-container"
    class="w-[min(560px,calc(100vw-2rem))] space-y-4"
  >
    <div
      id="chromatic-tide-board"
      class="grid w-full aspect-square gap-px sm:gap-1"
      aria-hidden="true"
    ></div>
    <p id="chromatic-tide-status" class="sr-only" aria-live="polite"></p>

    <div
      id="chromatic-tide-colors"
      class="grid grid-cols-2 gap-2 sm:grid-cols-5"
      role="group"
      aria-label="Choose territory color"
    >
      <Button data-tide-color="teal" type="button" aria-pressed="false">1 Teal</Button>
      <Button data-tide-color="amber" type="button" aria-pressed="false">2 Amber</Button>
      <Button data-tide-color="magenta" type="button" aria-pressed="false">3 Magenta</Button>
      <Button data-tide-color="ice" type="button" aria-pressed="false">4 Ice</Button>
      <Button data-tide-color="green" type="button" aria-pressed="false">5 Green</Button>
    </div>
  </div>

  <Badge slot="additional-stats">...</Badge>
  <Badge slot="additional-stats">...</Badge>
  <div slot="game-info">...</div>
  <div slot="final-stats">...</div>
</GamePage>
```

Do not put board content in the default slot; it will not render.

Do not hide overflow. 12×12 cells can use smaller phone gap/text, but the five named controls use two columns on phone and five on wider screens.

Copy existing organism palette hex values page-locally:

```text
teal    #1fe3c0
amber   #f2b33d
magenta #ff3d8a
ice     #6fe3ff
green   #5dff9f
```

Bootstrap script remains after `</GamePage>`.

## 3.6 Extend both page-markup verification paths

First append to the existing hardcoded wrapper list:

```ts
'chromatic-tide',
```

Then dedicated assertions must include the load-bearing slot:

```ts
expect(chromaticTideMarkup).toContain('slot="game-board"')
expect(chromaticTideMarkup).toContain('gameId="chromatic-tide"')
expect(chromaticTideMarkup).toContain('initialTime={90}')
expect(chromaticTideMarkup).toContain('showPause={false}')
expect(chromaticTideMarkup).toContain('showEnd={false}')
expect(chromaticTideMarkup).toContain('id="chromatic-tide-board"')
expect(chromaticTideMarkup).toContain('id="chromatic-tide-status"')
expect(chromaticTideMarkup).toContain('aria-live="polite"')
expect(chromaticTideMarkup.match(/data-tide-color=/g)).toHaveLength(5)
expect(chromaticTideMarkup).toMatch(
  /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initChromaticTideGameFramework/
)
```

Pin that the board markup does not add `role="grid"`.

## 3.7 Human-play tuning checkpoint — validate, do not invent move thresholds

Run dev and play at least five 12×12 boards across desktop and phone width.

Record per clear:

- moves;
- elapsed/remaining time;
- obvious control/layout issues.

Validate:

- deterministic move calibration (`reference 22`, Rare 17, Epic 15) is plausible for humans;
- 90 seconds is neither trivial nor oppressive;
- a meaningful **Rapid Bloom** remaining-time threshold can be chosen from actual human play;
- clear score remains low-thousands and materially above timeout partial score;
- 12×12 numbers remain legible enough at phone width;
- five named controls do not overflow;
- pressed current-color state is visually clear while the button remains reachable;
- status live region text is concise and updates only on meaningful lifecycle/player actions.

Do **not** mechanically set Rapid Bloom to 70 seconds from board simulation. Board-only calibration cannot measure human decision time.

Before Task 4, freeze the chosen Rapid Bloom seconds threshold in the design spec/tests. If human move counts materially contradict the seeded greedy baseline, update Task 1 calibration rationale and thresholds deliberately; do not add difficulty/solver machinery.

## 3.8 Run and commit Task 3

```bash
bun run test:run -- \
  src/lib/games/chromatic-tide/ChromaticTideRenderer.test.ts \
  src/lib/games/chromatic-tide/initFramework.test.ts \
  src/pages/game-board-markup.test.ts

git add src/lib/games/chromatic-tide/ChromaticTideRenderer.ts \
  src/lib/games/chromatic-tide/ChromaticTideRenderer.test.ts \
  src/lib/games/chromatic-tide/initFramework.ts \
  src/lib/games/chromatic-tide/initFramework.test.ts \
  src/pages/chromatic-tide/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "feat(chromatic-tide): add playable DOM route"
```

---

# Task 4 — Catalog, canonical game data, and calibrated achievements

**Files:** `games.ts`, `games.test.ts`, `games/shared/types.ts`, `organisms.test.ts`, `achievements.ts`, `achievements.test.ts`, optional factual `CLAUDE.md` updates.

## 4.1 Write RED catalog/depth expectations

Pin full row:

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

Depth counts:

```ts
9 shallow / 10 mid / 4 abyssal
```

Keep adjacency invariant unchanged.

## 4.2 Append active catalog row

Only now, after route/model exist, append active `GAMES` row with Mid-water / frond / teal. Do not reorder old games for count symmetry.

## 4.3 Add canonical game-data alias/union member

In shared types:

```ts
export type ChromaticTideGameData =
    import('../chromatic-tide/types').ChromaticTideGameData
```

Add it to `GameData`; canonical interface remains in game `types.ts`.

## 4.4 Write achievement boundary tests

Achievement IDs:

```text
chromatic_tide_first_tide
chromatic_tide_current_reader
chromatic_tide_rapid_bloom
chromatic_tide_master_palette
```

Pin:

- First Tide requires clear;
- Current Reader: clear and `movesUsed <= 17`, with 17/18 boundary;
- Master Palette: clear and `movesUsed <= 15`, with 15/16 boundary;
- Rapid Bloom: clear and `secondsRemaining >= 45`, with 44/45 boundary;
- uncleared/timeout payload earns no clear-only achievement regardless of favorable numbers.

## 4.5 Add four typed achievements

Use canonical `ChromaticTideGameData`.

- **First Tide** — clear. Common.
- **Current Reader** — `cleared && movesUsed <= 17`. Rare.
- **Rapid Bloom** — `cleared && secondsRemaining >= 45`. Rare.
- **Master Palette** — `cleared && movesUsed <= 15`. Epic.

Do not add an arbitrary second time requirement to Master Palette; Rapid Bloom owns speed and Master Palette owns exceptional move efficiency.

## 4.6 Run integration gates and commit

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

# Task 5 — Real browser proof, homepage navigation, final gates

**Files:** modify `e2e/games/play-coverage.spec.ts`; only HPA-633 files for defects found. `all-games-navigation.spec.ts` is run, not edited.

## 5.1 Import the test-only greedy driver

```ts
import { selectGreedyChromaticTideColor } from '../../src/lib/games/chromatic-tide/test-fixtures'
```

Import state/palette types as needed. Do not duplicate the greedy implementation in Playwright and do not move it into production `board.ts`.

## 5.2 Add desktop clear/replay/keyboard path

Start real route, read debug state, remember `initialCapturedCells`, and hard-bound loop to:

```text
144 - initialCapturedCells
```

Each iteration:

1. stop if cleared;
2. select color through test-fixture greedy driver;
3. click the real `[data-tide-color="..."]` button.

Assert:

- completion overlay visible;
- final outcome Cleared;
- final captured `144 / 144`;
- Play Again returns idle/fresh board;
- Start again and one non-current numbered key increments Moves to `1`.

Do not raise loop bound on failure; unit tests own strict progress.

## 5.3 Add mobile interaction/accessibility/layout proof

At established phone viewport:

- start game;
- board is visible and sufficiently large;
- `#chromatic-tide-status` exists with `aria-live="polite"`;
- current color button is enabled and `aria-pressed="true"`;
- tap a different real color;
- Moves becomes `1`;
- new current button is enabled + pressed;
- status text contains territory name, captured `... of 144`, and `1 move`/`1 moves` according to implementation copy;
- document/control cluster has no horizontal overflow.

Real overflow assertion:

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

If it fails, fix layout. Do not hide overflow.

## 5.4 Run targeted browser proof

```bash
bun run test:run -- src/lib/games/chromatic-tide/board.test.ts
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

## 5.5 Run full final gates including real catalog path

```bash
bun run test:run
bun run typecheck
bun run lint
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

`all-games-navigation.spec.ts` derives targets from active `GAMES` and clicks the actual homepage specimen. Keep it source-unchanged.

## 5.6 Final manual acceptance

Desktop + phone:

- Start → choices → clear/timeout → overlay → replay;
- current color stays reachable, selected, and no-op when activated;
- keys `1`–`5` work and ignore editable targets;
- 12×12 board remains legible enough without hue-only interpretation;
- polite live status is concise and useful;
- no control/board overflow;
- score never decreases;
- timeout retains partial progress and is not presented as clear;
- catalog shows Strategy / Mid-water and specimen navigation works.

## 5.7 Commit final browser work

```bash
git add e2e/games/play-coverage.spec.ts
git add src/lib/games/chromatic-tide src/pages/chromatic-tide \
  src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts \
  src/lib/organisms.test.ts src/lib/achievements.ts \
  src/lib/achievements.test.ts src/pages/game-board-markup.test.ts CLAUDE.md
git commit -m "test(chromatic-tide): prove browser gameplay"
```

Do not add `e2e/games/all-games-navigation.spec.ts` because it is only executed.

---

# Risks and mitigations

## Difficulty / threshold calibration

The original 8×8 constants made nearly every clear satisfy every move achievement. Task 1 makes calibration a deterministic test owner, switches v1 to 12×12, and ties move thresholds to the measured seeded baseline. Task 3 validates human feel before achievement registration.

## Named-slot wiring

GamePage has no default slot. Task 3 explicitly uses and tests `slot="game-board"`; source IDs alone are not accepted as proof.

## Greedy-progress drift

Several unit fixtures prove strict progress and bounded clear. Browser imports the same test-only driver rather than duplicating logic.

## Homepage registration path

Direct play coverage is insufficient. Final gates run unchanged derived homepage navigation after the active catalog row exists.

## Phone controls

Five named buttons use a real responsive layout and browser `scrollWidth` checks. Overflow clipping is forbidden as a workaround.

## Accessibility semantics

The 12×12 board remains presentational/hidden from the accessibility tree; it does not fake an ARIA table. One polite live region communicates territory/capture/move updates and all actual color controls remain reachable.

---

# Self-review checklist

- [ ] V1 is 12×12 / five colors / 90s; no difficulty framework.
- [ ] Task 1 reproduces deterministic calibration before production constants are treated as frozen.
- [ ] `efficiencyReferenceMoves = 22`, Rare move threshold `17`, Epic move threshold `15` are tied to calibration rather than guesswork.
- [x] Rapid Bloom seconds threshold is 45 remaining seconds, frozen from Task 3 human play rather than board simulation.
- [ ] Production `board.ts` has no greedy/solver API; test driver lives in `test-fixtures.ts`.
- [ ] Normal generation and degenerate all-one repair both have tests.
- [ ] Local clone choice explicitly acknowledges `deepCloneGrid()` and rejects JSON round-trip for this hot path.
- [ ] RNG normalizer explicitly mirrors private Asteroid Drift semantics without a shared refactor.
- [ ] Current color is enabled + pressed while active; model-level no-op prevents move counting.
- [ ] Board has no grid/gridcell ARIA roles; status uses repository live-region convention.
- [ ] Route uses named slots and dedicated test pins `slot="game-board"`.
- [ ] Markup wrapper sweep explicitly includes `'chromatic-tide'`.
- [ ] Catalog is Strategy / Mid-water / frond+teal with 9 / 10 / 4 counts.
- [ ] Final gates run both play coverage and unchanged all-games navigation.
- [ ] No shared framework/backend/schema/refactor entered scope.
- [ ] Entire design + implementation remains one HPA-633 PR.