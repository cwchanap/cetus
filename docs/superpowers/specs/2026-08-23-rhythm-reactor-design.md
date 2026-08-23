# Rhythm Reactor — Design Spec

- **Linear issue:** HPA-70 — Minigame: Rhythm Reactor
- **Date:** 2026-08-23
- **Status:** Planning draft

## Overview

Rhythm Reactor is a deterministic 60-second visual rhythm game. Notes descend through four lanes toward a fixed hit line. The player presses the matching lane at the right time using keyboard shortcuts or four native touch buttons. Accurate hits score points, extend combo, and stabilize the reactor; missed notes and stray presses break combo and reduce stability.

Version 1 intentionally does **not** add music or an audio-synchronization subsystem. The beat chart is authored on a fixed 120 BPM visual grid and uses one game-local animation loop. This preserves the ticket's timing gameplay while keeping browser audio latency, asset loading, autoplay restrictions, calibration, and chart/audio synchronization out of scope.

The architecture follows the current Gravity Flip and Signal Switch seams:

- `RhythmReactorGame extends BaseGame` owns deterministic note/judgment/scoring state.
- `RhythmReactorRenderer extends PixiJSRenderer` draws four lanes, the hit line, and falling notes.
- one game-local `requestAnimationFrame` loop advances simulation and renders.
- four native Astro buttons plus `D/F/J/K` call the same `hitLane(laneIndex)` API.
- BaseGame remains the timer, score-persistence, stale-run, achievement, reset, and end-of-run authority.

No generic rhythm/chart/audio/input framework is introduced.

## Why HPA-70 Is Next

The current standalone-minigame sequence has landed through HPA-71 Signal Switch. HPA-70 Rhythm Reactor is still in Backlog, has no blockers or related dependencies, and is the next open ticket in that sequence. HPA-68 Asteroid Drift remains after it.

The current repository also already contains the relevant reusable seams:

- Reflex measures reaction time but uses wall-clock object lifetimes.
- Pattern Pulse provides recent native four-button + keyboard interaction patterns.
- Gravity Flip and Signal Switch provide the current `BaseGame + PixiJSRenderer + game-local rAF` convention.
- Signal Switch already extracted `isEditableTarget()` to shared utils, so Rhythm Reactor can reuse it without another cross-game refactor.

## Product Goals

- Deliver a readable one-minute visual rhythm loop with no setup or difficulty selection.
- Make the first note visible immediately when the run starts.
- Use a deterministic authored chart so scoring and timing are fair and testable.
- Reward timing quality and long successful streaks without a second score authority.
- Make misses visibly destabilize the reactor while preserving the fixed 60-second round contract.
- Support touch and keyboard through one lane-hit API.
- Keep all four touch controls reachable on a 375×812 viewport.
- Reuse the existing score submission, leaderboard/progress, achievements, GamePage, stale-run guard, and unload-warning behavior.
- Keep tuning values centralized so the playable checkpoint can adjust feel before achievements/E2E freeze thresholds.

## Non-Goals

Version 1 does not include:

- songs, BGM, sound effects, Web Audio synthesis, autoplay handling, or audio calibration;
- BPM selection, difficulty selection, song selection, charts loaded from files, chart editors, or user-created charts;
- random/procedural beat generation;
- simultaneous/chord notes, hold notes, slides, flicks, mines, power-ups, or special note types;
- latency-offset settings or persisted calibration;
- early reactor meltdown as a second end condition;
- pause or manual End Game actions;
- canvas hit-testing for touch;
- generic rhythm, chart, spawn, animation-loop, input, or timing frameworks;
- database, API, auth, leaderboard, score-service, BaseGame, GameTimer, or PixiJSRenderer changes.

## Approaches Considered

### A. Deterministic visual chart — chosen

Use one authored visual beat chart, game-local simulation time, Pixi notes, native buttons, and no audio.

**Why:** smallest implementation, deterministic tests, no asset pipeline, no audio-latency ambiguity, and directly satisfies the ticket's falling-beat interaction.

### B. Audio-backed rhythm chart — rejected for v1

Bundle a music loop and synchronize notes to an audio clock.

**Why not now:** this immediately introduces autoplay policy, decoding/start latency, audio-clock ownership, background behavior, calibration, and chart/audio asset coupling. Those are valid future product work but unnecessary to prove the minigame loop.

### C. Random note stream — rejected

Generate lane/timing events during play.

**Why not:** random timing feels more like reflex whack-a-mole than rhythm, creates run-to-run scoring variance, and complicates deterministic balance/E2E checks without adding meaningful v1 value.

## Frozen V1 Rules

| Rule | Value |
|---|---:|
| Run duration | 60 seconds |
| Lanes | 4 |
| Keyboard lanes | `D`, `F`, `J`, `K` |
| Logical canvas | 800 × 420 px |
| Visual beat grid | 120 BPM / 0.5-second steps |
| First note hit time | 2.0 s |
| Last note hit time | 57.5 s |
| Total chart notes | 86 |
| Note approach time | 2.0 s |
| Perfect window | ±0.080 s |
| Good window | ±0.160 s |
| Maximum accepted outer update | 0.1 s |
| Initial stability | 60 / 100 |
| Perfect stability | +4 |
| Good stability | +2 |
| Miss stability | −6 |
| Every 10th consecutive hit | additional +5 stability |
| Perfect base score | 100 |
| Good base score | 60 |
| Combo multiplier | +0.25× each 10 combo, max 2.0× |
| BaseGame time bonus | disabled |

Structural/tuning values live once in `RHYTHM_REACTOR_RULES`. Scoring constants live once in `scoring.ts`. Tests import those sources rather than duplicating tunable numbers.

## Authored Beat Chart

The chart is fixed on one continuous 0.5-second step grid. A step contains either one lane index or a rest; v1 never emits simultaneous notes.

```ts
export type RhythmReactorLane = 0 | 1 | 2 | 3

type ChartStep = RhythmReactorLane | null

const WARMUP_PATTERN: readonly ChartStep[] = [
    0, null, 1, null, 2, null, 3, null,
    0, 1, null, 2, null, 3, 1, 2,
]

const CORE_PATTERN: readonly ChartStep[] = [
    0, 1, null, 2, 3, null, 1, 2,
    0, null, 3, 2, 1, null, 0, 3,
]

const SURGE_PATTERN: readonly ChartStep[] = [
    0, 1, 2, null, 3, 2, 1, 0,
    1, 3, null, 2, 0, 3, 1, 2,
]
```

The chart concatenates:

- Warmup pattern ×2 = 32 steps / 20 notes;
- Core pattern ×2 = 32 steps / 24 notes;
- Surge pattern ×3 = 48 steps / 42 notes.

Total: 112 grid steps, 86 notes.

Hit time derives only from the continuous step index:

```text
hitTime = 2.0 + stepIndex × 0.5
```

Therefore:

- first note hits at 2.0s and is already at its spawn position at run start because approach time is also 2.0s;
- last grid step is index 111, so the last possible note hits at 57.5s;
- no two notes are simultaneous;
- maximum input demand is 2 hits/second;
- every authored note naturally leaves its Good window before the 60-second timeout.

`createRhythmReactorChart()` is a small pure game-local materializer from these three patterns. It assigns stable `note-0`, `note-1`, … IDs in chronological order. This is not a generic chart system.

Tests freeze structural invariants rather than every expanded object: exact 86-note count, first/last hit times, lane range, chronological order, no duplicate hit times, and the exact three source patterns/repeat counts.

## Time Ownership

### BaseGame owns run duration

BaseGame/GameTimer remains the authoritative 60-second wall-time run timer and the only component that can complete the run by timeout. Rhythm Reactor does not create a second countdown or timer interval.

### Game-local simulation time owns visual/judgment position

`RhythmReactorGame` keeps:

```ts
private elapsedSimSeconds = 0
```

The initializer's single rAF loop supplies monotonic deltas. `update(deltaSeconds)` ignores non-positive/non-finite values and clamps accepted outer delta to 0.1s before advancing simulation.

This mirrors Signal Switch: a background-tab return does not fast-forward through unseen gameplay in one huge physics step. If BaseGame times out while simulation is behind, the timeout finalizer marks every remaining chart note as missed before ending so final hit/miss/accuracy statistics remain complete.

No 1/120-second physics substeps are needed because note position is derived from hit time and simulation time rather than integrated velocity.

## Runtime Note Model

```ts
export interface RhythmReactorNote {
    id: string
    laneIndex: RhythmReactorLane
    hitTimeSeconds: number
}
```

`RhythmReactorState.pendingNotes` contains only unresolved chart notes. Notes do not have mutable `y` coordinates.

The renderer derives position from:

```text
timeUntilHit = note.hitTimeSeconds - state.elapsedSeconds
progress = 1 - timeUntilHit / approachSeconds
y = lerp(noteSpawnY, hitLineY, progress)
```

A note is drawn only while it is within the approach horizon and has not been removed as hit/missed. This keeps note timing authoritative in one place and avoids a spawn accumulator entirely.

## Judgment Semantics

Public input API:

```ts
hitLane(laneIndex: number): RhythmReactorHitResult
```

The method rejects without mutation when the game is inactive/paused/over or `laneIndex` is not an integer in `0..3`.

For a valid active press:

1. expire any notes already past the Good window at the current simulation time;
2. find the pending note in that lane with the smallest absolute timing offset;
3. if no same-lane note is within ±0.160s, register one miss for the stray/early/late press without consuming a pending note;
4. otherwise remove the matched note and classify it:
   - `abs(offset) <= 0.080s` → Perfect;
   - `abs(offset) <= 0.160s` → Good.

Boundary values are inclusive. A note expires automatically once:

```text
elapsedSeconds > hitTimeSeconds + 0.160
```

A wrong-lane or empty-lane press is intentionally a miss. This prevents four-key mashing from being a dominant strategy.

The initializer ignores `KeyboardEvent.repeat`, modifier shortcuts, editable targets, and keyboard events originating from native lane buttons. Enter/Space activation on a focused lane button still works through the button's normal click event.

## State and Feedback

```ts
export type RhythmReactorJudgment = 'perfect' | 'good' | 'miss'

export interface RhythmReactorState extends BaseGameState {
    elapsedSeconds: number
    pendingNotes: RhythmReactorNote[]
    perfectHits: number
    goodHits: number
    misses: number
    combo: number
    maxCombo: number
    stability: number
    lastJudgment: RhythmReactorJudgment | null
}
```

Derived hit count is `perfectHits + goodHits`.

The page shows:

- Stability;
- Combo;
- Hits;
- Misses;
- current judgment (`READY`, `PERFECT`, `GOOD`, `MISS`).

`lastJudgment` is presentation state only; it does not schedule a timeout. The next state-changing hit/miss replaces it.

## Stability

Stability is a clamped `0..100` feedback meter, not a second end condition.

- initial stability: 60;
- Perfect: +4;
- Good: +2;
- each miss: −6;
- on every 10th consecutive successful hit, add an additional +5;
- clamp after each change.

A miss resets combo to 0. Successful hits increase combo first, so the 10/20/30… combo milestone applies on that exact successful hit.

Reaching 0 stability does **not** end the run in v1. The one-minute timer remains the sole normal completion condition. This keeps the ticket's fixed-duration contract simple while still making the reactor state visibly respond to performance.

## Scoring and Accuracy

`calculateRhythmReactorHitPoints(judgment, comboAfterHit)` is the only production scoring authority.

Base values:

- Perfect = 100;
- Good = 60;
- Miss = 0.

Combo multiplier:

```text
multiplierSteps = min(floor(comboAfterHit / 10), 4)
multiplier = 1.0 + multiplierSteps × 0.25
```

Therefore:

- combo 1–9 → 1.0×;
- combo 10–19 → 1.25×;
- combo 20–29 → 1.5×;
- combo 30–39 → 1.75×;
- combo 40+ → 2.0×.

Points are integer `floor(basePoints × multiplier)`.

Misses never subtract previously earned score. BaseGame time bonus is disabled.

Accuracy is weighted so Perfect timing matters:

```text
judgments = perfectHits + goodHits + misses
accuracy = judgments === 0
  ? 0
  : (perfectHits + goodHits × 0.5) / judgments × 100
```

The final overlay rounds accuracy to one decimal place for presentation. The raw finite percentage is submitted in game data.

The required summary fields are all direct/derived from final state:

- Hits = Perfect + Good;
- Misses;
- Max combo;
- Accuracy.

## Timeout, Reset, and Replay

`createRhythmReactorConfig()` uses:

- `duration: 60`;
- `achievementIntegration: true`;
- `pausable: false`;
- `resettable: true`.

### Start

`onGameStart()` resets private simulation time and emits the fresh state. The first chart note is already within the 2-second approach horizon.

### Timeout

`handleTimeUp()` first resolves every remaining pending note as a miss, sets `elapsedSeconds` to 60, then delegates to BaseGame's timeout end path. This gives complete final stats even if the browser throttled rAF while hidden.

### Reset

Reset returns the game to idle with:

- full 86-note chart restored;
- score/hit/miss/combo cleared;
- stability 60;
- time 60;
- controls disabled until Start;
- overlay hidden.

### Play Again

Play Again follows Signal Switch: calling `game.start()` after game over lets BaseGame auto-reset the completed run and immediately starts the new run. It is not reset-to-idle.

GamePage uses `showPause={false}`, `showEnd={false}`, `showReset={true}`.

## Renderer

`RhythmReactorRenderer` extends `PixiJSRenderer` with a fixed 800×420 logical canvas and two graphics layers:

1. static layer: dark board, four vertical lanes, lane separators, spawn/hit-line markings;
2. dynamic layer: currently visible notes plus a simple stability/reactor indicator.

At most 86 notes exist in the entire chart and only a small approach-window subset is visible at once. Sprite pooling, textures, particle systems, and custom scene graphs are unnecessary.

The renderer receives the config values required for lane geometry, approach time, spawn Y, and hit-line Y from `createRhythmReactorRendererConfig(config)`.

Lane colors may differ for readability, but lane position and the `D/F/J/K` controls remain sufficient without color perception; gameplay does not require identifying notes by color.

Pixi's auto-density canvas inline width/height is normalized exactly like Gravity Flip/Signal Switch so CSS can preserve aspect ratio on narrow screens.

## Controls and Accessibility

The route renders four native buttons in one `#rhythm-reactor-controls` group:

- Lane 1 — `D`;
- Lane 2 — `F`;
- Lane 3 — `J`;
- Lane 4 — `K`.

All buttons carry `data-rhythm-lane="0..3"`, remain disabled while idle/ended, and use one delegated click listener. Touch does not target the canvas.

Global keyboard handling maps case-insensitive `d/f/j/k` to the same lane indices and reuses `isEditableTarget()`.

An `aria-live="polite"` status node announces the latest judgment and completion summary without attempting to announce every falling note.

No custom arrow-key focus grid is added; buttons preserve native tab/Enter/Space behavior.

## Initializer and Lifecycle

`initRhythmReactorGameFramework()` follows Signal Switch's local initializer structure:

- locate the route container;
- create config, renderer, and game;
- track listeners for cleanup;
- wire score/time/state/end callbacks;
- wire Start, Reset, Play Again, delegated lane clicks, keyboard shortcuts, and `beforeunload`;
- normalize Pixi canvas CSS sizing;
- run exactly one requestAnimationFrame loop;
- expose a debug/test handle at `window.rhythmReactorGame` from the page;
- cleanup cancels rAF, removes tracked listeners, unsubscribes game end, destroys renderer, then destroys game.

No `GameInitializer` migration is included.

## Registration and Shared Data

Implementation adds `GameID.RHYTHM_REACTOR = 'rhythm_reactor'` and the matching icon before the active catalog row is added.

The active `GAMES` entry is added only when `/rhythm-reactor` exists:

- name: Rhythm Reactor;
- category: action;
- estimated duration: 1 minute;
- difficulty: medium;
- tags: rhythm, timing, lanes, single-player, reflex;
- organism: `{ shape: 'chain', color: 'teal' }`;
- depth: `shallow`.

That changes the current depth partition from `7 / 9 / 4` to `8 / 9 / 4`; `organisms.test.ts` is updated explicitly. Appending a `chain/teal` shallow specimen after Signal Switch's `lattice/ice` also preserves the existing adjacent-shape+color invariant.

`RhythmReactorGameData` is exported from the game and added to `src/lib/games/shared/types.ts` for achievement typing.

No persistence schema or API payload shape changes are needed; existing generic gameData submission handles the added fields.

## Achievement Set

Four local achievements are enough for v1:

1. **First Beat** — score at least 100 points. Common.
2. **Chain Reaction** — reach max combo 20. Rare.
3. **Precision Control** — finish with at least 60 hits and at least 90% weighted accuracy. Epic.
4. **Coolant Reserve** — finish with at least 60 hits and final stability at least 90. Epic.

The `hits >= 60` floors prevent accuracy/stability achievements from being awarded on tiny or debug-ended samples.

No new achievement condition type is required.

## Final Stats and Submitted Game Data

```ts
export interface RhythmReactorStats extends BaseGameStats {
    hits: number
    perfectHits: number
    goodHits: number
    misses: number
    maxCombo: number
    accuracy: number
    finalStability: number
}

export interface RhythmReactorGameData {
    hits: number
    perfectHits: number
    goodHits: number
    misses: number
    maxCombo: number
    accuracy: number
    finalStability: number
}
```

Final overlay displays the ticket-required fields plus Perfect/Good split and stability:

- Score;
- Hits;
- Misses;
- Perfect;
- Good;
- Max combo;
- Accuracy;
- Stability.

## Testing Strategy

### Pure chart/scoring tests

Freeze:

- 86 notes;
- first hit = 2.0s;
- last hit = 57.5s;
- chronological IDs/times;
- lanes always 0..3;
- no simultaneous hit times;
- Perfect/Good base values and 1×/1.25×/1.5×/1.75×/2× combo tiers;
- weighted accuracy edge cases.

### Game-model tests

Use small explicit chart/config overrides where helpful. Cover:

- initial state and full authored chart;
- exact Perfect/Good inclusive boundaries;
- nearest same-lane pending note selection;
- wrong/empty press miss without consuming a note;
- automatic expiry after the Good window;
- miss resets combo;
- every 10th hit stability bonus;
- clamp stability to 0..100;
- inactive/invalid input guards;
- reset restoration;
- timeout settles all remaining notes before final stats;
- BaseGame score/time bonus behavior remains single-source.

### Renderer tests

Cover:

- fixed 800×420 config;
- static four-lane geometry and hit line;
- only approach-window notes are drawn;
- note Y reaches the hit line at hit time;
- cleanup destroys local graphics then base renderer resources.

### Initializer/markup tests

Cover:

- four buttons and D/F/J/K mapping;
- delegated touch/click path calls `hitLane()`;
- key repeat/modifier/editable-target guards;
- Start/Reset/Play Again state synchronization;
- timeout/final overlay copy;
- cleanup cancels rAF and listeners;
- page waits for `DOMContentLoaded` before initialization;
- no Pause or End Game controls;
- canvas has mobile-safe sizing.

### Browser proof

Add one Rhythm Reactor journey to `e2e/games/play-coverage.spec.ts`:

1. page renders canvas and four controls;
2. Start activates the run;
3. bounded debug-handle `update(0.1)` calls advance to the first note's exact hit time;
4. clicking Lane 1 records a Perfect hit and score;
5. Reset returns to 60 / 0 hits / 60 stability;
6. restart, advance to first hit, press `D`, and prove keyboard uses the same path;
7. use the debug handle's public `end()` only to expose the existing final overlay without sleeping 60 real seconds, then Play Again immediately starts a clean run.

A second 375×812 proof verifies all four buttons and the Pixi canvas fit without horizontal overflow.

`all-games-navigation.spec.ts` remains derived and receives no production-specific branch; it is run as a post-registration gate.

## Manual-Play Tuning Checkpoint

Run after the route is playable and before registry/achievement/E2E thresholds are frozen.

Check with the default rules:

1. **Opening readability:** the first note is visible for the full 2.0s approach and the D/F/J/K mapping is understandable before impact.
2. **Timing feel:** ±80ms Perfect and ±160ms Good are strict but usable on both keyboard and touch.
3. **Surge density:** the final 24 seconds at up to 2 notes/second remains readable on a laptop and 375px viewport.
4. **Stability feel:** ordinary misses lower the meter meaningfully without making recovery impossible; a competent run trends upward.
5. **Visual sync:** note center reaches the rendered hit line at the exact model hit time.

If tuning changes are needed, change only the centralized rule/scoring constants and tests derived from them before the registration/achievement task. Do not add calibration, audio, difficulty modes, or dynamic chart generation to solve tuning issues.

## Scope Boundary

Expected production additions during implementation are local to:

- `src/lib/games/rhythm-reactor/`;
- `src/pages/rhythm-reactor/index.astro`;
- stable ID/icon and later active row in `src/lib/games.ts`;
- `src/lib/games/shared/types.ts`;
- `src/lib/achievements.ts`;
- `CLAUDE.md`.

Expected test updates/additions are local game tests plus:

- `src/lib/games.test.ts`;
- `src/lib/organisms.test.ts`;
- `src/lib/achievements.test.ts`;
- `src/pages/game-board-markup.test.ts`;
- `e2e/games/play-coverage.spec.ts`.

BaseGame, GameTimer, ScoreManager, GameInitializer, PixiJSRenderer, shared input helpers, score service, APIs, DB/schema/auth, and the derived all-games-navigation production logic remain unchanged.
