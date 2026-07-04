# Cetus Games Refactoring — PR 2: BaseGame Framework Migration (Phase 6)

> **Scope:** This plan covers PR 2 of the games consolidation effort. It is stacked on PR 1 (`refactor/games-shared-foundation`), which delivers the shared modules, bug fixes, and GameData contract alignment this phase depends on.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 9 legacy-classic games onto the core framework (`BaseGame` + `GameInitializer` + `ScoreManager` + `GameTimer` + `BaseRenderer`), eliminating duplication and inconsistency. After this PR, 12 of 14 games are framework-native; the 2 handle-based games (Circuit Hacker, Satellite Sync) are blessed as a deliberate pattern.

**Architecture:** The codebase has 14 games in 3 architectural camps:
- **Framework-native (3 games):** Snake, Bejeweled, Quick Math — already on `BaseGame`
- **Legacy-classic (9 games):** Tetris, Bubble Shooter, Memory Matrix, 2048, Word Scramble, Reflex, Path Navigator, Evader, Sudoku — targets of this PR
- **Handle-based (2 games):** Circuit Hacker, Satellite Sync — deliberately use `ScoreManager`/`GameTimer` directly; blessed in AGENTS.md

**Prerequisites (from PR 1):**
- Shared modules: `shared/grid.ts`, `shared/geometry.ts`, `shared/match3.ts`, `shared/direction.ts`, `shared/spawner.ts`
- GameData contracts aligned across all games
- P0 behavioral bugs fixed
- Dead legacy code removed (Snake, Quick Math)

**Tech Stack:** Astro 5, TypeScript, PixiJS 8, Vitest, Kysely/LibSQL, Better Auth.

## Global Constraints

- **Package manager:** Bun (`bun@1.3.1`) — use `bun run` for all scripts
- **Test command:** `bun run test:run` (Vitest, jsdom environment)
- **Lint command:** `bun run lint` (ESLint)
- **Format command:** `bun run format` (Prettier)
- **Single test file:** `bun run test src/path/to/file.test.ts`
- **No comments** unless explicitly requested by existing code conventions
- **No innerHTML for DOM structure** — Astro owns HTML, TS mutates children only
- **GameID enum** lives in `src/lib/games.ts` — all game IDs registered there
- **GameData interfaces** live in `src/lib/games/shared/types.ts` (except SatelliteSync which owns its own)
- **Never commit** unless explicitly asked — leave commits to the executing engineer per task
- **14 games** exist: tetris, bubble-shooter, memory-matrix, quick-math, word-scramble, reflex, sudoku, bejeweled, path-navigator, evader, 2048, snake, circuit-hacker, satellite-sync

---

# Phase 6: Framework Consolidation

Migrate legacy games onto `BaseGame` + `GameInitializer` + `ScoreManager` + `GameTimer`. This is the highest-effort phase. Each game is an independent migration following the same template.

**Template (from Snake/Bejeweled):**
1. Create `<Game>Game extends BaseGame<State, Config, Stats>`
2. Create `<Game>Renderer extends PixiJSRenderer` or `DOMRenderer`
3. Create `initFramework.ts` using `GameInitializer`
4. Wire page to `initFramework`
5. Delete legacy `game.ts`/`renderer.ts`/`init.ts` (if not already done in PR 1)
6. Verify all tests pass

**Migration order** (by impact and complexity):
1. **Tetris** — high player count, well-tested, clear legacy pattern
2. **Bubble Shooter** — after PR 1 stat fixes are stable
3. **2048** — clean functional core, easy to wrap
4. **Memory Matrix** — DOM-based, straightforward migration
5. **Word Scramble** — text-based, similar to Quick Math
6. **Reflex** — canvas + spawning, medium complexity
7. **Path Navigator** — canvas + bezier, after geometry extraction (PR 1)
8. **Evader** — canvas + spawning, after spawner extraction (PR 1)
9. **Sudoku** — DOM + puzzle, after uniqueness fix (PR 1)

---

## Task 6.1: Migrate Tetris to BaseGame (template migration)

This is the template task. All other migrations follow the same pattern.

**Files to create:**
- `src/lib/games/tetris/TetrisGame.ts`
- `src/lib/games/tetris/TetrisRenderer.ts`
- `src/lib/games/tetris/initFramework.ts`

**Files to modify:**
- `src/pages/tetris/index.astro` (update import)
- `src/lib/games/tetris/types.ts` (align state with `BaseGameState`)

**Interfaces:**
- `TetrisState extends BaseGameState` with: `board`, `currentPiece`, `nextPiece`, `dropTime`, `dropInterval`, `stats` (line clear counts, level, pieces placed)
- `TetrisConfig extends BaseGameConfig` with: `boardWidth`, `boardHeight`, `startingLevel`
- `TetrisStats extends BaseGameStats` with: `lines`, `pieces`, `singles`, `doubles`, `triples`, `tetrises`, `consecutiveLineClears`

- [ ] **Step 1:** Define the new state/config/stats types in `types.ts`
- [ ] **Step 2:** Create `TetrisGame extends BaseGame` implementing `createInitialState`, `update`, `render`, `getGameStats`, `cleanup`, `getGameData`. Port logic from `game.ts` (spawn, move, rotate, drop, line clear) into `update()` and input handlers.
- [ ] **Step 3:** Create `TetrisRenderer extends PixiJSRenderer` implementing `setup`, `render`, `cleanup`. Port from `renderer.ts`.
- [ ] **Step 4:** Create `initFramework.ts` using `GameInitializer` for button wiring, callbacks, achievement handling.
- [ ] **Step 5:** Wire `src/pages/tetris/index.astro` to `initFramework`.
- [ ] **Step 6:** Write tests for `TetrisGame` (port from `game.test.ts`).
- [ ] **Step 7:** Delete legacy `game.ts`, `renderer.ts`, `init.ts` and their tests.
- [ ] **Step 8:** Run full test suite + manual verification.
- [ ] **Step 9:** Commit: `"refactor(tetris): migrate to BaseGame framework"`

## Task 6.2: Migrate Bubble Shooter to BaseGame

Follow Task 6.1 template. Port `game.ts` + `physics.ts` + `renderer.ts` + `init.ts` into the framework trio.

**Files to create:**
- `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- `src/lib/games/bubble-shooter/BubbleShooterRenderer.ts`
- `src/lib/games/bubble-shooter/initFramework.ts`

**Note:** PR 1 already fixed stat tracking (`shotsFired`, `bubblesPopped`, `largestCombo`) and GameData contract. Carry those fixes into the new `BubbleShooterGame.getGameData()`.

- [ ] **Step 1-9:** Follow Task 6.1 template.
- [ ] **Commit:** `"refactor(bubble-shooter): migrate to BaseGame framework"`

## Task 6.3: Migrate 2048 to BaseGame

Follow Task 6.1 template. 2048 has a clean functional core (pure grid operations), making it straightforward to wrap.

**Files to create:**
- `src/lib/games/2048/Game2048.ts`
- `src/lib/games/2048/Game2048Renderer.ts`
- `src/lib/games/2048/initFramework.ts`

**Note:** PR 1 already aligned `Game2048Data` contract (`maxTile`, `moves`, `merges`) and migrated grid operations to `shared/grid.ts`.

- [ ] **Step 1-9:** Follow Task 6.1 template.
- [ ] **Commit:** `"refactor(2048): migrate to BaseGame framework"`

## Task 6.4: Migrate Memory Matrix to BaseGame

Follow Task 6.1 template. Memory Matrix is DOM-based (not PixiJS), so the renderer extends `DOMRenderer` (or equivalent) rather than `PixiJSRenderer`.

**Files to create:**
- `src/lib/games/memory-matrix/MemoryMatrixGame.ts`
- `src/lib/games/memory-matrix/MemoryMatrixRenderer.ts`
- `src/lib/games/memory-matrix/initFramework.ts`

**Note:** PR 1 already fixed `MemoryMatrixGameData` contract and adopted `shared/grid.ts` for card grid operations.

- [ ] **Step 1-9:** Follow Task 6.1 template.
- [ ] **Commit:** `"refactor(memory-matrix): migrate to BaseGame framework"`

## Task 6.5: Migrate Word Scramble to BaseGame

Follow Task 6.1 template. Word Scramble is text-based (similar to Quick Math), no canvas renderer needed.

**Files to create:**
- `src/lib/games/word-scramble/WordScrambleGame.ts`
- `src/lib/games/word-scramble/WordScrambleRenderer.ts` (or skip if DOM-only)
- `src/lib/games/word-scramble/initFramework.ts`

**Note:** PR 1 already fixed `totalWordsScrambled` in GameData, removed duplicate dictionary words, and adopted shared utils.

- [ ] **Step 1-9:** Follow Task 6.1 template.
- [ ] **Commit:** `"refactor(word-scramble): migrate to BaseGame framework"`

## Task 6.6: Migrate Reflex to BaseGame

Follow Task 6.1 template. Reflex uses canvas + spawning logic.

**Files to create:**
- `src/lib/games/reflex/ReflexGame.ts`
- `src/lib/games/reflex/ReflexRenderer.ts`
- `src/lib/games/reflex/initFramework.ts`

**Note:** PR 1 already fixed the divergent accuracy formula, adopted shared utils, and migrated coin/bomb spawning to `shared/spawner.ts`.

**Additional fixes during migration:**
- Correct click effects, state reset, and animation
- Remove `needsRedraw` guard for per-frame animation
- Fix accuracy test

- [ ] **Step 1-9:** Follow Task 6.1 template.
- [ ] **Commit:** `"refactor(reflex): migrate to BaseGame framework"`
- [ ] **Commit:** `"fix(reflex): correct click effects, state reset, animation, and accuracy test"`
- [ ] **Commit:** `"fix(reflex): remove needsRedraw guard for per-frame animation"`

## Task 6.7: Migrate Path Navigator to BaseGame

Follow Task 6.1 template. Path Navigator uses canvas + bezier curves.

**Files to create:**
- `src/lib/games/path-navigator/PathNavigatorGame.ts`
- `src/lib/games/path-navigator/PathNavigatorRenderer.ts`
- `src/lib/games/path-navigator/initFramework.ts`

**Note:** PR 1 already aligned `PathNavigatorGameData` contract, adopted shared utils, and migrated geometry to `shared/geometry.ts`.

- [ ] **Step 1-9:** Follow Task 6.1 template.
- [ ] **Commit:** `"refactor(path-navigator): migrate to BaseGame framework"`

## Task 6.8: Migrate Evader to BaseGame

Follow Task 6.1 template. Evader uses canvas + spawning logic.

**Files to create:**
- `src/lib/games/evader/EvaderGame.ts`
- `src/lib/games/evader/EvaderRenderer.ts`
- `src/lib/games/evader/initFramework.ts`

**Note:** PR 1 already aligned `EvaderGameData` with actual mechanics, fixed spawn ID collision (monotonic counter), adopted shared utils, and migrated spawning to `shared/spawner.ts`.

- [ ] **Step 1-9:** Follow Task 6.1 template.
- [ ] **Commit:** `"refactor(evader): migrate to BaseGame framework"`

## Task 6.9: Migrate Sudoku to BaseGame

Follow Task 6.1 template. Sudoku is DOM-based (not PixiJS).

**Files to create:**
- `src/lib/games/sudoku/SudokuGame.ts`
- `src/lib/games/sudoku/SudokuRenderer.ts`
- `src/lib/games/sudoku/initFramework.ts`

**Note:** PR 1 already fixed puzzle uniqueness, stopped game loop on End Game, aligned `SudokuGameData` contract, and migrated grid operations to `shared/grid.ts`.

- [ ] **Step 1-9:** Follow Task 6.1 template.
- [ ] **Commit:** `"refactor(sudoku): migrate to BaseGame framework"`

## Task 6.10: Bless handle-based pattern for Circuit Hacker and Satellite Sync

These two games use `ScoreManager`/`GameTimer` directly but not `BaseGame`. They were deliberately built this way for their multi-phase/custom-state-machine game loops.

- [ ] **Step 1:** Document the handle-based pattern (`createRunGuard` + manual `saveGameScore`) in AGENTS.md as a blessed pattern, not migration debt.
- [ ] **Step 2:** Note when to use it (multi-phase game loops, custom state machines) vs `BaseGame`.
- [ ] **Step 3:** Commit: `"docs: bless handle-based pattern for Circuit Hacker and Satellite Sync"`

---

## Post-Phase Verification (PR 2)

After all migrations:

- [ ] **Full test suite:** `bun run test:run` — all green
- [ ] **E2E tests:** `bun run test:e2e` — all green
- [ ] **Lint:** `bun run lint` — no errors
- [ ] **Format:** `bun run format:check` — clean
- [ ] **Build:** `bun run build` — succeeds
- [ ] **Manual smoke test:** Play each of the 14 games, verify scoring + achievements work
- [ ] **Framework audit:** Confirm 12 of 14 games use `BaseGame`; 2 use blessed handle-based pattern

---

## Summary

| Task | Game | Renderer | Complexity |
|------|------|----------|------------|
| 6.1 | Tetris | PixiJS | High (template) |
| 6.2 | Bubble Shooter | PixiJS | Medium-High |
| 6.3 | 2048 | PixiJS | Low-Medium |
| 6.4 | Memory Matrix | DOM | Low-Medium |
| 6.5 | Word Scramble | Text/DOM | Low |
| 6.6 | Reflex | PixiJS | Medium |
| 6.7 | Path Navigator | PixiJS | Medium |
| 6.8 | Evader | PixiJS | Medium |
| 6.9 | Sudoku | DOM | Medium |
| 6.10 | Circuit Hacker + Satellite Sync | — | Docs only |
| **Total** | **9 migrations + 1 docs** | | **High effort** |

**Result:** 12 of 14 games framework-native; 2 handle-based games blessed as deliberate pattern.
