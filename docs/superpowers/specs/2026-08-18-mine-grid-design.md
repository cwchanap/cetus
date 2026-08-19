# Mine Grid — Design Spec

- **Linear issue:** [HPA-75 — Minigame: Mine Grid](https://linear.app/cwchanap/issue/HPA-75/minigame-mine-grid)
- **Date:** 2026-08-18
- **Status:** Planning draft, ready for implementation

## Overview

Mine Grid is a futuristic Minesweeper-style logic game. The player scans a hidden field, reveals safe cells, reads adjacent-mine counts, and flags suspected mines. Revealing a mine or running out of time ends the run; revealing every safe cell clears the field.

The implementation is intentionally conventional. Mine Grid is a discrete button-grid game, so it uses the existing `BaseGame` lifecycle and `DOMRenderer` rather than PixiJS. The board is rendered as semantic buttons inside Astro-owned structure, giving mouse, touch, and keyboard support without a custom hit-testing layer.

The first reveal is guaranteed safe by placing mines lazily after that action. Three fixed presets provide the requested difficulty scaling. Version 1 does not guarantee a no-guess solution, add scanner power-ups, support custom board sizes, or introduce a new game runtime.

## Product Goals

- Add a recognizable Minesweeper-style logic game that fits Cetus' sci-fi presentation.
- Keep a complete run in the issue's 3–10 minute range.
- Make reveal and flag actions equally usable on desktop and touch devices.
- Give correct flagging a real scoring upside while penalizing incorrect flag actions.
- Reuse existing grid, lifecycle, score, achievement, leaderboard, run-staleness, and game-page infrastructure.
- Keep board logic deterministic under an injected `() => number` RNG so mechanics are cheap to unit test.

## Non-Goals

The first version intentionally does **not** include:

- scanner assists or consumable hints;
- chord-click / auto-open-neighbors gestures;
- custom row, column, or mine-count inputs;
- seeded daily boards;
- campaign progression or persistent in-progress runs;
- guaranteed no-guess generation or a Minesweeper solver;
- PixiJS rendering or canvas-specific input handling;
- arrow-key grid navigation;
- new database tables, score endpoints, or leaderboard modes.

## Gameplay Flow

1. Page loads with **Medium** selected and an unrevealed 10×10 field.
2. Player may choose Easy, Medium, or Hard while idle. `MineGridGame.newGame(difficulty)` updates the idle timer duration and resets the board in place; the initializer keeps one game instance for its lifetime.
3. Player presses **Start Game**. The preset countdown begins and difficulty controls are disabled.
4. The first accepted reveal lazily places every mine except on the selected cell, then reveals that cell. If it is a zero, the standard zero-region flood reveal runs.
5. During play the player may reveal, flag/unflag, switch the touch-friendly Reveal/Flag mode, or right-click to flag on desktop.
6. **Win:** every non-mine cell is revealed. Correctly flagged mines contribute score, incorrect flag actions subtract score, the completed field renders, and the run ends.
7. **Mine hit:** all mines are shown, score remains 0, and the run ends.
8. **Timeout:** all mines are shown, score remains 0, and the run ends.
9. **Reset / Play Again:** returns to a fresh unrevealed board using the current difficulty.

There is no manual End Game button in v1. A run has a product outcome: cleared, mine hit, or timeout.

## Difficulty Presets

| Difficulty | Grid | Mines | Safe cells | Timer |
|---|---:|---:|---:|---:|
| Easy | 8×8 | 8 | 56 | 180s (3 min) |
| Medium | 10×10 | 15 | 85 | 300s (5 min) |
| Hard | 12×12 | 24 | 120 | 600s (10 min) |

The 12×12 upper bound remains practical on a narrow phone without adding zooming or horizontal scrolling. Scanner assists mentioned in HPA-75 are optional and deferred.

## Board Rules and Shared Grid Reuse

### Cell model

```ts
interface MineGridCell {
  hasMine: boolean
  adjacentMines: number
  revealed: boolean
  flagged: boolean
}
```

The runtime board is `MineGridCell[][]`.

Mine Grid does **not** add another generic grid-construction or search layer. It reuses `src/lib/games/shared/grid.ts`:

- `createGrid(rows, cols, factory)` creates each fresh board;
- `inBounds(grid, row, col)` handles bounds inside 8-way adjacency;
- `findCells(grid, predicate)` counts flags and finds flagged safe/mine cells.

`board.ts` adds only the mechanics that do not already exist:

- `placeMines(board, mineCount, safeCell, rng)`;
- `getAdjacentPositions(board, row, col)` for 8-way neighbors;
- `getFloodRevealPositions(board, row, col)` for zero-region breadth-first reveal.

Adjacent-mine counts are populated inside `placeMines`; there is no separate `populateAdjacentMineCounts()` public helper.

### Lazy mine placement and first-click safety

Mines are placed only on the first accepted reveal:

```ts
placeMines(board, mineCount, safeCell, rng = Math.random): void
```

The selected first-reveal coordinate is excluded from candidates. Neighboring cells are not excluded. The first cell is safe but may have a non-zero count.

Tests inject a bare deterministic `() => number`. Production uses `Math.random`. The seeded RNG used for deterministic Daily/Expedition content is intentionally not reused because reproducible Mine Grid boards are a non-goal.

### Reveal behavior

A numbered safe cell reveals only itself. A zero cell performs a breadth-first flood reveal over connected zeros plus numbered boundary cells. Flagged cells are never automatically revealed.

The game wins when:

```text
revealedSafeCells === rows * cols - mineCount
```

Flags remain optional for winning, matching standard Minesweeper behavior.

### Incorrect flag accounting

`incorrectFlagActions` measures mistakes made during the run rather than final board state:

- after mines exist, changing an unflagged safe cell to flagged increments the counter;
- unflagging does not decrement it;
- flagging the same safe cell incorrectly again counts as another incorrect action;
- flags placed before the first reveal are evaluated once immediately after lazy mine placement, and every pre-flagged safe cell adds one incorrect action.

This counter intentionally does **not** collapse to a final-board incorrect-flag count. A cleared board cannot retain a flagged safe cell because that cell would remain unrevealed, so a final-board count would always be zero on successful runs and would fail HPA-75's “fewer incorrect flags” scoring requirement.

## Scoring

Scoring remains one pure function in `scoring.ts`.

A cleared board receives:

```text
clearPoints = safeCells * 10 + correctlyFlaggedMines * 50
timeBonus = remainingSeconds * 5
flagPenalty = incorrectFlagActions * 100
finalScore = max(1, clearPoints + timeBonus - flagPenalty)
```

A mine hit or timeout receives **0** points.

Correct flags now have real upside. A player can still clear without flags, but forfeits `50` points for each unflagged mine. Incorrect flags are a genuine trade-off rather than a pure downside attached to an otherwise unrewarded mechanic.

Maximum scores are unchanged when every mine is correctly flagged and no mistakes are made:

- Easy: `56*10 + 8*50 + 180*5 = 1,860`
- Medium: `85*10 + 15*50 + 300*5 = 3,100`
- Hard: `120*10 + 24*50 + 600*5 = 5,400`

`BaseGame` is configured with `timeBonus: false`. This is load-bearing: Mine Grid owns its time bonus and awards it only on victory. Even after the shared BaseGame timing correction below, enabling BaseGame's time bonus would double-award time on successful runs and create a second scoring authority.

## Runtime State, Stats, and Submitted Data

```ts
type MineGridDifficulty = 'easy' | 'medium' | 'hard'
type MineGridResult = 'playing' | 'cleared' | 'mine' | 'timeout'

interface MineGridState extends BaseGameState {
  difficulty: MineGridDifficulty
  board: MineGridCell[][]
  minesPlaced: boolean
  revealedSafeCells: number
  flagsPlaced: number
  incorrectFlagActions: number
  result: MineGridResult
}
```

`createInitialState()` explicitly sets `timeRemaining: this.config.duration`, matching the BaseGame convention used by existing framework-native games.

```ts
interface MineGridStats extends BaseGameStats {
  difficulty: MineGridDifficulty
  cleared: boolean
  result: MineGridResult
  revealedSafeCells: number
  totalSafeCells: number
  flagsPlaced: number
  incorrectFlagActions: number
}

interface MineGridGameData {
  difficulty: MineGridDifficulty
  cleared: boolean
  revealedSafeCells: number
  incorrectFlagActions: number
  elapsedSeconds: number
}
```

The board layout itself is not persisted.

## Architecture

### BaseGame + DOMRenderer

Mine Grid fits the framework because one run has one board and one countdown, scoring is run-local, state changes are input-driven, and no animation/physics loop is required.

`MineGridGame` extends `BaseGame`. `MineGridRenderer` extends `DOMRenderer`. No handle-based runtime, mode registry, or game-specific score service is introduced.

### Small shared lifecycle corrections

Mine Grid exposed two small gaps in the shared BaseGame timer seam that already affect existing framework-native games.

#### Final timer snapshot

Today `BaseGame.end()` stops `GameTimer` before `getGameStats()` / `getGameData()`, while a stopped `GameTimer.getElapsedTime()` returns `0` and a stopped countdown `getCurrentTime()` returns its full configured duration. Existing subclasses therefore need local workarounds or can report incorrect final timing.

The implementation adds one BaseGame-owned final timer snapshot. At the start of `BaseGame.end()`:

- when the timer is still running/paused, capture its live `currentTime` and `elapsedTime`;
- when the timer already stopped because countdown completion fired, derive `currentTime` from `state.timeRemaining` and `elapsedTime` from `config.duration - state.timeRemaining`;
- stop the timer after the snapshot;
- apply any BaseGame time bonus using the captured final remaining time, not the stopped timer;
- make `getTimerStatus()` return the captured final `currentTime`/`elapsedTime` after end;
- clear the snapshot in `resetInternal()`.

This removes the duplicated elapsed-capture fields/`end()` overrides from Sudoku and Word Scramble and fixes post-end `getTimerStatus().elapsedTime` for existing consumers such as Quick Math without migrating every subclass.

#### Idle duration update

Difficulty changes require different countdown lengths. Replacing a game instance mid-session would introduce listener teardown/reattach choreography that no current initializer uses. Instead the core gains the smallest reusable idle-duration seam:

```ts
// GameTimer: only while not running
setDuration(seconds: number): boolean

// BaseGame: protected, only while state.isActive === false
protected setDuration(seconds: number): boolean
```

The BaseGame helper synchronizes `config.duration`, `GameTimer`, and `state.timeRemaining`. Mine Grid then exposes `newGame(difficulty)` in the same shape as Sudoku: update the preset, call the protected duration helper, reset, and render the fresh board. Difficulty controls remain disabled while active.

This is a narrow lifecycle extension, not a generic difficulty manager.

### File structure

```text
src/lib/games/core/
  BaseGame.ts        # final timer snapshot + protected idle duration helper
  GameTimer.ts       # stopped-only setDuration()
  core.test.ts       # manual-end/timeout timing + duration tests
src/lib/games/mine-grid/
  types.ts
  board.ts
  board.test.ts
  scoring.ts
  scoring.test.ts
  MineGridGame.ts
  MineGridGame.test.ts
  MineGridRenderer.ts
  MineGridRenderer.test.ts
  initFramework.ts
  initFramework.test.ts
src/pages/mine-grid/index.astro
```

Sudoku and Word Scramble delete their game-local elapsed capture fields/`end()` overrides once BaseGame owns final timing.

## Component Responsibilities

### `types.ts`

Defines Mine Grid difficulty, preset, cell, state, stats, and submitted game-data contracts.

### `board.ts`

Owns only Mine Grid-specific board operations: mine placement, 8-way adjacency, and flood-reveal position discovery. Generic construction/bounds/search come from `shared/grid.ts`.

### `scoring.ts`

Calculates the final score from the preset, remaining seconds, correctly flagged mines, incorrect flag actions, and cleared state. It does not call score services.

### `MineGridGame.ts`

Owns:

- `revealCell(row, col)`;
- `toggleFlag(row, col)`;
- `newGame(difficulty)` while idle;
- lazy mine placement;
- flood reveal and safe-cell counters;
- flag counters and incorrect-action accounting;
- correctly flagged mine count at clear time;
- one-time victory score award;
- mine-hit and timeout outcomes;
- `getGameStats()` / `getGameData()` using BaseGame's preserved final timer status;
- `state-change` emission after accepted actions.

`update()` and `render()` are no-ops.

`handleTimeUp()` marks timeout, reveals mines, emits the final state, then delegates to the BaseGame end path. Mine Grid does not override `end()`.

### `MineGridRenderer.ts`

The renderer mounts specifically to `#mine-grid-board`. It rebuilds button markup from state but does **not** attach listeners to each button.

`setup()` registers exactly two delegated listeners on the board container:

- `click` resolves `closest('button[data-row][data-col]')` and publishes a primary action;
- `contextmenu` resolves the same target, prevents the menu, and publishes a flag action.

The two handler references are retained and removed in `cleanup()` before `super.cleanup()`.

The renderer also:

- uses real `<button type="button">` cells;
- sets dynamic `grid-template-columns`;
- maps hidden, flagged, numbered, and mine visual states;
- preserves focused row/column across rebuilds, following the Memory Matrix focus pattern;
- gives each cell an ARIA label containing row/column and state/count information.

### `initFramework.ts`

The initializer uses one immutable `MineGridGame` reference. It:

- guards the Astro-owned outer `#mine-grid-container` as the required page shell;
- initializes `MineGridRenderer` with `container: '#mine-grid-board'`;
- wires Start, Reset, Play Again, difficulty, and Reveal/Flag controls;
- maps delegated renderer primary actions through the current Reveal/Flag mode;
- calls `game.newGame(difficulty)` for idle difficulty changes;
- disables difficulty controls while active;
- updates score, timer, flags, safe progress, difficulty, and the result overlay;
- forwards achievement/challenge notifications from the BaseGame end event;
- adds/removes `beforeunload` protection for active runs;
- exposes a debug/test handle with `getGame()`, `getState()`, `restart()`, and `cleanup()`.

There is no instance replacement or listener reattachment path.

## Input and Mobile Behavior

### Action mode

- **Reveal** is the default; primary click/tap reveals.
- **Flag** makes primary click/tap toggle a flag.
- The active button has `aria-pressed="true"`.
- Reset and Play Again restore Reveal mode.

### Desktop shortcut

Right-click/context-menu on a cell always maps to flag/unflag regardless of the selected mode.

### Keyboard

Hidden cells are native buttons. Enter/Space follows the same delegated click path. Tab/Shift+Tab use browser-native focus order. No custom arrow-key grid navigation is added.

## Page Design and DOM Contract

`src/pages/mine-grid/index.astro` uses `GamePage` and owns all static structure.

The two container IDs have distinct responsibilities:

- `#mine-grid-container` — outer game shell checked by `initFramework.ts`; missing it raises the existing `DOMElementNotFoundError`/`handleGameError` path.
- `#mine-grid-board` — inner dynamic grid and the `MineGridRenderer` container selector.

The page also provides:

- Easy/Medium/Hard controls;
- Reveal/Flag segmented controls;
- default Start and Reset controls with Pause and End hidden;
- difficulty, flag, and safe-cell progress stats;
- concise rules/scoring cards;
- final outcome, difficulty, score, elapsed time, and incorrect-flag stats.

The init `<script>` stays at page root, not inside a named slot.

## Platform Integration

### Game registry

Add `GameID.MINE_GRID = 'mine_grid'` only after the `/mine-grid` page exists in the same implementation task, preserving the current invariant that every registered game has a route.

Registry entry:

- name: `Mine Grid`
- category: `puzzle`
- estimated duration: `3-10 minutes`
- difficulty: `medium`
- tags: `['mines', 'logic', 'grid', 'single-player', 'strategy']`
- active: `true`
- organism: `{ shape: 'lattice', color: 'green' }`
- depth: `abyssal`
- icon: `💣`

`getGameUrl()` derives `/mine-grid` automatically.

### Home page

The card comes from `GAMES`. Update hard-coded “fifteen” homepage copy/comments to sixteen.

### Score API / database

No schema or endpoint changes are required:

- `GameType` aliases `GameID`;
- score and leaderboard Zod enums derive from `Object.values(GameID)`;
- score `0` is valid server-side;
- BaseGame/ScoreManager submit game data and use the existing run-staleness guard.

### Shared game data

The canonical `MineGridGameData` interface lives in `mine-grid/types.ts`; `src/lib/games/shared/types.ts` adds the alias/union member used by score and achievement infrastructure.

## Achievements

| Achievement | Rarity | Condition |
|---|---|---|
| First Sweep | COMMON | score ≥ 1 |
| Clean Scan | RARE | cleared with `incorrectFlagActions === 0` |
| Deep Field | EPIC | clear Hard difficulty |
| Demolition Expert | LEGENDARY | score ≥ 5,000 |

The scoring change preserves the `5,000` legendary threshold because a well-played Hard clear still reaches up to `5,400`.

## Documentation

`AGENTS.md` is a Git symlink (`mode 120000`) pointing to `CLAUDE.md`. Implementation edits **only `CLAUDE.md`**; executors must not replace `AGENTS.md` as a regular file.

Update current repository inventory text to 16 games and `13 of 16` BaseGame-native games, add Mine Grid to the DOM-rendered/game-specific notes, and fix the stale “All 14 games are fully implemented” sentence. Historical plan/spec documents are not rewritten just for old counts.

## Risks and Mitigations

### Shared BaseGame timer semantics

The timer snapshot changes observable post-end `getTimerStatus()` values for framework-native games. That is intentional: final elapsed/current time should describe the completed run instead of the reset-like values returned by a stopped `GameTimer`. Core tests lock both manual end and timeout, and focused Sudoku/Word Scramble/Quick Math tests run before full-suite validation.

### Idle duration mutation

`GameTimer.setDuration()` and `BaseGame.setDuration()` are forbidden while running. Mine Grid disables difficulty controls while active and `newGame(difficulty)` fails closed if the run is active. Tests cover both stopped success and active rejection.

### Async score submission and a new run

`BaseGame.end()` can await score submission while the player later begins another run. Existing `runGuard` behavior is the authority: a newer run makes old callbacks stale. Mine Grid does not add a second async guard or disable Play Again until the network returns.

### Random boards in browser tests

Playwright does not attempt to solve a random board. The smoke path flags first, then reveals a different cell, so an immediate flood-clear cannot skip the Flag path.

## Verification Strategy

Focused tests cover:

- shared grid reuse plus exact mine count / protected first cell / deterministic `zeroRng` placement;
- flood reveal and flagged-cell blocking;
- scoring upside for correctly flagged mines and penalty for incorrect actions;
- BaseGame final timer snapshot for manual end and timeout;
- correct time-bonus use of final remaining time;
- stopped-only timer duration updates and active-run rejection;
- deletion of Sudoku/Word Scramble timing workarounds without behavior regression;
- Mine Grid first-click safety, flag accounting, clear/mine/timeout, one-time score, and difficulty changes;
- renderer delegation, focus restoration, ARIA, and context-menu behavior;
- initializer DOM contract, action modes, difficulty controls, overlay, cleanup, and debug handle;
- registry/achievement/page integration;
- Playwright Mine Grid smoke plus catalog navigation derived from `GAMES`.

Final repository gates include unit tests, typecheck, lint, format check, build, `e2e/games/play-coverage.spec.ts`, and `e2e/games/all-games-navigation.spec.ts`.

## Acceptance Criteria

- Mine Grid appears in the 16-game catalog with the correct metadata and route.
- Easy/Medium/Hard use exactly the fixed presets above.
- First reveal cannot be a mine; only that cell is protected.
- Reveal, touch-friendly Flag mode, desktop right-click flag, and native keyboard activation work.
- Correctly flagged mines add score; incorrect flag actions subtract score; mine/timeout score 0.
- Clear, mine hit, timeout, Reset, Play Again, and idle difficulty changes have correct lifecycle behavior.
- Post-end elapsed time/remaining time are correct through the shared BaseGame timer snapshot.
- Scores/game data use the existing leaderboard/progress/achievement path when logged in.
- No solver, no no-guess generator, no scanner assists, no DB/API migration, no PixiJS, no End Game action, and no custom arrow-key navigation are added.
