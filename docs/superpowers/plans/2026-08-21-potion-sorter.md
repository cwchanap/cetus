# Potion Sorter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Potion Sorter, a 3–8 minute authored liquid-sorting puzzle with Easy/Medium/Hard boards, standard top-run pours, explicit dead-end guidance, multi-step Undo, move/time scoring, accessible desktop/mobile controls, achievements, and the existing Cetus score/leaderboard flow.

**Architecture:** `PotionSorterGame` extends `BaseGame` and owns selection, legal-pour application, cumulative move accounting, private Undo snapshots, difficulty switching, solve/timeout lifecycle, and score submission. `puzzle.ts` owns immediate pour/solved/legal-move predicates; `scoring.ts` is the single scorer. `PotionSorterRenderer` extends `DOMRenderer` and renders a small semantic button grid into Astro-owned `#potion-sorter-board`. Three authored presets are source-controlled and validated by exact test-only solution paths; no procedural generator or production solver is added.

**Tech Stack:** Astro 5 + TypeScript, Tailwind CSS 4, existing BaseGame/DOMRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-21-potion-sorter-design.md`

## Global Constraints

- Package manager: **Bun `1.3.1`**.
- One HPA-72 implementation PR; game logic, page, registry, achievements, docs, and browser coverage land together.
- ID **`potion_sorter`**, route **`/potion-sorter`**, title **`Potion Sorter`**, icon **`🧪`**.
- Fixed game-wide tube capacity: **4**, defined once as `POTION_TUBE_CAPACITY`; do **not** repeat capacity on `PotionSorterPreset`.
- Easy: **3 colors / 5 tubes / 180s / move target 10 / completion base 1,000**.
- Medium: **5 colors / 7 tubes / 300s / move target 20 / completion base 2,000**.
- Hard: **7 colors / 9 tubes / 480s / move target 28 / completion base 3,000**.
- Every preset has exactly two empty tubes and exactly four layers of each active color.
- Preset arrays are ordered **bottom to top**.
- Easy remains the cyclic tutorial board. Medium and Hard are distinct mixed-stack authored boards.
- Standard pour: destination must be empty or top-match; move the maximum contiguous source top run that fits.
- Invalid actions never increment `movesMade` and never create Undo history.
- `hasLegalMove()` detects only whether at least one immediate pour exists; it does not search future states.
- An unsolved board with no legal pour remains active and announces **“No pours left — undo or reset.”**; do not auto-end or auto-recover it.
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
- Reference full-time scores are **2,300 / 4,300 / 6,520** for Easy/Medium/Hard.
- Medium's arithmetic maximum is **5,100** even at impossible zero moves, so the **5,500** legendary threshold is Hard-only.
- Use existing protected `BaseGame.setDuration()` for idle difficulty changes; **do not modify BaseGame/GameTimer**.
- Use `BaseGame + DOMRenderer`; no PixiJS, drag physics, audio, procedural generation, production solver, hints, generic puzzle framework, DB/schema/API changes, or new score path.
- Runtime cloning occurs only in `createInitialState()`, pre-pour Undo snapshot creation, and immutable `pourPotion()`; `levels.ts` exports literals only.
- Renderer liquid layers must use glyphs as well as color: cyan `▲`, magenta `●`, amber `◆`, lime `✦`, violet `⬢`, coral `■`, azure `✚`.
- Tube activation uses native `<button>` click/Enter/Space; no document-level gameplay keyboard handler.
- Play Again uses the same reset handler as Reset and returns to idle; it does **not** auto-start.
- `GamePage` must use `showPause={false}`, `showEnd={false}`, and `initialTime={300}`.
- Keep default `GameControls`; put `#undo-btn` in `slot="game-info"` beside difficulty controls. Do not add `showUndo` or fork the full controls slot.
- `#undo-btn[data-dead-end='true']` gets explicit border/text emphasis; the live-region message remains the primary cue.
- Hard mode wraps nine tubes over multiple visual rows on narrow screens; logical order remains tube index order.
- Task 3 adds `GameID.POTION_SORTER` + exhaustive icon entry because runtime code needs the enum. The active `GAMES` record stays deferred until Task 5 creates the route. Do not add a temporary `getGameById(...)=undefined` test.
- `getGameUrl()` stays unchanged.
- `src/pages/index.astro` stays source-unchanged because home count/cards derive from `GAMES`.
- `e2e/games/all-games-navigation.spec.ts` stays source-unchanged and derives coverage from `GAMES`.
- Registering Potion Sorter at depth `mid` changes the exact organism partition from **6 / 8 / 4** to **6 / 9 / 4**; update that fixture explicitly.
- Keep initializer presentation helpers local. Do **not** add `src/lib/games/shared/dom.ts` unless existing consumers are migrated in a separate task; HPA-72 does not do that migration.
- `src/lib/games/core/GameInitializer.ts` has no current production importers. Do not adopt/refactor/delete it in HPA-72.
- Reuse BaseGame's run guard for async score submissions; no game-local stale token.
- Edit `CLAUDE.md`, not its `AGENTS.md` symlink.
- Codecov project/patch targets remain the repository's existing **90%** configuration.

## Load-Bearing Risks

- **Silent dead end:** Medium can dead-end in 4 pours and Hard in 2. The live region and Undo emphasis must distinguish this from one invalid destination click.
- **Preset mutation:** Start → pour → Undo → Reset must leave `POTION_SORTER_PRESETS.easy.initialTubes` byte-for-byte equal to the authored literal.
- **Vacuous authored-content tests:** every preset gets an exact 10/20/28-pour legal solution replay, not only shape/count assertions.
- **Undo score gaming:** cumulative moves remain unchanged by Undo; re-performing a pour counts another move.
- **Dead achievement payload:** solved and timeout tests must assert the full submitted `PotionSorterGameData`; timeout explicitly submits `solved: false`.
- **Nested DOM focus loss:** renderer rebuilds tube buttons but restores focus by `data-tube-index`.
- **Color-only state:** every liquid layer renders a distinct glyph and every tube has an authoritative text `aria-label`.
- **Wrong shared chrome:** markup tests freeze no Pause/End, 300-second initial timer, and a game-specific `#undo-btn`.
- **Idle board missing:** initializer must render/sync once before returning so idle difficulty changes and mobile-layout tests see actual tubes without pressing Start.
- **Mobile hard-board density:** Playwright uses a 375×812 viewport and proves wrapping plus no document overflow.
- **Timeout/save race:** reuse BaseGame lifecycle/run guard; no second network guard.

---

### Task 1: Define contracts and freeze the three authored puzzles

**Files:**
- Create: `src/lib/games/potion-sorter/types.ts`
- Create: `src/lib/games/potion-sorter/levels.ts`
- Create: `src/lib/games/potion-sorter/levels.test.ts`

**Interfaces:**
- Produces: `POTION_TUBE_CAPACITY`, `PotionColor`, `PotionTube`, `PotionSorterDifficulty`, `PotionSorterResult`, `PotionSorterActionResult`, `PotionSorterPreset`, `PotionSorterConfig`, state/stats/game-data contracts, and `POTION_SORTER_PRESETS`.
- `PotionSorterPreset` does **not** expose capacity; later tasks use `POTION_TUBE_CAPACITY` for the fixed rule.
- Later runtime tasks clone `initialTubes` only when mutable ownership is required.

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

- [ ] **Step 2: Add the exact authored preset literals**

```ts
// src/lib/games/potion-sorter/levels.ts
import type {
    PotionSorterDifficulty,
    PotionSorterPreset,
} from './types'

export const POTION_SORTER_PRESETS: Record<
    PotionSorterDifficulty,
    PotionSorterPreset
> = {
    easy: {
        difficulty: 'easy',
        duration: 180,
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
        moveTarget: 20,
        completionBase: 2_000,
        initialTubes: [
            ['magenta', 'magenta', 'amber', 'cyan'],
            ['amber', 'violet', 'violet', 'cyan'],
            ['lime', 'lime', 'amber', 'cyan'],
            ['violet', 'violet', 'cyan', 'lime'],
            ['magenta', 'magenta', 'lime', 'amber'],
            [],
            [],
        ],
    },
    hard: {
        difficulty: 'hard',
        duration: 480,
        moveTarget: 28,
        completionBase: 3_000,
        initialTubes: [
            ['cyan', 'magenta', 'cyan', 'magenta'],
            ['amber', 'amber', 'amber', 'azure'],
            ['lime', 'lime', 'coral', 'magenta'],
            ['violet', 'violet', 'lime', 'cyan'],
            ['coral', 'coral', 'coral', 'violet'],
            ['azure', 'violet', 'magenta', 'cyan'],
            ['azure', 'azure', 'amber', 'lime'],
            [],
            [],
        ],
    },
}
```

Do not add a clone helper, generator, reverse-authoring helper, capacity field, or solution path to production.

- [ ] **Step 3: Write RED authored-content tests with exact solution and dead-end paths**

Create `src/lib/games/potion-sorter/levels.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { POTION_SORTER_PRESETS } from './levels'
import {
    POTION_TUBE_CAPACITY,
    type PotionSorterDifficulty,
    type PotionTube,
} from './types'
import {
    hasLegalMove,
    isPotionSorterSolved,
    pourPotion,
} from './puzzle'

const SOLUTIONS = {
    easy: [
        [0, 3], [2, 0], [1, 2], [1, 3], [0, 1],
        [2, 0], [2, 3], [1, 2], [0, 1], [0, 3],
    ],
    medium: [
        [4, 6], [6, 5], [2, 6], [5, 2], [6, 5],
        [0, 6], [2, 0], [5, 6], [0, 2], [6, 5],
        [2, 0], [3, 6], [6, 4], [1, 5], [3, 5],
        [1, 3], [2, 1], [4, 2], [0, 1], [4, 0],
    ],
    hard: [
        [0, 7], [7, 8], [0, 7], [8, 0], [7, 8], [0, 7], [0, 8],
        [8, 0], [7, 8], [0, 7], [8, 0], [7, 8], [5, 7], [8, 7],
        [0, 8], [7, 0], [8, 7], [3, 0], [6, 3], [2, 7], [5, 7],
        [4, 5], [2, 4], [3, 2], [5, 3], [1, 5], [6, 1], [6, 5],
    ],
} satisfies Record<PotionSorterDifficulty, Array<[number, number]>>

const DEAD_END_PATHS = {
    medium: [[3, 5], [1, 3], [4, 6], [4, 5]],
    hard: [[1, 7], [4, 8]],
} satisfies Record<'medium' | 'hard', Array<[number, number]>>

function replay(
    initial: PotionTube[],
    path: Array<[number, number]>
): PotionTube[] {
    let tubes = initial.map(tube => [...tube])
    for (const [source, destination] of path) {
        const result = pourPotion(tubes, source, destination)
        expect(result).not.toBeNull()
        tubes = result!.tubes
    }
    return tubes
}
```

For each preset assert:

```ts
expect(preset.initialTubes.filter(tube => tube.length === 0)).toHaveLength(2)
expect(
    preset.initialTubes.every(tube => tube.length <= POTION_TUBE_CAPACITY)
).toBe(true)
expect(SOLUTIONS[difficulty]).toHaveLength(preset.moveTarget)
```

Flatten all liquids and assert every active color occurs exactly `POTION_TUBE_CAPACITY` times. Also assert every non-empty Medium/Hard tube is mixed (`new Set(tube).size > 1`). Replay each exact solution and assert `isPotionSorterSolved(finalTubes) === true`.

Add the concrete dead-end assertions:

```ts
for (const difficulty of ['medium', 'hard'] as const) {
    const dead = replay(
        POTION_SORTER_PRESETS[difficulty].initialTubes,
        DEAD_END_PATHS[difficulty]
    )
    expect(isPotionSorterSolved(dead)).toBe(false)
    expect(hasLegalMove(dead)).toBe(false)
}
```

For Easy, add a test-only exhaustive traversal over reachable states. Do **not** assert an exact state count; only prove no reachable unsolved state is dead-ended:

```ts
const start = POTION_SORTER_PRESETS.easy.initialTubes.map(tube => [...tube])
const queue: PotionTube[][][] = [start]
const seen = new Set([JSON.stringify(start)])

while (queue.length > 0) {
    const tubes = queue.shift()!
    if (!isPotionSorterSolved(tubes)) {
        expect(hasLegalMove(tubes)).toBe(true)
    }

    for (let source = 0; source < tubes.length; source++) {
        for (let destination = 0; destination < tubes.length; destination++) {
            const result = pourPotion(tubes, source, destination)
            if (!result) continue
            const key = JSON.stringify(result.tubes)
            if (seen.has(key)) continue
            seen.add(key)
            queue.push(result.tubes)
        }
    }
}
```

Run:

```bash
bun run test:run src/lib/games/potion-sorter/levels.test.ts
```

Expected: FAIL because `puzzle.ts` does not exist yet.

- [ ] **Step 4: Commit only the green contracts/presets**

Keep `levels.test.ts` uncommitted until Task 2 turns it green.

```bash
git add src/lib/games/potion-sorter/types.ts src/lib/games/potion-sorter/levels.ts
git commit -m "feat(potion-sorter): add authored puzzle presets"
```

---

### Task 2: Implement pure pour, solved, legal-move, and scoring helpers

**Files:**
- Create: `src/lib/games/potion-sorter/puzzle.ts`
- Create: `src/lib/games/potion-sorter/puzzle.test.ts`
- Create: `src/lib/games/potion-sorter/scoring.ts`
- Create: `src/lib/games/potion-sorter/scoring.test.ts`
- Complete: `src/lib/games/potion-sorter/levels.test.ts`

**Interfaces:**
- Produces `getTopRunLength()`, `pourPotion()`, `isPotionSorterSolved()`, `hasLegalMove()`, and `calculatePotionSorterScore()`.
- `pourPotion()` is immutable and returns `{ tubes, layersMoved } | null`.
- `hasLegalMove()` is immediate-only and reuses `pourPotion()` rather than introducing a second legality implementation.

- [ ] **Step 1: Write RED puzzle-rule tests**

Cover exact top-run and immutability behavior:

```ts
expect(getTopRunLength(['cyan', 'magenta', 'magenta'])).toBe(2)
expect(getTopRunLength([])).toBe(0)

const original = [
    ['cyan', 'magenta', 'magenta'],
    ['magenta'],
    [],
] as PotionTube[]
const poured = pourPotion(original, 0, 1)

expect(poured?.layersMoved).toBe(2)
expect(poured?.tubes).toEqual([
    ['cyan'],
    ['magenta', 'magenta', 'magenta'],
    [],
])
expect(original).toEqual([
    ['cyan', 'magenta', 'magenta'],
    ['magenta'],
    [],
])
```

Invalid cases:

```ts
expect(pourPotion([['cyan'], ['magenta']], 0, 1)).toBeNull()
expect(pourPotion([['cyan'], []], 0, 0)).toBeNull()
expect(pourPotion([[], ['cyan']], 0, 1)).toBeNull()
expect(pourPotion([['cyan'], ['cyan', 'cyan', 'cyan', 'cyan']], 0, 1)).toBeNull()
```

Add a partial-capacity case where a two-layer top run moves only one layer into a three-full matching destination.

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

Legal-move checks:

```ts
expect(hasLegalMove([['cyan'], []])).toBe(true)
expect(hasLegalMove([['cyan'], ['magenta']])).toBe(false)
expect(hasLegalMove([])).toBe(false)
```

- [ ] **Step 2: Implement the immutable helpers and immediate legal-move predicate**

```ts
// src/lib/games/potion-sorter/puzzle.ts
import { POTION_TUBE_CAPACITY, type PotionTube } from './types'

export function getTopRunLength(tube: PotionTube): number {
    if (tube.length === 0) return 0
    const top = tube[tube.length - 1]
    let count = 0
    for (let i = tube.length - 1; i >= 0 && tube[i] === top; i--) {
        count++
    }
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
    ) {
        return null
    }

    const source = tubes[sourceIndex]
    const destination = tubes[destinationIndex]
    if (source.length === 0 || destination.length >= capacity) return null

    const top = source[source.length - 1]
    if (destination.length > 0 && destination[destination.length - 1] !== top) {
        return null
    }

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

export function hasLegalMove(
    tubes: PotionTube[],
    capacity = POTION_TUBE_CAPACITY
): boolean {
    for (let source = 0; source < tubes.length; source++) {
        for (let destination = 0; destination < tubes.length; destination++) {
            if (pourPotion(tubes, source, destination, capacity)) {
                return true
            }
        }
    }
    return false
}
```

For at most nine tiny tubes this immediate scan is cheaper and clearer than adding `canPour()` plus a second legality path. It stops on the first legal pour.

Run:

```bash
bun run test:run \
  src/lib/games/potion-sorter/puzzle.test.ts \
  src/lib/games/potion-sorter/levels.test.ts
```

Expected: PASS, including exact authored solution replays, Easy no-dead-end traversal, and Medium/Hard dead-end fixtures.

- [ ] **Step 3: Write RED scoring tests**

```ts
const easy = POTION_SORTER_PRESETS.easy
const medium = POTION_SORTER_PRESETS.medium
const hard = POTION_SORTER_PRESETS.hard

expect(calculatePotionSorterScore(easy, 180, 10, true)).toBe(2300)
expect(calculatePotionSorterScore(medium, 300, 20, true)).toBe(4300)
expect(calculatePotionSorterScore(hard, 480, 28, true)).toBe(6520)

expect(calculatePotionSorterScore(easy, 100, 20, true)).toBe(1500)
expect(calculatePotionSorterScore(easy, 100, 30, true)).toBe(1500)
expect(calculatePotionSorterScore(easy, -5, 10, true)).toBe(1400)
expect(calculatePotionSorterScore(easy, 180, 10, false)).toBe(0)

// Arithmetic upper bound proves Perfect Mixture cannot be earned in Medium.
expect(calculatePotionSorterScore(medium, 300, 0, true)).toBe(5100)
```

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
git add src/lib/games/potion-sorter/levels.test.ts \
  src/lib/games/potion-sorter/puzzle.ts \
  src/lib/games/potion-sorter/puzzle.test.ts \
  src/lib/games/potion-sorter/scoring.ts \
  src/lib/games/potion-sorter/scoring.test.ts
git commit -m "feat(potion-sorter): add pour rules dead-end detection and scoring"
```

---

### Task 3: Add GameID/icon and implement runtime, Undo, difficulty, solve, timeout, and submitted data

**Files:**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Create: `src/lib/games/potion-sorter/PotionSorterGame.ts`
- Create: `src/lib/games/potion-sorter/PotionSorterGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`
- Reuse unchanged: `src/lib/games/core/GameTimer.ts`

**Interfaces:**
- Produces `GameID.POTION_SORTER`, its exhaustive icon entry, `createPotionSorterConfig()`, `activateTube()`, `undo()`, `canUndo()`, `newGame()`, stats and submitted game data.
- The active `GAMES` record remains deferred until Task 5 creates `/potion-sorter`.
- No temporary unregistered-catalog assertion is added.

- [ ] **Step 1: Add compile-safe GameID/icon without activating the catalog**

Add:

```ts
POTION_SORTER = 'potion_sorter',
```

and to `GAME_ICONS`:

```ts
[GameID.POTION_SORTER]: '🧪',
```

Add only stable identity assertions:

```ts
describe('Potion Sorter identifier', () => {
    it('defines the stable id and exhaustive icon', () => {
        expect(GameID.POTION_SORTER).toBe('potion_sorter')
        expect(getGameIcon(GameID.POTION_SORTER)).toBe('🧪')
    })
})
```

Do not add a `GAMES` object yet; an active catalog entry without `/potion-sorter` would break the route/catalog invariant during this commit.

Run:

```bash
bun run test:run src/lib/games.test.ts
```

Expected: PASS.

- [ ] **Step 2: Write RED runtime tests**

Use fake timers and explicit presets. Cover:

1. `createPotionSorterConfig()` defaults to Medium/300s.
2. `createInitialState()` clones the preset into live `tubes`.
3. `start()` enables actions.
4. selecting a non-empty tube returns `selected`; selecting it again returns `deselected`.
5. activating an empty tube with no source returns `invalid`.
6. invalid destination keeps the source selected and does not increment moves/history.
7. legal pour returns `poured`, clears selection, increments `movesMade`, and enables Undo.
8. `undo()` restores the exact pre-pour tubes, increments `undosUsed`, clears selection, leaves `movesMade` unchanged, and can repeat until history is empty.
9. pour → Undo → repeat the same pour yields `movesMade === 2`.
10. `newGame('hard')` while idle changes preset/state/timer to Hard/480s; active-run changes return false.
11. replay the exact Easy 10-pour solution and assert exactly one `puzzle_solved` score entry/end path.
12. timeout marks `result === 'timeout'`, leaves score 0, and rejects later tube/Undo actions.
13. final elapsed time uses the existing BaseGame timer snapshot.
14. submitted data equals the exact closed contract on solve and timeout.
15. Start → legal pour → Undo → Reset leaves the exported Easy preset literal unchanged.

For submitted data, access the protected method using the existing Mine Grid test pattern:

```ts
const getGameData = () =>
    (
        game as unknown as {
            getGameData: () => PotionSorterGameData
        }
    ).getGameData()
```

Immediate fake-timer Easy solve:

```ts
expect(getGameData()).toEqual({
    difficulty: 'easy',
    solved: true,
    movesMade: 10,
    undosUsed: 0,
    elapsedSeconds: 0,
})
```

Fresh Easy timeout after `180_000` ms:

```ts
expect(getGameData()).toEqual({
    difficulty: 'easy',
    solved: false,
    movesMade: 0,
    undosUsed: 0,
    elapsedSeconds: 180,
})
```

Preset-mutation freeze:

```ts
const easyLiteral = [
    ['cyan', 'magenta', 'amber', 'cyan'],
    ['magenta', 'amber', 'cyan', 'magenta'],
    ['amber', 'cyan', 'magenta', 'amber'],
    [],
    [],
]

// start -> 0->3 -> undo -> reset
expect(POTION_SORTER_PRESETS.easy.initialTubes).toEqual(easyLiteral)
```

Dead-end itself remains derived by `hasLegalMove()` and is tested in Task 2/Task 4; do not add `deadlocked` to game state.

- [ ] **Step 3: Implement the runtime**

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
}
```

`activateTube(index)` follows the four-result spec contract. For a successful pour:

```ts
this.history.push(this.state.tubes.map(tube => [...tube]))
this.state.tubes = poured.tubes
this.state.movesMade++
this.state.selectedTubeIndex = null
```

If solved:

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

`undo()` pops a snapshot, increments `undosUsed`, clears selection, and never changes `movesMade`.

`newGame(difficulty)` rejects active runs, calls existing protected `setDuration(preset.duration)`, assigns `config.preset`, then `reset()`.

`handleTimeUp()` sets `result = 'timeout'`, clears selection, emits state, then delegates to `super.handleTimeUp()`.

`onGameReset()` clears history and emits state.

`getGameData()` returns exactly:

```ts
return {
    difficulty: this.state.difficulty,
    solved: this.state.result === 'solved',
    movesMade: this.state.movesMade,
    undosUsed: this.state.undosUsed,
    elapsedSeconds: Math.floor(this.getTimerStatus().elapsedTime),
}
```

- [ ] **Step 4: Run focused runtime gates**

```bash
bun run test:run \
  src/lib/games.test.ts \
  src/lib/games/potion-sorter/PotionSorterGame.test.ts \
  src/lib/games/potion-sorter/puzzle.test.ts \
  src/lib/games/potion-sorter/scoring.test.ts \
  src/lib/games/potion-sorter/levels.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts \
  src/lib/games/potion-sorter/PotionSorterGame.ts \
  src/lib/games/potion-sorter/PotionSorterGame.test.ts
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
- Reuse patterns from: `src/lib/games/mine-grid/MineGridRenderer.ts`, `src/lib/games/mine-grid/initFramework.ts`, `src/lib/games/pattern-pulse/initFramework.ts`
- Explicitly do **not** create `src/lib/games/shared/dom.ts` in this task.

**Interfaces:**
- Renderer produces `setTubeActionCallback((index) => void)` and `createPotionSorterRendererConfig()`.
- Initializer returns `{ game, renderer, getGame, getState, restart, cleanup }`.
- `restart()` is the reset-to-idle handler; it does not auto-start.
- Initializer imports `hasLegalMove()` for dead-end presentation only; game state remains unchanged.

- [ ] **Step 1: Write RED renderer tests**

Set up `#potion-sorter-board`, initialize the renderer, render an Easy state, and assert:

- exactly five `button[data-tube-index]` elements;
- tube 0 has four `.potion-layer` children in bottom-to-top DOM order;
- each layer has `data-liquid`, glyph text, and `aria-hidden="true"`;
- tube `aria-label` contains human-readable liquid names;
- selected tube has `aria-pressed="true"` and a selected state attribute/class;
- a uniform capacity-4 tube gets a complete state;
- clicking a nested layer delegates exactly one callback with the parent tube index;
- focus on tube 2 survives rerender;
- `destroy()` removes the delegated listener and clears only dynamic board children via normal `DOMRenderer.cleanup()`.

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

Register exactly one stable delegated click handler in `setup()`. `renderGame()` clears/rebuilds tube buttons and restores focus by index. Do not use `innerHTML`.

- [ ] **Step 3: Write RED initializer tests including dead-end presentation and initial render**

Build a jsdom fixture with:

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

- missing outer container reports the existing DOM error path and returns undefined;
- one game/renderer instance is created;
- before Start, the initializer has already rendered seven Medium tube buttons, synced Medium/300, shown Start, disabled Undo, and selected Medium;
- Start starts the run and disables difficulty controls;
- difficulty buttons call `newGame()` only while idle and rerender the new board immediately;
- tube click flows through `activateTube()`;
- live region receives selected / invalid / poured / undo copy;
- Undo is disabled with no history, enabled after a legal pour, and invokes `undo()`;
- after the Medium dead-end path `3→5, 1→3, 4→6, 4→5`, status text equals `No pours left — undo or reset.` and `#undo-btn` has `data-dead-end="true"`;
- after Undo from that Medium dead end, status becomes `Last pour undone.` and `data-dead-end="false"`;
- after Hard `1→7, 4→8`, the same dead-end warning/emphasis appears;
- the clean Easy reference path never sets `data-dead-end="true"` before solve;
- Reset restores idle presentation/current difficulty and clears dead-end emphasis;
- solve/timeout overlay shows outcome/difficulty/score/moves/undos/time;
- **Play Again invokes the same reset handler as Reset, hides the overlay, leaves `state.isActive === false`, restores current board, and shows Start**;
- after a completed run, clicking Start directly still works through BaseGame's existing completed-run reset branch;
- active run sets beforeunload protection;
- cleanup removes tracked listeners and is idempotent.

- [ ] **Step 4: Implement the initializer with local presentation helpers and dead-end sync**

Keep one immutable `const game` and `const renderer`. Keep the same small local helper shape used by Mine Grid/Pattern Pulse; do not extract a one-consumer shared module:

```ts
const trackedListeners: Array<{
    target: EventTarget
    type: string
    handler: EventListener
}> = []

const listen = (
    target: EventTarget | null,
    type: string,
    handler: EventListener
): void => {
    if (!target) return
    target.addEventListener(type, handler)
    trackedListeners.push({ target, type, handler })
}

const setText = (id: string, value: string): void => {
    const element = document.getElementById(id)
    if (element) element.textContent = value
}
```

Also keep local:

```ts
setDifficultyButtonsDisabled(disabled)
setDifficultySelection(difficulty)
setStartVisible(visible)
hideOverlay()
syncHud(state)
syncUndoButton()
setStatus(message)
resetPresentation()
```

`syncUndoButton()` derives dead-end presentation from current state:

```ts
const syncUndoButton = (): void => {
    const button = document.getElementById('undo-btn') as HTMLButtonElement | null
    if (!button) return

    const state = game.getState()
    const deadEnded =
        state.isActive &&
        state.result === 'playing' &&
        !hasLegalMove(state.tubes)

    button.disabled = !game.canUndo()
    button.dataset.deadEnd = String(deadEnded)
}
```

The shared reset handler is the only Reset/Play Again implementation:

```ts
const resetHandler = (): void => {
    game.reset()
    renderer.render(game.getState())
    syncHud(game.getState())
    resetPresentation()
    syncUndoButton()
}

listen(document.getElementById('reset-btn'), 'click', resetHandler)
listen(document.getElementById('play-again-btn'), 'click', resetHandler)
```

Renderer callback must distinguish a dead end after a successful pour:

```ts
renderer.setTubeActionCallback(index => {
    const result = game.activateTube(index)

    switch (result) {
        case 'selected':
            setStatus(`Selected tube ${index + 1}.`)
            break
        case 'deselected':
            setStatus('Selection cleared.')
            break
        case 'poured': {
            const state = game.getState()
            if (
                state.result === 'playing' &&
                !hasLegalMove(state.tubes)
            ) {
                setStatus('No pours left — undo or reset.')
            } else {
                setStatus('Potion poured.')
            }
            break
        }
        case 'invalid':
            setStatus('That pour is not allowed.')
            break
    }

    syncUndoButton()
})
```

Undo handler:

```ts
const undoHandler: EventListener = () => {
    if (game.undo()) {
        setStatus('Last pour undone.')
    }
    syncUndoButton()
}
```

Use the same achievement/challenge forwarding and `beforeunload` structure as Mine Grid.

**Load-bearing init tail:** before returning the handle, render and synchronize the idle board exactly once:

```ts
renderer.render(game.getState())
syncHud(game.getState())
setStartVisible(true)
setDifficultyButtonsDisabled(false)
setDifficultySelection(game.getState().difficulty)
syncUndoButton()
```

This is required so Medium is visible before Start and so selecting Hard while idle immediately renders nine tubes for the mobile Playwright check.

- [ ] **Step 5: Run focused DOM tests and commit**

```bash
bun run test:run \
  src/lib/games/potion-sorter/PotionSorterRenderer.test.ts \
  src/lib/games/potion-sorter/initFramework.test.ts \
  src/lib/games/potion-sorter/PotionSorterGame.test.ts \
  src/lib/games/potion-sorter/puzzle.test.ts
bun run typecheck
```

Expected: PASS.

```bash
git add src/lib/games/potion-sorter/PotionSorterRenderer.ts \
  src/lib/games/potion-sorter/PotionSorterRenderer.test.ts \
  src/lib/games/potion-sorter/initFramework.ts \
  src/lib/games/potion-sorter/initFramework.test.ts
git commit -m "feat(potion-sorter): add accessible DOM controls and dead-end guidance"
```

---

### Task 5: Add the Astro page, active registry entry, shared data, achievements, organism fixture, and docs

**Files:**
- Create: `src/pages/potion-sorter/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `src/lib/organisms.test.ts`
- Modify: `CLAUDE.md`
- Verify unchanged symlink: `AGENTS.md`

**Interfaces:**
- Activates the already-reserved `GameID.POTION_SORTER` in `GAMES` only now that `/potion-sorter` exists.
- Adds `PotionSorterGameData` to the shared union and four achievements.
- Changes organism depth partition expectation from exactly `6 / 8 / 4` to exactly `6 / 9 / 4`.

- [ ] **Step 1: Create the page with the exact shared-chrome contract**

Start with:

```astro
<GamePage
  gameId="potion-sorter"
  title="Potion Sorter"
  description="Sort layered lab potions into matching tubes before time runs out"
  icon="🧪"
  showPause={false}
  showEnd={false}
  initialTime={300}
>
```

Do **not** provide `slot="controls"`; keep default shared Start/Reset controls.

Board mount:

```astro
<div id="potion-sorter-container" slot="game-board" class="w-full">
  <div
    id="potion-sorter-board"
    class="potion-sorter-board"
    aria-label="Potion tubes"
  ></div>
  <p id="potion-sorter-status" class="sr-only" aria-live="polite"></p>
</div>
```

In `slot="additional-stats"`, provide difficulty/moves/undos stats.

In `slot="game-info"`, create a game-specific card containing Easy / Medium / Hard buttons with Medium `aria-pressed="true"` initially, plus `#undo-btn` initially disabled. Keep How to Play and Scoring cards in the same sidebar.

Do not add `showUndo` to `GamePage`/`GameControls`.

Use the normal `final-stats` slot for outcome/difficulty/moves/undos/time; `GameOverlay` already owns `#play-again-btn` and final score.

Add dead-end emphasis without animation-only or color-only signaling:

```css
#undo-btn[data-dead-end='true'] {
  border-width: 2px;
  font-weight: 700;
  text-decoration: underline;
}
```

The normal theme color may still be used, but border weight/text decoration make the emphasis non-color-only.

Add responsive CSS so Hard's nine tubes wrap without horizontal document scrolling at 375px width. Liquid selectors key off `data-liquid`; glyphs remain visible.

The root-level script after `</GamePage>` calls `initPotionSorterGameFramework()` using the current Astro page pattern.

- [ ] **Step 2: Freeze markup before catalog activation**

Update `src/pages/game-board-markup.test.ts` to read the new page and assert:

```ts
expect(potionSorterMarkup).toContain('id="potion-sorter-container"')
expect(potionSorterMarkup).toContain('id="potion-sorter-board"')
expect(potionSorterMarkup).toContain('id="undo-btn"')
expect(potionSorterMarkup).toContain('data-dead-end')
expect(potionSorterMarkup).toContain('id="potion-sorter-status"')
expect(potionSorterMarkup).toContain('showPause={false}')
expect(potionSorterMarkup).toContain('showEnd={false}')
expect(potionSorterMarkup).toContain('initialTime={300}')
expect(potionSorterMarkup).not.toContain('id="end-btn"')
expect(potionSorterMarkup).toMatch(
    /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initPotionSorterGameFramework/
)
```

Also assert Easy/Medium/Hard IDs and add `'potion-sorter'` to the `games` route list only after the page file exists.

Run:

```bash
bun run test:run src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 3: Activate the catalog object, shared data, and exact organism partition**

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

Extend the stable registry test from Task 3 with active metadata assertions; there is no temporary undefined assertion to delete:

```ts
const potionSorter = getGameById(GameID.POTION_SORTER)
expect(potionSorter).toMatchObject({
    name: 'Potion Sorter',
    estimatedDuration: '3-8 minutes',
    difficulty: 'medium',
    isActive: true,
})
expect(getGameIcon(GameID.POTION_SORTER)).toBe('🧪')
expect(getGameUrl(GameID.POTION_SORTER)).toBe('/potion-sorter')
```

In `shared/types.ts`:

```ts
export type PotionSorterGameData =
    import('../potion-sorter/types').PotionSorterGameData
```

Append `| PotionSorterGameData` to `GameData`.

In `src/lib/organisms.test.ts`, change the exact frozen partition:

```ts
it('partitions games into 6 / 9 / 4 by depth', () => {
    expect(getGamesByDepth('shallow')).toHaveLength(6)
    expect(getGamesByDepth('mid')).toHaveLength(9)
    expect(getGamesByDepth('abyssal')).toHaveLength(4)
    // keep the existing all.length === GAMES.length and label assertions
})
```

Do not condition this edit; current main is explicitly `6 / 8 / 4`, and a new mid-depth game makes it `6 / 9 / 4`.

Do not change `src/pages/index.astro`.

- [ ] **Step 4: Add four achievements with boundary tests**

Add:

- `First Formula` — COMMON — `score >= 1`;
- `Clean Pour` — RARE — `gameData.solved === true && gameData.undosUsed === 0`;
- `Master Chemist` — EPIC — `gameData.solved === true && gameData.difficulty === 'hard'`;
- `Perfect Mixture` — LEGENDARY — `score >= 5500`.

Tests:

```text
First Formula: 0 => no; 1 => yes
Clean Pour: solved + 0 Undo => yes; solved + 1 Undo => no; timeout + 0 Undo => no
Master Chemist: Hard solved => yes; Medium solved => no; Hard timeout => no
Perfect Mixture: 5499 => no; 5500 => yes
```

The scorer test from Task 2 already proves Medium's arithmetic maximum is 5,100; do not add achievement-specific difficulty branching for Perfect Mixture.

- [ ] **Step 5: Update inventory and verify the symlink**

Update `CLAUDE.md` from 18 to **19** games and add Potion Sorter to:

- overview game list;
- `src/lib/games/` project tree;
- DOM-renderer architecture note;
- game-specific notes.

Clarify that `GameInitializer.ts` is currently not used by production games; do not delete or migrate it as part of HPA-72.

Verify:

```bash
test "$(readlink AGENTS.md)" = "CLAUDE.md"
```

- [ ] **Step 6: Run integration gates and commit**

```bash
bun run test:run \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts \
  src/pages/game-board-markup.test.ts \
  src/lib/games/potion-sorter
bun run typecheck
bun run lint
```

Expected: PASS.

```bash
git add src/pages/potion-sorter/index.astro \
  src/pages/game-board-markup.test.ts \
  src/lib/games.ts src/lib/games.test.ts \
  src/lib/games/shared/types.ts \
  src/lib/achievements.ts src/lib/achievements.test.ts \
  src/lib/organisms.test.ts \
  CLAUDE.md
git commit -m "feat(potion-sorter): register game and page"
```

---

### Task 6: Add real browser journeys and run full repository gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- Verify source-unchanged: `e2e/games/all-games-navigation.spec.ts`

**Interfaces:**
- Browser solve reuses the Easy solution from Task 1; no test-only production solve hook is added.
- A separate narrow-viewport check exercises Hard layout without solving it.
- The Hard layout test depends on Task 4's immediate idle render; it does not press Start.

- [ ] **Step 1: Add Easy Undo + clean solve + Play Again idle-reset journey**

Navigate to `/potion-sorter`, select Easy, and start.

First exercise Undo:

1. click tube `0`, then tube `3`;
2. click `#undo-btn`;
3. assert Moves remains `1` and Undos becomes `1`;
4. assert the initial Easy tube contents are restored;
5. click Reset and assert Moves/Undos return to `0`, Start is visible, and `#time-remaining` displays `180`.

Start again and solve with:

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

Assert:

- result overlay is visible and reports solved;
- difficulty is Easy;
- final moves is `10`;
- final score is positive;
- elapsed time is shown.

Click `#play-again-btn` and assert:

- overlay is hidden;
- Start is visible;
- `#time-remaining` displays exactly `180`;
- difficulty remains Easy;
- moves/undos are `0`;
- board is restored to the authored Easy literal.

Do **not** use a timing-sensitive “timer is not decrementing” browser assertion. Start-visible + exact restored Easy time + reset counters/board is the durable reset-to-idle contract.

- [ ] **Step 2: Add the 375×812 Hard wrapping/no-overflow check**

Use a separate test:

```ts
await page.setViewportSize({ width: 375, height: 812 })
await page.goto('/potion-sorter')
await page.locator('#hard-btn').click()

const tubes = page.locator('[data-tube-index]')
await expect(tubes).toHaveCount(9)

const firstBox = await tubes.nth(0).boundingBox()
const lastBox = await tubes.nth(8).boundingBox()
expect(firstBox).not.toBeNull()
expect(lastBox).not.toBeNull()
expect(lastBox!.y).toBeGreaterThan(firstBox!.y)

const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
)
expect(hasHorizontalOverflow).toBe(false)
```

This is a layout-only check. It intentionally selects Hard **before Start** to prove idle rendering and responsive wrapping together.

- [ ] **Step 3: Run focused browser coverage**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

Expected: Potion Sorter browser journeys pass and catalog navigation discovers `/potion-sorter` from `GAMES` without modifying the navigation spec.

- [ ] **Step 4: Run all final gates**

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

- [ ] **Step 5: Scope audit**

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

- no procedural generator or production solver file exists;
- no reverse-authoring helper ships in production;
- no package/dependency change;
- no new schema/migration;
- no `showUndo`/shared controls API change;
- no new `src/lib/games/shared/dom.ts` one-consumer abstraction;
- `AGENTS.md` is still the `CLAUDE.md` symlink;
- `all-games-navigation.spec.ts` remains source-unchanged.

- [ ] **Step 6: Commit browser coverage/final formatting changes**

```bash
git add e2e/games/play-coverage.spec.ts
# Add only files changed by required formatting, if any.
git commit -m "test(potion-sorter): cover solve undo replay and mobile wrap"
```

## Implementation Completion Checklist

Before marking HPA-72 done, verify:

- [ ] Three authored presets exactly match the spec and do not carry a redundant `capacity` field.
- [ ] Test-only exact solutions solve Easy/Medium/Hard with **10/20/28** pours.
- [ ] Medium/Hard are mixed-stack boards, not scaled copies of Easy.
- [ ] Standard contiguous top-run pour and partial-capacity behavior are locked.
- [ ] `hasLegalMove()` detects immediate playable/dead-ended boards without future-state search.
- [ ] Easy exhaustive content traversal has no unsolved dead end; Medium 4-pour and Hard 2-pour fixtures do.
- [ ] Dead-ended play announces “No pours left — undo or reset.” and visibly emphasizes Undo without ending the run.
- [ ] Invalid pours are no-ops.
- [ ] Undo is multi-step, cumulative-move-safe, and cleared by Reset.
- [ ] Start → pour → Undo → Reset leaves preset constants unchanged.
- [ ] Difficulty changes reuse one game instance and existing BaseGame duration support.
- [ ] Solved score uses exactly one pure scorer; timeout scores 0.
- [ ] Solved and timeout payloads match `PotionSorterGameData`; timeout has `solved: false`.
- [ ] Renderer uses native tube buttons, delegated click, focus restore, glyph + color cues.
- [ ] Initializer renders/syncs the idle board before returning.
- [ ] Play Again equals Reset-to-idle and does not auto-start.
- [ ] `GamePage` uses `showPause={false}`, `showEnd={false}`, `initialTime={300}`; no End button renders.
- [ ] Undo lives in game-info; shared `GameControls` is unchanged.
- [ ] 375×812 Hard mode renders nine tubes across multiple rows before Start with no horizontal document overflow.
- [ ] Result UI shows difficulty, score, moves, Undos, elapsed time.
- [ ] Existing BaseGame/ScoreManager flow submits scores/game data when logged in.
- [ ] Potion Sorter is the 19th active catalog game with `🧪` icon and valid route.
- [ ] Task 3 adds stable ID/icon only; Task 5 adds the active catalog object with the route, with no throwaway undefined assertion.
- [ ] `organisms.test.ts` freezes the updated **6 / 9 / 4** depth partition.
- [ ] Four achievements have boundary tests; 5,500 remains Hard-only because Medium max is 5,100.
- [ ] `CLAUDE.md` is current and `AGENTS.md` stays a symlink.
- [ ] No `shared/dom.ts` or GameInitializer refactor/delete is added to HPA-72.
- [ ] Unit, coverage, typecheck, lint, format, build, play-coverage, and catalog-navigation gates are green.
- [ ] No core runtime, backend, schema, PixiJS, generator, production solver, or generic framework expansion slipped into scope.
