# Pattern Pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Pattern Pulse, a one-minute four-pad memory-sequence game with growing patterns, recoverable mistakes, streak/response-speed scoring, accessible desktop/mobile input, achievements, and the existing Cetus score/leaderboard flow.

**Architecture:** `PatternPulseGame` extends `BaseGame` and owns a small event-driven watch/input/feedback state machine plus exactly one scheduled timeout. `PatternPulseRenderer` extends `DOMRenderer` only for container/listener helpers and mutates attributes on four Astro-owned static buttons; it deliberately does not adopt `DOMRenderer.cleanup()` child destruction. Response timing uses direct `Date.now()` controlled by Vitest fake timers. No BaseGame/GameTimer/DOMRenderer/GameInitializer/backend changes are required.

**Tech Stack:** Astro 5 + TypeScript, Tailwind CSS 4, existing BaseGame/DOMRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-20-pattern-pulse-design.md`

## Global Constraints

- Package manager: **Bun `1.3.1`**.
- One HPA-74 implementation PR; registration/achievements are part of that same PR.
- ID **`pattern_pulse`**, route **`/pattern-pulse`**, title **`Pattern Pulse`**, icon **`🔁`**.
- Fixed v1: **60 seconds**, **4 pads**, initial sequence **3**, mistake limit **3**.
- Playback requirements: initial pulse **600 ms**, speed-up **40 ms/completed round**, floor **320 ms**, gap **140 ms**, pre-play delay **400 ms**, feedback **500 ms**.
- Runtime playback values are defined once in `PATTERN_PULSE_TIMING`; page/initializer code must not introduce a second set.
- A successful round appends exactly one random pad. A recoverable mistake replays the same sequence and resets streak.
- Consecutive duplicate pads are legal.
- Accept gameplay input only during `phase === 'input'`.
- Exactly one Pattern Pulse timeout may be pending; clear it on reset, terminal mistake, timeout, and cleanup.
- Inject only `rng: () => number`; use direct `Date.now()` for response timing and Vitest fake timers in tests.
- BaseGame scoring uses `timeBonus: false`.
- Frozen round score:

```text
completionPoints = sequenceLength * 100
streakBonus = max(0, streak - 1) * 50
speedBonus = clamp(200 - floor(averageResponseMs / 5), 0, 200)
roundScore = completionPoints + streakBonus + speedBonus
```

- `calculatePatternPulseRoundScore()` is the only production implementation of that formula.
- Mistakes do not directly subtract score.
- `gameCompleted` is `state.isGameOver`; timeout and third-mistake endings are both completed runs.
- `PatternPulseGameData` has `completedRounds`, `longestSequence`, `mistakes`, `maxStreak`; no `perfectRun` field.
- `getGameData()` override returns `Record<string, unknown>` to match BaseGame's strict TypeScript contract.
- Use `BaseGame + DOMRenderer`; no PixiJS, audio, generic sequence engine, second run guard, new backend/schema/API/leaderboard path, persistence, Daily mode, difficulty selector, or extra pad layouts.
- Four pad buttons are Astro-owned and stay in the DOM for renderer lifetime/destroy/re-initialization.
- Renderer uses `aria-disabled`, never the native `disabled` property, so keyboard focus is preserved between input/watch/feedback phases.
- Renderer cleanup removes listener/runtime attributes and **does not call `super.cleanup()`**, because `DOMRenderer.cleanup()` clears the container.
- Pads are `1 ▲`, `2 ●`, `3 ◆`, `4 ✦`; color is supplemental.
- Active-state CSS transition is **≤100 ms**, shorter than the 140 ms gap, so duplicate-pad flashes remain distinct.
- Key shortcuts `1`–`4` are attached to **`document`**, matching existing game initializers; editable targets are ignored.
- Create the `/pattern-pulse` route before activating the `GAMES` registry entry.
- `getGameUrl()` remains unchanged.
- `e2e/games/all-games-navigation.spec.ts` remains source-unchanged and derives coverage from `GAMES`.
- `src/lib/games/core/GameInitializer.ts` has no current production game importers and lacks Pattern Pulse-specific shortcut/HUD hooks; deliberately follow the custom Mine Grid-style initializer instead of adopting/refactoring it.
- Edit `CLAUDE.md`, not its `AGENTS.md` symlink.
- Codecov project/patch targets are **90%** with zero threshold leniency.

## Load-Bearing Risks

- **Queued playback after timeout/reset:** short-duration tests must prove later timer advancement cannot re-light a pad or reopen input.
- **Static child ownership:** renderer destroy must preserve all four Astro buttons and support re-initialization.
- **Focus loss:** `aria-disabled` must preserve a focused pad while watch/feedback gates clicks.
- **Fake timer collision:** active-run tests use bounded `advanceTimersByTime`; use `runAllTimers` only after Reset has stopped BaseGame's countdown interval.
- **Async save race:** reuse BaseGame's existing run guard; no game-local token.

---

### Task 1: Define contracts and the single production scoring function

**Files:**
- Create: `src/lib/games/pattern-pulse/types.ts`
- Create: `src/lib/games/pattern-pulse/scoring.ts`
- Create: `src/lib/games/pattern-pulse/scoring.test.ts`

**Interfaces:**
- Produces: `PatternPad`, phase/outcome/feedback unions, `PatternPulseConfig`, state/stats/game-data contracts, `PATTERN_PULSE_TIMING`, `createPatternPulseConfig()`, `calculatePatternPulseRoundScore()`.

- [ ] **Step 1: Create the contracts and runtime timing source**

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
}
```

- [ ] **Step 2: Write RED scoring tests**

```typescript
// src/lib/games/pattern-pulse/scoring.test.ts
import { describe, expect, it } from 'vitest'
import { calculatePatternPulseRoundScore } from './scoring'

describe('calculatePatternPulseRoundScore', () => {
    it('scores sequence length plus first-round speed', () => {
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

    it('caps and floors speed bonus', () => {
        expect(calculatePatternPulseRoundScore({
            sequenceLength: 3,
            streak: 1,
            averageResponseMs: 0,
        })).toBe(500)
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

Expected: FAIL because `scoring.ts` does not exist.

- [ ] **Step 3: Implement the scorer**

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
    const responseMs = Math.max(0, averageResponseMs)
    const speedBonus = Math.max(
        0,
        Math.min(200, 200 - Math.floor(responseMs / 5))
    )
    return completionPoints + streakBonus + speedBonus
}
```

Run:

```bash
bun run test:run src/lib/games/pattern-pulse/scoring.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/games/pattern-pulse/types.ts src/lib/games/pattern-pulse/scoring.ts src/lib/games/pattern-pulse/scoring.test.ts
git commit -m "feat(pattern-pulse): add contracts and scoring"
```

---

### Task 2: Implement the BaseGame sequence state machine and lifecycle

**Files:**
- Create: `src/lib/games/pattern-pulse/PatternPulseGame.ts`
- Create: `src/lib/games/pattern-pulse/PatternPulseGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`
- Reuse unchanged: `src/lib/games/core/GameTimer.ts`

**Interfaces:**
- Consumes Task 1 types/scorer and `GameID.PATTERN_PULSE` once Task 5 registers it.
- Produces `pressPad(pad)`, state-change events, `getConfig()`, stats and minimal submitted data.

- [ ] **Step 1: Write deterministic RED start/playback coverage**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternPulseGame } from './PatternPulseGame'
import { createPatternPulseConfig, type PatternPad } from './types'

function advanceToInput(game: PatternPulseGame): void {
    for (let i = 0; i < 100 && game.getState().phase !== 'input'; i++) {
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
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-20T00:00:00Z'))
    })

    afterEach(() => vi.useRealTimers())

    it('creates exactly three initial pads and rejects watch input', () => {
        const values = [0, 0.3, 0.6]
        const rng = vi.fn(() => values.shift() ?? 0)
        const game = new PatternPulseGame(createPatternPulseConfig({ rng }))

        expect(game.getState().sequence).toEqual([0, 1, 2])
        expect(rng).toHaveBeenCalledTimes(3)
        game.start()
        expect(game.getState().phase).toBe('watch')
        expect(game.pressPad(0)).toBe(false)
        advanceToInput(game)
    })
})
```

Run and expect RED:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseGame.test.ts
```

- [ ] **Step 2: Implement the BaseGame shell and one-timeout playback loop**

The class shape is:

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

    getConfig(): PatternPulseConfig {
        return { ...this.config }
    }

    cleanup(): void {
        this.clearScheduled()
    }
}
```

Use the Task 1 timing export everywhere:

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

`onGameStart()` calls `beginPlayback()`. `beginPlayback()` sets watch state/index, emits, then schedules the first cue after `PATTERN_PULSE_TIMING.prePlaybackDelayMs`. Each cue sets `activePad`, waits `pulseMs()`, clears it, waits `pulseGapMs`, and advances. After the final gap, `beginInput()` resets `inputIndex`/response total and sets:

```typescript
this.lastInputAtMs = Date.now()
this.state.phase = 'input'
this.emitStateChange()
```

- [ ] **Step 3: RED/GREEN successful sequence + real Date timing**

Write a behavior test instead of a clock-call-count test:

```typescript
it('scores a 500ms average response using Date.now under fake timers', () => {
    const values = [0, 0.3, 0.6, 0.9]
    const game = new PatternPulseGame(createPatternPulseConfig({
        rng: () => values.shift() ?? 0,
    }))

    game.start()
    advanceToInput(game)

    for (const pad of [0, 1, 2] as const) {
        vi.advanceTimersByTime(500)
        expect(game.pressPad(pad)).toBe(true)
    }

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
})
```

Accepted correct input:

```typescript
const nowMs = Date.now()
this.responseTotalMs += Math.max(0, nowMs - this.lastInputAtMs)
this.lastInputAtMs = nowMs
this.state.inputIndex++
```

On full sequence:

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

- [ ] **Step 4: RED/GREEN recoverable and terminal mistakes**

```typescript
it('replays the same sequence and resets streak after a mistake', () => {
    const game = new PatternPulseGame(createPatternPulseConfig({ rng: () => 0 }))
    const before = [...game.getState().sequence]
    game.start()
    advanceToInput(game)

    expect(game.pressPad(1)).toBe(true)
    expect(game.getState()).toMatchObject({
        mistakes: 1,
        streak: 0,
        phase: 'feedback',
        feedback: 'wrong',
        activePad: 1,
        score: 0,
    })

    vi.advanceTimersByTime(PATTERN_PULSE_TIMING.feedbackMs)
    expect(game.getState().sequence).toEqual(before)
})
```

Wrong branch:

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

Add a one-pad fixture that makes three wrong attempts and asserts `isGameOver=true`, `gameCompleted=true`, `outcome='mistakes'`.

- [ ] **Step 5: Add the timeout-during-playback regression before renderer work**

```typescript
it('cancels queued playback when BaseGame times out', () => {
    const game = new PatternPulseGame(createPatternPulseConfig({
        duration: 1,
        rng: () => 0,
    }))

    game.start()
    vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
    expect(game.getState()).toMatchObject({ phase: 'watch', activePad: 0 })

    vi.advanceTimersByTime(650)
    expect(game.getState()).toMatchObject({
        phase: 'ended',
        outcome: 'timeout',
        activePad: null,
        score: 0,
        isGameOver: true,
    })
    expect(game.getGameStats().gameCompleted).toBe(true)
    expect(game.pressPad(0)).toBe(false)

    vi.advanceTimersByTime(5_000)
    expect(game.getState()).toMatchObject({
        phase: 'ended',
        outcome: 'timeout',
        activePad: null,
        score: 0,
    })
    expect(game.pressPad(0)).toBe(false)
})
```

Override:

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

- [ ] **Step 6: Lock reset, duplicates, stats, and BaseGame-compatible game data**

Reset test may use `vi.runAllTimers()` only after `game.reset()` has stopped BaseGame's interval. Duplicate test uses `rng: () => 0`, enters `[0, 0, 0]`, and completes one round.

Implement stats/data exactly:

```typescript
getGameStats(): PatternPulseStats {
    return {
        finalScore: this.state.score,
        timeElapsed: Math.floor(this.getTimerStatus().elapsedTime),
        gameCompleted: this.state.isGameOver,
        outcome: this.state.outcome,
        completedRounds: this.state.completedRounds,
        longestSequence: this.state.longestSequence,
        mistakes: this.state.mistakes,
        maxStreak: this.state.maxStreak,
    }
}

protected getGameData(): Record<string, unknown> {
    return {
        completedRounds: this.state.completedRounds,
        longestSequence: this.state.longestSequence,
        mistakes: this.state.mistakes,
        maxStreak: this.state.maxStreak,
    }
}
```

`onGameReset()` clears private timeout/playback/timing fields and emits the fresh idle state.

Run:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseGame.test.ts src/lib/games/pattern-pulse/scoring.test.ts
bun run typecheck
```

Expected: PASS / 0 new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/pattern-pulse/PatternPulseGame.ts src/lib/games/pattern-pulse/PatternPulseGame.test.ts
git commit -m "feat(pattern-pulse): add memory sequence game state"
```

---

### Task 3: Add the focus-preserving static-pad renderer

**Files:**
- Create: `src/lib/games/pattern-pulse/PatternPulseRenderer.ts`
- Create: `src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts`
- Reuse unchanged: `src/lib/games/renderers/DOMRenderer.ts`

**Interfaces:**
- Consumes exactly four static `button[data-pattern-pad]` nodes.
- Produces `setPadPressCallback((pad) => void)`.

- [ ] **Step 1: Write RED renderer ownership/input/focus tests**

Mount four native buttons. Test:

```typescript
it('keeps a focused pad focusable while watch gates activation', async () => {
    const renderer = new PatternPulseRenderer()
    const onPad = vi.fn()
    renderer.setPadPressCallback(onPad)
    await renderer.initialize()

    renderer.render(inputState())
    const pad = document.querySelector<HTMLButtonElement>('[data-pattern-pad="1"]')!
    pad.focus()
    expect(document.activeElement).toBe(pad)

    renderer.render(watchState(1))
    expect(pad.disabled).toBe(false)
    expect(pad).toHaveAttribute('aria-disabled', 'true')
    expect(document.activeElement).toBe(pad)
    pad.click()
    expect(onPad).not.toHaveBeenCalled()

    renderer.render(inputState())
    expect(pad).toHaveAttribute('aria-disabled', 'false')
    expect(document.activeElement).toBe(pad)
    pad.click()
    expect(onPad).toHaveBeenCalledWith(1)
})
```

Also prove active/wrong attributes and static-child ownership:

```typescript
it('destroy preserves pads and allows re-initialization', async () => {
    const renderer = new PatternPulseRenderer()
    await renderer.initialize()
    renderer.render(inputState())
    renderer.destroy()

    expect(document.querySelectorAll('button[data-pattern-pad]')).toHaveLength(4)

    await renderer.initialize()
    renderer.render(inputState())
    expect(document.querySelectorAll('button[data-pattern-pad]')).toHaveLength(4)
})
```

Run and expect RED:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
```

- [ ] **Step 2: Implement one delegated listener and `aria-disabled` rendering**

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
        if (!this.isPatternPulseState(rawState)) return
        this.acceptingInput = rawState.isActive && rawState.phase === 'input'

        for (const button of this.padButtons) {
            const pad = Number(button.dataset.patternPad) as PatternPad
            const active = rawState.activePad === pad
            button.setAttribute('aria-disabled', String(!this.acceptingInput))
            button.dataset.active = String(active)
            button.dataset.feedback =
                active && rawState.feedback === 'wrong' ? 'wrong' : 'none'
        }
    }

    cleanup(): void {
        this.removeEventListener('click', this.clickHandler)
        for (const button of this.padButtons) {
            button.removeAttribute('aria-disabled')
            delete button.dataset.active
            delete button.dataset.feedback
        }
        this.padButtons = []
        this.acceptingInput = false
        // No super.cleanup(): DOMRenderer.cleanup() would clear Astro-owned pads.
    }

    private isPatternPulseState(value: unknown): value is PatternPulseState {
        return Boolean(
            value &&
                typeof value === 'object' &&
                Array.isArray((value as PatternPulseState).sequence) &&
                typeof (value as PatternPulseState).phase === 'string'
        )
    }
}
```

Run and expect GREEN:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/games/pattern-pulse/PatternPulseRenderer.ts src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
git commit -m "feat(pattern-pulse): add static-pad DOM renderer"
```

---

### Task 4: Wire the Astro page and custom initializer

**Files:**
- Create: `src/lib/games/pattern-pulse/initFramework.ts`
- Create: `src/lib/games/pattern-pulse/initFramework.test.ts`
- Create: `src/pages/pattern-pulse/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**
- Outer guard `#pattern-pulse-container`.
- Renderer mount `#pattern-pulse-board`.
- GamePage controls `#start-btn`, `#reset-btn`, `#play-again-btn`, result overlay.
- Debug handle `window.patternPulseGame`.

- [ ] **Step 1: Create and lock the static page before registry activation**

Add a markup fixture/test before adding `pattern-pulse` to the common wrapper list:

```typescript
const patternPulseMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/pattern-pulse/index.astro'),
    'utf-8'
)

expect(patternPulseMarkup).toContain('id="pattern-pulse-container"')
expect(patternPulseMarkup).toContain('id="pattern-pulse-board"')
expect(patternPulseMarkup.match(/data-pattern-pad="[0-3]"/g)).toHaveLength(4)
expect(patternPulseMarkup).toContain('id="pattern-status"')
expect(patternPulseMarkup).toMatch(
    /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initPatternPulseGameFramework/
)
```

Create `src/pages/pattern-pulse/index.astro` with `GamePage`:

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
    <p id="pattern-status" aria-live="polite">READY</p>
  </div>
```

Add additional stat IDs `sequence-length`, `completed-rounds`, `streak`, `mistakes`; final IDs `final-outcome`, `final-rounds`, `final-longest-sequence`, `final-max-streak`, `final-mistakes`; concise How to Play/Scoring cards; root-level initialization script.

The pad CSS must use a transition **≤100 ms**. Use an explicit 80 ms value:

```css
.pattern-pulse-pad {
    transition:
        transform 80ms ease,
        border-color 80ms ease,
        background-color 80ms ease,
        box-shadow 80ms ease;
}
.pattern-pulse-pad[data-active='true'] {
    transform: scale(1.04);
}
@media (prefers-reduced-motion: reduce) {
    .pattern-pulse-pad { transition: none; }
    .pattern-pulse-pad[data-active='true'] { transform: none; }
}
```

Do not add `disabled:` styling because pads are never natively disabled; style `[aria-disabled='true']` if a gated visual treatment is needed.

- [ ] **Step 2: Write RED initializer tests with the real `document` shortcut target**

Use fake timers and bounded initial playback advancement. Numeric shortcut test:

```typescript
it('maps a document numeric shortcut during input', async () => {
    const handle = await initPatternPulseGameFramework()
    expect(handle).toBeDefined()
    handle?.game.start()
    vi.advanceTimersByTime(4_000)
    expect(handle?.game.getState().phase).toBe('input')

    const first = handle?.game.getState().sequence[0] ?? 0
    document.dispatchEvent(new KeyboardEvent('keydown', {
        key: String(first + 1),
        bubbles: true,
    }))
    expect(handle?.game.getState().inputIndex).toBe(1)
})
```

Editable-target test must bubble from the real target:

```typescript
it('ignores numeric shortcuts from an editable target', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const handle = await initPatternPulseGameFramework()
    handle?.game.start()
    vi.advanceTimersByTime(4_000)

    input.dispatchEvent(new KeyboardEvent('keydown', {
        key: '1',
        bubbles: true,
    }))
    expect(handle?.game.getState().inputIndex).toBe(0)
})
```

Also prove missing-container error handling, renderer click input, HUD updates, score/time callbacks, Reset/Play Again, achievement/challenge forwarding, beforeunload, static-pad preservation after cleanup, and idempotent cleanup.

- [ ] **Step 3: Implement the custom initializer**

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

Use the Mine Grid-style tracked-listener helper and attach:

```typescript
listen(document, 'keydown', keyboardHandler)
```

`keyboardHandler` checks editable target, converts key, then calls `game.pressPad(pad)`; the game remains the final phase authority.

Use one renderer/game, existing error helpers, state/score/time callbacks, BaseGame end-event achievement/challenge forwarding, beforeunload, and one `cleanedUp` guard. Cleanup removes initializer listeners, detaches the end handler, then calls `renderer.destroy()` and `game.destroy()`.

Return:

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

- [ ] **Step 4: Add `pattern-pulse` to the common GamePage wrapper list and run focused GREEN**

```bash
bun run test:run src/lib/games/pattern-pulse src/pages/game-board-markup.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/pattern-pulse/initFramework.ts src/lib/games/pattern-pulse/initFramework.test.ts src/pages/pattern-pulse/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(pattern-pulse): wire accessible game page"
```

---

### Task 5: Register the game and add typed achievements

**Files:**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Reuse unchanged: score service, score API, database files

- [ ] **Step 1: Write RED registry tests**

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

- [ ] **Step 2: Add enum, registry record, icon**

Add `PATTERN_PULSE = 'pattern_pulse'`, the exact registry object above, and `[GameID.PATTERN_PULSE]: '🔁'`. Do not edit `getGameUrl()`.

Run and expect GREEN:

```bash
bun run test:run src/lib/games.test.ts
```

- [ ] **Step 3: Extend the shared typed data union**

```typescript
export type PatternPulseGameData =
    import('../pattern-pulse/types').PatternPulseGameData
```

Add `PatternPulseGameData` to `GameData`; import/include it in `AchievementCheckData`.

- [ ] **Step 4: Add four achievement tests then definitions**

Lock conditions:

```text
pattern_pulse_welcome    score >= 1
pattern_pulse_streak_3   maxStreak >= 3
pattern_pulse_sequence_8 longestSequence >= 8
pattern_pulse_perfect    completedRounds >= 3 && mistakes === 0
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

Expected: PASS / 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts src/lib/achievements.ts src/lib/achievements.test.ts
git commit -m "feat(pattern-pulse): register game and achievements"
```

---

### Task 6: Add browser coverage, update inventory, and run final gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- Modify: `CLAUDE.md`
- Verify unchanged: `e2e/games/all-games-navigation.spec.ts`
- Verify symlink: `AGENTS.md`

- [ ] **Step 1: Add phase-polled Playwright coverage**

```typescript
test.describe('Pattern Pulse', () => {
    test('completes one random sequence and accepts a numeric shortcut', async ({ page }) => {
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
})
```

Do not add `waitForTimeout()` or a test-only seed mode.

- [ ] **Step 2: Update factual `CLAUDE.md` inventory only**

- 16 → **17** implemented games; append Pattern Pulse.
- Add `pattern-pulse/` to project structure.
- DOM renderer list becomes Memory Matrix, Mine Grid, Pattern Pulse.
- Add note: `Pattern Pulse: BaseGame + DOMRenderer four-pad memory-sequence game`.
- “all 16” → **all 17**.
- Game Count 16 → **17**.
- Framework count `13 of 16` → **14 of 17**; Circuit Hacker, Satellite Sync, Ice Slide stay the same three handle-based games.

- [ ] **Step 3: Verify `AGENTS.md` remains the symlink**

```bash
test -L AGENTS.md
test "$(readlink AGENTS.md)" = "CLAUDE.md"
```

- [ ] **Step 4: Run focused and repository gates**

```bash
bun run test:run src/lib/games/pattern-pulse
bun run test:run src/lib/games.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
bun run test:coverage
bun run test:run
```

Expected: all repository gates pass; remote Codecov project and patch checks meet 90%.

- [ ] **Step 5: Review scope before final commit**

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

Planning docs are also expected if implementation continues on the planning branch. No core framework, renderer framework, GameInitializer, DB, API, auth, score-service, or `all-games-navigation.spec.ts` source change should appear.

- [ ] **Step 6: Commit closeout**

```bash
git add e2e/games/play-coverage.spec.ts CLAUDE.md
git commit -m "test(pattern-pulse): cover browser flow and inventory"
```

## Final Definition of Done

- Four static symbol+number pads render at `/pattern-pulse`.
- Run ends at 60 seconds or the third mistake.
- Initial sequence is 3; each success adds exactly 1 pad; duplicates are playable.
- Recoverable mistakes replay the same sequence and reset streak.
- Playback uses only `PATTERN_PULSE_TIMING` and follows the 600 ms → 320 ms requirement.
- Only complete sequences score via `calculatePatternPulseRoundScore()`.
- Response-speed tests use `Date.now()` controlled by fake time; no injected clock exists.
- Reset/end/timeout cannot leak queued cues.
- Renderer preserves Astro-owned pads and keyboard focus through gated phases using `aria-disabled`.
- Pad CSS transition is ≤100 ms.
- Touch/mouse, Enter/Space, and document-level `1`–`4` shortcuts work.
- `getGameData()` compiles with `Record<string, unknown>` while shared achievement typing retains `PatternPulseGameData`.
- Existing BaseGame score/achievement/challenge flow is reused unchanged.
- Registry/icon/four achievements/markup/browser coverage are present.
- No backend/schema/core/GameInitializer/Pixi/audio/generic-sequence work was added.
- `CLAUDE.md` reports 17 games / 14 BaseGame-native games and `AGENTS.md` remains a symlink.
- Focused/full tests, typecheck, lint, format, build, browser gates, and coverage pass.
