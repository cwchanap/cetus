# Mine Grid — Design Spec

- **Linear issue:** [HPA-75 — Minigame: Mine Grid](https://linear.app/cwchanap/issue/HPA-75/minigame-mine-grid)
- **Date:** 2026-08-18
- **Status:** Planning draft, ready for implementation

## Overview

Mine Grid is a futuristic Minesweeper-style logic game and the next new minigame after the shipped Ice Slide and Satellite Sync work. The player scans a hidden field, reveals safe cells, reads adjacent-mine counts, and flags suspected mines. Revealing a mine or running out of time ends the run; revealing every safe cell clears the field.

The implementation should be intentionally conventional. Mine Grid is a discrete button-grid game, so it uses the existing `BaseGame` lifecycle and `DOMRenderer` rather than PixiJS. The board is rendered as semantic buttons inside the Astro-owned game surface, giving mouse, touch, and keyboard support without a custom hit-testing layer.

The first reveal is guaranteed safe by placing mines lazily after that action. Three fixed presets provide the requested difficulty scaling. Version 1 does not attempt to guarantee a no-guess solution, add scanner power-ups, support custom board sizes, or introduce a new game framework.

## Product Goals

- Add a recognizable Minesweeper-style logic game that fits Cetus' sci-fi presentation.
- Keep a complete run in the issue's 3–10 minute range.
- Make reveal and flag actions equally usable on desktop and touch devices.
- Reuse the existing score, achievement, leaderboard, run-staleness, and game-page infrastructure.
- Keep board logic deterministic under an injected RNG so mechanics are cheap to unit test.

## Non-Goals

The first version intentionally does **not** include:

- scanner assists or consumable hints;
- chord-click / auto-open-neighbors gestures;
- custom row, column, or mine-count inputs;
- seeded daily boards;
- campaign progression or persistent in-progress runs;
- guaranteed no-guess generation or a Minesweeper solver;
- PixiJS rendering or canvas-specific input handling;
- new database tables, score endpoints, or leaderboard modes.

These can be added later if the base game proves worth extending.

## Gameplay Flow

1. Page loads with **Medium** selected and an unrevealed 10×10 field.
2. Player may choose Easy, Medium, or Hard while the game is idle. The board resets to the selected preset.
3. Player presses **Start Game**. The preset countdown begins and difficulty controls are disabled for the run.
4. The first reveal lazily places every mine except on the selected cell, then reveals that cell. If it is a zero, the standard zero-region flood reveal runs.
5. During play the player may:
   - reveal an unrevealed, unflagged cell;
   - flag or unflag an unrevealed cell;
   - switch the touch-friendly action mode between **Reveal** and **Flag**;
   - right-click a cell on desktop to flag/unflag it regardless of the active action mode.
6. **Win:** every non-mine cell is revealed. The game calculates the final score, renders the completed field, and ends the run.
7. **Mine hit:** the mine is revealed, all mines are shown, score remains 0, and the run ends.
8. **Timeout:** all mines are shown, score remains 0, and the run ends.
9. **Reset / Play Again:** returns to a fresh unrevealed board using the current difficulty.

There is no manual End Game button in v1. A run has a clear product outcome: cleared, mine hit, or timeout.

## Difficulty Presets

Difficulty is fixed to three mobile-friendly presets:

| Difficulty | Grid | Mines | Safe cells | Timer |
|---|---:|---:|---:|---:|
| Easy | 8×8 | 8 | 56 | 180s (3 min) |
| Medium | 10×10 | 15 | 85 | 300s (5 min) |
| Hard | 12×12 | 24 | 120 | 600s (10 min) |

The 12×12 upper bound is deliberate: it remains practical on a narrow phone without introducing zooming or horizontal scrolling. Scanner assists mentioned in HPA-75 are optional and deferred.

## Board Rules

### Cell model

Each cell stores only the state required by Minesweeper:

```ts
interface MineGridCell {
  hasMine: boolean
  adjacentMines: number
  revealed: boolean
  flagged: boolean
}
```

The runtime board is `MineGridCell[][]`.

### Lazy mine placement and first-click safety

`createEmptyBoard(rows, cols)` creates a mine-free hidden board. Mines are placed only on the first accepted reveal using:

```ts
placeMines(board, mineCount, safeCell, rng = Math.random): void
```

The selected first-reveal coordinate is excluded from candidates. No neighboring-cell exclusion is added: the first cell is guaranteed safe, but it may show a non-zero adjacent count. This preserves the guarantee without complicating generation or changing effective mine density.

Tests inject a deterministic RNG; production uses `Math.random`.

### Adjacent counts

After mine placement, each non-mine cell receives the count of mines in its up-to-eight neighboring cells. Bounds handling stays in pure board helpers.

### Reveal behavior

Revealing a numbered safe cell reveals only that cell. Revealing a zero cell performs a breadth-first flood reveal over connected zero cells plus their numbered boundary cells. Flagged cells are never automatically revealed.

The game wins when:

```text
revealedSafeCells === rows × cols − mineCount
```

Flags are optional for winning, matching standard Minesweeper behavior.

### Incorrect flag accounting

HPA-75 asks scoring to reward fewer incorrect flags. `incorrectFlagActions` therefore measures mistakes made during the run rather than only the final board state:

- after mines exist, transitioning an unflagged safe cell to flagged increments the counter;
- unflagging does not decrement it;
- flagging that same safe cell again counts as another incorrect action;
- flags placed before the first reveal are evaluated immediately after lazy mine placement, and each pre-flagged safe cell increments the counter once.

This makes the metric meaningful even though a winning board cannot still contain a wrongly flagged safe cell.

## Scoring

Scoring is deliberately small and implemented as pure functions in `scoring.ts`.

A cleared board receives:

```text
clearPoints = safeCells × 10 + mineCount × 50
timeBonus  = remainingSeconds × 5
flagPenalty = incorrectFlagActions × 100
finalScore = max(1, clearPoints + timeBonus - flagPenalty)
```

A mine hit or timeout receives **0** points.

Approximate maximum scores are:

- Easy: `56×10 + 8×50 + 180×5 = 1,860`
- Medium: `85×10 + 15×50 + 300×5 = 3,100`
- Hard: `120×10 + 24×50 + 600×5 = 5,400`

Hard clears therefore naturally outrank easier clears without a separate leaderboard mode.

`BaseGame` is configured with `timeBonus: false`; Mine Grid computes the time bonus itself only on victory. This prevents the base lifecycle from granting positive time points to failed runs.

## Game State and Score Data

### Runtime state

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

`createInitialState()` always creates an empty hidden board for the selected preset. Mine placement remains deferred until the first reveal.

### Stats

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
```

### Submitted game data

```ts
interface MineGridGameData {
  difficulty: MineGridDifficulty
  cleared: boolean
  revealedSafeCells: number
  incorrectFlagActions: number
  elapsedSeconds: number
}
```

This is enough for achievements and post-run inspection without persisting the board layout.

## Architecture

### Chosen approach: BaseGame + DOMRenderer

Mine Grid fits the existing framework more closely than Satellite Sync or Ice Slide:

- one run has one board and one countdown;
- scoring happens once at completion;
- state changes are input-driven;
- the board has no animation or physics requirements.

`MineGridGame` therefore extends `BaseGame`, inheriting timer lifecycle, score submission, run-staleness protection, reset semantics, and achievement dispatch. `MineGridRenderer` extends the existing `DOMRenderer` and renders semantic cell buttons.

### Difficulty-duration wrinkle

`GameTimer` takes its duration in the `BaseGame` constructor and does not support changing duration later. The solution stays local to Mine Grid's initializer instead of changing core timer APIs:

- the renderer is initialized once;
- the initializer owns the current `MineGridGame` instance;
- selecting a different difficulty while idle destroys the old game instance and constructs a new one with that preset's `duration`;
- button and renderer callbacks reference the current game variable, so no new framework abstraction is required;
- difficulty controls are disabled while a run is active.

This is less invasive than adding mutable timer configuration to the shared core for one game.

### File structure

```text
src/lib/games/mine-grid/
  types.ts          # Difficulty, preset, cell/state/stats/gameData types
  board.ts          # Pure board creation, mine placement, adjacency, flood reveal helpers
  board.test.ts     # Deterministic generation + reveal mechanics
  scoring.ts        # Pure final-score calculation
  scoring.test.ts   # Difficulty/time/incorrect-flag scoring cases
  MineGridGame.ts   # BaseGame subclass and run rules
  MineGridGame.test.ts
  MineGridRenderer.ts  # DOMRenderer subclass, semantic cell buttons and input callbacks
  MineGridRenderer.test.ts
  initFramework.ts     # UI wiring, difficulty replacement, overlay, action mode, cleanup
  initFramework.test.ts
src/pages/mine-grid/index.astro
```

The names mirror existing framework-native DOM games such as Memory Matrix and Sudoku.

## Component Responsibilities

### `types.ts`

Defines the preset, cell, state, stats, and submitted game-data contracts. No board algorithms or DOM work.

### `board.ts`

Contains pure/testable board mechanics:

- `createEmptyBoard(rows, cols)`
- `placeMines(board, mineCount, safeCell, rng)`
- `getAdjacentPositions(board, row, col)`
- `populateAdjacentMineCounts(board)`
- `getFloodRevealPositions(board, row, col)`
- `countFlaggedCells(board)`
- `countIncorrectPreRevealFlags(board)`

The helpers may mutate the freshly-created board during mine placement, but game state ownership stays with `MineGridGame` and no DOM dependency is allowed.

### `scoring.ts`

Exports one final calculation based on the selected preset, remaining seconds, and incorrect-flag count. No score service calls.

### `MineGridGame.ts`

Owns run rules:

- `revealCell(row, col)`
- `toggleFlag(row, col)`
- lazy mine placement on the first reveal;
- flood reveal and safe-cell counters;
- incorrect-flag accounting;
- win detection and one-time score award;
- mine-hit and timeout outcomes;
- `getGameStats()` and `getGameData()`;
- emitting `state-change` after accepted actions.

`update()` and `render()` are no-ops because the game is event-driven and rendering belongs to the renderer.

`handleTimeUp()` is overridden only to mark `result = 'timeout'`, reveal mines for the final render, emit state, then delegate to `BaseGame`'s end path.

### `MineGridRenderer.ts`

Owns presentation only:

- renders the board into the Astro-provided `#mine-grid-board` container;
- uses real `<button type="button">` cells;
- applies `grid-template-columns` from the current board width;
- maps visual states for hidden, flagged, revealed-number, and mine cells;
- publishes cell actions via a callback;
- supports right-click flagging via `contextmenu`;
- preserves focused row/column across re-renders, following the Memory Matrix renderer pattern;
- updates cell ARIA labels with row, column, hidden/revealed/flagged state, and adjacent count.

The renderer owns no mine placement, scoring, or win logic.

### `initFramework.ts`

Owns page wiring:

- initializes the renderer and current Medium game;
- wires Start, Reset, Play Again, difficulty controls, and Reveal/Flag mode controls;
- recreates the `MineGridGame` instance when idle difficulty changes;
- disables difficulty buttons while active;
- updates score, timer, flags, safe-cell progress, difficulty, and result overlay;
- forwards achievement/challenge notifications from the BaseGame `end` event;
- registers and removes `beforeunload` protection for active runs;
- exposes a small debug/test handle with `getGame()`, `getState()`, `restart()`, and `cleanup()`.

No generic shared difficulty manager is introduced.

## Input and Mobile Behavior

### Action mode

The page exposes two clearly labeled buttons:

- **Reveal** — default; primary click/tap reveals a cell.
- **Flag** — primary click/tap toggles a flag.

The active control uses `aria-pressed="true"`. Reset and Play Again restore Reveal mode.

### Desktop shortcut

`contextmenu` on an unrevealed cell is prevented and mapped directly to flag/unflag. This works regardless of the active Reveal/Flag mode.

### Keyboard

Every hidden cell is a native button. Enter/Space therefore activates the current action mode through the same click path. Tab/Shift+Tab provide browser-native navigation; v1 does not add a separate arrow-key grid-navigation system.

### Responsive board

The board uses a square responsive container capped around 560 px. Twelve columns remain usable on common phone widths, avoiding horizontal scrolling. The renderer only sets the dynamic column count; Astro/Tailwind owns the surrounding layout and appearance.

## Page Design

`src/pages/mine-grid/index.astro` uses `GamePage` and keeps all static structure in Astro:

- responsive board container + `#mine-grid-board` mount;
- difficulty buttons (Easy / Medium / Hard);
- Reveal / Flag segmented controls;
- default GamePage Start and Reset controls, with Pause and End hidden;
- stats for difficulty, flags, and safe-cell progress;
- concise rules and scoring cards;
- final stats for outcome, difficulty, score, elapsed time, and incorrect flags.

The init `<script>` remains at page root, not inside a slot, matching `GamePage`'s Astro integration rule.

## Platform Integration

### Game registry

Add `GameID.MINE_GRID = 'mine_grid'` and a registry entry:

- name: `Mine Grid`
- category: `puzzle`
- estimated duration: `3-10 minutes`
- difficulty: `medium`
- tags: `['mines', 'logic', 'grid', 'single-player', 'strategy']`
- active: `true`
- organism: `{ shape: 'lattice', color: 'green' }`
- depth: `abyssal`
- icon: `💣`

`getGameUrl()` already derives `/mine-grid` from the enum value, and `SpecimenCard` consumes the registry automatically.

### Home page

The catalog is generated from `GAMES`, so adding the registry entry makes the card appear automatically. Update the hard-coded copy/count comments from fifteen to sixteen.

### Score API / database

No schema or endpoint work is required:

- `GameType` aliases `GameID`;
- score and leaderboard Zod enums derive from `Object.values(GameID)`;
- score `0` is valid server-side;
- BaseGame/ScoreManager already submit `gameData` when achievement integration is enabled.

### Shared game data

Add `MineGridGameData` to `src/lib/games/shared/types.ts` and the `GameData` union. The canonical interface lives in `mine-grid/types.ts`, matching the alias pattern used by newer games.

## Achievements

Keep the set small and mechanically meaningful:

| Achievement | Rarity | Condition |
|---|---|---|
| First Sweep | COMMON | score ≥ 1 |
| Clean Scan | RARE | cleared with `incorrectFlagActions === 0` |
| Deep Field | EPIC | clear Hard difficulty |
| Demolition Expert | LEGENDARY | score ≥ 5,000 |

`AchievementCheckData` imports/accepts `MineGridGameData` so the two in-game checks remain typed.

## Error Handling and Lifecycle

- Missing board container during initialization uses the existing `DOMElementNotFoundError` / `handleGameError` pattern.
- Renderer initialization failure destroys the renderer and returns `undefined`, matching other framework-native games.
- Reveal/flag calls are ignored when the game is idle, paused, over, out of bounds, or the cell action is invalid.
- Difficulty changes are ignored while a run is active because controls are disabled and the handler re-checks state.
- Reset invalidates the previous BaseGame run token and creates a fresh empty board.
- Cleanup removes DOM listeners, achievement listeners, unload warning, renderer state, and the current game instance.
- No async work is introduced beyond BaseGame's existing final score submission.

## Testing Strategy

### Board unit tests

Cover:

- exact mine count and no mine on the protected first cell;
- deterministic placement with injected RNG;
- correct adjacent counts at edges/corners/interior;
- zero-region flood reveal including numbered boundary cells;
- flagged cells excluded from flood reveal;
- invalid dimensions/mine counts rejected if helper contracts require it.

### Scoring unit tests

Cover exact Easy/Medium/Hard clear scores, remaining-time bonus, incorrect-flag penalty, minimum winning score of 1, and failed score 0.

### Game unit tests

Cover:

- idle actions rejected;
- first reveal cannot lose and places mines once;
- reveal of mine ends with `result = 'mine'` and zero score;
- reveal of all safe cells ends with `result = 'cleared'` and the computed score;
- timeout marks `result = 'timeout'` before ending;
- flag/unflag rules and incorrect-flag counting;
- reset returns to an unplaced, hidden board;
- `getGameData()` matches the achievement contract.

### Renderer tests

Cover semantic button creation, responsive column count, text/ARIA state for hidden/flagged/number/mine cells, Reveal/Flag callback dispatch, right-click flagging, and focus restoration after re-render.

### Init tests

Cover default Medium initialization, Start/Reset/Play Again, difficulty replacement while idle, disabled difficulty changes during play, action-mode state, stat/overlay updates, achievement forwarding, and cleanup without double listeners.

### Page / registry tests

Update `src/lib/games.test.ts` for registration and route derivation. Add Mine Grid to `src/pages/game-board-markup.test.ts`'s `GamePage` coverage and assert stable board/difficulty/action-mode IDs.

### E2E smoke

Add one deterministic happy-path interaction to `e2e/games/play-coverage.spec.ts`:

- visit `/mine-grid`;
- choose Easy;
- start the game;
- assert 64 cells are rendered;
- reveal one cell and confirm at least one cell becomes revealed;
- switch to Flag mode and flag an unrevealed cell;
- reset and confirm the board returns to 64 hidden cells.

The E2E does not solve a random Minesweeper board. Board correctness and win/loss paths belong in deterministic unit tests.

## Documentation Updates

Update both `CLAUDE.md` and `AGENTS.md` from 15 to 16 implemented games, add Mine Grid to the game list/project tree, and include it among DOM-rendered games.

## Acceptance Criteria Mapping

| HPA-75 acceptance criterion | Design coverage |
|---|---|
| Home-page icon, duration, difficulty, Play Now link | Registry entry + icon + generated SpecimenCard route + homepage count update |
| Start, reveal, flag, win, lose, restart | BaseGame lifecycle + board/game rules + Reset/Play Again |
| Final score submitted to leaderboard/progress when logged in | Existing BaseGame/ScoreManager score path; no API changes |
| Desktop and mobile controls | Native cell buttons, Reveal/Flag mode, right-click flag shortcut, responsive 8–12 column DOM grid |

This design intentionally satisfies HPA-75 without widening the work into a generic puzzle engine or a second game-runtime architecture.
