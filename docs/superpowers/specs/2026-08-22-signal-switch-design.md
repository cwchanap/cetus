# Signal Switch — Design Spec

- **Linear issue:** HPA-71 — Minigame: Signal Switch
- **Date:** 2026-08-22
- **Status:** Planning draft, reviewed for implementation

## Overview

Signal Switch is a 90-second real-time lane-management game. Drones travel left-to-right toward one switchable laser gate per lane. Each drone carries one of three signal identities; before the drone center reaches the gate, the player cycles that lane until the gate signal matches the drone.

The run starts with two lanes, unlocks a third lane at 30 seconds and a fourth at 60 seconds of **simulated gameplay time**, raises drone speed from 140 to 240 px/s, and shortens the requested spawn interval from 3.2 to 1.1 seconds. A safe pass scores and extends combo. A mismatch removes one of three integrity points and resets combo. Losing all integrity ends the run; BaseGame timeout completes it.

The architecture stays local and deliberately small: `SignalSwitchGame` extends `BaseGame`, `SignalSwitchRenderer` extends `PixiJSRenderer`, and one game-local initializer owns a single requestAnimationFrame loop plus DOM controls. No shared lane/traffic/spawn/runner framework is introduced.

## Review Resolution — 2026-08-22

The second design review was checked against current `main` and the planning branch. Findings F1–F7 and F9 were accepted; F8 was accepted in intent with a less brittle assertion than the review's bare substring suggestion.

1. **Opening saturation:** initial requested spawn interval changes from 2.2s to **3.2s**. A rule-derived phase-boundary test now protects lane-capacity headroom.
2. **Tuning coupling:** balance/display tests derive values from `SIGNAL_SWITCH_RULES`; the manual-play checkpoint moves immediately after the first playable route and before registry/achievement/E2E freezes.
3. **Signal metadata:** label, glyph, shape name, and color collapse into one `SIGNAL_SWITCH_SIGNALS` keyed catalog. Pixi keeps only its geometry switch.
4. **Lane topology:** `laneUnlockSeconds: [0, 0, 30, 60]` replaces `maxLanes`, `startingLaneCount`, `lane3UnlockSeconds`, and `lane4UnlockSeconds`.
5. **State emission:** the plan now explicitly defines Signal Switch's local private `emitStateChange()`; a BaseGame-wide migration stays out of scope.
6. **Organism:** use `lattice/ice` and append the row normally; no array-position coupling is needed.
7. **Background timeout:** `survivedFullRun` requires `outcome === 'survived' && safePasses > 0`, preventing a zero-activity Clean Shift award.
8. **Markup bootstrap test:** use token ordering (`DOMContentLoaded` exists and the initializer call follows it) instead of formatting-sensitive exact source text.
9. **Editable-target guard:** extract the already-identical predicate to `shared/utils.ts` and update Gravity Flip + Pattern Pulse when Signal Switch becomes the third consumer. Other initializer helpers remain local.

The core architecture remains unchanged: BaseGame + local simulation time + one game-local rAF + two-layer Pixi renderer, one implementation PR, and no shared traffic/lane/spawn framework.

## Why HPA-71 Is Next

Recent standalone-minigame work moved down the backlog sequence: HPA-75 Mine Grid, HPA-74 Pattern Pulse, HPA-73 Gravity Flip, then HPA-72 Potion Sorter. HPA-71 remains open and unblocked, so it is the next standalone minigame slice. HPA-70 Rhythm Reactor and HPA-68 Asteroid Drift remain later backlog items.

## Product Goals

- Make the loop immediately legible: **read drone → cycle that lane → preserve combo**.
- Teach one interaction deterministically: Lane 1 starts Cyan and the first drone is Magenta.
- Increase pressure through lanes, speed, and cadence rather than difficulty modes.
- Keep traffic fair by construction: at most one unresolved drone per lane.
- Ensure every random spawn needs action: its signal differs from that lane's gate when spawned.
- Preserve actual cadence headroom during the two-lane opening instead of saturating lane capacity immediately.
- Support keyboard and touch through one `cycleGate(laneIndex)` API.
- Never rely on color alone; every signal also has stable glyph, shape name, and geometry.
- Reuse existing score submission, leaderboard/progress, achievements, GamePage, unload warning, and stale-run lifecycle behavior.
- Keep tuning cheap: balance values live in one rule source and tests derive expected tuning values from it.

## Non-Goals

Version 1 does not include:

- campaign levels, difficulty selection, Daily mode, seeds, replay, or refresh resume;
- a generic lane, traffic, runner, input, animation-loop, or spawn framework;
- GameInitializer adoption;
- multiple unresolved drones in one lane;
- special drones, shields, power-ups, bosses, upgrades, or economy;
- score penalties in addition to integrity loss;
- pause or manual End Game controls;
- canvas hit-testing for touch controls;
- audio, haptics, particles, textures, or image assets;
- database, API, auth, score-service, leaderboard, BaseGame, GameTimer, or PixiJSRenderer changes.

## Architecture and Reuse

### BaseGame remains the run authority

`SignalSwitchGame` extends `BaseGame`. BaseGame continues to own:

- the authoritative 90-second GameTimer;
- completed-run reset on the next `start()`;
- score accumulation and final submission;
- final timer snapshots;
- stale async-save suppression;
- achievement/challenge result delivery.

Signal Switch uses `timeBonus: false`. There is no second countdown or stale-run token.

### PixiJSRenderer owns only the moving board

`SignalSwitchRenderer` uses a fixed 800×360 logical canvas with:

- one static background/lane layer;
- one dynamic scene layer cleared/redrawn each frame.

There are at most four drones and four gates, so sprites, pooling, textures, and a generic entity renderer are unnecessary.

### Game-local requestAnimationFrame loop

The initializer follows Gravity Flip:

```text
requestAnimationFrame
→ compute monotonic rAF delta
→ clamp outer delta to 0.1s
→ game.update(deltaSeconds)
→ renderer.render(game.getState())
→ request next frame
```

Signal Switch does not need Gravity Flip's 1/120-second physics substeps. Crossing is detected from previous center X to next center X, so a drone cannot tunnel past the gate regardless of the accepted step size.

### Existing shared helpers

Reuse `clamp` and `lerp` from `src/lib/games/shared/utils.ts`.

`isEditableTarget()` is already duplicated verbatim in Gravity Flip and Pattern Pulse. HPA-71 would create the third production copy, so implementation will extract this six-line pure predicate to `shared/utils.ts`, cover it in `shared/utils.test.ts`, and update those two existing initializers to import it. This is the only planned cross-game production refactor; it does not change behavior.

Do **not** hoist `emitStateChange()` to BaseGame in HPA-71. Existing BaseGame subclasses redeclare private copies, so a base-class migration would touch many games. Signal Switch keeps one local private method and the plan defines it explicitly.

## Structural Rules and Tuning Defaults

Structural v1 contracts:

| Rule | Value |
|---|---:|
| Run duration | 90 seconds |
| Logical canvas | 800 × 360 px |
| Signals | Cyan Circle, Magenta Triangle, Amber Diamond |
| Cycle | Cyan → Magenta → Amber → Cyan |
| Starting integrity | 3 |
| Lane unlock schedule | `[0, 0, 30, 60]` seconds |
| Maximum unresolved traffic | 1 drone per lane |
| Initial gate state | Cyan on every lane |
| First drone | Lane 1 / Magenta |
| Random drone signal | differs from selected lane gate at spawn |
| BaseGame time bonus | disabled |
| Crash score penalty | none |

Initial tuning defaults:

| Value | Initial default |
|---|---:|
| Drone spawn center X | 64 px |
| Gate center-crossing X | 680 px |
| Drone size | 32 × 22 px |
| Initial speed | 140 px/s |
| Final speed | 240 px/s |
| Initial requested spawn interval | **3.2 s** |
| Final requested spawn interval | 1.1 s |
| Maximum accepted outer update | 0.1 s |
| Base safe-pass points | 100 |
| Combo step | +20 points/pass |
| Combo bonus cap | 8 previous passes |

Motion/run values live once in `SIGNAL_SWITCH_RULES`; scoring values live once in `scoring.ts`. Tests should import the rule source rather than restating tunable numbers.

### Spawn-capacity headroom

The earlier 2.2-second opening interval exactly saturated two-lane capacity:

```text
transitDistance = 680 - 64 = 616 px
initialTransit = 616 / 140 = 4.4 s
2-lane capacity interval = 4.4 / 2 = 2.2 s
```

That made the board permanently full from the opening and rendered cadence shortening inert while two lanes were the bottleneck. The reviewed initial interval is therefore **3.2 seconds**, giving useful headroom before lane 3 unlocks.

For any representative point in a lane phase, the requested interval should remain greater than the lane-capacity interval:

```text
requestedSpawnInterval
  > (gateX - droneSpawnX) / droneSpeed / activeLaneCount
```

A unit test checks this using `SIGNAL_SWITCH_RULES` at:

- run start;
- immediately before every positive lane-unlock threshold;
- run end.

With the reviewed defaults, the narrowest opening-phase headroom is still about 1.41× immediately before 30 seconds. This prevents a future tuning edit from silently making cadence inert again.

## Signal Identity

Signal order remains the cycling authority:

```ts
export const SIGNAL_SWITCH_SIGNAL_ORDER = [
    'cyan',
    'magenta',
    'amber',
] as const

export type SignalSwitchSignal =
    (typeof SIGNAL_SWITCH_SIGNAL_ORDER)[number]
```

All non-geometry metadata lives in one keyed catalog:

```ts
export const SIGNAL_SWITCH_SIGNALS: Readonly<
    Record<
        SignalSwitchSignal,
        {
            label: string
            glyph: string
            shapeName: 'Circle' | 'Triangle' | 'Diamond'
            color: number
        }
    >
> = {
    cyan: {
        label: 'Cyan',
        glyph: '●',
        shapeName: 'Circle',
        color: 0x22d3ee,
    },
    magenta: {
        label: 'Magenta',
        glyph: '▲',
        shapeName: 'Triangle',
        color: 0xec4899,
    },
    amber: {
        label: 'Amber',
        glyph: '◆',
        shapeName: 'Diamond',
        color: 0xf59e0b,
    },
}
```

The renderer imports `color`; the initializer imports `label`, `glyph`, and `shapeName`. Only the renderer's Pixi path switch remains separate because geometry is executable drawing behavior, not metadata.

## Lane Model

Lane topology is one schedule, not four partly duplicated config fields:

```ts
export const SIGNAL_SWITCH_RULES = {
    // ...
    laneUnlockSeconds: [0, 0, 30, 60] as const,
    // ...
}

interface SignalSwitchConfig extends BaseGameConfig {
    laneUnlockSeconds: readonly number[]
    // other motion fields...
}
```

`maxLanes`, `startingLaneCount`, `lane3UnlockSeconds`, and `lane4UnlockSeconds` are **not** separate config fields.

Active lane count derives from the schedule:

```ts
private activeLaneCountForElapsed(elapsedSeconds: number): number {
    return this.config.laneUnlockSeconds.filter(
        unlockAt => elapsedSeconds >= unlockAt
    ).length
}
```

Initial active lanes are therefore the count of zero-time entries, and total lanes are `laneUnlockSeconds.length`. All gate states exist from initialization, but only active lanes accept input or traffic.

`cycleGate(laneIndex)` returns `false` without mutation when the run is inactive/paused/over, the index is not an integer, or the lane is not active. Valid input advances exactly one signal step and emits state change.

## Simulation Time and Difficulty

BaseGame/GameTimer remains the only authority on run expiration. Signal Switch separately tracks private simulation time:

```ts
private elapsedSimSeconds = 0
```

Each accepted update derives:

```text
progress = clamp(elapsedSimSeconds / duration, 0, 1)
droneSpeed = lerp(initialDroneSpeed, finalDroneSpeed, progress)
spawnInterval = lerp(initialSpawnInterval, finalSpawnInterval, progress)
activeLaneCount = count(laneUnlockSeconds <= elapsedSimSeconds)
```

If rAF pauses in a background tab, returning does not jump through unseen traffic. BaseGame may still expire based on wall time.

## Drone Model and Fair Spawn Invariant

```ts
interface SignalSwitchDrone {
    id: string
    laneIndex: number
    signal: SignalSwitchSignal
    /** Horizontal center in logical canvas pixels. */
    x: number
}
```

`x` is always the horizontal **center**. Movement and crossing compare this center directly with `gateX`. Renderer body geometry derives its left edge as `x - droneWidth / 2` and centers the signal marker at `x`.

Private runtime state:

```ts
private spawnElapsedSeconds = 0
private droneSequence = 0
```

### Deterministic first drone

`onGameStart()` resets private counters and authors `drone-0` at lane index 0, Magenta, `x = droneSpawnX`. It consumes zero RNG.

### Random spawns

A lane is eligible only if it is active and has no unresolved drone.

If all active lanes are occupied, spawning is deferred and readiness is capped at one current interval. Releasing a lane can therefore create at most one immediate spawn, never a catch-up burst.

For an actual random spawn:

1. one RNG read chooses among free active lanes;
2. the selected lane's current gate signal is removed from candidates;
3. one RNG read chooses one of the remaining two signals;
4. one drone is created at `droneSpawnX`.

All-busy deferral consumes zero RNG. Every actual random spawn consumes exactly two reads.

## Update and Gate Crossing

`update(deltaTime)` ignores non-positive/non-finite deltas and inactive/paused runs. Valid deltas clamp to `maxUpdateDelta`.

Update order:

1. advance simulation time;
2. derive active lanes, speed, and spawn interval;
3. move drone centers right;
4. resolve every center crossing during the step;
5. if still active, advance capped spawn readiness and create at most one drone;
6. emit one final state change.

Crossing uses:

```ts
const crossedGate = previousX < gateX && nextX >= gateX
```

A matched crossing removes the drone, increments `safePasses` and combo, updates `maxCombo`, and awards the pure pass score. A mismatch removes the drone, increments crashes, resets combo, and removes one integrity without subtracting score.

When integrity reaches zero, set `outcome = 'systems-failed'` and call BaseGame `end()` once. BaseGame marks the run inactive synchronously before its save await, so later update work cannot double-end.

## Local State-Change Method

Signal Switch explicitly defines the same local convention used by existing BaseGame subclasses:

```ts
private emitStateChange(): void {
    if (this.callbacks.onStateChange) {
        this.callbacks.onStateChange(this.getState())
    }
    this.emit('state-change', { state: this.getState() })
}
```

A BaseGame-wide migration is out of scope for HPA-71.

## Scoring

`calculateSignalSwitchPassPoints(comboAfterPass)` is the only production scoring formula:

```text
safeCombo = max(1, floor(comboAfterPass))
bonusSteps = min(safeCombo - 1, 8)
points = 100 + bonusSteps * 20
```

Combo 1 scores 100, combo 2 scores 120, combo 5 scores 180, and combo 9+ scores 260. Crashes reset combo but never remove earned score. There is no time or survival bonus.

## Outcomes and Submitted Data

```ts
type SignalSwitchOutcome =
    | 'playing'
    | 'systems-failed'
    | 'survived'
```

Failure presentation: **`SIGNAL LOST` / `Systems failed`**.
Timeout presentation: **`SHIFT COMPLETE` / `Survived`**.

Achievement-facing data:

```ts
interface SignalSwitchGameData {
    safePasses: number
    crashes: number
    maxCombo: number
    integrityRemaining: number
    survivedFullRun: boolean
}
```

`survivedFullRun` deliberately rejects a zero-activity background-tab completion:

```ts
survivedFullRun:
    state.outcome === 'survived' && state.safePasses > 0
```

This is a narrow guard against awarding the Clean Shift achievement to a run that timed out without processing a single drone. It does not attempt to build anti-cheat or synchronize simulation time to wall time.

## Renderer

`SignalSwitchRenderer` extends `PixiJSRenderer`.

Static layer:

- dark board background;
- horizontal lane separators derived from total lane count;
- gate-zone guide around `gateX`.

Dynamic layer:

- gate beam/marker for each active lane;
- signal marker geometry (circle/triangle/diamond);
- drone body drawn from center X plus its centered signal marker;
- dim overlay for locked lanes.

Lane centers derive from `canvasHeight / laneUnlockSeconds.length`. Renderer config receives `gateX`, lane count, `droneWidth`, and `droneHeight` from game config. Renderer imports signal colors from `SIGNAL_SWITCH_SIGNALS`; it owns only the drawing-path switch.

## Initializer and Input

`initSignalSwitchGameFramework()` follows current Gravity Flip conventions:

- required-container error through existing core error helpers;
- destroy renderer on setup failure;
- one game instance;
- forward achievement/challenge results;
- tracked DOM/window listeners;
- active-run `beforeunload` warning;
- one rAF loop;
- return `game`, `renderer`, `getGame()`, `getState()`, idempotent `cleanup()`;
- page owns `window.signalSwitchGame` assignment.

Four native Astro lane buttons are present from first render in a 2×2 layout. One delegated `#gate-controls` click listener calls `cycleGate`. Keys `1`–`4` call the same API.

Keyboard handling imports the shared `isEditableTarget()` helper, ignores repeat/Ctrl/Meta/Alt and button targets, and calls `preventDefault()` only when a cycle succeeds.

The Astro page wraps initialization in `document.addEventListener('DOMContentLoaded', ...)`, matching Gravity Flip and Potion Sorter.

## Page and Catalog Registration

Route: `/signal-switch`

Registry identity:

```ts
{
    id: GameID.SIGNAL_SWITCH,
    name: 'Signal Switch',
    description:
        'Switch lane gates to match incoming drone signals before impact',
    category: 'action',
    maxPlayers: 1,
    estimatedDuration: '1-2 minutes',
    difficulty: 'medium',
    tags: ['timing', 'reflex', 'lanes', 'single-player', 'signals'],
    isActive: true,
    organism: { shape: 'lattice', color: 'ice' },
    depth: 'shallow',
}
```

Signal Switch is appended normally to `GAMES`. `lattice/ice` avoids the earlier `lattice/teal` collision with first-mid Tetris, so no load-bearing array insertion point is required. Filtered catalog adjacency becomes Pattern Pulse (`chain/magenta`) → Signal Switch (`lattice/ice`) → Tetris (`lattice/teal`), which satisfies the existing exact shape+color adjacency invariant.

Create the route before adding the active row because `games.test.ts` verifies registered routes exist. Shallow/mid/abyssal counts become 7/9/4.

`getGameUrl()` and the derived all-games navigation spec remain source-unchanged.

## Achievements

Use existing achievement machinery only:

1. **First Clearance** — score threshold 100.
2. **Signal Streak** — `maxCombo >= 10`.
3. **Clean Shift** — `survivedFullRun && crashes === 0`.
4. **Traffic Controller** — `survivedFullRun && safePasses >= 40`.

Clean Shift cannot unlock from a zero-pass background completion because `survivedFullRun` already requires `safePasses > 0`.

## Reset, Play Again, and Cleanup

- Start calls `game.start()`.
- Reset calls `game.reset()`, renders/syncs idle state, hides overlay, and shows Start.
- Play Again hides overlay and calls `game.start()`; BaseGame auto-resets a completed run and starts immediately.
- Reset restores Cyan gates, three integrity, lane schedule-derived initial lane count, zero score/stats, and private simulation/spawn/ID counters.
- The deterministic teaching drone appears only on Start.
- Cleanup cancels rAF, removes tracked listeners, unregisters end handling, destroys renderer, and destroys game exactly once.

## Testing Strategy

### Rules and scoring

- Keep exact scoring literals because the score curve is product contract.
- For balance/rule tests, derive expectations from `SIGNAL_SWITCH_RULES` instead of restating 140, 3.2, lane counts, canvas dimensions, or drone dimensions.
- Add the phase-boundary headroom invariant described above.

### Game model

Cover idle defaults, fixed teaching drone, gate cycle/rejection, schedule-derived 30s/60s lane unlocks, interpolation, one-frame center crossing, combo/integrity, final-integrity end once, timeout survival, multi-candidate free-lane RNG selection, non-matching generated signal, zero-RNG busy deferral, no catch-up burst, reset/ID restoration, and zero-pass `survivedFullRun === false`.

Terminal tests stub `ScoreManager.saveFinalScore()` so callbacks do not depend on fetch.

### Renderer

Verify setup/config, two layers, active gates/drones, locked-lane overlay, distinct signal geometries, catalog-derived colors, and center-coordinate body geometry.

### Shared editable target

Add focused coverage in `shared/utils.test.ts`, then run Gravity Flip and Pattern Pulse initializer suites after replacing their local copies with the shared import.

### Initializer and markup

With jsdom + fake rAF verify delegated buttons, keyboard guards, lane unlock enablement, live-region announcements, terminal copy, Reset, Play Again, unload warning, and idempotent cleanup.

Markup coverage should avoid formatting-sensitive source strings. It must verify:

```ts
const readyIndex = signalSwitchMarkup.indexOf('DOMContentLoaded')
const initCallIndex = signalSwitchMarkup.indexOf(
    'initSignalSwitchGameFramework()'
)
expect(readyIndex).toBeGreaterThan(-1)
expect(initCallIndex).toBeGreaterThan(readyIndex)
```

This catches a module-top-level init call while tolerating quote/style formatting.

### Browser smoke

After the tuning checkpoint, add one real-control journey:

1. open `/signal-switch` and assert idle controls;
2. Start and click Lane 1 once;
3. advance the exposed game model until the first safe pass;
4. assert score/combo/integrity;
5. Reset and Start with gates left Cyan;
6. advance the same run until three mismatches end it;
7. assert failure copy;
8. Play Again and assert a clean active run;
9. at 375×812, assert 2×2 controls remain reachable and no horizontal overflow occurs.

Intercept `/api/scores` for terminal UI determinism. Do not wait 90 real seconds and do not add test-only production APIs.

## Manual-Play Tuning Checkpoint

The checkpoint runs **immediately after the route/initializer task makes the game playable, before catalog/achievement registration and before final browser regression work**.

Answer:

1. Does the first Lane-1/Magenta drone leave enough discovery time with the reviewed 3.2-second opening cadence?
2. Are three lanes around 30 seconds busier but readable?
3. Are four lanes around 60 seconds still readable?
4. Can a late drone requiring two cycles be handled comfortably?
5. Can a strong survival run reach 40 safe passes?

If tuning changes are needed, change only `SIGNAL_SWITCH_RULES`/scoring constants, affected behavior tests, and this spec, then rerun targeted game tests. Regression/registry work proceeds only after these defaults are accepted.

## Expected Production Surface

Create:

- `src/lib/games/signal-switch/types.ts`
- `src/lib/games/signal-switch/scoring.ts`
- `src/lib/games/signal-switch/SignalSwitchGame.ts`
- `src/lib/games/signal-switch/SignalSwitchRenderer.ts`
- `src/lib/games/signal-switch/initFramework.ts`
- `src/pages/signal-switch/index.astro`

Modify for Signal Switch:

- `src/lib/games.ts`
- `src/lib/games/shared/types.ts`
- `src/lib/achievements.ts`
- `CLAUDE.md`

Narrow reuse cleanup required by the third editable-target consumer:

- `src/lib/games/shared/utils.ts`
- `src/lib/games/shared/utils.test.ts`
- `src/lib/games/gravity-flip/initFramework.ts`
- `src/lib/games/pattern-pulse/initFramework.ts`

Add/update tests beside the game plus registry, achievement, organism, markup, Gravity Flip/Pattern Pulse initializer, and Playwright suites.

Expected production-unchanged:

- `src/lib/games/core/BaseGame.ts`
- `src/lib/games/core/GameTimer.ts`
- `src/lib/games/core/ScoreManager.ts`
- `src/lib/games/core/GameInitializer.ts`
- `src/lib/games/renderers/PixiJSRenderer.ts`
- `src/lib/services/scoreService.ts`
- `src/lib/server/db/**`
- `src/pages/api/**`
- auth files;
- `e2e/games/all-games-navigation.spec.ts`.

## Acceptance Mapping

- **Home page card/link:** active registry entry with route/icon/duration/difficulty/organism metadata.
- **Start/play/lose/complete/restart:** BaseGame lifecycle + three-integrity failure + timeout survival + Play Again.
- **Existing score submission:** BaseGame/ScoreManager final-save path.
- **Desktop/mobile:** keys 1–4 + four native buttons + responsive Pixi canvas.
- **Increasing pressure:** lane schedule plus speed/cadence interpolation with non-saturated opening headroom.
- **Safe-pass/combo scoring:** one pure pass scorer.
- **Wrong-gate consequence:** third mismatch ends the run.

## YAGNI Boundary

HPA-71 ships the smallest complete Signal Switch loop. Do not add shared lane/traffic/spawn/runner systems, procedural waves, difficulty menus, special drones, canvas touch-coordinate mapping, persistence, schema/API changes, audio/haptics, generalized real-time infrastructure, or a BaseGame state-change migration. The only cross-game cleanup is the already-duplicated editable-target predicate now gaining a third consumer.
