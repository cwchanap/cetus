# Chromatic Tide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-633 as a 90-second 8×8 five-color flood-fill strategy minigame with finite random boards, fixed-point territory expansion, move/time efficiency scoring, keyboard/touch controls, DOM rendering, achievements, and the existing Cetus score/progress flow.

**Architecture:** `ChromaticTideGame` extends `BaseGame` and owns only event-driven run state and lifecycle. `board.ts` owns finite board creation, deep-enough local cloning, pure fixed-point flood traversal, and the unit-proven greedy selector used by browser tests; `scoring.ts` owns all arithmetic. `ChromaticTideRenderer` extends `DOMRenderer` and renders non-interactive cells; one initializer owns stable color buttons, keys `1`–`5`, HUD/overlay integration, notification forwarding, and cleanup. BaseGame/GameTimer remain the only timer/save lifecycle and no shared flood/grid/control framework is added.

**Tech Stack:** Astro 5, TypeScript 6, BaseGame/GameTimer/ScoreManager, DOMRenderer, Tailwind 4, Vitest 3, Playwright 1.54, Bun 1.3.

**Spec:** `docs/superpowers/specs/2026-08-25-chromatic-tide-design.md`

## Global Constraints

- One HPA-633 PR from planning through implementation.
- V1 is exactly one 8×8 / five-color / 90-second ruleset. No difficulty selector.
- Copy the frozen numeric rules from the spec into `types.ts` in Task 1. After that, `types.ts` is the production constants authority.
- Board generation consumes exactly `rows * cols` RNG samples and never retries; only an all-one-color board is repaired deterministically by changing bottom-right to the next palette color.
- Use `createGrid` and `inBounds` from `@/lib/games/shared/grid`; keep `cloneBoard()` local because shared `cloneGrid()` would share cell objects.
- Initial territory is the complete orthogonally connected top-left component. Diagonals never connect directly.
- Flood/capture logic stays in `src/lib/games/chromatic-tide/board.ts`; do not reuse Mine Grid's 8-direction reveal, Circuit Hacker's wire connectivity, or add a shared orthogonal-flood helper.
- Every accepted non-current color counts as one move, including a zero-gain choice. The current color is rejected without a move.
- Flood resolution reaches a fixed point before one state change is emitted.
- The greedy selector is a pure immediate-gain helper, not an optimal solver. `board.test.ts` must prove strict progress on incomplete valid boards used as deterministic fixtures.
- No hard move-limit loss, solver/hints, seeded/daily service, campaign, AI, persistence, API, auth, or database work.
- BaseGame/GameTimer own countdown, timeout delivery, stale-run protection, score submission, achievements, reset/start, and final save flow.
- BaseGame generic time bonus is disabled. `scoring.ts` owns progress/completion/move/time arithmetic.
- Incomplete score is gained cells only; completed score uses the full 64-cell base plus completion/move/time bonuses so random starting territory does not reduce the completion baseline.
- Model score synchronization uses the Asteroid Drift-style positive delta to the pure target; do not duplicate arithmetic in the game class.
- Use `isEditableTarget` from `@/lib/games/shared/utils` for number-key handling.
- Use `DOMRenderer`; do not add Pixi, rAF, intervals, workers, or animation infrastructure.
- Board cells are not controls. Stable Astro color buttons and keys `1`–`5` both call `game.chooseColor()`.
- Board/control presentation cannot rely on hue alone: cells expose palette indices and labels; controls show both number and color name.
- Copy the existing organism palette hex values locally into page CSS; do not import `OrganismColor` or add global color tokens.
- Initializer script lives after `</GamePage>`.
- `src/pages/game-board-markup.test.ts` must append `'chromatic-tide'` to its hardcoded `games` wrapper-sweep array in addition to a dedicated Chromatic Tide describe block.
- Catalog identity is `GameID.CHROMATIC_TIDE`, icon `🌈`, organism `{ shape: 'frond', color: 'teal' }`, depth `mid`; final depth counts are 9 / 10 / 4.
- `GameType` already aliases `GameID`; do not touch server DB/API/schema types for the new ID.
- `Button.astro` already forwards native HTML button attributes; do not modify it for `data-tide-color`.
- Do not edit `e2e/games/all-games-navigation.spec.ts`; it derives targets from `GAMES`. Run it in the final gate.
- No changes to BaseGame, GameTimer, ScoreManager, GamePage, DOMRenderer, shared grid semantics, score service, API/DB/auth/schema/packages, or derived navigation test implementation.

---

## File Map

### New production

- `src/lib/games/chromatic-tide/types.ts` — frozen rules, palette, config, cell/board/state/stats/data types.
- `src/lib/games/chromatic-tide/board.ts` — finite random materialization, local deep clone, initial territory, pure fixed-point flood, captured count, immediate-gain greedy selector.
- `src/lib/games/chromatic-tide/scoring.ts` — pure monotonic score target.
- `src/lib/games/chromatic-tide/ChromaticTideGame.ts` — BaseGame model and one `chooseColor()` action; public stats plus protected achievement/save payload.
- `src/lib/games/chromatic-tide/ChromaticTideRenderer.ts` — DOM board cells and semantic metadata.
- `src/lib/games/chromatic-tide/initFramework.ts` — start/reset/replay, color buttons, keyboard, HUD/overlay, notifications, cleanup.
- `src/pages/chromatic-tide/index.astro` — responsive playable route and page-local palette CSS.

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
- `src/lib/organisms.test.ts` — final 9 / 10 / 4 depth count and existing adjacency invariant.
- `src/lib/achievements.ts`, `src/lib/achievements.test.ts` — four in-game achievements.
- `src/pages/game-board-markup.test.ts` — dedicated route/bootstrap/controls assertions plus explicit hardcoded wrapper-array membership.
- `e2e/games/play-coverage.spec.ts` — real desktop clear/replay/keyboard and mobile control coverage using the exported greedy selector.
- `CLAUDE.md` — game tree/debug handle/catalog count documentation only if current sections enumerate them.

---

## Task 1: Freeze rules, finite board semantics, greedy progress, and pure scoring

**Files**
- Create: `src/lib/games/chromatic-tide/types.ts`
- Create: `src/lib/games/chromatic-tide/board.ts`
- Create: `src/lib/games/chromatic-tide/board.test.ts`
- Create: `src/lib/games/chromatic-tide/scoring.ts`
- Create: `src/lib/games/chromatic-tide/scoring.test.ts`

**Interfaces**
- Produces `CHROMATIC_TIDE_RULES`, `CHROMATIC_TIDE_PALETTE`, `ChromaticTideColor`, board/state/stats/data types, `ChromaticTideConfig`, and `createChromaticTideConfig()`.
- Produces `createChromaticTideBoard()`, `markInitialTerritory()`, `floodChromaticTideBoard()`, `countCapturedCells()`, and `selectGreedyChromaticTideColor()`.
- Produces `calculateChromaticTideScore()`.
- Task 2 consumes the pure board/scoring APIs. Task 5 imports `selectGreedyChromaticTideColor()` rather than defining its own selection rule.

- [ ] **1.1 Write RED finite-generation and flood tests**

Create `board.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
    countCapturedCells,
    createChromaticTideBoard,
    floodChromaticTideBoard,
    markInitialTerritory,
    selectGreedyChromaticTideColor,
} from './board'
import {
    CHROMATIC_TIDE_PALETTE,
    createChromaticTideConfig,
    type ChromaticTideBoard,
    type ChromaticTideColor,
} from './types'

function cell(color: ChromaticTideColor, captured = false) {
    return { color, captured }
}

it('consumes exactly one RNG sample per cell and repairs an all-one-color board without retrying', () => {
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

Create `types.ts`:

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

Do not add a difficulty type, palette registry, or organism-type import.

- [ ] **1.3 Implement finite pure board helpers with local deep cloning**

Create `board.ts` using only structural shared helpers:

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

const ORTHOGONAL_DELTAS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
] as const

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

Do not use shared `cloneGrid()` here: Chromatic Tide cells are mutable objects during pure-copy construction, and shallow row copies would retain aliases.

`createChromaticTideBoard(config, rng = config.rng)` must:

1. use `createGrid(config.rows, config.cols, () => ...)`;
2. call `rng()` exactly once from that per-cell factory;
3. map normalized samples into `CHROMATIC_TIDE_PALETTE`;
4. repair only the all-top-left-color case by recoloring bottom-right to the next palette color with no extra RNG;
5. return `markInitialTerritory(board)`.

`floodChromaticTideBoard()` clones first, recolors all captured cells, seeds a queue with all captured positions, marks matching uncaptured orthogonal neighbors captured when enqueuing, and returns only after the queue drains.

`markInitialTerritory()` clones, clears any incoming capture flags defensively for test fixtures, marks `(0, 0)` captured, then uses the same fixed-point rule with the starting color.

Run:

```bash
bun run test:run -- src/lib/games/chromatic-tide/board.test.ts
```

Expected: the finite/flood tests pass.

- [ ] **1.4 Add RED greedy strict-progress fixtures**

Pin the browser-driving invariant at unit level. Use multiple explicit boards, not random property tooling.

Example fixtures:

```ts
const fixtures: ChromaticTideBoard[] = [
    [
        [cell('teal', true), cell('amber'), cell('green')],
        [cell('teal', true), cell('amber'), cell('magenta')],
        [cell('ice'), cell('green'), cell('magenta')],
    ],
    [
        [cell('amber', true), cell('amber', true), cell('ice'), cell('green')],
        [cell('teal'), cell('amber', true), cell('ice'), cell('magenta')],
        [cell('teal'), cell('green'), cell('green'), cell('magenta')],
        [cell('ice'), cell('ice'), cell('teal'), cell('teal')],
    ],
]
```

For each fixture, repeatedly:

```ts
let board = fixture.map(row => row.map(candidate => ({ ...candidate })))
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

Also include one fixture where at least one legal non-current color has zero immediate gain, proving the selector still finds a boundary color with positive gain.

Run the test and expect RED because the selector does not exist yet.

- [ ] **1.5 Implement `selectGreedyChromaticTideColor()`**

Add to `board.ts`:

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

Palette iteration provides deterministic tie-breaking. Do not add look-ahead, BFS over move sequences, or an optimal-move solver.

Run:

```bash
bun run test:run -- src/lib/games/chromatic-tide/board.test.ts
```

Expected: strict-progress fixtures pass.

- [ ] **1.6 Write RED score normalization/completion tests**

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

Also prove:

- negative/non-finite counts normalize safely;
- capture never exceeds total cells;
- initial capture never exceeds captured;
- excess moves produce zero efficiency bonus;
- seconds clamp to `0..duration`;
- unfinished time/move changes do not alter progress score.

- [ ] **1.7 Implement `calculateChromaticTideScore()`**

Create `scoring.ts` with one local finite-integer normalization helper and:

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

Do not add a shared numeric utility for one scorer.

Run:

```bash
bun run test:run -- \
  src/lib/games/chromatic-tide/board.test.ts \
  src/lib/games/chromatic-tide/scoring.test.ts
```

Expected: PASS.

- [ ] **1.8 Commit the pure rules slice**

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
- `getGameStats()` is the public reporting surface; protected `getGameData()` is the BaseGame save/achievement payload hook.
- Task 3 constructs this class directly and renders its `ChromaticTideState`.

- [ ] **2.1 Add the stable ID/icon with focused RED/GREEN tests**

In `games.ts`, add:

```ts
CHROMATIC_TIDE = 'chromatic_tide',
```

and to `GAME_ICONS`:

```ts
[GameID.CHROMATIC_TIDE]: '🌈',
```

Do **not** add the active `GAMES` row yet. Extend `games.test.ts`:

```ts
expect(GameID.CHROMATIC_TIDE).toBe('chromatic_tide')
expect(getGameIcon(GameID.CHROMATIC_TIDE)).toBe('🌈')
expect(getGameUrl(GameID.CHROMATIC_TIDE)).toBe('/chromatic-tide')
```

Do not touch `src/lib/server/db/types.ts`; `GameType` already follows `GameID`.

- [ ] **2.2 Write RED model action/lifecycle tests**

Use RNG-only fixtures rather than adding a production board-injection seam:

```ts
function rngForPaletteIndices(indices: number[]): () => number {
    let cursor = 0
    return () => {
        const index = indices[Math.min(cursor++, indices.length - 1)] ?? 0
        return (index + 0.1) / CHROMATIC_TIDE_PALETTE.length
    }
}

const almostClear = [...Array(63).fill(0), 1]
```

Cover:

- initial all-teal component has 63 captured cells and starts at score 0;
- `chooseColor('teal')` returns false and does not increment moves;
- selecting a different absent color returns true, increments one move, and can capture zero cells;
- selecting amber on the 63+1 board captures cell 64, sets `cleared`, scores completion exactly once, and triggers one end path;
- actions after completion are rejected;
- reset returns score/moves/outcome to idle state and consumes a fresh board through normal `createInitialState()`;
- `getGameStats()` exposes overlay/reporting fields;
- the protected achievement payload contains `cleared`, `movesUsed`, `capturedCells`, `initialCapturedCells`, `secondsRemaining` rather than `{}`.

For timeout, define a test-only subclass:

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

Use the same pattern as Mine Grid's tests: expose the protected hook only from the test subclass/cast. Prove timeout sets `outcome: 'timeout'`, keeps only partial progress score, and reaches the BaseGame end path.

- [ ] **2.3 Implement `ChromaticTideGame` minimally**

Create the class:

```ts
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import {
    CHROMATIC_TIDE_PALETTE,
    createChromaticTideConfig,
    type ChromaticTideColor,
    type ChromaticTideConfig,
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

`chooseColor()` must:

1. reject inactive/paused/game-over/non-playing state;
2. runtime-check palette membership with `CHROMATIC_TIDE_PALETTE.includes(...)`;
3. reject the current color without moving;
4. apply one pure flood;
5. increment moves exactly once;
6. update board/current/captured fields;
7. set `outcome = 'cleared'` when captured equals `rows * cols`;
8. synchronize score;
9. emit one state change;
10. if cleared, call:

```ts
void this.end().catch((error: unknown) =>
    console.error('ChromaticTide end failed', error)
)
```

Use one private `synchronizeScore()`:

```ts
private synchronizeScore(): void {
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
    if (delta > 0) {
        this.addScore(delta, 'tide_progress')
    }
}
```

Implement event-driven stubs:

```ts
update(_deltaTime: number): void {}
render(): void {}
cleanup(): void {}
```

`handleTimeUp()` sets timeout, synchronizes score, emits state, then calls `super.handleTimeUp()`.

- [ ] **2.4 Implement public stats and the protected BaseGame payload hook explicitly**

Do **not** add a second public `getGameData()`-style API. Implement exactly:

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

`BaseGame.end()` calls this protected hook during score saving/achievement evaluation, so the test must prove it contains the canonical data fields.

- [ ] **2.5 Run model + identity tests**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/games/chromatic-tide/board.test.ts \
  src/lib/games/chromatic-tide/scoring.test.ts \
  src/lib/games/chromatic-tide/ChromaticTideGame.test.ts
```

Expected: PASS with no network/backend changes.

- [ ] **2.6 Commit the model slice**

```bash
git add src/lib/games.ts src/lib/games.test.ts \
  src/lib/games/chromatic-tide/ChromaticTideGame.ts \
  src/lib/games/chromatic-tide/ChromaticTideGame.test.ts
git commit -m "feat(chromatic-tide): add game model"
```

---

## Task 3: DOM renderer, controls, initializer, playable route, and wrapper contract

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
- Page exports `window.chromaticTideGame`.
- Task 5 consumes that debug handle and real `[data-tide-color]` controls.

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
        if (!isChromaticTideState(state) || !this.container) {
            return
        }

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

Keep `isChromaticTideState()` and `colorLabel()` local. Do not add board click handlers, renderer state caches, or shared renderer changes.

- [ ] **3.3 Write RED initializer interaction/cleanup tests**

Build the minimal GamePage IDs plus:

```html
<div id="chromatic-tide-container">
  <div id="chromatic-tide-board"></div>
  <div id="chromatic-tide-colors">
    <button data-tide-color="teal">1 Teal</button>
    <button data-tide-color="amber">2 Amber</button>
    <button data-tide-color="magenta">3 Magenta</button>
    <button data-tide-color="ice">4 Ice</button>
    <button data-tide-color="green">5 Green</button>
  </div>
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

The click handler resolves the closest `[data-tide-color]` button, validates membership in `CHROMATIC_TIDE_PALETTE`, then calls the adapter.

Keyboard handler:

```ts
const keyHandler: EventListener = event => {
    const keyboardEvent = event as KeyboardEvent
    if (isEditableTarget(keyboardEvent.target)) {
        return
    }
    const index = Number(keyboardEvent.key) - 1
    const color = CHROMATIC_TIDE_PALETTE[index]
    if (color) {
        chooseColor(color)
    }
}
```

Enhanced callbacks render/sync on state change, update score/time text, manage Start/control state, and populate final overlay. Forward `end` achievement/challenge notifications exactly as Mine Grid does; do not extract a shared helper.

Use the existing before-unload guard while `game.getState().isActive`.

No rAF/ticker/interval belongs in this initializer.

- [ ] **3.5 Create the Astro route with phone-safe controls and local palette colors**

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

Inside `slot="game-board"`:

```astro
<div
  id="chromatic-tide-container"
  class="w-[min(560px,calc(100vw-2rem))] space-y-4 overflow-x-hidden"
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

The responsive two-column phone layout avoids forcing five named labels into one narrow row; `sm:grid-cols-5` restores the compact row on wider screens. The mobile E2E still asserts actual overflow rather than trusting classes.

Add `Moves` and `Captured` stats, How to Play/Scoring cards, and final stats IDs used by the initializer.

Copy the existing organism palette hexes locally into page CSS:

```css
.chromatic-tide-cell[data-color='teal'],
[data-tide-color='teal'] { --tide-color: #1fe3c0; }
.chromatic-tide-cell[data-color='amber'],
[data-tide-color='amber'] { --tide-color: #f2b33d; }
.chromatic-tide-cell[data-color='magenta'],
[data-tide-color='magenta'] { --tide-color: #ff3d8a; }
.chromatic-tide-cell[data-color='ice'],
[data-tide-color='ice'] { --tide-color: #6fe3ff; }
.chromatic-tide-cell[data-color='green'],
[data-tide-color='green'] { --tide-color: #5dff9f; }
```

Use `--tide-color` for background/border accents while preserving visible numeric cell text and named button text. Do not import organism types or add CSS tokens globally.

After `</GamePage>`:

```astro
<script>
  import { initChromaticTideGameFramework } from '@/lib/games/chromatic-tide/initFramework'

  document.addEventListener('DOMContentLoaded', () => {
    initChromaticTideGameFramework()
      .then(handle => {
        if (handle) {
          ;(window as Window & {
            chromaticTideGame?: typeof handle
          }).chromaticTideGame = handle
        }
      })
      .catch(error =>
        console.error('Chromatic Tide failed to initialize', error)
      )
  })
</script>
```

- [ ] **3.6 Extend both parts of the hardcoded page-markup contract**

First append the route to the existing top-level `games` array in `src/pages/game-board-markup.test.ts`:

```ts
const games = [
    // existing entries...
    'asteroid-drift',
    'chromatic-tide',
]
```

This makes the generic `Game pages use GamePage wrapper` loop load `src/pages/chromatic-tide/index.astro`. Do not only add a dedicated describe block.

Then add a dedicated Chromatic Tide markup block that pins:

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

Run:

```bash
bun run test:run -- \
  src/lib/games/chromatic-tide/ChromaticTideRenderer.test.ts \
  src/lib/games/chromatic-tide/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **3.7 Manual tuning/layout checkpoint before freezing achievement thresholds**

Run:

```bash
bun run dev
```

Play at least five boards with mouse and one narrow/mobile viewport. Record development observations only; do not add telemetry.

Check:

- 8×8 cells fit without horizontal scrolling;
- the **board plus five named controls** fits without horizontal overflow at phone width;
- a typical clear is comfortably under 90 seconds but still rewards thinking;
- `efficiencyReferenceMoves: 28`, `24`-move achievement, `18`-move achievement, `30s`/`20s` time thresholds are plausible;
- completion score stays in the intended low-thousands range and partial score remains subordinate to a clear;
- numbered cells and named controls remain understandable without relying only on hue.

If tuning is necessary, change only numeric rules/achievement thresholds, direct tests, and the frozen rules/achievement section of the spec. Do not add difficulty presets or a solver.

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

## Task 4: Catalog, canonical game data, Mid-water identity, and achievements

**Files**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/organisms.test.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `CLAUDE.md` only where current factual lists require it

**Interfaces**
- Makes Chromatic Tide discoverable as the second registered strategy game.
- Makes `ChromaticTideGameData` part of canonical achievement/game-data typing.
- Registers Mid-water / frond / teal and updates the exact depth count to 9 / 10 / 4.
- Adds four achievements using Task 3's tuned thresholds.

- [ ] **4.1 Write RED catalog/organism expectations**

Extend existing tests:

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

Update `src/lib/organisms.test.ts` from:

```ts
expect(getGamesByDepth('shallow')).toHaveLength(9)
expect(getGamesByDepth('mid')).toHaveLength(9)
expect(getGamesByDepth('abyssal')).toHaveLength(4)
```

to:

```ts
expect(getGamesByDepth('shallow')).toHaveLength(9)
expect(getGamesByDepth('mid')).toHaveLength(10)
expect(getGamesByDepth('abyssal')).toHaveLength(4)
```

Do not weaken the existing adjacent shape+color loop. The depth-ordered Mid-water tail becomes Gravity Flip (`spiral`/`magenta`) → Chromatic Tide (`frond`/`teal`), which remains distinct.

- [ ] **4.2 Activate the final catalog row as Mid-water**

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
    depth: 'mid',
},
```

Do not select Abyssal merely to balance counts. Mid-water's existing product note (“Focused sessions. A few minutes in.”) fits this 90-second strategy game; Abyssal is for “Long and absorbing” sessions.

- [ ] **4.3 Add canonical game-data alias/union member**

In `src/lib/games/shared/types.ts`:

```ts
export type ChromaticTideGameData =
    import('../chromatic-tide/types').ChromaticTideGameData
```

Add it to `GameData`. Keep the canonical interface only in `chromatic-tide/types.ts`.

- [ ] **4.4 Write RED achievement checks**

Add tests that retrieve the four IDs and call their `in_game` checks with data immediately below/at each boundary:

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

If Task 3 legitimately tuned thresholds, use the tuned values consistently here/tests/spec rather than keeping two versions.

- [ ] **4.6 Update repository guidance only where factual lists changed**

Inspect `CLAUDE.md`; update only existing game/module/debug-handle/count lists that would otherwise become stale. Do not add a second design narrative.

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

## Task 5: Real browser proof, homepage navigation, and final repository gates

**Files**
- Modify: `e2e/games/play-coverage.spec.ts`
- Do **not** modify: `e2e/games/all-games-navigation.spec.ts`
- Modify prior HPA-633 files only for defects found by browser/repository verification; do not broaden scope.

**Interfaces**
- Proves the real Astro route, controls, BaseGame end/replay lifecycle, and mobile layout.
- Reuses the Task 1 exported greedy selector whose strict-progress property is already unit-proven.
- Proves the actual homepage specimen navigation through the existing `GAMES`-derived navigation spec.

- [ ] **5.1 Import the unit-proven greedy selector; do not redefine it in Playwright**

In `e2e/games/play-coverage.spec.ts`:

```ts
import {
    CHROMATIC_TIDE_PALETTE,
    type ChromaticTideState,
} from '../../src/lib/games/chromatic-tide/types'
import { selectGreedyChromaticTideColor } from '../../src/lib/games/chromatic-tide/board'
```

No second `bestChromaticTideColor()` implementation belongs in E2E. The browser spec is only a caller of the already-unit-proven pure rule.

- [ ] **5.2 Add desktop clear + replay + keyboard coverage**

```ts
test('plays Chromatic Tide through a real clear and replay', async ({ page }) => {
    await page.goto('/chromatic-tide')
    await startGameWhenReady(page)
    await expectVisibleGameSurface(page, '#chromatic-tide-board')

    const initialCaptured = await page.evaluate(() => {
        const handle = (window as Window & {
            chromaticTideGame?: { getState: () => ChromaticTideState }
        }).chromaticTideGame
        if (!handle) {
            throw new Error('Chromatic Tide debug handle not ready')
        }
        return handle.getState().capturedCells
    })
    const maxMoves = 64 - initialCaptured

    for (let move = 0; move < maxMoves; move++) {
        const state = await page.evaluate(() => {
            const handle = (window as Window & {
                chromaticTideGame?: { getState: () => ChromaticTideState }
            }).chromaticTideGame
            if (!handle) {
                throw new Error('Chromatic Tide debug handle not ready')
            }
            return handle.getState()
        })
        if (state.outcome === 'cleared') {
            break
        }

        const color = selectGreedyChromaticTideColor(
            state.board,
            state.territoryColor
        )
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

Do not raise the bound if it fails; the Task 1 strict-progress test says a valid model must clear within the initially uncaptured-cell count.

- [ ] **5.3 Add focused mobile control/layout proof**

Use the suite's established phone-sized viewport. At roughly 375px width:

1. visit/start `/chromatic-tide`;
2. assert the board is visible and at least 250px wide;
3. read current color from debug state;
4. tap one different real color button;
5. assert Moves becomes `1` and the newly current button is disabled/`aria-pressed="true"`;
6. compute the board/control cluster bounding box and document `scrollWidth <= clientWidth` / no page horizontal overflow.

Example overflow assertion:

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

Do not hide overflow merely to satisfy the assertion; fix the responsive control layout if this fails.

- [ ] **5.4 Run targeted Chromatic Tide/browser coverage**

```bash
bun run test:run -- src/lib/games/chromatic-tide/board.test.ts
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Expected: the fast unit progress proof and real desktop/mobile route pass.

- [ ] **5.5 Run all final repository and catalog-navigation gates**

Run the complete required set:

```bash
bun run test:run
bun run typecheck
bun run lint
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

The last command is load-bearing after Task 4: `all-games-navigation.spec.ts` derives `NAV_TARGETS` from active `GAMES`, visits the actual homepage specimen card, and will automatically include Chromatic Tide. Do not edit the spec.

Fix only HPA-633 regressions. Do not opportunistically refactor shared game infrastructure while closing the ticket.

- [ ] **5.6 Final manual acceptance**

At desktop and narrow width, verify:

- Start → several choices → clear/timeout → overlay → Play Again works;
- current color is visibly selected/disabled;
- keys `1`–`5` work and do not fire while typing in editable UI;
- board numbers/color names keep the game understandable without color alone;
- five named color controls do not overflow the phone viewport;
- score never decreases during a live run;
- timeout retains partial progress and does not show a successful clear;
- route appears in the catalog as Strategy / Mid-water and loads from its generated URL/homepage specimen.

- [ ] **5.7 Commit browser proof/final fixes**

```bash
git add e2e/games/play-coverage.spec.ts
git add src/lib/games/chromatic-tide src/pages/chromatic-tide \
  src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts \
  src/lib/organisms.test.ts src/lib/achievements.ts \
  src/lib/achievements.test.ts src/pages/game-board-markup.test.ts CLAUDE.md
git commit -m "test(chromatic-tide): prove browser gameplay"
```

Do not add `e2e/games/all-games-navigation.spec.ts` because HPA-633 only runs it; it does not change it.

---

## Risks and Mitigations

### Greedy flood invariant regresses

**Failure mode:** The browser clear loop stalls or burns a slow E2E run because capture/recolor semantics stopped guaranteeing progress.

**Plan:** Task 1 owns explicit deterministic unit fixtures. Every incomplete fixture must have a non-current choice that increases capture; `selectGreedyChromaticTideColor()` must strictly increase capture and repeated choices must clear within the initially uncaptured-cell count. Task 5 imports that same selector.

### Catalog row does not navigate from the homepage

**Failure mode:** Direct `/chromatic-tide` Playwright passes, but the actual specimen card or generated URL path is broken after registration.

**Plan:** Task 5 runs `e2e/games/all-games-navigation.spec.ts` unchanged. Because its targets derive from active `GAMES`, the new row becomes part of the existing homepage integration automatically.

### Five named controls overflow a phone

**Failure mode:** `1 Teal`-style labels force horizontal overflow even though the 8×8 board itself is responsive.

**Plan:** Task 3 uses a two-column phone grid and five columns on wider screens. Task 3's manual checkpoint and Task 5's browser assertion both fail on actual horizontal overflow.

---

## Self-review checklist

Before implementation/review completion, verify:

- [ ] Every product contract has an owning task: board/rules/scoring/greedy proof (Task 1), model/lifecycle/save payload (Task 2), controls/render/page/wrapper sweep (Task 3), catalog/achievements (Task 4), browser/homepage proof (Task 5).
- [ ] There is no move-limit failure, optimal solver, seeded service, difficulty framework, rAF, Pixi, API/DB/auth work, or shared flood/control framework hiding in a task.
- [ ] `chooseColor()` is the single player-action API used by clicks and keys.
- [ ] Board helpers are pure/non-mutating; local `cloneBoard()` copies cell objects; generation is fixed-work with exactly 64 RNG samples for v1.
- [ ] Greedy strict progress is unit-proven over multiple fixtures before Playwright uses the selector.
- [ ] Score target is monotonic: incomplete time does not affect score; completion-only bonuses are applied once before end.
- [ ] `getGameStats()` is public reporting and `protected override getGameData()` is the BaseGame achievement/save hook.
- [ ] `ChromaticTideGameData` names exactly match achievement checks: `cleared`, `movesUsed`, `capturedCells`, `initialCapturedCells`, `secondsRemaining`.
- [ ] `game-board-markup.test.ts` explicitly appends `'chromatic-tide'` to the hardcoded `games` array and has dedicated markup assertions.
- [ ] Page controls expose five named/numbered choices, board cells expose non-color information, and local palette CSS reuses existing organism hexes without new tokens.
- [ ] Catalog identity matches the spec: `chromatic_tide`, `🌈`, Strategy, Mid-water, frond/teal, depth counts 9 / 10 / 4.
- [ ] Browser clear uses real buttons plus the production pure greedy selector, not a hidden production test/optimal solver API.
- [ ] Final gates run both `play-coverage.spec.ts` and unchanged `all-games-navigation.spec.ts`.
- [ ] Implementation remains one HPA-633 PR.
