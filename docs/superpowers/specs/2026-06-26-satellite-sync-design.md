# Satellite Sync — Design Spec

- **Linear issue:** [HPA-77 — Minigame: Satellite Sync](https://linear.app/cwchanap/issue/HPA-77/minigame-satellite-sync)
- **Date:** 2026-06-26
- **Status:** Approved design, ready for implementation planning

## Overview

Satellite Sync is a sci-fi orbital-alignment puzzle, the 14th game on the Cetus
platform. Satellites occupy fixed positions on concentric orbital rings around a
central body and each emits a colored beam. The player drags a beam to aim it; when
it points at a valid target receiver, it snaps and **locks on**, satisfying that
target. The player must lock every target before the level timer expires.

It is a multi-level game: a sequence of 8 authored levels of rising difficulty,
each with its own time budget. Mechanisms layer in across levels — multiple beam
colors, moving targets, and line-of-sight-blocking obstacles — and are all present
in this first version. The game is rendered on a PixiJS canvas and integrated into
the existing leaderboard, achievement, and home-page systems.

## Gameplay & Flow

1. Player presses **Start** → level 1 loads, its per-level countdown timer begins.
2. Player drags a satellite's beam to aim it. Near a valid target the beam snaps;
   releasing **locks** the target (it lights up, considered solved).
3. Locking targets in quick succession builds a **combo** multiplier.
4. **Level cleared:** every target locked → leftover time becomes a time bonus →
   level-clear bonus awarded → next level spawns, score carries over.
5. **Fail:** a level's timer reaches 0 before all its targets are locked → game-over
   overlay; the run's accumulated score is submitted (when logged in).
6. **Mission complete:** level 8 cleared → win overlay; final score submitted.
7. **Restart** returns to level 1 with a fresh score.

## Scene & Mechanics

**Scene elements** (all defined per level):

- **Central body** — a planet/star at the canvas center; purely visual anchor.
- **Satellites** — fixed positions on concentric orbital rings. Each has a fixed
  **beam color** and a current beam angle (the aim).
- **Targets (receivers)** — sit on rings. Each requires a **matching color** to lock.
  Targets are either **fixed** or **moving** (drift along their ring at a set angular
  speed and direction).
- **Obstacles** — opaque bodies (asteroids) at fixed or moving positions that block
  **line-of-sight**: a beam whose straight-line segment to a target intersects an
  obstacle cannot lock through it.

**Lock-on rule (core mechanic).** A beam is a ray extending outward from its
satellite. While dragging, if the aim falls within an **angular snap threshold**
(≈8°) of a target whose color matches and whose straight-line segment from the
satellite is unobstructed, the beam magnetically snaps to point at it; releasing
**locks** it (target lights up, considered solved). Re-aiming a locked satellite
**unlocks** its previous target, and a target is satisfied by a single lock. A level
is **solved when every target is locked**. Any satellite of matching color may lock
any reachable target; authored levels guarantee at least one solvable arrangement
(satellites ≥ targets of each color).

**Combos.** Locking targets within a **combo window** (≈2.5s of the previous lock)
raises a combo multiplier (×1 → ×1.5 → ×2 … capped at ×3). The combo resets when the
window elapses or a target is unlocked. The multiplier applies to the points awarded
per lock.

**Controls (desktop + mobile).** Pointer-down on/near a satellite selects it and
begins aiming; drag rotates the beam (it follows the pointer); near a valid target it
visually snaps; pointer-up commits/locks (or leaves the beam at the dragged angle if
no valid target is near). Touch uses the same Pointer Events with `getBoundingClientRect()`
scaling — the unified mouse/touch pattern used by circuit-hacker. Keyboard is a
secondary a11y path: `q` cycles satellites (Tab is intentionally left free for
browser focus navigation), ←/→ rotates the selected beam in small steps, Enter/Space
commits the lock.

## Level Progression

Discrete authored levels, each layering one mechanic so the player learns then faces
combined challenges. Starting values; tunable during implementation.

| # | Name             | Introduces                                            | Time |
|---|------------------|-------------------------------------------------------|------|
| 1 | First Contact    | 3 fixed single-color satellites → fixed targets       | 60s  |
| 2 | Spectrum         | **Multiple beam colors** — must match color to lock   | 55s  |
| 3 | Crossfire        | Adds a **second ring** + more targets                 | 50s  |
| 4 | Debris Field     | **Obstacles** block line-of-sight                     | 50s  |
| 5 | Orbit Drift      | **Moving targets** — snap at the right moment         | 45s  |
| 6 | Shifting Debris  | Moving targets **+** obstacles                        | 45s  |
| 7 | Prismatic Storm  | All mechanics, more targets, 3 colors                 | 40s  |
| 8 | Singularity      | Tightest time, moving + obstacles + 3 colors          | 40s  |

Clear a level → the next spawns, score carries over. Run out of time → game over
(fail). Clear level 8 → mission complete (win). Restart returns to level 1. (Per the
issue's "round length 1–3 minutes," each level is a short round; a full mission run
is ~6–8 minutes of escalating play.)

## Level Data Model

Authored levels live in `levels.ts` as a compact, deterministic, unit-testable form:

```ts
interface SatelliteDef { ring: number; angle: number; color: BeamColor }
interface TargetDef    { ring: number; angle: number; color: BeamColor; moving?: { speed: number; direction: 1 | -1 } }
interface ObstacleDef  { ring: number; angle: number; radius: number; moving?: { speed: number; direction: 1 | -1 } }

interface SatelliteSyncLevel {
  id: number
  name: string
  timeBudget: number          // seconds, per-level countdown
  rings: number               // concentric orbital rings used
  satellites: SatelliteDef[]
  targets: TargetDef[]
  obstacles: ObstacleDef[]
}
```

Positions use `ring` (0 = innermost) + `angle` (degrees from top), resolved to canvas
coordinates by the renderer. `BeamColor` is drawn from the sci-fi palette
(e.g. cyan, magenta, yellow, green).

## Scoring

Pure functions in `scoring.ts`. All constants live in one config object so they are
trivially tunable.

- **Lock base:** `100` points, multiplied by the current combo multiplier.
- **Combo multiplier:** `1 + 0.5 × (comboCount − 1)`, capped at ×3.
- **Level-clear bonus:** `250 × levelNumber` (rewards progression).
- **Time bonus on clear:** `remainingSeconds × 10`.

Score accumulates across levels and is submitted once at run end (win or fail) via
`saveGameScore`. Failed runs submit whatever score was accumulated; the score service
skips submissions where `score <= 0`.

`gameData` submitted with the score:

```ts
interface SatelliteSyncGameData {
  levelsCleared: number
  maxCombo: number
  totalLocks: number
  solved: boolean             // true iff all 8 levels cleared
  minTimeRemainingRatio: number // tightest any level's timer got (for the "Untouchable" achievement)
}
```

The leaderboard ranks on final score only.

## Architecture & File Structure

**Hybrid pattern:** a standalone game class (no `BaseGame`) that reuses core utilities
`GameTimer` and `ScoreManager` from `src/lib/games/core/`. This fits the per-level
timer + discrete-level progression, which map poorly onto `BaseGame`'s single-run
model, while still leveraging the battle-tested timer and score plumbing.

```text
src/lib/games/satellite-sync/
  types.ts        # State, Config, Level/Satellite/Target/Obstacle defs, BeamColor,
                  #   SatelliteSyncGameData, Callbacks interface
  levels.ts       # 8 authored SatelliteSyncLevel definitions
  geometry.ts     # PURE helpers: ringAngle→point, bearing(), angleDiff(),
                  #   segmentIntersectsCircle() (obstacle blocking), snap decision
  scoring.ts      # PURE scoring: lockPoints(combo), levelClearBonus, timeBonus, comboMultiplier
  game.ts         # SatelliteSyncGame — state + level progression; reuses core
                  #   GameTimer (per-level countdown) + ScoreManager (live score)
  renderer.ts     # functional PixiJS: setupScene(), render(state), pointer→satellite
                  #   mapping, beam/lock/obstacle drawing, cleanup()
  init.ts         # initializeSatelliteSync(container, callbacks) → { start, stop, cleanup, getGame }
  game.test.ts    # scoring, geometry, combo, level-solvability unit tests
  init.test.ts    # wiring/DOM tests
src/pages/satellite-sync/index.astro   # all HTML structure: level/score/time badges,
                                       #   canvas container, GameOverlay, controls, how-to-play
```

Per the project's Astro–TypeScript pattern, all HTML structure lives in the Astro page;
TypeScript only manipulates dynamic content and the canvas.

### Reuse of Core Utilities

- **`GameTimer`** (`core/GameTimer.ts`) — drives each level's countdown. Constructed
  per level (or `reset()` with a new duration) as
  `{ duration: level.timeBudget, countDown: true, onTick, onComplete }`; `onComplete`
  fires the level-fail path. Provides `start/pause/resume/stop/getCurrentTime`.
- **`ScoreManager`** (`core/ScoreManager.ts`) — tracks the running score. Constructed
  as `{ gameId: GameID.SATELLITE_SYNC, scoringConfig: { basePoints: 100, bonusMultiplier: 1, timeBonus: true }, achievementIntegration: false, onScoreUpdate }`.
  Because its `bonusMultiplier` is a single static value and cannot model dynamic
  combos, the combo multiplier is computed in `game.ts` and pre-multiplied points are
  passed to `addPoints(points, reason)`.
- **Final submission** — at run end, `init.ts` calls
  `saveGameScore(GameID.SATELLITE_SYNC, score, onSuccess, onError, gameData)` (the
  circuit-hacker path). It auto-shows achievement toasts via `window.showAchievementAward`,
  which `ScoreManager.saveFinalScore` does not. `ScoreManager.achievementIntegration`
  is therefore left `false`.
- **Game→UI communication** uses a typed **Callbacks interface** (the circuit-hacker
  pattern), not the core `GameEventEmitter`: the emitter constrains event types to a
  fixed 8-value set (`start|pause|resume|end|score-update|time-update|time-complete|state-change`)
  that cannot express custom events like `lock`, `level-clear`, or `combo`.

The Callbacks interface:

```ts
interface SatelliteSyncCallbacks {
  onGameStart: () => void
  onTimeUpdate: (seconds: number) => void
  onScoreUpdate: (score: number) => void
  onLock: (info: { combo: number; multiplier: number }) => void
  onLevelClear: (level: number) => void
  onFail: (level: number, finalScore: number) => void
  onWin: (finalScore: number) => void
}
```

### Component Responsibilities

- **types.ts** — shared type definitions; no logic.
- **levels.ts** — the 8 level definitions only; no logic.
- **geometry.ts** — pure geometry: ring/angle → point, bearing from a satellite to a
  target, angular difference, segment-circle intersection (obstacle blocking), and the
  snap decision (is a target within the angular snap threshold, color-matched,
  and unblocked). Independently unit-testable.
- **scoring.ts** — pure scoring: combo curve, lock points, level-clear bonus, time
  bonus. Independently unit-testable.
- **game.ts** — owns state and rules: loading a level, applying an aim/lock/unlock,
  combo tracking, detecting level clear, advancing levels, computing `gameData`, and
  driving the `GameTimer`/`ScoreManager`. Depends on geometry, scoring, and levels.
- **renderer.ts** — functional PixiJS: draws rings, central body, satellites, colored
  beams, targets (with drift animation), and obstacles; highlights snap candidates and
  locked targets in the sci-fi neon palette; maps pointer events to a satellite. No
  game rules.
- **init.ts** — wiring: instantiates renderer + game, bridges input → game, forwards
  game callbacks to DOM elements by ID, manages the Start↔End button toggle and the
  game-over overlay, submits the score at run end, and exposes `cleanup()`.

### Input & Rendering

- **Input** — Pointer Events on `renderer.app.canvas` with `getBoundingClientRect()`
  scaling (mouse + touch unified): pointer-down on/near a satellite selects + begins
  aim, drag rotates the beam, near a valid target it snaps, pointer-up commits/locks.
  Keyboard (`q` cycle, ←/→ rotate, Enter/Space commit) is a secondary a11y path;
  Tab is left free for browser focus navigation.
- **Rendering** — functional PixiJS (the circuit-hacker style): a single `app`,
  redrawn per frame from game state. Snap candidates and locked targets glow; moving
  targets/obstacles animate along their rings.

## Integration Points

- **`src/lib/games.ts`:**
  - Add `SATELLITE_SYNC = 'satellite_sync'` to the `GameID` enum.
  - Add a `GAMES` entry: `category: 'strategy'`, `difficulty: 'medium'`,
    `estimatedDuration: '6-8 minutes'`, tags
    `['satellite', 'sync', 'single-player', 'timing']`, `isActive: true`.
  - Add a `GAME_ICONS` entry: `🛰️`.
- **`src/pages/index.astro`:** add `satellite_sync: 14` to `idMapping`; add
  `difficultyLabels` / `durationLabels` entries.
- **`src/components/ui/GameCard.astro`:** add
  `case 'Satellite Sync': return '/satellite-sync'` to the title→URL switch.
- **Automatic via the enum (no edits):** `GameType`, the Zod score schema
  (`Object.values(GameID)` in `src/lib/server/validations.ts`), `scoreService`,
  `achievementService`, `/api/scores`, and the leaderboard query schema.
- **`src/lib/games/shared/types.ts`:** add `SatelliteSyncGameData` and include it in
  the `GameData` union.
- **`src/lib/achievements.ts`:** import the type, add it to the `AchievementCheckData`
  union, and define the achievements below.

## Achievements

~5 achievements across the four rarity tiers, modeled on the circuit-hacker block:

| Achievement       | Rarity    | Condition                                                          |
|-------------------|-----------|--------------------------------------------------------------------|
| First Sync        | COMMON    | score ≥ 1 (welcome)                                                |
| Combo Commander   | RARE      | reach a ×3 combo (`in_game` on `maxCombo`)                         |
| Mission Complete  | RARE      | clear all 8 levels (`in_game` on `levelsCleared === 8`)            |
| Untouchable       | EPIC      | clear the mission with every level's timer staying above 25% (`in_game` on `solved && minTimeRemainingRatio >= 0.25`) |
| High Command      | LEGENDARY | score ≥ 15,000 (score_threshold)                                   |

## Data Flow

1. Page load → `init.ts` queries the canonical element IDs (`#game-canvas-container`,
   `#score`, `#time-remaining`, `#level`, `#start-btn`, `#end-btn`,
   `#game-over-overlay`, `#final-score`, `#play-again-btn`).
2. On **Start** → renderer builds the scene for level 1 → game loads level 1 → a
   `GameTimer` starts counting down.
3. Drag/aim → renderer hit-tests the pointer to a satellite → game updates the beam
   angle → geometry evaluates the snap candidate → on release, game applies the
   lock/unlock and awards combo-adjusted points via `ScoreManager` → renderer updates.
4. **Level cleared** → game awards level-clear + time bonus → next level loads and a
   fresh `GameTimer` starts.
5. **Win** (level 8 cleared) → timers stop → `init.ts` calls `saveGameScore` with
   `gameData` → win overlay; achievement/challenge notifications via existing hooks.
6. **Fail** (timer expiry) → timer stops → accumulated score submitted via
   `saveGameScore` → fail overlay.
7. **Restart** → returns to level 1, resets score and combo.
8. `beforeunload` → `cleanup()` destroys the Pixi app and aborts listeners.

## Error Handling

- `saveGameScore` failures and the unauthenticated (401) case are handled
  non-blockingly, matching existing games — the game remains playable and the user is
  informed without an exception.
- Pointer-to-satellite hit-testing is bounded; aiming/locking with no valid target is
  a no-op (beam stays at the dragged angle).
- A moving target that is mid-snap when it leaves range cancels the snap (no stale
  locks).
- Geometry math guards against degenerate cases (zero-length segments, coincident
  points).

## Testing Strategy

- **game.test.ts / scoring / geometry:**
  - `scoring.ts` — combo curve (`comboMultiplier(comboCount)`), lock points with
    multiplier, level-clear bonus (`250 × levelNumber`), time bonus
    (`remainingSeconds × 10`).
  - `geometry.ts` — bearing from a satellite to a target, angular difference,
    `segmentIntersectsCircle()` for obstacle blocking (clear, grazing, fully blocked),
    and the snap decision (within threshold, color-matched, unblocked).
  - Combo behavior — combo increments on rapid locks, resets when the window elapses,
    resets on unlock.
  - **Level-solvability check** — every authored level has at least one valid
    satellite→target pairing (ignoring obstacles, then respecting obstacles) so
    unsolvable configs cannot ship.
  - Level flow — level cleared when all targets locked; advancement; win at level 8;
    fail on timer expiry.
- **init.test.ts** — start/stop button toggle, overlay shown on fail/win, score/time
  DOM updates via callbacks, `gameData` passed to `saveGameScore` with the expected
  shape, `cleanup()` destroys the Pixi app.
- **`src/lib/games.test.ts`** — registration test asserting `GameID.SATELLITE_SYNC`
  resolves via `getGameById` (copy the existing pattern).

## Acceptance Criteria (from HPA-77)

How this design satisfies each criterion:

- **Appears on the home page** with icon, duration, difficulty, and Play Now link →
  registry (`games.ts`) + `GameCard` route + `index.astro` wiring.
- **Start / align / complete or fail / restart** a run → gameplay flow + `init.ts`
  (start → aim/lock → level clear / timer-expiry fail → restart from level 1).
- **Final score submitted** to the existing leaderboard/progress flow when logged in →
  `saveGameScore` + achievements integration.
- **Works on desktop and mobile controls** → drag-aim handled identically via PixiJS
  pointer events with `getBoundingClientRect()` scaling; keyboard as a secondary path.
