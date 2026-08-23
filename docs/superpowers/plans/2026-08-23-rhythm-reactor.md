# Rhythm Reactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-70 as a deterministic 60-second four-lane visual rhythm minigame with keyboard/touch input, Pixi rendering, scoring, achievements, and existing Cetus score submission.

**Architecture:** `RhythmReactorGame` extends `BaseGame`, owns a small authored chart plus simulation-time judgments, and uses one pure game-local scoring module. `RhythmReactorRenderer` extends `PixiJSRenderer`; one game-local initializer owns one requestAnimationFrame loop and native Astro lane buttons. BaseGame remains the sole run timer/persistence/lifecycle authority; no audio or shared rhythm framework is added.

**Tech Stack:** Astro 5, TypeScript 6, BaseGame/GameTimer/ScoreManager, PixiJS 8, Tailwind 4, Vitest 3, Playwright 1.54, Bun 1.3.

**Spec:** `docs/superpowers/specs/2026-08-23-rhythm-reactor-design.md`

## Global Constraints

- One HPA-70 implementation PR; do not split this ticket across PRs.
- 60-second fixed run; four lanes; keyboard `D/F/J/K`; touch via four native buttons.
- Structural chart model: fixed 120 BPM visual grid (`0.5s` steps), each step is one lane/rest, no chords, hit time derives from `firstHitTime + stepIndex * beatStepSeconds`.
- First authored note stays Lane 1 and is visible at run start (`firstHitTimeSeconds === approachSeconds`).
- Current authored data is WARMUP×2 + CORE×2 + SURGE×3, which derives 86 notes and last hit 57.5s. **Pattern bytes/repeats are tuning data until the Task 4 playable checkpoint**, not independent frozen constants.
- Initial timing defaults: approach `2.0s`; Perfect `±0.080s`; Good `±0.160s`; boundaries inclusive.
- Initial stability defaults: `60`; Perfect `+4`; Good `+2`; miss `-6`; every 10th consecutive hit gets `+5`; clamp `0..100`.
- Stability never ends the run; BaseGame timeout is the normal completion condition.
- Initial scoring defaults: Perfect `100`; Good `60`; multiplier adds `0.25×` per 10 combo and caps at `2.0×`; BaseGame time bonus disabled.
- GamePage uses `showPause={false}`, `showEnd={false}`, `showReset={true}`.
- Visible additional-stat badges are exactly Combo, Hits, Judgment, Stability; `#rhythm-reactor-status` is the accessible duplicate.
- No audio/BGM/Web Audio, calibration, difficulty/song selection, random chart generation, chords/holds/slides, generic rhythm framework, canvas hit testing, DB/API/schema/auth changes, or core-runtime refactor.
- `BaseGame.ts`, `GameTimer.ts`, `ScoreManager.ts`, `GameInitializer.ts`, `PixiJSRenderer.ts`, score service, API routes, DB/schema, and packages remain production-unchanged.
- Follow Signal Switch's seams; do **not** import/extend Signal Switch game constants or scorer.
- Reuse the existing exported identifier `isEditableTarget`; do not add another editable-target helper.
- Run the manual-play tuning checkpoint after Task 4 and before Task 5 freezes chart content and achievement thresholds.

---

## File Map

### New game-local production files

- `src/lib/games/rhythm-reactor/types.ts` — rules, state/config/stats/data contracts, hit-result types.
- `src/lib/games/rhythm-reactor/chart.ts` — three authored patterns, section repeats, pure chart materializer.
- `src/lib/games/rhythm-reactor/scoring.ts` — hit score and weighted accuracy authority.
- `src/lib/games/rhythm-reactor/RhythmReactorGame.ts` — BaseGame model, update/expiry/judgment/stability lifecycle.
- `src/lib/games/rhythm-reactor/RhythmReactorRenderer.ts` — two-layer Pixi lane/note renderer.
- `src/lib/games/rhythm-reactor/initFramework.ts` — DOM callbacks, controls, rAF, cleanup/debug handle.
- `src/pages/rhythm-reactor/index.astro` — complete route markup/styles and DOMContentLoaded bootstrap.

### New co-located tests

- `src/lib/games/rhythm-reactor/chart.test.ts`
- `src/lib/games/rhythm-reactor/scoring.test.ts`
- `src/lib/games/rhythm-reactor/RhythmReactorGame.test.ts`
- `src/lib/games/rhythm-reactor/RhythmReactorRenderer.test.ts`
- `src/lib/games/rhythm-reactor/initFramework.test.ts`

### Existing files changed only when their contract becomes live

- `src/lib/games.ts` — Task 2 adds stable ID/icon; Task 5 adds the active catalog row.
- `src/lib/games.test.ts` — Task 5 freezes active registration.
- `src/lib/games/shared/types.ts` — Task 5 exports canonical game-data type into `GameData`.
- `src/lib/organisms.test.ts` — Task 5 changes exact depth partition to `8 / 9 / 4`.
- `src/lib/achievements.ts` and `src/lib/achievements.test.ts` — Task 5 adds four game-local achievements.
- `src/pages/game-board-markup.test.ts` — Task 4 freezes Astro/bootstrap/HUD/control contract.
- `e2e/games/play-coverage.spec.ts` — Task 6 adds deterministic playable + 375px proofs.
- `CLAUDE.md` — Task 5 updates implemented-game count/list, project structure, renderer note, and game-specific note.

---

### Task 1: Define chart materialization, initial authored data, rules, and scoring

**Files:**
- Create: `src/lib/games/rhythm-reactor/types.ts`
- Create: `src/lib/games/rhythm-reactor/chart.ts`
- Create: `src/lib/games/rhythm-reactor/chart.test.ts`
- Create: `src/lib/games/rhythm-reactor/scoring.ts`
- Create: `src/lib/games/rhythm-reactor/scoring.test.ts`

**Interfaces:**
- Produces `RHYTHM_REACTOR_RULES`, `RhythmReactorLane`, `RhythmReactorJudgment`, `RhythmReactorNote`, `RhythmReactorConfig`, `RhythmReactorState`, `RhythmReactorStats`, `RhythmReactorGameData`, `RhythmReactorHitResult`, `createRhythmReactorConfig()`.
- Produces `WARMUP_PATTERN`, `CORE_PATTERN`, `SURGE_PATTERN`, `RHYTHM_REACTOR_SECTIONS`, and `createRhythmReactorChart(): RhythmReactorNote[]`.
- Produces `calculateRhythmReactorHitPoints(judgment, comboAfterHit): number` and `calculateRhythmReactorAccuracy(perfectHits, goodHits, misses): number`.

- [ ] **Step 1: Write exact authored-data + derived-materializer tests first**

Create `chart.test.ts`. Freeze the current pattern values, repeat counts, and expanded lane sequence; derive aggregate count/last time rather than hard-coding `86` / `57.5` as separate contracts:

```ts
import { describe, expect, it } from 'vitest'
import {
    CORE_PATTERN,
    RHYTHM_REACTOR_SECTIONS,
    SURGE_PATTERN,
    WARMUP_PATTERN,
    createRhythmReactorChart,
} from './chart'
import {
    RHYTHM_REACTOR_RULES,
    type RhythmReactorLane,
} from './types'

type Step = RhythmReactorLane | null

const expectedWarmup: readonly Step[] = [
    0, null, 1, null, 2, null, 3, null,
    0, 1, null, 2, null, 3, 1, 2,
]
const expectedCore: readonly Step[] = [
    0, 1, null, 2, 3, null, 1, 2,
    0, null, 3, 2, 1, null, 0, 3,
]
const expectedSurge: readonly Step[] = [
    0, 1, 2, null, 3, 2, 1, 0,
    1, 3, null, 2, 0, 3, 1, 2,
]

function repeat(pattern: readonly Step[], count: number): Step[] {
    return Array.from({ length: count }, () => [...pattern]).flat()
}

describe('createRhythmReactorChart', () => {
    it('pins the current authored patterns and repeat counts', () => {
        expect(WARMUP_PATTERN).toEqual(expectedWarmup)
        expect(CORE_PATTERN).toEqual(expectedCore)
        expect(SURGE_PATTERN).toEqual(expectedSurge)
        expect(RHYTHM_REACTOR_SECTIONS.map(section => section.repeats)).toEqual([
            2, 2, 3,
        ])
    })

    it('materializes exactly the lane sequence authored by those tables', () => {
        const expectedSteps = [
            ...repeat(expectedWarmup, 2),
            ...repeat(expectedCore, 2),
            ...repeat(expectedSurge, 3),
        ]
        const expectedLanes = expectedSteps.filter(
            (step): step is RhythmReactorLane => step !== null
        )
        const chart = createRhythmReactorChart()

        expect(chart.map(note => note.laneIndex)).toEqual(expectedLanes)
        expect(chart).toHaveLength(expectedLanes.length)
        expect(chart[0]).toMatchObject({ id: 'note-0', laneIndex: 0 })

        const lastOccupiedStep = expectedSteps.findLastIndex(
            step => step !== null
        )
        expect(chart[0].hitTimeSeconds).toBe(
            RHYTHM_REACTOR_RULES.firstHitTimeSeconds
        )
        expect(chart.at(-1)?.hitTimeSeconds).toBe(
            RHYTHM_REACTOR_RULES.firstHitTimeSeconds +
                lastOccupiedStep * RHYTHM_REACTOR_RULES.beatStepSeconds
        )
        expect(
            new Set(chart.map(note => note.hitTimeSeconds)).size
        ).toBe(chart.length)
        expect(
            chart.every(note => note.laneIndex >= 0 && note.laneIndex <= 3)
        ).toBe(true)
    })
})
```

These exact data expectations are deliberately editable during the Task 4 tuning commit only. The materializer shape is already frozen.

- [ ] **Step 2: Run chart tests and verify RED**

```bash
bun run test:run -- src/lib/games/rhythm-reactor/chart.test.ts
```

Expected: FAIL because `chart.ts` / `types.ts` do not exist.

- [ ] **Step 3: Implement central rules and chart data**

In `types.ts`:

```ts
export const RHYTHM_REACTOR_RULES = {
    duration: 60,
    canvasWidth: 800,
    canvasHeight: 420,
    laneCount: 4,
    beatStepSeconds: 0.5,
    firstHitTimeSeconds: 2,
    approachSeconds: 2,
    perfectWindowSeconds: 0.08,
    goodWindowSeconds: 0.16,
    maxUpdateDelta: 0.1,
    noteSpawnY: 40,
    hitLineY: 340,
    initialStability: 60,
    perfectStabilityGain: 4,
    goodStabilityGain: 2,
    missStabilityLoss: 6,
    comboStabilityInterval: 10,
    comboStabilityBonus: 5,
} as const

export type RhythmReactorLane = 0 | 1 | 2 | 3
export type RhythmReactorJudgment = 'perfect' | 'good' | 'miss'

export interface RhythmReactorNote {
    id: string
    laneIndex: RhythmReactorLane
    hitTimeSeconds: number
}

export interface RhythmReactorHitResult {
    accepted: boolean
    judgment: RhythmReactorJudgment | null
    noteId: string | null
    points: number
}
```

Make `RhythmReactorConfig extends BaseGameConfig` include every numeric rule consumed by game/renderer. `createRhythmReactorConfig(overrides = {})` returns the rule values plus `achievementIntegration: true`, `pausable: false`, `resettable: true`.

In `chart.ts`, export the three exact patterns and section table from the spec. Keep one global `stepIndex`; only non-rest steps become notes:

```ts
export const RHYTHM_REACTOR_SECTIONS = [
    { pattern: WARMUP_PATTERN, repeats: 2 },
    { pattern: CORE_PATTERN, repeats: 2 },
    { pattern: SURGE_PATTERN, repeats: 3 },
] as const

export function createRhythmReactorChart(): RhythmReactorNote[] {
    const notes: RhythmReactorNote[] = []
    let stepIndex = 0
    let noteIndex = 0

    for (const { pattern, repeats } of RHYTHM_REACTOR_SECTIONS) {
        for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
            for (const laneIndex of pattern) {
                if (laneIndex !== null) {
                    notes.push({
                        id: `note-${noteIndex++}`,
                        laneIndex,
                        hitTimeSeconds:
                            RHYTHM_REACTOR_RULES.firstHitTimeSeconds +
                            stepIndex * RHYTHM_REACTOR_RULES.beatStepSeconds,
                    })
                }
                stepIndex += 1
            }
        }
    }
    return notes
}
```

- [ ] **Step 4: Write scoring tests**

```ts
expect(calculateRhythmReactorHitPoints('perfect', 1)).toBe(100)
expect(calculateRhythmReactorHitPoints('good', 9)).toBe(60)
expect(calculateRhythmReactorHitPoints('perfect', 10)).toBe(125)
expect(calculateRhythmReactorHitPoints('perfect', 20)).toBe(150)
expect(calculateRhythmReactorHitPoints('perfect', 30)).toBe(175)
expect(calculateRhythmReactorHitPoints('perfect', 40)).toBe(200)
expect(calculateRhythmReactorHitPoints('perfect', 100)).toBe(200)
expect(calculateRhythmReactorHitPoints('miss', 50)).toBe(0)
expect(calculateRhythmReactorAccuracy(0, 0, 0)).toBe(0)
expect(calculateRhythmReactorAccuracy(8, 4, 4)).toBeCloseTo(62.5)
```

- [ ] **Step 5: Implement one game-local scoring authority**

```ts
export const RHYTHM_REACTOR_PERFECT_POINTS = 100
export const RHYTHM_REACTOR_GOOD_POINTS = 60
export const RHYTHM_REACTOR_COMBO_STEP = 10
export const RHYTHM_REACTOR_MULTIPLIER_STEP = 0.25
export const RHYTHM_REACTOR_MAX_MULTIPLIER_STEPS = 4

export function calculateRhythmReactorHitPoints(
    judgment: RhythmReactorJudgment,
    comboAfterHit: number
): number {
    if (judgment === 'miss') return 0
    const combo = Math.max(
        1,
        Math.floor(Number.isFinite(comboAfterHit) ? comboAfterHit : 1)
    )
    const steps = Math.min(
        Math.floor(combo / RHYTHM_REACTOR_COMBO_STEP),
        RHYTHM_REACTOR_MAX_MULTIPLIER_STEPS
    )
    const base =
        judgment === 'perfect'
            ? RHYTHM_REACTOR_PERFECT_POINTS
            : RHYTHM_REACTOR_GOOD_POINTS
    return Math.floor(
        base * (1 + steps * RHYTHM_REACTOR_MULTIPLIER_STEP)
    )
}

export function calculateRhythmReactorAccuracy(
    perfectHits: number,
    goodHits: number,
    misses: number
): number {
    const judgments = perfectHits + goodHits + misses
    return judgments <= 0
        ? 0
        : ((perfectHits + goodHits * 0.5) / judgments) * 100
}
```

- [ ] **Step 6: Run Task 1 gates**

```bash
bun run test:run -- \
  src/lib/games/rhythm-reactor/chart.test.ts \
  src/lib/games/rhythm-reactor/scoring.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit pure contracts**

```bash
git add src/lib/games/rhythm-reactor
git commit -m "feat(rhythm-reactor): add chart and scoring contracts"
```

---

### Task 2: Add the stable ID and BaseGame rhythm model

**Files:**
- Modify: `src/lib/games.ts` — `GameID` enum and `GAME_ICONS` only; do **not** add a `GAMES` row yet.
- Create: `src/lib/games/rhythm-reactor/RhythmReactorGame.ts`
- Create: `src/lib/games/rhythm-reactor/RhythmReactorGame.test.ts`

**Interfaces:**
- Consumes Task 1 config/chart/scoring contracts.
- Produces `RhythmReactorGame`, public `hitLane(laneIndex)`, and normal BaseGame `start/reset/end/getState/getGameStats` behavior.
- Constructor seam:

```ts
constructor(
    config: RhythmReactorConfig = createRhythmReactorConfig(),
    callbacks: BaseGameCallbacks = {},
    chart: readonly RhythmReactorNote[] = createRhythmReactorChart()
)
```

- [ ] **Step 1: Write failing stable-ID/model tests**

Use tiny explicit charts for timing boundaries:

```ts
const oneNote = [
    { id: 'note-0', laneIndex: 0 as const, hitTimeSeconds: 2 },
]
const game = new RhythmReactorGame(
    createRhythmReactorConfig(),
    {},
    oneNote
)
game.start()
game.update(1.92)
expect(game.hitLane(0)).toMatchObject({
    judgment: 'perfect',
    points: 100,
})
```

Required cases:

- initial state clones `createRhythmReactorChart()` and uses configured initial stability;
- exact `-perfectWindow` / `+perfectWindow` are Perfect;
- just outside Perfect through exact `±goodWindow` are Good;
- past Good window is a miss;
- closest same-lane note is selected when two are near;
- wrong/empty lane press registers exactly one miss and consumes no pending note;
- overdue note expires only when `elapsed > hitTime + goodWindow`;
- miss resets combo;
- combo 10 applies extra stability on that successful hit;
- stability clamps at 0/100 and zero does not end the run;
- inactive/paused/invalid lane input returns `{ accepted: false, judgment: null, noteId: null, points: 0 }` without mutation;
- reset reconstructs the chart and counters;
- timeout converts every unresolved note into misses before final stats;
- stats/gameData report hits/perfect/good/miss/maxCombo/accuracy/finalStability consistently.

- [ ] **Step 2: Run model tests and verify RED**

```bash
bun run test:run -- src/lib/games/rhythm-reactor/RhythmReactorGame.test.ts
```

- [ ] **Step 3: Add stable ID + exhaustive icon entry only**

In `src/lib/games.ts`:

```ts
RHYTHM_REACTOR = 'rhythm_reactor',
```

and:

```ts
[GameID.RHYTHM_REACTOR]: '🎵',
```

Do not add the active `GAMES` object until Task 5, when the route exists. The enum/icon land together because `GAME_ICONS` is `Record<GameID, string>`.

- [ ] **Step 4: Implement the BaseGame state machine**

Core shape:

```ts
export class RhythmReactorGame extends BaseGame<
    RhythmReactorState,
    RhythmReactorConfig,
    RhythmReactorStats
> {
    private elapsedSimSeconds = 0
    private sourceChart: readonly RhythmReactorNote[] | undefined

    constructor(
        config = createRhythmReactorConfig(),
        callbacks = {},
        chart = createRhythmReactorChart()
    ) {
        super(GameID.RHYTHM_REACTOR, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
        this.sourceChart = chart.map(note => ({ ...note }))
        this.state = this.createInitialState()
    }

    createInitialState(): RhythmReactorState {
        const chart = this.sourceChart ?? createRhythmReactorChart()
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            elapsedSeconds: 0,
            pendingNotes: chart.map(note => ({ ...note })),
            perfectHits: 0,
            goodHits: 0,
            misses: 0,
            combo: 0,
            maxCombo: 0,
            stability: this.config.initialStability,
            lastJudgment: null,
        }
    }
}
```

The fallback is required because `BaseGame` calls `createInitialState()` during `super(...)` before subclass fields are assigned. Keep this workaround local; do not refactor BaseGame.

`update(deltaTime)`:

1. guard inactive/paused/non-finite/non-positive;
2. clamp to `maxUpdateDelta`;
3. advance private and public simulation time;
4. expire every note where `elapsed > hitTime + goodWindow`;
5. emit one final state change.

`hitLane()`:

1. validate active state and integer lane range;
2. expire overdue notes once;
3. choose same-lane unresolved note with minimum absolute offset;
4. no candidate inside Good window → one stray-press miss, no note removal;
5. matched note → remove, increment combo/maxCombo, classify inclusive Perfect/Good, apply clamped stability, add score through Task 1 scorer;
6. emit once and return exact `RhythmReactorHitResult`.

Keep private helpers local:

```ts
private expireOverdueNotes(): number
private registerMiss(count: number = 1): void
private applySuccessfulHit(judgment: 'perfect' | 'good'): number
private emitStateChange(): void
```

`registerMiss(count)` increases misses, resets combo, subtracts `count * missStabilityLoss` with one clamp, and sets `lastJudgment='miss'` when count > 0.

Timeout settlement stays game-local:

```ts
protected handleTimeUp(): void {
    const remaining = this.state.pendingNotes.length
    this.state.pendingNotes = []
    this.elapsedSimSeconds = this.config.duration
    this.state.elapsedSeconds = this.config.duration
    if (remaining > 0) this.registerMiss(remaining)
    this.emitStateChange()
    super.handleTimeUp()
}
```

- [ ] **Step 5: Run model/ID gates**

```bash
bun run test:run -- \
  src/lib/games/rhythm-reactor/RhythmReactorGame.test.ts \
  src/lib/games.test.ts
bun run typecheck
```

Expected: PASS. `getGameById(GameID.RHYTHM_REACTOR)` is still undefined until Task 5; do not add a throwaway “undefined” registration test.

- [ ] **Step 6: Commit model**

```bash
git add src/lib/games.ts src/lib/games/rhythm-reactor
git commit -m "feat(rhythm-reactor): add rhythm game model"
```

---

### Task 3: Render four lanes and timing-derived falling notes

**Files:**
- Create: `src/lib/games/rhythm-reactor/RhythmReactorRenderer.ts`
- Create: `src/lib/games/rhythm-reactor/RhythmReactorRenderer.test.ts`

**Interfaces:**
- Consumes `RhythmReactorConfig` and `RhythmReactorState`.
- Produces `RhythmReactorRenderer` and `createRhythmReactorRendererConfig(config)`.

- [ ] **Step 1: Write renderer tests**

```ts
const config = createRhythmReactorConfig()
const rendererConfig = createRhythmReactorRendererConfig(config)
expect(rendererConfig).toMatchObject({
    width: 800,
    height: 420,
    laneCount: 4,
    approachSeconds: config.approachSeconds,
    noteSpawnY: config.noteSpawnY,
    hitLineY: config.hitLineY,
})
```

With Pixi graphics mocked like Signal Switch renderer tests, prove:

- setup creates one static lane graphic + one dynamic scene graphic;
- static drawing creates four lane regions/separators + one hit line;
- note farther than `approachSeconds` is not drawn;
- `timeUntilHit === approachSeconds` puts note at spawn Y;
- `timeUntilHit === 0` centers note on hit line;
- late-but-pending note moves past hit line instead of freezing;
- cleanup destroys local graphics then base resources.

- [ ] **Step 2: Run renderer test and verify RED**

```bash
bun run test:run -- src/lib/games/rhythm-reactor/RhythmReactorRenderer.test.ts
```

- [ ] **Step 3: Implement two-layer renderer**

Use fixed logical board; no sprites/textures/pooling.

```ts
private noteY(
    note: RhythmReactorNote,
    elapsedSeconds: number
): number {
    const timeUntilHit = note.hitTimeSeconds - elapsedSeconds
    const progress =
        1 - timeUntilHit / this.rhythmConfig.approachSeconds
    return lerp(
        this.rhythmConfig.noteSpawnY,
        this.rhythmConfig.hitLineY,
        progress
    )
}
```

Do not clamp progress at 1; the visible late Good window passes the line naturally. Only draw unresolved notes where:

```ts
note.hitTimeSeconds - state.elapsedSeconds <= approachSeconds
```

The game removes expired late notes. Lane position is primary identity; color is decoration only. Draw a simple stability/reactor indicator from `state.stability`; no particles/interactions.

- [ ] **Step 4: Run renderer + model gates**

```bash
bun run test:run -- src/lib/games/rhythm-reactor
bun run typecheck
```

- [ ] **Step 5: Commit renderer**

```bash
git add src/lib/games/rhythm-reactor/RhythmReactorRenderer.ts \
        src/lib/games/rhythm-reactor/RhythmReactorRenderer.test.ts
git commit -m "feat(rhythm-reactor): render falling beat lanes"
```

---

### Task 4: Wire playable Astro route, controls, lifecycle, visible HUD, and tuning checkpoint

**Files:**
- Create: `src/lib/games/rhythm-reactor/initFramework.ts`
- Create: `src/lib/games/rhythm-reactor/initFramework.test.ts`
- Create: `src/pages/rhythm-reactor/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`
- Conditional tuning-only modifications: `src/lib/games/rhythm-reactor/types.ts`, `chart.ts`, `chart.test.ts`, `scoring.ts`, `scoring.test.ts`, and the design/plan docs if the checkpoint changes documented defaults.

**Interfaces:**
- Produces `initRhythmReactorGameFramework(): Promise<RhythmReactorInitResult | undefined>`.
- Produces debug handle with `game`, `renderer`, `getGame`, `getState`, `cleanup`.
- Exposes `window.rhythmReactorGame` after async initialization.

- [ ] **Step 1: Write initializer + markup tests first**

Required initializer cases:

- missing `#rhythm-reactor-container` uses existing game-error path;
- renderer setup failure destroys partial renderer and returns undefined;
- four delegated buttons map `data-rhythm-lane="0..3"` to `hitLane()`;
- `D/F/J/K` + lowercase equivalents use same API;
- key repeat, Ctrl/Meta/Alt, `isEditableTarget(event.target)`, and events originating from lane buttons are ignored;
- Start hides Start and enables lane buttons;
- visible HUD synchronizes Combo / Hits / Judgment / Stability;
- `#rhythm-reactor-status` receives judgment/completion announcements;
- Reset returns idle `60` / Hits `0` / Stability `60` / Judgment `READY`, hides overlay, disables lanes;
- Play Again calls `game.start()` after game over and starts clean run;
- end callback fills score/hits/misses/perfect/good/max combo/accuracy/stability fields;
- beforeunload warns only while active;
- one rAF calls `game.update(delta)` + `renderer.render(state)` and clamps outer delta to config max;
- cleanup idempotently cancels rAF, removes listeners, unsubscribes end, destroys renderer/game.

Markup test asserts fixed route contract:

```ts
expect(source).toContain('id="rhythm-reactor-controls"')
expect(source.match(/data-rhythm-lane=/g)).toHaveLength(4)
expect(source).toContain('id="rhythm-reactor-combo"')
expect(source).toContain('id="rhythm-reactor-hits"')
expect(source).toContain('id="rhythm-reactor-judgment"')
expect(source).toContain('id="rhythm-reactor-stability"')
expect(source).toContain('id="rhythm-reactor-status"')
expect(source).toContain('showPause={false}')
expect(source).toContain('showEnd={false}')
expect(source).toContain('showReset={true}')
const domReady = source.indexOf('DOMContentLoaded')
const initCall = source.indexOf('initRhythmReactorGameFramework()')
expect(domReady).toBeGreaterThanOrEqual(0)
expect(initCall).toBeGreaterThan(domReady)
```

- [ ] **Step 2: Run initializer/markup tests and verify RED**

```bash
bun run test:run -- \
  src/lib/games/rhythm-reactor/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
```

- [ ] **Step 3: Build complete Astro-owned route**

Use `GamePage`, `Badge`, `Button`, `Card`. Required IDs:

```text
#rhythm-reactor-container
#rhythm-reactor-canvas
#rhythm-reactor-status
#rhythm-reactor-combo
#rhythm-reactor-hits
#rhythm-reactor-judgment
#rhythm-reactor-stability
#rhythm-reactor-controls
[data-rhythm-lane="0..3"]
#start-btn
#reset-btn
#play-again-btn
#final-hits
#final-misses
#final-perfect
#final-good
#final-max-combo
#final-accuracy
#final-stability
```

Render Combo, Hits, Judgment, and Stability as visible `slot="additional-stats"` badges, matching Signal Switch's HUD seam. Static idle values: Combo `0`, Hits `0`, Judgment `READY`, Stability from `RHYTHM_REACTOR_RULES.initialStability`.

`#rhythm-reactor-status` is `sr-only` + `aria-live="polite"`; it duplicates the judgment accessibly, not replaces visible judgment.

Button copy:

```text
Lane 1 · D
Lane 2 · F
Lane 3 · J
Lane 4 · K
```

Keep all layout structure in Astro; TypeScript only changes text/disabled/display state.

Page bootstrap:

```ts
document.addEventListener('DOMContentLoaded', () => {
  initRhythmReactorGameFramework()
    .then(handle => {
      if (handle) {
        ;(
          window as Window & { rhythmReactorGame?: typeof handle }
        ).rhythmReactorGame = handle
      }
    })
    .catch(error => {
      console.error('Rhythm Reactor failed to initialize', error)
    })
})
```

- [ ] **Step 4: Implement local initializer by following Signal Switch, not abstracting it**

Key map:

```ts
const KEY_TO_LANE: Record<string, RhythmReactorLane> = {
    d: 0,
    f: 1,
    j: 2,
    k: 3,
}
```

Normalize `keyboardEvent.key.toLowerCase()`. Import `isEditableTarget` from `shared/utils.ts` and call `isEditableTarget(keyboardEvent.target)`; no new helper.

State sync:

```ts
const hits = state.perfectHits + state.goodHits
const judgment = state.lastJudgment?.toUpperCase() ?? 'READY'
setText('rhythm-reactor-combo', String(state.combo))
setText('rhythm-reactor-hits', String(hits))
setText('rhythm-reactor-judgment', judgment)
setText('rhythm-reactor-stability', String(state.stability))
```

Use `#rhythm-reactor-status` to announce `Perfect.`, `Good.`, `Miss.`, and final completion summary without narrating incoming notes.

Final accuracy uses `stats.accuracy.toFixed(1) + '%'`.

One rAF owner:

```ts
const frame = (timestamp: number): void => {
    const delta =
        lastFrameTime === null
            ? 0
            : Math.min(
                  (timestamp - lastFrameTime) / 1000,
                  config.maxUpdateDelta
              )
    lastFrameTime = timestamp
    const state = game.getState()
    if (state.isActive && !state.isPaused) game.update(delta)
    renderer.render(game.getState())
    frameId = requestAnimationFrame(frame)
}
```

Normalize Pixi canvas inline size once:

```ts
canvas.style.width = '100%'
canvas.style.height = 'auto'
```

- [ ] **Step 5: Run local unit/markup gates**

```bash
bun run test:run -- \
  src/lib/games/rhythm-reactor \
  src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
```

- [ ] **Step 6: Perform mandatory manual-play tuning checkpoint**

Run:

```bash
bun run dev
```

Open `/rhythm-reactor` on desktop and a 375px viewport. Check:

1. **Opening readability:** first Lane 1 note is visible for full approach and DFJK is clear.
2. **Timing feel:** initial Perfect/Good windows are usable on keyboard + touch.
3. **Chart density:** Warmup → Core → Surge progression stays readable; Surge is not a visual wall.
4. **Stability feel:** misses matter and a competent run can recover/trend upward.
5. **Visual sync:** note center meets hit line at judgment time.

Allowed tuning knobs **at this checkpoint only**:

- `RHYTHM_REACTOR_RULES` timing/stability values;
- scoring constants;
- `WARMUP_PATTERN`, `CORE_PATTERN`, `SURGE_PATTERN` bytes;
- `RHYTHM_REACTOR_SECTIONS` repeat counts;
- achievement hit/combo floors only if chart tuning makes the documented defaults inappropriate.

Chart edits must preserve:

- 0.5s grid;
- lane/rest-only steps, no chords;
- first note Lane 1 and visible at t=0;
- final note exits Good window before 60s.

If chart data changes, update exact pattern/repeat/expanded-lane expectations in `chart.test.ts` in the same commit. Derive and record final note count + last hit time; do **not** preserve `86` / `57.5` merely to satisfy an old test.

Before leaving this checkpoint, confirm the final chart makes the documented achievement defaults (initially 60 hits / combo 20) attainable. If thresholds must change, update this spec + plan now; Task 5 must receive exact final values, not invent them.

Do not add audio, calibration, difficulty, random generation, or timing infrastructure to solve feel problems.

- [ ] **Step 7: Commit first playable game + any bounded tuning**

```bash
git add src/lib/games/rhythm-reactor \
        src/pages/rhythm-reactor/index.astro \
        src/pages/game-board-markup.test.ts
# If tuning changed documented defaults, also add the design/plan docs.
git commit -m "feat(rhythm-reactor): wire playable rhythm route"
```

Record the five PASS/adjusted outcomes plus final derived chart count/last-hit time in the PR description before Task 5.

---

### Task 5: Freeze post-tuning content, register live game, shared data, achievements, and repository docs

**Files:**
- Verify: `src/lib/games/rhythm-reactor/chart.test.ts` — exact post-tuning patterns/repeats/expanded lanes are now frozen.
- Modify: `src/lib/games.ts` — append active Rhythm Reactor row after Signal Switch.
- Modify: `src/lib/games.test.ts` — exact registration/icon/URL assertions.
- Modify: `src/lib/games/shared/types.ts` — canonical game-data alias + `GameData` member.
- Modify: `src/lib/organisms.test.ts` — exact depth partition `8 / 9 / 4`.
- Modify: `src/lib/achievements.ts` — four Rhythm Reactor achievements.
- Modify: `src/lib/achievements.test.ts` — exact thresholds/data guards.
- Modify: `CLAUDE.md` — 21-game list/count, folder, Pixi list, game-specific note.

**Interfaces:**
- Makes `GameID.RHYTHM_REACTOR` discoverable at `/rhythm-reactor`.
- Makes `RhythmReactorGameData` available to achievements through shared typing.
- Freezes the chart data that Task 4 proved playable before achievement thresholds become public contracts.

- [ ] **Step 1: Verify the post-tuning chart freeze before registration**

```bash
bun run test:run -- src/lib/games/rhythm-reactor/chart.test.ts
```

Inspect `createRhythmReactorChart()` once and confirm:

- exact pattern/repeat/expanded-lane tests match the values just manually played;
- final note exits its Good window before 60 seconds;
- the final chart supports the exact achievement thresholds documented below.

No chart pattern/repeat edits after this point unless a real bug is found.

- [ ] **Step 2: Add failing registration/shared-type/organism tests**

```ts
expect(GameID.RHYTHM_REACTOR).toBe('rhythm_reactor')
expect(getGameById(GameID.RHYTHM_REACTOR)).toMatchObject({
    name: 'Rhythm Reactor',
    category: 'action',
    maxPlayers: 1,
    estimatedDuration: '1 minute',
    difficulty: 'medium',
    tags: ['rhythm', 'timing', 'lanes', 'single-player', 'reflex'],
    isActive: true,
    organism: { shape: 'chain', color: 'teal' },
    depth: 'shallow',
})
expect(getGameIcon(GameID.RHYTHM_REACTOR)).toBe('🎵')
expect(getGameUrl(GameID.RHYTHM_REACTOR)).toBe('/rhythm-reactor')
expect(
    GAMES.filter(game => game.id === GameID.RHYTHM_REACTOR)
).toHaveLength(1)
```

Update only exact organism partition values:

```ts
expect(getGamesByDepth('shallow')).toHaveLength(8)
expect(getGamesByDepth('mid')).toHaveLength(9)
expect(getGamesByDepth('abyssal')).toHaveLength(4)
```

Keep adjacency regression unchanged.

- [ ] **Step 3: Add failing achievement tests**

Default reviewed thresholds are still:

```ts
const achievements = getAchievementsByGame(GameID.RHYTHM_REACTOR)
expect(achievements.map(item => item.id)).toEqual([
    'rhythm_reactor_first_beat',
    'rhythm_reactor_chain_reaction',
    'rhythm_reactor_precision_control',
    'rhythm_reactor_coolant_reserve',
])
```

Behaviorally prove:

- First Beat threshold 100;
- Chain Reaction fails at maxCombo 19, passes at 20;
- Precision Control fails at 59 hits even with 100% accuracy, fails at 60/89.9%, passes at 60/90%;
- Coolant Reserve fails at 59 hits or stability 89, passes at 60 hits/stability 90.

If Task 4 changed these exact thresholds, this step must use the already-updated exact values from the spec/plan; do not choose new thresholds in Task 5.

- [ ] **Step 4: Run focused tests and verify RED**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts
```

- [ ] **Step 5: Append active catalog object**

After Signal Switch:

```ts
{
    id: GameID.RHYTHM_REACTOR,
    name: 'Rhythm Reactor',
    description:
        'Hit falling reactor beats on time to build combo and keep the core stable',
    category: 'action',
    maxPlayers: 1,
    estimatedDuration: '1 minute',
    difficulty: 'medium',
    tags: ['rhythm', 'timing', 'lanes', 'single-player', 'reflex'],
    isActive: true,
    organism: { shape: 'chain', color: 'teal' },
    depth: 'shallow',
},
```

Do not modify home-page code; active catalog derives it.

- [ ] **Step 6: Add canonical shared game-data typing**

```ts
export type RhythmReactorGameData =
    import('../rhythm-reactor/types').RhythmReactorGameData
```

Append `| RhythmReactorGameData` to `GameData`. Do not duplicate interface.

- [ ] **Step 7: Add four achievements using existing condition types**

```ts
{
    id: 'rhythm_reactor_first_beat',
    name: 'First Beat',
    description: 'Score 100 points in Rhythm Reactor.',
    logo: '🎵',
    gameId: GameID.RHYTHM_REACTOR,
    condition: { type: 'score_threshold', threshold: 100 },
    rarity: AchievementRarity.COMMON,
},
{
    id: 'rhythm_reactor_chain_reaction',
    name: 'Chain Reaction',
    description: 'Reach a combo of 20 in Rhythm Reactor.',
    logo: '🔗',
    gameId: GameID.RHYTHM_REACTOR,
    condition: {
        type: 'in_game',
        check: (data: RhythmReactorGameData) => data.maxCombo >= 20,
    },
    rarity: AchievementRarity.RARE,
},
{
    id: 'rhythm_reactor_precision_control',
    name: 'Precision Control',
    description: 'Finish with at least 60 hits and 90% accuracy.',
    logo: '🎯',
    gameId: GameID.RHYTHM_REACTOR,
    condition: {
        type: 'in_game',
        check: (data: RhythmReactorGameData) =>
            data.hits >= 60 && data.accuracy >= 90,
    },
    rarity: AchievementRarity.EPIC,
},
{
    id: 'rhythm_reactor_coolant_reserve',
    name: 'Coolant Reserve',
    description: 'Finish with at least 60 hits and 90 reactor stability.',
    logo: '❄️',
    gameId: GameID.RHYTHM_REACTOR,
    condition: {
        type: 'in_game',
        check: (data: RhythmReactorGameData) =>
            data.hits >= 60 && data.finalStability >= 90,
    },
    rarity: AchievementRarity.EPIC,
},
```

If Task 4 approved different exact floors, substitute those already-documented numbers consistently in definition + tests. No new achievement condition type.

- [ ] **Step 8: Update repository docs**

`CLAUDE.md` must say 21 implemented games; add Rhythm Reactor to overview/list, `src/lib/games/rhythm-reactor/` to tree, Rhythm Reactor to Pixi canvas list, and game-specific note: `BaseGame + PixiJS + authored visual chart + window.rhythmReactorGame`.

If `AGENTS.md` is still a symlink to `CLAUDE.md`, leave symlink unchanged.

- [ ] **Step 9: Run registration/achievement/navigation gates**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts \
  src/lib/games/rhythm-reactor/chart.test.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
bun run typecheck
bun run lint
```

- [ ] **Step 10: Commit registration**

```bash
git add src/lib/games.ts \
        src/lib/games.test.ts \
        src/lib/games/shared/types.ts \
        src/lib/organisms.test.ts \
        src/lib/achievements.ts \
        src/lib/achievements.test.ts \
        CLAUDE.md
git commit -m "feat(rhythm-reactor): register game and achievements"
```

---

### Task 6: Add deterministic browser coverage and run final gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts` — one playable/replay test + one 375×812 layout test.
- No production files unless a failing gate reveals a real HPA-70 bug.

**Interfaces:**
- Consumes `window.rhythmReactorGame` from Task 4.
- Uses existing public methods `reset`, `start`, `update`, `getState`, and `end` through the debug handle.
- Tests `hitLane()` through the actual delegated button and document keyboard event handlers; no direct `hitLane()` call in the E2E Perfect proof.

- [ ] **Step 1: Add one synchronous Perfect-input helper**

Do **not** advance in one `page.evaluate` and then return to Playwright for an 80ms-window click. Reset/start, exact advancement, and UI event dispatch all happen in one browser task so rAF cannot interleave:

```ts
type RhythmInputKind = 'click' | 'keyboard'

type RhythmSnapshot = {
    elapsedSeconds: number
    pendingNotes: Array<{
        laneIndex: 0 | 1 | 2 | 3
        hitTimeSeconds: number
    }>
    perfectHits: number
    goodHits: number
    misses: number
    combo: number
    score: number
    stability: number
    lastJudgment: 'perfect' | 'good' | 'miss' | null
}

async function performPerfectRhythmInput(
    page: Page,
    kind: RhythmInputKind
): Promise<RhythmSnapshot> {
    return page.evaluate(inputKind => {
        const game = (
            window as Window & {
                rhythmReactorGame?: {
                    game: {
                        reset(): void
                        start(): void
                        update(deltaSeconds: number): void
                        getState(): RhythmSnapshot
                    }
                }
            }
        ).rhythmReactorGame?.game
        if (!game) {
            throw new Error('Rhythm Reactor debug handle not ready')
        }

        // Re-anchor simulation at zero inside this synchronous browser task.
        game.reset()
        game.start()

        let state = game.getState()
        const note = state.pendingNotes[0]
        if (!note) throw new Error('Rhythm Reactor chart has no first note')

        while (state.elapsedSeconds < note.hitTimeSeconds - 1e-9) {
            const remaining = note.hitTimeSeconds - state.elapsedSeconds
            game.update(Math.min(0.1, remaining))
            state = game.getState()
        }

        if (inputKind === 'click') {
            const button = document.querySelector<HTMLButtonElement>(
                `[data-rhythm-lane="${note.laneIndex}"]`
            )
            if (!button) throw new Error('Rhythm lane button not found')
            button.click()
        } else {
            const keys = ['d', 'f', 'j', 'k'] as const
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: keys[note.laneIndex],
                    bubbles: true,
                })
            )
        }

        const result = game.getState()
        if (result.lastJudgment !== 'perfect') {
            throw new Error(
                `Expected Perfect, got ${result.lastJudgment ?? 'none'}`
            )
        }
        return result
    }, kind)
}
```

This helper remains valid if Task 4 tunes first-hit time or lane data because it reads the first pending note. It adds no production pause/test API.

- [ ] **Step 2: Add main browser journey**

Route score save before any debug end:

```ts
await page.route('**/api/scores', async route => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, newAchievements: [] }),
    })
})
```

Journey:

```text
GET /rhythm-reactor
→ canvas visible; four lane buttons visible
→ visible Combo=0, Hits=0, Judgment=READY, Stability=initial value
→ Start through #start-btn and prove run becomes active/buttons enable
→ performPerfectRhythmInput('click')
→ Hits=1, Combo=1, Judgment=PERFECT, Score=Perfect base points
→ click #reset-btn
→ Time=60, Hits=0, Combo=0, Judgment=READY, Stability=initial value, Start visible
→ performPerfectRhythmInput('keyboard')
→ Hits=1, Judgment=PERFECT
→ call debug handle game.end() and await overlay
→ final Hits=1 and overlay visible
→ click Play Again
→ overlay hidden, Start hidden, Hits=0, Judgment=READY, Stability=initial value
```

Do not reproduce timeout settlement here; Task 2 unit tests own that contract.

- [ ] **Step 3: Add 375×812 layout proof**

Set viewport `375×812`, load `/rhythm-reactor`, assert:

- exactly four `[data-rhythm-lane]` buttons;
- all four visible and bounding boxes within 375px viewport;
- all four additional-stat badges are visible/reachable;
- `document.scrollingElement.scrollWidth <= 375`;
- Pixi canvas visible, width `<= 375`, height `> 0`.

Do not freeze exact CSS height/row count.

- [ ] **Step 4: Run focused browser suite**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Expected: Rhythm Reactor tests and all existing journeys PASS without timing-window sleeps.

- [ ] **Step 5: Run final repository gates**

```bash
bun run test:coverage
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
```

Scope check:

```bash
git diff --name-only "$(git merge-base HEAD main)"...HEAD
```

Expected production scope: Rhythm Reactor-local files/page plus `games.ts`, shared game-data typing, achievements, and `CLAUDE.md`. No BaseGame/GameTimer/ScoreManager/GameInitializer/PixiJSRenderer/service/API/DB/schema/package changes.

- [ ] **Step 6: Commit browser coverage**

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(rhythm-reactor): cover browser lifecycle and mobile layout"
```

- [ ] **Step 7: Update PR description with implementation evidence**

Replace planning-only summary with:

- final post-checkpoint chart pattern/repeat values;
- final derived note count and last-hit time;
- final timing/stability/scoring + achievement thresholds;
- five manual-play outcomes;
- targeted/unit/E2E/full-gate results;
- any approved scope deviation, otherwise explicit none;
- confirmation ticket stayed one PR and no audio/core/backend subsystem was introduced.

Do not create a second implementation PR for HPA-70.

---

## Plan Self-Review

- **Spec coverage:** chart materialization/content, tuning gate, timing windows, input, scoring, stability, timeout settlement, visible HUD, reset/replay, Pixi renderer, responsive route, registration, shared game data, achievements, deterministic browser proof, and final gates map to Tasks 1–6.
- **Chart freeze:** Task 1 pins current authored bytes/repeats/expanded lanes but derives aggregate count/time. Task 4 is the only tuning window. Task 5 freezes the manually played post-tuning data before achievements.
- **E2E timing:** Perfect input never crosses an evaluate/Playwright gap; advancement + event dispatch are synchronous and exact to the target note.
- **YAGNI:** no audio, calibration, selector, chart loader/editor, procedural generation, special notes, early meltdown, shared rhythm engine, core change, backend/schema work, or new package.
- **Type consistency:** `RhythmReactorGameData` remains canonical in game `types.ts`; shared types alias it. Input converges on `hitLane(laneIndex)`. Renderer derives Y from hit time + elapsed time.
- **HUD consistency:** visible badge IDs are defined in spec, markup task, initializer tests, and E2E; live region is accessibility duplication.
- **Single-PR:** all six implementation slices remain on HPA-70 PR #74.
- **Risk check:** the plan explicitly mitigates narrow-window E2E races and unreadable surge density without loosening timing semantics or adding architecture.
- **Placeholder scan:** no TBD/TODO. The only implementation-time flexibility is the explicitly bounded Task 4 tuning checkpoint.