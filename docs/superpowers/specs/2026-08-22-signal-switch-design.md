# Signal Switch — Design Spec

- **Linear issue:** [HPA-71 — Minigame: Signal Switch](https://linear.app/cwchanap/issue/HPA-71/minigame-signal-switch)
- **Date:** 2026-08-22
- **Status:** Planning draft, ready for implementation review

## Overview

Signal Switch is a short real-time lane-management game. Colored drones travel from left to right toward laser gates. Each lane owns one switchable gate state. Before a drone reaches its gate, the player must cycle that lane to the drone's matching signal.

Version 1 is one **90-second** run. It begins with two active lanes, unlocks a third lane at 30 seconds and a fourth at 60 seconds, and continuously increases drone speed while shortening the spawn interval. A correct match passes the drone safely and extends a combo. A wrong match removes one of three integrity points and resets the combo. Losing all three integrity points ends the run; surviving until the BaseGame countdown reaches zero completes it.

The game stays local to existing Cetus seams. `BaseGame` owns countdown, completed-run reset, score saving, stale-save protection, achievements, and challenge updates. `SignalSwitchGame` owns gate states, drone scheduling, crossing resolution, integrity, combo, and the simulation-time difficulty ramp. `SignalSwitchRenderer` extends `PixiJSRenderer` for the moving lane scene. A custom initializer owns one requestAnimationFrame loop and the four static lane-control buttons supplied by Astro.

There is no shared lane engine, generic spawner, physics engine, new persistence path, schema/API work, or reusable input framework in HPA-71.

## Why HPA-71 Is Next

Recent standalone-minigame work has intentionally moved down the authored backlog sequence: Mine Grid (HPA-75), Pattern Pulse (HPA-74), Gravity Flip (HPA-73), then Potion Sorter (HPA-72). HPA-71 is still open, has no blockers or related dependency work, has no existing GitHub implementation/PR/branch, and is therefore the next actionable standalone Cetus minigame.

HPA-70 Rhythm Reactor and HPA-68 Asteroid Drift remain later backlog items.

## Product Goals

- Deliver a recognizable **read drone → switch the matching lane → preserve combo** loop within seconds of pressing Start.
- Make pressure rise through lane count, travel speed, and spawn cadence rather than difficulty modes or a progression subsystem.
- Guarantee that generated traffic is playable by construction: at most one unresolved drone may occupy a lane.
- Make every normally spawned drone actionable by choosing a signal different from that lane's gate state at spawn time.
- Give a new player a deterministic first interaction: Lane 1 begins Cyan and the first drone is Magenta.
- Support desktop number keys and large native touch buttons through the same `cycleGate(laneIndex)` game API.
- Keep signal identity understandable without color alone by pairing Cyan/Magenta/Amber with Circle/Triangle/Diamond glyphs.
- Reuse the existing Cetus score, leaderboard/progress, achievement, GamePage, active-run warning, and stale-run lifecycle.
- Keep deterministic tests to one injected `rng: () => number` seam.
- Treat motion/cadence values as initial v1 tuning defaults and keep the architecture independent from tuning changes.

## Non-Goals

Version 1 does **not** include:

- campaign levels, difficulty selection, Daily mode, seeded sharing, or persistence of an unfinished run;
- a generic lane, traffic, spawn, input, or real-time game framework;
- reuse/refactoring of Gravity Flip into a shared runner engine;
- drag controls, gesture recognition, canvas hit-testing, or pointer-coordinate lane selection;
- more than three signal types or more than four lanes;
- multiple unresolved drones in the same lane;
- special drones, shields, power-ups, temporary buffs, bosses, upgrades, or an economy;
- score penalties in addition to integrity loss;
- audio, haptics, particles, image assets, or animation infrastructure;
- pause support or a manual End Game action;
- database, API, auth, score-service, leaderboard, GameTimer, BaseGame, PixiJSRenderer, or GameInitializer changes.

## Approaches Considered

### A. BaseGame + PixiJSRenderer + game-local rAF — selected

This mirrors the proven Gravity Flip shape without sharing game-specific mechanics. Continuous drone motion stays in Pixi, while BaseGame continues to own run lifecycle and persistence. The game only needs a small `update(deltaSeconds)` model and two Pixi graphics layers.

This is the best fit because Signal Switch is animation-heavy but mechanically small.

### B. DOM/CSS lanes and transitions

The lane buttons would be straightforward, but moving multiple drones with reliable game-state timing would require CSS-transition synchronization or frequent DOM style mutation. Unit tests would also have to reconcile transition visuals with the actual crossing moment.

This saves little code because the project already has PixiJSRenderer and a working real-time loop pattern.

### C. Extract a generic runner/lane/spawn engine from Gravity Flip

Gravity Flip and Signal Switch both use rAF and moving entities, but their actual mechanics differ: Gravity Flip has fixed-X player physics and hazards; Signal Switch has lane gates, one-dimensional traffic, and match resolution. A shared engine would introduce abstractions before a second true consumer exists for most behavior.

HPA-71 will reuse conventions, not create a framework.

## Reuse Decisions

### BaseGame remains the run authority

`SignalSwitchGame` extends `BaseGame`. BaseGame already provides:

- the authoritative 90-second `GameTimer`;
- completed-run reset when `start()` is called after game over;
- score accumulation and final submission;
- final timer snapshots;
- stale async-save suppression through the existing run guard;
- achievement/challenge result delivery.

Signal Switch uses `timeBonus: false`. Only safe drone passes contribute score. Do not add a second countdown, save path, stale-run token, or special leaderboard behavior.

### PixiJSRenderer owns only the moving board

`SignalSwitchRenderer` uses a fixed **800×360** logical canvas with:

- one static background/lane layer;
- one dynamic scene layer cleared and redrawn per render.

There are at most four drones and four gates. Sprite maps, object pools, textures, scene graphs per drone, and a generic entity renderer are unnecessary.

### Game-local requestAnimationFrame loop

The initializer follows Gravity Flip's current loop:

```text
requestAnimationFrame
→ compute monotonic rAF delta
→ clamp outer delta to 0.1 s
→ game.update(deltaSeconds)
→ renderer.render(game.getState())
→ request next frame
```

Signal Switch does **not** require 1/120-second physics substeps. Gate resolution checks whether a drone crosses the gate X between its previous and next positions, so a 0.1-second frame cannot tunnel through the gate.

### Native Astro controls, no canvas hit-testing

The page owns four lane buttons from first render. The initializer updates their text/disabled state and delegates clicks from one `#gate-controls` listener. Desktop `1`–`4` keys call the same game method.

This is simpler and more accessible than mapping pointer coordinates through a responsive canvas.

## Structural Rules vs Tuning Defaults

The following are structural v1 contracts:

| Structural rule | Value |
|---|---:|
| Run duration | 90 seconds |
| Logical canvas | 800 × 360 px |
| Signal kinds | Cyan Circle, Magenta Triangle, Amber Diamond |
| Signal cycle order | Cyan → Magenta → Amber → Cyan |
| Integrity | 3 |
| Maximum lanes | 4 |
| Starting active lanes | 2 |
| Lane unlocks | lane 3 at 30s, lane 4 at 60s simulated time |
| In-flight occupancy | max 1 unresolved drone per lane |
| Initial gate state | Cyan on all lanes |
| First drone | Lane 1 / Magenta |
| Random drone signal | never equals that lane's gate at spawn |
| BaseGame time bonus | disabled |
| Wrong-gate score penalty | none |

The following are initial tuning defaults:

| Tuning value | Initial default |
|---|---:|
| Drone spawn X | 64 px |
| Gate X | 680 px |
| Drone width × height | 32 × 22 px |
| Initial drone speed | 140 px/s |
| Final drone speed | 240 px/s |
| Initial spawn interval | 2.2 s |
| Final spawn interval | 1.1 s |
| Maximum accepted outer update | 0.1 s |
| Base safe-pass points | 100 |
| Combo step | +20 points/pass |
| Combo bonus cap | 8 prior consecutive passes |

Production defines motion/run values once in `SIGNAL_SWITCH_RULES` and scoring values once in `scoring.ts`. Page, initializer, renderer, and tests must consume those sources rather than introduce competing values.

If manual play changes a tuning default, the implementation PR updates the rule source, affected exact-value tests, and this design document together. No architecture change is required for tuning.

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

Each signal has a stable non-color identity:

| Signal | Glyph | Shape |
|---|---|---|
| Cyan | `●` | circle |
| Magenta | `▲` | triangle |
| Amber | `◆` | diamond |

`types.ts` exports the signal order and display metadata (`label`, `glyph`). The Pixi renderer keeps its own exhaustive signal-to-Pixi-color map but dispatches marker geometry by the same signal union. Controls render text such as **`Lane 2: ▲ Magenta`**, so the interaction never relies on color alone.

## Lane and Gate Model

All four gate states exist from initialization, but only `activeLaneCount` lanes accept input or traffic.

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

`cycleGate(laneIndex)` returns `false` and changes nothing when:

- the run is inactive, paused, or over;
- the index is not an integer from 0 through 3;
- the lane is not yet active.

For a valid lane it advances exactly one step in `SIGNAL_SWITCH_SIGNAL_ORDER`, emits a state change, and returns `true`.

Gate cycling never changes drones, score, integrity, spawn timing, or another lane.

## Simulation Time and Difficulty Ramp

As with Gravity Flip, BaseGame/GameTimer remains the only authority on whether the 90-second run has expired. Signal Switch separately tracks private **simulated gameplay time** for difficulty:

```ts
private elapsedSimSeconds = 0
```

Every accepted update advances this by the clamped delta and derives:

```text
progress = clamp(elapsedSimSeconds / 90, 0, 1)
droneSpeed = lerp(140, 240, progress)
spawnInterval = lerp(2.2, 1.1, progress)

activeLaneCount =
  elapsedSimSeconds >= 60 ? 4 :
  elapsedSimSeconds >= 30 ? 3 :
  2
```

This avoids a background-tab jump in on-canvas difficulty. If rAF stops while the tab is hidden, BaseGame's real countdown may still finish the run; on return, simulation does not suddenly advance traffic by the hidden elapsed wall-clock duration.

When a lane unlocks, its existing Cyan gate simply becomes active. No migration or lane-state reconstruction occurs.

## Drone Model and Fair Spawn Invariant

```ts
interface SignalSwitchDrone {
  id: string
  laneIndex: number
  signal: SignalSwitchSignal
  x: number
}
```

The game keeps:

```ts
private spawnElapsedSeconds = 0
private droneSequence = 0
```

### Deterministic first drone

`onGameStart()` resets private runtime values and spawns:

```text
drone-0
laneIndex = 0
signal = magenta
x = droneSpawnX
```

All gates start Cyan, so the first drone asks for one obvious Lane 1 switch.

### Random spawns

A lane is eligible only when:

- `laneIndex < activeLaneCount`; and
- no unresolved drone already uses that lane.

If no lane is free, the spawn becomes **ready but deferred**; the accumulator is capped at the current interval so releasing a lane produces at most one immediate spawn, never a catch-up burst.

When at least one lane is free:

1. one RNG read selects a free lane;
2. the lane's current gate signal is removed from the three-signal candidate list;
3. one RNG read selects one of the remaining two signals;
4. the new drone is created at `droneSpawnX`.

Therefore a normally generated drone never starts already solved, and same-lane conflicts are impossible by construction.

Random spawning consumes **zero RNG reads** while every active lane is occupied. It consumes exactly two reads when a random drone is actually created. The deterministic first drone consumes none.

## Update and Gate-Crossing Resolution

`update(deltaTime)` ignores non-positive/non-finite deltas and inactive/paused runs. Valid deltas are clamped to `0.1` seconds.

The update order is:

1. advance `elapsedSimSeconds`;
2. derive lane count, drone speed, and spawn interval;
3. move every drone right by `droneSpeed * step`;
4. resolve drones whose center crossed `gateX` during this step;
5. if the run remains active, advance the spawn accumulator and spawn at most one ready drone;
6. emit one final state change.

Crossing uses previous and next X, not overlap at the endpoint:

```ts
const crossedGate = previousX < gateX && nextX >= gateX
```

This makes gate resolution independent of frame partitioning for any accepted frame delta.

### Safe pass

When `drone.signal === gateSignals[drone.laneIndex]` at the crossing moment:

- remove the drone;
- increment `safePasses`;
- increment `combo`;
- update `maxCombo`;
- award `calculateSignalSwitchPassPoints(combo)`.

### Wrong gate

When the signals differ:

- remove the drone;
- increment `crashes`;
- set `combo = 0`;
- decrement `integrity` by one;
- award/subtract no score.

If integrity reaches zero, set `outcome='systems-failed'` and delegate once to `BaseGame.end()`. BaseGame synchronously marks the run inactive before its async score save, preventing additional crossing/spawn work from submitting a second end.

Drones are removed at the gate immediately. Exit animations, explosion state, debris, and delayed cleanup are out of scope.

## Scoring

`calculateSignalSwitchPassPoints(comboAfterPass)` in `scoring.ts` is the only production scoring formula for a safe drone:

```text
safeCombo = max(1, floor(comboAfterPass))
bonusSteps = min(safeCombo - 1, 8)
points = 100 + bonusSteps * 20
```

Examples:

| Combo after pass | Points |
|---:|---:|
| 1 | 100 |
| 2 | 120 |
| 5 | 180 |
| 9 | 260 |
| 20 | 260 |

A crash resets combo before the next pass but does not subtract previously earned points. BaseGame time bonus remains disabled.

This directly satisfies the ticket's safe-pass and consecutive-combo scoring without adding a multiplier system or final survival bonus.

## Terminal Outcomes and Presentation

```ts
type SignalSwitchOutcome =
  | 'playing'
  | 'systems-failed'
  | 'survived'
```

On integrity reaching zero:

- overlay title: **`SIGNAL LOST`**
- outcome label: **`Systems failed`**

On timeout, `handleTimeUp()` sets `outcome='survived'` before delegating to BaseGame:

- overlay title: **`SHIFT COMPLETE`**
- outcome label: **`Survived`**

The initializer writes terminal copy explicitly; the page's static overlay title is fallback only.

## Stats and Submitted Game Data

```ts
interface SignalSwitchStats extends BaseGameStats {
  outcome: SignalSwitchOutcome
  safePasses: number
  crashes: number
  maxCombo: number
  integrityRemaining: number
}

interface SignalSwitchGameData {
  safePasses: number
  crashes: number
  maxCombo: number
  integrityRemaining: number
  survivedFullRun: boolean
}
```

`getGameStats()` uses BaseGame's final timer snapshot for elapsed time. `getGameData()` returns the achievement-facing fields above as `Record<string, unknown>` through the established BaseGame override shape.

`src/lib/games/shared/types.ts` re-exports the canonical `SignalSwitchGameData` from the game-local types module and adds it to `GameData`.

## Renderer

`SignalSwitchRenderer` extends `PixiJSRenderer`.

### Static layer

Draw once during setup:

- dark board background;
- four horizontal lane bands/separators;
- gate-zone guide around `gateX`.

### Dynamic layer

Clear and redraw per frame:

- dim overlay over lanes with `laneIndex >= activeLaneCount`;
- gate beam/marker for every active lane;
- each active gate's Circle/Triangle/Diamond marker;
- each drone body and its matching non-color signal marker.

Lane centers are derived from `canvasHeight / maxLanes`; no per-lane Y constants exist.

The renderer owns visual colors only. It does not decide whether a drone passes, mutate gate state, calculate score, run timers, or schedule spawns.

`createSignalSwitchRendererConfig(config)` uses `#signal-switch-canvas`, logical `800×360`, `responsive: false`, antialiasing, and the existing page-level CSS scaling pattern used by Gravity Flip.

## Initializer and Input

`initSignalSwitchGameFramework()` follows the current Gravity Flip/Pattern Pulse conventions:

- require `#signal-switch-container` or route through `DOMElementNotFoundError` + `handleGameError`;
- initialize renderer and destroy it on setup failure;
- create one `SignalSwitchGame` instance;
- forward achievement/challenge results from the game `end` event;
- track all DOM/window listeners for cleanup;
- install/remove an active-run `beforeunload` warning;
- start/cancel one rAF loop;
- return `game`, `renderer`, `getGame()`, `getState()`, and idempotent `cleanup()`;
- leave `window.signalSwitchGame` assignment to the Astro page.

### Controls

The page contains:

```text
#gate-controls
  button[data-signal-lane="0"]
  button[data-signal-lane="1"]
  button[data-signal-lane="2"]
  button[data-signal-lane="3"]
```

One delegated click handler resolves the closest lane button and calls `game.cycleGate(laneIndex)`.

Buttons are native `<button>` elements. `syncControls()`:

- sets current glyph/label text;
- sets `disabled=true` for locked lanes;
- exposes clear `aria-label` text such as `Lane 3 gate, Amber Diamond`.

Desktop document keydown maps `1`, `2`, `3`, `4` to lanes 0–3. It ignores:

- repeated keydown;
- Ctrl/Meta/Alt modified input;
- editable targets;
- button targets, so native focused-button Enter/Space cannot double-trigger.

A successful keyboard gate change calls `preventDefault()`.

No global Space/arrow shortcut is added because the game has four independent controls.

### HUD and announcements

Existing GamePage owns Score and Time. Signal Switch adds:

- `#integrity` — `3 / 3` initially;
- `#combo` — `0` initially;
- `#safe-passes` — `0` initially;
- `#lanes-online` — `2 / 4` initially;
- `#drone-speed` — current rounded px/s.

`#signal-switch-status` is an `aria-live="polite"` region. Announce only discrete events, not every frame:

- lane 3/4 becoming available;
- an integrity loss;
- terminal completion/failure.

Gate button text itself updates after user actions, so there is no need to flood the live region with every gate cycle.

## Page and Catalog Registration

Route: **`/signal-switch`**

Game metadata:

```ts
{
  id: GameID.SIGNAL_SWITCH,
  name: 'Signal Switch',
  description: 'Switch lane gates to match incoming drone signals before impact',
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

Game ID: `signal_switch`

Icon: `🚦`

The shallow placement matches the short reaction-game loop and changes organism partition counts from **6 / 9 / 4** to **7 / 9 / 4**. The last existing shallow specimen is Pattern Pulse (`chain/magenta`), so the new `lattice/teal` entry also preserves the no-adjacent-identical-shape+color invariant.

Create the route before adding the active `GAMES` entry because `games.test.ts` verifies that every active game resolves to an existing Astro page.

`getGameUrl()` and `e2e/games/all-games-navigation.spec.ts` remain source-unchanged; both already derive routes from the registry.

`CLAUDE.md` updates the implemented-game count from 19 to 20, adds Signal Switch to the game list/project tree, and records its PixiJS real-time-game note. `AGENTS.md` remains the existing symlink and is not edited directly.

## Achievements

Add four small achievements through the existing code-defined achievement system:

1. **First Clearance** — score threshold `100`.
2. **Signal Streak** — `maxCombo >= 10`.
3. **Clean Shift** — `survivedFullRun && crashes === 0`.
4. **Traffic Controller** — `survivedFullRun && safePasses >= 40`.

The game supplies all required data in `SignalSwitchGameData`; no achievement service changes are needed.

## Play Again, Reset, and Cleanup

- `Start Game` calls `game.start()`.
- `Reset` calls `game.reset()`, renders/synchronizes the idle state, hides the overlay, and leaves Start visible.
- `Play Again` hides the overlay and calls `game.start()`. BaseGame auto-resets a completed run and immediately starts the next 90-second run.
- Starting/resetting restores gates to Cyan, integrity to 3, two active lanes, empty score/stats, and private simulation/spawn/ID counters.
- The deterministic Lane 1 Magenta drone appears only when the run starts, not in idle state.
- Cleanup cancels rAF, removes tracked listeners, unregisters the end-event handler, destroys renderer, and destroys game exactly once.

## Testing Strategy

### Pure scoring tests

Lock combo points at 1, 2, 5, 9, and above-cap combos, plus invalid/negative input normalization.

### Game unit tests

Cover:

- exact idle defaults and the fixed first drone;
- gate cycle order and inactive/locked-lane rejection;
- lane 3/4 unlock boundaries;
- linear speed/cadence ramp endpoints;
- matched crossing awards points and increments combo/max combo;
- mismatched crossing decrements integrity and resets combo without subtracting score;
- third crash ends exactly once with `systems-failed`;
- timeout uses `survived`;
- crossing detection works when one accepted frame moves a drone from before to beyond the gate;
- random spawns use only free lanes;
- random signals differ from that lane's current gate at spawn;
- all-busy traffic defers without a catch-up burst or RNG reads;
- reset restores private counters and the next run gets `drone-0` as the deterministic first drone.

### Renderer tests

Verify:

- setup creates static/dynamic graphics and uses the configured container;
- render accepts Signal Switch state and draws active gates/drones;
- Circle/Triangle/Diamond marker paths are distinct rather than color-only;
- inactive lanes are rendered as locked/dimmed;
- cleanup is idempotent through the existing renderer lifecycle.

### Initializer tests

Use jsdom + fake rAF to verify:

- missing-container error path;
- idle render/HUD before Start;
- delegated button clicks cycle only active lanes;
- keys 1–4 map to active lanes and ignore editables/modifiers/repeats/button targets;
- focused native buttons do not double-cycle;
- lane buttons unlock at the game state boundary;
- live-region integrity/lane-unlock/terminal messages;
- failure and survival terminal copy;
- Reset returns to idle;
- Play Again immediately starts a fresh run;
- active-run unload warning and cleanup removal;
- repeated cleanup destroys/cancels once.

### Markup/registry/achievement tests

Extend existing suites for the route, stable IDs, GameID/icon, organism counts `7 / 9 / 4`, shared game-data union, four lane buttons, no Pause/End controls, initial 90-second GamePage time, and four achievements.

### Browser smoke

Add one Signal Switch journey to `e2e/games/play-coverage.spec.ts`:

1. open `/signal-switch` at a mobile-width-capable normal browser viewport;
2. assert idle `3 / 3` integrity, `2 / 4` lanes, Start, and four gate buttons;
3. start the game;
4. click Lane 1 once so Cyan → Magenta;
5. use `window.signalSwitchGame.game.update(...)` only through the exposed debug handle to advance the deterministic first drone across the gate without waiting real seconds;
6. assert safe passes `1`, combo `1`, score `100`, and integrity unchanged;
7. reset/restart and intentionally leave the first gate Cyan, advancing enough deterministic first-drone crossings across three fresh test-state setups or a narrow unit-facing debug sequence to reach failure without a long wall-clock wait;
8. assert `SIGNAL LOST`, then Play Again re-arms an active fresh run.

Keep browser logic short; detailed matching/crash/lane-unlock behavior belongs in Vitest. The E2E goal is route + real controls + Pixi bootstrap + lifecycle integration, not a 90-second soak.

Add a `375×812` viewport assertion that the four gate controls remain reachable in a 2×2 layout and the canvas has no horizontal overflow.

## Manual-Play Tuning Checkpoint

Before final implementation gates, play at least one full run and answer:

1. Does the first Lane 1 Magenta drone give enough time to understand the switch interaction?
2. Around 30 seconds, do three lanes feel busier without becoming frantic?
3. Around 60 seconds, is four-lane play readable at the current speed/cadence?
4. Are two-tap signal changes still comfortably possible for a newly spawned late-run drone?
5. Is 40 safe passes achievable by a strong full-run player, making Traffic Controller meaningful rather than impossible?

If tuning changes are needed, change only rule/scoring constants and exact-value tests unless play reveals a genuine structural flaw.

## Load-Bearing Risks and Mitigations

- **Same-lane impossible traffic:** spawn only into lanes with no unresolved drone.
- **Zero-action drones:** random signal candidates exclude the selected lane's current gate.
- **Frame tunneling past the gate:** resolve on previous-X → next-X crossing, not endpoint overlap.
- **Background-tab difficulty jump:** ramp from private simulated time, not Date.now/GameTimer elapsed.
- **Catch-up spawn burst:** defer one ready spawn while all lanes are occupied; never replay missed intervals.
- **Double input from focused buttons:** document keyboard handler ignores button targets.
- **Color-only interaction:** every signal has a stable glyph/shape and text label in both controls and canvas markers.
- **Double end/save on simultaneous crossings:** BaseGame marks inactive synchronously; stop processing once integrity reaches zero.
- **Route registration before page exists:** activate the GAMES record only after `/signal-switch` is created.
- **Canvas distortion on narrow screens:** use the same inline width/height override plus page CSS aspect scaling already proven in Gravity Flip.
- **Over-generalization:** no shared lane/spawner/input abstraction in HPA-71.

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

Tests are added beside the game plus the existing registry, achievement, organism, markup, and Playwright suites.

Expected to remain production-unchanged:

- `src/lib/games/core/BaseGame.ts`
- `src/lib/games/core/GameTimer.ts`
- `src/lib/games/core/ScoreManager.ts`
- `src/lib/games/core/GameInitializer.ts`
- `src/lib/games/renderers/PixiJSRenderer.ts`
- `src/lib/games/shared/utils.ts`
- `src/lib/services/scoreService.ts`
- `src/lib/server/db/**`
- `src/pages/api/**`
- `src/lib/auth*`
- `e2e/games/all-games-navigation.spec.ts`

## Acceptance Mapping

- **Home page card/link:** active `GAMES` entry with route, icon, duration, difficulty, organism/depth.
- **Start/play/lose/complete/restart:** BaseGame lifecycle + integrity failure + timeout survival + Play Again.
- **Score submission:** existing BaseGame/ScoreManager final save path.
- **Desktop/mobile:** number keys plus four native touch buttons and responsive Pixi canvas.
- **Increasing speed/lane count:** simulation-time speed/cadence interpolation and 30s/60s lane unlocks.
- **Safe-pass/combo scoring:** single pure pass scorer and reset-on-crash combo.
- **Wrong-gate consequence:** three-point integrity system ending the run on the third crash.

## YAGNI Boundary

HPA-71 ships the smallest complete Signal Switch loop. Do not add shared frameworks, procedural waves, difficulty menus, special drone types, canvas touch coordinate mapping, persistence, schema changes, new APIs, audio/haptics, or generalized real-time infrastructure. If a later minigame proves a real common abstraction, extract it then with at least two concrete consumers.