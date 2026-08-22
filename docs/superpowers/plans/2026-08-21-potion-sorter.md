# Potion Sorter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Potion Sorter, a 3–8 minute authored liquid-sorting puzzle with Easy/Medium/Hard boards, standard top-run pours, multi-step Undo, move/time scoring, accessible desktop/mobile controls, achievements, and the existing Cetus score/leaderboard flow.

**Architecture:** `PotionSorterGame` extends `BaseGame` and owns selection, legal-pour application, cumulative move accounting, private Undo snapshots, difficulty switching, solve/timeout lifecycle, and score submission. `puzzle.ts` and `scoring.ts` keep rules pure; `PotionSorterRenderer` extends `DOMRenderer` and renders a small semantic button grid into Astro-owned `#potion-sorter-board`. Three authored presets are source-controlled and validated by concrete test-only solution paths, so no procedural generator or production solver is added.

**Tech Stack:** Astro 5 + TypeScript, Tailwind CSS 4, existing BaseGame/DOMRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-21-potion-sorter-design.md`

## Global Constraints

- Package manager: **Bun `1.3.1`**.
- One HPA-72 implementation PR; game logic, page, registry, achievements, docs, and browser coverage land together.
- ID **`potion_sorter`**, route **`/potion-sorter`**, title **`Potion Sorter`**, icon **`🧪`**.
- Fixed tube capacity: **4**.
- Easy: **3 colors / 5 tubes / 180s / move target 10 / completion base 1,000**.
- Medium: **5 colors / 7 tubes / 300s / move target 16 / completion base 2,000**.
- Hard: **7 colors / 9 tubes / 480s / move target 22 / completion base 3,000**.
- Every preset has exactly two empty tubes and exactly four layers of each active color.
- Preset arrays are ordered **bottom to top**.
- Standard pour: destination must be empty or top-match; move the maximum contiguous source top run that fits.
- Invalid actions never increment `movesMade` and never create Undo history.
- `movesMade` is cumulative across Undo and never decrements.
- `undo()` pops one pre-pour snapshot, clears selection, increments `undosUsed`, and can repeat until history is empty.
- Score only solved puzzles:

```text
moveBonus = max(0, moveTarget * 2 - movesMade) * 40
speedBonus = floor(max(0, remainingSeconds)) * 5
finalScore = completionBase + moveBonus + speedBonus
```

- Timeout score is **0**.
- BaseGame scoring uses `timeBonus: false`; `calculatePotionSorterScore()` is the only production scoring implementation.
- Use existing protected `BaseGame.setDuration()` for idle difficulty changes; **do not modify BaseGame/GameTimer**.
- Use `BaseGame + DOMRenderer`; no PixiJS, drag physics, audio, procedural generation, production solver, hints, generic puzzle framework, DB/schema/API changes, or new score path.
- Renderer liquid layers must use glyphs as well as color: cyan `▲`, magenta `●`, amber `◆`, lime `✦`, violet `⬢`, coral `■`, azure `✚`.
- Tube activation uses native `<button>` click/Enter/Space; no document-level gameplay keyboard handler.
- Hard mode may wrap nine tubes over multiple visual rows on narrow screens; logical order remains tube index order.
- Create `/potion-sorter` in the same task that activates `GameID.POTION_SORTER`, preserving the route/registry invariant.
- `getGameUrl()` stays unchanged.
- `src/pages/index.astro` stays source-unchanged because home count/cards derive from `GAMES`.
- `e2e/games/all-games-navigation.spec.ts` stays source-unchanged and derives coverage from `GAMES`.
- Reuse BaseGame's run guard for async score submissions; no game-local stale token.
- Edit `CLAUDE.md`, not its `AGENTS.md` symlink.
- Codecov project/patch targets remain the repository's existing **90%** configuration.

## Load-Bearing Risks

- **Preset mutation:** clone authored tubes into state and before Undo; no runtime path may mutate `POTION_SORTER_PRESETS`.
- **Vacuous authored-content tests:** every preset gets a concrete legal solution replay, not only shape/count assertions.
- **Undo score gaming:** cumulative moves remain unchanged by Undo; re-performing a pour counts another move.
- **Nested DOM focus loss:** renderer rebuilds tube buttons but restores focus by `data-tube-index`.
- **Color-only state:** every liquid layer renders a distinct glyph and every tube has an authoritative text `aria-label`.
- **Timeout/save race:** reuse BaseGame lifecycle/run guard; no second network guard.

---

### Task 1: Define contracts and freeze the three authored puzzles

**Files:**
- Create: `src/lib/games/potion-sorter/types.ts`
- Create: `src/lib/games/potion-sorter/levels.ts`
- Create: `src/lib/games/potion-sorter/levels.test.ts`

**Interfaces:**
- Produces: `PotionColor`, `PotionTube`, `PotionSorterDifficulty`, `PotionSorterResult`, `PotionSorterActionResult`, `PotionSorterPreset`, `PotionSorterConfig`, state/stats/game-data contracts, `POTION_TUBE_CAPACITY`, and `POTION_SORTER_PRESETS`.
- Later tasks consume presets by difficulty and must clone `initialTubes` before mutation.

- [ ] **Step 1: Create the closed contracts**

```ts
// src/lib/games/potion-sorter/types.ts
import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

export const POTION_TUBE_CAPACITY = 4 as const

export type PotionColor =
    | 'cyan'
    | 'magenta'
    | 'amber'
    | 'lime'
    | 'violet'
    | 'coral'
    | 'azure'

export type PotionTube = PotionColor[]
export type PotionSorterDifficulty = 'easy' | 'medium' | 'hard'
export type PotionSorterResult = 'playing' | 'solved' | 'timeout'
export type PotionSorterActionResult =
    | 'selected'
    | 'deselected'
    | 'poured'
    | 'invalid'

export interface PotionSorterPreset {
    difficulty: PotionSorterDifficulty
    duration: number
    capacity: typeof POTION_TUBE_CAPACITY
    moveTarget: number
    completionBase: number
    initialTubes: PotionTube[]
}

export interface PotionSorterConfig extends BaseGameConfig {
    preset: PotionSorterPreset
}

export interface PotionSorterState extends BaseGameState {
    difficulty: PotionSorterDifficulty
    tubes: PotionTube[]
    selectedTubeIndex: number | null
    movesMade: number
    undosUsed: number
    result: PotionSorterResult
}

export interface PotionSorterStats extends BaseGameStats {
    difficulty: PotionSorterDifficulty
    solved: boolean
    result: PotionSorterResult
    movesMade: number
    undosUsed: number
}

export interface PotionSorterGameData {
    difficulty: PotionSorterDifficulty
    solved: boolean
    movesMade: number
    undosUsed: number
    elapsedSeconds: number
}
```

- [ ] **Step 2: Add the exact authored presets**

```ts
// src/lib/games/potion-sorter/levels.ts
import {
    POTION_TUBE_CAPACITY,
    type PotionSorterPreset,
    type PotionSorterDifficulty,
} from './types'

export const POTION_SORTER_PRESETS: Record<
    PotionSorterDifficulty,
    PotionSorterPreset
> = {
    easy: {
        difficulty: 'easy',
        duration: 180,
        capacity: POTION_TUBE_CAPACITY,
        moveTarget: 10,
        completionBase: 1_000,
        initialTubes: [
            ['cyan', 'magenta', 'amber', 'cyan'],
            ['magenta', 'amber', 'cyan', 'magenta'],
            ['amber', 'cyan', 'magenta', 'amber'],
            [],
            [],
        ],
    },
    medium: {
        difficulty: 'medium',
        duration: 300,
        capacity: POTION_TUBE_CAPACITY,
        moveTarget: 16,
        completionBase: 2_000,
        initialTubes: [
            ['cyan', 'magenta', 'amber', 'lime'],
            ['magenta', 'amber', 'lime', 'violet'],
            ['amber', 'lime', 'violet', 'cyan'],
            ['lime', 'violet', 'cyan', 'magenta'],
            ['violet', 'cyan', 'magenta', 'amber'],
            [],
            [],
        ],
    },
    hard: {
        difficulty: 'hard',
        duration: 480,
        capacity: POTION_TUBE_CAPACITY,
        moveTarget: 22,
        completionBase: 3_000,
        initialTubes: [
            ['cyan', 'magenta', 'amber', 'lime'],
            ['magenta', 'amber', 'lime', 'violet'],
            ['amber', 'lime', 'violet', 'coral'],
            ['lime', 'violet', 'coral', 'azure'],
            ['violet', 'coral', 'azure', 'cyan'],
            ['coral', 'azure', 'cyan', 'magenta'],
            ['azure', 'cyan', 'magenta', 'amber'],
            [],
            [],
        ],
    },
}
```

- [ ] **Step 3: Write RED authored-content tests using concrete solution paths**

Create `levels.test.ts` with this test-only solution table:

```ts
const SOLUTIONS = {
    easy: [
        [0, 3], [2, 0], [1, 2], [1, 3], [0, 1],
        [2, 0], [2, 3], [1, 2], [0, 1], [0, 3],
    ],
    medium: [
        [0, 5], [4, 0], [3, 4], [2, 3], [1, 2], [1, 5],
        [0, 1], [4, 0], [3, 4], [2, 3], [2, 5], [1, 2],
        [0, 1], [4, 0], [3, 4], [3, 5],
    ],
    hard: [
        [0, 7], [6, 0], [5, 6], [4, 5], [3, 4], [2, 3],
        [1, 2], [1, 7], [0, 1], [6, 0], [5, 6], [4, 5],
        [3, 4], [2, 3], [2, 7], [1, 2], [0, 1], [6, 0],
        [5, 6], [4, 5], [3, 4], [3, 7],
    ],
} satisfies Record<PotionSorterDifficulty, Array<[number, number]>>
```

Tests must assert for each preset:

```ts
expect(preset.initialTubes.filter(tube => tube.length === 0)).toHaveLength(2)
expect(preset.initialTubes.every(tube => tube.length <= preset.capacity)).toBe(true)
```

Count all liquids and assert each active color appears exactly `capacity` times. Then replay every `[source, destination]` through `pourPotion()` from Task 2 and assert the final state satisfies `isPotionSorterSolved()` and the path length equals `preset.moveTarget`.

The import of missing `./puzzle` is the intentional RED state for this task boundary.

Run:

```bash
bun run test:run src/lib/games/potion-sorter/levels.test.ts
```

Expected: FAIL because `puzzle.ts` is not implemented yet.

- [ ] **Step 4: Commit the contracts/presets even though the cross-task solution test remains RED**

Commit only `types.ts` and `levels.ts` now; keep `levels.test.ts` uncommitted until Task 2 turns it green, so every commit remains green/type-checkable.

```bash
git add src/lib/games/potion-sorter/types.ts src/lib/games/potion-sorter/levels.ts
git commit -m "feat(potion-sorter): add authored puzzle presets"
```

---

### Task 2: Implement pure pour rules, solved detection, and scoring

**Files:**
- Create: `src/lib/games/potion-sorter/puzzle.ts`
- Create: `src/lib/games/potion-sorter/puzzle.test.ts`
- Create: `src/lib/games/potion-sorter/scoring.ts`
- Create: `src/lib/games/potion-sorter/scoring.test.ts`
- Complete: `src/lib/games/potion-sorter/levels.test.ts`

**Interfaces:**
- Produces `getTopRunLength()`, `pourPotion()`, `isPotionSorterSolved()`, and `calculatePotionSorterScore()`.
- `pourPotion()` is immutable and returns `{ tubes, layersMoved } | null`.

- [ ] **Step 1: Write RED puzzle-rule tests**

Cover these exact cases:

```ts
expect(getTopRunLength(['cyan', 'magenta', 'magenta'])).toBe(2)
expect(getTopRunLength([])).toBe(0)

const original = [['cyan', 'magenta', 'magenta'], ['magenta'], []] as PotionTube[]
const poured = pourPotion(original, 0, 1)
expect(poured?.layersMoved).toBe(2)
expect(poured?.tubes).toEqual([['cyan'], ['magenta', 'magenta', 'magenta'], []])
expect(original).toEqual([['cyan', 'magenta', 'magenta'], ['magenta'], []])

expect(pourPotion([['cyan'], ['magenta']], 0, 1)).toBeNull()
expect(pourPotion([['cyan'], []], 0, 0)).toBeNull()
expect(pourPotion([[], ['cyan']], 0, 1)).toBeNull()
expect(pourPotion([['cyan'], ['cyan', 'cyan', 'cyan', 'cyan']], 0, 1)).toBeNull()
```

Add a partial-capacity case where a two-layer top run can move only one layer into a three-full matching destination.

Solved checks:

```ts
expect(isPotionSorterSolved([
    ['cyan', 'cyan', 'cyan', 'cyan'],
    ['magenta', 'magenta', 'magenta', 'magenta'],
    [],
])).toBe(true)

expect(isPotionSorterSolved([['cyan'], []])).toBe(false)
expect(isPotionSorterSolved([])).toBe(false)
```

Run and confirm RED.

- [ ] **Step 2: Implement the minimal immutable puzzle helpers**

```ts
// src/lib/games/potion-sorter/puzzle.ts
import { POTION_TUBE_CAPACITY, type PotionTube } from './types'

export function getTopRunLength(tube: PotionTube): number {
    if (tube.length === 0) return 0
    const top = tube[tube.length - 1]
    let count = 0
    for (let i = tube.length - 1; i >= 0 && tube[i] === top; i--) count++
    return count
}

export function pourPotion(
    tubes: PotionTube[],
    sourceIndex: number,
    destinationIndex: number,
    capacity = POTION_TUBE_CAPACITY
): { tubes: PotionTube[]; layersMoved: number } | null {
    if (
        !Number.isInteger(sourceIndex) ||
        !Number.isInteger(destinationIndex) ||
        sourceIndex === destinationIndex ||
        sourceIndex < 0 ||
        destinationIndex < 0 ||
        sourceIndex >= tubes.length ||
        destinationIndex >= tubes.length
    ) return null

    const source = tubes[sourceIndex]
    const destination = tubes[destinationIndex]
    if (source.length === 0 || destination.length >= capacity) return null

    const top = source[source.length - 1]
    if (destination.length > 0 && destination[destination.length - 1] !== top) return null

    const layersMoved = Math.min(
        getTopRunLength(source),
        capacity - destination.length
    )
    if (layersMoved <= 0) return null

    const next = tubes.map(tube => [...tube])
    const moved = next[sourceIndex].splice(-layersMoved)
    next[destinationIndex].push(...moved)
    return { tubes: next, layersMoved }
}

export function isPotionSorterSolved(
    tubes: PotionTube[],
    capacity = POTION_TUBE_CAPACITY
): boolean {
    let nonEmpty = 0
    for (const tube of tubes) {
        if (tube.length === 0) continue
        nonEmpty++
        if (tube.length !== capacity || new Set(tube).size !== 1) return false
    }
    return nonEmpty > 0
}
```

Run `puzzle.test.ts` and `levels.test.ts`; both must pass, proving the three shipped layouts have concrete legal solutions.

- [ ] **Step 3: Write RED scoring tests**

```ts
const easy = POTION_SORTER_PRESETS.easy
expect(calculatePotionSorterScore(easy, 180, 10, true)).toBe(2300)
expect(calculatePotionSorterScore(easy, 100, 20, true)).toBe(1500)
expect(calculatePotionSorterScore(easy, 100, 30, true)).toBe(1500)
expect(calculatePotionSorterScore(easy, -5, 10, true)).toBe(1400)
expect(calculatePotionSorterScore(easy, 180, 10, false)).toBe(0)
```

Run and confirm RED because `scoring.ts` is missing.

- [ ] **Step 4: Implement the single scorer**

```ts
// src/lib/games/potion-sorter/scoring.ts
import type { PotionSorterPreset } from './types'

export function calculatePotionSorterScore(
    preset: PotionSorterPreset,
    remainingSeconds: number,
    movesMade: number,
    solved: boolean
): number {
    if (!solved) return 0
    const remaining = Math.max(0, Math.floor(remainingSeconds))
    const moves = Math.max(0, Math.floor(movesMade))
    const moveBonus = Math.max(0, preset.moveTarget * 2 - moves) * 40
    return preset.completionBase + moveBonus + remaining * 5
}
```

Run:

```bash
bun run test:run src/lib/games/potion-sorter
```

Expected: all Task 1–2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/potion-sorter/levels.test.ts src/lib/games/potion-sorter/puzzle.ts src/lib/games/potion-sorter/puzzle.test.ts src/lib/games/potion-sorter/scoring.ts src/lib/games/potion-sorter/scoring.test.ts
git commit -m "feat(potion-sorter): add pour rules and scoring"
```

---

### Task 3: Implement the BaseGame runtime, Undo, difficulty, solve, and timeout lifecycle

**Files:**
- Create: `src/lib/games/potion-sorter/PotionSorterGame.ts`
- Create: `src/lib/games/potion-sorter/PotionSorterGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`
- Reuse unchanged: `src/lib/games/core/GameTimer.ts`

**Interfaces:**
- Consumes Task 1 presets/types and Task 2 puzzle/scoring helpers.
- Produces `createPotionSorterConfig()`, `activateTube()`, `undo()`, `canUndo()`, `newGame()`, state/stats/game-data callbacks.
- Temporarily use the literal cast `GameID.POTION_SORTER` only after Task 5 adds the enum member; keep Task 3 tests focused by adding the enum entry at the start of Task 3 **only if TypeScript requires it**, but do not activate the `GAMES` registry object until the route exists in Task 5. Preferred path: add the enum member + icon in Task 3, registry object in Task 5.

- [ ] **Step 1: Add `GameID.POTION_SORTER` and icon only, without a `GAMES` entry**

Modify `src/lib/games.ts`:

```ts
POTION_SORTER = 'potion_sorter',
```

and:

```ts
[GameID.POTION_SORTER]: '🧪',
```

Do not add the active catalog object yet. Extend `src/lib/games.test.ts` only if its exhaustive icon/enum expectations require the new enum member.

Run the focused `src/lib/games.test.ts` suite and keep it green.

- [ ] **Step 2: Write RED runtime tests**

Use the Easy preset and verify:

1. initial state clones the authored board and reports Medium by default from `createPotionSorterConfig()`;
2. `start()` enables actions;
3. activating a non-empty tube returns `selected`, sets `selectedTubeIndex`, and emits state;
4. activating it again returns `deselected`;
5. activating an empty tube with no source returns `invalid`;
6. invalid destination keeps the original selected source and does not increment moves;
7. a legal pour returns `poured`, clears selection, increments `movesMade`, and makes `canUndo()` true;
8. `undo()` restores the exact pre-pour tubes, increments `undosUsed`, clears selection, **does not decrement `movesMade`**, and empties history after the final undo;
9. pour → undo → repeat the same pour yields `movesMade === 2`;
10. `reset()` clears history/moves/undos and restores the exact authored board;
11. `newGame('hard')` while idle updates duration/preset/state, while `newGame()` during an active run returns false;
12. replay the Easy known solution through `activateTube()` and assert exactly one solve score/end path;
13. timeout marks `result === 'timeout'`, leaves score 0, and rejects further tube/Undo actions;
14. `getGameStats()` / submitted data preserve final elapsed time through the existing BaseGame timer snapshot.

- [ ] **Step 3: Implement the runtime**

Core shape:

```ts
export function createPotionSorterConfig(
    difficulty: PotionSorterDifficulty = 'medium'
): PotionSorterConfig {
    const preset = POTION_SORTER_PRESETS[difficulty]
    return {
        duration: preset.duration,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        preset,
    }
}

export class PotionSorterGame extends BaseGame<
    PotionSorterState,
    PotionSorterConfig,
    PotionSorterStats
> {
    private history: PotionTube[][] = []

    constructor(
        config = createPotionSorterConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.POTION_SORTER, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): PotionSorterState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            difficulty: this.config.preset.difficulty,
            tubes: this.config.preset.initialTubes.map(tube => [...tube]),
            selectedTubeIndex: null,
            movesMade: 0,
            undosUsed: 0,
            result: 'playing',
        }
    }
```

`activateTube(index)` follows the spec's four-result contract. Before assigning a successful `pourPotion()` result, push:

```ts
this.history.push(this.state.tubes.map(tube => [...tube]))
```

Then increment `movesMade`, clear selection, and if solved:

```ts
this.state.result = 'solved'
this.addScore(
    calculatePotionSorterScore(
        this.config.preset,
        this.state.timeRemaining,
        this.state.movesMade,
        true
    ),
    'puzzle_solved'
)
this.emitStateChange()
void this.end().catch((err: unknown) =>
    console.error('PotionSorterGame end failed (solved)', err)
)
```

`undo()` restores the last snapshot, increments `undosUsed`, and leaves `movesMade` untouched.

`newGame(difficulty)` mirrors Mine Grid's same-instance difficulty path: reject active state, call `setDuration()`, set `config.preset`, then `reset()`.

`handleTimeUp()` sets `timeout`, clears selection, emits state, then delegates to `super.handleTimeUp()`.

`onGameReset()` clears `history` and emits state.

- [ ] **Step 4: Run focused runtime tests**

```bash
bun run test:run src/lib/games/potion-sorter/PotionSorterGame.test.ts src/lib/games/potion-sorter/puzzle.test.ts src/lib/games/potion-sorter/scoring.test.ts src/lib/games/potion-sorter/levels.test.ts src/lib/games.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/potion-sorter/PotionSorterGame.ts src/lib/games/potion-sorter/PotionSorterGame.test.ts
git commit -m "feat(potion-sorter): add game lifecycle and undo"
```

---

### Task 4: Add semantic DOM rendering and the one-instance initializer

**Files:**
- Create: `src/lib/games/potion-sorter/PotionSorterRenderer.ts`
- Create: `src/lib/games/potion-sorter/PotionSorterRenderer.test.ts`
- Create: `src/lib/games/potion-sorter/initFramework.ts`
- Create: `src/lib/games/potion-sorter/initFramework.test.ts`
- Reuse unchanged: `src/lib/games/renderers/DOMRenderer.ts`
- Reuse patterns from: `src/lib/games/mine-grid/MineGridRenderer.ts`, `src/lib/games/mine-grid/initFramework.ts`

**Interfaces:**
- Renderer produces `setTubeActionCallback((index) => void)` and `createPotionSorterRendererConfig()`.
- Initializer returns `{ game, renderer, getGame, getState, restart, cleanup }`.

- [ ] **Step 1: Write RED renderer tests**

Set up `#potion-sorter-board`, initialize the renderer, render an Easy state, and assert:

- exactly five `button[data-tube-index]` elements;
- tube 0 has four `.potion-layer` children in bottom-to-top DOM order;
- each non-empty layer has `data-liquid`, glyph text, and `aria-hidden="true"`;
- tube button `aria-label` contains human-readable liquid names;
- selected tube has `aria-pressed="true"` and a selected data/class state;
- a complete uniform capacity-4 tube gets a complete state;
- clicking a nested layer delegates exactly one callback with the containing tube index;
- focus on tube 2 survives a rerender;
- `destroy()` removes the listener and clears only the dynamic board children via normal `DOMRenderer.cleanup()`.

- [ ] **Step 2: Implement the renderer**

Use one local visual map:

```ts
const LIQUID_VISUALS: Record<PotionColor, { label: string; glyph: string }> = {
    cyan: { label: 'Cyan', glyph: '▲' },
    magenta: { label: 'Magenta', glyph: '●' },
    amber: { label: 'Amber', glyph: '◆' },
    lime: { label: 'Lime', glyph: '✦' },
    violet: { label: 'Violet', glyph: '⬢' },
    coral: { label: 'Coral', glyph: '■' },
    azure: { label: 'Azure', glyph: '✚' },
}
```

Register exactly one stable delegated click handler in `setup()`. `renderGame()` clears/rebuilds dynamic tube buttons and restores focus by index. Do not use `innerHTML`.

- [ ] **Step 3: Write RED initializer tests**

Build a jsdom page fixture with these stable IDs:

```text
potion-sorter-container
potion-sorter-board
start-btn
reset-btn
undo-btn
play-again-btn
easy-btn
medium-btn
hard-btn
score
time-remaining
difficulty
moves
undos
potion-sorter-status
game-over-overlay
game-over-title
final-outcome
final-difficulty
final-score
final-moves
final-undos
final-time
```

Test:

- missing outer container reports existing DOM error path and returns undefined;
- one game/renderer instance is created;
- Medium is selected initially;
- Start hides/disables appropriate idle controls and starts the run;
- difficulty buttons disable while active and call `newGame()` only while idle;
- tube click flows through `activateTube()`;
- status live region gets selected / invalid / poured / undo copy;
- Undo button is disabled with no history, enabled after a legal pour, and invokes `undo()`;
- Reset restores idle presentation and current difficulty;
- end overlay shows outcome/difficulty/score/moves/undos/time;
- Play Again/restart returns to the current authored puzzle;
- active run sets beforeunload protection;
- cleanup removes tracked listeners and is idempotent.

- [ ] **Step 4: Implement `initFramework.ts` by adapting Mine Grid's listener/HUD helpers**

Keep one immutable `const game` and `const renderer`. Required presentation helpers:

```ts
setText(id, value)
setDifficultyButtonsDisabled(disabled)
setDifficultySelection(difficulty)
setStartVisible(visible)
hideOverlay()
syncHud(state)
syncUndoButton()
setStatus(message)
resetPresentation()
```

Renderer callback:

```ts
renderer.setTubeActionCallback(index => {
    const result = game.activateTube(index)
    switch (result) {
        case 'selected': setStatus(`Selected tube ${index + 1}.`); break
        case 'deselected': setStatus('Selection cleared.'); break
        case 'poured': setStatus('Potion poured.'); break
        case 'invalid': setStatus('That pour is not allowed.'); break
    }
    syncUndoButton()
})
```

Undo handler:

```ts
if (game.undo()) setStatus('Last pour undone.')
syncUndoButton()
```

Use the same achievement/challenge forwarding and `beforeunload` structure as Mine Grid. No new shared initializer abstraction.

- [ ] **Step 5: Run focused DOM tests and commit**

```bash
bun run test:run src/lib/games/potion-sorter/PotionSorterRenderer.test.ts src/lib/games/potion-sorter/initFramework.test.ts src/lib/games/potion-sorter/PotionSorterGame.test.ts
bun run typecheck
```

Expected: PASS.

```bash
git add src/lib/games/potion-sorter/PotionSorterRenderer.ts src/lib/games/potion-sorter/PotionSorterRenderer.test.ts src/lib/games/potion-sorter/initFramework.ts src/lib/games/potion-sorter/initFramework.test.ts
git commit -m "feat(potion-sorter): add accessible DOM controls"
```

---

### Task 5: Add the Astro page, active registry entry, shared data, achievements, and docs

**Files:**
- Create: `src/pages/potion-sorter/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `src/lib/organisms.test.ts` if its total/zone fixtures are exhaustive
- Modify: `CLAUDE.md`
- Verify unchanged symlink: `AGENTS.md`

**Interfaces:**
- Activates the already-added `GameID.POTION_SORTER` in `GAMES` only now that `/potion-sorter` exists.
- Adds `PotionSorterGameData` to the shared union and four achievements.

- [ ] **Step 1: Create the page with Astro-owned structure**

Use `GamePage` and include the stable IDs listed in Task 4. The board mount must be:

```astro
<div
  id="potion-sorter-container"
  slot="game-board"
  class="w-full"
>
  <div
    id="potion-sorter-board"
    class="potion-sorter-board"
    aria-label="Potion tubes"
  ></div>
  <p id="potion-sorter-status" class="sr-only" aria-live="polite"></p>
</div>
```

Provide Easy/Medium/Hard buttons with Medium initially `aria-pressed="true"`, Start/Reset/Undo controls, stats, How to Play/Scoring cards, and a hidden result overlay with final outcome/difficulty/score/moves/undos/time.

Add scoped CSS for responsive tube wrapping. The hard board must not require horizontal page scrolling on a ~375px viewport. Liquid color selectors key off `data-liquid`; the glyph remains visible inside every layer.

The root-level script after `</GamePage>` calls `initPotionSorterGameFramework()` and cleans up on Astro navigation using the repository's existing page pattern.

- [ ] **Step 2: Extend markup tests before registry activation**

In `src/pages/game-board-markup.test.ts`:

- read `src/pages/potion-sorter/index.astro`;
- assert `potion-sorter-container`, `potion-sorter-board`, `undo-btn`, `potion-sorter-status`, difficulty buttons, and root-level initializer;
- add `'potion-sorter'` to the `games` page list only after the file exists.

Run:

```bash
bun run test:run src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 3: Activate the registry object and shared data**

Add to `GAMES`:

```ts
{
    id: GameID.POTION_SORTER,
    name: 'Potion Sorter',
    description: 'Sort layered lab potions into matching tubes before time runs out',
    category: 'puzzle',
    maxPlayers: 1,
    estimatedDuration: '3-8 minutes',
    difficulty: 'medium',
    tags: ['sorting', 'logic', 'puzzle', 'single-player', 'casual'],
    isActive: true,
    organism: { shape: 'cluster', color: 'magenta' },
    depth: 'mid',
},
```

In `shared/types.ts`:

```ts
export type PotionSorterGameData =
    import('../potion-sorter/types').PotionSorterGameData
```

and append `| PotionSorterGameData` to `GameData`.

Update exhaustive game/icon/organism tests to 19 games where they assert fixed counts.

Do **not** modify `src/pages/index.astro`; it uses `games.length`.

- [ ] **Step 4: Add the four achievements with focused tests**

Follow the existing `GameID`-keyed achievement definitions and add:

- `First Formula` — COMMON — `score >= 1`;
- `Clean Pour` — RARE — `gameData.solved === true && gameData.undosUsed === 0`;
- `Master Chemist` — EPIC — `gameData.solved === true && gameData.difficulty === 'hard'`;
- `Perfect Mixture` — LEGENDARY — `score >= 5500`.

Tests must prove positive and negative boundaries, especially:

```text
Clean Pour: solved + 0 undo => award; solved + 1 undo => no award
Master Chemist: hard solved => award; medium solved => no award
Perfect Mixture: 5499 => no award; 5500 => award
```

- [ ] **Step 5: Update `CLAUDE.md` inventory and verify the symlink**

Change the overview from 18 to **19** games and add Potion Sorter to the game list, project tree, DOM-renderer note, and game-specific notes. Do not rewrite historical spec/plan counts.

Verify:

```bash
test "$(readlink AGENTS.md)" = "CLAUDE.md"
```

- [ ] **Step 6: Run integration tests and commit**

```bash
bun run test:run src/lib/games.test.ts src/lib/organisms.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts src/lib/games/potion-sorter
bun run typecheck
bun run lint
```

Expected: PASS.

```bash
git add src/pages/potion-sorter/index.astro src/pages/game-board-markup.test.ts src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts src/lib/achievements.ts src/lib/achievements.test.ts src/lib/organisms.test.ts CLAUDE.md
git commit -m "feat(potion-sorter): register game and page"
```

If `src/lib/organisms.test.ts` does not require a change, omit it from `git add`; do not manufacture a count-only diff.

---

### Task 6: Add one real browser journey and run full repository gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- Verify source-unchanged: `e2e/games/all-games-navigation.spec.ts`

**Interfaces:**
- Browser test uses the same Easy solution from Task 1; no test-only production hook for solving is added.

- [ ] **Step 1: Add a Potion Sorter browser journey**

Navigate to `/potion-sorter`, select Easy, start, and click the concrete known solution pairs in order:

```ts
const easySolution: Array<[number, number]> = [
    [0, 3], [2, 0], [1, 2], [1, 3], [0, 1],
    [2, 0], [2, 3], [1, 2], [0, 1], [0, 3],
]

for (const [source, destination] of easySolution) {
    await page.locator(`[data-tube-index="${source}"]`).click()
    await page.locator(`[data-tube-index="${destination}"]`).click()
}
```

Assert the result overlay reports solved, move count `10`, Easy difficulty, positive score, and elapsed time. Then click Play Again/Reset path and verify the board returns to the authored Easy layout with moves/undos reset.

Also exercise Undo before the final solve in a separate short path or the same journey before restarting:

1. start Easy;
2. perform first legal pour `0 -> 3`;
3. click Undo;
4. assert moves remains `1`, undos becomes `1`, and the initial top-layer arrangement is restored;
5. reset, then run the clean 10-move solve.

This browser test uses click/tap-equivalent input. Native keyboard semantics remain unit-covered because tubes are real buttons.

- [ ] **Step 2: Run focused browser coverage**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

Expected: Potion Sorter journey passes and catalog navigation discovers `/potion-sorter` from `GAMES` without modifying the navigation spec.

- [ ] **Step 3: Run all final gates**

```bash
bun run test:run
bun run test:coverage
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

Expected: all pass; coverage remains above configured project/patch targets.

- [ ] **Step 4: Scope audit**

Compare against merge-base and confirm there are **no** production changes in:

```text
src/lib/games/core/BaseGame.ts
src/lib/games/core/GameTimer.ts
src/lib/games/core/GameInitializer.ts
src/lib/games/renderers/DOMRenderer.ts
src/lib/services/scoreService.ts
src/pages/api/
src/lib/server/db/
src/pages/index.astro
```

Also confirm:

- no procedural generator or solver file exists;
- no package/dependency change;
- no new schema/migration;
- `AGENTS.md` is still the `CLAUDE.md` symlink;
- `all-games-navigation.spec.ts` remains source-unchanged.

- [ ] **Step 5: Commit browser coverage/final formatting changes**

```bash
git add e2e/games/play-coverage.spec.ts
# add only files changed by required formatting, if any
git commit -m "test(potion-sorter): cover solve undo and replay"
```

## Implementation Completion Checklist

Before marking HPA-72 done, verify:

- [ ] Three authored presets exactly match the spec.
- [ ] Test-only concrete solutions solve Easy/Medium/Hard with 10/16/22 pours.
- [ ] Standard contiguous top-run pour and partial-capacity behavior are locked.
- [ ] Invalid pours are no-ops.
- [ ] Undo is multi-step, cumulative-move-safe, and cleared by Reset.
- [ ] Difficulty changes reuse one game instance and existing BaseGame duration support.
- [ ] Solved score uses exactly one pure scorer; timeout scores 0.
- [ ] Renderer uses native tube buttons, delegated click, focus restore, glyph + color cues.
- [ ] Mobile hard board wraps without horizontal page scrolling.
- [ ] Result UI shows difficulty, score, moves, Undos, elapsed time.
- [ ] Existing BaseGame/ScoreManager flow submits scores/game data when logged in.
- [ ] Potion Sorter is the 19th active catalog game with `🧪` icon.
- [ ] Four achievements have boundary tests.
- [ ] `CLAUDE.md` is current and `AGENTS.md` stays a symlink.
- [ ] Unit, coverage, typecheck, lint, format, build, play-coverage, and catalog-navigation gates are green.
- [ ] No core runtime, backend, schema, PixiJS, generator, solver, or generic framework expansion slipped into scope.