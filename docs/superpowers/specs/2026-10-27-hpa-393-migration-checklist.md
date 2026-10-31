# HPA-393 — 23-Game Migration Checklist (Stage 0 contracts)

Stage 0 artifact for the app-core hooks + GameScreen migration plan
(`docs/superpowers/plans/2026-10-27-hpa-393-app-core-gamescreen-plan.md`).
This is a **PR checklist**, not a generated runtime manifest. Every value below
was read from the actual code and E2E specs on `main` (HPA-379 #97 and HPA-447
#95 confirmed merged) on 2026-10-28. Later tasks tick rows here and must not
regress the frozen contracts in Section B.

> **Status (Stage 5 close-out, 2026-10-28):** the migration inventory below is
> **IMPLEMENTED** — all 23 games are island-hosted and `GamePage.astro` is
> deleted on this branch (PR #99). Section A's classes (`Std`/`S`/`Handle`/
> `Plate`) and per-page script facts describe the **pre-migration baseline**;
> see "Migration status" at the end of this file for each game's island and
> commit range.

Shared shell facts that hold for all 23 games:

- Score/achievement toasts are owned by the **AppNotifications island**
  (`apps/web/src/components/islands/AppNotifications.tsx`), which registers
  `window.showAchievementAward` / `window.showChallengeComplete` (with a
  pre-hydration queue) for the score service. The 19 GamePage pages inherit it
  from `AppLayout.astro` (`client:idle`); the 4 field plates mount it directly
  (`client:load`).
- The 19 GamePage consumers render the SSR-only `@cetus/ui` chrome
  (`GameTitle`, `GameStats`, `GameControls`, `GameOverlay`, `GameBreadcrumb`)
  via `apps/web/src/components/games/GamePage.astro`; game init `<script>`s
  live at the page root (never inside a named slot — Astro drops those).
- The 4 field plates (Tetris, Bubble Shooter, Bejeweled, 2048) are bespoke
  pages with their own `.field-plate` / `#field-sheet` markup and page-level
  scripts; they never import `GamePage.astro`.

## Section A — 23-game inventory

Classification: **S** = Snake (special: the page-root script must keep owning
the instance, asserted by E2E), **Std** = standard GamePage consumer,
**Handle** = handle-based game (`createRunGuard` + manual save flow), **Plate**
= bespoke field-plate page. Breakdown: S(1) + Std(15) + Handle(3) use
`GamePage.astro` = 19; Plate(4) do not.

Input/RAF owner names the module that attaches keyboard/pointer listeners and
runs the `requestAnimationFrame` loop (canvas games only). "init" below always
means the `apps/web/src/lib/games/<game>/` module of the same name. All init
handles return a result exposing `{ game, renderer, cleanup(), … }` unless
noted.

| # | Game | Route | Class | Board host element | Init handle | Input / RAF owner | Overlay/HUD IDs beyond shared chrome | Debug global & cleanup |
|---|------|-------|-------|--------------------|-------------|-------------------|--------------------------------------|------------------------|
| 1 | Tetris Challenge | `/tetris` | Plate | `#tetris-container` (PixiJS canvas) | `initTetrisGameFramework()` → `TetrisInitResult` | `tetris/initFramework.ts` (keydown + pointer + RAF) + page script wires `#field-sheet`, `#hold-btn`, settings | `#hold-canvas`, `#next-canvas`, `#level`, `#lines`, `#streak`, `#clear-flash`, `#clear-streak`, `#drop-rate`, `#rate-fill`, `#ghost-btn`, `#glyphs-btn`, `#sound-btn`, `#motion-btn`, `#intro-panel`, `#intro-title`, `#pause-panel`, `#pause-title`, `#results-title`, `#result-advice`, `#personal-best`, `#previous-best`, `#final-pieces`, `#final-lines`, `#final-level`, `#final-streak`, `#account-label`, `#leaderboard`, `#leaderboard-status`, `#commissions`, `#commission-*`, `#xp-*`, `#visit-count`, `#visit-tetrises`, `#recent-dives`, `#empty-log`, `#game-error`, `#resume-btn` | `window.tetrisGame: TetrisInitResult`; cleanup via `cleanup()` on the init result |
| 2 | Bubble Shooter | `/bubble-shooter` | Plate | `#game-container` (PixiJS canvas, 3:4) | `initBubbleShooterGameFramework()` | `bubble-shooter/initFramework.ts` (keydown + pointer aim + RAF) + page script wires `#field-sheet` | `#pause-overlay`, `#pause-score`, `#restart-btn`, `#resume-btn`, `#intro-panel`, `#intro-title`, `#current-bubble`, `#next-bubble`, `#bubbles-popped`, `#largest-combo`, `#colony-gauge`, `#gauge-fill`, `#gauge-label`, `#final-shots`, `#final-accuracy`, `#final-combo`, `#final-bubbles-popped`, `#sheet-title`, plus plate chrome as Tetris (`#field-sheet`, `#personal-best`, `#recent-dives`, `#empty-log`, `#game-error`, …) | none; cleanup via `cleanup()` |
| 3 | Memory Matrix | `/memory-matrix` | Std | `#memory-matrix-container` → `#memory-board` (DOM `.memory-card` ×48) | `initMemoryMatrixGameFramework()` | `memory-matrix/initFramework.ts` (pointer on cards; no keyboard, no RAF) | `#game-pairs`, `#game-score`, `#game-time`, `#game-accuracy`, `#pairs-found`, `#total-attempts`, `#final-pairs`, `#final-attempts`, `#final-accuracy`; GamePage props `showScore/showTime/showPause = false` | none; `cleanup()` |
| 4 | Quick Math | `/quick-math` | Std | `#quick-math-container` (text/DOM) | `initQuickMathFramework()` (`quick-math/init.ts`) | `quick-math/init.ts` (pointer on answer form; no keyboard, no RAF) | `#question`, `#answer-input`, `#submit-answer`, `#accuracy`, `#current-score`, `#current-correct`, `#current-questions`, `#total-questions`; GamePage props `overlayTitle="TIME'S UP!"`, `showPause/showReset = false` | none; `cleanup()` |
| 5 | Word Scramble | `/word-scramble` | Std | text/DOM board inside `slot="game-board"` | `initWordScrambleGameFramework()` | `word-scramble/initFramework.ts` (keydown + pointer; no RAF) | `#scrambled-word`, `#answer-input`, `#submit-answer`, `#skip-word`, `#word-difficulty`, `#accuracy`, `#current-score`, `#current-correct`, `#current-words`, `#total-words`, `#longest-word`; GamePage props `overlayTitle="TIME'S UP!"`, `showPause/showReset = false` | none; `cleanup()` |
| 6 | Reflex Coin Collection | `/reflex` | Std | `#game-canvas-container` (PixiJS canvas) | `initReflexGameFramework()` | `reflex/initFramework.ts` (pointer on canvas + RAF; no keyboard) | `#game-status`, `#game-error`, `#game-error-message`, `#accuracy`, `#avg-reaction`, `#coins-collected`, `#bombs-hit`, `#final-accuracy`, `#final-coins`, `#final-bombs`; **custom `#start-btn`/`#stop-btn` controls in page markup — `#stop-btn` instead of `#end-btn`**; GamePage props `overlayTitle="TIME'S UP!"`, `overlayButtonText="Close"` | none; `cleanup()` |
| 7 | Sudoku | `/sudoku` | Std | `#sudoku-container` (DOM `.sudoku-cell` ×81) | `initSudokuGameFramework()` | `sudoku/initFramework.ts` (keydown + pointer; no RAF) | `#difficulty`, `#easy-btn`, `#medium-btn`, `#hard-btn`, `#game-time`, `#final-difficulty`, `#final-time`; GamePage props `showTime = false`, `overlayButtonId="restart-btn"` | none; `cleanup()` |
| 8 | Bejeweled | `/bejeweled` | Plate | `#bejeweled-container` (PixiJS canvas, 8×8) | `initBejeweledGame()` (`bejeweled/init.ts`) | `bejeweled/init.ts` (pointer/drag on canvas; keyboard `h` hint, arrows + Enter selection, pause `p`; no RAF in init) + page script wires `#field-sheet`, `#hint-btn` | `#time-remaining` recolored by page, `#time-fill`, `#moves`, `#max-combo`, `#board-notice`, `#hint-btn`, `#cascade-label`, `#cascade-pips`, `#final-moves`, `#final-matches`, `#final-combo`, `#final-largest`, `#pause-panel`, `#pause-title`, `#results-title`, `#intro-panel`, `#intro-title`, `#personal-best`, `#account-label`, `#commission-*`, `#glyphs-btn`, `#motion-btn`, `#sound-btn`, `.neighbour-art`, plus plate chrome as Tetris | none; cleanup via `cleanup()` |
| 9 | Path Navigator | `/path-navigator` | Std | `#path-navigator-container` (PixiJS canvas) | `initPathNavigatorGameFramework()` | `path-navigator/initFramework.ts` (keydown + pointer + RAF) | `#level`, `#levels-completed`, `#total-time`; GamePage props `overlayTitle="GAME OVER"`, `showPause/showReset = false` | none; `cleanup()` |
| 10 | Evader | `/evader` | Std | `#game-canvas-container` (PixiJS canvas) | `initEvaderGameFramework()` | `evader/initFramework.ts` (keydown WASD + pointer D-pad `#dpad` + RAF) | `#game-status`, `#game-error`, `#game-error-title`, `#game-error-message`, `#dpad`, `#coins-collected`, `#bombs-hit`, `#final-coins`, `#final-bombs`; **custom `#start-btn`/`#stop-btn` — `#stop-btn` instead of `#end-btn`**; GamePage props `overlayTitle="TIME'S UP!"`, `overlayButtonText="Close"` | none; `cleanup()` |
| 11 | 2048 | `/2048` | Plate | `#game-2048-container` (PixiJS canvas) | `init2048GameFramework()` → `Game2048InitResult` | `2048/initFramework.ts` (keydown + pointer/swipe; no RAF) + page script wires `#field-sheet`, `#undo-btn` | `#score-display`, `#board-warning`, `#merge-feedback`, `#points-per-move`, `#undos-left`, `#undo-btn`, `#next-target`, `#win-line`, `#win-title`, `#keep-playing-btn`, `#stuck-title`, `#undo-stuck-btn`, `#restart-btn`, `#custom-final-score`, `#final-moves`, `#final-merges`, `#final-max-tile`, `#final-undos`, `#game-status`, `#motion-state`, `#sound-state`, `#load-status`, plus plate chrome as Tetris | none; cleanup via `cleanup()` |
| 12 | Snake | `/snake` | S | `#snake-container` (PixiJS canvas, 500×500) | `initSnakeGameFramework()` → `SnakeInitResult` | `snake/initFramework.ts` (`setupKeyboardControls` + `setupButtonHandlers` + RAF `renderLoop`) | `#snake-length`, `#foods-eaten`, `#snake-length-stats`, `#final-length`, `#final-foods`, `#final-time` | `window.snakeGame: SnakeInitResult` (set by page-root script); `cleanup()` = render loop + button/keyboard/unload handlers + `renderer.cleanup()` + `game.destroy()` |
| 13 | Circuit Hacker | `/circuit-hacker` | Handle | `#game-canvas-container` (PixiJS created inside `start()`) | `initializeCircuitHackerGame(container, callbacks)` (`circuit-hacker/init.ts`) | `circuit-hacker/init.ts` (pointer on canvas; `createRunGuard`; no keyboard) | `#game-status`, `#game-error`, `#game-error-title`, `#game-error-message`, `#difficulty-select`, `#rotation-count`, `#final-rotations`, `#final-score`, `#final-time`; **custom `#start-btn`/`#stop-btn`**; GamePage props `overlayTitle="CIRCUIT POWERED!"`, `showScore = false`, `initialTime={180}` | none; module-scope `runGuard` invalidates stale callbacks |
| 14 | Satellite Sync | `/satellite-sync` | Handle | `#game-canvas-container` (PixiJS created inside `start()`) | `initializeSatelliteSync(container, …)` (`satellite-sync/init.ts`) | `satellite-sync/init.ts` (keydown + pointer + RAF; `createRunGuard`) | `#game-status`, `#game-error`, `#level`, `#combo`; custom `#start-btn`; GamePage props `overlayTitle="MISSION COMPLETE!"`, `overlayButtonText="Play Again"`, `showPause/showReset = false`. Manual `#end-btn` returns to pre-start; overlay only on win/fail | none; module-scope `runGuard` |
| 15 | Ice Slide | `/ice-slide` | Handle | `#game-canvas-container` (PixiJS after start) + mode selector `#ice-slide-mode-selector` | `initializeIceSlide(…)` (`ice-slide/init.ts`) + `createDailyLeaderboardController` | `ice-slide/init.ts` (keydown arrows + pointer radio/buttons; `createRunGuard`; no RAF — move-based physics) | Mode: `#level`, `#level-name`, `#moves`, `#crystals`, `#game-status`, `#game-error`; Daily: `#daily-meta`, `#daily-date`, `#daily-stage-progress`, `#daily-objective-*`, `#daily-reset`, `#daily-leaderboard*`; Expedition: `#expedition-meta`, `#expedition-seed`, `#expedition-stage-progress`, `#expedition-objective-*`, `#expedition-attempts`, `#expedition-stars`, `#expedition-risk-btn`, `#expedition-safe-btn`, `#expedition-undo-btn`, `#expedition-route-choice-overlay`, `#expedition-summary*`, `#new-expedition-btn`; overlays `#stage-clear-overlay`, `#stage-clear-*`, `#change-mode-btn`; GamePage props `initialTime={0}`, `showPause = false`, `showReset = true` | `window.iceSlideGame` (assigned inside `ice-slide/init.ts`, **deleted on teardown**); module-scope `runGuard` |
| 16 | Mine Grid | `/mine-grid` | Std | `#mine-grid-container` → `#mine-grid-board` (DOM `.mine-grid-cell[data-state]` ×64) | `initMineGridGameFramework()` | `mine-grid/initFramework.ts` (pointer on cells + mode buttons; no keyboard, no RAF) | `#difficulty`, `#easy-btn`, `#medium-btn`, `#hard-btn`, `#flag-mode-btn`, `#reveal-mode-btn`, `#flags`, `#safe-progress`, `#final-difficulty`, `#final-outcome`, `#final-time`, `#final-incorrect-flags`; GamePage props `showPause = false`, `showEnd = false`, `initialTime={300}` | `window.mineGridGame`; `cleanup()` |
| 17 | Pattern Pulse | `/pattern-pulse` | Std | `#pattern-pulse-container` → `#pattern-pulse-board` (DOM pads, `data-pattern-pad`) | `initPatternPulseGameFramework()` | `pattern-pulse/initFramework.ts` (pointer on pads + number-key shortcuts; no RAF) | `#pattern-status`, `#sequence-length`, `#completed-rounds`, `#streak`, `#mistakes`, `#final-rounds`, `#final-longest-sequence`, `#final-max-streak`, `#final-mistakes`, `#final-outcome`; GamePage props `showPause/showEnd = false`, `initialTime={60}` | `window.patternPulseGame`; `cleanup()` |
| 18 | Gravity Flip | `/gravity-flip` | Std | `#gravity-flip-container` → `#gravity-flip-canvas` (PixiJS canvas) | `initGravityFlipGameFramework()` | `gravity-flip/initFramework.ts` (keydown + tap/pointer + RAF) | `#gravity-direction`, `#flip-btn`, `#flip-count`, `#world-speed`, `#stars-collected`, `#distance-traveled`, `#gravity-flip-status`, `#final-outcome`, `#final-stars`, `#final-flips`, `#final-distance`; GamePage props `overlayTitle="GRAVITY LOST"`, `showPause/showEnd = false`, `showReset = true`, `initialTime={60}` | `window.gravityFlipGame`; `cleanup()` |
| 19 | Potion Sorter | `/potion-sorter` | Std | `#potion-sorter-container` → `#potion-sorter-board` (DOM tubes, `data-tube-index`, `.potion-layer`) | `initPotionSorterGameFramework()` | `potion-sorter/initFramework.ts` (pointer on tubes; no keyboard, no RAF) | `#difficulty`, `#easy-btn`, `#medium-btn`, `#hard-btn`, `#undo-btn`, `#moves`, `#undos`, `#potion-sorter-status`, `#final-difficulty`, `#final-moves`, `#final-undos`, `#final-outcome`, `#final-time`; GamePage props `showPause/showEnd = false`, `initialTime={300}` | `window.potionSorterGame`; `cleanup()` |
| 20 | Signal Switch | `/signal-switch` | Std | `#signal-switch-container` → `#signal-switch-canvas` (PixiJS canvas) | `initSignalSwitchGameFramework()` | `signal-switch/initFramework.ts` (keydown `d/f/j/k` + pointer gate buttons `data-signal-lane` + RAF) | `#signal-switch-integrity`, `#signal-switch-lanes`, `#signal-switch-safe-passes`, `#signal-switch-combo`, `#signal-switch-speed`, `#signal-switch-status`, `#gate-controls`, `#final-outcome`, `#final-safe-passes`, `#final-integrity`, `#final-max-combo`, `#final-crashes`; GamePage props `overlayTitle="SIGNAL LOST"`, `showPause/showEnd = false`, `showReset = true`, `initialTime={SIGNAL_SWITCH_RULES.duration}` | `window.signalSwitchGame`; `cleanup()` |
| 21 | Rhythm Reactor | `/rhythm-reactor` | Std | `#rhythm-reactor-container` → `#rhythm-reactor-canvas` (PixiJS canvas) | `initRhythmReactorGameFramework()` | `rhythm-reactor/initFramework.ts` (keydown `d/f/j/k` + pointer lane buttons `data-rhythm-lane` + RAF) | `#rhythm-reactor-hits`, `#rhythm-reactor-combo`, `#rhythm-reactor-judgment`, `#rhythm-reactor-stability`, `#rhythm-reactor-status`, `#rhythm-reactor-controls`, `#final-hits`, `#final-perfect`, `#final-good`, `#final-misses`, `#final-stray-presses`, `#final-max-combo`, `#final-stability`, `#final-accuracy`; GamePage props `showPause/showEnd = false`, `initialTime={RHYTHM_REACTOR_RULES.duration}` | `window.rhythmReactorGame`; `cleanup()` |
| 22 | Asteroid Drift | `/asteroid-drift` | Std | `#asteroid-drift-container` → `#asteroid-drift-canvas` (PixiJS canvas) | `initAsteroidDriftGameFramework()` | `asteroid-drift/initFramework.ts` (keydown WASD/arrows + pointer D-pad `#asteroid-drift-dpad` (`data-direction`) + RAF) | `#orbs-collected`, `#ship-speed`, `#asteroid-drift-status`, `#final-outcome`, `#final-orbs`, `#final-survival`; GamePage props `overlayTitle="SHIP LOST"`, `showPause/showEnd = false`, `showReset = true`, `initialTime={ASTEROID_DRIFT_RULES.duration}` | `window.asteroidDriftGame`; `cleanup()` |
| 23 | Chromatic Tide | `/chromatic-tide` | Std | `#chromatic-tide-container` → `#chromatic-tide-board` (DOM flood-fill cells) + `#chromatic-tide-colors` | `initChromaticTideGameFramework()` | `chromatic-tide/initFramework.ts` (pointer on color buttons `data-tide-color` + number-key shortcuts; no RAF) | `#chromatic-tide-status` (`aria-live="polite"`), `#captured`, `#moves`, `#final-outcome`, `#final-captured`, `#final-moves`, `#final-time`; GamePage props `showPause/showEnd = false`, `initialTime={90}` | `window.chromaticTideGame`; `cleanup()` |

### Migration PR checklist (tick per game when its island lands)

For each of the 23 games, the migrating PR must preserve, for that game:

- [ ] Route + board host element id unchanged (Section A)
- [ ] Init handle signature + returned handle shape unchanged (Section A/B)
- [ ] Keyboard/pointer/RAF ownership recorded above moves as one unit into the
      island (no split ownership)
- [ ] Score-toasts ownership stays with the AppNotifications island
      (`window.showAchievementAward` / `window.showChallengeComplete`)
- [ ] Shared-chrome IDs + per-game IDs unchanged (Section A + Section B)
- [ ] Debug global + cleanup semantics unchanged (Section A + Section B)
- [ ] `apps/web/e2e/games/play-coverage.spec.ts` + the game's specific specs
      stay green (Section C)

## Section B — Frozen contracts

### B.1 Frozen E2E IDs (shared chrome, must never change)

| ID | Owner component | Frozen behavior |
|----|-----------------|-----------------|
| `#start-btn` | `GameControls` (`@cetus/ui`) | Visible when idle; page script hides it (`display:none`) once the game starts |
| `#end-btn` | `GameControls` | Rendered with inline `style="display:none"`; shown after start (games that pass `showEnd={false}` or render custom controls exempt — see deviations) |
| `#pause-btn` | `GameControls` | Pause/resume toggle when `showPause` (default true) |
| `#reset-btn` | `GameControls` | Reset-to-idle; start button reappears |
| `#score` | `GameStats` | SSR text `0`; game scripts mutate `textContent` |
| `#time-remaining` | `GameStats` | SSR text = `initialTime`; scripts mutate; `s` suffix sits outside the span |
| `#game-over-overlay` | `GameOverlay` | `fixed inset-0 … hidden` by default; scripts `classList.remove('hidden')` (Bubble Shooter/Bejeweled additionally assert `inert` toggling) |
| `#game-over-title` | `GameOverlay` | Default `GAME OVER!`; per-game `overlayTitle` prop overrides |
| `#final-score` | `GameOverlay` | SSR text `0`; scripts fill final score |
| `#play-again-btn` | `GameOverlay` | Default text `Play Again`; `overlayButtonText`/`overlayButtonId` props may override (Sudoku uses `#restart-btn`; Ice Slide relabels to `Retry Seed`) |

Additional IDs on the shared chrome worth freezing while we are here:
`#game-status` (custom pre-start status overlay used by Reflex, Evader,
Circuit Hacker, Satellite Sync, Ice Slide, 2048 — hidden once playing),
`#achievement-award-overlay` (AppNotifications island award card),
`#field-sheet` and its `data-panel` sections (plates only).

**Known, e2e-asserted deviations from the default chrome** (each pinned by a
spec — do not "fix" them silently during migration):

- Reflex, Evader, Circuit Hacker render custom controls with `#start-btn` +
  `#stop-btn` (`#stop-btn` acts as the end button; there is no `#end-btn`).
- Satellite Sync's manual `#end-btn` returns to pre-start (start button back,
  end hidden); `#game-over-overlay` only appears on win/fail.
- Snake's reset path asserts `#start-btn` becomes visible again and that
  `window.snakeGame` is still owned by the page-root init script.
- GamePage prop-driven control removals (Section A "GamePage props" column):
  e.g. Mine Grid / Pattern Pulse / Potion Sorter / Chromatic Tide have no
  pause/end buttons at all; Sudoku has no time badge.

### B.2 `@cetus/ui` game component defaults (verified in code, HPA-379 output)

- `GameOverlay` (`packages/ui/src/components/game-overlay.tsx`): defaults
  `id="game-over-overlay"`, `titleId="game-over-title"`,
  `scoreId="final-score"`, `buttonId="play-again-btn"`,
  `defaultTitle="GAME OVER!"`, `buttonText="Play Again"`, `showScore=true`.
  The root div always carries the `hidden` class (kept intact under `cn()`),
  so the overlay defaults to **hidden** and `#final-score` renders **0**.
- `GameControls` (`game-controls.tsx`): renders `#start-btn` (visible),
  `#end-btn` **hidden via inline `display:none`** until a script shows it
  (only rendered when `showEnd`, default true), `#pause-btn`, `#reset-btn`.
  SSR-only — no hydration; scripts mutate imperatively.
- `GameStats` (`game-stats.tsx`): `#score` starts at `0`; `#time-remaining`
  renders exactly `initialTime` (default 60) and is **only** the initial time
  — React never re-renders it (no `client:` directive anywhere on the chrome).
- `GameTitle` / `GameBreadcrumb`: static SSR text, no IDs, never mutated by
  game scripts.

### B.3 Debug globals — asserted method/return shapes (grep of `apps/web/e2e/`)

| Global | Assigned by | Asserted shape (from E2E) | Specs |
|--------|-------------|---------------------------|-------|
| `window.snakeGame` | `pages/snake/index.astro` | Truthy after load; page-root script must still own the instance | `play-coverage.spec.ts` |
| `window.tetrisGame: TetrisInitResult` | `pages/tetris/index.astro` | `game.start()`, `game.addScore(n)`, `game.getState()`, `endGame(): Promise<void>` | `tetris-challenge.spec.ts`, `score-submit-smoke.spec.ts` |
| `window.iceSlideGame` | `lib/games/ice-slide/init.ts` (deleted on teardown) | `getGame(): { getState(): IceSlideState \| null; getGameData(): IceSlideGameData } \| null`; state fields used: `status` (`'idle'` when ready), `runKey`, `levelIndex`, `player`, `grid`, `moves`, `undoChargesAvailable`, `undoChargesUsed`; data fields: `routeChoices`, `stageObjectiveIds`, `stageSignatures`, `stageScoreMultipliersBps` | `play-coverage.spec.ts`, `score-submit-smoke.spec.ts` |
| `window.mineGridGame` | `pages/mine-grid/index.astro` | Assigned (typeof handle); no direct method assertions in e2e | — |
| `window.patternPulseGame` | `pages/pattern-pulse/index.astro` | `getState(): { phase: string; sequence: number[]; inputIndex: number }` | `play-coverage.spec.ts` |
| `window.gravityFlipGame` | `pages/gravity-flip/index.astro` | `getGame(): { getState(): { gameStarted: boolean } }` | `play-coverage.spec.ts` |
| `window.signalSwitchGame` | `pages/signal-switch/index.astro` | `game.update(deltaSeconds: number)`, `game.getState(): { safePasses; combo; score; integrity; isGameOver }` | `play-coverage.spec.ts` |
| `window.rhythmReactorGame` | `pages/rhythm-reactor/index.astro` | `game.reset()`, `game.start()`, `game.update(deltaSeconds)`, `game.end(): Promise<void>`, `game.getState(): { elapsedSeconds; pendingNotes: [{ laneIndex: 0\|1\|2\|3; hitTimeSeconds }]; perfectHits; goodHits; misses; strayPresses; combo; score; stability; lastJudgment: 'perfect'\|'good'\|'miss'\|null; isActive }` | `play-coverage.spec.ts` |
| `window.asteroidDriftGame` | `pages/asteroid-drift/index.astro` | `getState(): { isActive; outcome; asteroids; orbsCollected; player: { x; y; velocityX; velocityY } }`, `getGame(): { pressedDirections: Set<string> }` | `play-coverage.spec.ts` |
| `window.chromaticTideGame` | `pages/chromatic-tide/index.astro` | `getState(): ChromaticTideState` (fields used: `isActive`, `outcome`, `movesUsed`, `capturedCells`, `initialCapturedCells`, `board`, `territoryColor`) | `play-coverage.spec.ts` |
| (no global) | Memory Matrix, Quick Math, Word Scramble, Reflex, Evader, Path Navigator, Sudoku, Circuit Hacker, Satellite Sync, 2048, Bejeweled, Bubble Shooter | E2E drives these games through DOM/canvas + chrome IDs only | `play-coverage.spec.ts`, `2048.spec.ts`, `quick-math.spec.ts` |

Note: `window.__expeditionSeedCalls` in `play-coverage.spec.ts` is a
test-installed crypto counter, not a game contract.

Cleanup semantics to preserve: framework games expose `cleanup()` on their
init result (render loop + button/keyboard/unload handlers +
`renderer.cleanup()` + `game.destroy()`); handle-based games invalidate stale
async work via a module-scope `createRunGuard()`; Ice Slide additionally
deletes `window.iceSlideGame` on teardown. The unused `GameInitializer.ts`
was deleted from `apps/web/src/lib/games/core/` in Stage 5 (commit 2f438993)
after the importer audit confirmed zero production importers.

## Section C — Blocking E2E baseline

- Blocking baseline = `apps/web/e2e/games/play-coverage.spec.ts` (one or more
  happy-path + regression tests per game, including the 390px/375px mobile
  layouts) plus the game-specific specs `tetris-challenge.spec.ts`,
  `2048.spec.ts`, `quick-math.spec.ts`, `score-submit-smoke.spec.ts`,
  `all-games-navigation.spec.ts`, and `user-journey/complete-game-session.spec.ts`.
- Stage 0 run: **110 passed / 3 skipped** (skips are the unconditional
  `test.skip()` cases in `e2e/pages/profile-activity.spec.ts`), no retries
  needed, no flakes observed.
- Manual visual snapshots at desktop **1280px** and mobile **390px**:
  **PENDING** (human artifact per plan; no `toHaveScreenshot` framework and no
  screenshot tooling to be built in this repo). Capture per game before each
  island lands and compare by eye.
- Determinism hooks the specs rely on (keep working after migration):
  `page.clock` control of game timers, `crypto.getRandomValues` override for
  Ice Slide Expedition seeds, `/api/scores` + `/api/leaderboard` route mocks,
  `data-signed-in` DOM flag rewriting, `@cetus/games` test fixtures
  (`ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS`,
  `createIceSlideExpeditionRunDefinition`, `selectGreedyChromaticTideColor`,
  `SIGNAL_SWITCH_RULES`, `ASTEROID_DRIFT_RULES`).
- Checkpoint status: baseline and contracts reviewed. **No new loader
  registry** in this stage.

## Migration status — IMPLEMENTED (Stage 5 close-out)

Every game now follows one of three island patterns (16 React BaseGame
screens via `@cetus/app-core` `useGameSession`, 4 hosted field-plate
controllers, 3 handle games). Route + board-host IDs, debug globals and
toast ownership were preserved per Section A/B; e2e specs were not edited.

| # | Game | Island (`components/islands/games/`) | Migration commits |
|---|------|--------------------------------------|-------------------|
| 12 | Snake | `SnakeScreen.tsx` | eeaa03a1, dc4b6691 |
| 3 | Memory Matrix | `MemoryMatrixScreen.tsx` | dbbf1f7f |
| 16 | Mine Grid | `MineGridScreen.tsx` | 82755ad2, c31827b2, 36b744a2, 833cffda |
| 17 | Pattern Pulse | `PatternPulseScreen.tsx` | 2cc2b302, 833cffda |
| 19 | Potion Sorter | `PotionSorterScreen.tsx` | 72b6d627, 46e07712 |
| 23 | Chromatic Tide | `ChromaticTideScreen.tsx` | c91f257d |
| 7 | Sudoku | `SudokuScreen.tsx` | 94d78ca3, 46e07712, 3c2c85f7 |
| 4 | Quick Math | `QuickMathScreen.tsx` | 565f9c09, 9c43f70c |
| 5 | Word Scramble | `WordScrambleScreen.tsx` | 2768ac71 |
| 6 | Reflex | `ReflexScreen.tsx` | 7497a053 |
| 10 | Evader | `EvaderScreen.tsx` | 2e6e1e5e |
| 9 | Path Navigator | `PathNavigatorScreen.tsx` | 191ac77c |
| 20 | Signal Switch | `SignalSwitchScreen.tsx` | 1e4aa99b |
| 18 | Gravity Flip | `GravityFlipScreen.tsx` | b7f5c680 |
| 22 | Asteroid Drift | `AsteroidDriftScreen.tsx` | 8c0c7ac0 |
| 21 | Rhythm Reactor | `RhythmReactorScreen.tsx` | 15aa5aaa |
| 13 | Circuit Hacker | `CircuitHackerScreen.tsx` | 08b62828, 866776d9 |
| 14 | Satellite Sync | `SatelliteSyncScreen.tsx` | e1deb485 |
| 15 | Ice Slide | `IceSlideScreen.tsx` | 65fb5058 |
| 2 | Bubble Shooter | `BubbleShooterScreen.tsx` + `bubble-shooter/controller.ts` | 8fc18f73, 0cecef30 |
| 1 | Tetris | `TetrisScreen.tsx` + `tetris/controller.ts` | abae3043 |
| 11 | 2048 | `Game2048Screen.tsx` + `2048/controller.ts` | e394e2b4 |
| 8 | Bejeweled | `BejeweledScreen.tsx` + `bejeweled/controller.ts` | bb77bbac |

Shared milestones: `GamePage.astro` deleted in bed125dc; unused
`GameInitializer.ts` deleted in 2f438993.

**Pending human artifacts (not automatable in this repo):**

- Authenticated Vercel preview check (sign-in-gated games on the deployed
  preview).
- Manual visual snapshots at 1280px and 390px per game (Section C note
  stands — no screenshot tooling; compare by eye).
- Known pre-existing local-DB quirk: `displayName` column SQLITE error on a
  stale local `db.sqlite` — pre-dates this PR, unaffected by it; refresh the
  local DB via `bun run e2e:db:init` if hit.
