# Rhythm Reactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-70 as a deterministic 60-second four-lane visual rhythm minigame with keyboard/touch input, Pixi rendering, scoring, achievements, and existing Cetus score submission.

**Architecture:** `RhythmReactorGame` extends `BaseGame` and reads a materialized authored chart from `RhythmReactorConfig`. A game-local scorer owns hit points/accuracy; `RhythmReactorRenderer` extends `PixiJSRenderer`; one local initializer owns one rAF loop and native Astro lane buttons. BaseGame remains the wall-clock timer/persistence/lifecycle authority. No audio or shared rhythm framework is added.

**Tech Stack:** Astro 5, TypeScript 6, BaseGame/GameTimer/ScoreManager, PixiJS 8, Tailwind 4, Vitest 3, Playwright 1.54, Bun 1.3.

**Spec:** `docs/superpowers/specs/2026-08-23-rhythm-reactor-design.md`

## Global Constraints

- One HPA-70 implementation PR; all six slices stay on PR #74.
- 60-second fixed run; four lanes; `D/F/J/K`; touch through four native buttons.
- Structural chart model: 120 BPM / `0.5s` steps; one lane/rest per step; no chords; hit time derives from `firstHitTime + stepIndex * beatStepSeconds`.
- First note remains Lane 1 and is visible from run start (`firstHitTimeSeconds === approachSeconds`).
- Current authored data is WARMUP×2 + CORE×2 + SURGE×3, deriving 86 notes and last hit 57.5s. Pattern bytes/repeats remain tuning data until Task 4.
- Initial judgment defaults: Perfect `±0.080s`, Good `±0.160s`, Miss `±0.400s`; boundaries inclusive.
- A note inside the Miss window is consumed exactly once as Perfect/Good/Miss. Input with no same-lane note inside the Miss window becomes a separate stray press.
- `misses` means chart-note misses only; `strayPresses` is separate. Weighted accuracy includes both so mashing is penalized.
- Initial stability: 60; Perfect +4; Good +2; note Miss −6; stray press −6; every 10th consecutive successful hit +5; clamp `0..100`.
- Stability never ends the run; BaseGame timeout is the normal completion path.
- Initial scoring: Perfect 100, Good 60; +0.25× each 10 combo, cap 2.0×; BaseGame time bonus disabled.
- GamePage: `showPause={false}`, `showEnd={false}`, `showReset={true}`.
- Visible in-run badges are Combo / Hits / Judgment / Stability. `#rhythm-reactor-status` is the accessible duplicate.
- No audio/Web Audio/calibration, song/difficulty selector, chart loader/editor/DSL, random chart generation, special note types, canvas hit-testing, shared rhythm framework, package addition, DB/API/schema/auth change, or core-runtime refactor.
- `BaseGame.ts`, `GameTimer.ts`, `ScoreManager.ts`, `GameInitializer.ts`, `PixiJSRenderer.ts`, score service, APIs, DB/schema, packages, and existing shared input helpers remain production-unchanged.
- Follow Signal Switch/Potion Sorter seams; do not import Signal Switch game rules/scorer or create a shared chart framework.
- Reuse `isEditableTarget` exactly as exported.
- Run the mandatory manual-play tuning checkpoint after Task 4 and before Task 5 freezes chart and achievement values.

---

## File Map

### New game-local production files

- `src/lib/games/rhythm-reactor/types.ts` — rule constants and state/config/stats/data/result types.
- `src/lib/games/rhythm-reactor/chart.ts` — three authored patterns, section repeats, pure chart materializer.
- `src/lib/games/rhythm-reactor/scoring.ts` — hit score and weighted accuracy authority.
- `src/lib/games/rhythm-reactor/RhythmReactorGame.ts` — config factory + BaseGame model/judgments/lifecycle.
- `src/lib/games/rhythm-reactor/RhythmReactorRenderer.ts` — two-layer Pixi renderer.
- `src/lib/games/rhythm-reactor/initFramework.ts` — DOM callbacks, controls, rAF, cleanup/debug handle.
- `src/pages/rhythm-reactor/index.astro` — route markup/styles/bootstrap.

### New co-located tests

- `src/lib/games/rhythm-reactor/chart.test.ts`
- `src/lib/games/rhythm-reactor/scoring.test.ts`
- `src/lib/games/rhythm-reactor/RhythmReactorGame.test.ts`
- `src/lib/games/rhythm-reactor/RhythmReactorRenderer.test.ts`
- `src/lib/games/rhythm-reactor/initFramework.test.ts`

### Existing files changed when their contract becomes live

- `src/lib/games.ts` — Task 2 ID/icon; Task 5 active catalog row.
- `src/lib/games.test.ts` — Task 5 registration.
- `src/lib/games/shared/types.ts` — Task 5 canonical game-data alias.
- `src/lib/organisms.test.ts` — Task 5 partition `8 / 9 / 4`.
- `src/lib/achievements.ts`, `src/lib/achievements.test.ts` — Task 5 four achievements.
- `src/pages/game-board-markup.test.ts` — Task 4 shared route array + Rhythm selectors/bootstrap.
- `e2e/games/play-coverage.spec.ts` — Task 6 deterministic journey + 375px proof.
- `CLAUDE.md` — Task 5 21-game documentation.

---

### Task 1: Add structural rules, authored chart data, and scoring

**Files:**
- Create: `src/lib/games/rhythm-reactor/types.ts`
- Create: `src/lib/games/rhythm-reactor/chart.ts`
- Create: `src/lib/games/rhythm-reactor/chart.test.ts`
- Create: `src/lib/games/rhythm-reactor/scoring.ts`
- Create: `src/lib/games/rhythm-reactor/scoring.test.ts`

**Interfaces:**
- Produces `RHYTHM_REACTOR_RULES`, `RhythmReactorLane`, `RhythmReactorJudgment`, `RhythmReactorNote`, `RhythmReactorConfig`, `RhythmReactorState`, `RhythmReactorStats`, `RhythmReactorGameData`, `RhythmReactorHitResult`.
- Produces `WARMUP_PATTERN`, `CORE_PATTERN`, `SURGE_PATTERN`, `RHYTHM_REACTOR_SECTIONS`, `createRhythmReactorChart()`.
- Produces `calculateRhythmReactorHitPoints()` and `calculateRhythmReactorAccuracy()`.
- `createRhythmReactorConfig()` deliberately waits for Task 2 so it can import the materializer without creating `types.ts ↔ chart.ts` cycles.

- [ ] **Step 1: Write exact authored-content and permanent invariant tests**

Create `chart.test.ts`:

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
    it('pins current authored data by value', () => {
        expect(WARMUP_PATTERN).toEqual(expectedWarmup)
        expect(CORE_PATTERN).toEqual(expectedCore)
        expect(SURGE_PATTERN).toEqual(expectedSurge)
        expect(RHYTHM_REACTOR_SECTIONS.map(section => section.repeats)).toEqual([
            2, 2, 3,
        ])

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
        expect(chart.map((note, index) => note.id)).toEqual(
            chart.map((_, index) => `note-${index}`)
        )
    })

    it('protects invariants independent of authored tuning', () => {
        const chart = createRhythmReactorChart()
        expect(chart[0].laneIndex).toBe(0)
        expect(RHYTHM_REACTOR_RULES.firstHitTimeSeconds).toBe(
            RHYTHM_REACTOR_RULES.approachSeconds
        )
        expect(
            chart.at(-1)!.hitTimeSeconds +
                RHYTHM_REACTOR_RULES.missWindowSeconds
        ).toBeLessThan(RHYTHM_REACTOR_RULES.duration)

        for (const note of chart) {
            expect(note.laneIndex).toBeGreaterThanOrEqual(0)
            expect(note.laneIndex).toBeLessThanOrEqual(3)
        }
        for (let index = 1; index < chart.length; index += 1) {
            const gap =
                chart[index].hitTimeSeconds - chart[index - 1].hitTimeSeconds
            expect(gap).toBeGreaterThan(0)
            const steps = gap / RHYTHM_REACTOR_RULES.beatStepSeconds
            expect(steps).toBeCloseTo(Math.round(steps), 10)
        }
    })
})
```

Only the first test's pattern/repeat values may change during Task 4 tuning. The second test is structural and must not be edited to make tuned content pass.

- [ ] **Step 2: Run chart test and verify RED**

```bash
bun run test:run -- src/lib/games/rhythm-reactor/chart.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement rules/types and chart materializer**

`RHYTHM_REACTOR_RULES` starts as:

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
    missWindowSeconds: 0.4,
    maxUpdateDelta: 0.1,
    noteSpawnY: 40,
    hitLineY: 340,
    initialStability: 60,
    perfectStabilityGain: 4,
    goodStabilityGain: 2,
    missStabilityLoss: 6,
    strayStabilityLoss: 6,
    comboStabilityInterval: 10,
    comboStabilityBonus: 5,
} as const
```

Define config with chart ownership:

```ts
export interface RhythmReactorConfig extends BaseGameConfig {
    canvasWidth: number
    canvasHeight: number
    laneCount: number
    beatStepSeconds: number
    firstHitTimeSeconds: number
    approachSeconds: number
    perfectWindowSeconds: number
    goodWindowSeconds: number
    missWindowSeconds: number
    maxUpdateDelta: number
    noteSpawnY: number
    hitLineY: number
    initialStability: number
    perfectStabilityGain: number
    goodStabilityGain: number
    missStabilityLoss: number
    strayStabilityLoss: number
    comboStabilityInterval: number
    comboStabilityBonus: number
    chart: readonly RhythmReactorNote[]
}
```

State includes `strayPresses: number`. Stats/data include `strayPresses` too.

`chart.ts` exports the exact three arrays from the spec plus:

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
        for (let repeat = 0; repeat < repeats; repeat += 1) {
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

- [ ] **Step 4: Write scoring tests including stray presses**

```ts
expect(calculateRhythmReactorHitPoints('perfect', 1)).toBe(100)
expect(calculateRhythmReactorHitPoints('good', 9)).toBe(60)
expect(calculateRhythmReactorHitPoints('perfect', 10)).toBe(125)
expect(calculateRhythmReactorHitPoints('perfect', 20)).toBe(150)
expect(calculateRhythmReactorHitPoints('perfect', 30)).toBe(175)
expect(calculateRhythmReactorHitPoints('perfect', 40)).toBe(200)
expect(calculateRhythmReactorHitPoints('miss', 40)).toBe(0)
expect(calculateRhythmReactorAccuracy(0, 0, 0, 0)).toBe(0)
expect(calculateRhythmReactorAccuracy(8, 4, 4, 0)).toBeCloseTo(62.5)
expect(calculateRhythmReactorAccuracy(8, 4, 4, 2)).toBeCloseTo(55.555, 2)
```

- [ ] **Step 5: Implement game-local scorer**

```ts
export function calculateRhythmReactorAccuracy(
    perfectHits: number,
    goodHits: number,
    misses: number,
    strayPresses: number
): number {
    const judgments = perfectHits + goodHits + misses + strayPresses
    return judgments <= 0
        ? 0
        : ((perfectHits + goodHits * 0.5) / judgments) * 100
}
```

Keep Perfect/Good point constants and combo multiplier logic local; do not reuse Signal Switch's formula.

- [ ] **Step 6: Run Task 1 gates**

```bash
bun run test:run -- \
  src/lib/games/rhythm-reactor/chart.test.ts \
  src/lib/games/rhythm-reactor/scoring.test.ts
bun run typecheck
```

- [ ] **Step 7: Commit Task 1**

```bash
git add src/lib/games/rhythm-reactor
git commit -m "feat(rhythm-reactor): add chart and scoring contracts"
```

---

### Task 2: Add stable ID, config factory, and BaseGame rhythm model

**Files:**
- Modify: `src/lib/games.ts` — add `GameID` + exhaustive icon only.
- Create: `src/lib/games/rhythm-reactor/RhythmReactorGame.ts`
- Create: `src/lib/games/rhythm-reactor/RhythmReactorGame.test.ts`

**Interfaces:**
- Produces `createRhythmReactorConfig(overrides?: Partial<RhythmReactorConfig>): RhythmReactorConfig`.
- Produces `RhythmReactorGame`, `hitLane(laneIndex)`, and normal BaseGame lifecycle.
- Constructor is exactly config + callbacks; there is no third chart argument.

- [ ] **Step 1: Write failing config/model tests**

Use tiny config-owned charts:

```ts
const oneNote = [
    { id: 'note-0', laneIndex: 0 as const, hitTimeSeconds: 2 },
]
const config = createRhythmReactorConfig({ chart: oneNote })
const game = new RhythmReactorGame(config)
```

Use bounded deterministic advancement because `update()` clamps each call:

```ts
function advanceGame(game: RhythmReactorGame, seconds: number): void {
    let remaining = seconds
    while (remaining > 1e-9) {
        const step = Math.min(0.1, remaining)
        game.update(step)
        remaining -= step
    }
}
```

Required tests:

- config factory materializes a fresh default chart and allows `{ chart: tinyChart }` override;
- initial state clones `config.chart`; mutating returned state cannot mutate config chart;
- exact Perfect boundaries are Perfect;
- just outside Perfect through exact Good boundaries are Good;
- just outside Good through exact Miss boundaries consume the note as one Miss;
- an early `0.20s` press on the one-note fixture yields `misses=1`, `strayPresses=0`, removes the note, and never creates a second miss later;
- no same-lane note inside Miss window yields `strayPresses=1`, `misses=0`, and leaves pending notes untouched;
- update expiry occurs only after `hitTime + missWindowSeconds`;
- `misses` never exceeds the source chart length;
- note Miss and stray press each reset combo and reduce stability exactly once;
- combo 10 applies its stability bonus on that successful hit;
- stability clamps 0..100 and 0 does not end the run;
- inactive/paused/invalid lane input returns rejected result with no mutation;
- reset reconstructs from config chart and clears `strayPresses` too;
- timeout converts every remaining note to note misses and does not synthesize strays;
- stats/data/accuracy use `strayPresses` consistently.

- [ ] **Step 2: Run model tests and verify RED**

```bash
bun run test:run -- src/lib/games/rhythm-reactor/RhythmReactorGame.test.ts
```

- [ ] **Step 3: Add stable GameID + icon, but not the catalog row**

```ts
RHYTHM_REACTOR = 'rhythm_reactor',
```

and in exhaustive `GAME_ICONS`:

```ts
[GameID.RHYTHM_REACTOR]: '🎵',
```

Do not add `GAMES` entry yet.

- [ ] **Step 4: Implement config factory beside the game**

Follow Potion Sorter's placement so there is no `types.ts ↔ chart.ts` cycle:

```ts
export function createRhythmReactorConfig(
    overrides: Partial<RhythmReactorConfig> = {}
): RhythmReactorConfig {
    return {
        ...RHYTHM_REACTOR_RULES,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        chart: createRhythmReactorChart(),
        ...overrides,
    }
}
```

- [ ] **Step 5: Implement BaseGame state without constructor workaround**

```ts
export class RhythmReactorGame extends BaseGame<
    RhythmReactorState,
    RhythmReactorConfig,
    RhythmReactorStats
> {
    private elapsedSimSeconds = 0

    constructor(
        config: RhythmReactorConfig = createRhythmReactorConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.RHYTHM_REACTOR, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): RhythmReactorState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            elapsedSeconds: 0,
            pendingNotes: this.config.chart.map(note => ({ ...note })),
            perfectHits: 0,
            goodHits: 0,
            misses: 0,
            strayPresses: 0,
            combo: 0,
            maxCombo: 0,
            stability: this.config.initialStability,
            lastJudgment: null,
        }
    }
}
```

BaseGame assigns `this.config` before it invokes `createInitialState()`, so this needs no fallback/reassignment.

- [ ] **Step 6: Implement update and one-resolution judgment semantics**

`update(deltaTime)`:

1. guard inactive/paused/non-finite/non-positive;
2. clamp to `maxUpdateDelta`;
3. advance private/public sim time;
4. expire notes where `elapsed > hitTime + missWindowSeconds` as note misses;
5. emit once.

`hitLane(laneIndex)`:

1. validate active state and integer lane range;
2. expire already-overdue notes once;
3. find nearest same-lane pending note whose absolute offset is `<= missWindowSeconds`;
4. no candidate → `registerStrayPress()`; no note removal;
5. candidate → remove it and classify Perfect / Good / Miss from inclusive windows;
6. successful hit increments combo/maxCombo, adjusts stability, adds score;
7. Miss calls `registerNoteMiss(1)` only once;
8. emit once and return `RhythmReactorHitResult`.

Private helpers:

```ts
private expireOverdueNotes(): number
private registerNoteMiss(count: number = 1): void
private registerStrayPress(): void
private applySuccessfulHit(judgment: 'perfect' | 'good'): number
private emitStateChange(): void
```

`registerNoteMiss(count)` increments only `misses`, resets combo, subtracts `count * missStabilityLoss`, clamps, and sets `lastJudgment='miss'`.

`registerStrayPress()` increments only `strayPresses`, resets combo, subtracts `strayStabilityLoss`, clamps, and sets `lastJudgment='miss'`.

- [ ] **Step 7: Implement timeout settlement**

```ts
protected handleTimeUp(): void {
    const remaining = this.state.pendingNotes.length
    this.state.pendingNotes = []
    this.elapsedSimSeconds = this.config.duration
    this.state.elapsedSeconds = this.config.duration
    if (remaining > 0) this.registerNoteMiss(remaining)
    this.emitStateChange()
    super.handleTimeUp()
}
```

- [ ] **Step 8: Run model/ID gates**

```bash
bun run test:run -- \
  src/lib/games/rhythm-reactor/RhythmReactorGame.test.ts \
  src/lib/games.test.ts
bun run typecheck
```

No test should require an active catalog row yet.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/lib/games.ts src/lib/games/rhythm-reactor
git commit -m "feat(rhythm-reactor): add rhythm game model"
```

---

### Task 3: Render four lanes and timing-derived notes

**Files:**
- Create: `src/lib/games/rhythm-reactor/RhythmReactorRenderer.ts`
- Create: `src/lib/games/rhythm-reactor/RhythmReactorRenderer.test.ts`

**Interfaces:**
- Consumes `RhythmReactorConfig` + `RhythmReactorState`.
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

Prove:

- exactly one static graphic + one dynamic graphic;
- four lane regions/separators and one hit line;
- note farther than approach horizon is not drawn;
- note at approach horizon is at spawn Y;
- note at hit time is on hit line;
- pending note inside late Miss window has `y > hitLineY`;
- cleanup destroys local graphics then base resources.

- [ ] **Step 2: Run renderer test and verify RED**

```bash
bun run test:run -- src/lib/games/rhythm-reactor/RhythmReactorRenderer.test.ts
```

- [ ] **Step 3: Implement two-layer Pixi renderer**

Use direct arithmetic, not shared clamping `lerp`:

```ts
private noteY(
    note: RhythmReactorNote,
    elapsedSeconds: number
): number {
    const timeUntilHit = note.hitTimeSeconds - elapsedSeconds
    const progress =
        1 - timeUntilHit / this.rhythmConfig.approachSeconds
    return (
        this.rhythmConfig.noteSpawnY +
        (this.rhythmConfig.hitLineY - this.rhythmConfig.noteSpawnY) * progress
    )
}
```

Draw only unresolved notes whose `hitTime - elapsed <= approachSeconds`. Model expiry controls the late end of visibility.

Draw a simple stability indicator; no textures, sprites, pooling, particles, or interaction.

- [ ] **Step 4: Run local renderer/model gates**

```bash
bun run test:run -- src/lib/games/rhythm-reactor
bun run typecheck
```

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib/games/rhythm-reactor/RhythmReactorRenderer.ts \
        src/lib/games/rhythm-reactor/RhythmReactorRenderer.test.ts
git commit -m "feat(rhythm-reactor): render falling beat lanes"
```

---

### Task 4: Wire route, controls, visible HUD, lifecycle, and tuning checkpoint

**Files:**
- Create: `src/lib/games/rhythm-reactor/initFramework.ts`
- Create: `src/lib/games/rhythm-reactor/initFramework.test.ts`
- Create: `src/pages/rhythm-reactor/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`
- Conditional tuning edits: Rhythm Reactor rule/chart/scoring tests + spec/plan only when checkpoint changes documented defaults.

**Interfaces:**
- Produces `initRhythmReactorGameFramework(): Promise<RhythmReactorInitResult | undefined>`.
- Exposes debug handle `window.rhythmReactorGame` with `game`, `renderer`, `getGame`, `getState`, `cleanup`.

- [ ] **Step 1: Write initializer/markup RED tests**

Initializer cases:

- missing root uses existing game-error path;
- renderer init failure cleans partial renderer;
- four delegated buttons map lanes to `hitLane()`;
- case-insensitive DFJK share that API;
- repeat / Ctrl / Meta / Alt / `isEditableTarget` / native-button-origin keyboard events are ignored;
- Start hides Start and enables lane buttons;
- state sync updates visible Combo/Hits/Judgment/Stability;
- live region receives judgment/completion copy;
- Reset restores idle 60s, Hits 0, Judgment READY, configured stability, disables lanes, hides overlay;
- Play Again calls `game.start()` after game over;
- end callback fills Hits/Misses/Stray/Perfect/Good/MaxCombo/Accuracy/Stability;
- beforeunload warns only while active;
- one rAF calls update + render and clamps by `config.maxUpdateDelta`;
- cleanup is idempotent.

In `src/pages/game-board-markup.test.ts`, first append the route to the existing shared array:

```ts
const games = [
    // existing entries...
    'signal-switch',
    'rhythm-reactor',
]
```

This makes the existing shared test enforce `GamePage`, `slot="game-board"`, and no direct `AppLayout` import.

Also add Rhythm-specific source assertions:

```ts
expect(source).toContain('id="rhythm-reactor-controls"')
expect(source.match(/data-rhythm-lane=/g)).toHaveLength(4)
for (const id of [
    'rhythm-reactor-combo',
    'rhythm-reactor-hits',
    'rhythm-reactor-judgment',
    'rhythm-reactor-stability',
    'rhythm-reactor-status',
    'final-hits',
    'final-misses',
    'final-stray-presses',
    'final-perfect',
    'final-good',
    'final-max-combo',
    'final-accuracy',
    'final-stability',
]) {
    expect(source).toContain(`id="${id}"`)
}
expect(source).toContain('showPause={false}')
expect(source).toContain('showEnd={false}')
expect(source).toContain('showReset={true}')
const readyIndex = source.indexOf('DOMContentLoaded')
const initIndex = source.indexOf('initRhythmReactorGameFramework()')
expect(readyIndex).toBeGreaterThanOrEqual(0)
expect(initIndex).toBeGreaterThan(readyIndex)
```

- [ ] **Step 2: Run initializer/markup tests and verify RED**

```bash
bun run test:run -- \
  src/lib/games/rhythm-reactor/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
```

- [ ] **Step 3: Build Astro-owned route**

Use `GamePage`, `Badge`, `Button`, `Card`.

Required board/control IDs:

```text
#rhythm-reactor-container
#rhythm-reactor-canvas
#rhythm-reactor-status
#rhythm-reactor-controls
[data-rhythm-lane="0..3"]
#start-btn
#reset-btn
#play-again-btn
```

Visible `additional-stats` badges:

```text
#rhythm-reactor-combo
#rhythm-reactor-hits
#rhythm-reactor-judgment
#rhythm-reactor-stability
```

Final fields:

```text
#final-hits
#final-misses
#final-stray-presses
#final-perfect
#final-good
#final-max-combo
#final-accuracy
#final-stability
```

Button copy: `Lane 1 · D`, `Lane 2 · F`, `Lane 3 · J`, `Lane 4 · K`.

`#rhythm-reactor-status` is `sr-only` + `aria-live="polite"`.

- [ ] **Step 4: Implement local initializer following Signal Switch seam**

```ts
const KEY_TO_LANE: Record<string, RhythmReactorLane> = {
    d: 0,
    f: 1,
    j: 2,
    k: 3,
}
```

Import `isEditableTarget` from shared utils. Do not add a new helper.

Visible state sync:

```ts
const hits = state.perfectHits + state.goodHits
const judgment = state.lastJudgment?.toUpperCase() ?? 'READY'
setText('rhythm-reactor-combo', String(state.combo))
setText('rhythm-reactor-hits', String(hits))
setText('rhythm-reactor-judgment', judgment)
setText('rhythm-reactor-stability', String(state.stability))
```

End sync additionally writes `stats.strayPresses` to `#final-stray-presses` and formats accuracy to one decimal percent.

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

Normalize canvas inline sizing exactly once:

```ts
canvas.style.width = '100%'
canvas.style.height = 'auto'
```

- [ ] **Step 5: Run local gates**

```bash
bun run test:run -- \
  src/lib/games/rhythm-reactor \
  src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
```

- [ ] **Step 6: Perform mandatory manual-play tuning checkpoint**

```bash
bun run dev
```

Play `/rhythm-reactor` on desktop and 375px width. Check:

1. first Lane-1 note and DFJK readability;
2. Perfect / Good / Miss-window feel for keyboard and touch;
3. Warmup → Core → Surge density;
4. note-Miss vs stray-press stability feel and anti-mashing behavior;
5. visual hit-line timing.

Allowed tuning knobs at this checkpoint only:

- `RHYTHM_REACTOR_RULES` timing/stability values, including Miss window;
- scoring constants;
- WARMUP/CORE/SURGE bytes;
- section repeat counts;
- achievement thresholds tied to final score/chart density.

Chart edits must keep all permanent invariants in Task 1. Update the exact authored-data expectations in the same tuning commit; do not edit permanent invariant assertions to fit content.

Before leaving the checkpoint:

- record final derived note count + last hit time;
- verify final note + Miss window is before timeout;
- confirm Chain Reaction and Coolant Reserve thresholds remain attainable;
- confirm Precision Control at 90% reflects roughly 90% of the complete final chart;
- update spec/plan exact defaults if tuning changed them.

Do not solve tuning with audio, calibration, difficulty modes, random generation, or new timing infrastructure.

- [ ] **Step 7: Commit playable route + bounded tuning**

```bash
git add src/lib/games/rhythm-reactor \
        src/pages/rhythm-reactor/index.astro \
        src/pages/game-board-markup.test.ts \
        docs/superpowers/specs/2026-08-23-rhythm-reactor-design.md \
        docs/superpowers/plans/2026-08-23-rhythm-reactor.md
git commit -m "feat(rhythm-reactor): wire playable rhythm route"
```

If docs did not change at tuning, omit them from `git add`.

---

### Task 5: Freeze post-tuning content, register game, achievements, and docs

**Files:**
- Verify: `src/lib/games/rhythm-reactor/chart.test.ts`
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/organisms.test.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Makes `GameID.RHYTHM_REACTOR` discoverable at `/rhythm-reactor`.
- Adds canonical `RhythmReactorGameData` to shared `GameData`.
- Freezes achievement thresholds against the manually played final chart.

- [ ] **Step 1: Verify post-tuning chart freeze**

```bash
bun run test:run -- src/lib/games/rhythm-reactor/chart.test.ts
```

Confirm exact pattern/repeat/expanded-lane expectations equal the manually played content and permanent invariants still pass. No further content retuning after this point unless fixing a real bug.

- [ ] **Step 2: Write registration/organism tests**

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
```

Update only the exact partition assertion:

```ts
expect(getGamesByDepth('shallow')).toHaveLength(8)
expect(getGamesByDepth('mid')).toHaveLength(9)
expect(getGamesByDepth('abyssal')).toHaveLength(4)
```

Keep adjacency regression unchanged.

- [ ] **Step 3: Write achievement RED tests**

Initial IDs:

```ts
expect(getAchievementsByGame(GameID.RHYTHM_REACTOR).map(a => a.id)).toEqual([
    'rhythm_reactor_first_beat',
    'rhythm_reactor_chain_reaction',
    'rhythm_reactor_precision_control',
    'rhythm_reactor_coolant_reserve',
])
```

Initial behavior:

- First Beat threshold 100;
- Chain Reaction fails 19, passes 20 combo;
- Precision Control fails at 89.9% and passes at 90%; **no hit floor**;
- Precision Control also fails when stray presses pull computed accuracy below 90%;
- Coolant Reserve fails with hits 59 or stability 89 and passes at hits 60/stability 90.

If Task 4 changed exact score/combo/hit thresholds, use the already-documented final values; do not retune in Task 5.

- [ ] **Step 4: Run focused tests and verify RED**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts
```

- [ ] **Step 5: Append active catalog row**

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

Do not edit home-page code; active catalog drives it.

- [ ] **Step 6: Add canonical shared game-data alias**

```ts
export type RhythmReactorGameData =
    import('../rhythm-reactor/types').RhythmReactorGameData
```

Append it to `GameData`; do not duplicate the interface.

- [ ] **Step 7: Add four achievements using existing condition types**

Initial definitions:

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
    description: 'Finish with at least 90% weighted accuracy.',
    logo: '🎯',
    gameId: GameID.RHYTHM_REACTOR,
    condition: {
        type: 'in_game',
        check: (data: RhythmReactorGameData) => data.accuracy >= 90,
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

Use Task 4's final documented thresholds if changed.

- [ ] **Step 8: Update `CLAUDE.md` only**

Update implemented-game count to 21, overview list, rhythm-reactor folder, Pixi renderer list, and game-specific note (`BaseGame + PixiJS + authored visual chart + window.rhythmReactorGame`). Leave `AGENTS.md` symlink itself unchanged if still present.

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

- [ ] **Step 10: Commit Task 5**

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

### Task 6: Add race-free browser coverage and final gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- No production changes unless a gate reveals a real HPA-70 defect.

**Interfaces:**
- Consumes `window.rhythmReactorGame`.
- Exercises `hitLane()` only through real delegated button/keyboard handlers.
- Uses public `reset/start/update/getState/end` through the existing debug handle.

- [ ] **Step 1: Add synchronous Perfect helper with iteration cap and HUD snapshot**

Do not return to Playwright between exact advancement and timing-sensitive HUD reads:

```ts
type RhythmInputKind = 'click' | 'keyboard'

type RhythmPerfectResult = {
    state: {
        perfectHits: number
        goodHits: number
        misses: number
        strayPresses: number
        combo: number
        score: number
        stability: number
        lastJudgment: 'perfect' | 'good' | 'miss' | null
    }
    hud: {
        hits: string
        combo: string
        judgment: string
        stability: string
        score: string
    }
}

async function performPerfectRhythmInput(
    page: Page,
    kind: RhythmInputKind
): Promise<RhythmPerfectResult> {
    return page.evaluate(inputKind => {
        const game = (
            window as Window & {
                rhythmReactorGame?: {
                    game: {
                        reset(): void
                        start(): void
                        update(deltaSeconds: number): void
                        getState(): {
                            elapsedSeconds: number
                            pendingNotes: Array<{
                                laneIndex: 0 | 1 | 2 | 3
                                hitTimeSeconds: number
                            }>
                            perfectHits: number
                            goodHits: number
                            misses: number
                            strayPresses: number
                            combo: number
                            score: number
                            stability: number
                            lastJudgment: 'perfect' | 'good' | 'miss' | null
                        }
                    }
                }
            }
        ).rhythmReactorGame?.game
        if (!game) throw new Error('Rhythm Reactor debug handle not ready')

        game.reset()
        game.start()

        let state = game.getState()
        const note = state.pendingNotes[0]
        if (!note) throw new Error('Rhythm Reactor chart has no first note')

        const MAX_UPDATES = 1000
        let reached = false
        for (let step = 0; step < MAX_UPDATES; step += 1) {
            state = game.getState()
            const remaining = note.hitTimeSeconds - state.elapsedSeconds
            if (remaining <= 1e-9) {
                reached = true
                break
            }
            game.update(Math.min(0.1, remaining))
        }
        if (!reached) {
            throw new Error(
                `Rhythm Reactor did not reach first note within ${MAX_UPDATES} updates`
            )
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

        const text = (id: string): string =>
            document.getElementById(id)?.textContent?.trim() ?? ''

        return {
            state: {
                perfectHits: result.perfectHits,
                goodHits: result.goodHits,
                misses: result.misses,
                strayPresses: result.strayPresses,
                combo: result.combo,
                score: result.score,
                stability: result.stability,
                lastJudgment: result.lastJudgment,
            },
            hud: {
                hits: text('rhythm-reactor-hits'),
                combo: text('rhythm-reactor-combo'),
                judgment: text('rhythm-reactor-judgment'),
                stability: text('rhythm-reactor-stability'),
                score: text('score'),
            },
        }
    }, kind)
}
```

The bounded loop gives a descriptive error instead of a 30-second Playwright hang if `update()` stops advancing.

- [ ] **Step 2: Add main browser journey**

Stub score submission:

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
→ canvas + four buttons + four visible badges
→ idle Combo=0 / Hits=0 / Judgment=READY / initial Stability
→ normal #start-btn path activates run and enables lane buttons
→ performPerfectRhythmInput('click')
→ assert returned state + returned HUD: Hits=1, Combo=1, PERFECT, Perfect score, expected stability
→ #reset-btn
→ locator assertions: Time=60, Hits=0, Combo=0, READY, initial Stability, Start visible (idle = no rAF mutation)
→ performPerfectRhythmInput('keyboard')
→ assert returned state + returned HUD for one Perfect
→ page.evaluate(async () => game.end())
→ overlay visible; final Hits=1; final Stray presses=0
→ #play-again-btn
→ assert stable lifecycle only: overlay hidden and Start hidden / run active
```

Do **not** assert live Combo/Judgment/Stability through locators after the Perfect helper returns; rAF resumes immediately. Do not duplicate timeout-settlement behavior here; Task 2 owns it.

- [ ] **Step 3: Add 375×812 layout proof**

Assert:

- exactly four lane buttons, all visible and within viewport;
- all four additional-stat badges visible/reachable;
- `document.scrollingElement.scrollWidth <= 375`;
- canvas visible, width <= 375, height > 0.

Do not freeze exact CSS heights/rows.

- [ ] **Step 4: Run focused E2E**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

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

Expected production scope: Rhythm Reactor-local files/page plus `games.ts`, shared game-data alias, achievements, and `CLAUDE.md`. No BaseGame/GameTimer/ScoreManager/GameInitializer/PixiJSRenderer/service/API/DB/schema/package changes.

- [ ] **Step 6: Commit Task 6**

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(rhythm-reactor): cover browser lifecycle and mobile layout"
```

- [ ] **Step 7: Update PR description with implementation evidence**

Replace planning-only text with:

- final chart patterns/repeats;
- final derived note count + last-hit time;
- final Perfect/Good/Miss windows;
- final scoring/stability/achievement thresholds;
- five manual-play checkpoint outcomes;
- targeted/unit/E2E/full-gate results;
- any approved scope deviation, otherwise explicit none;
- confirmation HPA-70 stayed one PR and added no audio/core/backend subsystem.

---

## Plan Self-Review

- **Spec coverage:** chart data/materializer, permanent invariants, config-owned content, Perfect/Good/Miss/stray semantics, scoring, stability, timeout, visible HUD, renderer, controls, registration, achievements, responsive route, deterministic E2E, and tuning checkpoint all map to Tasks 1–6.
- **One-note-one-miss:** a note is removed on Perfect/Good/Miss-window input or expiry exactly once. Stray presses are separate; `misses` cannot exceed chart length.
- **Config ordering:** chart is on `RhythmReactorConfig`; `createInitialState()` reads `this.config.chart` exactly like existing config-owned authored content. No third constructor parameter/fallback/post-super state rebuild.
- **Chart tuning:** exact data tests may change only in Task 4; permanent invariant tests do not change to accommodate content.
- **E2E timing:** advancement, input dispatch, and timing-sensitive HUD reads share one synchronous browser task; helper has `MAX_UPDATES`.
- **Markup:** Task 4 adds `rhythm-reactor` to the existing shared GamePage route array as well as Rhythm-specific IDs.
- **Precision Control:** no redundant hit floor; full production timeout settlement makes accuracy a complete-run measure, and strays lower accuracy.
- **YAGNI:** no audio, calibration, chart loader/DSL, special notes, shared rhythm engine, core/backend/schema/package work.
- **Single PR:** all implementation commits remain on PR #74.
- **Placeholder scan:** no TBD/TODO or undefined production contract remains; only the explicitly bounded Task 4 tuning checkpoint may change documented tuning/content values.
