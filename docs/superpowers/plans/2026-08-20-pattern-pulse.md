# Pattern Pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Pattern Pulse, a one-minute four-pad memory-sequence game with increasing sequences, recoverable mistakes, streak/response-speed scoring, accessible desktop/mobile input, achievements, and the existing Cetus score/leaderboard flow.

**Architecture:** `PatternPulseGame` extends `BaseGame` and owns a small event-driven watch/input/feedback state machine plus exactly one scheduled browser timeout. `PatternPulseRenderer` extends `DOMRenderer` for container/setup helpers but treats the four pad buttons as Astro-owned static children, so its cleanup is deliberately listener/attribute-only rather than `DOMRenderer.cleanup()` child destruction. BaseGame remains unchanged and owns countdown, score submission, final-timer reporting, reset lifecycle, and stale async-save protection.

**Tech Stack:** Astro 5 + TypeScript, Tailwind CSS 4, existing BaseGame/DOMRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-20-pattern-pulse-design.md`

## Global Constraints

- Package manager is **Bun** (`bun@1.3.1`).
- One HPA-74 task maps to one implementation PR; registration and achievements stay in that PR.
- Game ID **`pattern_pulse`**, route **`/pattern-pulse`**, title **`Pattern Pulse`**, icon **`🔁`**.
- Fixed v1: 60 seconds, 4 pads, initial sequence length 3, mistake limit 3.
- Playback: 600 ms initial pulse, 40 ms faster per completed round, 320 ms floor, 140 ms gap, 400 ms pre-play delay, 500 ms feedback.
- Successful round appends exactly one random pad. Recoverable mistake replays the same sequence and resets streak.
- Consecutive duplicate pads are legal; do not add anti-repeat generation.
- Accept player input only in `phase === 'input'`.
- Exactly one Pattern Pulse `setTimeout` may be pending. Clear it on reset, terminal mistake, timeout, and cleanup.
- Inject `rng: () => number` and `now: () => number`; do not inject timer APIs.
- RNG sampling is frozen: fresh state = `initialSequenceLength` calls, successful growth = one call, playback/wrong attempts = zero calls.
- Clock sampling is frozen: one `now()` call entering input and one per accepted correct pad; playback and the wrong-pad branch do not sample `now()`.
- BaseGame scoring config uses `timeBonus: false`.
- Frozen round score:

```text
completionPoints = sequenceLength * 100
streakBonus = max(0, streak - 1) * 50
speedBonus = clamp(200 - floor(averageResponseMs / 5), 0, 200)
roundScore = completionPoints + streakBonus + speedBonus
```

- Mistakes do not directly subtract score.
- `PatternPulseStats.gameCompleted` is `this.state.isGameOver`; both timeout and third-mistake finishes are completed/scored runs.
- `PatternPulseGameData` contains only `completedRounds`, `longestSequence`, `mistakes`, and `maxStreak`. Do **not** add `perfectRun`; Clean Signal checks `completedRounds >= 3 && mistakes === 0` directly.
- Use `BaseGame + DOMRenderer`; no handle runtime, generic sequence engine, PixiJS loop, Web Audio, haptics, difficulty selector, extra pad layouts, Daily mode, persistence, new DB/API/score endpoint, or per-input timeout.
- All four pad buttons and static page structure live in Astro. TypeScript only toggles attributes/text.
- Pad identities: `1 ▲`, `2 ●`, `3 ◆`, `4 ✦`.
- Mouse/touch use native buttons. Keys `1`–`4` map to pads `0`–`3`; Enter/Space remain native button activation. Numeric shortcuts ignore editable targets.
- `#pattern-pulse-container` is the initializer guard; `#pattern-pulse-board` is the renderer mount.
- `PatternPulseRenderer.cleanup()` must **not** call `super.cleanup()`: `DOMRenderer.cleanup()` clears its mount, while these children are Astro-owned. Pattern Pulse sets neither `responsive` nor `containerClass`, so no DOMRenderer-owned listener/class needs teardown.
- Create `/pattern-pulse` before activating the registry entry because `games.test.ts` verifies every active game has a route.
- `getGameUrl()` is unchanged; it already derives `/pattern-pulse` from `pattern_pulse`.
- `e2e/games/all-games-navigation.spec.ts` is registry-derived and stays source-unchanged.
- Edit `CLAUDE.md`, not its `AGENTS.md` symlink.
- Current Codecov project/patch targets are **90%** with zero threshold leniency.

## Risks to Lock Before UI Work

- **Timeout during queued playback:** the one-second test must expire BaseGame while playback still has scheduled work, then advance several more seconds and prove no cue/input reappears.
- **Reset during queued playback:** Reset stops BaseGame's interval; only after that may a test safely use `vi.runAllTimers()`.
- **Static pad ownership:** renderer destroy must leave the four Astro buttons in place and permit re-initialization against the same fixture.
- **Clock/RNG drift:** tests assert call counts so the scoring/generation contract cannot change because of extra incidental reads.
- **Async score save:** reuse BaseGame's existing run guard; do not add a Pattern Pulse token.

---

### Task 1: Define contracts and pure round scoring

**Files**
- Create `src/lib/games/pattern-pulse/types.ts`
- Create `src/lib/games/pattern-pulse/scoring.ts`
- Create `src/lib/games/pattern-pulse/scoring.test.ts`

**Produces**
- `PatternPad`, phase/outcome/feedback unions
- `PatternPulseConfig`, state/stats/game-data contracts
- `PATTERN_PULSE_TIMING`, `createPatternPulseConfig()`
- `calculatePatternPulseRoundScore()`

- [ ] **1.1 Create the contracts/config**

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
}
```

- [ ] **1.2 Write RED scoring tests**

```typescript
// src/lib/games/pattern-pulse/scoring.test.ts
import { describe, expect, it } from 'vitest'
import { calculatePatternPulseRoundScore } from './scoring'

describe('calculatePatternPulseRoundScore', () => {
    it('scores length and first-round speed', () => {
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

Expected: RED because `scoring.ts` does not exist.

- [ ] **1.3 Implement the scorer and rerun GREEN**

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

```bash
bun run test:run src/lib/games/pattern-pulse/scoring.test.ts
```

- [ ] **1.4 Commit**

```bash
git add src/lib/games/pattern-pulse/types.ts src/lib/games/pattern-pulse/scoring.ts src/lib/games/pattern-pulse/scoring.test.ts
git commit -m "feat(pattern-pulse): add contracts and scoring"
```

---

### Task 2: Implement and freeze the BaseGame state machine

**Files**
- Create `src/lib/games/pattern-pulse/PatternPulseGame.ts`
- Create `src/lib/games/pattern-pulse/PatternPulseGame.test.ts`
- Reuse unchanged `src/lib/games/core/BaseGame.ts`
- Reuse unchanged `src/lib/games/core/GameTimer.ts`

**Produces**
- `PatternPulseGame.pressPad(pad)`
- watch/input/feedback scheduling
- response timing, mistakes/streaks, stats/game data

- [ ] **2.1 Add deterministic helpers and RED start/playback coverage**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternPulseGame } from './PatternPulseGame'
import { createPatternPulseConfig, type PatternPad } from './types'

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

    it('creates three deterministic pads and rejects watch-phase input', () => {
        const values = [0, 0.3, 0.6]
        const rng = vi.fn(() => values.shift() ?? 0)
        const game = new PatternPulseGame(createPatternPulseConfig({ rng }))

        expect(game.getState().sequence).toEqual([0, 1, 2])
        expect(rng).toHaveBeenCalledTimes(3)
        game.start()
        expect(game.getState().phase).toBe('watch')
        expect(game.pressPad(0)).toBe(false)
        advanceToInput(game)
        expect(rng).toHaveBeenCalledTimes(3)
    })
})
```

Run and expect RED:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseGame.test.ts
```

- [ ] **2.2 Implement the BaseGame shell and exactly-one-timeout playback loop**

Use:

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

    getConfig(): PatternPulseConfig {
        return { ...this.config }
    }
}
```

Timing primitives:

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

`onGameStart()` enters `watch`, waits 400 ms, then alternates `activePad=<sequence[index]>` for `pulseMs()` and `activePad=null` for 140 ms. After the final gap, enter `input`, reset `inputIndex`/response total, and sample `lastInputAtMs = this.config.now()` exactly once.

- [ ] **2.3 Freeze `now()` and RNG call sites while implementing success**

Use a clock spy whose values only make sense under the frozen sampling contract:

```typescript
it('samples now only at input-open and accepted correct pads', () => {
    const rngValues = [0, 0.3, 0.6, 0.9]
    const rng = vi.fn(() => rngValues.shift() ?? 0)
    const now = vi
        .fn<() => number>()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(500)
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1500)

    const game = new PatternPulseGame(createPatternPulseConfig({ rng, now }))
    expect(rng).toHaveBeenCalledTimes(3)
    expect(now).not.toHaveBeenCalled()

    game.start()
    advanceToInput(game)
    expect(now).toHaveBeenCalledTimes(1)
    expect(rng).toHaveBeenCalledTimes(3)

    enterSequence(game, [0, 1, 2])
    expect(now).toHaveBeenCalledTimes(4)
    expect(game.getState()).toMatchObject({
        score: 400,
        completedRounds: 1,
        streak: 1,
        maxStreak: 1,
        longestSequence: 3,
        phase: 'feedback',
        feedback: 'correct',
    })
    expect(rng).toHaveBeenCalledTimes(3)

    vi.advanceTimersByTime(PATTERN_PULSE_TIMING.feedbackMs)
    expect(game.getState().sequence).toEqual([0, 1, 2, 3])
    expect(rng).toHaveBeenCalledTimes(4)
})
```

Accepted correct pad implementation:

```typescript
const nowMs = this.config.now()
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

- [ ] **2.4 Implement recoverable/terminal mistakes and prove wrong input adds no clock/RNG reads**

```typescript
it('replays the same sequence and does not sample rng/now on a wrong first pad', () => {
    const rngValues = [0, 0.3, 0.6]
    const rng = vi.fn(() => rngValues.shift() ?? 0)
    const now = vi.fn(() => 100)
    const game = new PatternPulseGame(createPatternPulseConfig({ rng, now }))

    game.start()
    advanceToInput(game)
    const before = [...game.getState().sequence]
    const nowCallsBeforeWrong = now.mock.calls.length
    const rngCallsBeforeWrong = rng.mock.calls.length

    expect(game.pressPad(3)).toBe(true)
    expect(now).toHaveBeenCalledTimes(nowCallsBeforeWrong)
    expect(rng).toHaveBeenCalledTimes(rngCallsBeforeWrong)
    expect(game.getState()).toMatchObject({
        mistakes: 1,
        streak: 0,
        phase: 'feedback',
        feedback: 'wrong',
        activePad: 3,
    })

    vi.advanceTimersByTime(PATTERN_PULSE_TIMING.feedbackMs)
    expect(game.getState().sequence).toEqual(before)
    expect(rng).toHaveBeenCalledTimes(rngCallsBeforeWrong)
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

Add a one-pad deterministic test that makes three wrong attempts and asserts after the third:

```typescript
expect(game.getState()).toMatchObject({
    mistakes: 3,
    outcome: 'mistakes',
    phase: 'ended',
    isGameOver: true,
})
expect(game.getGameStats().gameCompleted).toBe(true)
```

- [ ] **2.5 Add the load-bearing timeout-during-playback RED/GREEN regression**

Use a short duration exactly as other BaseGame game tests do. Do not use `runAllTimers()` while active:

```typescript
it('cancels queued playback when the BaseGame timer expires', () => {
    const game = new PatternPulseGame(createPatternPulseConfig({
        duration: 1,
        rng: () => 0,
    }))

    game.start()
    vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
    expect(game.getState()).toMatchObject({
        phase: 'watch',
        activePad: 0,
        score: 0,
    })

    // Cross the BaseGame one-second timer boundary while playback still has
    // queued work. If the pad-off callback wins the exact 1000ms ordering,
    // handleTimeUp must still clear the newly queued gap callback.
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

Timeout override:

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

- [ ] **2.6 Lock reset, repeated pads, stats, and minimal submitted data**

Reset regression:

```typescript
it('cannot leak a queued cue after reset', () => {
    const game = new PatternPulseGame(createPatternPulseConfig({ rng: () => 0 }))
    game.start()
    vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
    expect(game.getState().activePad).toBe(0)

    game.reset()
    expect(game.getState().phase).toBe('idle')
    vi.runAllTimers() // safe here: BaseGame.reset() already stopped its interval
    expect(game.getState()).toMatchObject({
        phase: 'idle',
        activePad: null,
        outcome: 'playing',
    })
})
```

Repeated-pad regression uses `rng: () => 0`, enters `[0, 0, 0]`, and asserts one completed round.

Stats/data implementations:

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

protected getGameData(): PatternPulseGameData {
    return {
        completedRounds: this.state.completedRounds,
        longestSequence: this.state.longestSequence,
        mistakes: this.state.mistakes,
        maxStreak: this.state.maxStreak,
    }
}
```

`onGameReset()` clears the Pattern Pulse timeout/private timing fields and emits the fresh idle state.

Run:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseGame.test.ts src/lib/games/pattern-pulse/scoring.test.ts
```

Expected: GREEN, including timeout-during-playback and sampling-count tests.

- [ ] **2.7 Commit**

```bash
git add src/lib/games/pattern-pulse/PatternPulseGame.ts src/lib/games/pattern-pulse/PatternPulseGame.test.ts
git commit -m "feat(pattern-pulse): add memory sequence game state"
```

---

### Task 3: Add the fixed four-pad renderer without destroying Astro-owned children

**Files**
- Create `src/lib/games/pattern-pulse/PatternPulseRenderer.ts`
- Create `src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts`
- Reuse unchanged `src/lib/games/renderers/DOMRenderer.ts`

- [ ] **3.1 Write RED renderer ownership/input tests**

Mount:

```typescript
document.body.innerHTML = `
    <div id="pattern-pulse-board">
        <button data-pattern-pad="0" type="button">1 ▲</button>
        <button data-pattern-pad="1" type="button">2 ●</button>
        <button data-pattern-pad="2" type="button">3 ◆</button>
        <button data-pattern-pad="3" type="button">4 ✦</button>
    </div>
`
```

Use a complete `PatternPulseState` fixture and assert:

```typescript
it('delegates one enabled-pad click', async () => {
    const renderer = new PatternPulseRenderer()
    const onPad = vi.fn()
    renderer.setPadPressCallback(onPad)
    await renderer.initialize()
    renderer.render(inputState())
    document.querySelector<HTMLButtonElement>('[data-pattern-pad="2"]')?.click()
    expect(onPad).toHaveBeenCalledOnce()
    expect(onPad).toHaveBeenCalledWith(2)
})

it('disables input while watching and marks the active pad', async () => {
    const renderer = new PatternPulseRenderer()
    await renderer.initialize()
    renderer.render(watchState(1))
    const pad = document.querySelector<HTMLButtonElement>('[data-pattern-pad="1"]')
    expect(pad?.disabled).toBe(true)
    expect(pad?.dataset.active).toBe('true')
})

it('destroy preserves all Astro-owned pads and supports re-initialization', async () => {
    const renderer = new PatternPulseRenderer()
    const onPad = vi.fn()
    renderer.setPadPressCallback(onPad)
    await renderer.initialize()
    renderer.render(inputState())

    renderer.destroy()
    expect(document.querySelectorAll('button[data-pattern-pad]')).toHaveLength(4)
    document.querySelector<HTMLButtonElement>('[data-pattern-pad="0"]')?.click()
    expect(onPad).not.toHaveBeenCalled()

    await renderer.initialize()
    renderer.render(inputState())
    document.querySelector<HTMLButtonElement>('[data-pattern-pad="0"]')?.click()
    expect(onPad).toHaveBeenCalledOnce()
})
```

Run and expect RED:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
```

- [ ] **3.2 Implement delegated click + attribute-only rendering**

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
        for (const button of this.padButtons) {
            button.disabled = false
            delete button.dataset.active
            delete button.dataset.feedback
        }
        this.padButtons = []
        this.acceptingInput = false
        // Intentionally do not call super.cleanup(): DOMRenderer.cleanup()
        // clearContainer() would delete Astro-owned pad buttons. This renderer
        // does not enable DOMRenderer responsive/containerClass resources.
    }
}
```

The local type guard checks object-ness, `Array.isArray(sequence)`, and string `phase`; do not add a schema dependency.

Run and expect GREEN:

```bash
bun run test:run src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
```

- [ ] **3.3 Commit**

```bash
git add src/lib/games/pattern-pulse/PatternPulseRenderer.ts src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
git commit -m "feat(pattern-pulse): add static-pad DOM renderer"
```

---

### Task 4: Wire the Astro page and initializer as one DOM contract

**Files**
- Create `src/lib/games/pattern-pulse/initFramework.ts`
- Create `src/lib/games/pattern-pulse/initFramework.test.ts`
- Create `src/pages/pattern-pulse/index.astro`
- Modify `src/pages/game-board-markup.test.ts`

- [ ] **4.1 Create the page before registry activation and lock its static markup**

Add a markup fixture/assertion:

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

Create `/pattern-pulse/index.astro` using `GamePage`:

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
```

Static game-board content:

```astro
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

Add additional-stat IDs `sequence-length`, `completed-rounds`, `streak`, `mistakes`; final-stat IDs `final-outcome`, `final-rounds`, `final-longest-sequence`, `final-max-streak`, `final-mistakes`; concise rules/scoring cards; and a root-level initializer script that assigns the returned handle to `window.patternPulseGame`.

Page CSS must keep symbols visible in every state, use border/glow/scale in addition to color, provide focus-visible treatment, and remove transforms/transitions under `prefers-reduced-motion`.

- [ ] **4.2 Write initializer RED tests with bounded fake time**

For active-run tests:

```typescript
const advanceInitialPlayback = (): void => {
    vi.advanceTimersByTime(4_000)
}
```

Do not use `vi.runAllTimers()` while BaseGame's countdown is active.

Numeric shortcut test:

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
```

Editable-target test dispatches the same key from a focused/input element and asserts `inputIndex` remains `0`.

Other exact assertions:

- missing `#pattern-pulse-container` returns `undefined` through `handleGameError`;
- clicking a renderer pad in input advances `inputIndex`;
- state changes update `pattern-status`, sequence length, rounds, streak, mistakes;
- BaseGame score/time callbacks update `#score` / `#time-remaining`;
- Reset and Play Again restore `READY`, hide result overlay, and show Start;
- end event forwards non-empty achievement/challenge payloads exactly once;
- active run installs beforeunload protection;
- `cleanup()` removes tracked page/window listeners and is idempotent;
- renderer destroy during cleanup leaves all four static pad nodes present.

- [ ] **4.3 Implement initializer using the Mine Grid lifecycle shape**

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

Use one `PatternPulseGame`, one `PatternPulseRenderer`, the existing error helpers, tracked listeners, BaseGame end-event achievement/challenge forwarding, beforeunload, and one `cleanedUp` guard.

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

- [ ] **4.4 Add `pattern-pulse` to the GamePage wrapper list and run GREEN**

```bash
bun run test:run src/lib/games/pattern-pulse src/pages/game-board-markup.test.ts
```

- [ ] **4.5 Commit**

```bash
git add src/lib/games/pattern-pulse/initFramework.ts src/lib/games/pattern-pulse/initFramework.test.ts src/pages/pattern-pulse/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(pattern-pulse): wire accessible game page"
```

---

### Task 5: Register the game and add four typed achievements

**Files**
- Modify `src/lib/games.ts`
- Modify `src/lib/games.test.ts`
- Modify `src/lib/games/shared/types.ts`
- Modify `src/lib/achievements.ts`
- Modify `src/lib/achievements.test.ts`
- Reuse score/API/database files unchanged

- [ ] **5.1 Write RED registry tests**

```typescript
describe('Pattern Pulse registration', () => {
    it('has the exact registry contract', () => {
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

- [ ] **5.2 Add enum, registry record, and icon**

Add `PATTERN_PULSE = 'pattern_pulse'`, the exact record above, and `[GameID.PATTERN_PULSE]: '🔁'`. Do not edit `getGameUrl()`.

Run and expect GREEN, including the existing route-exists test:

```bash
bun run test:run src/lib/games.test.ts
```

- [ ] **5.3 Extend the canonical game-data union**

```typescript
// src/lib/games/shared/types.ts
export type PatternPulseGameData =
    import('../pattern-pulse/types').PatternPulseGameData
```

Add it to `GameData`, import it into `achievements.ts`, and include it in `AchievementCheckData`.

- [ ] **5.4 Add four achievement tests and definitions**

Freeze:

```text
pattern_pulse_welcome    score_threshold >= 1
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

No `perfectRun` field exists or is read.

Run:

```bash
bun run test:run src/lib/games.test.ts src/lib/achievements.test.ts src/lib/games/pattern-pulse
bun run typecheck
```

- [ ] **5.5 Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts src/lib/achievements.ts src/lib/achievements.test.ts
git commit -m "feat(pattern-pulse): register game and achievements"
```

---

### Task 6: Add browser coverage, update inventory, and run final gates

**Files**
- Modify `e2e/games/play-coverage.spec.ts`
- Modify `CLAUDE.md`
- Verify unchanged `e2e/games/all-games-navigation.spec.ts`
- Verify `AGENTS.md` symlink unchanged

- [ ] **6.1 Add non-flaky browser smoke using the debug handle**

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

Do not use hard-coded sequence values, `waitForTimeout()`, or a production test seed query parameter.

- [ ] **6.2 Update only factual `CLAUDE.md` inventory**

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

- [ ] **6.4 Run focused unit/markup gates**

```bash
bun run test:run src/lib/games/pattern-pulse
bun run test:run src/lib/games.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
```

The first command includes the Task 2 timeout-during-playback and clock/RNG call-count regressions plus Task 3 static-pad ownership test.

- [ ] **6.5 Run type/lint/format/build**

```bash
bun run typecheck
bun run lint
bun run format:check
bun run build
```

- [ ] **6.6 Run browser routing/play gates**

```bash
bun run test:e2e e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
```

`all-games-navigation.spec.ts` should need no source change; the registry entry automatically adds Pattern Pulse coverage.

- [ ] **6.7 Run coverage/full regression**

```bash
bun run test:coverage
bun run test:run
```

Remote Codecov project + patch checks must both meet the configured 90% target.

- [ ] **6.8 Review final scope**

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
- Renderer destroy preserves those Astro-owned pads and permits re-initialization.
- Run ends at 60 seconds or the third mistake.
- Initial sequence is 3; each success adds exactly 1 pad.
- Recoverable mistakes replay the same sequence and reset streak.
- Playback follows the 600 ms → 320 ms formula.
- Only complete sequences score, using the frozen length/streak/response formula.
- RNG/clock call sites match the frozen contracts.
- Reset **and timeout during queued playback** cannot leak a cue into later state.
- Both terminal outcomes report `gameCompleted=true` through BaseGame `isGameOver`.
- Submitted game data has no duplicate `perfectRun` boolean; Clean Signal derives directly from rounds + mistakes.
- Touch/mouse, native button keyboard activation, and `1`–`4` shortcuts work.
- Existing BaseGame score/achievement/challenge flow is reused unchanged.
- Registry/icon/shared type/four achievements/markup/browser coverage are present.
- No backend/schema/core/Pixi/audio/generic sequence abstraction was introduced.
- `CLAUDE.md` reports 17 games / 14 BaseGame-native games; `AGENTS.md` remains a symlink.
- Focused tests, full tests, typecheck, lint, format, build, browser gates, and coverage pass.