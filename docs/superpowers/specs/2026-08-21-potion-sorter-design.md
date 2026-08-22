# Potion Sorter — Design Spec

- **Linear issue:** [HPA-72 — Minigame: Potion Sorter](https://linear.app/cwchanap/issue/HPA-72/minigame-potion-sorter)
- **Date:** 2026-08-21
- **Status:** Planning draft, ready for implementation

## Overview

Potion Sorter is a relaxing liquid-sorting puzzle with a sci-fi lab presentation. Each tube contains up to four liquid layers. The player selects a source tube, then a destination tube; the game pours the contiguous top run when the destination is empty or already has the same liquid on top. The puzzle is solved when every non-empty tube is full and contains one liquid color.

Version 1 deliberately uses three authored puzzles rather than procedural generation. The existing `BaseGame` lifecycle already provides countdown timing, reset/replay, score submission, stale-run suppression, and achievement integration, while the existing `DOMRenderer` path is a better fit than PixiJS for a small set of semantic tube buttons. HPA-72 therefore stays game-local: no new runtime, solver, database/API work, or shared puzzle framework.

## Product Goals

- Add a recognizable water-sort style puzzle that fits Cetus' sci-fi lab theme.
- Keep individual runs in the requested 3–8 minute range through fixed 180/300/480 second caps and progressively denser authored boards.
- Make the game fully usable with mouse, touch, and native keyboard activation.
- Give Undo and Reset enough usability value without allowing Undo to erase the cost of prior moves.
- Detect a board with no remaining legal pour and tell the player to Undo or Reset instead of leaving the run silently stuck.
- Reward successful sorting, fewer legal pours, and faster completion through one pure scoring function.
- Reuse the existing BaseGame timer, score, achievement, leaderboard, catalog, and run-staleness paths.
- Keep authored puzzle content inspectable and cheap to test.

## Non-Goals

Version 1 intentionally does **not** include:

- procedural or seeded puzzle generation;
- a production puzzle solver or optimality checker;
- automatic dead-end recovery, auto-solve, or automatic run termination on a dead end;
- Daily/Expedition modes or persistent progression;
- drag-and-drop pouring, gesture physics, or animated liquid simulation;
- audio;
- special tubes, blockers, frozen layers, or power-ups;
- hints;
- custom puzzle editors or user-created layouts;
- a generic sorting-puzzle engine;
- new database tables, score endpoints, leaderboard modes, or auth behavior;
- PixiJS rendering.

## Core Rules

### Tube model

All v1 tubes have capacity **4**. A tube is represented as a `PotionColor[]` ordered **bottom to top**.

```ts
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
```

Each difficulty contains exactly one complete set of four layers for every active color plus two empty tubes. Capacity is a game-wide rule, not a per-difficulty configuration field.

### Legal pour

A pour from source `s` to destination `d` is legal only when all of the following are true:

1. `s !== d`;
2. the source is non-empty;
3. the destination has free capacity;
4. the destination is empty **or** its top liquid matches the source top liquid.

When legal, pour as many layers as possible from the source's contiguous top run:

```text
layersMoved = min(sourceTopRunLength, destinationFreeCapacity)
```

The move is atomic from the game/UI perspective. A player cannot choose a partial amount manually. Invalid attempts do not change the board, increment moves, or create Undo history.

### Selection behavior

`PotionSorterGame.activateTube(index)` owns the complete two-click interaction contract:

- with no source selected, activating a non-empty tube selects it;
- activating an empty tube with no selection is invalid;
- activating the selected tube again deselects it;
- activating another tube attempts a pour from the selected source;
- a successful pour clears selection;
- an invalid destination keeps the original source selected so the player can try another tube.

The method returns one small result union for UI feedback:

```ts
export type PotionSorterActionResult =
    | 'selected'
    | 'deselected'
    | 'poured'
    | 'invalid'
```

The initializer uses this result only for live-status copy. It does not duplicate pour rules.

### Solved and dead-ended state

The puzzle is solved when every non-empty tube is both:

- exactly capacity 4; and
- uniform (`new Set(tube).size === 1`).

Empty spare tubes are valid at completion.

A **dead-ended** board is an unsolved board for which no source/destination pair produces a legal pour. `puzzle.ts` exposes one pure predicate:

```ts
export function hasLegalMove(
    tubes: PotionTube[],
    capacity?: number
): boolean
```

Dead-end detection is advisory, not a fourth terminal result. A dead-ended run remains active so the player can use the existing multi-step Undo or Reset controls. After a successful pour, if the board is still unsolved and `hasLegalMove()` is false, the existing `#potion-sorter-status` live region announces **“No pours left — undo or reset.”** and `#undo-btn` receives a non-color-only emphasized state. Undo clears that emphasis when it restores a playable snapshot.

This is intentionally not a solver: it only checks whether at least one immediate legal pour exists using the same local pour rules already required for gameplay.

## Authored Difficulty Presets

All boards are checked in as typed TypeScript constants. There is no JSON schema or puzzle registry.

| Difficulty | Colors | Tubes | Timer | Authored move target | Completion base |
|---|---:|---:|---:|---:|---:|
| Easy | 3 | 5 | 180s | 10 | 1,000 |
| Medium | 5 | 7 | 300s | 20 | 2,000 |
| Hard | 7 | 9 | 480s | 28 | 3,000 |

`moveTarget` is a shipped authored reference solution length, **not** a claim of mathematical optimality. Tests replay one known legal solution for each preset. No production solver is added merely to prove content that is fixed in source control.

Easy intentionally keeps the cyclic tutorial board. Medium and Hard are distinct mixed-stack boards. They are authored offline by starting from solved color tubes, applying inverse/reverse pours that are guaranteed to be undone by legal forward pours, then checking in only the resulting board; the corresponding forward path lives only in `levels.test.ts`. This is an authoring technique, not runtime machinery.

### Easy — 3 colors

Bottom → top:

```ts
[
    ['cyan', 'magenta', 'amber', 'cyan'],
    ['magenta', 'amber', 'cyan', 'magenta'],
    ['amber', 'cyan', 'magenta', 'amber'],
    [],
    [],
]
```

The Easy state space is small enough for a test-only exhaustive traversal. The content test proves every reachable unsolved Easy state has at least one legal pour; there is no production search code.

### Medium — 5 colors

Bottom → top:

```ts
[
    ['magenta', 'magenta', 'amber', 'cyan'],
    ['amber', 'violet', 'violet', 'cyan'],
    ['lime', 'lime', 'amber', 'cyan'],
    ['violet', 'violet', 'cyan', 'lime'],
    ['magenta', 'magenta', 'lime', 'amber'],
    [],
    [],
]
```

The frozen 20-pour reference solution is:

```ts
[
    [4, 6], [6, 5], [2, 6], [5, 2], [6, 5],
    [0, 6], [2, 0], [5, 6], [0, 2], [6, 5],
    [2, 0], [3, 6], [6, 4], [1, 5], [3, 5],
    [1, 3], [2, 1], [4, 2], [0, 1], [4, 0],
]
```

Medium can also reach a dead end. The content test freezes one short example, `3→5, 1→3, 4→6, 4→5`, and proves the resulting board is unsolved with no legal pour. This exists to protect the dead-end warning contract, not to reject the authored puzzle.

### Hard — 7 colors

Bottom → top:

```ts
[
    ['cyan', 'magenta', 'cyan', 'magenta'],
    ['amber', 'amber', 'amber', 'azure'],
    ['lime', 'lime', 'coral', 'magenta'],
    ['violet', 'violet', 'lime', 'cyan'],
    ['coral', 'coral', 'coral', 'violet'],
    ['azure', 'violet', 'magenta', 'cyan'],
    ['azure', 'azure', 'amber', 'lime'],
    [],
    [],
]
```

The frozen 28-pour reference solution is:

```ts
[
    [0, 7], [7, 8], [0, 7], [8, 0], [7, 8], [0, 7], [0, 8],
    [8, 0], [7, 8], [0, 7], [8, 0], [7, 8], [5, 7], [8, 7],
    [0, 8], [7, 0], [8, 7], [3, 0], [6, 3], [2, 7], [5, 7],
    [4, 5], [2, 4], [3, 2], [5, 3], [1, 5], [6, 1], [6, 5],
]
```

The hard board deliberately uses all seven mixed non-empty tubes and two empty staging tubes. Difficulty comes from more colors, more simultaneously mixed stacks, and more staging decisions rather than from a generator or special rules.

Hard can dead-end after `1→7, 4→8`. The content test freezes that two-pour dead-end so the UI warning cannot silently regress while the board itself remains valid and solvable through the authored reference path.

## Undo and Reset Semantics

### Undo history

The game keeps a private stack of pre-pour tube snapshots:

```ts
private history: PotionTube[][] = []
```

Before each successful pour, the current tube layout is deep-cloned and pushed. `undo()` pops exactly one snapshot.

Undo:

- is available only during an active, unsolved run;
- clears any selected source;
- increments `undosUsed`;
- does **not** decrement `movesMade`;
- does not modify score directly;
- can be repeated until history is empty.

Keeping `movesMade` cumulative prevents a player from repeatedly pouring and undoing until only the final clean path remains in the score record. The puzzle remains forgiving, but mistakes still cost efficiency.

Every history snapshot is taken immediately before a successful legal pour, so an Undo necessarily restores a board that had at least that pour available. The initializer therefore recomputes its dead-end presentation after Undo rather than storing a second deadlock state.

### Reset

The existing BaseGame reset path is authoritative. Reset restores the current difficulty's authored board, clears selection/history/moves/undos/result, resets the timer, and returns to idle. The player presses Start again.

`newGame(difficulty)` is allowed only while idle. It reuses the protected `BaseGame.setDuration()` seam added for Mine Grid, updates the active preset, then resets in the same game instance. No instance replacement or listener reattachment is introduced.

### Play Again

Play Again deliberately follows Mine Grid and Pattern Pulse rather than auto-starting. `#play-again-btn` calls the same `resetHandler` as Reset: restore the current authored preset, clear run-local state, hide the result overlay, return to idle, and show Start. This keeps idle difficulty changes available after a result and avoids a second replay path.

The existing `BaseGame.start()` completed-run branch remains useful for the normal Start button if the user starts directly after a completed run without first pressing Reset/Play Again; Potion Sorter does not add its own auto-replay method.

## Timing and Outcomes

Potion Sorter is a countdown game because HPA-72 defines a bounded 3–8 minute round and explicitly rewards faster completion.

```ts
export type PotionSorterResult = 'playing' | 'solved' | 'timeout'
```

- **Solved:** calculate and award the full score once, emit final state, then end.
- **Timeout:** mark `timeout`, clear selection, emit final state, and end with score 0.
- **Dead end:** keep the run active and explicitly direct the player to Undo or Reset.
- **Reset / Play Again:** local lifecycle actions, not scored results.

There is no manual End Game action in v1.

## Scoring

One pure function in `scoring.ts` is the only production scoring authority.

For a solved puzzle:

```text
moveBonus = max(0, moveTarget * 2 - movesMade) * 40
speedBonus = floor(max(0, remainingSeconds)) * 5
finalScore = completionBase + moveBonus + speedBonus
```

Timeouts receive **0**. Dead ends are not scored because they are not terminal; Undo/Reset remain available.

At the shipped reference move target with effectively no elapsed time, the **reference scores** are:

- Easy: `1,000 + 10*40 + 180*5 = 2,300`
- Medium: `2,000 + 20*40 + 300*5 = 4,300`
- Hard: `3,000 + 28*40 + 480*5 = 6,520`

These are not mathematical score ceilings because a shorter-than-reference solution earns a larger move bonus. The formula's arithmetic upper bounds at zero moves are 2,700 / 5,100 / 7,640 respectively. Zero moves cannot actually solve an unsolved authored board, but the bounds are useful for achievement partitioning: **5,500 is unreachable in Medium even under the formula's impossible zero-move bound, so Perfect Mixture remains Hard-only.**

A solution above `2 * moveTarget` simply receives no move bonus. `BaseGame` is configured with `timeBonus: false`; Potion Sorter's own scorer already includes time and remains the single authority.

## Runtime Contracts

```ts
export type PotionSorterDifficulty = 'easy' | 'medium' | 'hard'

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

The tube layout and Undo history are not submitted or persisted. Both solved and timeout paths submit the same closed data shape; timeout sets `solved: false`.

## Architecture

### BaseGame + DOMRenderer

Potion Sorter is input-driven, has no continuous simulation, and renders fewer than ten interactive objects. `BaseGame + DOMRenderer` remains the simplest fit.

`PotionSorterGame` extends `BaseGame`. `PotionSorterRenderer` extends `DOMRenderer`. The game's `update()` and `render()` methods are no-ops; page rendering occurs from `state-change`/BaseGame callbacks through the renderer.

No changes are planned for `BaseGame.ts`, `GameTimer.ts`, `DOMRenderer.ts`, score services, APIs, or database schema.

`src/lib/games/core/GameInitializer.ts` currently has no production importers. Potion Sorter does not adopt, refactor, or delete that dead/unused framework in HPA-72; it follows the custom initializer pattern used by the recent games. Any repository-wide initializer cleanup is a separate concern.

### Pure puzzle helpers

`puzzle.ts` owns only game-local immutable board operations:

```ts
export function getTopRunLength(tube: PotionTube): number
export function pourPotion(
    tubes: PotionTube[],
    sourceIndex: number,
    destinationIndex: number,
    capacity?: number
): { tubes: PotionTube[]; layersMoved: number } | null
export function isPotionSorterSolved(
    tubes: PotionTube[],
    capacity?: number
): boolean
export function hasLegalMove(
    tubes: PotionTube[],
    capacity?: number
): boolean
```

`pourPotion()` returns a new cloned tube layout for legal pours and `null` for invalid attempts. It never mutates its input. `hasLegalMove()` returns true as soon as any immediate source/destination pair yields a legal pour; it does not explore future states.

There is no extra clone helper in `levels.ts`. Runtime cloning occurs only at the mutation boundaries that need ownership:

1. `createInitialState()` clones `preset.initialTubes` into live state;
2. a successful pour pushes a pre-pour deep clone into Undo history;
3. `pourPotion()` clones its input before applying the pure result.

A runtime regression proves Start → pour → Undo → Reset leaves the exported preset literal unchanged.

### Authored levels

`levels.ts` exports the three `POTION_SORTER_PRESETS` and nothing else. A test-only solution/dead-end table lives in `levels.test.ts`; production does not ship solution paths, reverse-authoring helpers, or a solver.

### File structure

```text
src/lib/games/potion-sorter/
  types.ts
  levels.ts
  levels.test.ts
  puzzle.ts
  puzzle.test.ts
  scoring.ts
  scoring.test.ts
  PotionSorterGame.ts
  PotionSorterGame.test.ts
  PotionSorterRenderer.ts
  PotionSorterRenderer.test.ts
  initFramework.ts
  initFramework.test.ts
src/pages/potion-sorter/
  index.astro
```

Platform integration also updates the existing registry, achievements, shared game-data union, markup tests, catalog E2E coverage, and `CLAUDE.md` inventory.

## Component Responsibilities

### `types.ts`

Defines the closed color/difficulty/result/action unions plus preset/config/state/stats/submitted-data contracts. Tube capacity remains the module-level `POTION_TUBE_CAPACITY`; it is not repeated on each preset.

### `levels.ts`

Owns the exact three authored preset literals and their duration/move-target/completion-base values. It does not clone, generate, validate, or solve content at runtime.

### `puzzle.ts`

Owns legal-pour rules, solved-state detection, and immediate legal-move detection. It knows nothing about timers, score, DOM, Undo history, or achievements.

### `scoring.ts`

Calculates the solved score from one preset plus `remainingSeconds` and `movesMade`. It returns 0 for unsolved results and does not call score services.

### `PotionSorterGame.ts`

Owns:

- current difficulty/preset;
- source selection through `activateTube(index)`;
- successful pour application;
- private multi-step Undo history;
- cumulative `movesMade` and `undosUsed`;
- solved detection and one-time score award;
- timeout outcome;
- idle-only `newGame(difficulty)`;
- reset/history cleanup;
- `getGameStats()` / `getGameData()` using BaseGame's preserved final timer status;
- `state-change` emission after accepted selection, pour, Undo, reset, and timeout changes.

Dead-end detection remains derived from the public tube state through the pure `hasLegalMove()` helper; `PotionSorterGame` does not add a redundant `deadlocked` field or terminal result.

### `PotionSorterRenderer.ts`

The renderer owns only the dynamic contents of `#potion-sorter-board`. It registers exactly one delegated `click` listener on the board container and resolves `button[data-tube-index]`.

Each render rebuilds the small set of tube buttons from state, then restores focus to the same tube index when possible. Each tube is a real `<button type="button">` with:

- `data-tube-index`;
- selected/complete state attributes;
- `aria-pressed="true"` only for the selected source;
- one authoritative `aria-label` describing tube number and contents;
- up to four visual layer spans ordered bottom-to-top.

The visual layer map uses both color and a glyph so color is never the only cue:

| Liquid | Glyph |
|---|---|
| cyan | `▲` |
| magenta | `●` |
| amber | `◆` |
| lime | `✦` |
| violet | `⬢` |
| coral | `■` |
| azure | `✚` |

Layer spans are `aria-hidden`; the button label remains the accessible source of truth.

### `initFramework.ts`

The initializer follows the existing custom Mine Grid/Pattern Pulse pattern rather than introducing or refactoring `GameInitializer`.

It:

- requires outer `#potion-sorter-container` and inner `#potion-sorter-board`;
- creates one immutable game and renderer instance;
- wires Start and Reset from the default `GameControls` plus Play Again, Undo, and difficulty controls;
- binds Play Again to the same reset handler as Reset;
- forwards renderer tube activation to `game.activateTube(index)`;
- after each successful pour derives whether the unsolved board has any legal move; a dead end announces “No pours left — undo or reset.” and emphasizes Undo;
- after Undo recomputes/clears dead-end presentation rather than storing extra state;
- updates score, time, difficulty, move count, Undo count/availability, selected state, and result overlay;
- writes concise selection/invalid/pour/undo/dead-end copy into `#potion-sorter-status` (`aria-live="polite"`);
- disables difficulty controls while active;
- disables Undo when no history is available or the run is inactive;
- adds/removes `beforeunload` protection only while active;
- forwards BaseGame achievement/challenge notifications;
- immediately renders/synchronizes the initial idle Medium board before returning its handle;
- exposes the same small debug/test handle shape used by recent games: `getGame()`, `getState()`, `restart()`, `cleanup()`.

The initializer keeps the small local `listen`/`setText`/presentation helpers used by the recent games. HPA-72 does **not** introduce `src/lib/games/shared/dom.ts`: extracting a shared API while migrating no existing consumer would add a one-consumer abstraction without reducing current duplication. No keyboard listener is needed because tube buttons use native Enter/Space activation.

## Page and Mobile Design

`src/pages/potion-sorter/index.astro` uses `GamePage` and Astro-owned static structure with these load-bearing props:

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

`initialTime={300}` matches the default Medium preset during SSR. Runtime difficulty changes continue to update the live timer through the existing BaseGame/GameTimer callbacks.

The page keeps the default `GameControls`; it does **not** fork `slot="controls"` and does not add a generic `showUndo` prop. Start and Reset come from the shared controls. `#undo-btn` lives in the `slot="game-info"` sidebar next to the Easy/Medium/Hard controls, using the same game-specific-sidebar pattern as Mine Grid's extra action controls. `GameOverlay` supplies `#play-again-btn`.

The page includes:

- Easy/Medium/Hard controls;
- `#undo-btn` in game-info;
- `#potion-sorter-board` dynamic tube grid;
- score, timer, moves, and Undo counters;
- `#potion-sorter-status` live status;
- concise How to Play and Scoring copy;
- result overlay with outcome, difficulty, score, moves, Undos, and elapsed time.

`#undo-btn[data-dead-end='true']` receives an explicit border/text emphasis in addition to the live-region message. The emphasis does not rely on animation or color alone.

The board uses responsive wrapping rather than horizontal scrolling. Nine hard-mode tubes must wrap onto additional rows at a 375×812 viewport while preserving logical index order. Tube order remains stable and spatial position has no game-rule meaning.

Touch targets remain at least roughly 48 CSS pixels wide. There is no hover-only interaction and no drag requirement. The page's initializer `<script>` remains at page root after `</GamePage>`.

## Platform Integration

### Game ID and route registration

`GAME_ICONS` is an exhaustive `Record<GameID, string>`, so the enum and icon must land together before runtime code can compile:

```ts
GameID.POTION_SORTER = 'potion_sorter'
[GameID.POTION_SORTER]: '🧪'
```

Task 3 adds only that compile-time identity plus focused ID/icon assertions. The active `GAMES` object remains deferred until Task 5 creates `/potion-sorter`, preserving the existing route-before-active-catalog invariant. There is no temporary `getGameById(...)=undefined` assertion to add and later delete.

This split is intentional: registering the active `GAMES` object before its route exists would create a locally broken catalog/navigation state. The enum itself may already be accepted by generic ID validation during intermediate branch commits, but those commits are not a shipped compatibility boundary and do not justify exposing a route-less active game.

Registry metadata added with the route:

- name: `Potion Sorter`
- description: `Sort layered lab potions into matching tubes before time runs out`
- category: `puzzle`
- max players: `1`
- estimated duration: `3-8 minutes`
- difficulty: `medium`
- tags: `['sorting', 'logic', 'puzzle', 'single-player', 'casual']`
- active: `true`
- organism: `{ shape: 'cluster', color: 'magenta' }`
- depth: `mid`
- icon: `🧪`

`getGameUrl()` already derives `/potion-sorter`; no helper change is required. The home page derives catalog count/cards from `GAMES`, so no home-page implementation change is needed beyond registry activation.

### Score/API/database

No schema or endpoint change is required. Existing score/API validation derives game IDs from `GameID`, and BaseGame/ScoreManager already submit the final score and game data with stale-run suppression.

### Shared game data

`src/lib/games/shared/types.ts` adds a canonical alias to `PotionSorterGameData` plus the `GameData` union member.

### Organism partition

Potion Sorter is authored as `{ shape: 'cluster', color: 'magenta' }` at `depth: 'mid'`. The current organism test freezes the depth partition at **6 shallow / 8 mid / 4 abyssal**. Registration therefore changes that exact fixture to **6 / 9 / 4** in the same task; this is not conditional.

## Achievements

Add four game-local achievement definitions using the existing achievement system:

| Achievement | Rarity | Condition |
|---|---|---|
| First Formula | COMMON | Potion Sorter score ≥ 1 |
| Clean Pour | RARE | solved with `undosUsed === 0` |
| Master Chemist | EPIC | solve Hard difficulty |
| Perfect Mixture | LEGENDARY | score ≥ 5,500 |

The 5,500 legendary threshold is Hard-only by construction: Medium's arithmetic maximum under the scorer is 5,100 even at impossible zero moves and full remaining time, while the Hard reference path scores 6,520 at full remaining time.

## Documentation

Update `CLAUDE.md` from 18 to 19 implemented games, add the new game directory/renderer note, and describe Potion Sorter as a BaseGame + DOMRenderer authored liquid-sort puzzle.

`AGENTS.md` is a symlink to `CLAUDE.md`; implementation edits only `CLAUDE.md` and verifies the symlink remains intact.

## Risks and Mitigations

### Authored puzzle correctness

A typo could create an unsolvable or malformed board. Tests validate every color occurs exactly four times, every tube length is at most `POTION_TUBE_CAPACITY`, there are exactly two empty tubes, and replay the exact 10/20/28-pour legal solutions. No production solver is needed.

### Silent dead end

Medium and Hard can reach unsolved states with no legal immediate pour; Hard has a two-pour example. Without a distinct signal, all later clicks look like ordinary invalid attempts while the timer continues. `hasLegalMove()` derives the condition after a successful pour, the live region tells the player to Undo or Reset, and Undo receives a visible emphasized state. The run stays active; no auto-recovery or terminal deadlock state is added.

### Preset mutation

`POTION_SORTER_PRESETS` is source content and must remain unchanged across runs. `levels.ts` exports literals only; runtime clones at initial-state creation, Undo snapshot push, and inside pure `pourPotion()`. A game-level test performs Start → legal pour → Undo → Reset and then compares the exported Easy preset to its original literal.

### Undo score gaming

If Undo decremented moves, a player could erase mistakes from the efficiency score. `movesMade` is cumulative and never decremented; Undo has its own `undosUsed` counter.

### Nested DOM focus loss

Renderer rebuilds tube buttons but restores focus by `data-tube-index`.

### Mobile hard-board density

Nine tubes are too wide for a single phone row. The board wraps while preserving logical indices. A Playwright 375×812 check selects Hard while idle, asserts nine tubes exist from the initializer's initial render, verifies the last tube is on a later visual row, and asserts `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.

### Async score submission race

Use BaseGame's existing run guard. Do not add a Potion Sorter token or block replay on network completion.

## Verification Strategy

Focused tests cover:

- top-run detection and exact legal/illegal pour semantics;
- partial pours when destination capacity is smaller than the source top run;
- `hasLegalMove()` true/false behavior without future-state search;
- input immutability for pure puzzle helpers;
- solved-state detection;
- preset shape/color multiplicity and exact 10/20/28-pour known-solution replay;
- exhaustive Easy reachable-state check proving no unsolved dead end;
- concrete Medium four-pour and Hard two-pour dead-end fixtures;
- scoring at timeout, reference move counts, over-target moves, remaining-time floors, and Medium's <5,500 arithmetic maximum;
- selection/deselection/invalid destination behavior;
- move counting, private Undo restoration, cumulative move cost, repeated Undo, reset cleanup;
- preset constants unchanged after Start → pour → Undo → Reset;
- solve and timeout lifecycle with one-time scoring;
- exact `PotionSorterGameData` on solved and timeout paths (`solved: false` on timeout);
- idle difficulty changes using existing BaseGame duration support;
- renderer delegation, focus restoration, glyph/non-color cues, labels, selected/complete state, and cleanup;
- initializer DOM contract, immediate idle render, Reset/Play Again equivalence, Start/Undo/difficulty wiring, dead-end live copy/emphasis, unload guard, and cleanup;
- `GamePage` props `showPause={false}`, `showEnd={false}`, `initialTime={300}`, `#undo-btn`, and absence of `#end-btn`;
- GameID/icon reservation, then route/catalog activation, exact organism partition 6/9/4, shared game-data, achievements, and inventory updates;
- Playwright Easy Undo + clean solve + Play Again idle reset with displayed time restored to 180;
- Playwright 375×812 Hard wrapping/no-horizontal-overflow check before Start;
- existing catalog navigation derived from `GAMES`.

Final gates:

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

## Acceptance Criteria

- Potion Sorter appears in the 19-game catalog with icon, duration, difficulty, and derived Play Now link.
- Easy/Medium/Hard use exactly the authored capacity-4 boards and 180/300/480 second timers above.
- Medium and Hard are distinct mixed-stack boards with frozen legal 20/28-pour reference solutions; Easy remains the 10-pour tutorial board.
- Legal pours move the contiguous top run onto an empty/matching destination; invalid pours are no-ops.
- An unsolved board with no legal pour announces “No pours left — undo or reset.” and visibly emphasizes Undo without ending the run.
- Mouse/touch click and native keyboard activation use the same tube action path.
- Undo restores multiple prior successful pours but never decrements cumulative move count.
- Reset and Play Again both restore the current authored puzzle to idle; Play Again does not auto-start.
- Solving awards the pure completion + move + speed score and submits through existing BaseGame/ScoreManager flow when logged in.
- Timeout ends with score 0 and submits game data with `solved: false`.
- Result UI shows difficulty, score, moves, Undos, and elapsed time.
- `GamePage` hides Pause/End and initially renders the Medium 300-second timer.
- Undo is game-specific sidebar UI rather than a shared GameControls fork.
- Liquid layers have visible glyph cues in addition to color.
- Hard mode renders all nine tubes while idle and wraps without horizontal page overflow at 375px width.
- Organism tests update the depth partition from 6/8/4 to 6/9/4.
- `PotionSorterPreset` does not carry a redundant capacity field; the one game-wide capacity source is `POTION_TUBE_CAPACITY`.
- No `shared/dom.ts` one-consumer abstraction is added; no existing initializer is migrated in HPA-72.
- No procedural generator, production solver, PixiJS, drag physics, hint system, generic puzzle framework, or backend/schema/API work is added.
