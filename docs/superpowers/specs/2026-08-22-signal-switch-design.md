# Signal Switch — Design Spec

- **Linear issue:** [HPA-71 — Minigame: Signal Switch](https://linear.app/cwchanap/issue/HPA-71/minigame-signal-switch)
- **Date:** 2026-08-22
- **Status:** Planning draft, reviewed for implementation

## Overview

Signal Switch is a short real-time lane-management game. Colored drones travel left-to-right toward laser gates. Each lane owns one switchable gate. Before a drone reaches its gate, the player cycles that lane until its signal matches the incoming drone.

Version 1 is one **90-second** run. It starts with two lanes, unlocks a third lane at 30 seconds and a fourth at 60 seconds of simulated gameplay, and continuously raises drone speed while shortening spawn cadence. A safe pass scores and extends combo. A mismatch removes one of three integrity points and resets combo. Losing all integrity ends the run; surviving until BaseGame's countdown reaches zero completes it.

The implementation stays local to existing Cetus seams. `BaseGame` owns run timing, completed-run reset, score saving, stale-save protection, achievements, and challenge updates. `SignalSwitchGame` owns gates, drones, lane occupancy, crossing resolution, integrity, combo, and simulation-time difficulty. `SignalSwitchRenderer` owns only the Pixi lane scene. A local initializer owns one requestAnimationFrame loop and the static Astro lane controls.

There is no shared lane engine, generic spawner, physics engine, new persistence path, schema/API work, or reusable input framework in HPA-71.

## Why HPA-71 Is Next

Recent standalone-minigame work moved down the authored backlog sequence: HPA-75 Mine Grid, HPA-74 Pattern Pulse, HPA-73 Gravity Flip, then HPA-72 Potion Sorter. HPA-71 is still open, has no blocking relations, and has no existing GitHub implementation PR or branch. It is therefore the next actionable standalone Cetus minigame.

HPA-70 Rhythm Reactor and HPA-68 Asteroid Drift remain later backlog items.

## Product Goals

- Make the core loop obvious: **read drone → switch that lane → preserve combo**.
- Start with one deterministic teaching interaction: Lane 1 is Cyan and the first drone is Magenta.
- Raise pressure through lane count, speed, and cadence rather than difficulty modes.
- Keep traffic playable by construction: at most one unresolved drone per lane.
- Make every normal random spawn actionable: its signal differs from that lane's gate state at spawn.
- Support keyboard and touch through the same `cycleGate(laneIndex)` API.
- Never rely on color alone; Cyan/Magenta/Amber are also Circle/Triangle/Diamond.
- Reuse existing score, leaderboard/progress, achievement, GamePage, unload-warning, and stale-run lifecycle behavior.
- Use one injected `rng: () => number` seam for deterministic tests.
- Keep v1 tuning independent from architecture so manual play can adjust constants cheaply.

## Non-Goals

Version 1 does not include:

- campaign levels, difficulty selection, Daily mode, seeds, replay, or resume-after-refresh;
- generic traffic/lane/spawn/input/real-time frameworks;
- a refactor of Gravity Flip into shared runner infrastructure;
- drag gestures, canvas pointer-coordinate lane selection, or hit testing;
- more than three signals or four lanes;
- multiple unresolved drones in one lane;
- special drones, shields, power-ups, bosses, upgrades, economy, or progression;
- score penalties in addition to integrity loss;
- pause or manual End Game controls;
- audio, haptics, particles, textures, or image assets;
- database, API, auth, score-service, leaderboard, BaseGame, GameTimer, PixiJSRenderer, or GameInitializer changes.

## Approaches Considered

### A. BaseGame + PixiJSRenderer + game-local rAF — selected

This matches the proven Gravity Flip integration shape without sharing game-specific mechanics. BaseGame keeps lifecycle/persistence; Pixi handles continuous movement; the game model needs only a small `update(deltaSeconds)` loop.

### B. DOM/CSS lanes and transitions

Static controls would be easy, but continuous drone motion would require synchronizing CSS transitions with gameplay crossing time or frequent DOM style mutation. Pixi already solves that problem in Cetus with less custom coordination.

### C. Extract a generic runner/lane/spawn engine

Gravity Flip and Signal Switch both animate entities, but the mechanics differ: fixed-X vertical physics/hazards versus lane gates/match resolution. Extracting now would create abstractions before two concrete consumers share meaningful behavior. HPA-71 copies conventions, not a framework.

## Reuse Decisions

### BaseGame remains run authority

`SignalSwitchGame` extends `BaseGame`. BaseGame remains responsible for:

- the authoritative 90-second `GameTimer`;
- completed-run auto-reset on the next `start()`;
- score accumulation/final submission;
- final timer snapshots;
- stale async-save suppression;
- achievement/challenge result delivery.

Signal Switch sets `timeBonus: false`. Only safe passes contribute score. No second timer, save path, or stale-run token is added.

### PixiJSRenderer owns only the moving board

`SignalSwitchRenderer` uses a fixed **800×360** logical canvas with:

- one static background/lane layer;
- one dynamic scene layer cleared and redrawn each frame.

There are at most four drones and four gates. No sprites, object pools, textures, or generic entity renderer are needed.

### Game-local requestAnimationFrame loop

The initializer follows Gravity Flip:

```text
requestAnimationFrame
→ compute monotonic rAF delta
→ clamp outer delta to 0.1 s
→ game.update(deltaSeconds)
→ renderer.render(game.getState())
→ request next frame
```

Signal Switch does not need 1/120-second physics substeps. A crossing is detected from previous X to next X, so one accepted 0.1-second frame cannot tunnel past the gate.

### Native Astro controls

Four buttons exist in Astro from first render. One `#gate-controls` delegated listener maps them to lanes. Desktop keys `1`–`4` call the same API. No canvas hit testing is required.

## Structural Rules vs Tuning Defaults

Structural v1 contracts:

| Rule | Value |
|---|---:|
| Run duration | 90 seconds |
| Logical canvas | 800 × 360 px |
| Signals | Cyan Circle, Magenta Triangle, Amber Diamond |
| Cycle | Cyan → Magenta → Amber → Cyan |
| Starting integrity | 3 |
| Maximum lanes | 4 |
| Starting lanes | 2 |
| Lane unlocks | lane 3 at 30s, lane 4 at 60s simulated time |
| Lane occupancy | max 1 unresolved drone/lane |
| Initial gate state | Cyan on all four lanes |
| First drone | Lane 1 / Magenta |
| Random drone signal | never equals selected lane's gate at spawn |
| BaseGame time bonus | disabled |
| Crash score penalty | none |

Initial tuning defaults:

| Value | Initial default |
|---|---:|
| Drone spawn X | 64 px |
| Gate X | 680 px |
| Drone size | 32 × 22 px |
| Initial speed | 140 px/s |
| Final speed | 240 px/s |
| Initial spawn interval | 2.2 s |
| Final spawn interval | 1.1 s |
| Maximum accepted outer update | 0.1 s |
| Base safe-pass points | 100 |
| Combo step | +20 points/pass |
| Combo bonus cap | 8 previous passes |

Motion/run values live once in `SIGNAL_SWITCH_RULES`; scoring values live once in `scoring.ts`. Page/initializer/renderer code must not define competing gameplay values.

If manual play changes tuning, the implementation PR updates the constants, exact tests, and this design document together.

## Signal Identity and Accessibility

```ts
export const SIGNAL_SWITCH_SIGNAL_ORDER = [
    'cyan',
    'magenta',
    'amber',
] as const

export type SignalSwitchSignal =
    (typeof SIGNAL_SWITCH_SIGNAL_ORDER)[number]
```

| Signal | Glyph | Shape |
|---|---|---|
| Cyan | `●` | Circle |
| Magenta | `▲` | Triangle |
| Amber | `◆` | Diamond |

`types.ts` exports signal order and display metadata (`label`, `glyph`). Renderer marker geometry dispatches on the same signal union. Controls show text such as **`Lane 2: ▲ Magenta`** so color is never the sole cue.

## Lane and Gate Model

All four gate states exist from initialization, but only active lanes accept input or traffic.

```ts
interface SignalSwitchState extends BaseGameState {
    outcome: 'playing' | 'systems-failed' | 'survived'
    activeLaneCount: number
    gateSignals: SignalSwitchSignal[]
    drones: SignalSwitchDrone[]
    integrity: number
    safePasses: number
    crashes: number
    combo: number
    maxCombo: number
    droneSpeed: number
    spawnInterval: number
}
```

`cycleGate(laneIndex)` returns `false` without mutation when:

- the run is inactive, paused, or over;
- the index is not an integer 0–3;
- the lane is not active yet.

For valid input it advances one signal step, emits state change, and returns `true`. It never mutates drones, score, integrity, spawn timing, or another lane.

## Simulation Time and Difficulty

BaseGame/GameTimer is the only authority on run expiration. Signal Switch separately tracks private simulation time:

```ts
private elapsedSimSeconds = 0
```

Each accepted update derives:

```text
progress = clamp(elapsedSimSeconds / 90, 0, 1)
droneSpeed = lerp(140, 240, progress)
spawnInterval = lerp(2.2, 1.1, progress)

activeLaneCount =
  elapsedSimSeconds >= 60 ? 4 :
  elapsedSimSeconds >= 30 ? 3 :
  2
```

If rAF pauses in a background tab, returning never jumps the on-canvas simulation through unseen traffic/difficulty. BaseGame's real timer may still expire normally.

An unlocked lane simply exposes its existing Cyan gate; no lane migration/reconstruction occurs.

## Drone Model and Fair Spawn Invariant

```ts
interface SignalSwitchDrone {
    id: string
    laneIndex: number
    signal: SignalSwitchSignal
    x: number
}
```

Private runtime state:

```ts
private spawnElapsedSeconds = 0
private droneSequence = 0
```

### Deterministic first drone

`onGameStart()` resets runtime counters and authors:

```text
drone-0
laneIndex = 0
signal = magenta
x = droneSpawnX
```

The first drone consumes zero RNG and immediately teaches one Cyan→Magenta cycle.

### Random spawns

A lane is eligible only if it is active and has no unresolved drone.

If all active lanes are occupied, spawning is deferred and the accumulator stays capped at the current interval. Releasing a lane can therefore create at most one immediate spawn—never a catch-up burst.

When a lane is free:

1. one RNG read chooses among free active lanes;
2. that lane's current gate signal is removed from the signal candidates;
3. one RNG read chooses one of the remaining two signals;
4. one drone is created at `droneSpawnX`.

Thus a normal random drone is never already solved at spawn and same-lane conflicts are impossible by construction.

Random spawning performs zero RNG reads while all lanes are busy and exactly two reads when a random drone is actually created.

## Update and Gate Crossing

`update(deltaTime)` ignores non-positive/non-finite deltas and inactive/paused runs. Valid deltas clamp to 0.1 seconds.

Update order:

1. advance simulation time;
2. derive lane count, speed, and spawn interval;
3. move drones right;
4. resolve drones whose center crossed the gate during this step;
5. if still active, advance capped spawn readiness and create at most one drone;
6. emit one final state change.

Crossing uses:

```ts
const crossedGate = previousX < gateX && nextX >= gateX
```

### Safe pass

If `drone.signal === gateSignals[drone.laneIndex]` at crossing:

- remove drone;
- `safePasses += 1`;
- `combo += 1`;
- update `maxCombo`;
- award `calculateSignalSwitchPassPoints(combo)`.

### Wrong gate

If signals differ:

- remove drone;
- `crashes += 1`;
- `combo = 0`;
- `integrity -= 1`;
- do not alter score.

If integrity reaches zero, set `outcome='systems-failed'` and delegate once to `BaseGame.end()`. BaseGame marks the run inactive synchronously, so no later crossing/spawn in that update can cause a second end/save.

Drones disappear at the gate. Explosion/debris/exit-animation state is out of scope.

## Scoring

`calculateSignalSwitchPassPoints(comboAfterPass)` is the only production formula:

```text
safeCombo = max(1, floor(comboAfterPass))
bonusSteps = min(safeCombo - 1, 8)
points = 100 + bonusSteps * 20
```

| Combo after pass | Points |
|---:|---:|
| 1 | 100 |
| 2 | 120 |
| 5 | 180 |
| 9 | 260 |
| 20 | 260 |

A crash resets combo before the next pass but does not subtract earned score. There is no BaseGame time bonus or final survival bonus.

## Outcomes and Submitted Data

```ts
type SignalSwitchOutcome =
    | 'playing'
    | 'systems-failed'
    | 'survived'
```

Integrity failure:

- title: **`SIGNAL LOST`**
- outcome: **`Systems failed`**

Timeout sets `outcome='survived'` before delegating to BaseGame:

- title: **`SHIFT COMPLETE`**
- outcome: **`Survived`**

Stats:

```ts
interface SignalSwitchStats extends BaseGameStats {
    outcome: SignalSwitchOutcome
    safePasses: number
    crashes: number
    maxCombo: number
    integrityRemaining: number
}
```

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

`src/lib/games/shared/types.ts` re-exports the canonical game-local type and adds it to `GameData`.

## Renderer

`SignalSwitchRenderer` extends `PixiJSRenderer`.

Static layer:

- dark board background;
- four horizontal lane separators;
- gate-zone guide around `gateX`.

Dynamic layer:

- gate beam/marker for each active lane;
- Circle/Triangle/Diamond marker geometry;
- drone body plus matching marker;
- dim overlay for locked lanes.

Lane centers derive from `canvasHeight / maxLanes`; there are no four authored Y constants.

Renderer visual colors are exhaustive over the signal union, but renderer never resolves collisions, mutates gates, scores, or schedules drones.

`createSignalSwitchRendererConfig()` targets `#signal-switch-canvas`, logical 800×360, `responsive:false`, and the same page-level CSS scaling approach as Gravity Flip.

## Initializer and Input

`initSignalSwitchGameFramework()` follows current Gravity Flip/Pattern Pulse conventions:

- required-container error through `DOMElementNotFoundError` + `handleGameError`;
- destroy renderer on setup failure;
- one `SignalSwitchGame` instance;
- forward achievement/challenge results from game end;
- track and remove DOM/window listeners;
- active-run `beforeunload` warning;
- one rAF loop;
- return `game`, `renderer`, `getGame()`, `getState()`, idempotent `cleanup()`;
- Astro page owns `window.signalSwitchGame` assignment.

### Controls

```text
#gate-controls
  button[data-signal-lane="0"]
  button[data-signal-lane="1"]
  button[data-signal-lane="2"]
  button[data-signal-lane="3"]
```

One delegated click handler calls `cycleGate`.

Buttons display current glyph/label and are disabled while the game is idle or their lane is locked. `aria-label` includes lane, color name, and shape name.

Desktop `1`–`4` map to lanes 0–3. Document keydown ignores repeat, Ctrl/Meta/Alt, editable targets, and button targets. A successful keyboard cycle calls `preventDefault()`. Focused native Enter/Space therefore cannot double-trigger through the document handler.

### HUD and announcements

GamePage owns Score and Time. Signal Switch adds:

- `#integrity` — `3 / 3`;
- `#combo` — `0`;
- `#safe-passes` — `0`;
- `#lanes-online` — `2 / 4`;
- `#drone-speed` — `140` initially.

`#signal-switch-status` is `aria-live="polite"`. Announce only discrete lane unlocks, integrity loss, and terminal completion/failure. Gate-button text itself updates on gate changes, avoiding live-region spam every frame.

## Page and Catalog Registration

Route: **`/signal-switch`**

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
    organism: { shape: 'lattice', color: 'teal' },
    depth: 'shallow',
}
```

Game ID: `signal_switch`; icon: `🚦`.

Shallow placement changes organism counts from **6 / 9 / 4** to **7 / 9 / 4**. The prior last shallow specimen is Pattern Pulse (`chain/magenta`), so `lattice/teal` preserves the adjacent shape+color invariant.

Create the route before adding this active row because `games.test.ts` verifies every active game has a corresponding Astro route.

`getGameUrl()` and `e2e/games/all-games-navigation.spec.ts` remain source-unchanged because both already derive behavior from the registry.

`CLAUDE.md` updates the implemented game count 19→20 and documents the new module/debug handle. Do not edit the `AGENTS.md` symlink directly.

## Achievements

Use the existing code-defined achievement system only:

1. **First Clearance** — score threshold 100.
2. **Signal Streak** — `maxCombo >= 10`.
3. **Clean Shift** — `survivedFullRun && crashes === 0`.
4. **Traffic Controller** — `survivedFullRun && safePasses >= 40`.

No achievement-service changes are needed.

## Reset, Play Again, and Cleanup

- Start calls `game.start()`.
- Reset calls `game.reset()`, renders/syncs idle state, hides overlay, and shows Start.
- Play Again hides overlay and calls `game.start()`; BaseGame auto-resets a completed run and starts immediately.
- Fresh/reset state restores four Cyan gates, integrity 3, two active lanes, zero score/stats, and zeroed simulation/spawn/ID counters.
- The deterministic first drone appears only when the run starts, never while idle.
- Cleanup cancels rAF, removes tracked listeners, unregisters end handling, destroys renderer, and destroys game exactly once.

## Testing Strategy

### Pure scoring

Lock combos 1, 2, 5, 9, above cap, and invalid/negative normalization.

### Game model

Cover:

- idle defaults and fixed first drone;
- gate cycle order and inactive/locked rejection;
- 30s/60s lane unlocks with an unreachable test gate so traffic cannot end the ramp test;
- speed/cadence interpolation;
- one-frame before→beyond gate crossing;
- match scoring/combo and mismatch integrity reset;
- final integrity ending exactly once;
- timeout outcome `survived`;
- random spawns only in free active lanes;
- random signal differs from current selected gate;
- all-busy traffic uses zero RNG and holds one ready spawn;
- freeing one congested lane creates one random spawn, not a burst;
- reset restores private counters and `drone-0` teaching spawn.

Terminal tests stub `ScoreManager.saveFinalScore()` so callback timing does not depend on fetch.

### Renderer

Verify setup/config, static/dynamic layers, active gates/drones, locked-lane overlay, and distinct Circle/Triangle/Diamond geometry.

### Initializer

With jsdom + fake rAF verify missing-container error, idle HUD, delegated buttons, keys 1–4 and guards, lane unlock enablement, live-region announcements, failure/survival copy, Reset, Play Again, unload warning, and idempotent cleanup.

### Registry/markup/achievements

Extend existing suites for route, GameID/icon, organism counts 7/9/4, shared game-data union, four lane buttons, no Pause/End, 90-second page time, and four achievements.

### Browser smoke

Use the real page controls plus the exposed debug handle only to advance simulation quickly:

1. open `/signal-switch` and assert idle integrity/lanes/buttons;
2. Start;
3. click Lane 1 once (Cyan→Magenta);
4. repeatedly call `window.signalSwitchGame.game.update(0.1)` until the deterministic first drone passes;
5. assert safe passes 1, combo 1, score 100, integrity 3;
6. Reset and Start a fresh run, leaving every gate Cyan;
7. repeatedly call `game.update(0.1)` in that **same run** until three generated non-Cyan crossings consume all integrity;
8. assert `SIGNAL LOST / Systems failed`;
9. Play Again and assert a fresh active run;
10. at 375×812, assert the 2×2 lane controls are reachable and the canvas creates no horizontal overflow.

Intercept `/api/scores` in the terminal browser test so overlay timing is deterministic. Do not wait 90 real seconds and do not add a production test-only API.

## Manual-Play Tuning Checkpoint

Before final implementation gates, answer:

1. Does the first Lane-1/Magenta drone leave enough discovery time?
2. Are three lanes around 30s busier but readable?
3. Are four lanes around 60s still readable at current speed/cadence?
4. Can a late drone requiring two cycles still be handled comfortably?
5. Can a strong survival run reach 40 safe passes?

If balance changes are needed, change rule/scoring constants and exact-value tests rather than architecture unless play reveals a genuine structural flaw.

## Expected Production Surface

Create:

- `src/lib/games/signal-switch/types.ts`
- `src/lib/games/signal-switch/scoring.ts`
- `src/lib/games/signal-switch/SignalSwitchGame.ts`
- `src/lib/games/signal-switch/SignalSwitchRenderer.ts`
- `src/lib/games/signal-switch/initFramework.ts`
- `src/pages/signal-switch/index.astro`

Modify:

- `src/lib/games.ts`
- `src/lib/games/shared/types.ts`
- `src/lib/achievements.ts`
- `CLAUDE.md`

Add/update tests beside the game plus existing registry, achievement, organism, markup, and Playwright suites.

Expected production-unchanged:

- `src/lib/games/core/BaseGame.ts`
- `src/lib/games/core/GameTimer.ts`
- `src/lib/games/core/ScoreManager.ts`
- `src/lib/games/core/GameInitializer.ts`
- `src/lib/games/renderers/PixiJSRenderer.ts`
- `src/lib/games/shared/utils.ts`
- `src/lib/services/scoreService.ts`
- `src/lib/server/db/**`
- `src/pages/api/**`
- `src/lib/auth.ts`
- `src/lib/auth-client.ts`
- `e2e/games/all-games-navigation.spec.ts`

## Acceptance Mapping

- **Home page card/link:** active `GAMES` entry with route/icon/duration/difficulty/organism metadata.
- **Start/play/lose/complete/restart:** BaseGame lifecycle + three-integrity failure + timeout survival + Play Again.
- **Existing score submission:** BaseGame/ScoreManager final-save path.
- **Desktop/mobile:** number keys + four native touch buttons + responsive Pixi canvas.
- **Increasing speed/lane count:** simulation-time interpolation and 30s/60s unlocks.
- **Safe-pass/combo scoring:** one pure pass scorer; crash resets combo.
- **Wrong-gate consequence:** three-point integrity ends on the third crash.

## YAGNI Boundary

HPA-71 ships the smallest complete Signal Switch loop. Do not add shared frameworks, procedural waves, difficulty menus, special drones, canvas touch-coordinate mapping, persistence, schema/API changes, audio/haptics, or generalized real-time infrastructure. Extract common infrastructure later only when at least two concrete games genuinely share it.