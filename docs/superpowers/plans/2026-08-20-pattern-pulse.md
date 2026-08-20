# Pattern Pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Pattern Pulse, a one-minute four-pad memory-sequence game with increasing sequences, recoverable mistakes, streak/response-speed scoring, accessible desktop/mobile input, achievements, and the existing Cetus score/leaderboard flow.

**Architecture:** `PatternPulseGame` extends `BaseGame` and owns a small event-driven watch/input/feedback state machine plus exactly one scheduled browser timeout. `PatternPulseRenderer` extends `DOMRenderer` and manipulates four static Astro-owned buttons; no PixiJS loop or dynamic board construction is required. BaseGame remains unchanged and continues to own the countdown, score submission, final-timer reporting, reset lifecycle, and stale async-save protection.

**Tech Stack:** Astro 5 + TypeScript, Tailwind CSS 4, existing BaseGame/DOMRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-20-pattern-pulse-design.md`

## Global Constraints

- Package manager is **Bun** (`bun@1.3.1`); use `bun run …` for repository scripts.
- One ticket maps to one PR. Keep all HPA-74 implementation in the eventual implementation of this same task; do not split platform registration or achievements into a second PR.
- Game ID is exactly **`pattern_pulse`**, route is **`/pattern-pulse`**, title is **`Pattern Pulse`**, and icon is **`🔁`**.
- Fixed v1 rules: 60-second run, 4 pads, initial sequence length 3, mistake limit 3.
- Playback timing is fixed: 600 ms initial pulse, 40 ms faster per completed round, 320 ms floor, 140 ms gap, 400 ms pre-play delay, 500 ms feedback.
- A successful round appends exactly one random pad. A recoverable mistake replays the exact same sequence and resets the streak.
- Consecutive duplicate pad values are legal. Do not add anti-repeat generation rules.
- Accept player input only in `phase === 'input'`.
- Use one pending Pattern Pulse `setTimeout` at a time and clear it on reset, terminal mistake, timeout, and cleanup. Do not add a second clock or interval loop.
- Use injected `rng: () => number` and `now: () => number` seams for deterministic tests. Do not inject browser timer functions; Vitest fake timers are sufficient.
- Configure BaseGame with `timeBonus: false`. Pattern Pulse's speed reward is part of per-round scoring, not an end-of-run timer bonus.
- Round scoring is exactly:

```text
completionPoints = sequenceLength * 100
streakBonus = max(0, streak - 1) * 50
speedBonus = clamp(200 - floor(averageResponseMs / 5), 0, 200)
roundScore = completionPoints + streakBonus + speedBonus
```

- Do not deduct score directly for mistakes. Mistakes cost time, reset the streak, and can end the run.
- Use `BaseGame + DOMRenderer`; do not add a handle-based runtime, generic sequence framework, or PixiJS renderer.
- All four pad buttons and static page structure live in Astro. TypeScript may only change attributes/text and must not create/replace the parent board with `innerHTML`.
- Pads have stable number + symbol identities: `1 ▲`, `2 ●`, `3 ◆`, `4 ✦`. Color is supplemental, not the sole cue.
- Mouse/touch use native buttons. Desktop `1`–`4` shortcuts map to pads `0`–`3`; Enter/Space retain native button activation. No custom arrow-key focus manager.
- Ignore numeric shortcuts while focus is inside `input`, `textarea`, `select`, or a content-editable element.
- No audio, haptics, difficulty selector, extra pad layouts, Daily mode, persistence/resume, per-input timeout, backend admission, DB migration, or score/leaderboard endpoint edits.
- `#pattern-pulse-container` is the initializer's outer-shell guard. `#pattern-pulse-board` is the renderer mount.
- Add the `GAMES` registry entry only in the same task that creates `src/pages/pattern-pulse/index.astro`; `games.test.ts` requires every active registry item to have a real route.
- `e2e/games/all-games-navigation.spec.ts` is registry-derived and should remain source-unchanged.
- `AGENTS.md` is a symlink to `CLAUDE.md`; edit `CLAUDE.md` only and verify the symlink remains a symlink.
- Current Codecov project and patch targets are **90%**, zero threshold leniency.

## Risks

- **Stale playback callback after reset/end:** keep exactly one scheduled timeout and clear it at every lifecycle boundary. A fake-timer regression must reset during watch and prove later timer advancement cannot reopen input or light the old sequence.
- **Async score save after restart:** reuse BaseGame's current `runGuard`; do not create a Pattern Pulse run token.
- **Random E2E sequence:** Playwright must read the existing debug handle's live sequence and poll phase instead of hard-coding inputs or sleeps.
- **Input during playback:** renderer buttons are disabled outside input and `PatternPulseGame.pressPad()` independently rejects non-input phases.
- **Virtual `createInitialState()` during BaseGame construction:** sequence creation may use `this.config` only. Do not depend on subclass field initializers that run after `super()`.
- **One-minute budget consumed by playback:** the pulse speed floor and per-round acceleration are product behavior; do not pause the BaseGame timer while cues play.

---

### Task 1: Define Pattern Pulse contracts and pure round scoring

**Files:**
- Create: `src/lib/games/pattern-pulse/types.ts`
- Create: `src/lib/games/pattern-pulse/scoring.ts`
- Create: `src/lib/games/pattern-pulse/scoring.test.ts`

**Interfaces:**
- Produces: `PatternPad`, `PatternPulsePhase`, `PatternPulseOutcome`, `PatternPulseFeedback`, `PatternPulseConfig`, `PatternPulseState`, `PatternPulseStats`, `PatternPulseGameData`, `PATTERN_PULSE_TIMING`, `createPatternPulseConfig`, `calculatePatternPulseRoundScore`.

- [ ] **Step 1: Create the fixed contracts/config**

Create `src/lib/games/pattern-pulse/types.ts`:

```typescript
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

- [ ] **Step 2: Write failing scoring tests**

Create `src/lib/games/pattern-pulse/scoring.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { calculatePatternPulseRoundScore } from './scoring'

describe('calculatePatternPulseRoundScore', () => {
    it('awards sequence length and speed on the first success', () => {
        expect(
            calculatePatternPulseRoundScore({
                sequenceLength: 3,
                streak: 1,
                averageResponseMs: 500,
            })
        ).toBe(400)
    })

    it('adds 50 points for each success beyond the first in a streak', () => {
        expect(
            calculatePatternPulseRoundScore({
                sequenceLength: 4,
                streak: 2,
                averageResponseMs: 400,
            })
        ).toBe(570)
    })

    it('caps the speed bonus at 200', () => {
        expect(
            calculatePatternPulseRoundScore({
                sequenceLength: 3,
                streak: 1,
                averageResponseMs: 0,
            })
        ).toBe(500)
    })

    it('floors the speed bonus at zero', () => {
        expect(
            calculatePatternPulseRoundScore({
                sequenceLength: 8,
                streak: 1,
                averageResponseMs: 1200,
            })
        ).toBe(800)
    })

    it('clamps negative response time before scoring', () => {
        expect(
            calculatePatternPulseRoundScore({
                sequenceLength: 3,
                streak: 1,
                averageResponseMs: -100,
            })
        ).toBe(500)
    })
})
```

Run:

```bash
bun run test:run -- src/lib/games/pattern-pulse/scoring.test.ts
```

Expected: FAIL because `scoring.ts` does not exist.

- [ ] **Step 3: Implement the pure scorer**

Create `src/lib/games/pattern-pulse/scoring.ts`:

```typescript
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

Run:

```bash
bun run test:run -- src/lib/games/pattern-pulse/scoring.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the contracts/scoring slice**

```bash
git add src/lib/games/pattern-pulse/types.ts src/lib/games/pattern-pulse/scoring.ts src/lib/games/pattern-pulse/scoring.test.ts
git commit -m "feat(pattern-pulse): add contracts and scoring"
```

---

### Task 2: Implement the deterministic BaseGame state machine and lifecycle

**Files:**
- Create: `src/lib/games/pattern-pulse/PatternPulseGame.ts`
- Create: `src/lib/games/pattern-pulse/PatternPulseGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`
- Reuse unchanged: `src/lib/games/core/GameTimer.ts`

**Interfaces:**
- Consumes: `BaseGame`, `GameID`, Task 1 config/types/scorer.
- Produces: `PatternPulseGame.pressPad(pad)`, state-change events, stats, achievement game data.

- [ ] **Step 1: Write the state-machine fixture helpers and failing start/playback test**

Create `src/lib/games/pattern-pulse/PatternPulseGame.test.ts` with fake timers and a deterministic clock:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternPulseGame } from './PatternPulseGame'
import {
    PATTERN_PULSE_TIMING,
    createPatternPulseConfig,
    type PatternPad,
} from './types'

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
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('starts with three deterministic pads and rejects input while watching', () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({
                rng: sequenceRng([0, 0.3, 0.6]),
            })
        )

        expect(game.getState().sequence).toEqual([0, 1, 2])
        game.start()
        expect(game.getState().phase).toBe('watch')
        expect(game.pressPad(0)).toBe(false)

        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
        expect(game.getState().activePad).toBe(0)
        advanceToInput(game)
        expect(game.getState().inputIndex).toBe(0)
    })
})
```

Run:

```bash
bun run test:run -- src/lib/games/pattern-pulse/PatternPulseGame.test.ts
```

Expected: FAIL because `PatternPulseGame.ts` does not exist.

- [ ] **Step 2: Add the BaseGame shell, sequence generation, and one-timeout playback loop**

Create `src/lib/games/pattern-pulse/PatternPulseGame.ts` with this shape:

```typescript
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import { calculatePatternPulseRoundScore } from './scoring'
import {
    PATTERN_PULSE_TIMING,
    createPatternPulseConfig,
    type PatternPad,
    type PatternPulseConfig,
    type PatternPulseGameData,
    type PatternPulseState,
    type PatternPulseStats,
} from './types'

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
            sequence: this.createSequence(this.config.initialSequenceLength),
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

    protected onGameStart(): void {
        this.beginPlayback()
    }

    protected onGameReset(): void {
        this.clearScheduled()
        this.playbackIndex = 0
        this.lastInputAtMs = 0
        this.responseTotalMs = 0
        this.emitStateChange()
    }

    private createSequence(length: number): PatternPad[] {
        return Array.from({ length }, () => this.nextPad())
    }

    private nextPad(): PatternPad {
        const value = Math.floor(this.config.rng() * 4)
        return Math.max(0, Math.min(3, value)) as PatternPad
    }

    private getPulseMs(): number {
        return Math.max(
            PATTERN_PULSE_TIMING.minPulseMs,
            PATTERN_PULSE_TIMING.initialPulseMs -
                this.state.completedRounds * PATTERN_PULSE_TIMING.pulseStepMs
        )
    }

    private beginPlayback(): void {
        this.clearScheduled()
        this.state.phase = 'watch'
        this.state.feedback = null
        this.state.activePad = null
        this.state.inputIndex = 0
        this.playbackIndex = 0
        this.emitStateChange()
        this.schedule(
            () => this.showPlaybackPad(),
            PATTERN_PULSE_TIMING.prePlaybackDelayMs
        )
    }

    private showPlaybackPad(): void {
        if (!this.state.isActive || this.state.phase !== 'watch') {
            return
        }
        if (this.playbackIndex >= this.state.sequence.length) {
            this.beginInput()
            return
        }

        this.state.activePad = this.state.sequence[this.playbackIndex]
        this.emitStateChange()
        this.schedule(() => {
            if (!this.state.isActive || this.state.phase !== 'watch') {
                return
            }
            this.state.activePad = null
            this.playbackIndex++
            this.emitStateChange()
            this.schedule(
                () => this.showPlaybackPad(),
                PATTERN_PULSE_TIMING.pulseGapMs
            )
        }, this.getPulseMs())
    }

    private beginInput(): void {
        this.state.phase = 'input'
        this.state.activePad = null
        this.state.feedback = null
        this.state.inputIndex = 0
        this.responseTotalMs = 0
        this.lastInputAtMs = this.config.now()
        this.emitStateChange()
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

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}
```

Keep the class temporarily red on missing abstract/stat/input methods until Steps 3–5 complete; do not commit before the focused file is green.

- [ ] **Step 3: Add failing success/response/streak tests, then implement `pressPad()` success**

Add tests:

```typescript
it('scores a complete sequence, grows it by one, and preserves the success streak', () => {
    const game = new PatternPulseGame(
        createPatternPulseConfig({
            rng: sequenceRng([0, 0.3, 0.6, 0.9]),
            now: makeClock([0, 500, 1000, 1500]),
        })
    )
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

it('awards the streak bonus on a second consecutive completion', () => {
    const game = new PatternPulseGame(
        createPatternPulseConfig({
            rng: sequenceRng([0, 0, 0, 0]),
            now: makeClock([0, 500, 1000, 1500, 2000, 2400, 2800, 3200]),
        })
    )
    game.start()
    advanceToInput(game)
    enterSequence(game, [0, 0, 0])
    vi.advanceTimersByTime(PATTERN_PULSE_TIMING.feedbackMs)
    advanceToInput(game)
    enterSequence(game, [0, 0, 0, 0])

    expect(game.getState().completedRounds).toBe(2)
    expect(game.getState().streak).toBe(2)
    expect(game.getState().maxStreak).toBe(2)
    expect(game.getState().score).toBeGreaterThan(400)
})
```

Implement the accepted-correct path:

```typescript
pressPad(pad: PatternPad): boolean {
    if (
        !this.state.isActive ||
        this.state.isGameOver ||
        this.state.phase !== 'input'
    ) {
        return false
    }

    const expected = this.state.sequence[this.state.inputIndex]
    if (pad !== expected) {
        this.handleWrongPad(pad)
        return true
    }

    const now = this.config.now()
    this.responseTotalMs += Math.max(0, now - this.lastInputAtMs)
    this.lastInputAtMs = now
    this.state.inputIndex++

    if (this.state.inputIndex === this.state.sequence.length) {
        this.handleRoundComplete()
    } else {
        this.emitStateChange()
    }
    return true
}

private handleRoundComplete(): void {
    const sequenceLength = this.state.sequence.length
    const averageResponseMs = this.responseTotalMs / sequenceLength
    this.state.completedRounds++
    this.state.streak++
    this.state.maxStreak = Math.max(this.state.maxStreak, this.state.streak)
    this.state.longestSequence = Math.max(
        this.state.longestSequence,
        sequenceLength
    )
    this.addScore(
        calculatePatternPulseRoundScore({
            sequenceLength,
            streak: this.state.streak,
            averageResponseMs,
        }),
        'sequence_complete'
    )
    this.state.phase = 'feedback'
    this.state.feedback = 'correct'
    this.state.activePad = null
    this.emitStateChange()
    this.schedule(() => {
        this.state.sequence = [...this.state.sequence, this.nextPad()]
        this.beginPlayback()
    }, PATTERN_PULSE_TIMING.feedbackMs)
}
```

- [ ] **Step 4: Add failing recoverable/terminal mistake tests, then implement wrong-input behavior**

Add tests:

```typescript
it('breaks the streak and replays the same sequence after a recoverable mistake', () => {
    const game = new PatternPulseGame(
        createPatternPulseConfig({ rng: sequenceRng([0, 0.3, 0.6]) })
    )
    game.start()
    advanceToInput(game)
    const before = [...game.getState().sequence]

    expect(game.pressPad(3)).toBe(true)
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

it('ends immediately on the third mistake', async () => {
    const game = new PatternPulseGame(
        createPatternPulseConfig({
            initialSequenceLength: 1,
            rng: () => 0,
            mistakeLimit: 3,
        })
    )
    game.start()

    for (let attempt = 1; attempt <= 3; attempt++) {
        advanceToInput(game)
        game.pressPad(1)
        if (attempt < 3) {
            vi.advanceTimersByTime(PATTERN_PULSE_TIMING.feedbackMs)
        }
    }

    expect(game.getState()).toMatchObject({
        mistakes: 3,
        outcome: 'mistakes',
        phase: 'ended',
        isGameOver: true,
    })
})
```

Implement:

```typescript
private handleWrongPad(pad: PatternPad): void {
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
    this.schedule(
        () => this.beginPlayback(),
        PATTERN_PULSE_TIMING.feedbackMs
    )
}
```

- [ ] **Step 5: Add timeout/reset/repeated-pad/data regressions and complete abstract methods**

Add tests proving:

```typescript
it('allows consecutive duplicate pads', () => {
    const game = new PatternPulseGame(
        createPatternPulseConfig({
            initialSequenceLength: 3,
            rng: () => 0,
            now: makeClock([0, 100, 200, 300]),
        })
    )
    expect(game.getState().sequence).toEqual([0, 0, 0])
    game.start()
    advanceToInput(game)
    enterSequence(game, [0, 0, 0])
    expect(game.getState().completedRounds).toBe(1)
})

it('cancels queued playback when reset', () => {
    const game = new PatternPulseGame(createPatternPulseConfig({ rng: () => 0 }))
    game.start()
    vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
    expect(game.getState().activePad).toBe(0)

    game.reset()
    expect(game.getState().phase).toBe('idle')
    vi.runAllTimers()
    expect(game.getState().phase).toBe('idle')
    expect(game.getState().activePad).toBeNull()
})

it('ends as timeout and cancels playback callbacks', () => {
    const game = new PatternPulseGame(
        createPatternPulseConfig({ duration: 1, rng: () => 0 })
    )
    game.start()
    vi.advanceTimersByTime(1_100)
    expect(game.getState().outcome).toBe('timeout')
    expect(game.getState().phase).toBe('ended')
    vi.runAllTimers()
    expect(game.getState().phase).toBe('ended')
})
```

Complete the class with:

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

Run:

```bash
bun run test:run -- src/lib/games/pattern-pulse/PatternPulseGame.test.ts src/lib/games/pattern-pulse/scoring.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the game-state slice**

```bash
git add src/lib/games/pattern-pulse/PatternPulseGame.ts src/lib/games/pattern-pulse/PatternPulseGame.test.ts
git commit -m "feat(pattern-pulse): add memory sequence game state"
```

---

### Task 3: Add the fixed four-pad DOM renderer without rebuilding markup

**Files:**
- Create: `src/lib/games/pattern-pulse/PatternPulseRenderer.ts`
- Create: `src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts`
- Reuse unchanged: `src/lib/games/renderers/DOMRenderer.ts`

**Interfaces:**
- Consumes static `button[data-pattern-pad="0..3"]` nodes inside `#pattern-pulse-board`.
- Produces one `setPadPressCallback()` input seam.

- [ ] **Step 1: Write failing renderer setup/input/state tests**

Create a jsdom fixture with the static board:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternPulseRenderer } from './PatternPulseRenderer'
import type { PatternPulseState } from './types'

function mountBoard(): void {
    document.body.innerHTML = `
        <div id="pattern-pulse-board">
            <button data-pattern-pad="0" type="button">1 ▲</button>
            <button data-pattern-pad="1" type="button">2 ●</button>
            <button data-pattern-pad="2" type="button">3 ◆</button>
            <button data-pattern-pad="3" type="button">4 ✦</button>
        </div>
    `
}

function state(overrides: Partial<PatternPulseState> = {}): PatternPulseState {
    return {
        score: 0,
        timeRemaining: 60,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        phase: 'input',
        outcome: 'playing',
        sequence: [0, 1, 2],
        inputIndex: 0,
        activePad: null,
        feedback: null,
        completedRounds: 0,
        mistakes: 0,
        streak: 0,
        maxStreak: 0,
        longestSequence: 0,
        ...overrides,
    }
}

describe('PatternPulseRenderer', () => {
    beforeEach(() => mountBoard())

    it('delegates an enabled pad click once', async () => {
        const renderer = new PatternPulseRenderer()
        const onPad = vi.fn()
        renderer.setPadPressCallback(onPad)
        await renderer.initialize()
        renderer.render(state())

        document.querySelector<HTMLButtonElement>('[data-pattern-pad="2"]')?.click()
        expect(onPad).toHaveBeenCalledOnce()
        expect(onPad).toHaveBeenCalledWith(2)
    })

    it('disables and ignores buttons while watching', async () => {
        const renderer = new PatternPulseRenderer()
        const onPad = vi.fn()
        renderer.setPadPressCallback(onPad)
        await renderer.initialize()
        renderer.render(state({ phase: 'watch', activePad: 1 }))

        const pad = document.querySelector<HTMLButtonElement>('[data-pattern-pad="1"]')
        expect(pad?.disabled).toBe(true)
        expect(pad?.dataset.active).toBe('true')
        pad?.click()
        expect(onPad).not.toHaveBeenCalled()
    })

    it('marks the wrong feedback pad', async () => {
        const renderer = new PatternPulseRenderer()
        await renderer.initialize()
        renderer.render(
            state({ phase: 'feedback', feedback: 'wrong', activePad: 3 })
        )
        expect(
            document.querySelector<HTMLButtonElement>('[data-pattern-pad="3"]')
                ?.dataset.feedback
        ).toBe('wrong')
    })
})
```

Run:

```bash
bun run test:run -- src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
```

Expected: FAIL because the renderer does not exist.

- [ ] **Step 2: Implement one stable delegated listener and attribute-only rendering**

Create `src/lib/games/pattern-pulse/PatternPulseRenderer.ts`:

```typescript
import { DOMRenderer } from '@/lib/games/renderers/DOMRenderer'
import type { PatternPad, PatternPulseState } from './types'

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
        if (!this.acceptingInput || !this.container) {
            return
        }
        const target = event.target
        if (!(target instanceof Element)) {
            return
        }
        const button = target.closest<HTMLButtonElement>('button[data-pattern-pad]')
        if (!button || !this.container.contains(button)) {
            return
        }
        const value = Number(button.dataset.patternPad)
        if (value !== 0 && value !== 1 && value !== 2 && value !== 3) {
            return
        }
        this.onPadPress?.(value)
    }

    async setup(): Promise<void> {
        await super.setup()
        if (!this.container) {
            throw new Error('Pattern Pulse board not found')
        }
        this.padButtons = Array.from(
            this.container.querySelectorAll<HTMLButtonElement>(
                'button[data-pattern-pad]'
            )
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
        if (!this.isPatternPulseState(rawState)) {
            return
        }
        const state = rawState
        this.acceptingInput = state.isActive && state.phase === 'input'

        for (const button of this.padButtons) {
            const value = Number(button.dataset.patternPad) as PatternPad
            const active = state.activePad === value
            button.disabled = !this.acceptingInput
            button.dataset.active = String(active)
            button.dataset.feedback =
                active && state.feedback === 'wrong' ? 'wrong' : 'none'
        }
    }

    cleanup(): void {
        this.removeEventListener('click', this.clickHandler)
        this.padButtons = []
        this.acceptingInput = false
        super.cleanup()
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

- [ ] **Step 3: Add a cleanup regression**

```typescript
it('removes its delegated click listener on cleanup', async () => {
    const renderer = new PatternPulseRenderer()
    const onPad = vi.fn()
    renderer.setPadPressCallback(onPad)
    await renderer.initialize()
    renderer.render(state())
    renderer.destroy()

    document.querySelector<HTMLButtonElement>('[data-pattern-pad="0"]')?.click()
    expect(onPad).not.toHaveBeenCalled()
})
```

Run:

```bash
bun run test:run -- src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the renderer slice**

```bash
git add src/lib/games/pattern-pulse/PatternPulseRenderer.ts src/lib/games/pattern-pulse/PatternPulseRenderer.test.ts
git commit -m "feat(pattern-pulse): add four-pad DOM renderer"
```

---

### Task 4: Wire the initializer and Astro page as one green DOM contract

**Files:**
- Create: `src/lib/games/pattern-pulse/initFramework.ts`
- Create: `src/lib/games/pattern-pulse/initFramework.test.ts`
- Create: `src/pages/pattern-pulse/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`
- Reuse unchanged: `src/components/games/GamePage.astro`

**Interfaces:**
- Required outer DOM: `#pattern-pulse-container`.
- Renderer DOM: `#pattern-pulse-board` with four `data-pattern-pad` buttons.
- Controls: existing GamePage `#start-btn`, `#reset-btn`, `#play-again-btn`, `#game-over-overlay`.
- Debug handle: `window.patternPulseGame`.

- [ ] **Step 1: Write failing page-markup contract before registering the game**

Extend `src/pages/game-board-markup.test.ts` to read the new page and lock its durable structure:

```typescript
const patternPulseMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/pattern-pulse/index.astro'),
    'utf-8'
)
```

Add:

```typescript
describe('Pattern Pulse page markup', () => {
    it('keeps static four-pad markup and a root-level initializer', () => {
        expect(patternPulseMarkup).toContain('id="pattern-pulse-container"')
        expect(patternPulseMarkup).toContain('id="pattern-pulse-board"')
        expect(
            patternPulseMarkup.match(/data-pattern-pad="[0-3]"/g)
        ).toHaveLength(4)
        expect(patternPulseMarkup).toContain('id="pattern-status"')
        expect(patternPulseMarkup).toMatch(
            /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initPatternPulseGameFramework/
        )
    })
})
```

Do **not** add `pattern-pulse` to the shared `games` array until the page file exists in Step 2; otherwise this test file will fail at module-load time.

- [ ] **Step 2: Create the static page before registry activation**

Create `src/pages/pattern-pulse/index.astro` with this static contract:

```astro
---
import GamePage from '@/components/games/GamePage.astro'
import Card from '@/components/ui/Card.astro'
import Badge from '@/components/ui/Badge.astro'
---

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
    <div
      id="pattern-pulse-board"
      class="grid grid-cols-2 gap-3 aspect-square"
      role="group"
      aria-label="Pattern Pulse signal pads"
    >
      <button type="button" class="pattern-pulse-pad" data-pattern-pad="0" aria-label="Pad 1, triangle">
        <span aria-hidden="true">▲</span><span>1</span>
      </button>
      <button type="button" class="pattern-pulse-pad" data-pattern-pad="1" aria-label="Pad 2, circle">
        <span aria-hidden="true">●</span><span>2</span>
      </button>
      <button type="button" class="pattern-pulse-pad" data-pattern-pad="2" aria-label="Pad 3, diamond">
        <span aria-hidden="true">◆</span><span>3</span>
      </button>
      <button type="button" class="pattern-pulse-pad" data-pattern-pad="3" aria-label="Pad 4, star">
        <span aria-hidden="true">✦</span><span>4</span>
      </button>
    </div>
    <p id="pattern-status" class="mt-4 text-center font-mono text-cetus-accent" aria-live="polite">READY</p>
  </div>

  <Badge slot="additional-stats" variant="outline" class="px-4 py-2">
    <span class="font-mono">Sequence: <span id="sequence-length">3</span></span>
  </Badge>
  <Badge slot="additional-stats" variant="outline" class="px-4 py-2">
    <span class="font-mono">Rounds: <span id="completed-rounds">0</span></span>
  </Badge>
  <Badge slot="additional-stats" variant="outline" class="px-4 py-2">
    <span class="font-mono">Streak: <span id="streak">0</span></span>
  </Badge>
  <Badge slot="additional-stats" variant="outline" class="px-4 py-2">
    <span class="font-mono">Mistakes: <span id="mistakes">0 / 3</span></span>
  </Badge>

  <div slot="game-info" class="space-y-6">
    <Card variant="glass" class="p-6">
      <h3 class="font-mono text-sm tracking-wide text-cetus-accent mb-4">▸ HOW TO PLAY</h3>
      <p class="text-sm text-cetus-ink">Watch the four signal pads, then repeat the sequence in order. Every successful round adds one more signal.</p>
      <p class="mt-2 text-sm text-cetus-ink">Tap/click the pads or use keys 1–4. Three mistakes end the run.</p>
    </Card>
    <Card variant="glass" class="p-6">
      <h3 class="font-mono text-sm tracking-wide text-cetus-accent mb-4">▸ SCORING</h3>
      <p class="text-sm text-cetus-ink">Longer completed sequences score more. Consecutive clears add streak points, and faster correct responses earn a speed bonus.</p>
    </Card>
  </div>

  <div slot="final-stats">
    <div class="text-lg text-cetus-ink">Outcome: <span id="final-outcome" class="text-cetus-accent">—</span></div>
    <div class="text-lg text-cetus-ink">Rounds: <span id="final-rounds" class="text-cetus-accent">0</span></div>
    <div class="text-lg text-cetus-ink">Longest Sequence: <span id="final-longest-sequence" class="text-cetus-accent-3">0</span></div>
    <div class="text-lg text-cetus-ink">Max Streak: <span id="final-max-streak" class="text-cetus-accent-2">0</span></div>
    <div class="text-lg text-cetus-ink">Mistakes: <span id="final-mistakes" class="text-cetus-accent-2">0</span></div>
  </div>
</GamePage>

<script>
  import { initPatternPulseGameFramework } from '@/lib/games/pattern-pulse/initFramework'

  document.addEventListener('DOMContentLoaded', () => {
    initPatternPulseGameFramework()
      .then(handle => {
        if (handle) {
          ;(window as Window & { patternPulseGame?: typeof handle }).patternPulseGame = handle
        }
      })
      .catch(error => console.error('Pattern Pulse failed to initialize', error))
  })
</script>
```

Add page-local/global-referenced CSS for `.pattern-pulse-pad`, `[data-active='true']`, `[data-feedback='wrong']`, disabled state, focus-visible state, and reduced-motion compatibility. Keep the four symbols visible in every state and use transform/border/glow in addition to color.

- [ ] **Step 3: Write failing initializer tests for click, shortcuts, HUD, reset, notifications, and cleanup**

Use a jsdom fixture containing the static IDs from the page and mock the renderer only where needed. Cover at least:

```typescript
it('maps numeric shortcuts to pads only during normal page focus', async () => {
    const handle = await initPatternPulseGameFramework()
    expect(handle).toBeDefined()
    handle?.game.start()
    vi.runAllTimers()
    expect(handle?.game.getState().phase).toBe('input')

    const sequence = handle?.game.getState().sequence ?? []
    window.dispatchEvent(
        new KeyboardEvent('keydown', { key: String(sequence[0] + 1) })
    )
    expect(handle?.game.getState().inputIndex).toBe(1)
})

it('ignores numeric shortcuts from editable targets', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const handle = await initPatternPulseGameFramework()
    handle?.game.start()
    vi.runAllTimers()

    input.dispatchEvent(
        new KeyboardEvent('keydown', {
            key: '1',
            bubbles: true,
        })
    )
    expect(handle?.game.getState().inputIndex).toBe(0)
})
```

Also assert:

- missing `#pattern-pulse-container` returns `undefined` through `handleGameError`;
- renderer click calls `pressPad()`;
- state changes update `#pattern-status`, `#sequence-length`, `#completed-rounds`, `#streak`, `#mistakes`;
- score/time callbacks update GamePage's `#score` / `#time-remaining`;
- Reset and Play Again return status to `READY`, hide the overlay, and show Start;
- BaseGame `end` event forwards achievements/challenge completions once;
- `cleanup()` removes tracked DOM/window listeners and is idempotent.

- [ ] **Step 4: Implement the initializer with the existing Mine Grid lifecycle pattern**

Create `src/lib/games/pattern-pulse/initFramework.ts`. The key helpers and event mapping are:

```typescript
function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false
    }
    return (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
    )
}

function shortcutToPad(key: string): 0 | 1 | 2 | 3 | null {
    switch (key) {
        case '1': return 0
        case '2': return 1
        case '3': return 2
        case '4': return 3
        default: return null
    }
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

Initialize exactly one game/renderer:

```typescript
const renderer = new PatternPulseRenderer()
await renderer.initialize()

const callbacks: BaseGameCallbacks = {
    onStateChange: rawState => {
        const state = rawState as PatternPulseState
        renderer.render(state)
        syncHud(state)
    },
    onScoreUpdate: score => setText('score', String(score)),
    onTimeUpdate: time => setText('time-remaining', String(time)),
    onStart: () => {
        setStartVisible(false)
        hideOverlay()
    },
    onEnd: (score, rawStats) => {
        const stats = rawStats as PatternPulseStats
        setStartVisible(true)
        setText('final-score', String(score))
        setText('final-outcome', stats.outcome === 'timeout' ? 'Time Complete' : 'Signal Lost')
        setText('final-rounds', String(stats.completedRounds))
        setText('final-longest-sequence', String(stats.longestSequence))
        setText('final-max-streak', String(stats.maxStreak))
        setText('final-mistakes', String(stats.mistakes))
        document.getElementById('game-over-overlay')?.classList.remove('hidden')
    },
}

const game = new PatternPulseGame(createPatternPulseConfig(), callbacks)
renderer.setPadPressCallback(pad => game.pressPad(pad))
```

The global key listener must call `shortcutToPad`, check `isEditableTarget`, then delegate to `game.pressPad()`. Keep the existing `beforeunload`, achievement/challenge forwarding, tracked-listener cleanup, and one `cleanedUp` guard shape from Mine Grid.

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

- [ ] **Step 5: Add `pattern-pulse` to the shared GamePage wrapper list now that the page exists**

Append `'pattern-pulse'` to the `games` array in `src/pages/game-board-markup.test.ts`.

Run:

```bash
bun run test:run -- src/lib/games/pattern-pulse src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the page/initializer slice**

```bash
git add src/lib/games/pattern-pulse/initFramework.ts src/lib/games/pattern-pulse/initFramework.test.ts src/pages/pattern-pulse/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(pattern-pulse): wire accessible game page"
```

---

### Task 5: Register Pattern Pulse and add typed achievements without backend changes

**Files:**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Reuse unchanged: `src/lib/services/scoreService.ts`
- Reuse unchanged: `src/pages/api/scores.ts`
- Reuse unchanged: database schema/query files

**Interfaces:**
- Adds `GameID.PATTERN_PULSE` and one active `GAMES` entry.
- Adds `PatternPulseGameData` to the canonical `GameData`/achievement type union.
- Adds four code-only achievement definitions.

- [ ] **Step 1: Write failing registry tests**

Add to `src/lib/games.test.ts`:

```typescript
describe('Pattern Pulse registration', () => {
    it('has the Pattern Pulse ID and registry entry', () => {
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
    })

    it('has the Pattern Pulse icon', () => {
        expect(getGameIcon(GameID.PATTERN_PULSE)).toBe('🔁')
    })

    it('is included exactly once', () => {
        expect(
            GAMES.filter(game => game.id === GameID.PATTERN_PULSE)
        ).toHaveLength(1)
    })
})
```

Run:

```bash
bun run test:run -- src/lib/games.test.ts
```

Expected: FAIL because the enum/registry entry does not exist.

- [ ] **Step 2: Add the enum, registry record, and icon**

In `src/lib/games.ts` add:

```typescript
PATTERN_PULSE = 'pattern_pulse',
```

Add the exact registry object from the test and:

```typescript
[GameID.PATTERN_PULSE]: '🔁',
```

Do not modify `getGameUrl`; its existing underscore-to-hyphen derivation already produces `/pattern-pulse`.

Run:

```bash
bun run test:run -- src/lib/games.test.ts
```

Expected: PASS, including the existing “every game maps to an existing page route” invariant because Task 4 already created the page.

- [ ] **Step 3: Extend the shared game-data union before achievement definitions**

In `src/lib/games/shared/types.ts` add:

```typescript
export type PatternPulseGameData =
    import('../pattern-pulse/types').PatternPulseGameData
```

and include `PatternPulseGameData` in `GameData`.

In `src/lib/achievements.ts`, import `PatternPulseGameData` from `./games/shared/types` and include it in `AchievementCheckData`.

- [ ] **Step 4: Write failing tests for all four achievements**

Add to `src/lib/achievements.test.ts`:

```typescript
describe('Pattern Pulse achievements', () => {
    const byId = (id: string) => {
        const achievement = ACHIEVEMENTS.find(item => item.id === id)
        expect(achievement).toBeDefined()
        return achievement!
    }

    it('has a score welcome achievement', () => {
        expect(byId('pattern_pulse_welcome')).toMatchObject({
            gameId: GameID.PATTERN_PULSE,
            condition: { type: 'score_threshold', threshold: 1 },
        })
    })

    it('awards In Sync at a three-round streak', () => {
        const check = byId('pattern_pulse_streak_3').condition.check
        expect(check?.({ completedRounds: 3, longestSequence: 5, mistakes: 1, maxStreak: 3, perfectRun: false }, 0)).toBe(true)
        expect(check?.({ completedRounds: 2, longestSequence: 4, mistakes: 1, maxStreak: 2, perfectRun: false }, 0)).toBe(false)
    })

    it('awards Long Memory at sequence length eight', () => {
        const check = byId('pattern_pulse_sequence_8').condition.check
        expect(check?.({ completedRounds: 6, longestSequence: 8, mistakes: 1, maxStreak: 2, perfectRun: false }, 0)).toBe(true)
    })

    it('awards Clean Signal only after three rounds with no mistakes', () => {
        const check = byId('pattern_pulse_perfect').condition.check
        expect(check?.({ completedRounds: 3, longestSequence: 5, mistakes: 0, maxStreak: 3, perfectRun: true }, 0)).toBe(true)
        expect(check?.({ completedRounds: 3, longestSequence: 5, mistakes: 1, maxStreak: 2, perfectRun: false }, 0)).toBe(false)
    })
})
```

- [ ] **Step 5: Add the four code-only definitions**

Add to `ACHIEVEMENTS`:

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
        check: (gameData: PatternPulseGameData) => gameData.maxStreak >= 3,
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
        check: (gameData: PatternPulseGameData) =>
            gameData.longestSequence >= 8,
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
        check: (gameData: PatternPulseGameData) =>
            gameData.completedRounds >= 3 && gameData.mistakes === 0,
    },
    rarity: AchievementRarity.RARE,
},
```

Run:

```bash
bun run test:run -- src/lib/games.test.ts src/lib/achievements.test.ts src/lib/games/pattern-pulse
bun run typecheck
```

Expected: PASS / 0 type errors.

- [ ] **Step 6: Commit registration and achievements**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts src/lib/achievements.ts src/lib/achievements.test.ts
git commit -m "feat(pattern-pulse): register game and achievements"
```

---

### Task 6: Add non-flaky browser coverage, update repository inventory, and run full gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- Modify: `CLAUDE.md`
- Verify unchanged source: `e2e/games/all-games-navigation.spec.ts`
- Verify symlink unchanged: `AGENTS.md`

**Interfaces:**
- Browser automation reads only the existing `window.patternPulseGame` debug handle.
- No test-only query parameters, seeded production mode, or backend fixtures are added.

- [ ] **Step 1: Add a phase-polling Pattern Pulse smoke test**

Append to `e2e/games/play-coverage.spec.ts`:

```typescript
test.describe('Pattern Pulse', () => {
    const getDebugState = (page: import('@playwright/test').Page) =>
        page.evaluate(() => {
            const handle = (
                window as Window & {
                    patternPulseGame?: {
                        getState: () => {
                            phase: string
                            sequence: number[]
                        }
                    }
                }
            ).patternPulseGame
            if (!handle) {
                throw new Error('Pattern Pulse debug handle not ready')
            }
            return handle.getState()
        })

    test('completes one random sequence and accepts the next numeric shortcut', async ({
        page,
    }) => {
        await page.goto('/pattern-pulse')
        await expect(page.locator('#pattern-pulse-board')).toBeVisible()
        await startGameWhenReady(page)

        await expect
            .poll(async () => (await getDebugState(page)).phase)
            .toBe('input')
        const first = (await getDebugState(page)).sequence
        for (const pad of first) {
            await page.locator(`[data-pattern-pad="${pad}"]`).click()
        }
        await expect(page.locator('#completed-rounds')).toHaveText('1')

        await expect
            .poll(async () => (await getDebugState(page)).phase)
            .toBe('input')
        const second = (await getDebugState(page)).sequence
        await page.keyboard.press(String(second[0] + 1))
        await expect
            .poll(async () => {
                const handle = (
                    window as Window & {
                        patternPulseGame?: {
                            getState: () => { inputIndex: number }
                        }
                    }
                ).patternPulseGame
                return handle?.getState().inputIndex ?? -1
            })
            .toBe(1)

        await page.locator('#reset-btn').click()
        await expect(page.locator('#pattern-status')).toHaveText('READY')
        await expect(page.locator('#sequence-length')).toHaveText('3')
    })
})
```

If TypeScript inference objects to the helper's page type, import `type Page` from `@playwright/test` at the existing import line and use `(page: Page)`; do not duplicate Playwright imports.

No `waitForTimeout()` belongs in this test.

- [ ] **Step 2: Update `CLAUDE.md` inventory only where the new game changes facts**

Make these factual edits:

- project overview: **16 → 17** fully implemented games and append Pattern Pulse;
- project structure: add `pattern-pulse/` under `src/lib/games/`;
- renderer architecture: DOM-based list becomes Memory Matrix, Mine Grid, Pattern Pulse;
- game-specific notes: add `Pattern Pulse: BaseGame + DOMRenderer four-pad memory-sequence game`;
- game development guidance: **all 16 → all 17** games fully implemented;
- important architecture notes Game Count: **16 → 17** and append Pattern Pulse;
- framework pattern count: **13 of 16 → 14 of 17**, while Circuit Hacker, Satellite Sync, and Ice Slide remain the same three blessed handle-based games.

Do not edit `AGENTS.md` directly.

- [ ] **Step 3: Verify the symlink before finalizing**

```bash
test -L AGENTS.md
test "$(readlink AGENTS.md)" = "CLAUDE.md"
```

Expected: both commands exit 0.

- [ ] **Step 4: Run focused unit/markup tests**

```bash
bun run test:run -- src/lib/games/pattern-pulse
bun run test:run -- src/lib/games.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run type/lint/format/build gates**

```bash
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Expected: all exit 0. Do not repair unrelated pre-existing warnings unless they become errors caused by HPA-74.

- [ ] **Step 6: Run the two browser gates that own this feature's routing/play coverage**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
```

Expected:

- Pattern Pulse smoke passes without hard-coded sequence/timing sleeps;
- registry-derived homepage navigation includes Pattern Pulse;
- every game page still returns Home successfully.

- [ ] **Step 7: Run coverage and full unit regression**

```bash
bun run test:coverage
bun run test:run
```

Expected:

- full unit suite passes;
- local coverage does not reveal an HPA-74-specific gap;
- remote Codecov project and patch statuses must meet the current 90% targets.

- [ ] **Step 8: Confirm the implementation diff stayed inside scope**

```bash
git diff --name-only main...HEAD
```

Expected production/platform changes are limited to:

```text
src/lib/games/pattern-pulse/*
src/pages/pattern-pulse/index.astro
src/lib/games.ts
src/lib/games/shared/types.ts
src/lib/achievements.ts
src/lib/games.test.ts
src/lib/achievements.test.ts
src/pages/game-board-markup.test.ts
e2e/games/play-coverage.spec.ts
CLAUDE.md
```

The existing planning documents are also expected on a branch that carries planning history. No DB, API, auth, score-service, core framework, Pixi renderer, or `all-games-navigation.spec.ts` source change should appear.

- [ ] **Step 9: Commit the browser/inventory closeout**

```bash
git add e2e/games/play-coverage.spec.ts CLAUDE.md
git commit -m "test(pattern-pulse): cover catalog and browser flow"
```

## Final Definition of Done

HPA-74 is implementation-ready/complete only when all of the following are true:

- four static symbol+number pads render on `/pattern-pulse`;
- a run lasts 60 seconds unless the third mistake ends it first;
- initial sequence length is 3 and every successful round adds exactly 1 pad;
- recoverable mistakes replay the same sequence and reset streak only;
- playback speed follows the fixed 600 ms → 320 ms formula;
- scoring is awarded only for complete sequences using the frozen length/streak/response formula;
- reset/end/timeout cannot leak an old scheduled cue into new state;
- mouse/touch, native button keyboard activation, and `1`–`4` shortcuts work;
- score submission and achievement/challenge notification flow reuse BaseGame unchanged;
- registry, icon, shared data type, four achievements, markup tests, and browser coverage are present;
- no new backend/schema/core/Pixi/generic sequence abstraction was introduced;
- `CLAUDE.md` reports 17 games / 14 BaseGame-native games and `AGENTS.md` remains its symlink;
- focused tests, full tests, typecheck, lint, formatting, build, Playwright routing/play coverage, and coverage gates pass.