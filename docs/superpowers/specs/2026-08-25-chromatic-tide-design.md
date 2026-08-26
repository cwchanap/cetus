# Chromatic Tide Design

**Linear:** HPA-633 — Minigame: Chromatic Tide

**Status:** Planning contract for one HPA-633 PR.

## Goal

Add a compact **90-second turn-based strategy game** where the player grows one connected territory across an 8×8 five-color board. The player chooses a new color, the whole owned territory changes to that color, and every orthogonally connected cell of that color is absorbed. Clear the board before time expires; fewer moves and faster clears score better.

Chromatic Tide intentionally fills a catalog gap rather than adding another recent action/timing game. Cetus already has many puzzle/action games but only one registered `strategy` game. This adds a low-input, decision-heavy loop that works equally well with mouse, keyboard, and touch.

The existing Cetus BaseGame, timer, score submission, achievement, stale-run, catalog, and progress machinery remains authoritative.

## Product contract

HPA-633 requires:

- one 8×8 board with five named colors;
- territory anchored at the top-left cell;
- one color choice per move;
- fixed-point orthogonal flood expansion after every accepted choice;
- the current territory color cannot be selected again;
- a 90-second countdown and immediate successful completion when all 64 cells are owned;
- partial progress score on timeout;
- move-efficiency and remaining-time bonuses only for completed boards;
- five visible mouse/touch controls plus keyboard keys `1`–`5` through the same game API;
- visible/accessibility cues that do not require color perception alone;
- normal catalog, achievements, score/progress, replay, homepage navigation, and mobile integration.

V1 has one ruleset. There is no difficulty selector, move-limit loss, campaign, daily seed, solver, hint system, AI opponent, persistence schema, API, auth, or database work.

## Why no move-limit failure

A strict move cap creates a second product problem: every random board would need either a solver-backed solvability/optimality guarantee or a constructive generator with a proven bound. That is unnecessary machinery for this hobby-project slice.

Instead:

- every run is bounded by the existing 90-second timer;
- every accepted choice counts as a move;
- clearing in fewer moves improves score and achievements;
- timeout keeps legitimate partial progress;
- board generation stays finite and simple.

This preserves the strategic incentive without coupling v1 to an optimizer.

## Repository reuse

Chromatic Tide follows existing seams without turning them into a framework.

- **Mine Grid model shape:** event-driven `BaseGame` subclass, timer owned by BaseGame, direct state-change callbacks, caught fire-and-forget `end()`, and no game-local animation loop.
- **Mine Grid DOM shape:** focused `DOMRenderer`, page-owned visual CSS, initializer-owned DOM wiring/HUD/final overlay, and a page-root bootstrap script after `</GamePage>`.
- **Shared grid helpers:** use `createGrid` and `inBounds` from `src/lib/games/shared/grid.ts`. Keep `cloneBoard()` local because shared `cloneGrid()` is intentionally shallow and would share `ChromaticTideCell` objects.
- **Flood rule ownership:** do not reuse Mine Grid's 8-direction mine reveal or Circuit Hacker's wire connectivity. Chromatic Tide capture is a different orthogonal, recoloring fixed-point rule and remains in `board.ts`.
- **Finite RNG policy:** normalize/clamp one sample per cell without retrying, matching the finite style used by Asteroid Drift rather than a rejection loop.
- **Shared input guard:** use `isEditableTarget` from `src/lib/games/shared/utils.ts` before handling number keys.
- **BaseGame/GameTimer:** keep countdown, timeout delivery, score persistence, achievements, stale-run guard, reset/start lifecycle, callbacks, and final save flow unchanged.
- **GamePage:** keep default Start/Reset controls with `showPause={false}` and `showEnd={false}`. The five color buttons live with the board rather than replacing shared controls.
- **Game data:** `GameType` already aliases `GameID`; adding the enum member is sufficient. No server/API/schema edit is needed.
- **Catalog navigation:** `e2e/games/all-games-navigation.spec.ts` derives its targets from active `GAMES`; HPA-633 must run it after registration but must not modify it.
- **Button attributes:** `Button.astro` already forwards native button attributes, so `data-tide-color` needs no shared Button change.

Rejected:

- Pixi rendering — the board has no animation/physics requirement; DOM gives simpler accessibility and testing;
- generic flood-fill/grid-game framework — there is one consumer and the rule is tiny;
- adding orthogonal traversal to `shared/grid.ts` — shared grid stays structural rather than owning game-specific capture/recolor semantics;
- a seeded/daily board service — not needed for a casual v1;
- a move-limit validator/solver — scoring already rewards efficient play without making generation a search problem.

## Architecture

```text
Astro page / color buttons / keys 1-5
                  |
                  v
          initFramework.ts
          - DOM callbacks
          - one chooseColor() input path
          - HUD / overlay
          - listener cleanup
             |          |
             v          v
   ChromaticTideGame  ChromaticTideRenderer
      (BaseGame)         (DOMRenderer)
          |
          v
       board.ts   <---- finite board, local flood, greedy selector
       scoring.ts <---- pure score arithmetic
```

There is no game-local `requestAnimationFrame`, interval, timeout, worker, persistence layer, or network call.

## Frozen v1 rules

Before implementation this block is the numeric planning authority. Task 1 copies it into `types.ts` as `CHROMATIC_TIDE_RULES`; after that, `types.ts` is the production authority. A deliberate tuning checkpoint may adjust score/achievement thresholds, but it must update tests and this spec in the same PR.

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

The palette names intentionally match existing Cetus theme vocabulary, but the game does not import or couple to organism metadata.

## State and contracts

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

`ChromaticTideConfig extends BaseGameConfig` with the frozen rules plus `rng: () => number`.

The only player-action method is:

```ts
chooseColor(color: ChromaticTideColor): boolean
```

It returns `true` only when a choice is accepted and therefore counts as one move.

## Finite board generation

`board.ts` owns board materialization. Generation is deliberately bounded and consumes exactly `rows * cols` RNG samples.

For each cell:

1. read one injected RNG sample;
2. normalize non-finite/out-of-range values into the unit interval without retrying;
3. map the sample to one of the five palette entries;
4. create `{ color, captured: false }`.

After all cells are created, guard the single degenerate case that would begin already solved: if every cell equals the top-left color, recolor only the bottom-right cell to the next palette color. This consumes no extra RNG.

Then mark the initial connected top-left territory. No rejection loop, quality retry, solver, or seeded service is added.

A random board can be easier or harder than another random board. That is acceptable for this casual v1; a future ranked/daily mode would be the correct place to introduce deterministic board identity.

## Initial territory and cloning

The initial territory is the maximal orthogonally connected component matching `board[0][0].color` and containing `(0, 0)`.

`markInitialTerritory(board)` returns a deep-enough local clone and does not mutate its input. `cloneBoard()` remains in `board.ts` as:

```ts
function cloneBoard(board: ChromaticTideBoard): ChromaticTideBoard {
    return board.map(row => row.map(cell => ({ ...cell })))
}
```

Do not use shared `cloneGrid()` for this model; its shallow row copy would retain shared cell-object references.

`markInitialTerritory()`:

1. clones the board;
2. marks `(0, 0)` captured;
3. runs the same fixed-point flood primitive with the starting color;
4. returns the complete starting component captured.

The game stores that count as `initialCapturedCells`. Initial cells do not create score simply for starting a run.

## Flood semantics

`floodChromaticTideBoard(board, targetColor)` is pure: it clones the board and returns the next board.

Algorithm:

1. recolor every already captured cell to `targetColor`;
2. enqueue every captured position;
3. repeatedly inspect orthogonal neighbors;
4. when an uncaptured neighbor has `targetColor`, mark it captured and enqueue it;
5. stop when the queue is exhausted.

Marking on enqueue prevents duplicate work. With a fixed 8×8 board, traversal is bounded by 64 cells.

Diagonal adjacency never captures directly. A newly captured target-color cell can expose more target-color cells in the same move, so one choice always resolves to a fixed point before state is emitted.

The helper must not mutate the supplied board.

## Greedy progress invariant

The browser clear path relies on a load-bearing property that belongs in unit coverage, not only Playwright.

Export one pure selector from `board.ts`:

```ts
export function selectGreedyChromaticTideColor(
    board: ChromaticTideBoard,
    territoryColor: ChromaticTideColor
): ChromaticTideColor
```

It evaluates the four non-current colors with `floodChromaticTideBoard()` and returns the color producing the largest captured count, breaking ties by palette order.

For every valid incomplete rectangular board whose captured cells form the connected top-left territory:

- at least one uncaptured cell is orthogonally adjacent to the captured region;
- that boundary cell has a non-current color, because all captured cells share `territoryColor` after each move;
- choosing that boundary color captures at least one additional cell;
- therefore the greedy selector strictly increases `countCapturedCells()` while incomplete;
- repeating it clears in at most the number of initially uncaptured cells.

`board.test.ts` must pin this property over several injected fixtures, including irregular territory boundaries and zero-gain alternative colors. Playwright then imports this already-unit-proven selector instead of maintaining a separate greedy implementation.

This is still not an optimal-move solver; it only selects the best immediate capture among five fixed colors for deterministic test driving.

## Player action ordering

`ChromaticTideGame.chooseColor(color)` rejects the action when:

- the game is inactive, paused, or over;
- `outcome !== 'playing'`;
- `color` is not in the palette at runtime;
- `color === territoryColor`.

An accepted choice uses this exact order:

1. run the pure flood helper;
2. increment `movesUsed` once;
3. replace the board;
4. update `territoryColor` and `capturedCells`;
5. if all cells are captured, set `outcome = 'cleared'`;
6. synchronize score from the pure scorer using the live BaseGame timer status;
7. emit one state change;
8. if cleared, call `end()` as caught fire-and-forget.

Choosing a different color that happens to capture zero new cells is still a legal move and increments `movesUsed`. That is a strategic mistake, not an invalid UI action.

## Scoring

One pure scorer owns all arithmetic.

For an unfinished run:

```text
gainedCells = max(0, capturedCells - initialCapturedCells)
score = gainedCells * progressPointsPerCell
```

For a cleared run:

```text
score = totalCells * progressPointsPerCell
      + completionBonus
      + max(0, efficiencyReferenceMoves - movesUsed)
          * efficiencyPointsPerMove
      + floor(secondsRemaining) * timePointsPerSecond
```

Normalization rules:

- counts are finite non-negative integers;
- captured/initial counts are clamped to `0..rows*cols`;
- `initialCapturedCells <= capturedCells` after normalization;
- `secondsRemaining` is clamped to `0..duration`;
- completion scoring uses the full board-cell base rather than `total - initial` so completed boards have a comparable baseline regardless of the random starting component;
- BaseGame generic time bonus is disabled;
- the model applies only positive score deltas through `addScore()`.

Because time/move bonuses appear only after `cleared`, the canonical score never decreases as the timer runs down.

## Timer, lifecycle, stats, and achievement data

`ChromaticTideGame` uses `duration: 90`, `pausable: false`, `resettable: true`, and BaseGame time bonus off.

- `createInitialState()` generates a fresh finite board from configured RNG and records its initial territory.
- `start()` uses the existing BaseGame timer; no additional clock exists.
- `update()` is a no-op because gameplay is event-driven.
- successful board completion sets `cleared`, synchronizes score, emits state, and invokes `void this.end().catch(...)`.
- `handleTimeUp()` sets `timeout`, synchronizes partial progress, emits state, then delegates to `super.handleTimeUp()`.
- `reset()` creates a fresh board through BaseGame's normal `createInitialState()` path and resets score/timer.
- `cleanup()` has no model-owned external resource.

Use the existing two BaseGame data surfaces correctly:

```ts
getGameStats(): ChromaticTideStats
protected override getGameData(): Record<string, unknown>
```

`getGameStats()` owns overlay/reporting fields. The protected `getGameData()` override is the persistence/achievement hook called by `BaseGame.end()` and must return the canonical `ChromaticTideGameData` fields. Both read `getTimerStatus()` so end-of-run seconds come from BaseGame's final timer snapshot. Do not add a second public game-data method.

## DOM renderer

`ChromaticTideRenderer` extends `DOMRenderer` and renders only the board. Controls remain stable Astro markup outside the renderer.

Each of 64 cells is a non-interactive element with:

- `role="gridcell"`;
- `data-row` / `data-col`;
- `data-color="teal|amber|magenta|ice|green"`;
- `data-captured="true|false"`;
- an `aria-label` containing row, column, color name, and whether the cell belongs to the territory.

The renderer also shows a small `1`–`5` palette index inside each cell. Color therefore is not the only visual encoding. Captured cells receive a stronger border/inset treatment through page CSS.

The board element keeps `role="grid"` and `aria-label="Chromatic Tide board"` in Astro markup. The renderer sets 8×8 grid tracks and replaces child cells on state render.

No event delegation belongs in the board renderer because cells are not player controls.

## Controls and initializer

The page renders five stable `Button.astro` controls with `data-tide-color` values and visible text such as `1 Teal`, `2 Amber`, etc.

`initFramework.ts` owns one local `chooseColor(color)` adapter. Both input modes call it:

- button click reads the button's `data-tide-color`;
- keyboard `1`–`5` maps by palette index after `isEditableTarget(event.target)` rejects typing contexts.

After every state change the initializer:

- renders the board;
- updates score/time via existing callbacks;
- updates `moves` and `captured` HUD values;
- marks the current color control `aria-pressed="true"` and disables it;
- enables the other four controls only while the run is active and outcome is `playing`.

The initializer also owns Start/Reset/Play Again listeners, final overlay text, achievement/challenge notifications, `beforeunload`, idempotent cleanup, and a debug handle consistent with recent games:

```ts
window.chromaticTideGame = handle
```

There is no rAF loop.

## Page layout and color treatment

`src/pages/chromatic-tide/index.astro` uses `GamePage` with:

- `gameId="chromatic-tide"`;
- `initialTime={90}`;
- `showPause={false}`;
- `showEnd={false}`;
- a responsive square board capped around the Mine Grid footprint;
- five color buttons immediately below the board;
- stats for Moves and Captured;
- How to Play and Scoring cards;
- final stats for Outcome, Moves, Captured, and Time.

The bootstrap `<script>` stays at page root after `</GamePage>`, matching the repository's hardcoded page-markup contract.

Page-local color CSS copies the existing organism palette values without importing organism types or adding global tokens:

```text
teal    #1fe3c0
amber   #f2b33d
magenta #ff3d8a
ice     #6fe3ff
green   #5dff9f
```

The control row must remain within the phone viewport. The mobile browser proof fails on horizontal overflow rather than hiding it with clipping.

## Page-markup contract

`src/pages/game-board-markup.test.ts` has a hardcoded `games` array used by the generic GamePage-wrapper sweep. HPA-633 must explicitly append:

```ts
'chromatic-tide',
```

The dedicated Chromatic Tide describe block additionally pins the root bootstrap position, GamePage flags/time, board IDs, and five `data-tide-color` controls. Merely adding a dedicated describe block without extending the shared `games` array is insufficient.

## Catalog identity

Register:

```ts
GameID.CHROMATIC_TIDE = 'chromatic_tide'
```

Catalog row:

- name: `Chromatic Tide`;
- category: `strategy`;
- estimated duration: `1-2 minutes`;
- difficulty: `medium`;
- icon: `🌈`;
- organism: `{ shape: 'frond', color: 'teal' }`;
- depth: `mid`.

Depth is a product-fit choice, not a balancing/count choice. `Mid-water` is described as “Focused sessions. A few minutes in.” while `Abyssal` is “Long and absorbing.” A 90-second strategy run fits Mid-water better, and Gravity Flip already establishes that a one-minute game can live there.

Adding Chromatic Tide as Mid-water yields depth counts **9 shallow / 10 mid / 4 abyssal**. Within the depth-ordered catalog, the current Mid-water tail is Gravity Flip (`spiral` + `magenta`); appending `frond` + `teal` preserves the adjacent shape+color invariant.

## Achievement contract

Use existing `in_game` achievement checks against canonical `ChromaticTideGameData`:

1. **First Tide** — clear a board. Common.
2. **Current Reader** — clear in `<= 24` moves. Rare.
3. **Rapid Bloom** — clear with `>= 30` seconds remaining. Rare.
4. **Master Palette** — clear in `<= 18` moves and with `>= 20` seconds remaining. Epic.

The exact efficiency/time thresholds are tuning values at the implementation checkpoint; the achievement shapes are structural.

No score-threshold welcome achievement is used because a partial timeout can legitimately score without clearing.

## Browser coverage

`e2e/games/play-coverage.spec.ts` gets focused Chromatic Tide coverage rather than a new spec framework.

Desktop path:

1. open `/chromatic-tide` and start;
2. read the debug state;
3. call exported `selectGreedyChromaticTideColor()` in the Playwright process;
4. click the corresponding real color button;
5. repeat until cleared, with a hard bound equal to the initial uncaptured-cell count;
6. assert the completion overlay/stats;
7. Play Again, assert a fresh idle board, start again, and prove one keyboard choice increments moves.

The greedy progress guarantee is unit-proven in `board.test.ts`; Playwright does not carry the proof itself.

Mobile path:

- use the suite's phone-sized viewport;
- start the game;
- assert board/control cluster does not overflow horizontally;
- tap one non-current color control;
- assert `movesUsed === 1`, board visibility, and selected/current-control state.

After catalog registration, also run the existing derived homepage navigation spec:

```bash
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

Do not edit that spec; adding the active `GAMES` row automatically makes `/chromatic-tide` part of its navigation target list.

## Testing contract

Unit tests cover:

- exactly finite RNG consumption and degenerate-board repair;
- initial orthogonal component discovery;
- diagonal non-capture;
- fixed-point chain capture;
- pure/non-mutating board helpers and deep-enough local cloning;
- greedy selector strict-progress property and bounded clear over several fixtures;
- runtime-invalid/current-color rejection;
- legal zero-gain moves counting once;
- completion ordering and single end path;
- timeout partial score;
- protected `getGameData()` achievement payload and public stats fields;
- score normalization and completion bonuses;
- renderer cell metadata and 1–5 non-color encoding;
- initializer click/keyboard/editable-target/cleanup/restart behavior;
- page-markup dedicated assertions plus hardcoded wrapper-array membership;
- catalog ID/icon/strategy row/depth count and adjacency invariant;
- canonical game-data alias and achievements.

The implementation checkpoint runs targeted tests while iterating, then the repository gates:

```bash
bun run test:run
bun run typecheck
bun run lint
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

## Risks and mitigations

### Greedy flood invariant drifts

**Risk:** A future flood/recolor regression could make the browser clear helper stall or turn a model defect into a slow Playwright failure.

**Mitigation:** `board.test.ts` owns several deterministic strict-progress fixtures and proves repeated greedy selection clears in at most the initially uncaptured-cell count. Playwright imports the same selector.

### Catalog registration breaks homepage navigation

**Risk:** The active `GAMES` row can render a specimen that links incorrectly or points at a route that does not satisfy the normal page contract, while play-coverage still passes by visiting the route directly.

**Mitigation:** Keep `all-games-navigation.spec.ts` production-unchanged and run it after registration; its targets are derived from `GAMES` and it clicks the actual homepage specimen card.

### Five named controls overflow narrow phones

**Risk:** Five labels such as `1 Teal` can overflow a single row at phone width even if the board itself is responsive.

**Mitigation:** The page may use a responsive wrapping/grid arrangement, but never hide overflow. The mobile browser path explicitly fails when the board/control cluster exceeds viewport width.

## Non-goals

HPA-633 does **not** add:

- difficulty presets;
- a hard move cap;
- optimal-move calculation or production solver/hints;
- daily/seeded competition;
- campaign progression;
- animations requiring rAF;
- audio;
- multiplayer;
- new persistence/API/DB/auth contracts;
- generic grid/flood/input/control frameworks;
- BaseGame/GameTimer/GamePage/DOMRenderer refactors.

## Acceptance criteria

HPA-633 is complete when:

- `/chromatic-tide` can be started, played, cleared, timed out, reset, and replayed through existing GamePage controls;
- every accepted color choice resolves the full orthogonal flood before state emission;
- the current color is a no-op/rejected action while a different zero-gain color still counts as a move;
- generation is finite and does not produce an already-cleared starting board;
- the greedy selector's strict-progress/bounded-clear property is unit-proven;
- partial and completion scores follow the pure formula and never decrease;
- mouse/touch and keys `1`–`5` share the same game action path;
- board/control semantics do not rely on hue alone and the five controls do not overflow the phone viewport;
- `getGameStats()` feeds final presentation while protected `getGameData()` supplies the achievement/save payload;
- `game-board-markup.test.ts` includes Chromatic Tide in both dedicated assertions and the shared GamePage wrapper sweep;
- catalog uses Strategy / Mid-water / frond+teal with depth counts 9 / 10 / 4;
- focused desktop/mobile play coverage and derived homepage navigation coverage pass;
- no shared framework or backend/schema work is introduced;
- the entire design + implementation ships in one HPA-633 PR.
