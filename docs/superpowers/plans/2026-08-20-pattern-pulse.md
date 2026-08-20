# Pattern Pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Pattern Pulse, a one-minute four-pad memory-sequence game with increasing sequences, recoverable mistakes, streak/response-speed scoring, accessible desktop/mobile input, achievements, and the existing Cetus score/leaderboard flow.

**Architecture:** `PatternPulseGame` extends `BaseGame` and owns a small event-driven watch/input/feedback state machine plus exactly one scheduled browser timeout. `PatternPulseRenderer` extends `DOMRenderer` and manipulates four static Astro-owned buttons. BaseGame remains unchanged and owns the countdown, score submission, final-timer reporting, reset lifecycle, and stale async-save protection.

**Tech Stack:** Astro 5 + TypeScript, Tailwind CSS 4, existing BaseGame/DOMRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-20-pattern-pulse-design.md`

## Global Constraints

- Package manager is **Bun** (`bun@1.3.1`).
- One HPA-74 task maps to one implementation PR; do not split registration/achievements into another PR.
- Game ID **`pattern_pulse`**, route **`/pattern-pulse`**, title **`Pattern Pulse`**, icon **`🔁`**.
- Fixed v1: 60 seconds, 4 pads, initial sequence length 3, mistake limit 3.
- Playback: 600 ms initial pulse, 40 ms faster per completed round, 320 ms floor, 140 ms gap, 400 ms pre-play delay, 500 ms feedback.
- Successful round appends exactly one random pad. Recoverable mistake replays the same sequence and resets streak.
- Consecutive duplicate pads are legal; do not add anti-repeat generation.
- Accept player input only in `phase === 'input'`.
- Exactly one Pattern Pulse `setTimeout` may be pending. Clear it on reset, terminal mistake, timeout, and cleanup.
- Inject only `rng: () => number` and `now: () => number`. Use Vitest fake timers for browser timing; do not inject timer APIs.
- BaseGame scoring config uses `timeBonus: false`.
- Frozen round score:

```text
completionPoints = sequenceLength * 100
streakBonus = max(0, streak - 1) * 50
speedBonus = clamp(200 - floor(averageResponseMs / 5), 0, 200)
roundScore = completionPoints + streakBonus + speedBonus
```

- Mistakes do not directly subtract score.
- Use `BaseGame + DOMRenderer`; no handle runtime, generic sequence engine, PixiJS loop, Web Audio, haptics, difficulty selector, extra pad layouts, Daily mode, persistence, new DB/API/score endpoint, or per-input timeout.
- Static pad/page HTML is Astro-owned. TypeScript changes attributes/text only; no `innerHTML` board replacement.
- Pad identities: `1 ▲`, `2 ●`, `3 ◆`, `4 ✦`.
- Mouse/touch use native buttons. Keys `1`–`4` map to pads `0`–`3`; Enter/Space remain native button activation. Numeric shortcuts ignore editable targets.
- `#pattern-pulse-container` is the initializer guard; `#pattern-pulse-board` is the renderer mount.
- Create the route before activating the registry entry because `games.test.ts` checks that every active game has a route.
- `e2e/games/all-games-navigation.spec.ts` is registry-derived and stays source-unchanged.
- Edit `CLAUDE.md`, not its `AGENTS.md` symlink.
- Current Codecov project/patch targets are **90%** with zero threshold leniency.

## Risks to Lock in Tests

- A queued cue from an old run must not mutate reset/ended state.
- BaseGame's existing run guard must remain the only stale-score protection.
- E2E must read the debug handle's random sequence and poll phase; no hard-coded sequence or sleeps.
- Renderer and game logic both reject playback-phase input.
- `createInitialState()` may use `this.config`, but not subclass field initializers that execute after `super()`.
- Never call `vi.runAllTimers()` while BaseGame's countdown interval is active; advance fake time in bounded increments.

---

### Task 1: Contracts and pure scoring

**Files**
- Create `src/lib/games/pattern-pulse/types.ts`
- Create `src/lib/games/pattern-pulse/scoring.ts`
- Create `src/lib/games/pattern-pulse/scoring.test.ts`

- [ ] **1.1 Define the contracts/config**

```typescript
// src/lib/games/pattern-pulse/types.ts
import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

export type PatternPad = 0 | 1 | 2 | 3
export type PatternPulsePhase = 'idle' | 'watch' | 'input' | 'feedback' | 'ended'
export type PatternPulseOutcome = 'playing' | 'timeout' | 'mistakes'
export type PatternPulseFeedback = 'correct' | 'wrong' | null

export const PATTERN_PULSE_TIMING = {
    initialPulseMs: 600,
    pulseStepMs: 40,
    minPulseMs: 320,
    pulseGapMs: 140,
    prePlaybackDelayMs: 400,
    feedbackMs: 500,
} as const

export interface PatternPulseConfig extends BaseGameConfig {
    initialSequenceLength: number
    mistakeLimit: number
    rng: () => number
    now: () => number
}

export function createPatternPulseConfig(
    overrides: Partial<PatternPulseConfig> = {}
): PatternPulseConfig {
    return {
        duration: 60,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        initialSequenceLength: 3,
        mistakeLimit: 3,
        rng: Math.random,
        now: Date.now,
        ...overrides,
    }
}

export interface PatternPulseState extends BaseGameState {
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

export interface PatternPulseStats extends BaseGameStats {
    outcome: PatternPulseOutcome
    completedRounds: number
    longestSequence: number
    mistakes: number
    maxStreak: number
}

export interface PatternPulseGameData {
    completedRounds: number
    longestSequence: number
    mistakes: number
    maxStreak: number
    perfectRun: boolean
}
```

- [ ] **1.2 Write RED scoring tests**

```typescript
// src/lib/games/pattern-pulse/scoring.test.ts
import { describe, expect, it } from 'vitest'
import { calculatePatternPulseRoundScore } from './scoring'

describe('calculatePatternPulseRoundScore', () => {
    it('scores length + first-round speed', () => {
        expect(calculatePatternPulseRoundScore({
            sequenceLength: 3,
            streak: 1,
            averageResponseMs: 500,
        })).toBe(400)
    })

    it('adds streak bonus', () => {
        expect(calculatePatternPulseRoundScore({
            sequenceLength: 4,
            streak: 2,
            averageResponseMs: 400,
        })).toBe(570)
    })

    it('caps speed bonus at 200', () => {
        expect(calculatePatternPulseRoundScore({
            sequenceLength: 3,
            streak: 1,
            averageResponseMs: 0,
        })).toBe(500)
    })

    it('floors speed bonus at zero', () => {
        expect(calculatePatternPulseRoundScore({
            sequenceLength: 8,
            streak: 1,
            averageResponseMs: 1200,
        })).toBe(800)
    })
})
```

Run:

```bash
bun run test:run src/lib/games/pattern-pulse/scoring.test.ts
```

Expected: RED because `scoring.ts` does not exist.

- [ ] **1.3 Implement the scorer**

```typescript
// src/lib/games/pattern-pulse/scoring.ts
export interface PatternPulseRoundScoreInput {
    sequenceLength: number
    streak: number
    averageResponseMs: number
}

export function calculatePatternPulseRoundScore({
    sequenceLength,
    streak,
    averageResponseMs,
}: PatternPulseRoundScoreInput): number {
    const completionPoints = Math.max(0, Math.floor(sequenceLength)) * 100
    const streakBonus = Math.max(0, Math.floor(streak) - 1) * 50
    const safeResponseMs = Math.max(0, averageResponseMs)
    const speedBonus = Math.max(
        0,
        Math.min(200, 200 - Math.floor(safeResponseMs / 5))
    )
    return completionPoints + streakBonus + speedBonus
}
```

Run and expect GREEN:

```bash
bun run test:run src/lib/games/pattern-pulse/scoring.test.ts
```

- [ ] **1.4 Commit**

```bash
git add src/lib/games/pattern-pulse/types.ts src/lib/games/pattern-pulse/scoring.ts src/lib/games/pattern-pulse/scoring.test.ts
git commit -m "feat(pattern-pulse): add contracts and scoring"
```

---

### Task 2: BaseGame state machine, scheduling, mistakes, and response timing

**Files**
- Create `src/lib/games/pattern-pulse/PatternPulseGame.ts`
- Create `src/lib/games/pattern-pulse/PatternPulseGame.test.ts`
- Reuse unchanged `src/lib/games/core/BaseGame.ts`
- Reuse unchanged `src/lib/games/core/GameTimer.ts`

- [ ] **2.1 Build deterministic test helpers and RED start/playback coverage**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternPulseGame } from './PatternPulseGame'
import { createPatternPulseConfig, type PatternPad } from './types'

function sequenceRng(values: number[]): () => number {
    let index = 0
    return () => values[index++ % values.length]
}

function makeClock(values: number[]): () => number {
    let index = 0
    return () => values[Math.min(index++, values.length - 1)]
}

function advanceToInput(game: PatternPulseGame): void {
    for (let guard = 0; guard < 100 && game.getState().phase !== 'input'; guard++) {
        vi.advanceTimersByTime(50)
    }
    expect(game.getState().phase).toBe('input')
}

function enterSequence(game: PatternPulseGame, sequence: PatternPad[]): void {
    for (const pad of sequence) {
        expect(game.pressPad(pad)).toBe(true)
    }
}

describe('PatternPulseGame', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('starts with three deterministic pads and rejects watch-phase input', () => {
        const game = new PatternPulseGame(createPatternPulseConfig({
            rng: sequenceRng([0, 0.3, 0.6]),
        }))
        expect(game.getState().sequence).toEqual([0, 1, 2])
        game.start()
        expect(game.getState().phase).toBe('watch')
        expect(game.pressPad(0)).toBe(false)
        advanceToInput(game)
    })
})
```

Run:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseGame.test.ts
```

Expected: RED.

- [ ] **2.2 Implement the BaseGame shell and exactly-one-timeout playback loop**

`PatternPulseGame` must:

```typescript
export class PatternPulseGame extends BaseGame<
    PatternPulseState,
    PatternPulseConfig,
    PatternPulseStats
> {
    private scheduledTimeoutId: ReturnType<typeof setTimeout> | null = null
    private playbackIndex = 0
    private lastInputAtMs = 0
    private responseTotalMs = 0

    constructor(
        config: PatternPulseConfig = createPatternPulseConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.PATTERN_PULSE, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): PatternPulseState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            phase: 'idle',
            outcome: 'playing',
            sequence: Array.from(
                { length: this.config.initialSequenceLength },
                () => this.nextPad()
            ),
            inputIndex: 0,
            activePad: null,
            feedback: null,
            completedRounds: 0,
            mistakes: 0,
            streak: 0,
            maxStreak: 0,
            longestSequence: 0,
        }
    }

    update(_deltaTime: number): void {}
    render(): void {}

    cleanup(): void {
        this.clearScheduled()
    }
}
```

Use these exact timing primitives:

```typescript
private nextPad(): PatternPad {
    const value = Math.floor(this.config.rng() * 4)
    return Math.max(0, Math.min(3, value)) as PatternPad
}

private pulseMs(): number {
    return Math.max(
        PATTERN_PULSE_TIMING.minPulseMs,
        PATTERN_PULSE_TIMING.initialPulseMs -
            this.state.completedRounds * PATTERN_PULSE_TIMING.pulseStepMs
    )
}

private schedule(callback: () => void, delayMs: number): void {
    this.clearScheduled()
    this.scheduledTimeoutId = setTimeout(() => {
        this.scheduledTimeoutId = null
        callback()
    }, delayMs)
}

private clearScheduled(): void {
    if (this.scheduledTimeoutId !== null) {
        clearTimeout(this.scheduledTimeoutId)
        this.scheduledTimeoutId = null
    }
}
```

`onGameStart()` enters `watch`, waits 400 ms, then alternates `activePad=<sequence[index]>` for `pulseMs()` and `activePad=null` for 140 ms. After the last gap, enter `input`, set `inputIndex=0`, reset current response total, and capture `lastInputAtMs=this.config.now()`.

Every phase/state transition calls one local `emitStateChange()` helper using the same `callbacks.onStateChange` + `this.emit('state-change', …)` pattern as Mine Grid.

- [ ] **2.3 RED/GREEN successful-round scoring/growth**

Add:

```typescript
it('scores a full repeat and grows the sequence once', () => {
    const game = new PatternPulseGame(createPatternPulseConfig({
        rng: sequenceRng([0, 0.3, 0.6, 0.9]),
        now: makeClock([0, 500, 1000, 1500]),
    }))
    game.start()
    advanceToInput(game)
    enterSequence(game, [0, 1, 2])

    expect(game.getState()).toMatchObject({
        completedRounds: 1,
        streak: 1,
        maxStreak: 1,
        longestSequence: 3,
        phase: 'feedback',
        feedback: 'correct',
        score: 400,
    })

    vi.advanceTimersByTime(PATTERN_PULSE_TIMING.feedbackMs)
    expect(game.getState().sequence).toEqual([0, 1, 2, 3])
    expect(game.getState().phase).toBe('watch')
})
```

Accepted correct input records `max(0, now-lastInputAtMs)`, updates `lastInputAtMs`, and increments `inputIndex`. On full completion:

```typescript
const sequenceLength = this.state.sequence.length
const averageResponseMs = this.responseTotalMs / sequenceLength
this.state.completedRounds++
this.state.streak++
this.state.maxStreak = Math.max(this.state.maxStreak, this.state.streak)
this.state.longestSequence = Math.max(this.state.longestSequence, sequenceLength)
this.addScore(calculatePatternPulseRoundScore({
    sequenceLength,
    streak: this.state.streak,
    averageResponseMs,
}), 'sequence_complete')
this.state.phase = 'feedback'
this.state.feedback = 'correct'
this.state.activePad = null
this.emitStateChange()
this.schedule(() => {
    this.state.sequence = [...this.state.sequence, this.nextPad()]
    this.beginPlayback()
}, PATTERN_PULSE_TIMING.feedbackMs)
```

- [ ] **2.4 RED/GREEN recoverable and terminal mistakes**

Lock:

```typescript
it('replays the same sequence after a recoverable mistake', () => {
    const game = new PatternPulseGame(createPatternPulseConfig({
        rng: sequenceRng([0, 0.3, 0.6]),
    }))
    game.start()
    advanceToInput(game)
    const before = [...game.getState().sequence]
    game.pressPad(3)
    expect(game.getState()).toMatchObject({
        mistakes: 1,
        streak: 0,
        phase: 'feedback',
        feedback: 'wrong',
        activePad: 3,
    })
    vi.advanceTimersByTime(PATTERN_PULSE_TIMING.feedbackMs)
    expect(game.getState().sequence).toEqual(before)
    expect(game.getState().phase).toBe('watch')
})
```

Wrong input behavior:

```typescript
this.state.mistakes++
this.state.streak = 0
this.state.inputIndex = 0
this.responseTotalMs = 0
this.state.feedback = 'wrong'
this.state.activePad = pad

if (this.state.mistakes >= this.config.mistakeLimit) {
    this.clearScheduled()
    this.state.outcome = 'mistakes'
    this.state.phase = 'ended'
    this.emitStateChange()
    void this.end().catch(error =>
        console.error('PatternPulseGame end failed (mistakes)', error)
    )
    return
}

this.state.phase = 'feedback'
this.emitStateChange()
this.schedule(() => this.beginPlayback(), PATTERN_PULSE_TIMING.feedbackMs)
```

Add a third-mistake test with `initialSequenceLength: 1`, `rng: () => 0`; make three wrong attempts and assert `outcome='mistakes'`, `phase='ended'`, `isGameOver=true`.

- [ ] **2.5 Lock reset, timeout, duplicate pads, stats/data**

Required regressions:

```typescript
it('allows consecutive duplicate pads', () => {
    const game = new PatternPulseGame(createPatternPulseConfig({
        initialSequenceLength: 3,
        rng: () => 0,
        now: makeClock([0, 100, 200, 300]),
    }))
    expect(game.getState().sequence).toEqual([0, 0, 0])
    game.start()
    advanceToInput(game)
    enterSequence(game, [0, 0, 0])
    expect(game.getState().completedRounds).toBe(1)
})

it('cannot leak a queued cue after reset', () => {
    const game = new PatternPulseGame(createPatternPulseConfig({ rng: () => 0 }))
    game.start()
    vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
    game.reset()
    expect(game.getState().phase).toBe('idle')
    vi.runAllTimers() // safe: BaseGame timer is stopped by reset()
    expect(game.getState().phase).toBe('idle')
    expect(game.getState().activePad).toBeNull()
})
```

Override timeout before delegating:

```typescript
protected handleTimeUp(): void {
    this.clearScheduled()
    this.state.phase = 'ended'
    this.state.outcome = 'timeout'
    this.state.feedback = null
    this.state.activePad = null
    this.emitStateChange()
    super.handleTimeUp()
}
```

Stats/data:

```typescript
getGameStats(): PatternPulseStats {
    return {
        finalScore: this.state.score,
        timeElapsed: Math.floor(this.getTimerStatus().elapsedTime),
        gameCompleted: this.state.outcome === 'timeout',
        outcome: this.state.outcome,
        completedRounds: this.state.completedRounds,
        longestSequence: this.state.longestSequence,
        mistakes: this.state.mistakes,
        maxStreak: this.state.maxStreak,
    }
}

protected getGameData(): PatternPulseGameData {
    return {
        completedRounds: this.state.completedRounds,
        longestSequence: this.state.longestSequence,
        mistakes: this.state.mistakes,
        maxStreak: this.state.maxStreak,
        perfectRun: this.state.completedRounds > 0 && this.state.mistakes === 0,
    }
}
```

`onGameReset()` clears the Pattern Pulse timeout/private timing fields and emits the fresh idle state.

Run:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseGame.test.ts src/lib/games/pattern-pulse/scoring.test.ts
```

Expected: GREEN.

- [ ] **2.6 Commit**

```bash
git add src/lib/games/pattern-pulse/PatternPulseGame.ts src/lib/games/pattern-pulse/PatternPulseGame.test.ts
git commit -m "feat(pattern-pulse): add memory sequence game state"
```

---

### Task 3: Fixed four-pad DOM renderer

**Files**
- Create `src/lib/games/pattern-pulse/PatternPulseRenderer.ts`
- Create `src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts`
- Reuse unchanged `src/lib/games/renderers/DOMRenderer.ts`

- [ ] **3.1 RED renderer contract**

Mount four static buttons in jsdom and prove:

```typescript
const state = (phase: PatternPulseState['phase'], activePad: PatternPad | null = null): PatternPulseState => ({
    score: 0,
    timeRemaining: 60,
    isActive: true,
    isPaused: false,
    isGameOver: false,
    gameStarted: true,
    phase,
    outcome: 'playing',
    sequence: [0, 1, 2],
    inputIndex: 0,
    activePad,
    feedback: null,
    completedRounds: 0,
    mistakes: 0,
    streak: 0,
    maxStreak: 0,
    longestSequence: 0,
})
```

Assertions:

- input phase click on pad `2` invokes callback once with `2`;
- watch phase disables pads and `data-active='true'` follows `activePad`;
- wrong feedback sets `data-feedback='wrong'` only on the pressed bad pad;
- `destroy()` removes the delegated click listener.

Run and expect RED:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
```

- [ ] **3.2 Implement attribute-only rendering and one delegated click listener**

```typescript
export class PatternPulseRenderer extends DOMRenderer {
    private onPadPress?: (pad: PatternPad) => void
    private acceptingInput = false
    private padButtons: HTMLButtonElement[] = []

    constructor() {
        super({
            type: 'dom',
            container: '#pattern-pulse-board',
            cleanOnRender: false,
        })
    }

    private readonly clickHandler = (event: Event): void => {
        if (!this.acceptingInput || !this.container) return
        const target = event.target
        if (!(target instanceof Element)) return
        const button = target.closest<HTMLButtonElement>('button[data-pattern-pad]')
        if (!button || !this.container.contains(button)) return
        const value = Number(button.dataset.patternPad)
        if (value !== 0 && value !== 1 && value !== 2 && value !== 3) return
        this.onPadPress?.(value)
    }

    async setup(): Promise<void> {
        await super.setup()
        if (!this.container) throw new Error('Pattern Pulse board not found')
        this.padButtons = Array.from(
            this.container.querySelectorAll<HTMLButtonElement>('button[data-pattern-pad]')
        )
        if (this.padButtons.length !== 4) {
            throw new Error('Pattern Pulse requires exactly four pad buttons')
        }
        this.addEventListener('click', this.clickHandler)
    }

    setPadPressCallback(callback: (pad: PatternPad) => void): void {
        this.onPadPress = callback
    }

    protected override renderGame(rawState: unknown): void {
        if (!isPatternPulseState(rawState)) return
        this.acceptingInput = rawState.isActive && rawState.phase === 'input'
        for (const button of this.padButtons) {
            const pad = Number(button.dataset.patternPad) as PatternPad
            const active = rawState.activePad === pad
            button.disabled = !this.acceptingInput
            button.dataset.active = String(active)
            button.dataset.feedback =
                active && rawState.feedback === 'wrong' ? 'wrong' : 'none'
        }
    }

    cleanup(): void {
        this.removeEventListener('click', this.clickHandler)
        this.padButtons = []
        this.acceptingInput = false
        super.cleanup()
    }
}
```

The local type guard checks object-ness, `Array.isArray(sequence)`, and string `phase` only; do not add a schema library.

Run and expect GREEN:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
```

- [ ] **3.3 Commit**

```bash
git add src/lib/games/pattern-pulse/PatternPulseRenderer.ts src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
git commit -m "feat(pattern-pulse): add four-pad DOM renderer"
```

---

### Task 4: Astro page + initializer as one DOM contract

**Files**
- Create `src/lib/games/pattern-pulse/initFramework.ts`
- Create `src/lib/games/pattern-pulse/initFramework.test.ts`
- Create `src/pages/pattern-pulse/index.astro`
- Modify `src/pages/game-board-markup.test.ts`

- [ ] **4.1 RED page-markup contract, then create the page before registry activation**

In `src/pages/game-board-markup.test.ts`, read `src/pages/pattern-pulse/index.astro` and assert:

```typescript
expect(patternPulseMarkup).toContain('id="pattern-pulse-container"')
expect(patternPulseMarkup).toContain('id="pattern-pulse-board"')
expect(patternPulseMarkup.match(/data-pattern-pad="[0-3]"/g)).toHaveLength(4)
expect(patternPulseMarkup).toContain('id="pattern-status"')
expect(patternPulseMarkup).toMatch(
    /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initPatternPulseGameFramework/
)
```

Create `src/pages/pattern-pulse/index.astro` with:

```astro
<GamePage
  gameId="pattern-pulse"
  title="Pattern Pulse"
  description="Watch the signal, then repeat the growing pattern before time runs out"
  icon="🔁"
  showPause={false}
  showEnd={false}
  initialTime={60}
>
  <div slot="game-board" id="pattern-pulse-container" class="w-[min(520px,calc(100vw-2rem))]">
    <div id="pattern-pulse-board" class="grid grid-cols-2 gap-3 aspect-square" role="group" aria-label="Pattern Pulse signal pads">
      <button type="button" class="pattern-pulse-pad" data-pattern-pad="0" aria-label="Pad 1, triangle"><span aria-hidden="true">▲</span><span>1</span></button>
      <button type="button" class="pattern-pulse-pad" data-pattern-pad="1" aria-label="Pad 2, circle"><span aria-hidden="true">●</span><span>2</span></button>
      <button type="button" class="pattern-pulse-pad" data-pattern-pad="2" aria-label="Pad 3, diamond"><span aria-hidden="true">◆</span><span>3</span></button>
      <button type="button" class="pattern-pulse-pad" data-pattern-pad="3" aria-label="Pad 4, star"><span aria-hidden="true">✦</span><span>4</span></button>
    </div>
    <p id="pattern-status" class="mt-4 text-center font-mono text-cetus-accent" aria-live="polite">READY</p>
  </div>
```

Add `additional-stats` IDs `sequence-length`, `completed-rounds`, `streak`, `mistakes`; concise HOW TO PLAY/SCORING cards; final-stat IDs `final-outcome`, `final-rounds`, `final-longest-sequence`, `final-max-streak`, `final-mistakes`; and a root-level script that calls `initPatternPulseGameFramework()` and stores the returned handle on `window.patternPulseGame`.

Use exact pad-state CSS:

```astro
<style is:global>
  @reference "../../styles/global.css";
  .pattern-pulse-pad {
    @apply flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-cetus-accent/30 bg-cetus-surface/50 text-3xl font-bold text-cetus-ink transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cetus-accent disabled:cursor-default;
  }
  .pattern-pulse-pad[data-active='true'] {
    transform: scale(1.04);
    border-color: var(--cetus-accent);
    background: color-mix(in srgb, var(--cetus-accent) 24%, transparent);
    box-shadow: 0 0 28px color-mix(in srgb, var(--cetus-accent) 42%, transparent);
  }
  .pattern-pulse-pad[data-feedback='wrong'] {
    border-color: var(--cetus-accent-3);
    background: color-mix(in srgb, var(--cetus-accent-3) 24%, transparent);
  }
  @media (prefers-reduced-motion: reduce) {
    .pattern-pulse-pad { transition: none; }
    .pattern-pulse-pad[data-active='true'] { transform: none; }
  }
</style>
```

- [ ] **4.2 RED initializer tests with bounded fake-time advancement**

Create a jsdom fixture for the stable IDs. For active-run tests use:

```typescript
const advanceInitialPlayback = (): void => {
    vi.advanceTimersByTime(4_000)
}
```

Do **not** use `vi.runAllTimers()` while the BaseGame countdown is running.

Required tests:

```typescript
it('maps a numeric shortcut during input', async () => {
    const handle = await initPatternPulseGameFramework()
    expect(handle).toBeDefined()
    handle?.game.start()
    advanceInitialPlayback()
    expect(handle?.game.getState().phase).toBe('input')
    const first = handle?.game.getState().sequence[0] ?? 0
    window.dispatchEvent(new KeyboardEvent('keydown', {
        key: String(first + 1),
    }))
    expect(handle?.game.getState().inputIndex).toBe(1)
})

it('ignores numeric shortcuts from editable targets', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const handle = await initPatternPulseGameFramework()
    handle?.game.start()
    advanceInitialPlayback()
    input.dispatchEvent(new KeyboardEvent('keydown', {
        key: '1',
        bubbles: true,
    }))
    expect(handle?.game.getState().inputIndex).toBe(0)
})
```

Also prove missing outer container error handling, renderer click delegation, HUD updates, score/time updates, Reset/Play Again idle presentation, achievement/challenge forwarding, beforeunload, and idempotent cleanup.

- [ ] **4.3 Implement initializer by reusing the Mine Grid wiring shape**

Use one `PatternPulseGame` + one `PatternPulseRenderer`, tracked listeners, `handleGameError`, BaseGame end-event achievement/challenge forwarding, and one cleanup guard.

Helpers:

```typescript
function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
}

function shortcutToPad(key: string): PatternPad | null {
    if (key === '1') return 0
    if (key === '2') return 1
    if (key === '3') return 2
    if (key === '4') return 3
    return null
}

function statusText(state: PatternPulseState): string {
    if (state.outcome === 'timeout') return 'TIME'
    if (state.outcome === 'mistakes') return 'SIGNAL LOST'
    if (state.phase === 'idle') return 'READY'
    if (state.phase === 'watch') return 'WATCH'
    if (state.phase === 'input') return 'REPEAT'
    if (state.feedback === 'correct') return 'CORRECT'
    if (state.feedback === 'wrong') return 'WRONG — WATCH AGAIN'
    return 'READY'
}
```

`syncHud(state)` writes score-independent state:

```typescript
setText('pattern-status', statusText(state))
setText('sequence-length', String(state.sequence.length))
setText('completed-rounds', String(state.completedRounds))
setText('streak', String(state.streak))
setText('mistakes', `${state.mistakes} / ${game.getConfig().mistakeLimit}`)
```

If `getConfig()` is not otherwise needed, expose a read-only `getConfig(): PatternPulseConfig` on `PatternPulseGame` returning `{ ...this.config }`; do not reach into protected config from the initializer.

Initializer result:

```typescript
export interface PatternPulseInitResult {
    game: PatternPulseGame
    renderer: PatternPulseRenderer
    getGame: () => PatternPulseGame
    getState: () => ReturnType<PatternPulseGame['getState']>
    restart: () => void
    cleanup: () => void
}
```

- [ ] **4.4 Add `pattern-pulse` to the shared GamePage wrapper list now that the page exists**

Run:

```bash
bun run test:run src/lib/games/pattern-pulse src/pages/game-board-markup.test.ts
```

Expected: GREEN.

- [ ] **4.5 Commit**

```bash
git add src/lib/games/pattern-pulse/initFramework.ts src/lib/games/pattern-pulse/initFramework.test.ts src/pages/pattern-pulse/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(pattern-pulse): wire accessible game page"
```

---

### Task 5: Registry, shared data contract, and four achievements

**Files**
- Modify `src/lib/games.ts`
- Modify `src/lib/games.test.ts`
- Modify `src/lib/games/shared/types.ts`
- Modify `src/lib/achievements.ts`
- Modify `src/lib/achievements.test.ts`
- Reuse score/API/database files unchanged

- [ ] **5.1 RED registry test**

```typescript
describe('Pattern Pulse registration', () => {
    it('has the exact active registry entry', () => {
        expect(GameID.PATTERN_PULSE).toBe('pattern_pulse')
        expect(getGameById(GameID.PATTERN_PULSE)).toMatchObject({
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
        })
        expect(getGameIcon(GameID.PATTERN_PULSE)).toBe('🔁')
        expect(GAMES.filter(game => game.id === GameID.PATTERN_PULSE)).toHaveLength(1)
    })
})
```

Run and expect RED:

```bash
bun run test:run src/lib/games.test.ts
```

- [ ] **5.2 Add enum/registry/icon**

Add `PATTERN_PULSE = 'pattern_pulse'`, the exact object above, and `[GameID.PATTERN_PULSE]: '🔁'` to `GAME_ICONS`. Do not edit `getGameUrl()`.

Run and expect GREEN:

```bash
bun run test:run src/lib/games.test.ts
```

- [ ] **5.3 Add the typed game-data alias**

```typescript
// src/lib/games/shared/types.ts
export type PatternPulseGameData =
    import('../pattern-pulse/types').PatternPulseGameData
```

Include it in `GameData`, import it into `src/lib/achievements.ts`, and include it in `AchievementCheckData`.

- [ ] **5.4 RED achievement tests, then definitions**

Lock these IDs/conditions:

```typescript
pattern_pulse_welcome   // score_threshold >= 1
pattern_pulse_streak_3  // maxStreak >= 3
pattern_pulse_sequence_8 // longestSequence >= 8
pattern_pulse_perfect   // completedRounds >= 3 && mistakes === 0
```

Definitions:

```typescript
{
    id: 'pattern_pulse_welcome',
    name: 'First Pulse',
    description: 'Complete your first Pattern Pulse sequence.',
    logo: '🔁',
    gameId: GameID.PATTERN_PULSE,
    condition: { type: 'score_threshold', threshold: 1 },
    rarity: AchievementRarity.COMMON,
},
{
    id: 'pattern_pulse_streak_3',
    name: 'In Sync',
    description: 'Complete 3 Pattern Pulse sequences in a row.',
    logo: '⚡',
    gameId: GameID.PATTERN_PULSE,
    condition: {
        type: 'in_game',
        check: (data: PatternPulseGameData) => data.maxStreak >= 3,
    },
    rarity: AchievementRarity.COMMON,
},
{
    id: 'pattern_pulse_sequence_8',
    name: 'Long Memory',
    description: 'Complete a Pattern Pulse sequence of length 8.',
    logo: '🧠',
    gameId: GameID.PATTERN_PULSE,
    condition: {
        type: 'in_game',
        check: (data: PatternPulseGameData) => data.longestSequence >= 8,
    },
    rarity: AchievementRarity.RARE,
},
{
    id: 'pattern_pulse_perfect',
    name: 'Clean Signal',
    description: 'Complete at least 3 sequences without a mistake.',
    logo: '✨',
    gameId: GameID.PATTERN_PULSE,
    condition: {
        type: 'in_game',
        check: (data: PatternPulseGameData) =>
            data.completedRounds >= 3 && data.mistakes === 0,
    },
    rarity: AchievementRarity.RARE,
},
```

Run:

```bash
bun run test:run src/lib/games.test.ts src/lib/achievements.test.ts src/lib/games/pattern-pulse
bun run typecheck
```

Expected: GREEN / 0 type errors.

- [ ] **5.5 Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts src/lib/achievements.ts src/lib/achievements.test.ts
git commit -m "feat(pattern-pulse): register game and achievements"
```

---

### Task 6: Browser coverage, inventory, and final gates

**Files**
- Modify `e2e/games/play-coverage.spec.ts`
- Modify `CLAUDE.md`
- Verify unchanged `e2e/games/all-games-navigation.spec.ts`
- Verify `AGENTS.md` symlink unchanged

- [ ] **6.1 Add non-flaky browser smoke using the debug handle**

Append a Pattern Pulse describe block. Poll live phase and read the actual random sequence:

```typescript
test('Pattern Pulse completes one sequence and accepts a numeric shortcut', async ({ page }) => {
    await page.goto('/pattern-pulse')
    await expect(page.locator('#pattern-pulse-board')).toBeVisible()
    await startGameWhenReady(page)

    const readState = () => page.evaluate(() => {
        const handle = (window as Window & {
            patternPulseGame?: {
                getState: () => {
                    phase: string
                    sequence: number[]
                    inputIndex: number
                }
            }
        }).patternPulseGame
        if (!handle) throw new Error('Pattern Pulse debug handle not ready')
        return handle.getState()
    })

    await expect.poll(async () => (await readState()).phase).toBe('input')
    const first = (await readState()).sequence
    for (const pad of first) {
        await page.locator(`[data-pattern-pad="${pad}"]`).click()
    }
    await expect(page.locator('#completed-rounds')).toHaveText('1')

    await expect.poll(async () => (await readState()).phase).toBe('input')
    const second = (await readState()).sequence
    await page.keyboard.press(String(second[0] + 1))
    await expect.poll(async () => (await readState()).inputIndex).toBe(1)

    await page.locator('#reset-btn').click()
    await expect(page.locator('#pattern-status')).toHaveText('READY')
    await expect(page.locator('#sequence-length')).toHaveText('3')
})
```

Do not use `waitForTimeout()` and do not seed production through a query parameter.

- [ ] **6.2 Update only factual game inventory in `CLAUDE.md`**

- 16 → **17** implemented games; append Pattern Pulse.
- Add `pattern-pulse/` to game structure.
- DOM renderer list: Memory Matrix, Mine Grid, Pattern Pulse.
- Add game note: `Pattern Pulse: BaseGame + DOMRenderer four-pad memory-sequence game`.
- “all 16” → **all 17**.
- Game Count 16 → **17**.
- Framework count `13 of 16` → **14 of 17**; Circuit Hacker, Satellite Sync, Ice Slide remain the same three handle-based games.

- [ ] **6.3 Verify symlink**

```bash
test -L AGENTS.md
test "$(readlink AGENTS.md)" = "CLAUDE.md"
```

- [ ] **6.4 Focused tests**

```bash
bun run test:run src/lib/games/pattern-pulse
bun run test:run src/lib/games.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
```

- [ ] **6.5 Type/lint/format/build**

```bash
bun run typecheck
bun run lint
bun run format:check
bun run build
```

- [ ] **6.6 Browser routing/play gates**

```bash
bun run test:e2e e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
```

`all-games-navigation.spec.ts` should need no source change; the new `GAMES` entry automatically adds Pattern Pulse coverage.

- [ ] **6.7 Coverage/full regression**

```bash
bun run test:coverage
bun run test:run
```

Remote Codecov project + patch checks must both meet the configured 90% target.

- [ ] **6.8 Scope review**

```bash
git diff --name-only main...HEAD
```

Expected implementation paths:

```text
src/lib/games/pattern-pulse/*
src/pages/pattern-pulse/index.astro
src/lib/games.ts
src/lib/games.test.ts
src/lib/games/shared/types.ts
src/lib/achievements.ts
src/lib/achievements.test.ts
src/pages/game-board-markup.test.ts
e2e/games/play-coverage.spec.ts
CLAUDE.md
```

Planning docs are also expected if implementation continues on a branch containing planning history. No core framework, renderer framework, DB, API, auth, score service, or `all-games-navigation.spec.ts` source edit should appear.

- [ ] **6.9 Commit**

```bash
git add e2e/games/play-coverage.spec.ts CLAUDE.md
git commit -m "test(pattern-pulse): cover browser flow and inventory"
```

## Final Definition of Done

- Four static symbol+number pads render on `/pattern-pulse`.
- Run ends at 60 seconds or the third mistake.
- Initial sequence is 3; each success adds exactly 1 pad.
- Recoverable mistakes replay the same sequence and reset streak.
- Playback follows the 600 ms → 320 ms formula.
- Only complete sequences score, using the frozen length/streak/response formula.
- Reset/end/timeout cannot leak a queued cue into new state.
- Touch/mouse, native button keyboard activation, and `1`–`4` shortcuts work.
- Existing BaseGame score/achievement/challenge flow is reused unchanged.
- Registry/icon/shared type/four achievements/markup/browser coverage are present.
- No backend/schema/core/Pixi/audio/generic sequence abstraction was introduced.
- `CLAUDE.md` reports 17 games / 14 BaseGame-native games; `AGENTS.md` remains a symlink.
- Focused tests, full tests, typecheck, lint, format, build, browser gates, and coverage pass.