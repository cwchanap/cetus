# Chromatic Tide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-633 as a 90-second 8×8 five-color flood-fill strategy minigame with finite random boards, fixed-point territory expansion, move/time efficiency scoring, keyboard/touch controls, DOM rendering, achievements, and the existing Cetus score/progress flow.

**Architecture:** `ChromaticTideGame` extends `BaseGame` and owns only event-driven run state and lifecycle. `board.ts` owns finite board creation plus pure fixed-point flood traversal, and `scoring.ts` owns all arithmetic. `ChromaticTideRenderer` extends `DOMRenderer` and renders non-interactive cells; one initializer owns stable color buttons, keys `1`–`5`, HUD/overlay integration, notification forwarding, and cleanup. BaseGame/GameTimer remain the only timer/save lifecycle and no shared flood/grid/control framework is added.

**Tech Stack:** Astro 5, TypeScript 6, BaseGame/GameTimer/ScoreManager, DOMRenderer, Tailwind 4, Vitest 3, Playwright 1.54, Bun 1.3.

**Spec:** `docs/superpowers/specs/2026-08-25-chromatic-tide-design.md`

## Global Constraints

- One HPA-633 PR from planning through implementation.
- V1 is exactly one 8×8 / five-color / 90-second ruleset. No difficulty selector.
- Copy the frozen numeric rules from the spec into `types.ts` in Task 1. After that, `types.ts` is the production constants authority.
- Board generation consumes exactly `rows * cols` RNG samples and never retries; only an all-one-color board is repaired deterministically by changing bottom-right to the next palette color.
- Initial territory is the complete orthogonally connected top-left component. Diagonals never connect directly.
- Every accepted non-current color counts as one move, including a zero-gain choice. The current color is rejected without a move.
- Flood resolution reaches a fixed point before one state change is emitted.
- No hard move-limit loss, solver, hints, seeded/daily service, campaign, AI, persistence, API, auth, or database work.
- BaseGame/GameTimer own countdown, timeout delivery, stale-run protection, score submission, achievements, reset/start, and final save flow.
- BaseGame generic time bonus is disabled. `scoring.ts` owns progress/completion/move/time arithmetic.
- Incomplete score is gained cells only; completed score uses the full 64-cell base plus completion/move/time bonuses so random starting territory does not reduce the completion baseline.
- Use `createGrid`/`inBounds` from `@/lib/games/shared/grid` where helpful; keep flood/capture semantics local.
- Use `isEditableTarget` from `@/lib/games/shared/utils` for number-key handling.
- Use `DOMRenderer`; do not add Pixi, rAF, intervals, workers, or animation infrastructure.
- Board cells are not controls. Stable Astro color buttons and keys `1`–`5` both call `game.chooseColor()`.
- Board/control presentation cannot rely on hue alone: cells expose palette indices and labels; controls show both number and color name.
- Initializer script lives after `</GamePage>` and the new route enters the existing page-markup contract test.
- Catalog identity is `GameID.CHROMATIC_TIDE`, icon `🌈`, organism `{ shape: 'frond', color: 'teal' }`, depth `abyssal`; final depth counts are 9 / 9 / 5.
- No changes to BaseGame, GameTimer, ScoreManager, GamePage, DOMRenderer, shared grid semantics, score service, API/DB/auth/schema/packages, or `e2e/games/all-games-navigation.spec.ts`.

---

## File Map

### New production

- `src/lib/games/chromatic-tide/types.ts` — frozen rules, palette, config, cell/board/state/stats/data types.
- `src/lib/games/chromatic-tide/board.ts` — finite random materialization, initial territory, pure fixed-point flood, captured count.
- `src/lib/games/chromatic-tide/scoring.ts` — pure monotonic score target.
- `src/lib/games/chromatic-tide/ChromaticTideGame.ts` — BaseGame model and one `chooseColor()` action.
- `src/lib/games/chromatic-tide/ChromaticTideRenderer.ts` — DOM board cells and semantic metadata.
- `src/lib/games/chromatic-tide/initFramework.ts` — start/reset/replay, color buttons, keyboard, HUD/overlay, notifications, cleanup.
- `src/pages/chromatic-tide/index.astro` — responsive playable route and page CSS.

### New tests

- `src/lib/games/chromatic-tide/board.test.ts`
- `src/lib/games/chromatic-tide/scoring.test.ts`
- `src/lib/games/chromatic-tide/ChromaticTideGame.test.ts`
- `src/lib/games/chromatic-tide/ChromaticTideRenderer.test.ts`
- `src/lib/games/chromatic-tide/initFramework.test.ts`

### Existing files

- `src/lib/games.ts` — stable ID/icon first, then final active catalog row.
- `src/lib/games.test.ts` — ID/icon/registration coverage.
- `src/lib/games/shared/types.ts` — canonical `ChromaticTideGameData` alias + `GameData` union member.
- `src/lib/organisms.test.ts` — final 9 / 9 / 5 depth count.
- `src/lib/achievements.ts`, `src/lib/achievements.test.ts` — four in-game achievements.
- `src/pages/game-board-markup.test.ts` — route/bootstrap/controls/wrapper contract.
- `e2e/games/play-coverage.spec.ts` — real desktop clear/replay/keyboard and mobile control coverage.
- `CLAUDE.md` — game tree/debug handle/catalog count documentation if the current file tracks them.

---

## Task 1: Freeze rules, finite board semantics, and pure scoring

**Files**
- Create: `src/lib/games/chromatic-tide/types.ts`
- Create: `src/lib/games/chromatic-tide/board.ts`
- Create: `src/lib/games/chromatic-tide/board.test.ts`
- Create: `src/lib/games/chromatic-tide/scoring.ts`
- Create: `src/lib/games/chromatic-tide/scoring.test.ts`

**Interfaces**
- Produces `CHROMATIC_TIDE_RULES`, `CHROMATIC_TIDE_PALETTE`, `ChromaticTideColor`, board/state/stats/data types, `ChromaticTideConfig`, and `createChromaticTideConfig()`.
- Produces `createChromaticTideBoard()`, `markInitialTerritory()`, `floodChromaticTideBoard()`, and `countCapturedCells()`.
- Produces `calculateChromaticTideScore()`.
- Task 2 consumes all three modules without redefining constants or traversal.

- [ ] **1.1 Write RED finite-generation and flood tests**

Start `board.test.ts` with exact behavioral examples rather than snapshotting random boards:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
    createChromaticTideBoard,
    floodChromaticTideBoard,
    countCapturedCells,
} from './board'
import {
    CHROMATIC_TIDE_PALETTE,
    createChromaticTideConfig,
    type ChromaticTideBoard,
} from './types'

function cell(
    color: (typeof CHROMATIC_TIDE_PALETTE)[number],
    captured = false
) {
    return { color, captured }
}

it('consumes exactly one RNG sample per cell and repairs all-one-color input without retrying', () => {
    const rng = vi.fn(() => 0)
    const config = createChromaticTideConfig()
    const board = createChromaticTideBoard(config, rng)

    expect(rng).toHaveBeenCalledTimes(config.rows * config.cols)
    expect(board[0][0].color).toBe('teal')
    expect(board[config.rows - 1][config.cols - 1].color).toBe('amber')
    expect(countCapturedCells(board)).toBe(config.rows * config.cols - 1)
})

it('captures orthogonal chains to a fixed point but not diagonals', () => {
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

Add focused cases proving:

- RNG `NaN`, negative values, `1`, and values above `1` still map to a finite palette index;
- initial capture finds the whole top-left component;
- a diagonal same-color cell stays uncaptured until an orthogonal path exists;
- no source cell object/row is mutated by initial marking or flood;
- captured count is exact.

Run:

```bash
bun run test:run -- src/lib/games/chromatic-tide/board.test.ts
```

Expected RED: the modules do not exist.

- [ ] **1.2 Implement the canonical types/config**

Copy the spec's exact rules and palette into `types.ts`:

```ts
import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

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

export interface ChromaticTideConfig extends BaseGameConfig {
    rows: number
    cols: number
    progressPointsPerCell: number
    completionBonus: number
    efficiencyReferenceMoves: number
    efficiencyPointsPerMove: number
    timePointsPerSecond: number
    rng: () => number
}

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

Do not add a palette/config registry or difficulty type.

- [ ] **1.3 Implement finite pure board helpers**

Use existing grid helpers but keep rule semantics local:

```ts
import { createGrid, inBounds } from '@/lib/games/shared/grid'
import {
    CHROMATIC_TIDE_PALETTE,
    type ChromaticTideBoard,
    type ChromaticTideCell,
    type ChromaticTideColor,
    type ChromaticTideConfig,
} from './types'

type Position = { row: number; col: number }

function normalizePaletteIndex(sample: number): number {
    const unit = Number.isFinite(sample)
        ? Math.max(0, Math.min(1 - Number.EPSILON, sample))
        : 0
    return Math.floor(unit * CHROMATIC_TIDE_PALETTE.length)
}

function cloneBoard(board: ChromaticTideBoard): ChromaticTideBoard {
    return board.map(row => row.map(cell => ({ ...cell })))
}

export function countCapturedCells(board: ChromaticTideBoard): number {
    return board.reduce(
        (total, row) =>
            total + row.filter(candidate => candidate.captured).length,
        0
    )
}
```

`createChromaticTideBoard(config, rng = config.rng)` must:

1. build `rows × cols` with exactly one `rng()` call per cell;
2. repair only the all-start-color degenerate case at bottom-right with the next palette entry;
3. return `markInitialTerritory(board)`.

Implement one internal neighbor list:

```ts
const ORTHOGONAL_DELTAS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
] as const
```

`floodChromaticTideBoard()` clones first, recolors all captured cells, seeds a queue with all captured positions, marks matching uncaptured neighbors captured when enqueuing, and returns only after the queue drains.

`markInitialTerritory()` clones, marks only `(0, 0)` captured, then invokes the same fixed-point logic with its start color.

Run the board tests and keep the source pure—no BaseGame imports in `board.ts`.

- [ ] **1.4 Write RED score normalization/completion tests**

Create `scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { calculateChromaticTideScore } from './scoring'
import { createChromaticTideConfig } from './types'

const config = createChromaticTideConfig()
const total = config.rows * config.cols

it('scores only cells gained beyond the free initial territory before completion', () => {
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
})

it('uses the full board baseline plus efficiency and time only on clear', () => {
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
})
```

Also prove negative/non-finite counts normalize safely, capture never exceeds total cells, initial capture never exceeds captured, excess moves produce zero efficiency bonus, and seconds clamp to `0..duration`.

- [ ] **1.5 Implement `calculateChromaticTideScore()`**

Use a small finite-integer helper local to `scoring.ts`; do not add a shared numeric-normalization utility for one scorer.

Canonical shape:

```ts
export interface ChromaticTideScoreInput {
    cleared: boolean
    capturedCells: number
    initialCapturedCells: number
    movesUsed: number
    secondsRemaining: number
}
```

Normalize inputs, calculate `gainedCells`, return progress-only score when `!cleared`, otherwise return full board base + completion + non-negative reference-move bonus + floored remaining-time bonus.

Run:

```bash
bun run test:run -- \
  src/lib/games/chromatic-tide/board.test.ts \
  src/lib/games/chromatic-tide/scoring.test.ts
```

Expected: PASS.

- [ ] **1.6 Commit the pure rules slice**

```bash
git add src/lib/games/chromatic-tide/{types.ts,board.ts,board.test.ts,scoring.ts,scoring.test.ts}
git commit -m "feat(chromatic-tide): add board and scoring rules"
```

---

## Task 2: Stable identity and BaseGame model

**Files**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Create: `src/lib/games/chromatic-tide/ChromaticTideGame.ts`
- Create: `src/lib/games/chromatic-tide/ChromaticTideGame.test.ts`

**Interfaces**
- Produces stable `GameID.CHROMATIC_TIDE = 'chromatic_tide'` and icon `🌈`; the active `GAMES` row waits for Task 4.
- Produces `ChromaticTideGame`, whose only gameplay mutation API is `chooseColor(color): boolean`.
- Task 3 constructs this class directly and renders its `ChromaticTideState`.

- [ ] **2.1 Add the stable ID/icon with focused RED/GREEN tests**

In `games.ts`, add:

```ts
CHROMATIC_TIDE = 'chromatic_tide',
```

and to the exhaustive `GAME_ICONS` record:

```ts
[GameID.CHROMATIC_TIDE]: '🌈',
```

Do **not** add the active `GAMES` row yet. Extend the existing `games.test.ts` ID/icon assertions to pin:

```ts
expect(GameID.CHROMATIC_TIDE).toBe('chromatic_tide')
expect(getGameIcon(GameID.CHROMATIC_TIDE)).toBe('🌈')
expect(getGameUrl(GameID.CHROMATIC_TIDE)).toBe('/chromatic-tide')
```

Run the focused games tests.

- [ ] **2.2 Write RED model action/lifecycle tests**

Use RNG-only fixtures rather than adding a production board-injection seam. A one-move clear can be built from 63 teal samples plus one amber sample:

```ts
function rngForPaletteIndices(indices: number[]): () => number {
    let cursor = 0
    return () => {
        const index = indices[Math.min(cursor++, indices.length - 1)] ?? 0
        return (index + 0.1) / CHROMATIC_TIDE_PALETTE.length
    }
}

const almostClear = [
    ...Array(63).fill(0),
    1,
]
```

Cover:

- initial all-teal component has 63 captured cells and starts at score 0;
- `chooseColor('teal')` returns false and does not increment moves;
- selecting a different absent color returns true, increments one move, and can capture zero cells;
- selecting amber on the 63+1 board captures cell 64, sets `cleared`, scores completion exactly once, and triggers one end path;
- actions after completion are rejected;
- reset returns score/moves/outcome to idle state and consumes a fresh board through normal `createInitialState()`;
- stats/data expose cleared/moves/captured/initial/remaining values.

For timeout without weakening production visibility, define a test-only subclass inside the test file:

```ts
class TestChromaticTideGame extends ChromaticTideGame {
    expireForTest(): void {
        this.handleTimeUp()
    }
}
```

Prove timeout sets `outcome: 'timeout'`, keeps only partial progress score, and reaches the BaseGame end path.

- [ ] **2.3 Implement `ChromaticTideGame` minimally**

Skeleton:

```ts
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import {
    CHROMATIC_TIDE_PALETTE,
    createChromaticTideConfig,
    type ChromaticTideColor,
    type ChromaticTideConfig,
    type ChromaticTideGameData,
    type ChromaticTideState,
    type ChromaticTideStats,
} from './types'
import {
    countCapturedCells,
    createChromaticTideBoard,
    floodChromaticTideBoard,
} from './board'
import { calculateChromaticTideScore } from './scoring'

export class ChromaticTideGame extends BaseGame<
    ChromaticTideState,
    ChromaticTideConfig,
    ChromaticTideStats
> {
    constructor(
        config = createChromaticTideConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.CHROMATIC_TIDE, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): ChromaticTideState {
        const board = createChromaticTideBoard(this.config)
        const capturedCells = countCapturedCells(board)
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            outcome: 'playing',
            board,
            territoryColor: board[0][0].color,
            movesUsed: 0,
            capturedCells,
            initialCapturedCells: capturedCells,
        }
    }
```

`chooseColor()` must runtime-check palette membership with `CHROMATIC_TIDE_PALETTE.includes(...)`, reject current/inactive states, apply one pure flood, increment one move, update state, classify clear, synchronize score, emit state, and call:

```ts
void this.end().catch((error: unknown) =>
    console.error('ChromaticTide end failed', error)
)
```

Use one private `synchronizeScore()` that calculates the canonical target from current state plus `Math.floor(this.getTimerStatus().currentTime)`, then only `addScore(target - state.score, 'tide_progress')` when positive.

Implement:

```ts
update(_deltaTime: number): void {}
render(): void {}
cleanup(): void {}
```

`handleTimeUp()` sets timeout, synchronizes score, emits state, then calls `super.handleTimeUp()`.

`getGameStats()` and `getGameData()` read the final/live timer status rather than copying `state.timeRemaining` into persisted data.

- [ ] **2.4 Run model + identity tests**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/games/chromatic-tide/board.test.ts \
  src/lib/games/chromatic-tide/scoring.test.ts \
  src/lib/games/chromatic-tide/ChromaticTideGame.test.ts
```

Expected: PASS with no network/backend changes.

- [ ] **2.5 Commit the model slice**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/chromatic-tide/ChromaticTideGame.ts src/lib/games/chromatic-tide/ChromaticTideGame.test.ts
git commit -m "feat(chromatic-tide): add game model"
```

---

## Task 3: DOM renderer, controls, initializer, and playable route

**Files**
- Create: `src/lib/games/chromatic-tide/ChromaticTideRenderer.ts`
- Create: `src/lib/games/chromatic-tide/ChromaticTideRenderer.test.ts`
- Create: `src/lib/games/chromatic-tide/initFramework.ts`
- Create: `src/lib/games/chromatic-tide/initFramework.test.ts`
- Create: `src/pages/chromatic-tide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces**
- Produces `ChromaticTideRenderer` and `createChromaticTideRendererConfig()` targeting `#chromatic-tide-board`.
- Produces `ChromaticTideInitResult` with `game`, `renderer`, `getGame`, `getState`, `restart`, and idempotent `cleanup`.
- Page exports the browser debug handle as `window.chromaticTideGame`.
- Task 5 browser coverage consumes that handle and real `[data-tide-color]` controls.

- [ ] **3.1 Write RED renderer semantics tests**

In JSDOM, mount:

```html
<div id="chromatic-tide-board" role="grid"></div>
```

Render a small typed state and assert:

- one cell element per board cell;
- `role="gridcell"`;
- exact `data-row`, `data-col`, `data-color`, `data-captured`;
- cell text is the 1-based palette index, not an empty color-only square;
- aria label includes position, named color, and territory status;
- a second render replaces children and reflects changed capture/color state;
- cleanup empties the board.

- [ ] **3.2 Implement the focused DOM renderer**

Use `DOMRenderer` without board event listeners:

```ts
export class ChromaticTideRenderer extends DOMRenderer {
    protected override renderGame(state: unknown): void {
        if (!isChromaticTideState(state) || !this.container) return

        this.container.style.gridTemplateColumns =
            `repeat(${state.board[0]?.length ?? 0}, 1fr)`
        this.container.style.gridTemplateRows =
            `repeat(${state.board.length}, 1fr)`
        this.clearContainer()

        state.board.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                const node = document.createElement('div')
                const paletteIndex = CHROMATIC_TIDE_PALETTE.indexOf(cell.color)
                node.className = 'chromatic-tide-cell'
                node.setAttribute('role', 'gridcell')
                node.dataset.row = String(rowIndex)
                node.dataset.col = String(colIndex)
                node.dataset.color = cell.color
                node.dataset.captured = String(cell.captured)
                node.textContent = String(paletteIndex + 1)
                node.setAttribute(
                    'aria-label',
                    `Row ${rowIndex + 1}, column ${colIndex + 1}, ${colorLabel(cell.color)}, ${cell.captured ? 'territory' : 'uncaptured'}`
                )
                this.container?.appendChild(node)
            })
        })
    }
}
```

Keep `colorLabel()` local. Do not add board click handlers or renderer state caches.

- [ ] **3.3 Write RED initializer interaction/cleanup tests**

Build the same minimal DOM IDs used by `GamePage` plus:

```html
<div id="chromatic-tide-container">
  <div id="chromatic-tide-board"></div>
  <button data-tide-color="teal">1 Teal</button>
  <button data-tide-color="amber">2 Amber</button>
  <button data-tide-color="magenta">3 Magenta</button>
  <button data-tide-color="ice">4 Ice</button>
  <button data-tide-color="green">5 Green</button>
</div>
```

Cover:

- init renders an idle board and disables all color controls before Start;
- Start hides the shared start button and enables four non-current colors;
- clicking a non-current color increments moves through `chooseColor()`;
- pressing `1`–`5` reaches the same path;
- number keys from `<input>`, `<textarea>`, and editable targets are ignored through `isEditableTarget`;
- current color remains disabled and `aria-pressed="true"`;
- reset/play-again returns idle UI and fresh board;
- end updates final outcome/moves/captured/time and overlay title;
- repeated `cleanup()` is safe and later clicks/keys do not mutate the destroyed game.

Do not add a dependency-injection container. Test deterministic model behavior through `Math.random` mocking only where needed.

- [ ] **3.4 Implement `initFramework.ts` with one input adapter**

Follow Mine Grid's local initializer shape:

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

Required local helpers:

- `listen(target, type, handler)` + tracked listener records;
- `setText(id, value)`;
- `setStartVisible()`;
- `hideOverlay()`;
- `syncHud(state)`;
- `syncColorControls(state)`;
- `resetPresentation()`;
- one `chooseColor(color)` that calls `game.chooseColor(color)`.

The click handler resolves the closest button with `[data-tide-color]`, validates membership in `CHROMATIC_TIDE_PALETTE`, then calls the adapter.

Keyboard handler:

```ts
const keyHandler: EventListener = event => {
    const keyboardEvent = event as KeyboardEvent
    if (isEditableTarget(keyboardEvent.target)) return
    const index = Number(keyboardEvent.key) - 1
    const color = CHROMATIC_TIDE_PALETTE[index]
    if (color) chooseColor(color)
}
```

Enhanced callbacks render/sync on state change, update score/time text, manage Start/control state, and populate final overlay. Forward `end` achievement/challenge notifications exactly as Mine Grid does; do not make a shared helper in this ticket.

Use the existing before-unload guard while `game.getState().isActive`.

No rAF/ticker/interval belongs in this initializer.

- [ ] **3.5 Create the Astro route**

Use `GamePage` with default Start/Reset controls:

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

Inside `slot="game-board"` render a responsive board wrapper plus five stable buttons immediately underneath:

```astro
<div id="chromatic-tide-container" class="w-[min(560px,calc(100vw-2rem))] space-y-4">
  <div
    id="chromatic-tide-board"
    class="grid w-full aspect-square gap-1"
    role="grid"
    aria-label="Chromatic Tide board"
  ></div>

  <div id="chromatic-tide-colors" class="grid grid-cols-5 gap-2" aria-label="Choose territory color">
    <Button data-tide-color="teal" type="button">1 Teal</Button>
    <Button data-tide-color="amber" type="button">2 Amber</Button>
    <Button data-tide-color="magenta" type="button">3 Magenta</Button>
    <Button data-tide-color="ice" type="button">4 Ice</Button>
    <Button data-tide-color="green" type="button">5 Green</Button>
  </div>
</div>
```

Add `Moves` and `Captured` additional stats, How to Play/Scoring cards, and final stats IDs used by the initializer.

Page CSS owns `data-color` background/border tokens and a stronger `[data-captured='true']` treatment. Keep the numeric cell text visible enough that hue is not the only encoding. Use existing Cetus CSS variables/Tailwind; no new design tokens.

After `</GamePage>`:

```astro
<script>
  import { initChromaticTideGameFramework } from '@/lib/games/chromatic-tide/initFramework'

  document.addEventListener('DOMContentLoaded', () => {
    initChromaticTideGameFramework()
      .then(handle => {
        if (handle) {
          ;(window as Window & { chromaticTideGame?: typeof handle }).chromaticTideGame = handle
        }
      })
      .catch(error => console.error('Chromatic Tide failed to initialize', error))
  })
</script>
```

- [ ] **3.6 Extend the page-markup contract instead of creating a new structural test**

Update `src/pages/game-board-markup.test.ts` in the same pattern as recent game routes. Pin at least:

- root bootstrap script occurs after `</GamePage>`;
- `gameId="chromatic-tide"` and `initialTime={90}`;
- board wrapper IDs;
- five `data-tide-color` controls;
- `showPause={false}` / `showEnd={false}`;
- new route participates in any hardcoded GamePage wrapper sweep already in this file.

Run:

```bash
bun run test:run -- \
  src/lib/games/chromatic-tide/ChromaticTideRenderer.test.ts \
  src/lib/games/chromatic-tide/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **3.7 Manual tuning checkpoint before freezing achievement thresholds**

Run:

```bash
bun run dev
```

Play at least five boards with mouse and one narrow/mobile viewport. Record only development observations, not a new telemetry system. Check:

- 8×8 cells and five buttons fit without horizontal scrolling;
- a typical clear is comfortably under 90 seconds but still rewards thinking;
- `efficiencyReferenceMoves: 28`, `24`-move achievement, `18`-move achievement, `30s`/`20s` time thresholds are plausible rather than accidental;
- completion score remains roughly in the intended low-thousands range and partial score feels subordinate to a clear;
- numbered cells and named controls remain understandable without relying only on hue.

If tuning is necessary, change only the numeric constants/achievement thresholds, their direct tests, and the frozen rules/achievement section of the spec. Do not add difficulty presets or a solver in response to tuning.

- [ ] **3.8 Commit the playable route slice**

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

## Task 4: Catalog, canonical game data, organisms, and achievements

**Files**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/organisms.test.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `CLAUDE.md` only where the current document enumerates game modules/debug handles/counts

**Interfaces**
- Makes Chromatic Tide discoverable as the second registered strategy game.
- Makes `ChromaticTideGameData` part of canonical achievement/game-data typing.
- Adds four achievements using the Task 3 tuned thresholds.

- [ ] **4.1 Write RED catalog/organism expectations**

Extend existing tests to assert the full row:

```ts
expect(getGameById(GameID.CHROMATIC_TIDE)).toMatchObject({
    name: 'Chromatic Tide',
    category: 'strategy',
    estimatedDuration: '1-2 minutes',
    difficulty: 'medium',
    isActive: true,
    organism: { shape: 'frond', color: 'teal' },
    depth: 'abyssal',
})
```

Update the organism depth assertion from 9 / 9 / 4 to **9 / 9 / 5**. Do not weaken the existing adjacent shape+color loop.

- [ ] **4.2 Activate the final catalog row**

Append to `GAMES`:

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
    depth: 'abyssal',
},
```

Do not reorder old games solely to balance depth or category counts.

- [ ] **4.3 Add canonical game-data alias/union member**

In `src/lib/games/shared/types.ts`:

```ts
export type ChromaticTideGameData =
    import('../chromatic-tide/types').ChromaticTideGameData
```

and add it to `GameData`. Keep the canonical interface only in `chromatic-tide/types.ts`.

- [ ] **4.4 Write RED achievement checks**

Add tests that retrieve the four IDs and call their `in_game` checks with data immediately below/at each boundary. Required IDs:

```text
chromatic_tide_first_tide
chromatic_tide_current_reader
chromatic_tide_rapid_bloom
chromatic_tide_master_palette
```

Pin that timeout/uncleared data does not earn any clear-only achievement even with favorable moves/time values.

- [ ] **4.5 Add the four typed achievements**

Import/use canonical `ChromaticTideGameData` and append:

```ts
{
    id: 'chromatic_tide_first_tide',
    name: 'First Tide',
    description: 'Clear your first Chromatic Tide board.',
    logo: '🌊',
    gameId: GameID.CHROMATIC_TIDE,
    condition: {
        type: 'in_game',
        check: (gameData: ChromaticTideGameData) => gameData.cleared,
    },
    rarity: AchievementRarity.COMMON,
},
{
    id: 'chromatic_tide_current_reader',
    name: 'Current Reader',
    description: 'Clear Chromatic Tide in 24 moves or fewer.',
    logo: '🧭',
    gameId: GameID.CHROMATIC_TIDE,
    condition: {
        type: 'in_game',
        check: (gameData: ChromaticTideGameData) =>
            gameData.cleared && gameData.movesUsed <= 24,
    },
    rarity: AchievementRarity.RARE,
},
{
    id: 'chromatic_tide_rapid_bloom',
    name: 'Rapid Bloom',
    description: 'Clear Chromatic Tide with at least 30 seconds remaining.',
    logo: '⏱️',
    gameId: GameID.CHROMATIC_TIDE,
    condition: {
        type: 'in_game',
        check: (gameData: ChromaticTideGameData) =>
            gameData.cleared && gameData.secondsRemaining >= 30,
    },
    rarity: AchievementRarity.RARE,
},
{
    id: 'chromatic_tide_master_palette',
    name: 'Master Palette',
    description:
        'Clear Chromatic Tide in 18 moves or fewer with at least 20 seconds remaining.',
    logo: '🏆',
    gameId: GameID.CHROMATIC_TIDE,
    condition: {
        type: 'in_game',
        check: (gameData: ChromaticTideGameData) =>
            gameData.cleared &&
            gameData.movesUsed <= 18 &&
            gameData.secondsRemaining >= 20,
    },
    rarity: AchievementRarity.EPIC,
},
```

If Task 3 legitimately tuned the thresholds, use the tuned values consistently here/tests/spec rather than keeping two versions.

- [ ] **4.6 Update repository guidance only where factual lists changed**

Inspect `CLAUDE.md`; update only existing game/module/debug-handle/count lists that would otherwise become stale. Do not add a second design narrative—the spec and this plan already own HPA-633 decisions.

- [ ] **4.7 Run integration unit/type gates**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts \
  src/lib/games/chromatic-tide/*.test.ts \
  src/pages/game-board-markup.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **4.8 Commit integration**

```bash
git add src/lib/games.ts src/lib/games.test.ts \
  src/lib/games/shared/types.ts src/lib/organisms.test.ts \
  src/lib/achievements.ts src/lib/achievements.test.ts CLAUDE.md
git commit -m "feat(chromatic-tide): integrate catalog and achievements"
```

---

## Task 5: Real browser proof and final repository gates

**Files**
- Modify: `e2e/games/play-coverage.spec.ts`
- Modify prior HPA-633 files only for defects found by browser/repository verification; do not broaden scope.

**Interfaces**
- Proves the real Astro route, controls, BaseGame end/replay lifecycle, and mobile layout.
- No new generic Playwright helper unless an existing helper already naturally supports this route.

- [ ] **5.1 Add pure greedy test helper in the existing play-coverage spec**

Import the production palette/flood/count contracts:

```ts
import {
    CHROMATIC_TIDE_PALETTE,
    type ChromaticTideColor,
    type ChromaticTideState,
} from '../../src/lib/games/chromatic-tide/types'
import {
    countCapturedCells,
    floodChromaticTideBoard,
} from '../../src/lib/games/chromatic-tide/board'
```

Add a test-only selector:

```ts
function bestChromaticTideColor(
    state: Pick<ChromaticTideState, 'board' | 'territoryColor'>
): ChromaticTideColor {
    const candidates = CHROMATIC_TIDE_PALETTE.filter(
        color => color !== state.territoryColor
    )
    let best = candidates[0]
    let bestCaptured = -1
    for (const color of candidates) {
        const captured = countCapturedCells(
            floodChromaticTideBoard(state.board, color)
        )
        if (captured > bestCaptured) {
            best = color
            bestCaptured = captured
        }
    }
    return best
}
```

This is test selection logic over production pure rules, not a production solver.

- [ ] **5.2 Add desktop clear + replay + keyboard coverage**

Test shape:

```ts
test('plays Chromatic Tide through a real clear and replay', async ({ page }) => {
    await page.goto('/chromatic-tide')
    await startGameWhenReady(page)
    await expectVisibleGameSurface(page, '#chromatic-tide-board')

    for (let move = 0; move < 64; move++) {
        const state = await page.evaluate(() => {
            const handle = (window as Window & {
                chromaticTideGame?: { getState: () => ChromaticTideState }
            }).chromaticTideGame
            if (!handle) throw new Error('Chromatic Tide debug handle not ready')
            return handle.getState()
        })
        if (state.outcome === 'cleared') break

        const color = bestChromaticTideColor(state)
        await page.locator(`[data-tide-color="${color}"]`).click()
    }

    await expect(page.locator('#game-over-overlay')).not.toHaveClass(/hidden/)
    await expect(page.locator('#final-outcome')).toHaveText('Cleared')
    await expect(page.locator('#final-captured')).toHaveText('64 / 64')

    await page.locator('#play-again-btn').click()
    await expect(page.locator('#start-btn')).toBeVisible()
    await startGameWhenReady(page)

    const current = await page.evaluate(() =>
        (window as Window & {
            chromaticTideGame: { getState: () => ChromaticTideState }
        }).chromaticTideGame.getState().territoryColor
    )
    const index = CHROMATIC_TIDE_PALETTE.findIndex(color => color !== current)
    await page.keyboard.press(String(index + 1))
    await expect(page.locator('#moves')).toHaveText('1')
})
```

The greedy rule captures at least one boundary cell per accepted move while incomplete, so 64 is a hard sanity bound. If the loop reaches the bound without clearing, treat it as a model/renderer/debug-state defect; do not raise the bound or add a production solver.

- [ ] **5.3 Add focused mobile control/layout proof**

Use the suite's established mobile pattern (or `page.setViewportSize` if that is the local convention). At roughly phone width:

1. visit/start `/chromatic-tide`;
2. assert board width fits viewport and is visibly at least 250px;
3. read current color from debug state;
4. tap one different real color button;
5. assert Moves becomes `1` and the newly current button is disabled/`aria-pressed="true"`;
6. assert no horizontal overflow from the board/control cluster.

Do not duplicate the full clear on mobile.

- [ ] **5.4 Run targeted browser coverage**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Expected: Chromatic Tide desktop and mobile paths pass with existing games unchanged.

- [ ] **5.5 Run the full required repository gates**

```bash
bun run test:run
bun run typecheck
bun run lint
bun run build
```

Then rerun the targeted browser spec once after any fix:

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Fix only HPA-633 regressions. Do not opportunistically refactor shared game infrastructure while closing the ticket.

- [ ] **5.6 Final manual acceptance**

At desktop and narrow width, verify:

- Start → several choices → clear/timeout → overlay → Play Again works;
- current color is visibly selected/disabled;
- keys `1`–`5` work and do not fire while typing in editable UI;
- board numbers/color names keep the game understandable without color alone;
- score never decreases during a live run;
- timeout retains partial progress and does not show a successful clear;
- route appears in the catalog as Strategy / Abyssal and loads from its generated URL.

- [ ] **5.7 Commit browser proof/final fixes**

```bash
git add e2e/games/play-coverage.spec.ts
git add src/lib/games/chromatic-tide src/pages/chromatic-tide src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts src/lib/organisms.test.ts src/lib/achievements.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts CLAUDE.md
git commit -m "test(chromatic-tide): prove browser gameplay"
```

---

## Self-review checklist

Before marking HPA-633 ready for implementation/review, verify this plan against the spec:

- [ ] Every product contract has an owning task: board/rules/scoring (Task 1), model/lifecycle (Task 2), controls/render/page (Task 3), catalog/achievements (Task 4), browser proof (Task 5).
- [ ] There is no move-limit failure, solver, seeded service, difficulty framework, rAF, Pixi, API/DB/auth work, or shared flood/control framework hiding in a task.
- [ ] `chooseColor()` is the single action API used by clicks and keys.
- [ ] Board helpers are pure/non-mutating and generation is fixed-work with exactly 64 RNG samples for v1.
- [ ] Score target is monotonic: incomplete time does not affect score; completion-only bonuses are applied once before end.
- [ ] `ChromaticTideGameData` names exactly match achievement checks: `cleared`, `movesUsed`, `capturedCells`, `initialCapturedCells`, `secondsRemaining`.
- [ ] Catalog identity/depth count matches the spec: `chromatic_tide`, `🌈`, frond/teal, abyssal, 9 / 9 / 5.
- [ ] Page controls expose five named/numbered choices and board cells expose non-color information.
- [ ] Browser clear uses real buttons and production pure board rules, not a hidden production test/solver API.
- [ ] Implementation remains one HPA-633 PR.