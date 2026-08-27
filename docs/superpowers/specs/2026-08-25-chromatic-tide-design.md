# Chromatic Tide Design

**Linear:** HPA-633 — Minigame: Chromatic Tide

**Status:** Planning contract for one HPA-633 PR.

## Goal

Add **Chromatic Tide**, a compact 90-second turn-based strategy game where the player grows one connected territory across a five-color board. Choosing a new color recolors the whole owned territory and absorbs every orthogonally connected target-color cell reachable from it. Clear the board before time expires; efficient clears score better.

The game intentionally adds a low-input strategy loop without physics, animation infrastructure, backend work, or a new framework. Existing Cetus BaseGame, timer, score submission, achievements, catalog, and progress machinery remain authoritative.

## Product contract

V1 is deliberately one ruleset:

- **12×12 board** (144 cells);
- **five named colors**: teal, amber, magenta, ice, green;
- territory anchored at the top-left cell;
- every accepted non-current color choice is one move;
- the current color action is a rejected/no-op move, but its button remains enabled and visibly `aria-pressed="true"` while playing;
- each accepted choice resolves the full orthogonal fixed-point flood before state emission;
- 90-second BaseGame countdown;
- clear all 144 cells to complete;
- timeout keeps legitimate partial progress;
- move efficiency and remaining time improve completed-run score;
- five visible mouse/touch controls plus keyboard `1`–`5` through the same `chooseColor()` API;
- visible board state does not rely on hue alone;
- screen-reader status follows the repository's existing polite live-region convention.

There is no difficulty selector, move-limit loss, campaign, Daily seed, production solver/hints, AI, persistence schema, API, auth, or database work.

## Why 12×12 instead of the original 8×8

The original planning numbers were not just untuned; they made the strategic layer nearly inert. A planning-side reproduction of the intended finite generator + greedy immediate-gain driver over deterministic seeded boards showed the 8×8 game clustering around roughly 11–15 greedy moves. Under the old `efficiencyReferenceMoves: 28`, `<=24`, and `<=18` thresholds, essentially every clear received the same efficiency reward and the Rare/Epic move achievements stopped discriminating.

Board size is the cheapest legitimate tuning knob because palette size is already a product/control contract: five colors map to five buttons, keys `1`–`5`, five labels, and five local CSS values.

A 12×12 board keeps the same mechanics and mobile-friendly control count while producing a healthier greedy baseline. The implementation must reproduce the baseline with the repository's `createSeededRng()` before treating these planning values as production authority.

For the fixed seed family `chromatic-tide-calibration:<index>`, a 512-board planning calibration produced approximately:

```text
p10 16 moves
p50 19 moves
p90 22 moves
<=17 moves: ~24%
<=15 moves: ~5%
```

Task 1 pins this deterministic baseline in unit coverage. If the TypeScript implementation materially disagrees, stop and reconcile board-generation/flood semantics or update this design deliberately; do not silently retune around a bug.

## Reuse decisions

Chromatic Tide follows existing seams without turning them into a framework.

- **BaseGame / GameTimer / score lifecycle:** reuse unchanged.
- **Mine Grid lifecycle shape:** event-driven BaseGame subclass, local initializer, DOM renderer, caught fire-and-forget `end()`, no game-local rAF.
- **GamePage:** use named slots exactly; there is no default slot.
- **Shared grid:** reuse `createGrid()` and `inBounds()` where useful.
- **Flood rule:** keep local to Chromatic Tide. Mine Grid's mine reveal and Circuit Hacker's wire connectivity are different rules.
- **Grid cloning:** keep a local `cloneBoard()` using row/cell map-spread. `shared/grid.ts` has both shallow `cloneGrid()` and JSON-based `deepCloneGrid()`; the local clone is intentionally cheaper and exactly deep enough for `{ color, captured }` cells.
- **RNG normalization:** copy the tiny clamp-not-retry semantics used by Asteroid Drift's private `unitSample()`. Do not refactor that private helper or add a shared numeric utility in this ticket.
- **Keyboard guard:** reuse `isEditableTarget()`.
- **Test-only greedy driver:** place it in `src/lib/games/chromatic-tide/test-fixtures.ts`, matching the existing Ice Slide test-fixture precedent. Production `board.ts` has no solver/heuristic export.
- **Screen-reader status:** reuse the existing `<p class="sr-only" aria-live="polite">` pattern used by recent games.
- **Catalog navigation:** run existing `all-games-navigation.spec.ts` unchanged; its targets derive from active `GAMES`.
- **Button attributes:** `Button.astro` already forwards native button attributes, so `data-tide-color`/`aria-pressed` need no component change.

Rejected:

- Pixi — no animation/physics need;
- shared flood/grid-game framework — one consumer and a small rule;
- extracting Asteroid Drift's private RNG helper — unnecessary cross-game refactor;
- JSON `deepCloneGrid()` in the hot flood path — broader/slower than the exact cell clone needed;
- production greedy/solver API — browser/calibration driving is test-only;
- move-limit generator/solver — score and achievements provide the efficiency incentive without generation search.

## Architecture

```text
Astro page / five buttons / keys 1-5
                  |
                  v
          initFramework.ts
          - DOM listeners
          - chooseColor() adapter
          - HUD / live status / overlay
          - cleanup
             |          |
             v          v
   ChromaticTideGame  ChromaticTideRenderer
      (BaseGame)         (DOMRenderer)
          |
          +----> board.ts    pure generation + flood
          +----> scoring.ts  pure score arithmetic

Tests / Playwright only
          |
          +----> test-fixtures.ts greedy immediate-gain driver
```

No game-local rAF, interval, worker, persistence layer, or network call is added.

## Frozen core rules

After Task 1 reproduces the deterministic calibration baseline, `types.ts` becomes the production authority for these constants:

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

The palette is intentionally frozen at five. Board size is also frozen for v1 once Task 1 calibration passes; no runtime difficulty setting is introduced.

## State and data contracts

```ts
export type ChromaticTideColor =
    (typeof CHROMATIC_TIDE_PALETTE)[number]

export type ChromaticTideOutcome = 'playing' | 'cleared' | 'timeout'

export interface ChromaticTideCell {
    color: ChromaticTideColor
    captured: boolean
}

export type ChromaticTideBoard = ChromaticTideCell[][]

export interface ChromaticTideState extends BaseGameState {
    outcome: ChromaticTideOutcome
    board: ChromaticTideBoard
    territoryColor: ChromaticTideColor
    movesUsed: number
    capturedCells: number
    initialCapturedCells: number
}

export interface ChromaticTideStats extends BaseGameStats {
    outcome: ChromaticTideOutcome
    movesUsed: number
    capturedCells: number
    initialCapturedCells: number
    secondsRemaining: number
}

export interface ChromaticTideGameData {
    cleared: boolean
    movesUsed: number
    capturedCells: number
    initialCapturedCells: number
    secondsRemaining: number
}
```

`ChromaticTideConfig extends BaseGameConfig` with injected `rng: () => number`. Frozen board and scoring constants stay on `CHROMATIC_TIDE_RULES` and are not part of the overridable config surface.

The only gameplay mutation API is:

```ts
chooseColor(color: ChromaticTideColor): boolean
```

It returns `true` only for an accepted non-current choice that counts as one move.

## Finite board generation

`board.ts` owns materialization. Generation performs exactly `rows * cols` RNG calls — **144 calls in v1** — with no rejection loop.

For each cell:

1. read one injected RNG sample;
2. normalize non-finite/out-of-range values into `[0, 1)` with the same clamp semantics as Asteroid Drift's private `unitSample()`;
3. map the sample to one of five palette entries;
4. create `{ color, captured: false }`.

After all cells are created, guard the degenerate already-solved case: if every cell equals the top-left color, recolor the bottom-right cell to the next palette color. This consumes no extra RNG.

Tests must cover both:

- the degenerate `rng = () => 0` repair case; and
- a normal varied deterministic input so ordinary generation is not left untested.

Then mark the initial top-left connected component. No quality retry, solver, seeded production service, or random rejection loop is added.

## Cloning and initial territory

Keep the exact local clone:

```ts
function cloneBoard(board: ChromaticTideBoard): ChromaticTideBoard {
    return board.map(row => row.map(cell => ({ ...cell })))
}
```

This is deliberate even though `deepCloneGrid()` exists: JSON round-tripping every flood is unnecessary for two-field plain cells, while shallow `cloneGrid()` would alias cell objects.

`markInitialTerritory(board)` clones, marks `(0, 0)`, and resolves the full orthogonally connected component matching the starting color. The returned initial territory count is stored as `initialCapturedCells`; those free starting cells do not generate score.

## Flood semantics

`floodChromaticTideBoard(board, targetColor)` is pure and returns a cloned next board:

1. recolor every captured cell to `targetColor`;
2. enqueue every captured position;
3. inspect only up/down/left/right neighbors;
4. capture and enqueue each uncaptured neighbor whose color matches `targetColor`;
5. continue until the queue drains.

Mark-on-enqueue prevents duplicate work. Traversal is bounded by 144 cells. Diagonals never capture directly.

## Greedy progress proof and calibration driver

The production module does **not** expose a solver.

`test-fixtures.ts` exports a test-only immediate-gain selector:

```ts
export function selectGreedyChromaticTideColor(
    board: ChromaticTideBoard,
    territoryColor: ChromaticTideColor
): ChromaticTideColor
```

It evaluates the four non-current colors through the production flood helper and returns the color with the largest immediate captured count, tie-breaking by palette order.

`board.test.ts` proves the load-bearing invariant on several injected boards:

- while an incomplete valid territory exists, at least one uncaptured orthogonal boundary cell exists;
- its color differs from the current territory color;
- selecting that boundary color captures at least one new cell;
- therefore the greedy selector strictly progresses and clears in at most the initially uncaptured-cell count.

The same test-only helper drives deterministic seeded calibration and Playwright. It is not optimal-move logic and has no production caller.

## Scoring

One pure scorer owns arithmetic.

Unfinished run:

```text
gainedCells = max(0, capturedCells - initialCapturedCells)
score = gainedCells * progressPointsPerCell
```

Cleared run:

```text
score = totalCells * progressPointsPerCell
      + completionBonus
      + max(0, efficiencyReferenceMoves - movesUsed)
          * efficiencyPointsPerMove
      + floor(secondsRemaining) * timePointsPerSecond
```

Normalization:

- finite non-negative integer counts;
- capture counts clamp to `0..144`;
- `initialCapturedCells <= capturedCells` after normalization;
- seconds clamp to `0..90`;
- completion uses the full 144-cell base for comparable clears despite different starting components;
- BaseGame generic time bonus is disabled;
- the model only applies positive score deltas through `addScore()`.

With a 12×12 board and `efficiencyReferenceMoves: 22`, typical greedy clears no longer receive a near-constant move bonus: the p50 baseline is around 19, p10 around 16, and p90 around 22. Human play may beat or trail greedy; Task 3 validates feel before achievements are registered.

## Model lifecycle and BaseGame data surfaces

`ChromaticTideGame` uses BaseGame's timer and lifecycle only.

- `createInitialState()` materializes a fresh board and records initial capture count.
- `update()` is a no-op.
- accepted `chooseColor()` floods, increments one move, updates territory/capture count, synchronizes score, emits once, then ends if cleared.
- `handleTimeUp()` sets timeout, synchronizes partial score, emits, then delegates to `super.handleTimeUp()`.
- reset uses the normal BaseGame initial-state path.
- model cleanup owns no external resource.

Use the existing two data surfaces correctly:

```ts
getGameStats(): ChromaticTideStats
protected override getGameData(): Record<string, unknown>
```

`getGameStats()` is reporting/overlay data. Protected `getGameData()` is the save/achievement hook used by `BaseGame.end()` and must return the canonical game-data fields. Both use `getTimerStatus()` so final seconds come from BaseGame's final timer snapshot. Do not add a third/public game-data API.

## Renderer and accessibility

The board is **presentational**, not an ARIA grid widget. Do not emit `role="grid"` or 144 `role="gridcell"` nodes.

`ChromaticTideRenderer` extends `DOMRenderer` and renders plain cell `<div>` elements with:

- `data-row` / `data-col`;
- `data-color`;
- `data-captured`;
- visible palette index `1`–`5`.

The numeric index is the visual non-hue encoding. Page CSS adds captured-border treatment.

The board container is marked `aria-hidden="true"` because its 144 visual cells are not interactive controls and do not form a usable nonvisual widget. Instead the page provides:

```astro
<p id="chromatic-tide-status" class="sr-only" aria-live="polite"></p>
```

The initializer updates it after accepted moves and lifecycle transitions, e.g.:

```text
Territory teal, 23 of 144 captured, 7 moves.
```

This matches the repository's existing live-region convention and avoids malformed/noisy ARIA grid semantics.

## Controls and initializer

The page renders five stable `Button.astro` controls with `data-tide-color` and visible labels such as `1 Teal`.

Both click/touch and keyboard `1`–`5` call one local adapter that invokes `game.chooseColor()`; number keys are ignored for editable targets via `isEditableTarget()`.

Control-state rule:

- idle / ended: all five disabled;
- active + playing: all five enabled;
- current territory color: `aria-pressed="true"` and selected styling;
- other colors: `aria-pressed="false"`.

The current button deliberately stays enabled so keyboard/assistive-technology users can reach the selected state. Activating it is a harmless model-level no-op because `chooseColor(currentColor)` returns `false` and does not increment moves.

Initializer responsibilities remain local:

- Start / Reset / Play Again;
- board render;
- Moves / Captured HUD;
- status live region;
- score/time callbacks;
- final overlay;
- achievement/challenge notification forwarding;
- before-unload active-run guard;
- idempotent cleanup;
- debug handle `window.chromaticTideGame`.

No rAF/ticker/interval is added.

## GamePage named slots and route layout

`GamePage.astro` has named slots and no default slot. The route must wire them explicitly:

```astro
<GamePage ...>
  <div slot="game-board" id="chromatic-tide-container">...</div>
  <Badge slot="additional-stats">...</Badge>
  <div slot="game-info">...</div>
  <div slot="final-stats">...</div>
</GamePage>
```

The board/control cluster lives in `slot="game-board"`; otherwise Astro content would be dropped at SSR.

Recommended board markup:

```astro
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
    <!-- five Button.astro controls -->
  </div>
</div>
```

The responsive two-column phone layout prevents named controls from overflowing; do not hide/clip overflow to mask a layout defect.

Page-local CSS copies the existing organism palette values without importing organism metadata or creating new global tokens:

```text
teal    #1fe3c0
amber   #f2b33d
magenta #ff3d8a
ice     #6fe3ff
green   #5dff9f
```

The bootstrap script remains at page root after `</GamePage>`.

## Markup contract

`src/pages/game-board-markup.test.ts` must do both:

1. append `'chromatic-tide'` to the existing hardcoded GamePage-wrapper sweep; and
2. add dedicated assertions pinning:
   - `slot="game-board"` on the Chromatic Tide container;
   - route GamePage ID/time/flags;
   - board/status/control IDs;
   - five `data-tide-color` controls;
   - bootstrap script after `</GamePage>`.

Source-string ID assertions alone are insufficient because unslotted markup can exist in source while rendering nothing.

## Catalog identity

Register:

```ts
GameID.CHROMATIC_TIDE = 'chromatic_tide'
```

Catalog row:

- name `Chromatic Tide`;
- category `strategy`;
- estimated duration `1-2 minutes`;
- difficulty `medium`;
- icon `🌈`;
- organism `{ shape: 'frond', color: 'teal' }`;
- depth `mid`.

Depth remains a product-fit choice: Mid-water's focused-session description fits a 90-second strategy run better than Abyssal's long-session description. Final counts are **9 shallow / 10 mid / 4 abyssal** and adjacency remains valid.

## Achievement calibration contract

Achievement *shapes* are fixed; thresholds are not all sourced the same way.

Move thresholds come from the deterministic 12×12 greedy baseline:

1. **First Tide** — clear a board. Common.
2. **Current Reader** — clear in `<= 17` moves. Rare. This is around the lower quartile of the deterministic greedy baseline.
3. **Rapid Bloom** — clear with `secondsRemaining >= 45`. Rare. Frozen after Task 3 human play: a 19-move greedy-length clear at about 2–3 seconds per decision finishes near 45 seconds remaining. Deliberate observation is slower; this threshold rewards fast, efficient play rather than a board-sim guess.
4. **Master Palette** — clear in `<= 15` moves. Epic. This is around the lower 5% of the deterministic greedy baseline.

Task 3's manual checkpoint played real desktop and phone boards. Move thresholds were not changed: human play did not contradict the seeded greedy baseline. Rapid Bloom is frozen at **45 remaining seconds** before Task 4 adds achievements.

Do not combine Master Palette with an arbitrary time threshold: keep the Epic condition focused on exceptional move efficiency, while Rapid Bloom owns speed.

## Browser coverage

`e2e/games/play-coverage.spec.ts` imports the test-only greedy selector from `test-fixtures.ts`.

Desktop path:

1. visit `/chromatic-tide` and Start;
2. read debug state;
3. choose the greedy test color;
4. click the real named button;
5. repeat with hard bound `144 - initialCapturedCells`;
6. assert cleared overlay / `144 / 144`;
7. Play Again, Start, and prove one numbered keyboard choice increments moves.

The greedy strict-progress proof belongs to unit tests, so a browser failure is treated as integration/model drift rather than fixed by raising the loop bound.

Mobile path:

- phone viewport;
- board remains visible and sufficiently large;
- five controls fit with no horizontal overflow;
- current button is reachable and `aria-pressed="true"`, not disabled;
- tap a non-current button and assert Moves becomes `1`;
- live-region text updates to the new territory/captured/move summary.

After catalog registration also run, unchanged:

```bash
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

## Risks and mitigations

### Difficulty / threshold calibration is wrong

**Risk:** The game technically works but move scoring/achievements are trivial or impossible.

**Mitigation:** Task 1 reproduces a deterministic 12×12 seeded greedy distribution before freezing production constants. Move thresholds are tied to that baseline. Human-time achievement threshold is deferred to Task 3 real play instead of guessed from board simulation.

### Named-slot wiring drops the board

**Risk:** GamePage has no default slot, so unslotted board markup silently disappears while source-string ID tests still pass.

**Mitigation:** Route contract explicitly uses `slot="game-board"`; dedicated markup test pins that exact attribute in addition to the generic wrapper sweep.

### Greedy flood invariant regresses

**Risk:** Browser clear stalls and hides a board/flood defect behind a long loop.

**Mitigation:** Several unit fixtures prove strict progress/bounded clear; Playwright reuses the same test-only selector.

### Catalog registration breaks homepage navigation

**Risk:** Direct route coverage passes while the real specimen card is broken.

**Mitigation:** run unchanged `all-games-navigation.spec.ts`, derived from active `GAMES`.

### Five named controls overflow phones

**Risk:** controls are unusable on narrow screens.

**Mitigation:** responsive 2-column phone / 5-column wider layout, manual check, and real `scrollWidth` browser assertions. No overflow clipping workaround.

### Presentational board becomes noisy/malformed for assistive technology

**Risk:** hundreds of fake gridcells or verbose labels create unusable semantics.

**Mitigation:** board stays presentational/`aria-hidden`; one polite live status region communicates territory/capture/move changes, while the five actual controls remain reachable and named.

## Testing contract

Unit coverage includes:

- normal finite 144-sample generation;
- all-one-color deterministic repair without extra RNG;
- non-finite/out-of-range sample normalization;
- initial orthogonal component;
- diagonal non-capture;
- fixed-point flood;
- source-board immutability and exact local clone behavior;
- greedy strict-progress fixtures;
- deterministic 12×12 calibration baseline;
- score normalization/completion arithmetic;
- current-color no-op and zero-gain non-current move;
- completion/timeout/reset lifecycle;
- public stats and protected game-data payload;
- renderer data attributes/visible palette index without ARIA-grid roles;
- initializer live region, enabled pressed current control, keyboard/click parity, cleanup/replay;
- markup named-slot membership + wrapper sweep;
- catalog/depth/adjacency;
- canonical game data + achievements.

Final gates:

```bash
bun run test:run
bun run typecheck
bun run lint
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

## Non-goals

HPA-633 does not add:

- difficulty presets;
- hard move cap;
- production optimal solver/hints;
- seeded/Daily competition;
- campaign;
- rAF/Pixi animation machinery;
- audio/multiplayer;
- persistence/API/DB/auth changes;
- generic flood/grid/input/control framework;
- BaseGame/GameTimer/GamePage/DOMRenderer refactors.

## Acceptance criteria

HPA-633 is complete when:

- the 12×12 / five-color / 90-second ruleset can start, play, clear, timeout, reset, and replay;
- board generation consumes exactly 144 samples and never retries;
- flood semantics are pure, orthogonal, fixed-point, and bounded;
- deterministic calibration demonstrates a meaningful move spread and the registered move thresholds match it;
- current color is a model no-op but remains a reachable pressed control while playing;
- partial/completion scoring follows the pure formula and remains monotonic;
- visible board uses 1–5 non-hue encoding and screen-reader updates use the polite status region rather than fake grid semantics;
- GamePage content uses required named slots, with `slot="game-board"` pinned by tests;
- protected `getGameData()` supplies achievement/save data and public `getGameStats()` supplies reporting;
- catalog is Strategy / Mid-water / frond+teal with 9 / 10 / 4 depth counts;
- desktop/mobile play coverage and unchanged homepage navigation coverage pass;
- no shared framework or backend/schema scope is introduced;
- design + implementation ship in the same HPA-633 PR.