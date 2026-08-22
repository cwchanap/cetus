# Potion Sorter — Design Spec

- **Linear issue:** [HPA-72 — Minigame: Potion Sorter](https://linear.app/cwchanap/issue/HPA-72/minigame-potion-sorter)
- **Date:** 2026-08-21
- **Status:** Planning draft, ready for implementation

## Overview

Potion Sorter is a relaxing liquid-sorting puzzle with a sci-fi lab presentation. Each tube contains up to four liquid layers. The player selects a source tube, then a destination tube; the game pours the contiguous top run when the destination is empty or already has the same liquid on top. The puzzle is solved when every non-empty tube is full and contains one liquid color.

Version 1 deliberately uses three authored puzzles rather than procedural generation. The existing `BaseGame` lifecycle already provides countdown timing, reset/replay, score submission, stale-run suppression, and achievement integration, while the existing `DOMRenderer` path is a better fit than PixiJS for a small set of semantic tube buttons. HPA-72 therefore stays game-local: no new runtime, solver, database/API work, or shared puzzle framework.

## Product Goals

- Add a recognizable water-sort style puzzle that fits Cetus' sci-fi lab theme.
- Keep individual runs in the requested 3–8 minute range.
- Make the game fully usable with mouse, touch, and native keyboard activation.
- Give Undo and Reset enough usability value without allowing Undo to erase the cost of prior moves.
- Reward successful sorting, fewer legal pours, and faster completion through one pure scoring function.
- Reuse the existing BaseGame timer, score, achievement, leaderboard, catalog, and run-staleness paths.
- Keep authored puzzle content inspectable and cheap to test.

## Non-Goals

Version 1 intentionally does **not** include:

- procedural or seeded puzzle generation;
- a production puzzle solver or optimality checker;
- Daily/Expedition modes or persistent progression;
- drag-and-drop pouring, gesture physics, or animated liquid simulation;
- audio;
- special tubes, blockers, frozen layers, or power-ups;
- hints or auto-solve;
- custom puzzle editors or user-created layouts;
- a generic sorting-puzzle engine;
- new database tables, score endpoints, leaderboard modes, or auth behavior;
- PixiJS rendering.

## Core Rules

### Tube model

All v1 tubes have capacity **4**. A tube is represented as a `PotionColor[]` ordered **bottom to top**.

```ts
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

Each difficulty contains exactly one complete set of four layers for every active color plus two empty tubes.

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

The move is atomic from the game/UI perspective. A player cannot choose a partial amount manually.

Invalid attempts do not change the board, increment moves, or create Undo history.

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

The initializer uses this result only for live-status copy. It does not duplicate game rules.

### Solved state

The puzzle is solved when every non-empty tube is both:

- exactly capacity 4; and
- uniform (`new Set(tube).size === 1`).

Empty spare tubes are valid at completion.

## Authored Difficulty Presets

All boards are checked in as typed TypeScript constants. There is no JSON schema or puzzle registry.

| Difficulty | Colors | Tubes | Timer | Authored move target | Completion base |
|---|---:|---:|---:|---:|---:|
| Easy | 3 | 5 | 180s | 10 | 1,000 |
| Medium | 5 | 7 | 300s | 16 | 2,000 |
| Hard | 7 | 9 | 480s | 22 | 3,000 |

`moveTarget` is a shipped authored reference solution length, **not** a claim of mathematical optimality. Tests replay one known legal solution for each preset. No production solver is added merely to prove content that is fixed in source control.

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

### Medium — 5 colors

Bottom → top:

```ts
[
    ['cyan', 'magenta', 'amber', 'lime'],
    ['magenta', 'amber', 'lime', 'violet'],
    ['amber', 'lime', 'violet', 'cyan'],
    ['lime', 'violet', 'cyan', 'magenta'],
    ['violet', 'cyan', 'magenta', 'amber'],
    [],
    [],
]
```

### Hard — 7 colors

Bottom → top:

```ts
[
    ['cyan', 'magenta', 'amber', 'lime'],
    ['magenta', 'amber', 'lime', 'violet'],
    ['amber', 'lime', 'violet', 'coral'],
    ['lime', 'violet', 'coral', 'azure'],
    ['violet', 'coral', 'azure', 'cyan'],
    ['coral', 'azure', 'cyan', 'magenta'],
    ['azure', 'cyan', 'magenta', 'amber'],
    [],
    [],
]
```

The cyclic authored layouts scale predictably without adding random difficulty spikes. Each preset has two empty tubes, matching the familiar water-sort rule set and keeping the hard board usable on mobile.

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

### Reset

The existing BaseGame reset path is authoritative. Reset restores the current difficulty's authored board, clears selection/history/moves/undos/result, resets the timer, and returns to idle. The player presses Start again.

`newGame(difficulty)` is allowed only while idle. It reuses the protected `BaseGame.setDuration()` seam added for Mine Grid, updates the active preset, then resets in the same game instance. No instance replacement or listener reattachment is introduced.

### Play Again

After solve or timeout, the existing `BaseGame.start()` completed-run branch resets the same preset before starting a new run. The page's Play Again button uses that path rather than maintaining a second replay implementation.

## Timing and Outcomes

Potion Sorter is a countdown game because HPA-72 defines a bounded 3–8 minute round and explicitly rewards faster completion.

```ts
export type PotionSorterResult = 'playing' | 'solved' | 'timeout'
```

- **Solved:** calculate and award the full score once, emit final state, then end.
- **Timeout:** mark `timeout`, clear selection, emit final state, and end with score 0.
- **Reset:** local lifecycle action, not a scored result.

There is no manual End Game action in v1.

## Scoring

One pure function in `scoring.ts` is the only production scoring authority.

For a solved puzzle:

```text
moveBonus = max(0, moveTarget * 2 - movesMade) * 40
speedBonus = floor(max(0, remainingSeconds)) * 5
finalScore = completionBase + moveBonus + speedBonus
```

Timeouts receive **0**.

At the shipped reference move target with effectively no elapsed time, the score ceilings are:

- Easy: `1,000 + 10*40 + 180*5 = 2,300`
- Medium: `2,000 + 16*40 + 300*5 = 4,140`
- Hard: `3,000 + 22*40 + 480*5 = 6,280`

A faster or more efficient solution can score higher than the reference path; a solution above `2 * moveTarget` simply receives no move bonus. This keeps the formula easy to explain and avoids needing an optimal solver.

`BaseGame` is configured with `timeBonus: false`; Potion Sorter's own scorer already includes time and must remain the single authority.

## Runtime Contracts

```ts
export type PotionSorterDifficulty = 'easy' | 'medium' | 'hard'

export interface PotionSorterPreset {
    difficulty: PotionSorterDifficulty
    duration: number
    capacity: 4
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

The tube layout and Undo history are not submitted or persisted.

## Architecture

### BaseGame + DOMRenderer

Potion Sorter is input-driven, has no continuous simulation, and renders fewer than ten interactive objects. `BaseGame + DOMRenderer` therefore remains the simplest fit.

`PotionSorterGame` extends `BaseGame`. `PotionSorterRenderer` extends `DOMRenderer`. The game's `update()` and `render()` methods are no-ops; page rendering occurs from `state-change`/BaseGame callbacks through the renderer.

No changes are planned for `BaseGame.ts`, `GameTimer.ts`, `DOMRenderer.ts`, `GameInitializer.ts`, score services, APIs, or database schema.

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
```

`pourPotion()` returns a new deep-cloned tube layout for legal pours and `null` for invalid attempts. It never mutates its input. This makes move tests and Undo snapshots straightforward without introducing a generic immutable-state library.

### Authored levels

`levels.ts` exports the three `POTION_SORTER_PRESETS` and nothing else. A test-only solution table lives in `levels.test.ts`; production does not ship solution paths or a solver.

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

Defines the closed color/difficulty/result/action unions plus preset/config/state/stats/submitted-data contracts.

### `levels.ts`

Owns the exact three authored preset boards and their duration/move-target/completion-base values. Returned initial layouts are cloned before runtime use so resets cannot mutate the checked-in constants.

### `puzzle.ts`

Owns legal-pour rules and solved-state detection. It knows nothing about timers, score, DOM, Undo history, or achievements.

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

### `PotionSorterRenderer.ts`

The renderer owns only the dynamic contents of `#potion-sorter-board`.

It registers exactly one delegated `click` listener on the board container and resolves:

```text
button[data-tube-index]
```

Each render rebuilds the small set of tube buttons from state, then restores focus to the same tube index when possible.

Each tube is a real `<button type="button">` with:

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
- wires Start, Reset, Play Again, Undo, and difficulty controls;
- forwards renderer tube activation to `game.activateTube(index)`;
- updates score, time, difficulty, move count, Undo count/availability, selected state, and result overlay;
- writes concise selection/invalid/pour/undo copy into `#potion-sorter-status` (`aria-live="polite"`);
- disables difficulty controls while active;
- disables Undo when no history is available or the run is inactive;
- adds/removes `beforeunload` protection only while active;
- forwards BaseGame achievement/challenge notifications;
- exposes the same small debug/test handle shape used by recent games: `getGame()`, `getState()`, `restart()`, `cleanup()`.

No keyboard listener is needed because tube buttons use native Enter/Space activation.

## Page and Mobile Design

`src/pages/potion-sorter/index.astro` uses `GamePage` and Astro-owned static structure.

The page includes:

- Easy/Medium/Hard controls;
- `#potion-sorter-board` dynamic tube grid;
- Start, Reset, Undo, and Play Again controls;
- score, timer, moves, and Undo counters;
- `#potion-sorter-status` live status;
- concise How to Play and Scoring copy;
- result overlay with outcome, difficulty, score, moves, Undos, and elapsed time.

The board uses a responsive CSS grid/wrap layout rather than horizontal scrolling. Nine hard-mode tubes may wrap onto a second row on narrow phones. Tube order remains stable and spatial position has no game-rule meaning.

Touch targets remain at least roughly 48 CSS pixels wide. There is no hover-only interaction and no drag requirement.

The page's initializer `<script>` remains at page root after `</GamePage>`, matching the current Astro integration pattern.

## Platform Integration

### Registry

Add:

```ts
GameID.POTION_SORTER = 'potion_sorter'
```

only in the same implementation task that creates `/potion-sorter`, preserving the existing route-before-active-registry invariant.

Registry metadata:

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

`getGameUrl()` already derives `/potion-sorter`; no helper change is required.

The home page already derives catalog count/cards from `GAMES`, so no home-page implementation change is needed beyond registry activation.

### Score/API/database

No schema or endpoint change is required. Existing score/API validation derives game IDs from `GameID`, and BaseGame/ScoreManager already submit the final score and game data with stale-run suppression.

### Shared game data

`src/lib/games/shared/types.ts` adds a canonical alias to `PotionSorterGameData` plus the `GameData` union member.

## Achievements

Add four game-local achievement definitions using the existing achievement system:

| Achievement | Rarity | Condition |
|---|---|---|
| First Formula | COMMON | Potion Sorter score ≥ 1 |
| Clean Pour | RARE | solved with `undosUsed === 0` |
| Master Chemist | EPIC | solve Hard difficulty |
| Perfect Mixture | LEGENDARY | score ≥ 5,500 |

The legendary threshold is intentionally below the shipped hard reference ceiling of 6,280 but above the medium reference ceiling of 4,140.

## Documentation

Update `CLAUDE.md` from 18 to 19 implemented games, add the new game directory/renderer note, and describe Potion Sorter as a BaseGame + DOMRenderer authored liquid-sort puzzle.

`AGENTS.md` is a symlink to `CLAUDE.md`; implementation edits only `CLAUDE.md` and verifies the symlink remains intact.

## Risks and Mitigations

### Authored puzzle correctness

A typo could create an unsolvable or malformed board. Tests validate every color occurs exactly four times, every tube fits capacity, there are exactly two empty tubes, and replay a concrete known legal solution for Easy/Medium/Hard. No production solver is needed.

### Undo score gaming

If Undo decremented moves, a player could erase mistakes from the efficiency score. `movesMade` is cumulative and never decremented; Undo has its own `undosUsed` counter.

### Nested state mutation

Pure `pourPotion()` returns a fresh deep-cloned tube layout and presets are cloned into each initial state. Undo snapshots are deep clones. No runtime operation mutates `POTION_SORTER_PRESETS`.

### Mobile hard-board density

Nine tubes are too wide for a single phone row. The board wraps while preserving logical indices; interactions use tube index, not physical row/column.

### Async score submission race

Use BaseGame's existing run guard. Do not add a Potion Sorter token or block replay on network completion.

## Verification Strategy

Focused tests cover:

- top-run detection and exact legal/illegal pour semantics;
- partial pours when destination capacity is smaller than the source top run;
- input immutability for pure puzzle helpers;
- solved-state detection;
- preset shape/color multiplicity and concrete known-solution replay for all three difficulties;
- scoring at timeout, target move counts, over-target moves, and remaining-time floors;
- selection/deselection/invalid destination behavior;
- move counting, private Undo restoration, cumulative move cost, repeated Undo, reset cleanup;
- solve and timeout lifecycle with one-time scoring;
- idle difficulty changes using existing BaseGame duration support;
- renderer delegation, focus restoration, glyph/non-color cues, labels, selected/complete state, and cleanup;
- initializer DOM contract, Start/Reset/Undo/Play Again/difficulty wiring, live status, unload guard, and cleanup;
- registry, shared game-data, achievements, icon, page markup, and inventory updates;
- Playwright touch/click-equivalent solve/replay smoke using the known Easy solution;
- existing catalog navigation derived from `GAMES`.

Final gates:

```bash
bun run test:run
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
- Legal pours move the contiguous top run onto an empty/matching destination; invalid pours are no-ops.
- Mouse/touch click and native keyboard activation use the same tube action path.
- Undo restores multiple prior successful pours but never decrements cumulative move count.
- Reset restores the current authored puzzle and clears Undo/move state.
- Solving awards the pure completion + move + speed score and submits through existing BaseGame/ScoreManager flow when logged in.
- Timeout ends with score 0.
- Result UI shows difficulty, score, moves, Undos, and elapsed time.
- Liquid layers have visible glyph cues in addition to color.
- No procedural generator, production solver, PixiJS, drag physics, hint system, generic puzzle framework, or backend/schema/API work is added.