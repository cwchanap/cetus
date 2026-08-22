# Potion Sorter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Potion Sorter, a 3–8 minute authored liquid-sorting puzzle with Easy/Medium/Hard boards, standard top-run pours, explicit dead-end guidance, multi-step Undo, move/time scoring, accessible desktop/mobile controls, achievements, and the existing Cetus score/leaderboard flow.

**Architecture:** `PotionSorterGame` extends `BaseGame` and owns selection, legal-pour application, cumulative move accounting, private Undo snapshots, difficulty switching, solve/timeout lifecycle, and score submission. `puzzle.ts` owns immediate pour/solved/legal-move predicates; `scoring.ts` is the single scorer. `PotionSorterRenderer` extends `DOMRenderer` and renders semantic tube buttons into Astro-owned `#potion-sorter-board`. Three authored presets are source-controlled and validated by exact test-only paths; no procedural generator or production solver is added.

**Tech Stack:** Astro 5 + TypeScript, Tailwind CSS 4, existing BaseGame/DOMRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-21-potion-sorter-design.md`

## Global Constraints

- Package manager: **Bun `1.3.1`**.
- One HPA-72 implementation PR; all implementation and verification stays in that PR.
- ID **`potion_sorter`**, route **`/potion-sorter`**, title **`Potion Sorter`**, icon **`🧪`**.
- Fixed game-wide capacity: **4**, defined once as `POTION_TUBE_CAPACITY`; `PotionSorterPreset` has no capacity field.
- Easy: **3 colors / 5 tubes / 180s / target 10 / base 1,000**.
- Medium: **5 colors / 7 tubes / 300s / target 20 / base 2,000**.
- Hard: **7 colors / 9 tubes / 480s / target 28 / base 3,000**.
- Every preset has exactly two empty tubes and four layers of each active color. Arrays are bottom-to-top.
- Standard pour: destination empty or top-match; move the maximum contiguous top run that fits.
- `hasLegalMove()` checks only immediate legal pours. An unsolved no-move board remains active and announces **“No pours left — undo or reset.”**
- Invalid actions do not increment `movesMade` or create history.
- Undo is unlimited while history exists, restores one pre-pour snapshot, increments `undosUsed`, and never decrements `movesMade`.
- Score only solved puzzles:

```text
moveBonus = max(0, moveTarget * 2 - movesMade) * 40
speedBonus = floor(max(0, remainingSeconds)) * 5
finalScore = completionBase + moveBonus + speedBonus
```

- Timeout score is **0**. `timeBonus: false`; `calculatePotionSorterScore()` is the only score formula.
- Reference full-time scores: **2,300 / 4,300 / 6,520**. Medium arithmetic maximum: **5,100**, keeping legendary **5,500** Hard-only.
- Reuse protected `BaseGame.setDuration()` for idle difficulty changes. Do not modify `BaseGame` or `GameTimer`.
- Use `BaseGame + DOMRenderer`; no PixiJS, drag physics, audio, generator, production solver, hints, generic puzzle framework, DB/schema/API changes, or new score path.
- Runtime cloning only at `createInitialState()`, pre-pour history snapshots, and immutable `pourPotion()`.
- Tube buttons use native click/Enter/Space. No document-level gameplay keyboard handler.
- Glyphs supplement liquid color: cyan `▲`, magenta `●`, amber `◆`, lime `✦`, violet `⬢`, coral `■`, azure `✚`.
- Play Again = Reset-to-idle; it does not auto-start.
- `GamePage`: `showPause={false}`, `showEnd={false}`, `initialTime={300}`.
- Keep default `GameControls`; `#undo-btn` lives in `slot="game-info"`. No `showUndo`, controls fork, or shared Undo API.
- `#undo-btn[data-dead-end='true']` gets non-color-only visual emphasis.
- Hard wraps nine tubes on narrow screens; tube index order is unchanged.
- Task 3 adds enum + exhaustive icon only. Task 5 adds active `GAMES` object with the route. No throwaway `getGameById(...) === undefined` assertion.
- `getGameUrl()`, `src/pages/index.astro`, and `e2e/games/all-games-navigation.spec.ts` stay source-unchanged.
- Adding a mid-depth game changes `src/lib/organisms.test.ts` from **6 / 8 / 4** to **6 / 9 / 4** exactly.
- Keep initializer helpers local. Do not add `src/lib/games/shared/dom.ts` in HPA-72.
- `src/lib/games/core/GameInitializer.ts` has no production importers; do not adopt/refactor/delete it here.
- Reuse BaseGame's run guard; no second stale token.
- Edit `CLAUDE.md`, not the `AGENTS.md` symlink.
- Codecov project/patch targets stay at the repository's existing **90%**.

## Load-Bearing Risks

- **Silent dead end:** Medium has a known 4-pour dead end; Hard has a 2-pour dead end.
- **Preset mutation:** Start → pour → Undo → Reset must leave exported preset literals unchanged.
- **Vacuous content tests:** all three reference paths must replay through real `pourPotion()`.
- **Undo score gaming:** Undo never reduces cumulative move cost.
- **Achievement payload:** solved and timeout must submit the exact `PotionSorterGameData` shape.
- **Idle board missing:** initializer renders/syncs once before returning so pre-Start difficulty changes are visible.
- **Mobile density:** Hard is verified at 375×812 without horizontal document overflow.

---

### Task 1: Contracts and authored content

**Files:**
- Create: `src/lib/games/potion-sorter/types.ts`
- Create: `src/lib/games/potion-sorter/levels.ts`
- Create: `src/lib/games/potion-sorter/levels.test.ts`

**Interfaces:**
- Produces `POTION_TUBE_CAPACITY`, all Potion Sorter unions/interfaces, and `POTION_SORTER_PRESETS`.
- `PotionSorterPreset` fields: `difficulty`, `duration`, `moveTarget`, `completionBase`, `initialTubes` only.

- [ ] **Step 1: Add closed contracts**

```ts
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

- [ ] **Step 2: Add exact preset literals**

```ts
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

No capacity field, clone helper, generator, reverse-authoring helper, or production solution table.

- [ ] **Step 3: Write content tests against the future pure helpers**

Use these exact test-only paths:

```ts
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
```

Create a local replay helper that clones the initial board and feeds every pair through `pourPotion()`, asserting each step is non-null.

For every preset assert:

```ts
expect(preset.initialTubes.filter(tube => tube.length === 0)).toHaveLength(2)
expect(
    preset.initialTubes.every(tube => tube.length <= POTION_TUBE_CAPACITY)
).toBe(true)
expect(SOLUTIONS[difficulty]).toHaveLength(preset.moveTarget)
```

Flatten liquids and assert every active color appears exactly four times. Assert all non-empty Medium/Hard tubes are mixed. Replay each reference path and assert solved.

Replay the Medium/Hard dead-end paths and assert:

```ts
expect(isPotionSorterSolved(dead)).toBe(false)
expect(hasLegalMove(dead)).toBe(false)
```

For Easy, exhaust reachable **runtime-playable** states without freezing an exact state count:

```ts
const start = POTION_SORTER_PRESETS.easy.initialTubes.map(tube => [...tube])
const queue: PotionTube[][] = [start]
const seen = new Set([JSON.stringify(start)])

while (queue.length > 0) {
    const tubes = queue.shift()!
    if (isPotionSorterSolved(tubes)) {
        continue // gameplay ends here; do not explore moves after solve
    }

    expect(hasLegalMove(tubes)).toBe(true)

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

The missing `./puzzle` import is the intentional RED state. Do not commit `levels.test.ts` until Task 2 turns it green.

- [ ] **Step 4: Commit green contracts/content**

```bash
git add src/lib/games/potion-sorter/types.ts src/lib/games/potion-sorter/levels.ts
git commit -m "feat(potion-sorter): add authored puzzle presets"
```

---

### Task 2: Pure puzzle rules, dead-end predicate, and scorer

**Files:**
- Create: `src/lib/games/potion-sorter/puzzle.ts`
- Create: `src/lib/games/potion-sorter/puzzle.test.ts`
- Create: `src/lib/games/potion-sorter/scoring.ts`
- Create: `src/lib/games/potion-sorter/scoring.test.ts`
- Complete: `src/lib/games/potion-sorter/levels.test.ts`

**Interfaces:**
- Produces `getTopRunLength()`, `pourPotion()`, `isPotionSorterSolved()`, `hasLegalMove()`, `calculatePotionSorterScore()`.

- [ ] **Step 1: Write RED rule tests**

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

expect(pourPotion([['cyan'], ['magenta']], 0, 1)).toBeNull()
expect(pourPotion([['cyan'], []], 0, 0)).toBeNull()
expect(pourPotion([[], ['cyan']], 0, 1)).toBeNull()
expect(pourPotion([['cyan'], ['cyan', 'cyan', 'cyan', 'cyan']], 0, 1)).toBeNull()
```

Add the partial-capacity case where a two-layer top run moves only one layer into a three-full matching destination.

```ts
expect(isPotionSorterSolved([
    ['cyan', 'cyan', 'cyan', 'cyan'],
    ['magenta', 'magenta', 'magenta', 'magenta'],
    [],
])).toBe(true)
expect(isPotionSorterSolved([['cyan'], []])).toBe(false)
expect(isPotionSorterSolved([])).toBe(false)

expect(hasLegalMove([['cyan'], []])).toBe(true)
expect(hasLegalMove([['cyan'], ['magenta']])).toBe(false)
expect(hasLegalMove([])).toBe(false)
```

- [ ] **Step 2: Implement one legality path**

```ts
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
            if (pourPotion(tubes, source, destination, capacity)) return true
        }
    }
    return false
}
```

For at most nine tiny tubes, reuse of `pourPotion()` is simpler than adding a second `canPour()` implementation.

Run:

```bash
bun run test:run \
  src/lib/games/potion-sorter/puzzle.test.ts \
  src/lib/games/potion-sorter/levels.test.ts
```

Expected: PASS.

- [ ] **Step 3: Write RED scoring tests**

```ts
expect(calculatePotionSorterScore(POTION_SORTER_PRESETS.easy, 180, 10, true)).toBe(2300)
expect(calculatePotionSorterScore(POTION_SORTER_PRESETS.medium, 300, 20, true)).toBe(4300)
expect(calculatePotionSorterScore(POTION_SORTER_PRESETS.hard, 480, 28, true)).toBe(6520)
expect(calculatePotionSorterScore(POTION_SORTER_PRESETS.easy, 100, 20, true)).toBe(1500)
expect(calculatePotionSorterScore(POTION_SORTER_PRESETS.easy, 100, 30, true)).toBe(1500)
expect(calculatePotionSorterScore(POTION_SORTER_PRESETS.easy, -5, 10, true)).toBe(1400)
expect(calculatePotionSorterScore(POTION_SORTER_PRESETS.easy, 180, 10, false)).toBe(0)
expect(calculatePotionSorterScore(POTION_SORTER_PRESETS.medium, 300, 0, true)).toBe(5100)
```

- [ ] **Step 4: Implement the scorer**

```ts
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

Run `bun run test:run src/lib/games/potion-sorter`; expected PASS.

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

### Task 3: GameID/icon and BaseGame runtime

**Files:**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Create: `src/lib/games/potion-sorter/PotionSorterGame.ts`
- Create: `src/lib/games/potion-sorter/PotionSorterGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`, `src/lib/games/core/GameTimer.ts`

**Interfaces:**
- Produces `GameID.POTION_SORTER`, icon, `createPotionSorterConfig()`, `activateTube()`, `undo()`, `canUndo()`, `newGame()`, stats, and submitted data.
- Active catalog object remains Task 5-owned so no route-less active game is created.

- [ ] **Step 1: Reserve stable ID/icon only**

```ts
// GameID
POTION_SORTER = 'potion_sorter',

// GAME_ICONS
[GameID.POTION_SORTER]: '🧪',
```

Stable test only:

```ts
expect(GameID.POTION_SORTER).toBe('potion_sorter')
expect(getGameIcon(GameID.POTION_SORTER)).toBe('🧪')
```

Do not add a temporary undefined-catalog assertion.

Run `bun run test:run src/lib/games.test.ts`; expected PASS.

- [ ] **Step 2: Write RED runtime tests**

Cover all of these exact contracts:

1. default config is Medium/300s;
2. initial tubes are a clone, not the preset array;
3. actions are rejected before Start and accepted while active;
4. select/deselect/empty-source behavior;
5. invalid destination preserves selection and does not increment moves/history;
6. legal pour clears selection, increments moves, enables Undo;
7. Undo restores exact pre-pour tubes, increments `undosUsed`, leaves `movesMade` unchanged;
8. pour → Undo → same pour yields `movesMade === 2`;
9. `newGame('hard')` succeeds idle and sets 480s; active change returns false;
10. exact Easy path solves and awards exactly one `puzzle_solved` entry;
11. timeout results in `timeout`, score 0, and later actions rejected;
12. final elapsed time uses BaseGame's final timer snapshot;
13. exact submitted payload on solve and timeout;
14. Start → pour → Undo → Reset leaves exported Easy literal unchanged.

Access protected game data like existing Mine Grid tests:

```ts
const getGameData = () =>
    (
        game as unknown as {
            getGameData: () => PotionSorterGameData
        }
    ).getGameData()
```

Immediate Easy solve must yield:

```ts
expect(getGameData()).toEqual({
    difficulty: 'easy',
    solved: true,
    movesMade: 10,
    undosUsed: 0,
    elapsedSeconds: 0,
})
```

Fresh Easy timeout after `180_000` fake milliseconds must yield:

```ts
expect(getGameData()).toEqual({
    difficulty: 'easy',
    solved: false,
    movesMade: 0,
    undosUsed: 0,
    elapsedSeconds: 180,
})
```

- [ ] **Step 3: Implement runtime**

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

For a successful `activateTube()` pour:

```ts
this.history.push(this.state.tubes.map(tube => [...tube]))
this.state.tubes = poured.tubes
this.state.movesMade++
this.state.selectedTubeIndex = null
```

When solved, set `result = 'solved'`, add exactly `calculatePotionSorterScore(...)` with reason `puzzle_solved`, emit final state, then `void this.end().catch(...)`.

`undo()` pops one snapshot, increments `undosUsed`, clears selection, and never changes moves. `newGame()` rejects active state, calls `setDuration(preset.duration)`, assigns `config.preset`, then resets. `handleTimeUp()` sets timeout/clears selection/emits state before `super.handleTimeUp()`. `onGameReset()` clears history.

`getGameData()`:

```ts
return {
    difficulty: this.state.difficulty,
    solved: this.state.result === 'solved',
    movesMade: this.state.movesMade,
    undosUsed: this.state.undosUsed,
    elapsedSeconds: Math.floor(this.getTimerStatus().elapsedTime),
}
```

Do not add `deadlocked` to state; Task 4 derives it through `hasLegalMove()`.

- [ ] **Step 4: Focused gates**

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

### Task 4: DOM renderer, initializer, dead-end guidance

**Files:**
- Create: `src/lib/games/potion-sorter/PotionSorterRenderer.ts`
- Create: `src/lib/games/potion-sorter/PotionSorterRenderer.test.ts`
- Create: `src/lib/games/potion-sorter/initFramework.ts`
- Create: `src/lib/games/potion-sorter/initFramework.test.ts`
- Reuse unchanged: `src/lib/games/renderers/DOMRenderer.ts`
- Reuse patterns: Mine Grid/Pattern Pulse custom initializers.
- Do not create `src/lib/games/shared/dom.ts`.

**Interfaces:**
- Renderer: `setTubeActionCallback((index) => void)`, `createPotionSorterRendererConfig()`.
- Initializer: `{ game, renderer, getGame, getState, restart, cleanup }`; `restart()` means reset-to-idle.

- [ ] **Step 1: RED renderer tests**

Assert after Easy render:

- five `button[data-tube-index]`;
- four `.potion-layer` children on tube 0 in bottom-to-top order;
- `data-liquid`, glyph text, `aria-hidden="true"` per layer;
- human-readable tube `aria-label`;
- selected `aria-pressed="true"`;
- uniform full tube marked complete;
- nested-layer click delegates one tube index;
- focus on tube 2 survives rerender;
- destroy removes listener and clears dynamic board children via normal DOMRenderer cleanup.

- [ ] **Step 2: Renderer implementation**

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

Register one stable delegated click in `setup()`. Rebuild buttons without `innerHTML`, then restore focus by `data-tube-index`.

- [ ] **Step 3: RED initializer tests**

Fixture IDs:

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

Assert:

- missing outer container uses existing DOM error path;
- exactly one game/renderer instance;
- **before Start**, seven Medium tubes are already rendered, Medium is selected, time is 300, Start is visible, Undo disabled;
- idle difficulty change rerenders immediately; active change rejected;
- native tube click reaches `activateTube()`;
- selected/invalid/poured/undo messages;
- Undo disabled without history and enabled after legal pour;
- Medium dead-end path `3→5, 1→3, 4→6, 4→5` produces exact live message and `data-dead-end="true"`;
- Undo from dead end says `Last pour undone.` and clears `data-dead-end`;
- Hard `1→7, 4→8` produces the same dead-end signal;
- clean Easy reference path never enters dead-end presentation before solve;
- Reset clears dead-end state and returns idle;
- result overlay includes outcome/difficulty/score/moves/undos/time;
- Play Again invokes same reset handler, hides overlay, keeps inactive, restores board, shows Start;
- direct Start after completed run still works via BaseGame;
- beforeunload only protects active run;
- cleanup is idempotent.

- [ ] **Step 4: Implement local init helpers and derived dead-end UI**

Keep helper boilerplate local rather than creating a one-consumer shared API:

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

Keep local `setDifficultyButtonsDisabled`, `setDifficultySelection`, `setStartVisible`, `hideOverlay`, `syncHud`, `syncUndoButton`, `setStatus`, `resetPresentation`.

Dead-end/Undo sync:

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

Reset and Play Again share exactly one handler:

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

Tube callback:

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
            setStatus(
                state.result === 'playing' && !hasLegalMove(state.tubes)
                    ? 'No pours left — undo or reset.'
                    : 'Potion poured.'
            )
            break
        }
        case 'invalid':
            setStatus('That pour is not allowed.')
            break
    }
    syncUndoButton()
})
```

Undo:

```ts
if (game.undo()) setStatus('Last pour undone.')
syncUndoButton()
```

Reuse current achievement/challenge forwarding and beforeunload shape from Mine Grid.

**Required init tail before returning the handle:**

```ts
renderer.render(game.getState())
syncHud(game.getState())
setStartVisible(true)
setDifficultyButtonsDisabled(false)
setDifficultySelection(game.getState().difficulty)
syncUndoButton()
```

- [ ] **Step 5: Focused gates and commit**

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

### Task 5: Page, active catalog, achievements, organisms, docs

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
- Verify unchanged: `AGENTS.md` symlink

**Interfaces:**
- Activates the Task 3 ID only now that `/potion-sorter` exists.
- Adds shared data union, four achievements, and exact 6/9/4 organism partition.

- [ ] **Step 1: Create Astro page with exact chrome**

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

Keep default controls; do not define `slot="controls"`.

Board:

```astro
<div id="potion-sorter-container" slot="game-board" class="w-full">
  <div id="potion-sorter-board" class="potion-sorter-board" aria-label="Potion tubes"></div>
  <p id="potion-sorter-status" class="sr-only" aria-live="polite"></p>
</div>
```

In `additional-stats`: difficulty/moves/undos. In `game-info`: Easy/Medium/Hard plus:

```astro
<Button
  id="undo-btn"
  type="button"
  variant="outline"
  size="sm"
  disabled
  data-dead-end="false"
>Undo</Button>
```

Add How to Play/Scoring. Use normal `final-stats`; `GameOverlay` owns Play Again/final score.

Dead-end CSS:

```css
#undo-btn[data-dead-end='true'] {
  border-width: 2px;
  font-weight: 700;
  text-decoration: underline;
}
```

Add wrap layout for nine tubes at 375px. Liquid color selectors use `data-liquid`; glyph remains visible. Root-level script calls initializer after `</GamePage>`.

- [ ] **Step 2: Markup tests before catalog activation**

```ts
expect(potionSorterMarkup).toContain('id="potion-sorter-container"')
expect(potionSorterMarkup).toContain('id="potion-sorter-board"')
expect(potionSorterMarkup).toContain('id="undo-btn"')
expect(potionSorterMarkup).toContain('data-dead-end="false"')
expect(potionSorterMarkup).toContain('id="potion-sorter-status"')
expect(potionSorterMarkup).toContain('showPause={false}')
expect(potionSorterMarkup).toContain('showEnd={false}')
expect(potionSorterMarkup).toContain('initialTime={300}')
expect(potionSorterMarkup).not.toContain('id="end-btn"')
expect(potionSorterMarkup).toMatch(
    /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initPotionSorterGameFramework/
)
```

Assert difficulty IDs and add `'potion-sorter'` to route list. Run `bun run test:run src/pages/game-board-markup.test.ts`; expected PASS.

- [ ] **Step 3: Activate catalog/shared data and update organism partition**

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

Extend Task 3's stable ID/icon test with:

```ts
const potionSorter = getGameById(GameID.POTION_SORTER)
expect(potionSorter).toMatchObject({
    name: 'Potion Sorter',
    estimatedDuration: '3-8 minutes',
    difficulty: 'medium',
    isActive: true,
})
expect(getGameUrl(GameID.POTION_SORTER)).toBe('/potion-sorter')
```

Shared data:

```ts
export type PotionSorterGameData =
    import('../potion-sorter/types').PotionSorterGameData
```

Append it to `GameData`.

Update organism fixture exactly:

```ts
it('partitions games into 6 / 9 / 4 by depth', () => {
    expect(getGamesByDepth('shallow')).toHaveLength(6)
    expect(getGamesByDepth('mid')).toHaveLength(9)
    expect(getGamesByDepth('abyssal')).toHaveLength(4)
    // preserve existing all.length === GAMES.length and zone-label assertions
})
```

Do not modify `src/pages/index.astro`.

- [ ] **Step 4: Achievements + boundaries**

- `First Formula` — COMMON — score ≥ 1.
- `Clean Pour` — RARE — solved && `undosUsed === 0`.
- `Master Chemist` — EPIC — solved && difficulty hard.
- `Perfect Mixture` — LEGENDARY — score ≥ 5500.

Tests:

```text
First Formula: 0 no / 1 yes
Clean Pour: solved+0 yes / solved+1 no / timeout+0 no
Master Chemist: hard solved yes / medium solved no / hard timeout no
Perfect Mixture: 5499 no / 5500 yes
```

Do not add difficulty logic to Perfect Mixture; Task 2 proves Medium max 5,100.

- [ ] **Step 5: CLAUDE inventory and unused initializer note**

Update 18→19 games, game list, project tree, DOM-renderer note, and Potion Sorter note. State that `GameInitializer.ts` currently has no production game importers; do not delete/migrate it here.

```bash
test "$(readlink AGENTS.md)" = "CLAUDE.md"
```

- [ ] **Step 6: Integration gates and commit**

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
  src/lib/organisms.test.ts CLAUDE.md
git commit -m "feat(potion-sorter): register game and page"
```

---

### Task 6: Browser journeys and final gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- Verify source-unchanged: `e2e/games/all-games-navigation.spec.ts`

- [ ] **Step 1: Easy Undo + clean solve + Play Again reset**

Navigate `/potion-sorter`, select Easy, Start. Perform `0→3`, Undo. Assert Moves `1`, Undos `1`, initial Easy contents restored. Reset and assert Moves/Undos `0`, Start visible, `#time-remaining` exactly `180`.

Start and solve with:

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

Assert solved overlay, Easy, final moves `10`, positive score, elapsed time shown.

Click Play Again. Assert overlay hidden, Start visible, `#time-remaining` exactly `180`, Easy remains selected, moves/undos `0`, authored board restored. Do not use a racy “timer is not decrementing” assertion.

- [ ] **Step 2: 375×812 Hard idle wrapping**

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

expect(await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth
)).toBe(false)
```

Do not Start; this verifies Task 4's idle render and Task 5's responsive CSS together.

- [ ] **Step 3: Focused browser gates**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

Expected: PASS; catalog navigation discovers route from `GAMES` without editing the navigation spec.

- [ ] **Step 4: Full gates**

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

Expected: all pass and configured coverage statuses remain satisfiable.

- [ ] **Step 5: Scope audit**

Confirm no production diff in:

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

Also confirm no generator, production solver, reverse-authoring helper, package/dependency, schema/migration, `showUndo`, shared controls API, `src/lib/games/shared/dom.ts`, or all-games-navigation change. `AGENTS.md` remains the `CLAUDE.md` symlink.

- [ ] **Step 6: Commit browser coverage**

```bash
git add e2e/games/play-coverage.spec.ts
# Add only files actually touched by required formatting, if any.
git commit -m "test(potion-sorter): cover solve undo replay and mobile wrap"
```

## Implementation Completion Checklist

- [ ] Presets exactly match spec; no redundant preset capacity field.
- [ ] Exact 10/20/28 solution paths solve through `pourPotion()`.
- [ ] Easy exhaustive runtime-playable traversal has no unsolved dead end.
- [ ] Medium 4-pour and Hard 2-pour fixtures are unsolved/no-legal-move.
- [ ] Dead end announces “No pours left — undo or reset.” and emphasizes Undo without ending the run.
- [ ] Contiguous top-run/partial-capacity/invalid rules are locked.
- [ ] Undo is multi-step, move-cumulative, Reset-cleared.
- [ ] Presets remain unchanged across Start → pour → Undo → Reset.
- [ ] Difficulty changes reuse one game instance/setDuration.
- [ ] Scorer is single authority; timeout score 0.
- [ ] Solved/timeout payloads exactly match `PotionSorterGameData`.
- [ ] Renderer uses native buttons, delegation, focus restore, glyph + color.
- [ ] Initializer renders idle board before returning.
- [ ] Play Again = Reset-to-idle.
- [ ] GamePage has no Pause/End and initialTime 300; Undo is in game-info.
- [ ] Hard renders nine tubes before Start and wraps at 375px without overflow.
- [ ] Potion Sorter is active game 19 with `🧪`, route, shared data, four achievements.
- [ ] Organism partition is exactly 6/9/4.
- [ ] Task 3 reserves ID/icon; Task 5 adds active catalog; no throwaway undefined test.
- [ ] No `shared/dom.ts` or GameInitializer refactor/delete.
- [ ] `CLAUDE.md` current; `AGENTS.md` symlink intact.
- [ ] Unit/coverage/typecheck/lint/format/build/play-coverage/catalog-navigation all green.
- [ ] No core/backend/schema/PixiJS/generator/production-solver/generic-framework expansion.
