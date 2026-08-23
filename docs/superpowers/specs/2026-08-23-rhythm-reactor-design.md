# Rhythm Reactor — Design Spec

- **Linear issue:** HPA-70 — Minigame: Rhythm Reactor
- **Date:** 2026-08-23
- **Status:** Planning draft, reviewed for implementation

## Overview

Rhythm Reactor is a deterministic 60-second visual rhythm game. Notes descend through four lanes toward a fixed hit line. The player presses the matching lane at the right time using keyboard shortcuts or four native touch buttons. Accurate hits score points, extend combo, and stabilize the reactor; missed notes and stray presses break combo and reduce stability.

Version 1 intentionally does **not** add music or an audio-synchronization subsystem. The beat chart is authored on a fixed 120 BPM visual grid and uses one game-local animation loop. This preserves the ticket's timing gameplay while keeping browser audio latency, asset loading, autoplay restrictions, calibration, and chart/audio synchronization out of scope.

The architecture follows the current Gravity Flip and Signal Switch seams:

- `RhythmReactorGame extends BaseGame` owns deterministic note/judgment/scoring state.
- `RhythmReactorRenderer extends PixiJSRenderer` draws four lanes, the hit line, and falling notes.
- one game-local `requestAnimationFrame` loop advances simulation and renders.
- four native Astro buttons plus `D/F/J/K` call the same `hitLane(laneIndex)` API.
- BaseGame remains the timer, score-persistence, stale-run, achievement, reset, and end-of-run authority.

No generic rhythm/chart/audio/input framework is introduced. “Follow/extend Signal Switch” means reuse its **shape and seams**, not import Signal Switch constants or scoring code; Rhythm Reactor keeps its own game-local rules and scorer.

## Review Resolution — 2026-08-23

The planning review was checked against the current branch and repository. The architecture stays unchanged; five review corrections are incorporated:

1. **Perfect-hit browser proof:** accepted. A ±80ms assertion must not cross a `page.evaluate` → Playwright input gap while live rAF continues. The browser proof now starts/advances the game and dispatches the button click or keyboard event inside one synchronous `page.evaluate` task, using an exact final delta to the first pending note's hit time. No pause/debug API is added.
2. **Chart tuning gate:** accepted. The 0.5-second materializer contract, four-lane/no-chord shape, hit-time derivation, and first-note visibility are structural. Pattern bytes and section repeat counts are **initial authored tuning data** and may change only at the Task 4 playable checkpoint. The currently derived 86-note / 57.5s values are not treated as independent sacred constants.
3. **Chart-content freeze:** accepted. Tests pin the exact three pattern arrays and the expanded lane sequence. Note count and last-hit time are derived from that authored data. If the playable checkpoint changes the data, those exact expectations change in the same commit; Task 5 then treats the post-tuning values as frozen before achievement thresholds are registered.
4. **Visible HUD contract:** accepted. The page uses `GamePage` additional-stat badges for Combo, Hits, Judgment, and Stability with fixed IDs. The `aria-live` node is an accessible duplicate for judgment/completion announcements, not the only judgment presentation.
5. **Shared helper spelling:** normalized. Documentation refers to the exported identifier `isEditableTarget`; implementation calls it normally as `isEditableTarget(event.target)`.

The risk section also explicitly covers timing-window E2E flake and unreadable chart density. No audio, calibration, GameInitializer adoption, core change, or shared rhythm framework is added.

A final consistency pass also locks two details that were internally contradictory in the first draft:

- timing-boundary unit tests must advance simulation in chunks no larger than `maxUpdateDelta`; a single `update(1.92)` cannot bypass the game's 0.1s clamp;
- note Y uses direct linear arithmetic rather than shared `lerp`, because Cetus `lerp` clamps interpolation to `0..1` and would incorrectly pin a late-but-still-Good note on the hit line.

## Why HPA-70 Is Next

The standalone-minigame sequence has landed through HPA-71 Signal Switch. HPA-70 Rhythm Reactor is now In Progress for this planning/implementation PR, has no blockers or related dependencies, and is the next open ticket in that sequence. HPA-68 Asteroid Drift remains after it.

The repository already contains the relevant reusable seams:

- Reflex measures reaction time but uses wall-clock object lifetimes; do not reuse that timing model.
- Pattern Pulse provides recent native four-button + keyboard interaction patterns.
- Gravity Flip and Signal Switch provide the current `BaseGame + PixiJSRenderer + game-local rAF` convention.
- Signal Switch already extracted `isEditableTarget` to shared utils, so Rhythm Reactor reuses it without another cross-game refactor.

## Product Goals

- Deliver a readable one-minute visual rhythm loop with no setup or difficulty selection.
- Make the first note visible immediately when the run starts.
- Use deterministic authored chart data so scoring and timing are fair and testable.
- Reward timing quality and long successful streaks without a second score authority.
- Make misses visibly destabilize the reactor while preserving the fixed 60-second round contract.
- Support touch and keyboard through one lane-hit API.
- Keep all four touch controls reachable on a 375×812 viewport.
- Give sighted players visible Combo, Hits, Judgment, and Stability feedback while keeping judgment announcements accessible.
- Reuse the existing score submission, leaderboard/progress, achievements, GamePage, stale-run guard, and unload-warning behavior.
- Keep tuning values and authored chart data easy to change at one explicit playable checkpoint before achievements/E2E thresholds freeze.

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
- database, API, auth, leaderboard, score-service, BaseGame, GameTimer, ScoreManager, GameInitializer, or PixiJSRenderer changes.

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

## Structural V1 Contracts

These do not change at the manual tuning checkpoint:

| Rule | Value |
|---|---:|
| Run duration | 60 seconds |
| Lanes | 4 |
| Keyboard lanes | `D`, `F`, `J`, `K` |
| Logical canvas | 800 × 420 px |
| Visual beat grid | 120 BPM / 0.5-second steps |
| One step | one lane or rest; never a chord |
| Hit-time formula | `firstHitTime + stepIndex × beatStepSeconds` |
| BaseGame time bonus | disabled |
| Maximum accepted outer update | 0.1 s |
| Stability at 0 | feedback only; run continues |

The first authored note remains Lane 1 and must be visible at run start: `firstHitTimeSeconds === approachSeconds`. Pattern data may change at the tuning checkpoint, but this teaching/opening contract does not.

## Initial Tuning Defaults

These are the implementation starting values and may be adjusted **only** at the Task 4 manual-play checkpoint before Task 5 freezes chart/achievement expectations:

| Tuning value | Initial default |
|---|---:|
| First note hit time | 2.0 s |
| Note approach time | 2.0 s |
| Perfect window | ±0.080 s |
| Good window | ±0.160 s |
| Initial stability | 60 / 100 |
| Perfect stability | +4 |
| Good stability | +2 |
| Miss stability | −6 |
| Every 10th consecutive hit | additional +5 stability |
| Perfect base score | 100 |
| Good base score | 60 |
| Combo multiplier | +0.25× each 10 combo, max 2.0× |

Motion/judgment/stability values live once in `RHYTHM_REACTOR_RULES`. Scoring constants live once in `scoring.ts`. Tests import those sources rather than duplicating tuning values.

## Authored Beat Chart

The chart uses one continuous 0.5-second step grid. A step contains either one lane index or a rest; v1 never emits simultaneous notes.

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
```

Initial section repeats are:

```ts
export const RHYTHM_REACTOR_SECTIONS = [
    { pattern: WARMUP_PATTERN, repeats: 2 },
    { pattern: CORE_PATTERN, repeats: 2 },
    { pattern: SURGE_PATTERN, repeats: 3 },
] as const
```

With the initial data this derives:

- 112 grid steps;
- 86 notes;
- first hit at 2.0s;
- last hit at 57.5s;
- maximum demand of 2 hits/second.

Those **86 / 57.5s values are derived descriptions of the current authored data**, not separate rules. The playable checkpoint may change pattern bytes or repeat counts. Any post-tuning chart must still satisfy:

- exactly four lane indices `0..3` plus rests;
- no simultaneous notes because there is only one value per 0.5s step;
- the first note is Lane 1 and visible at t=0;
- chronological hit times use the single formula;
- the final note exits the Good window before the 60-second timeout.

`createRhythmReactorChart()` is a tiny pure game-local materializer from these data tables. It assigns stable `note-0`, `note-1`, … IDs in chronological order. This is not a chart engine.

### Chart test contract

`chart.test.ts` pins content compactly rather than snapshotting 86 objects:

1. exact `WARMUP_PATTERN`, `CORE_PATTERN`, and `SURGE_PATTERN` arrays;
2. exact section repeat counts;
3. `chart.map(note => note.laneIndex)` equals the lane sequence expanded from those expected pattern/repeat values;
4. note count derives from the expanded non-rest sequence;
5. first/last times derive from the first/last occupied step and the timing formula;
6. chronological IDs/times, lane range, and unique hit times remain structural assertions.

The exact pattern/repeat expectations are allowed to change only during the Task 4 manual tuning commit. Once that checkpoint passes, Task 5 treats them as frozen content and registers achievement thresholds against the final chart.

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

Timing tests that need to advance more than one frame must call `update()` repeatedly with steps `<= maxUpdateDelta` and a final exact remainder; they must not assume a single large delta bypasses the clamp.

## Runtime Note Model

```ts
export interface RhythmReactorNote {
    id: string
    laneIndex: RhythmReactorLane
    hitTimeSeconds: number
}
```

`RhythmReactorState.pendingNotes` contains only unresolved chart notes. Notes do not have mutable `y` coordinates.

The renderer derives position with direct linear arithmetic:

```text
timeUntilHit = note.hitTimeSeconds - state.elapsedSeconds
progress = 1 - timeUntilHit / approachSeconds
y = noteSpawnY + (hitLineY - noteSpawnY) × progress
```

Do **not** call the shared `lerp` helper for this coordinate. Cetus `lerp` clamps `t` into `0..1`; a note that is slightly late but still inside the Good window needs `progress > 1` so it visibly passes the hit line.

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
3. if no same-lane note is within the Good window, register one miss for the stray/early/late press without consuming a pending note;
4. otherwise remove the matched note and classify it:
   - `abs(offset) <= perfectWindowSeconds` → Perfect;
   - `abs(offset) <= goodWindowSeconds` → Good.

Boundary values are inclusive. A note expires automatically once:

```text
elapsedSeconds > hitTimeSeconds + goodWindowSeconds
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

### Visible in-run HUD

Use the same `GamePage` `additional-stats` seam as Signal Switch. These four visible badges and IDs are part of the route contract:

| Badge | Element ID | Idle text |
|---|---|---|
| Combo | `#rhythm-reactor-combo` | `0` |
| Hits | `#rhythm-reactor-hits` | `0` |
| Judgment | `#rhythm-reactor-judgment` | `READY` |
| Stability | `#rhythm-reactor-stability` | `60` initially |

The renderer may also draw a simple reactor/stability indicator, but the visible DOM badge is authoritative for textual presentation/testing.

`lastJudgment` is presentation state only; it does not schedule a timeout. The next state-changing hit/miss replaces it.

`#rhythm-reactor-status` is an `aria-live="polite"` accessible duplicate for the latest judgment and completion summary. It is not the only place a sighted player can see the judgment.

Miss count is still tracked in state and shown in the final overlay; it does not need a fifth in-run badge for v1.

## Stability

Stability is a clamped `0..100` feedback meter, not a second end condition.

Initial defaults:

- initial stability: 60;
- Perfect: +4;
- Good: +2;
- each miss: −6;
- on every 10th consecutive successful hit, add an additional +5;
- clamp after each change.

A miss resets combo to 0. Successful hits increase combo first, so the 10/20/30… combo milestone applies on that exact successful hit.

Reaching 0 stability does **not** end the run in v1. The one-minute timer remains the sole normal completion condition.

## Scoring and Accuracy

`calculateRhythmReactorHitPoints(judgment, comboAfterHit)` is the only production scoring authority. It follows the same separation as Signal Switch's local scorer but does not import it.

Initial base values:

- Perfect = 100;
- Good = 60;
- Miss = 0.

Combo multiplier:

```text
multiplierSteps = min(floor(comboAfterHit / 10), 4)
multiplier = 1.0 + multiplierSteps × 0.25
```

With the initial defaults:

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

## Timeout, Reset, and Replay

`createRhythmReactorConfig()` uses:

- `duration: 60`;
- `achievementIntegration: true`;
- `pausable: false`;
- `resettable: true`.

### Start

`onGameStart()` resets private simulation time and emits the fresh state. The first chart note is already within the full approach horizon.

### Timeout

`handleTimeUp()` first resolves every remaining pending note as a miss, sets `elapsedSeconds` to 60, then delegates to BaseGame's timeout end path. This gives complete final stats even if the browser throttled rAF while hidden.

Timeout settlement is a game-model/unit-test contract. The browser journey does not need to wait 60 seconds or recreate this proof.

### Reset

Reset returns the game to idle with:

- the full final authored chart restored;
- score/hit/miss/combo cleared;
- stability restored to the configured initial value;
- time 60;
- judgment badge `READY`;
- controls disabled until Start;
- overlay hidden.

### Play Again

Play Again follows Signal Switch: calling `game.start()` after game over lets BaseGame auto-reset the completed run and immediately starts the new run. It is not reset-to-idle.

GamePage uses `showPause={false}`, `showEnd={false}`, `showReset={true}`.

## Renderer

`RhythmReactorRenderer` extends `PixiJSRenderer` with a fixed 800×420 logical canvas and two graphics layers:

1. static layer: dark board, four vertical lanes, lane separators, spawn/hit-line markings;
2. dynamic layer: currently visible notes plus a simple stability/reactor indicator.

Only a small approach-window subset of the final authored chart is visible at once. Sprite pooling, textures, particle systems, and custom scene graphs are unnecessary.

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

Global keyboard handling maps case-insensitive `d/f/j/k` to the same lane indices and reuses `isEditableTarget`.

The `#rhythm-reactor-status` live region announces the latest judgment and completion summary without attempting to announce every falling note.

No custom arrow-key focus grid is added; buttons preserve native tab/Enter/Space behavior.

## Initializer and Lifecycle

`initRhythmReactorGameFramework()` follows Signal Switch's local initializer structure:

- locate the route container;
- create config, renderer, and game;
- track listeners for cleanup;
- wire score/time/state/end callbacks;
- synchronize the four visible additional-stat badges;
- wire Start, Reset, Play Again, delegated lane clicks, keyboard shortcuts, and `beforeunload`;
- normalize Pixi canvas CSS sizing with `width: 100%` and `height: auto`;
- run exactly one requestAnimationFrame loop;
- expose a debug/test handle at `window.rhythmReactorGame` from the page;
- cleanup cancels rAF, removes tracked listeners, unsubscribes game end, destroys renderer, then destroys game.

No `GameInitializer` migration is included.

## Registration and Shared Data

Implementation adds `GameID.RHYTHM_REACTOR = 'rhythm_reactor'` and the matching icon with the stable enum before the active catalog row is added. `GAME_ICONS` is exhaustive over `GameID`, so ID/icon land together.

The active `GAMES` entry is added only when `/rhythm-reactor` exists:

- name: Rhythm Reactor;
- category: action;
- estimated duration: 1 minute;
- difficulty: medium;
- tags: rhythm, timing, lanes, single-player, reflex;
- organism: `{ shape: 'chain', color: 'teal' }`;
- depth: `shallow`.

That changes the current depth partition from `7 / 9 / 4` to `8 / 9 / 4`; `organisms.test.ts` is updated explicitly. `ORGANISM_BY_GAME` remains derived from `GAMES`. Appending a `chain/teal` shallow specimen after Signal Switch's `lattice/ice` preserves the existing adjacent-shape+color invariant.

`RhythmReactorGameData` is exported from the game and added to `src/lib/games/shared/types.ts` for achievement typing.

No persistence schema or API payload shape changes are needed; existing generic gameData submission handles the added fields.

## Achievement Set

Initial achievement targets are:

1. **First Beat** — score at least 100 points. Common.
2. **Chain Reaction** — reach max combo 20. Rare.
3. **Precision Control** — finish with at least 60 hits and at least 90% weighted accuracy. Epic.
4. **Coolant Reserve** — finish with at least 60 hits and final stability at least 90. Epic.

These thresholds are intentionally registered **after** the playable chart checkpoint. If chart density is tuned, Task 4 may adjust the hit/combo floors in the same bounded tuning pass so the achievements remain meaningful and attainable; Task 5 then freezes the final exact values. No new achievement condition type is required.

The default `hits >= 60` floors prevent accuracy/stability achievements from being awarded on tiny or debug-ended samples while remaining comfortably below the initial 86-note chart.

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

Before the playable checkpoint, tests pin the **current authored data** but derive aggregate values:

- exact three pattern arrays and section repeat counts;
- exact expanded lane sequence;
- note count derived from non-rest expanded steps;
- first/last hit times derived from occupied step indices and rule constants;
- chronological IDs/times;
- lanes always 0..3;
- no simultaneous hit times;
- Perfect/Good base values and combo tiers from scoring constants;
- weighted accuracy edge cases.

If Task 4 changes chart data, update the exact pattern/sequence expectations in that same tuning commit. No later task changes them casually.

### Game-model tests

Use small explicit chart/config overrides where helpful. Cover:

- initial state and cloned authored chart;
- exact Perfect/Good inclusive boundaries using repeated `update()` steps no larger than the configured clamp;
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
- late-but-pending note moves beyond the hit line, proving direct interpolation is not clamped;
- cleanup destroys local graphics then base renderer resources.

### Initializer/markup tests

Cover:

- four buttons and D/F/J/K mapping;
- delegated touch/click path calls `hitLane()`;
- key repeat/modifier/`isEditableTarget` guards;
- visible `#rhythm-reactor-combo`, `#rhythm-reactor-hits`, `#rhythm-reactor-judgment`, and `#rhythm-reactor-stability` badges;
- `#rhythm-reactor-status` live-region duplication;
- Start/Reset/Play Again state synchronization;
- final overlay copy;
- cleanup cancels rAF and listeners;
- page waits for `DOMContentLoaded` before initialization;
- no Pause or End Game controls;
- canvas has mobile-safe sizing.

### Browser proof

Add one Rhythm Reactor journey to `e2e/games/play-coverage.spec.ts`.

The Perfect-hit helper must keep **model advancement and input dispatch in one synchronous browser task**. It uses public lifecycle/model methods through the existing debug handle; it does not add a pause API:

```text
page.evaluate(inputKind => {
  game.reset()
  game.start()
  target = game.getState().pendingNotes[0].hitTimeSeconds
  while elapsed < target:
    game.update(min(0.1, target - elapsed))
  if click:
    matching [data-rhythm-lane] button.click()
  if keyboard:
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  assert/return state after synchronous handler
})
```

Because JavaScript rAF callbacks cannot interleave inside that synchronous task, the ±80ms Perfect assertion cannot race a live animation frame. The helper derives the target note/lane/key from state rather than hard-coding 2.0s/Lane 1, although the initial chart still satisfies the Lane-1 teaching contract.

Browser journey:

1. page renders canvas, four controls, and four visible HUD badges;
2. Start button activates the normal route;
3. synchronous helper proves the delegated **button** path records a Perfect hit and score;
4. Reset returns to 60 / 0 hits / initial stability / `READY`;
5. synchronous helper proves the **keyboard** path records a Perfect hit;
6. use the debug handle's public `end()` only to expose the existing final overlay without sleeping 60 real seconds;
7. Play Again immediately starts a clean run.

Timeout settlement remains a unit/model proof, not a timing-sensitive E2E requirement.

A second 375×812 proof verifies all four buttons and the Pixi canvas fit without horizontal overflow.

`e2e/games/all-games-navigation.spec.ts` remains derived and receives no production-specific branch; it is run as a post-registration gate.

## Manual-Play Tuning Checkpoint

Run after the route is playable and before registry/achievement/E2E thresholds are frozen.

Check the initial defaults:

1. **Opening readability:** the first Lane 1 note is visible for the full approach and the D/F/J/K mapping is understandable before impact.
2. **Timing feel:** the initial ±80ms Perfect / ±160ms Good windows are strict but usable on both keyboard and touch.
3. **Chart density:** Warmup → Core → Surge progression remains readable on a laptop and 375px viewport; the Surge pattern does not become a visual wall.
4. **Stability feel:** ordinary misses lower the meter meaningfully without making recovery impossible; a competent run trends upward.
5. **Visual sync:** note center reaches the rendered hit line at the exact model hit time and late Good-window notes continue past it.

If tuning changes are needed, the allowed knobs are deliberately bounded:

- `RHYTHM_REACTOR_RULES` timing/stability values;
- scoring constants;
- `WARMUP_PATTERN`, `CORE_PATTERN`, `SURGE_PATTERN` bytes;
- section repeat counts;
- achievement hit/combo floors that depend on final chart density.

Any chart edit must preserve the structural chart invariants above and update the exact pattern + expanded-lane-sequence tests in the same commit. Record the final derived note count and last-hit time after the checkpoint. Do not add calibration, audio, difficulty modes, random generation, or a new timing subsystem to solve tuning issues.

After this checkpoint, chart bytes/repeats and achievement thresholds are frozen for Task 5/6 unless a real bug is found.

## Risks and Mitigations

### Timing-window E2E flake

**Risk:** a Perfect window is only ±80ms; advancing in `page.evaluate`, returning to Playwright, then clicking allows live rAF to move simulation time and makes the proof flaky.

**Mitigation:** advance to the target and dispatch the click/keyboard event in the same synchronous `page.evaluate` task with an exact final delta. Do not loosen timing windows to make E2E pass.

### Unreadably dense authored surge

**Risk:** even a valid 0.5-second chart can feel visually noisy; chart density is the primary visual-only difficulty knob.

**Mitigation:** pattern bytes and repeat counts remain tuning data until the mandatory playable checkpoint. Exact pattern/expanded-lane tests exist from Task 1 but remain intentionally editable only during that checkpoint; after it passes, those values are frozen.

### Dual wall/simulation clocks

**Risk:** a backgrounded tab may let BaseGame wall time finish while rAF-clamped simulation is behind.

**Mitigation:** BaseGame remains run authority; Rhythm Reactor's one justified game-local timeout difference is settling every unresolved chart note as a miss before BaseGame captures final stats.

### Renderer interpolation trap

**Risk:** reusing shared `lerp` looks natural but clamps interpolation and would hide late-note travel past the hit line.

**Mitigation:** use the explicit linear coordinate formula locally and lock the late-pending-note renderer test. No new shared math helper is justified.

### Audio scope creep

**Risk:** “rhythm” can invite an audio-clock/calibration subsystem during tuning.

**Mitigation:** v1 remains visual-only. Poor feel is solved by bounded chart/rule tuning, not Web Audio or latency calibration.

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

BaseGame, GameTimer, ScoreManager, GameInitializer, PixiJSRenderer, shared input helpers, score service, APIs, DB/schema/auth, packages, and the derived all-games-navigation production logic remain unchanged.
