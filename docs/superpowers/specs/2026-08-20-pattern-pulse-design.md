# Pattern Pulse — Design Spec

- **Linear issue:** [HPA-74 — Minigame: Pattern Pulse](https://linear.app/cwchanap/issue/HPA-74/minigame-pattern-pulse)
- **Date:** 2026-08-20
- **Status:** Planning draft, ready for implementation

## Overview

Pattern Pulse is a one-minute visual memory game. Four signal pads represent distinct symbols. The game flashes an ordered sequence, then the player repeats it by tapping/clicking the pads or pressing number keys. Every successful round appends one signal. A wrong input consumes one mistake, breaks the success streak, and replays the same sequence. The run ends when the 60-second timer expires or the player reaches three mistakes.

Version 1 uses **visual + symbolic cues only**. HPA-74 allows lights, symbols, or sounds; adding audio would add autoplay/mute/accessibility/test behavior without being required for the core loop. Each pad therefore has a stable number and symbol in addition to its visual pulse.

The implementation stays on the existing `BaseGame + DOMRenderer` seams. It does not add a PixiJS loop, a generic sequence-game framework, a second timer abstraction, a new run guard, or backend persistence/API changes.

## Product Goals

- Deliver a recognizable **watch → repeat → feedback → longer sequence** loop in about one minute.
- Reward completed sequences, consecutive successful rounds, and faster responses.
- Make mistakes recoverable until the third miss.
- Preserve native touch/mouse/button keyboard behavior and add desktop `1`–`4` shortcuts.
- Reuse BaseGame countdown, score submission, final stats, stale-save protection, achievements, and existing GamePage/catalog infrastructure.
- Keep random generation deterministic in unit tests through one injected `rng: () => number` seam.

## Non-Goals

Version 1 does **not** include:

- audio, music, Web Audio, microphone input, or haptics;
- difficulty modes, configurable pad counts, or authored sequence packs;
- anti-repeat generation rules;
- per-input timers separate from the 60-second run timer;
- pause/resume during playback;
- assists/economy/progression;
- Daily/seed-sharing/persistence/resume;
- PixiJS/canvas rendering;
- a generic sequence engine;
- database, score API, or leaderboard changes.

## Reuse Decisions

### BaseGame + DOMRenderer

Pattern Pulse is event-driven and has one countdown, one score, and a fixed four-button board. `BaseGame` already owns the timer, score save, final-timer snapshot, reset behavior, and stale async-save guard. `DOMRenderer` provides the existing container/listener helpers. A Pixi loop would add hit testing and canvas accessibility for no gameplay benefit.

### Custom `initFramework.ts`, not `GameInitializer`

Pattern Pulse follows Mine Grid/Memory Matrix-style custom initialization because it needs game-specific pad shortcuts, phase/HUD copy, and static-child renderer ownership. The repository's generic `src/lib/games/core/GameInitializer.ts` currently has no production game importers; Pattern Pulse does not revive it or refactor/delete it as part of HPA-74.

### Direct `Date.now()`, not an injected clock

Reaction-time code already uses plain `Date.now()` elsewhere in Cetus, and Vitest fake timers control Date. Pattern Pulse therefore injects only RNG. Unit tests advance fake time between accepted inputs to verify speed scoring through the real timing path.

## Fixed Gameplay Rules

The product requirements are frozen here. In production code, `PATTERN_PULSE_TIMING` in `types.ts` is the single timing source; page/initializer code must not duplicate these gameplay values.

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
| Correct/wrong feedback | 500 ms |

Playback duration is:

```ts
pulseMs = Math.max(320, 600 - completedRounds * 40)
```

The BaseGame countdown continues through watch, input, and feedback. Playback time is part of the run.

### Sequence generation

```ts
type PatternPad = 0 | 1 | 2 | 3
```

A fresh state creates exactly three independently generated pads. Tests may assert the initial RNG call count is three to catch accidental double-generation. Each successful round appends one independently generated pad. Consecutive duplicates are legal. A recoverable mistake replays the existing sequence unchanged rather than generating a replacement.

Production defaults to `Math.random`; tests inject `rng: () => number`. Ice Slide's seeded RNG is intentionally unrelated because seeded/Daily Pattern Pulse is a non-goal.

### Phase model

```ts
type PatternPulsePhase = 'idle' | 'watch' | 'input' | 'feedback' | 'ended'
```

Player input is accepted only during `input`.

1. **Idle** — fresh sequence exists, not shown.
2. **Watch** — input is gated while the full sequence flashes.
3. **Input** — player repeats from index 0.
4. **Feedback** — short correct/wrong result.
5. **Ended** — timer expired or mistake limit reached.

### Successful round

For each accepted correct pad:

- record elapsed response time from the prior accepted point using `Date.now()`;
- advance `inputIndex`;
- do not score partial progress.

When the final pad is correct:

1. calculate average response time for the completed attempt;
2. increment `completedRounds`;
3. increment `streak` and update `maxStreak`;
4. update `longestSequence`;
5. award the pure round score;
6. show correct feedback for 500 ms;
7. append one new random pad;
8. replay the longer sequence.

### Wrong input

A wrong pad:

1. increments `mistakes`;
2. resets `streak` to 0;
3. discards response timing collected for that failed attempt;
4. shows wrong feedback on the pressed pad;
5. replays the same sequence if mistakes remain;
6. ends the run with outcome `mistakes` on the third miss.

Wrong attempts do not award or subtract points.

### Timeout

When BaseGame reaches zero in any active phase, Pattern Pulse clears its one pending scheduled callback, sets `phase='ended'`, `outcome='timeout'`, `activePad=null`, clears feedback, emits final state, and delegates to the BaseGame end path. Later timer advancement must not light another pad or reopen input.

## Scheduling Model

Pattern Pulse owns at most one scheduled browser timeout:

```ts
private scheduledTimeoutId: ReturnType<typeof setTimeout> | null = null
```

Playback advances one edge at a time:

```text
pre-play delay
→ light pad
→ clear pad
→ gap
→ next pad
→ ...
→ input
```

`schedule()` clears the previous Pattern Pulse timeout before registering the next one. Reset, terminal mistakes, timeout, and cleanup clear it. BaseGame remains the only run clock.

Vitest fake timers drive scheduling. Active-run tests use bounded `advanceTimersByTime`; `runAllTimers` is allowed only after Reset has stopped BaseGame's countdown interval.

## Response-Time Measurement

Response timing uses direct `Date.now()`:

```ts
// entering input
lastInputAtMs = Date.now()

// accepted correct pad
const nowMs = Date.now()
responseTotalMs += Math.max(0, nowMs - lastInputAtMs)
lastInputAtMs = nowMs
```

The average includes correct-pad response durations only after a full successful sequence. Timing collected before a later wrong pad is discarded with that failed attempt.

Tests control Date with the existing Vitest fake timers and advance fake time between `pressPad()` calls. They verify score/output behavior rather than pinning incidental Date read counts.

## Scoring

`calculatePatternPulseRoundScore()` in `scoring.ts` is the **single production scoring authority**. Other runtime modules call it rather than re-encoding the formula.

For a completed sequence:

```text
completionPoints = sequenceLength * 100
streakBonus      = max(0, streak - 1) * 50
speedBonus       = clamp(200 - floor(averageResponseMs / 5), 0, 200)
roundScore       = completionPoints + streakBonus + speedBonus
```

Examples:

| Sequence | Streak | Avg response | Round score |
|---:|---:|---:|---:|
| 3 | 1 | 500 ms | 400 |
| 4 | 2 | 400 ms | 570 |
| 6 | 4 | 250 ms | 900 |
| 8 | 1 | 1200 ms | 800 |

BaseGame uses `timeBonus: false`; speed is paid at the per-round response seam rather than as an end-of-run clock bonus. Mistakes cost time, reset streak, and may end the run, but do not subtract points directly.

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

interface PatternPulseStats extends BaseGameStats {
  outcome: PatternPulseOutcome
  completedRounds: number
  longestSequence: number
  mistakes: number
  maxStreak: number
}

interface PatternPulseGameData {
  completedRounds: number
  longestSequence: number
  mistakes: number
  maxStreak: number
}
```

Both terminal outcomes are completed runs:

```ts
gameCompleted: this.state.isGameOver
```

There is no `perfectRun` field. Clean Signal derives directly from `completedRounds >= 3 && mistakes === 0`.

The canonical data interface remains useful for shared achievement typing, but the BaseGame override must keep the base signature:

```ts
protected getGameData(): Record<string, unknown>
```

Returning `PatternPulseGameData` directly as the override type would not satisfy BaseGame's `Record<string, unknown>` contract under strict TypeScript.

## Architecture

### Files

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

Platform integration modifies only:

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

No BaseGame/GameTimer/DOMRenderer/GameInitializer, database, API, auth, or score-service production change is needed.

### Runtime source-of-truth rule

The design and implementation plan repeat exact constants because they freeze the HPA-74 product contract. **Production code defines them once:**

- playback constants live in `PATTERN_PULSE_TIMING`;
- scoring math lives in `calculatePatternPulseRoundScore()`.

Page CSS/initializer/HUD code may reference state/exports but must not define alternate gameplay timing or scoring constants.

### `PatternPulseGame.ts`

Owns sequence creation/growth, watch/input/feedback transitions, one-timeout scheduling, `pressPad()`, streak/mistake accounting, direct `Date.now()` response timing, terminal outcomes, stats, and minimal submitted data. `update()` and `render()` are no-ops.

### `PatternPulseRenderer.ts`

The renderer mounts to `#pattern-pulse-board`, but the four pads are **Astro-owned static children**. It:

- verifies exactly four `button[data-pattern-pad]` children during setup;
- installs one delegated click listener;
- never rebuilds the board;
- toggles `data-active` and wrong-feedback attributes;
- keeps buttons natively focusable in every phase;
- uses `aria-disabled="true"` outside the input phase instead of the native `disabled` property;
- gates delegated clicks through `acceptingInput`; `PatternPulseGame.pressPad()` independently rejects non-input phases;
- cleanup removes its delegated listener and runtime ARIA/data attributes but **does not call `super.cleanup()`**, because `DOMRenderer.cleanup()` would clear the Astro-owned children.

Pattern Pulse sets neither `responsive` nor `containerClass`, so skipping `DOMRenderer.cleanup()` leaves no renderer-owned resize listener/class behind. Destroy must preserve all four buttons and permit re-initialization against the same board.

Using `aria-disabled` is load-bearing for keyboard continuity: a pad focused with Tab/Enter/Space remains focused through feedback/watch and works again when input reopens without requiring the player to Tab back into the board.

### `initFramework.ts`

The initializer follows the existing custom-game wiring shape. It:

- guards `#pattern-pulse-container`;
- creates one game and renderer;
- wires Start, Reset, Play Again, score/time/state HUD, result overlay, achievements/challenges, and beforeunload;
- installs the `1`–`4` shortcut listener on **`document`**, matching existing game initializers;
- ignores editable key targets;
- maps renderer clicks to `pressPad()`;
- removes every initializer-owned listener during idempotent cleanup;
- exposes `window.patternPulseGame` for browser smoke/debug use.

No second run guard is added.

## Input and Accessibility

| Pad | Shortcut | Symbol |
|---:|---|---|
| 1 | `1` | ▲ |
| 2 | `2` | ● |
| 3 | `3` | ◆ |
| 4 | `4` | ✦ |

Color is supplemental. The symbol, number, border/glow/scale pulse, and live phase text remain meaningful without color or audio.

- Touch/mouse uses native button click/tap.
- Enter/Space activates a focused pad; non-input activation is ignored without removing focus.
- `1`–`4` shortcuts are handled at `document` and ignored for input/textarea/select/contenteditable targets.
- No custom arrow-key focus manager is added.
- The page exposes an `aria-live="polite"` status node with `READY`, `WATCH`, `REPEAT`, `CORRECT`, `WRONG — WATCH AGAIN`, `TIME`, and `SIGNAL LOST`.

### Visual pulse timing

Consecutive duplicate pads are legal, so the inactive gap must be visually legible. `.pattern-pulse-pad` active-state transition duration is capped at **100 ms**, shorter than the 140 ms pulse gap. The reduced-motion path removes transforms/transitions entirely. Do not use a conventional 150–300 ms transition that can visually merge duplicate pulses.

## Page Contract

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

- `#pattern-pulse-container`
- `#pattern-pulse-board`
- `#pattern-status`
- `#sequence-length`
- `#completed-rounds`
- `#streak`
- `#mistakes`
- `#final-outcome`
- `#final-rounds`
- `#final-longest-sequence`
- `#final-max-streak`
- `#final-mistakes`

Static pad HTML/CSS remains Astro-owned.

## Platform Integration

Add `GameID.PATTERN_PULSE = 'pattern_pulse'`, a `/pattern-pulse` route, icon `🔁`, and this registry record:

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

`getGameUrl()` stays unchanged; its existing underscore-to-hyphen derivation produces `/pattern-pulse`. Create the route before activating the registry entry because `games.test.ts` verifies every active game route.

`src/lib/games/shared/types.ts` aliases the canonical Pattern Pulse data type and adds it to `GameData`/achievement typing.

Achievements:

1. **First Pulse** (`pattern_pulse_welcome`) — score threshold 1.
2. **In Sync** (`pattern_pulse_streak_3`) — `maxStreak >= 3`.
3. **Long Memory** (`pattern_pulse_sequence_8`) — `longestSequence >= 8`.
4. **Clean Signal** (`pattern_pulse_perfect`) — `completedRounds >= 3 && mistakes === 0`.

No schema/API change is required.

## Testing Strategy

### Scoring

Lock representative formula results and speed-bonus floor/cap through `calculatePatternPulseRoundScore()`.

### State machine

Use injected RNG plus Vitest fake timers to prove:

- fresh state produces a deterministic three-pad sequence;
- playback rejects input until `input`;
- successful repeat scores once and appends one pad;
- fake-time advancement between correct inputs produces the expected speed score through `Date.now()`;
- wrong input resets streak, awards nothing, and replays the same sequence;
- third mistake ends with `gameCompleted=true`;
- timeout during queued playback cancels later cues and leaves `pressPad()` rejected;
- reset during queued playback cannot mutate the fresh run;
- repeated-pad sequences are playable;
- submitted data contains only rounds/longest/mistakes/maxStreak.

Do not assert Date read counts. Apart from the initial-three construction assertion, prefer resulting sequence behavior over incidental RNG call-count assertions.

### Renderer

Prove:

- all four static pads are consumed;
- one delegated click maps pad IDs;
- watch/feedback uses `aria-disabled`, never native `disabled`;
- focus stays on the same static button as phases change;
- active/wrong attributes follow state;
- non-input clicks are ignored;
- destroy preserves the four Astro-owned buttons and supports re-initialization.

### Initializer/page

Prove missing-container error handling, Start/Reset/Play Again, HUD updates, achievement/challenge forwarding, beforeunload, cleanup, page markup, and keyboard shortcuts. Keyboard unit tests dispatch `keydown` on `document`; editable-target tests dispatch a bubbling event from the editable element so the document handler sees the real event target.

### Browser smoke

Playwright opens `/pattern-pulse`, starts, polls `window.patternPulseGame.getState().phase`, reads the actual random sequence, completes one round, uses a numeric shortcut on the next round, then resets. It does not use hard-coded playback sleeps.

`e2e/games/all-games-navigation.spec.ts` remains source-unchanged and automatically covers Pattern Pulse from the active registry.

## Required Gates

```bash
bun run test:run -- src/lib/games/pattern-pulse
bun run test:run -- src/lib/games.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
bun run test:coverage
bun run test:run
```

Current Codecov project and patch targets are 90% with zero threshold leniency.

## Scope Boundary

HPA-74 is complete when the fixed four-pad one-minute game is playable, registered, score/achievement integrated, accessible with touch/mouse/keyboard, and covered by focused/full/browser gates. Audio, extra layouts/difficulties, Daily/persistence, generic sequence abstractions, and backend changes remain future work only if product need justifies them.
