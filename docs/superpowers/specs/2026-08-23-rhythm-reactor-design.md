# Rhythm Reactor — Design Spec

- **Linear issue:** HPA-70 — Minigame: Rhythm Reactor
- **Date:** 2026-08-23
- **Status:** Planning draft, reviewed for implementation

## Overview

Rhythm Reactor is a deterministic 60-second visual rhythm game. Notes descend through four lanes toward a fixed hit line. The player presses the matching lane using four native touch buttons or `D/F/J/K`. Accurate hits score points, build combo, and stabilize the reactor. Missed notes and unrelated presses break combo and reduce stability.

Version 1 intentionally does **not** add music or an audio-synchronization subsystem. The chart is authored on a fixed 120 BPM visual grid and runs from one game-local animation loop. Browser autoplay, decode/start latency, calibration, audio-clock ownership, and chart/audio coupling remain out of scope.

The architecture follows existing Cetus seams without coupling Rhythm Reactor to another game:

- `RhythmReactorGame extends BaseGame` owns chart state, judgments, combo, stability, and scoring calls.
- `RhythmReactorRenderer extends PixiJSRenderer` draws four lanes, a hit line, notes, and a simple reactor indicator.
- one game-local `requestAnimationFrame` loop advances simulation and renders.
- four native Astro buttons plus `D/F/J/K` call the same `hitLane(laneIndex)` API.
- BaseGame remains the wall-clock timer, score-persistence, stale-run, reset, and end-of-run authority.

No generic rhythm/chart/audio/input framework is introduced. “Follow Signal Switch” means copy its architectural seam, not import its game-specific rules or scorer.

## Review Resolution — 2026-08-23

Two planning reviews were checked against current `main` and PR #74. The architecture stays the same; the following corrections are now part of the implementation contract.

1. **Perfect-hit browser timing:** model advancement and delegated button/keyboard dispatch happen in one synchronous browser task. HUD text used to prove that hit is read before returning to Playwright, so live rAF cannot invalidate Combo/Judgment/Stability assertions afterward.
2. **Chart tuning:** the 0.5-second four-lane/no-chord materializer is structural. Pattern bytes and repeat counts are authored tuning data until the Task 4 playable checkpoint. The current 86-note / 57.5-second values are derived defaults, not independent invariants.
3. **Chart tests:** exact pattern arrays, repeat counts, and expanded lane sequence pin authored content. Separate data-independent tests protect the invariants that must survive tuning: Lane-1 opening, first-note visibility, strictly increasing beat-grid times, and final judgment completion before timeout.
4. **Visible HUD:** `GamePage` additional-stat badges are fixed as Combo, Hits, Judgment, and Stability. `#rhythm-reactor-status` is the accessible duplicate, not the only judgment output.
5. **Shared helper:** implementation reuses the existing exported `isEditableTarget` identifier.
6. **Large update examples:** timing tests advance with repeated steps `<= maxUpdateDelta`; no example assumes one `update(1.92)` bypasses the game's clamp.
7. **Late-note rendering:** note Y uses direct linear arithmetic rather than shared `lerp`, because Cetus `lerp` clamps interpolation to `0..1` and would pin a still-judgeable late note at the hit line.
8. **One note, one note-miss:** the game has an explicit wider Miss window. A press within that window consumes the note exactly once as Perfect, Good, or Miss. Only presses with no same-lane note in the Miss window become `strayPresses`.
9. **Chart in config:** the authored chart lives on `RhythmReactorConfig`, following Potion Sorter's config-owned authored content precedent. This removes the planned third constructor argument, subclass fallback, and post-`super()` state reassignment.
10. **Shared markup gate:** Task 4 appends `rhythm-reactor` to the existing `game-board-markup.test.ts` `games` array as well as adding Rhythm-specific selectors.
11. **Precision achievement:** the redundant 60-hit floor is removed. Production runs have no manual End action and timeout settles every unresolved chart note, so `accuracy >= 90` is already a full-chart requirement. Stray presses are also included in the accuracy denominator.

No audio, calibration, GameInitializer adoption, core change, package change, or shared rhythm framework is added.

## Why HPA-70 Is Next

The standalone-minigame sequence has landed through HPA-71 Signal Switch. HPA-70 Rhythm Reactor is In Progress on PR #74, has no blockers, and is the next open standalone game. HPA-68 Asteroid Drift remains later.

Relevant existing seams:

- Reflex measures wall-clock reaction times but does not provide a reusable rhythm timing model.
- Pattern Pulse provides native four-button + keyboard interaction patterns.
- Gravity Flip and Signal Switch provide `BaseGame + PixiJSRenderer + game-local rAF` precedents.
- Potion Sorter demonstrates authored content stored on game config and read by `createInitialState()`.
- Signal Switch already extracted `isEditableTarget` to shared utils.

## Product Goals

- Deliver an immediately readable one-minute visual rhythm loop.
- Keep the first note visible from run start and teach Lane 1 / `D` first.
- Use deterministic authored data so runs are fair and tests are exact.
- Reward timing quality and sustained combo without a second score authority.
- Make errors visibly destabilize the reactor while preserving the fixed 60-second run.
- Prevent early/late human errors from counting twice against one chart note.
- Keep stray key mashing distinguishable from actual chart misses.
- Support keyboard and touch through one lane-hit API.
- Keep all four touch controls reachable on a 375×812 viewport.
- Show Combo, Hits, Judgment, and Stability visibly while duplicating judgment accessibly.
- Reuse existing score submission, leaderboard/progress, achievements, GamePage, stale-run guard, and unload-warning behavior.
- Keep authored density and tuning values adjustable at one explicit playable checkpoint before registration thresholds freeze.

## Non-Goals

Version 1 does not include:

- songs, BGM, sound effects, Web Audio, autoplay handling, or latency calibration;
- BPM/difficulty/song selection;
- chart files, loaders, DSLs, editors, or user-created charts;
- random/procedural beat generation;
- simultaneous/chord notes, holds, slides, flicks, mines, or special note types;
- persisted offsets or calibration;
- early reactor meltdown as a second end condition;
- pause or manual End Game actions;
- canvas hit-testing for touch;
- generic rhythm/chart/spawn/input/animation frameworks;
- database, API, auth, leaderboard, score-service, BaseGame, GameTimer, ScoreManager, GameInitializer, or PixiJSRenderer changes.

## Approaches Considered

### A. Deterministic visual chart — chosen

Use a small authored data table, simulation-time judgment, Pixi notes, and native buttons.

**Why:** smallest implementation, deterministic tests, no asset pipeline, and directly satisfies the falling-beat interaction.

### B. Audio-backed chart — rejected for v1

An audio clock would introduce autoplay policy, decode/start latency, background behavior, calibration, and chart/audio asset coupling. Those are separate subsystems and are unnecessary for the first playable loop.

### C. Random note stream — rejected

Random timing behaves more like reflex whack-a-mole, makes scores run-dependent, and makes balance/E2E harder without adding meaningful v1 value.

## Structural V1 Contracts

These do not change at the manual tuning checkpoint:

| Rule | Value |
|---|---:|
| Run duration | 60 seconds |
| Lanes | 4 |
| Keyboard lanes | `D`, `F`, `J`, `K` |
| Logical canvas | 800 × 420 px |
| Visual beat grid | 120 BPM / 0.5-second steps |
| One chart step | one lane or rest; never a chord |
| Hit-time formula | `firstHitTime + stepIndex × beatStepSeconds` |
| First authored note | Lane 1 |
| BaseGame time bonus | disabled |
| Maximum accepted outer update | 0.1 s |
| Stability at 0 | feedback only; run continues |

The first authored note must be visible at run start: `firstHitTimeSeconds === approachSeconds`.

## Initial Tuning Defaults

These values may be adjusted only at the Task 4 playable checkpoint before Task 5 freezes public thresholds/content:

| Tuning value | Initial default |
|---|---:|
| First note hit time | 2.0 s |
| Note approach time | 2.0 s |
| Perfect window | ±0.080 s |
| Good window | ±0.160 s |
| Miss window | ±0.400 s |
| Initial stability | 60 / 100 |
| Perfect stability | +4 |
| Good stability | +2 |
| Note miss stability | −6 |
| Stray press stability | −6 |
| Every 10th consecutive hit | additional +5 stability |
| Perfect base score | 100 |
| Good base score | 60 |
| Combo multiplier | +0.25× each 10 combo, max 2.0× |

`RHYTHM_REACTOR_RULES` owns motion/judgment/stability values. `scoring.ts` owns scoring constants. Tests import these sources instead of copying tunable values.

## Authored Beat Chart

The chart uses one continuous 0.5-second grid. A step is a lane index or rest.

```ts
export type RhythmReactorLane = 0 | 1 | 2 | 3

type ChartStep = RhythmReactorLane | null

export const WARMUP_PATTERN: readonly ChartStep[] = [
    0, null, 1, null, 2, null, 3, null,
    0, 1, null, 2, null, 3, 1, 2,
]

export const CORE_PATTERN: readonly ChartStep[] = [
    0, 1, null, 2, 3, null, 1, 2,
    0, null, 3, 2, 1, null, 0, 3,
]

export const SURGE_PATTERN: readonly ChartStep[] = [
    0, 1, 2, null, 3, 2, 1, 0,
    1, 3, null, 2, 0, 3, 1, 2,
]

export const RHYTHM_REACTOR_SECTIONS = [
    { pattern: WARMUP_PATTERN, repeats: 2 },
    { pattern: CORE_PATTERN, repeats: 2 },
    { pattern: SURGE_PATTERN, repeats: 3 },
] as const
```

The initial authored data derives:

- 112 grid steps;
- 86 notes;
- first hit at 2.0s;
- last hit at 57.5s;
- maximum authored demand of 2 hits/second.

The playable checkpoint may change pattern bytes or repeat counts. Any final chart must still satisfy:

- only lanes `0..3` and rests;
- no simultaneous notes;
- first note is Lane 1;
- `firstHitTimeSeconds === approachSeconds`;
- hit times are strictly increasing;
- every hit-time gap is a positive whole number of beat steps;
- the final note plus `missWindowSeconds` is strictly before the 60-second timeout.

`createRhythmReactorChart()` remains a tiny pure materializer. It assigns `note-0`, `note-1`, … in chronological order.

### Chart Test Contract

Tests intentionally separate authored-content locks from permanent structural invariants.

**Editable only during Task 4 tuning:**

- exact three pattern arrays;
- exact section repeat counts;
- exact expanded lane sequence.

**Never hand-edited to match tuning output:**

```ts
expect(chart[0].laneIndex).toBe(0)
expect(RHYTHM_REACTOR_RULES.firstHitTimeSeconds).toBe(
    RHYTHM_REACTOR_RULES.approachSeconds
)
expect(
    chart.at(-1)!.hitTimeSeconds + RHYTHM_REACTOR_RULES.missWindowSeconds
).toBeLessThan(RHYTHM_REACTOR_RULES.duration)

for (let index = 1; index < chart.length; index += 1) {
    const gap = chart[index].hitTimeSeconds - chart[index - 1].hitTimeSeconds
    expect(gap).toBeGreaterThan(0)
    expect(gap / RHYTHM_REACTOR_RULES.beatStepSeconds).toBeCloseTo(
        Math.round(gap / RHYTHM_REACTOR_RULES.beatStepSeconds),
        10
    )
}
```

Also assert lane range, unique IDs, and exact expanded lane order. Aggregate note count derives from expected non-rest steps rather than an independent `86` literal.

## Config and Dependency Shape

`RhythmReactorConfig` owns the materialized chart, like Potion Sorter config owns its authored preset:

```ts
export interface RhythmReactorConfig extends BaseGameConfig {
    canvasWidth: number
    canvasHeight: number
    laneCount: number
    beatStepSeconds: number
    firstHitTimeSeconds: number
    approachSeconds: number
    perfectWindowSeconds: number
    goodWindowSeconds: number
    missWindowSeconds: number
    maxUpdateDelta: number
    noteSpawnY: number
    hitLineY: number
    initialStability: number
    perfectStabilityGain: number
    goodStabilityGain: number
    missStabilityLoss: number
    strayStabilityLoss: number
    comboStabilityInterval: number
    comboStabilityBonus: number
    chart: readonly RhythmReactorNote[]
}
```

To avoid a `types.ts ↔ chart.ts` import cycle, `createRhythmReactorConfig()` lives beside the game in `RhythmReactorGame.ts`, matching Potion Sorter's existing placement:

```ts
export function createRhythmReactorConfig(
    overrides: Partial<RhythmReactorConfig> = {}
): RhythmReactorConfig {
    return {
        ...RHYTHM_REACTOR_RULES,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        chart: createRhythmReactorChart(),
        ...overrides,
    }
}
```

Tests inject tiny charts with:

```ts
createRhythmReactorConfig({ chart: oneNote })
```

The game constructor has only config + callbacks. There is no third chart parameter, no subclass-field fallback during `super()`, and no second state construction after `super()`.

## Time Ownership

### BaseGame owns run duration

BaseGame/GameTimer remains the authoritative 60-second wall-clock timer and the only normal completion source.

### Game-local simulation time owns chart position

`RhythmReactorGame` keeps:

```ts
private elapsedSimSeconds = 0
```

The initializer supplies monotonic rAF deltas. `update(deltaSeconds)` ignores invalid/non-positive values and clamps each accepted outer delta to `maxUpdateDelta`.

If a backgrounded tab lets BaseGame finish while rAF simulation is behind, `handleTimeUp()` resolves every remaining chart note as a note miss before delegating to BaseGame. Final chart statistics are therefore complete.

Timing tests advance large durations with repeated bounded steps and a final exact remainder.

## Runtime Note Model

```ts
export interface RhythmReactorNote {
    id: string
    laneIndex: RhythmReactorLane
    hitTimeSeconds: number
}
```

`state.pendingNotes` contains only unresolved chart notes. Notes do not store mutable Y.

Renderer position is derived directly:

```text
timeUntilHit = note.hitTimeSeconds - elapsedSeconds
progress = 1 - timeUntilHit / approachSeconds
y = noteSpawnY + (hitLineY - noteSpawnY) × progress
```

Do not use shared `lerp` for note Y because it clamps `progress`. A still-pending note inside the late Miss window must travel below the hit line.

A note is drawn only when it is inside the approach horizon and remains pending.

## Judgment Semantics

Public input API:

```ts
hitLane(laneIndex: number): RhythmReactorHitResult
```

Inactive/paused/ended/invalid-lane input returns the rejected result without mutation.

For a valid active press:

1. expire notes where `elapsedSeconds > hitTimeSeconds + missWindowSeconds`;
2. find the pending same-lane note with smallest absolute timing offset **within** `missWindowSeconds`;
3. if no such note exists, register one stray press without consuming a chart note;
4. otherwise remove that note and classify by absolute offset:
   - `<= perfectWindowSeconds` → Perfect;
   - `<= goodWindowSeconds` → Good;
   - `<= missWindowSeconds` → Miss.

Perfect/Good increase combo and score. Miss consumes exactly one chart note, increments `misses` exactly once, resets combo, and reduces stability once.

A stray press:

- increments `strayPresses`;
- consumes no chart note;
- resets combo;
- reduces stability by `strayStabilityLoss`;
- sets `lastJudgment = 'miss'`;
- earns no points.

This gives common early/late errors one judgment rather than a stray miss followed by a second expiry miss. It also keeps four-key mashing costly without allowing `misses` to exceed chart-note count.

Automatic note expiry occurs only after the wider Miss window:

```text
elapsedSeconds > hitTimeSeconds + missWindowSeconds
```

The initializer ignores key repeat, Ctrl/Meta/Alt, and editable targets. Lane keys (`D`/`F`/`J`/`K`) are handled even when a native lane button has focus, so keyboard play stays reachable after a button press. Only `Enter`/`Space` on a focused lane button are suppressed, since the browser synthesizes a click for those and would otherwise double-fire lane hits through the delegated click handler.

## State and Feedback

```ts
export type RhythmReactorJudgment = 'perfect' | 'good' | 'miss'

export interface RhythmReactorState extends BaseGameState {
    elapsedSeconds: number
    pendingNotes: RhythmReactorNote[]
    perfectHits: number
    goodHits: number
    misses: number
    strayPresses: number
    combo: number
    maxCombo: number
    stability: number
    lastJudgment: RhythmReactorJudgment | null
}
```

`hits = perfectHits + goodHits`.

### Visible In-Run HUD

Use `GamePage` `additional-stats` for exactly four visible badges:

| Badge | Element ID | Idle text |
|---|---|---|
| Combo | `#rhythm-reactor-combo` | `0` |
| Hits | `#rhythm-reactor-hits` | `0` |
| Judgment | `#rhythm-reactor-judgment` | `READY` |
| Stability | `#rhythm-reactor-stability` | configured initial value |

`#rhythm-reactor-status` is `sr-only` + `aria-live="polite"` and duplicates judgment/completion announcements accessibly.

Misses and stray presses are tracked but reserved for the final summary to keep the in-run HUD compact.

## Stability

Stability is clamped `0..100` and never ends the run.

Initial defaults:

- Perfect: +4;
- Good: +2;
- note Miss: −6;
- stray press: −6;
- every 10th consecutive successful hit: additional +5.

Both note Miss and stray press reset combo. A successful hit increments combo first, so the 10/20/30… stability milestone applies on that hit.

## Scoring and Accuracy

`calculateRhythmReactorHitPoints()` is the only production score formula.

Initial base values:

- Perfect = 100;
- Good = 60;
- Miss = 0.

Combo multiplier:

```text
multiplierSteps = min(floor(comboAfterHit / 10), 4)
multiplier = 1.0 + multiplierSteps × 0.25
```

Initial tiers are 1.0×, 1.25×, 1.5×, 1.75×, and 2.0×. Misses and strays never subtract earned score. BaseGame time bonus is disabled.

Weighted accuracy includes both chart misses and unrelated extra presses:

```text
judgments = perfectHits + goodHits + misses + strayPresses
accuracy = judgments === 0
  ? 0
  : (perfectHits + goodHits × 0.5) / judgments × 100
```

This keeps `misses` semantically equal to missed chart notes while making mashing reduce accuracy.

Final presentation rounds accuracy to one decimal place; submitted game data keeps the raw finite percentage.

## Timeout, Reset, and Replay

`createRhythmReactorConfig()` uses `duration: 60`, achievement integration, `pausable: false`, and `resettable: true`.

### Start

`onGameStart()` resets simulation time and emits fresh state. The first note is visible for the full approach horizon.

### Timeout

`handleTimeUp()` converts every remaining `pendingNotes` entry into a note miss, clears the pending list, sets elapsed simulation to duration, emits state, then delegates to BaseGame. Stray presses are not synthesized at timeout.

Timeout settlement is a unit/model contract; browser E2E does not wait 60 real seconds.

### Reset

Reset restores the config-owned chart, score/counters, stability, 60-second timer, `READY` judgment, disabled lane controls, and hidden overlay.

### Play Again

Play Again calls `game.start()` after game over. BaseGame auto-resets the completed run and immediately starts the next one.

GamePage uses `showPause={false}`, `showEnd={false}`, `showReset={true}`.

## Renderer

`RhythmReactorRenderer` uses fixed 800×420 logical dimensions and two graphics layers:

1. static: board, four lanes/separators, spawn guide, hit line;
2. dynamic: currently visible notes plus a simple stability/reactor indicator.

No sprites, textures, pooling, particle system, or scene graph abstraction is needed.

Lane position and `D/F/J/K` labels are sufficient without color perception. Any color is decorative.

Pixi auto-density inline canvas sizing is normalized to `width: 100%` / `height: auto`, matching recent Pixi games.

## Controls and Accessibility

The route renders four native buttons inside `#rhythm-reactor-controls`:

- Lane 1 — `D`;
- Lane 2 — `F`;
- Lane 3 — `J`;
- Lane 4 — `K`.

Buttons use `data-rhythm-lane="0..3"`, stay disabled while idle/ended, and share one delegated click listener. Touch does not use canvas hit-testing.

Global keyboard handling lowercases the key and reuses `isEditableTarget`. No custom arrow-key focus behavior is added.

## Initializer and Lifecycle

`initRhythmReactorGameFramework()` follows Signal Switch's local initializer structure:

- locate route container;
- create config, renderer, and game;
- track DOM listeners;
- wire score/time/state/end callbacks;
- synchronize four visible HUD badges;
- wire Start, Reset, Play Again, delegated lane clicks, keyboard, and `beforeunload`;
- normalize Pixi canvas sizing;
- run exactly one rAF loop;
- expose `window.rhythmReactorGame` for the existing debug/E2E pattern;
- cleanup cancels rAF, removes listeners, unsubscribes game-end, destroys renderer, then destroys game.

No `GameInitializer` migration is included.

## Registration and Shared Data

Task 2 adds `GameID.RHYTHM_REACTOR = 'rhythm_reactor'` and its exhaustive icon entry together. The active `GAMES` row waits until the route exists in Task 5.

Final catalog entry:

- name: Rhythm Reactor;
- category: action;
- estimated duration: 1 minute;
- difficulty: medium;
- tags: rhythm, timing, lanes, single-player, reflex;
- organism: `{ shape: 'chain', color: 'teal' }`;
- depth: `shallow`.

This changes the depth partition from `7 / 9 / 4` to `8 / 9 / 4` and preserves the existing adjacent shape+color invariant after Signal Switch's `lattice/ice` entry.

`RhythmReactorGameData` is canonical in game `types.ts` and is aliased into `src/lib/games/shared/types.ts`.

No persistence schema/API change is needed.

## Achievement Set

Initial targets, registered only after the Task 4 tuning checkpoint:

1. **First Beat** — score at least 100. Common.
2. **Chain Reaction** — max combo at least 20. Rare.
3. **Precision Control** — weighted accuracy at least 90%. Epic.
4. **Coolant Reserve** — at least 60 hits and final stability at least 90. Epic.

Precision Control intentionally has no hit floor. There is no normal manual-End path, and timeout settles the complete chart before submission, so a 90% production score already requires roughly 90% of the final chart's weighted judgments. `strayPresses` further lower that percentage.

Chain/hit floors that depend on final chart density remain tunable only during Task 4 and are frozen before Task 5 registration.

## Final Stats and Submitted Game Data

```ts
export interface RhythmReactorStats extends BaseGameStats {
    hits: number
    perfectHits: number
    goodHits: number
    misses: number
    strayPresses: number
    maxCombo: number
    accuracy: number
    finalStability: number
}

export interface RhythmReactorGameData {
    hits: number
    perfectHits: number
    goodHits: number
    misses: number
    strayPresses: number
    maxCombo: number
    accuracy: number
    finalStability: number
}
```

Final overlay displays:

- Score;
- Hits;
- Misses (chart-note misses only);
- Stray presses;
- Perfect;
- Good;
- Max combo;
- Accuracy;
- Stability.

## Testing Strategy

### Chart / Scoring

Cover:

- exact current pattern arrays, repeats, and expanded lanes;
- lane range and unique IDs;
- first note Lane 1;
- first-hit equals approach duration;
- strictly increasing hit times whose gaps are whole beat-step multiples;
- final note + Miss window < run duration;
- score tiers;
- accuracy with chart misses and stray presses.

### Game Model

Use `createRhythmReactorConfig({ chart: tinyChart })` for timing-focused tests. Cover:

- config-owned chart cloning;
- Perfect/Good/Miss inclusive boundaries;
- early/late Miss-window press consumes the note once;
- no same-lane note in Miss window creates one `strayPresses` entry and consumes no note;
- automatic expiry after the Miss window;
- `misses <= chart.length` invariant;
- misses/strays reset combo and reduce stability once;
- successful combo/stability milestones;
- stability clamp and non-terminal zero;
- invalid/inactive input guards;
- reset restoration;
- timeout settles remaining notes;
- stats/gameData/accuracy include `strayPresses` consistently.

### Renderer

Cover fixed dimensions, two layers, approach-window filtering, hit-line position, late pending note moving past the hit line, and cleanup.

### Initializer / Markup

Cover four buttons, DFJK mapping, editable/modifier/repeat guards, visible badge IDs, live region, lifecycle controls, final-stat IDs, cleanup, DOMContentLoaded bootstrap, and mobile-safe canvas sizing.

Also append `'rhythm-reactor'` to the existing `games` array in `src/pages/game-board-markup.test.ts` so the shared `GamePage` / `slot="game-board"` / no-`AppLayout` invariant covers the new route.

### Browser Proof

The Perfect helper keeps model advancement, delegated event dispatch, and timing-sensitive HUD reads in one synchronous `page.evaluate` task:

```text
reset/start
→ find first pending note
→ bounded update loop with MAX_UPDATES
→ exact final delta to note time
→ button.click() OR document.dispatchEvent(keydown)
→ read game state + Combo/Hits/Judgment/Stability/Score textContent
→ return snapshot
```

The helper must throw descriptively if `MAX_UPDATES` is exhausted.

Playwright asserts the returned synchronous snapshot for timing-sensitive values. Locator assertions remain for non-racy idle, post-Reset, overlay, and post-Play-Again states.

A second 375×812 proof verifies controls, four badges, canvas reachability, and no horizontal overflow.

## Manual-Play Tuning Checkpoint

Run after Task 4 makes the route playable and before Task 5 registration.

Check:

1. first Lane-1 note / DFJK readability;
2. Perfect/Good/Miss-window feel on keyboard and touch;
3. Warmup → Core → Surge density, especially 375px;
4. note Miss and stray-press stability penalties;
5. visual note center crossing the hit line at model hit time.

Allowed tuning knobs at this checkpoint only:

- timing/stability values in `RHYTHM_REACTOR_RULES` including Miss window;
- scoring constants;
- pattern bytes;
- section repeat counts;
- chart-density-dependent achievement floors.

Any chart edit updates exact pattern/repeat/expanded-lane expectations in the same commit. The permanent structural invariant tests do not change merely to accommodate tuning output.

After the checkpoint, record final derived note count/last-hit time and freeze chart + achievement values for Task 5/6.

## Risks and Mitigations

### Double-counted human error

**Risk:** treating an early press as a stray while leaving the note pending produces a second miss when the note expires.

**Mitigation:** one explicit Miss window. A near early/late press consumes the note as a single Miss; only input with no note in that window is a stray press.

### Timing-window E2E flake

**Risk:** live rAF can move simulation after a synchronous Perfect hit and before multiple locator assertions.

**Mitigation:** return timing-sensitive model + HUD text from the same synchronous browser task as the input. Do not loosen timing windows.

### Unreadably dense Surge

**Risk:** visual-only difficulty is dominated by chart density.

**Mitigation:** keep pattern bytes/repeats tunable through the mandatory playable checkpoint, then freeze them.

### Dual wall/simulation clocks

**Risk:** background throttling can let BaseGame wall time finish while simulation is behind.

**Mitigation:** BaseGame stays run authority; timeout resolves all remaining notes before final stats.

### Audio scope creep

**Risk:** rhythm tuning can invite an audio/calibration subsystem.

**Mitigation:** v1 remains visual-only; solve feel problems with bounded data/rule tuning.

## Scope Boundary

Expected production additions:

- `src/lib/games/rhythm-reactor/`;
- `src/pages/rhythm-reactor/index.astro`;
- stable ID/icon and later active row in `src/lib/games.ts`;
- shared game-data alias;
- achievements;
- `CLAUDE.md`.

Expected shared test updates:

- `src/lib/games.test.ts`;
- `src/lib/organisms.test.ts`;
- `src/lib/achievements.test.ts`;
- `src/pages/game-board-markup.test.ts`;
- `e2e/games/play-coverage.spec.ts`.

BaseGame, GameTimer, ScoreManager, GameInitializer, PixiJSRenderer, shared input helpers, score service, APIs, DB/schema/auth, packages, and navigation production logic remain unchanged.
