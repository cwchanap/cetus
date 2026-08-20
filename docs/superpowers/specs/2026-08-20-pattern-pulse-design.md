# Pattern Pulse — Design Spec

- **Linear issue:** [HPA-74 — Minigame: Pattern Pulse](https://linear.app/cwchanap/issue/HPA-74/minigame-pattern-pulse)
- **Date:** 2026-08-20
- **Status:** Planning draft, ready for implementation

## Overview

Pattern Pulse is a one-minute visual memory game. Four signal pads represent distinct symbols. The game flashes an ordered sequence, then the player repeats that sequence by tapping/clicking the pads or pressing number keys. Every successful round appends one new signal. A wrong input consumes one mistake, breaks the success streak, and replays the same sequence. The run ends when the 60-second timer expires or the player reaches three mistakes.

Version 1 deliberately uses **visual + symbolic cues only**. HPA-74 allows “lights, symbols, or sounds”; adding Web Audio would introduce mute/autoplay/accessibility and test behavior without being required for the game loop. Each pad therefore has a stable number and symbol in addition to its color/animation.

Pattern Pulse fits the existing framework cleanly. It is event-driven, needs one countdown, has no continuous physics, and renders a fixed four-button surface. The implementation uses `BaseGame + DOMRenderer`, following the existing lifecycle/score/achievement seams used by Memory Matrix and Mine Grid. It does not add a PixiJS loop, a generic sequence-game framework, a second timer abstraction, or new persistence/API behavior.

## Product Goals

- Deliver a recognizable repeat-the-pattern memory game that completes in about one minute.
- Make the core loop immediately understandable: **watch → repeat → feedback → longer sequence**.
- Reward the three scoring dimensions requested by HPA-74: completed sequences, consecutive success streaks, and fast responses.
- Give players a recoverable mistake model rather than ending the first time they mis-tap.
- Work equally well with touch, mouse, native button activation, and desktop `1`–`4` shortcuts.
- Reuse existing Cetus timer, score submission, run-staleness, achievements, page, and leaderboard/progress infrastructure.
- Keep random generation and response timing deterministic in unit tests with two narrow injected functions.

## Non-Goals

Version 1 intentionally does **not** include:

- sound effects, music, Web Audio, or microphone input;
- haptics/vibration;
- configurable difficulty modes or pad counts;
- custom sequence packs or authored levels;
- anti-repeat rules that prevent the same pad appearing twice in a row;
- per-input timeouts separate from the 60-second run timer;
- pause/resume during sequence playback;
- a lives/economy/assist system;
- Daily Challenge, seeded share codes, or persistence/resume;
- PixiJS/canvas rendering;
- a generic “sequence game” engine shared with future games;
- new database tables, migrations, score endpoints, or leaderboard modes.

## Approaches Considered

### A. `BaseGame + DOMRenderer` with four semantic buttons — **selected**

This matches the actual problem: a fixed four-pad interaction surface driven by discrete events and timeouts. `BaseGame` already owns the countdown, score submission, final timer snapshot, reset behavior, and stale async save protection. `DOMRenderer` supplies the existing renderer lifecycle and container access without requiring a canvas.

Advantages:

- smallest implementation surface;
- native touch/mouse/keyboard semantics;
- deterministic game logic remains independent from presentation;
- no requestAnimationFrame loop;
- no new platform abstractions.

### B. PixiJS four-pad renderer

PixiJS could animate the pulses, but it would require custom hit testing, canvas accessibility alternatives, resize behavior, and a render loop for a board that never changes shape. That is more code for no meaningful gameplay benefit.

### C. Generic reusable Simon/sequence engine

A generic sequence engine could model pad count, cue providers, playback policies, and scoring plugins. Cetus currently has one game requiring this behavior. Creating a framework now would move product-specific decisions into a premature abstraction and slow iteration.

## Fixed Gameplay Rules

### Run constants

| Rule | Value |
|---|---:|
| Run duration | 60 seconds |
| Pads | 4 |
| Initial sequence length | 3 |
| Mistake limit | 3 |
| Initial pulse duration | 600 ms |
| Pulse speed-up | 40 ms per completed round |
| Minimum pulse duration | 320 ms |
| Gap between pulses | 140 ms |
| Delay before playback | 400 ms |
| Correct/wrong round feedback | 500 ms |

Playback pulse duration is derived from already-completed rounds:

```ts
pulseMs = Math.max(320, 600 - completedRounds * 40)
```

The 60-second BaseGame countdown continues through **watch**, **input**, and **feedback** phases. Playback time is part of the run; there is no second “active input time” clock.

### Sequence generation

A sequence item is one of four integer pad IDs:

```ts
type PatternPad = 0 | 1 | 2 | 3
```

The first fresh state contains three independently generated pads. Each successful round appends exactly one independently generated pad.

Production uses `Math.random`; tests inject `rng: () => number`. Generation is intentionally unbiased and allows consecutive duplicate pad values. Preventing repeats would create a different distribution and is not required for a readable four-pad Simon-style game.

RNG consumption is part of the deterministic contract:

- fresh state creation consumes exactly `initialSequenceLength` RNG values;
- each completed round consumes exactly one additional RNG value when the new pad is appended;
- playback, accepted inputs, and wrong attempts consume no RNG values;
- Reset creates a fresh state and therefore consumes a fresh `initialSequenceLength` values.

### Phase model

```ts
type PatternPulsePhase = 'idle' | 'watch' | 'input' | 'feedback' | 'ended'
```

The only accepted player inputs occur in `input`.

1. **Idle:** fresh sequence exists but is not revealed.
2. **Watch:** input is disabled and the game flashes the complete current sequence.
3. **Input:** player repeats the sequence from index 0.
4. **Feedback:** one short correct/wrong round result is shown.
5. **Ended:** timer expired or mistake limit reached.

### Successful round

For every correct pad:

- advance `inputIndex`;
- accumulate elapsed response time since input opened or the previous accepted correct input;
- do not award score yet.

When the final pad is correct:

1. compute this round's average response time;
2. increment `completedRounds`;
3. increment `streak` and update `maxStreak`;
4. update `longestSequence` to the just-completed sequence length;
5. award the pure round score;
6. enter `feedback='correct'` for 500 ms;
7. append one new random pad;
8. replay the now-longer sequence.

### Wrong input

A wrong pad ends only the current **attempt**, not the run unless it is the third mistake:

1. increment `mistakes`;
2. set `streak = 0`;
3. discard current-attempt response timing;
4. enter `feedback='wrong'` with the pressed pad identified visually;
5. if `mistakes < 3`, replay the **same sequence** after feedback;
6. if `mistakes === 3`, end the run with outcome `mistakes`.

A wrong attempt never grows the sequence and never awards partial score.

### Timeout

When the BaseGame timer reaches zero in any active phase:

- cancel the one pending Pattern Pulse scheduled callback;
- set phase `ended`;
- set outcome `timeout`;
- clear the active pad/feedback cue;
- emit the final state;
- delegate to `BaseGame.handleTimeUp()` / `end()`.

The player keeps all score earned from already-completed sequences. Later advancement of fake/browser time must not reopen input or light another pad.

## Scheduling Model

Pattern Pulse needs short browser timeouts for cue playback, but it does **not** need a custom game clock.

`PatternPulseGame` owns at most one scheduled browser timeout:

```ts
private scheduledTimeoutId: ReturnType<typeof setTimeout> | null = null
```

A small private `schedule(callback, delayMs)` helper first clears the previous ID, then schedules the next phase transition. Playback proceeds one edge at a time:

```text
pre-play delay
→ light pad
→ clear pad
→ gap
→ next pad
→ ...
→ input phase
```

This avoids an array of timeout IDs and makes reset/end/cleanup cancellation a single operation.

`reset()`, terminal mistakes, timeout, and `cleanup()` clear the pending callback. No delayed callback from an old round is allowed to mutate a fresh or ended run.

Vitest fake timers drive this scheduling in unit tests; timer functions are not dependency-injected. `vi.runAllTimers()` is allowed only after Reset has stopped BaseGame's countdown interval. Active-run tests advance fake time in bounded increments.

## Response-Time Measurement

The game config accepts a tiny clock seam:

```ts
now: () => number
```

Production defaults to `Date.now`. Unit tests inject exact millisecond values.

Clock sampling sites are frozen rather than incidental:

1. call `now()` exactly once when entering the `input` phase;
2. call `now()` exactly once for each **accepted correct** pad;
3. playback and the wrong-pad branch do not sample `now()`;
4. timing accumulated before a later wrong pad is discarded with that failed attempt.

For an accepted correct pad:

```ts
const nowMs = now()
responseMs = Math.max(0, nowMs - lastInputAtMs)
lastInputAtMs = nowMs
```

The round score uses the average of these correct response durations only after the whole sequence is completed. Tests assert the expected clock call count so the scoring contract cannot silently change because of unrelated extra reads.

There is no server-side anti-cheat or response-time validation in HPA-74; this uses the same client-trusted score model as existing Cetus games.

## Scoring

Scoring is one pure function in `scoring.ts`.

For a completed sequence:

```text
completionPoints = sequenceLength * 100
streakBonus     = max(0, streak - 1) * 50
speedBonus      = clamp(200 - floor(averageResponseMs / 5), 0, 200)
roundScore      = completionPoints + streakBonus + speedBonus
```

Examples:

| Sequence | Streak | Avg response | Round score |
|---:|---:|---:|---:|
| 3 | 1 | 500 ms | 400 |
| 4 | 2 | 400 ms | 570 |
| 6 | 4 | 250 ms | 900 |
| 8 | 1 | 1200 ms | 800 |

`BaseGame` is configured with `timeBonus: false`. There is no end-of-run time bonus because a normal run already uses the same 60-second boundary; speed is rewarded directly at the per-round response seam.

Mistakes do not directly subtract points. Their cost is lost time, a reset streak, and eventual early termination. This keeps the scoring model easy to explain and avoids double-penalizing an already-limited mistake budget.

## State, Stats, and Submitted Data

```ts
type PatternPulseOutcome = 'playing' | 'timeout' | 'mistakes'
type PatternPulseFeedback = 'correct' | 'wrong' | null

interface PatternPulseState extends BaseGameState {
  phase: PatternPulsePhase
  outcome: PatternPulseOutcome
  sequence: PatternPad[]
  inputIndex: number
  activePad: PatternPad | null
  feedback: PatternPulseFeedback
  completedRounds: number
  mistakes: number
  streak: number
  maxStreak: number
  longestSequence: number
}
```

Private runtime-only timing/scheduler fields stay off state:

- pending timeout ID;
- playback index;
- `lastInputAtMs`;
- total response milliseconds for the current attempt.

Stats:

```ts
interface PatternPulseStats extends BaseGameStats {
  outcome: PatternPulseOutcome
  completedRounds: number
  longestSequence: number
  mistakes: number
  maxStreak: number
}
```

Both terminal outcomes are completed runs. `getGameStats()` reports:

```ts
gameCompleted: this.state.isGameOver
```

This matches the existing BaseGame sibling convention and means a scored three-mistake finish is not mislabeled as incomplete.

Achievement/submission data stays minimal:

```ts
interface PatternPulseGameData {
  completedRounds: number
  longestSequence: number
  mistakes: number
  maxStreak: number
}
```

There is **no `perfectRun` field**. `Clean Signal` checks `completedRounds >= 3 && mistakes === 0` directly, avoiding a second derived boolean with competing semantics.

The generated sequence and response timestamps are not persisted.

## Architecture

### File structure

```text
src/lib/games/pattern-pulse/
  types.ts
  scoring.ts
  scoring.test.ts
  PatternPulseGame.ts
  PatternPulseGame.test.ts
  PatternPulseRenderer.ts
  PatternPulseRenderer.test.ts
  initFramework.ts
  initFramework.test.ts
src/pages/pattern-pulse/index.astro
```

Platform files modified during registration:

```text
src/lib/games.ts
src/lib/games.test.ts
src/lib/games/shared/types.ts
src/lib/achievements.ts
src/lib/achievements.test.ts
src/pages/game-board-markup.test.ts
e2e/games/play-coverage.spec.ts
CLAUDE.md
```

No core game, renderer-framework, database, API, auth, or score-service source file needs to change.

### `types.ts`

Owns Pattern Pulse pad IDs, phase/outcome/feedback, config, state/stats/game-data contracts, and fixed timing constants.

### `scoring.ts`

Owns only the per-completed-round score calculation and clamping. It does not mutate game state or call `ScoreManager`.

### `PatternPulseGame.ts`

Extends `BaseGame<PatternPulseState, PatternPulseConfig, PatternPulseStats>` and owns:

- fresh 3-pad sequence generation;
- watch/input/feedback phase transitions;
- one-at-a-time cue scheduling;
- input validation through `pressPad(pad)`;
- streak/mistake/round accounting;
- response-time measurement at the frozen sampling sites;
- sequence growth after success;
- replay of the same sequence after a recoverable error;
- terminal mistake handling;
- timeout cleanup;
- `getGameStats()` and `getGameData()`.

`update()` and `render()` are no-ops because the game is event-driven.

### `PatternPulseRenderer.ts`

Extends `DOMRenderer` and mounts to `#pattern-pulse-board`.

The four pads are **Astro-owned static children**. This differs from Mine Grid/Memory Matrix, whose renderers create and own their dynamic cells/cards. Pattern Pulse therefore uses `DOMRenderer` for setup/container helpers but does not adopt its child-destruction behavior.

The renderer:

- verifies the four `button[data-pattern-pad]` nodes exist during `setup()`;
- installs one delegated `click` listener on the board container;
- exposes `setPadPressCallback((pad) => void)`;
- enables buttons only during `input`;
- toggles `data-active` for the current playback pad;
- toggles a wrong-feedback attribute on the pressed bad pad;
- in `cleanup()`, removes the delegated listener and resets pad runtime attributes/disabled state;
- **does not call `super.cleanup()`**, because `DOMRenderer.cleanup()` clears the container and would delete the Astro-owned buttons.

Pattern Pulse sets neither `responsive` nor `containerClass`, so skipping `DOMRenderer.cleanup()` leaves no DOMRenderer-owned resize listener/class behind. `DOMRenderer.ts` itself remains unchanged.

`destroy()` must leave all four pad nodes in the DOM. A renderer may then be re-initialized against the same Astro fixture without recreating the buttons.

There are no per-pad listeners and no `innerHTML` rendering.

### `initFramework.ts`

The initializer follows the current Mine Grid framework wiring rather than introducing a new generic initializer. It:

- guards `#pattern-pulse-container` using the existing error path;
- initializes one `PatternPulseRenderer` and one `PatternPulseGame`;
- wires Start, Reset, and Play Again;
- maps renderer clicks to `game.pressPad()`;
- maps desktop keys `1`, `2`, `3`, `4` to pads `0`, `1`, `2`, `3` while ignoring editable elements;
- updates timer, score, sequence length, completed rounds, streak, mistakes, and phase prompt;
- shows final outcome/stats through the existing GamePage overlay;
- forwards BaseGame achievement/challenge events;
- protects active runs with the established `beforeunload` pattern;
- removes every initializer-owned listener and destroys renderer/game exactly once;
- exposes `window.patternPulseGame` with `getGame()`, `getState()`, `restart()`, and `cleanup()` for browser smoke/debug use.

No second run guard is added; `BaseGame` already protects stale async score completion.

## Input and Accessibility

Each button has three independent identity cues:

| Pad | Shortcut | Symbol |
|---:|---|---|
| 1 | `1` | ▲ |
| 2 | `2` | ● |
| 3 | `3` | ◆ |
| 4 | `4` | ✦ |

Color and glow reinforce these cues but are never the only differentiator.

Mouse/touch uses native button click/tap behavior. `1`–`4` activate the corresponding pad during input. Enter/Space naturally activate a focused enabled pad. Global numeric shortcuts do nothing when focus is in `input`, `textarea`, `select`, or a content-editable element. No custom arrow-key focus grid is added.

The page contains an `aria-live="polite"` status node with stable phase copy:

- `READY`
- `WATCH`
- `REPEAT`
- `CORRECT`
- `WRONG — WATCH AGAIN`
- `TIME`
- `SIGNAL LOST`

The status text, active-pad scale/border animation, and symbols together make state changes understandable without sound.

## Page and DOM Contract

`src/pages/pattern-pulse/index.astro` uses `GamePage` with:

```text
gameId="pattern-pulse"
title="Pattern Pulse"
icon="🔁"
showPause={false}
showEnd={false}
initialTime={60}
```

Stable IDs:

- `#pattern-pulse-container` — initializer outer-shell guard;
- `#pattern-pulse-board` — renderer container;
- `#pattern-status` — live phase feedback;
- `#sequence-length` — current sequence size;
- `#completed-rounds` — completed sequences;
- `#streak` — current successful-round streak;
- `#mistakes` — `n / 3` display;
- `#final-outcome`, `#final-rounds`, `#final-longest-sequence`, `#final-max-streak`, `#final-mistakes` — result overlay values.

Static four-pad HTML and styling live in Astro. TypeScript changes runtime attributes/text only.

## Platform Integration

### Game registry

Add:

```ts
GameID.PATTERN_PULSE = 'pattern_pulse'
```

Registry entry:

```ts
{
  id: GameID.PATTERN_PULSE,
  name: 'Pattern Pulse',
  description: 'Memorize and repeat an accelerating four-pad signal sequence',
  category: 'puzzle',
  maxPlayers: 1,
  estimatedDuration: '1 minute',
  difficulty: 'medium',
  tags: ['memory', 'sequence', 'timing', 'single-player', 'cognitive'],
  isActive: true,
  organism: { shape: 'chain', color: 'magenta' },
  depth: 'shallow',
}
```

`getGameIcon(GameID.PATTERN_PULSE)` returns `🔁`. `getGameUrl()` remains unchanged; its current underscore-to-hyphen rule already derives `/pattern-pulse`.

The `/pattern-pulse` page must exist before registry activation because `games.test.ts` requires every active registry entry to resolve to an existing Astro route. `all-games-navigation.spec.ts` derives targets from `GAMES`; no source edit is required there.

### Shared game-data type

`src/lib/games/shared/types.ts` aliases the canonical Pattern Pulse type and adds it to `GameData`:

```ts
export type PatternPulseGameData =
  import('../pattern-pulse/types').PatternPulseGameData
```

`AchievementCheckData` includes the same type.

### Achievements

Add four deliberately small achievements:

1. **First Pulse** (`pattern_pulse_welcome`) — score threshold `1`.
2. **In Sync** (`pattern_pulse_streak_3`) — `maxStreak >= 3`.
3. **Long Memory** (`pattern_pulse_sequence_8`) — `longestSequence >= 8`.
4. **Clean Signal** (`pattern_pulse_perfect`) — `completedRounds >= 3 && mistakes === 0`.

No achievement requires server/schema changes; all use the existing score submission game-data payload.

## Testing Strategy

### Pure scoring tests

Lock sequence-length points, no first-success streak bonus, increasing streak bonus, speed maximum/zero floor, and exact representative formula values.

### Game state-machine tests

Use injected RNG, injected `now`, and Vitest fake timers to prove:

- fresh construction consumes exactly three RNG values and produces the expected three-pad sequence;
- playback consumes no RNG and no response-clock reads;
- a correct full repeat samples `now()` exactly once at input-open plus once per accepted correct pad;
- a successful round scores once, increments streak/rounds, consumes exactly one additional RNG value, appends one pad, and speeds playback;
- a wrong pad itself consumes neither RNG nor `now()`, increments mistakes, breaks streak, scores nothing, and replays the same sequence;
- the third mistake ends the run and `gameCompleted` is true after BaseGame end processing;
- **timeout while playback still has a queued cue** clears that cue; advancing a full later playback budget leaves `phase='ended'`, `outcome='timeout'`, `activePad=null`, the earned score unchanged, and `pressPad()` rejected;
- reset during a pending cue cannot mutate the fresh state;
- repeated-pad sequences are accepted;
- submitted game data reports only rounds, longest sequence, mistakes, and max streak.

### Renderer tests

Prove:

- exactly four static pad buttons are consumed;
- one delegated click maps `data-pattern-pad` to `0..3`;
- clicks are ignored outside input phase;
- active/wrong attributes follow state;
- button enabled state follows phase;
- `destroy()` removes the delegated listener **without deleting any of the four Astro-owned buttons**;
- the renderer can initialize again against the same preserved static board.

### Initializer/page tests

Lock missing-container error handling, Start, renderer click + `1`–`4` shortcuts, editable-target suppression, HUD/time/score updates, Reset/Play Again idle presentation, achievement/challenge forwarding, beforeunload handling, idempotent cleanup, the two-container/four-button page contract, and the root-level initializer script.

### Browser smoke

Add one Pattern Pulse case to `e2e/games/play-coverage.spec.ts`:

1. open `/pattern-pulse`;
2. Start;
3. use `window.patternPulseGame.getState()` to read the random sequence only for test automation;
4. wait until phase is `input`;
5. click that sequence and assert `completed-rounds` becomes `1`;
6. wait for the next input phase and submit its first correct pad with the numeric keyboard shortcut;
7. Reset and assert status returns to `READY` and sequence length returns to `3`.

Do not make Playwright sleep for hard-coded playback timings; poll the debug state/DOM phase.

`e2e/games/all-games-navigation.spec.ts` remains unchanged and automatically verifies homepage → Pattern Pulse and Pattern Pulse → Home after the registry entry is active.

## Required Regression Gates

```bash
bun run test:run src/lib/games/pattern-pulse
bun run test:run src/lib/games.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
bun run test:coverage
```

Current `codecov.yml` requires both project and patch coverage to be at least **90%** with zero threshold leniency.

## Risks and Mitigations

### Static pad ownership vs renderer cleanup

**Risk:** `DOMRenderer.cleanup()` clears its mount. Calling it from Pattern Pulse would delete the Astro-owned buttons and make reinitialization fail.

**Mitigation:** Pattern Pulse cleanup is deliberately listener/attribute-only and does not call `super.cleanup()`. The renderer sets no responsive/container-class options, so no DOMRenderer-owned resources need separate teardown. Renderer tests destroy/reinitialize the same static board.

### Stale scheduled playback after reset/timeout

**Risk:** a queued cue from the previous phase could light a pad or open input after the run is reset or timed out.

**Mitigation:** exactly one Pattern Pulse timeout exists at a time; reset, terminal outcome, timeout, and cleanup all clear it. Separate tests cover both reset and a one-second timeout while playback still has queued work, then advance additional fake time and prove the state stays ended/idle.

### Clock/RNG call-site drift

**Risk:** extra `now()` or `rng()` reads could silently change deterministic scoring/generation tests.

**Mitigation:** sampling sites are part of the v1 contract and tests assert call counts: initial state + one pad per success for RNG; input-open + accepted correct pads for `now()`.

### Async score save races with restart

**Risk:** an older run's score request could complete after a newer run starts.

**Mitigation:** reuse BaseGame's existing run guard. Do not add another Pattern Pulse token/counter.

### Random browser sequence makes E2E brittle

**Risk:** a fixed Playwright click sequence would occasionally be wrong.

**Mitigation:** browser smoke reads the existing debug handle's current sequence and waits on phase, without changing production generation or adding a test-only route/query parameter.

### Playback becomes too slow for a one-minute game

**Risk:** long sequences consume the whole run before the player can meaningfully respond.

**Mitigation:** pulse duration drops by 40 ms per completed round to a 320 ms floor while the gap stays 140 ms. The timer intentionally includes playback, keeping all players on the same 60-second budget.

### Color-only memory cue

**Risk:** pads would be difficult to distinguish for some players.

**Mitigation:** every pad has a stable number and distinct geometric symbol, and active state changes use scale/border/glow in addition to color.

## Acceptance Criteria Mapping

| HPA-74 acceptance | Design ownership |
|---|---|
| Appears on home page with icon, duration, difficulty, Play Now | `GameID`/`GAMES`/icon + `/pattern-pulse` route; catalog navigation is registry-derived |
| Start, play, fail or complete timed run, restart | BaseGame lifecycle + three-mistake outcome + 60-second timeout + Reset/Play Again |
| Final score uses existing leaderboard/progress flow when logged in | BaseGame `ScoreManager.saveFinalScore()` unchanged |
| Desktop and mobile controls | semantic four-button surface + `1`–`4` shortcuts + native touch/click |
| Increasing sequence | append exactly one pad after each success |
| Clear correct/incorrect feedback | phase live text + active/wrong visual attributes |
| Score completed sequences, streaks, fast responses | pure per-round scoring formula |
| End after configured mistakes or timer | mistake limit `3` + BaseGame `60s` countdown |

## Scope Boundary

HPA-74 is complete when the fixed four-pad, one-minute Pattern Pulse game is playable, registered, score/achievement integrated, tested, and documented. Audio, difficulty settings, additional pad layouts, Daily variants, persistence, generic sequence abstractions, and backend changes remain separate future work only if product needs justify them.