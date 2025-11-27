# Tasks: 2048 Game

**Input**: Design documents from `/specs/001-2048-game/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Unit tests included per constitution requirement (Test-First Development)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- **Project structure**: Astro web application at repository root
- **Game module**: `src/lib/games/2048/`
- **Game page**: `src/pages/2048/`
- **Tests**: Unit tests co-located, E2E tests in `e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and game registration

- [x] T001 Add `GAME_2048 = '2048'` to GameID enum in `src/lib/games.ts`
- [x] T002 [P] Add 2048 game metadata to GAMES array in `src/lib/games.ts` (name, description, category: puzzle, difficulty: medium, tags, isActive: true)
- [x] T003 [P] Add `'2048'` icon mapping `🎯` to GAME_ICONS in `src/lib/games.ts`
- [x] T004 Create game module directory structure at `src/lib/games/2048/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core type definitions and game logic that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Types Definition

- [x] T005 Create `Position` interface (row, col) in `src/lib/games/2048/types.ts`
- [x] T006 [P] Create `Tile` interface (id, value, position, mergedFrom?, isNew?) in `src/lib/games/2048/types.ts`
- [x] T007 [P] Create `Board` type alias (Tile | null)[][] in `src/lib/games/2048/types.ts`
- [x] T008 [P] Create `Direction` type ('up' | 'down' | 'left' | 'right') in `src/lib/games/2048/types.ts`
- [x] T009 [P] Create `MoveResult` interface (board, moved, scoreGained, mergeCount, animations) in `src/lib/games/2048/types.ts`
- [x] T010 [P] Create `Animation` interface (type, tileId, from?, to, value?) in `src/lib/games/2048/types.ts`
- [x] T011 [P] Create `GameState` interface (board, score, gameStarted, gameOver, won, moveCount, maxTile, lastMoveAnimations, tileIdCounter) in `src/lib/games/2048/types.ts`
- [x] T012 [P] Create `GameStats` interface (finalScore, maxTile, moveCount, mergeCount, gameWon) in `src/lib/games/2048/types.ts`
- [x] T013 [P] Create `GameCallbacks` interface (onScoreChange?, onGameOver?, onWin?, onMove?) in `src/lib/games/2048/types.ts`
- [x] T014 Create `GameConstants` interface and export GAME_CONSTANTS (BOARD_SIZE: 4, TILE_SIZE: 90, GAP: 10, etc.) in `src/lib/games/2048/types.ts`

### Core Game Logic

- [x] T015 Implement `createGameState()` function returning initial empty game state in `src/lib/games/2048/game.ts`
- [x] T016 [P] Implement `generateTileId(state)` helper for unique tile IDs in `src/lib/games/2048/utils.ts`
- [x] T017 [P] Implement `getEmptyCells(board)` helper returning array of empty Position in `src/lib/games/2048/utils.ts`
- [x] T018 [P] Implement `spawnTile(state)` function adding new tile (2 or 4, 90/10 probability) to random empty cell in `src/lib/games/2048/game.ts`
- [x] T019 Implement `slideTiles(board, direction)` function sliding all tiles in direction in `src/lib/games/2048/game.ts`
- [x] T020 Implement `mergeTiles(board, direction)` function merging adjacent matching tiles (once per move rule) in `src/lib/games/2048/game.ts`
- [x] T021 Implement `move(state, direction)` function combining slide, merge, score update, returning MoveResult in `src/lib/games/2048/game.ts`
- [x] T022 [P] Implement `canMove(board)` function checking if any valid moves remain in `src/lib/games/2048/utils.ts`
- [x] T023 [P] Implement `getMaxTile(board)` function returning highest tile value in `src/lib/games/2048/utils.ts`
- [x] T024 Implement `checkGameOver(state)` function detecting game over condition in `src/lib/games/2048/game.ts`

### Unit Tests for Core Logic

- [x] T025 Write unit tests for `spawnTile` in `src/lib/games/2048/game.test.ts` (spawn in empty cell, correct probability)
- [x] T026 [P] Write unit tests for `slideTiles` in `src/lib/games/2048/game.test.ts` (slide left/right/up/down)
- [x] T027 [P] Write unit tests for `mergeTiles` in `src/lib/games/2048/game.test.ts` (merge matching, once-per-move rule)
- [x] T028 [P] Write unit tests for `move` in `src/lib/games/2048/game.test.ts` (full move, score calculation)
- [x] T029 [P] Write unit tests for `canMove` in `src/lib/games/2048/game.test.ts` (valid moves exist, no moves)
- [x] T030 [P] Write unit tests for `checkGameOver` in `src/lib/games/2048/game.test.ts` (game over detection)

**Checkpoint**: Foundation ready - all types defined, core game logic tested, user story implementation can begin

---

## Phase 3: User Story 1 - Play 2048 Game (Priority: P1) 🎯 MVP

**Goal**: Core gameplay - players can start a game, move tiles, merge matching tiles, and see their score increase

**Independent Test**: Navigate to /2048, click Start, use arrow keys to slide tiles, observe merges and score updates

### Implementation for User Story 1

- [x] T031 [US1] Implement `startGame(state)` function spawning 2 initial tiles, setting gameStarted=true in `src/lib/games/2048/game.ts`
- [x] T032 [US1] Implement `resetGame(state)` function returning to initial state in `src/lib/games/2048/game.ts`
- [x] T033 [P] [US1] Implement tile color mapping (getTileColor, getTileTextColor) based on value in `src/lib/games/2048/utils.ts`
- [x] T034 [P] [US1] Implement `setupPixiJS(container, constants)` function initializing PixiJS Application in `src/lib/games/2048/renderer.ts`
- [x] T035 [US1] Implement `drawBoard(renderer, state)` function rendering 4x4 grid background in `src/lib/games/2048/renderer.ts`
- [x] T036 [US1] Implement `drawTiles(renderer, state)` function rendering all tiles with values in `src/lib/games/2048/renderer.ts`
- [x] T037 [US1] Implement tile movement animation (animateTileMove) in `src/lib/games/2048/renderer.ts`
- [x] T038 [US1] Implement tile merge animation (animateTileMerge) with scale pop effect in `src/lib/games/2048/renderer.ts`
- [x] T039 [US1] Implement tile spawn animation (animateTileSpawn) with fade-in in `src/lib/games/2048/renderer.ts`
- [x] T040 [US1] Implement `draw(renderer, state, constants)` main render function combining all drawing in `src/lib/games/2048/renderer.ts`
- [x] T041 [US1] Create game page HTML structure with game container, score display, controls in `src/pages/2048/index.astro`
- [x] T042 [US1] Add keyboard event listener (arrow keys) calling move() in `src/lib/games/2048/init.ts`
- [x] T043 [US1] Implement `init2048Game()` function setting up renderer, event listeners, game loop in `src/lib/games/2048/init.ts`
- [x] T044 [US1] Add Start Game button handler calling startGame() in `src/pages/2048/index.astro`
- [x] T045 [US1] Add End Game button handler (manual end) in `src/pages/2048/index.astro`
- [x] T046 [US1] Implement real-time score display update using DOM element in `src/lib/games/2048/init.ts`
- [x] T047 [US1] Implement win detection (2048 tile) with notification display in `src/lib/games/2048/game.ts`
- [x] T048 [US1] Allow continued play after winning (won=true but gameOver=false) in `src/lib/games/2048/game.ts`

**Checkpoint**: User Story 1 complete - players can play full 2048 gameplay with keyboard controls

---

## Phase 4: User Story 2 - Game Over Detection (Priority: P1)

**Goal**: Game ends when no valid moves remain, overlay displays final score with play again option

**Independent Test**: Fill grid with non-matching tiles, verify Game Over overlay appears with correct score

### Implementation for User Story 2

- [x] T049 [US2] Implement `endGame(state)` function setting gameOver=true, calling onGameOver callback in `src/lib/games/2048/game.ts`
- [x] T050 [US2] Add game over check after each move (if !canMove then endGame) in `src/lib/games/2048/game.ts`
- [x] T051 [US2] Add GameOverlay component with final score display in `src/pages/2048/index.astro`
- [x] T052 [US2] Display final stats in overlay (score, max tile, moves) in `src/pages/2048/index.astro`
- [x] T053 [US2] Add Play Again button in overlay calling resetGame() in `src/pages/2048/index.astro`
- [x] T054 [US2] Hide/show overlay based on gameOver state in `src/lib/games/2048/init.ts`
- [x] T055 [US2] Block input when game is over (keyboard events check gameOver) in `src/lib/games/2048/init.ts`

**Checkpoint**: User Stories 1 AND 2 complete - full game loop from start to game over with replay

---

## Phase 5: User Story 3 - Score Tracking and Persistence (Priority: P2)

**Goal**: Authenticated users get scores saved to database, visible in profile

**Independent Test**: Complete game while logged in, verify score appears in profile history

### Implementation for User Story 3

- [x] T056 [US3] Import saveGameScore from scoreService in `src/lib/games/2048/init.ts`
- [x] T057 [US3] Implement onGameOver callback that calls saveGameScore with gameStats in `src/lib/games/2048/init.ts`
- [x] T058 [US3] Pass gameData (maxTile, mergeCount, gameWon) to score submission in `src/lib/games/2048/init.ts`
- [x] T059 [US3] Handle score submission success (log, optional notification) in `src/lib/games/2048/init.ts`
- [x] T060 [US3] Handle score submission error (log error, don't block game) in `src/lib/games/2048/init.ts`
- [x] T061 [US3] Add '2048' case to formatGameName() in `src/lib/services/scoreService.ts`

**Checkpoint**: User Stories 1, 2, AND 3 complete - scores persist for authenticated users

---

## Phase 6: User Story 4 - Achievement Integration (Priority: P2)

**Goal**: Players earn achievements for score thresholds and tile milestones

**Independent Test**: Reach score threshold or create 2048 tile, verify achievement notification appears

### Implementation for User Story 4

- [x] T062 [US4] Add 2048_welcome achievement (First Slide, score >= 1, Common) in `src/lib/achievements.ts`
- [x] T063 [P] [US4] Add 2048_novice achievement (Score 500, Common) in `src/lib/achievements.ts`
- [x] T064 [P] [US4] Add 2048_apprentice achievement (Score 1000, Common) in `src/lib/achievements.ts`
- [x] T065 [P] [US4] Add 2048_expert achievement (Score 2500, Rare) in `src/lib/achievements.ts`
- [x] T066 [P] [US4] Add 2048_master achievement (Score 5000, Epic) in `src/lib/achievements.ts`
- [x] T067 [P] [US4] Add 2048_tile_256 achievement (Power of Two, maxTile >= 256, Common) in `src/lib/achievements.ts`
- [x] T068 [P] [US4] Add 2048_tile_512 achievement (Halfway There, maxTile >= 512, Common) in `src/lib/achievements.ts`
- [x] T069 [P] [US4] Add 2048_tile_1024 achievement (Almost There, maxTile >= 1024, Rare) in `src/lib/achievements.ts`
- [x] T070 [P] [US4] Add 2048_tile_2048 achievement (2048 Champion, maxTile >= 2048, Epic) in `src/lib/achievements.ts`
- [x] T071 [P] [US4] Add 2048_tile_4096 achievement (Beyond 2048, maxTile >= 4096, Legendary) in `src/lib/achievements.ts`
- [x] T072 [US4] Dispatch achievementsEarned event when newAchievements returned from score submission in `src/lib/games/2048/init.ts`
- [x] T073 [US4] Write unit test for achievement conditions in `src/lib/achievements.test.ts`

**Checkpoint**: User Stories 1-4 complete - full gameplay with score persistence and achievements

---

## Phase 7: User Story 5 - Mobile and Touch Controls (Priority: P3)

**Goal**: Mobile users can swipe to move tiles

**Independent Test**: On mobile device, swipe in each direction and verify tiles move correctly

### Implementation for User Story 5

- [x] T074 [US5] Implement touch start handler recording initial position in `src/lib/games/2048/init.ts`
- [x] T075 [US5] Implement touch end handler calculating swipe direction in `src/lib/games/2048/init.ts`
- [x] T076 [US5] Add swipe threshold constant (30px minimum) in `src/lib/games/2048/types.ts`
- [x] T077 [US5] Convert swipe delta to Direction and call move() in `src/lib/games/2048/init.ts`
- [x] T078 [US5] Add touch event listeners (touchstart, touchend) to game container in `src/lib/games/2048/init.ts`
- [x] T079 [US5] Prevent default touch behavior (scrolling) during swipe in `src/lib/games/2048/init.ts`
- [x] T080 [US5] Add input debouncing (block during animation ~200ms) in `src/lib/games/2048/init.ts`

**Checkpoint**: All user stories complete - desktop and mobile users can play

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final refinements and validation

- [x] T081 [P] Add responsive sizing for game container (mobile viewport) in `src/pages/2048/index.astro`
- [x] T082 [P] Apply sci-fi theme styling (neon borders, glass-morphism) to game page in `src/pages/2048/index.astro`
- [x] T083 [P] Add game instructions/controls help text below game in `src/pages/2048/index.astro`
- [x] T084 Run lint check (`npm run lint`) and fix any issues
- [x] T085 Run format check (`npm run format`) and fix any issues
- [x] T086 Run all unit tests (`npm run test:run`) and verify passing
- [x] T087 Create E2E test for basic gameplay flow in `e2e/games/2048.spec.ts`
- [x] T088 Run E2E tests (`npm run test:e2e`) and verify passing
- [x] T089 Manual testing: verify full game flow on desktop
- [x] T090 Manual testing: verify touch controls on mobile device

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T004) - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion
- **User Story 2 (Phase 4)**: Depends on US1 (T031-T048) - extends game flow
- **User Story 3 (Phase 5)**: Depends on US2 (T049-T055) - needs endGame callback
- **User Story 4 (Phase 6)**: Depends on US3 (T056-T061) - uses score submission
- **User Story 5 (Phase 7)**: Can start after US1 - only depends on init.ts structure
- **Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

```
Setup → Foundational → US1 (Play Game) → US2 (Game Over) → US3 (Score) → US4 (Achievements)
                                    ↘                    
                                      US5 (Touch) ←────────────────┘
```

- **US1 + US2**: Core MVP - playable game with game over
- **US3**: Requires US2 (endGame triggers score submission)
- **US4**: Requires US3 (achievements awarded via score submission)
- **US5**: Only requires US1 (adds alternate input method)

### Parallel Opportunities

**Within Setup (Phase 1)**:
```
T001 (GameID) → T002, T003, T004 can run in parallel
```

**Within Foundational (Phase 2)**:
```
T005 (Position) → T006-T014 (all types) can run in parallel
T015, T016, T017, T018 → T019, T020 → T021 → T022-T024 (some parallel)
T025-T030 (tests) can all run in parallel after game.ts complete
```

**Within User Story 4 (Phase 6)**:
```
T062-T071 (all achievements) can run in parallel
```

---

## Parallel Example: Phase 2 Types

```bash
# After T005 completes, launch all type definitions in parallel:
Task T006: "Create Tile interface in src/lib/games/2048/types.ts"
Task T007: "Create Board type alias in src/lib/games/2048/types.ts"
Task T008: "Create Direction type in src/lib/games/2048/types.ts"
Task T009: "Create MoveResult interface in src/lib/games/2048/types.ts"
Task T010: "Create Animation interface in src/lib/games/2048/types.ts"
Task T011: "Create GameState interface in src/lib/games/2048/types.ts"
Task T012: "Create GameStats interface in src/lib/games/2048/types.ts"
Task T013: "Create GameCallbacks interface in src/lib/games/2048/types.ts"
```

## Parallel Example: Phase 6 Achievements

```bash
# All achievement definitions can be added in parallel:
Task T062: "Add 2048_welcome achievement in src/lib/achievements.ts"
Task T063: "Add 2048_novice achievement in src/lib/achievements.ts"
Task T064: "Add 2048_apprentice achievement in src/lib/achievements.ts"
... (T065-T071 all parallel)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T030)
3. Complete Phase 3: User Story 1 (T031-T048)
4. Complete Phase 4: User Story 2 (T049-T055)
5. **STOP and VALIDATE**: Test full game flow (start → play → game over → replay)
6. Deploy/demo if ready - this is a playable MVP!

### Incremental Delivery

1. Setup + Foundational → Framework ready
2. Add US1 → Basic gameplay works → Can demo
3. Add US2 → Game over works → **MVP Complete!**
4. Add US3 → Scores persist → Leaderboard ready
5. Add US4 → Achievements work → Engagement features
6. Add US5 → Touch works → Mobile ready
7. Polish → Production ready

---

## Notes

- [P] tasks = different files or independent code sections, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after its checkpoint
- Unit tests in Phase 2 ensure game logic is solid before UI work
- All achievements can be added in parallel (same file but independent objects)
- Touch controls (US5) can be developed in parallel with US3/US4 after US1 complete
