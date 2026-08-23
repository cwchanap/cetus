# Rhythm Reactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-70 as a deterministic 60-second four-lane visual rhythm minigame with keyboard/touch input, Pixi rendering, scoring, achievements, and existing Cetus score submission.

**Architecture:** `RhythmReactorGame` extends `BaseGame`, owns an authored 86-note chart and simulation-time judgments, and uses one pure scoring module. `RhythmReactorRenderer` extends `PixiJSRenderer`; one game-local initializer owns one requestAnimationFrame loop and native Astro lane buttons. BaseGame remains the sole run timer/persistence/lifecycle authority; no audio or shared rhythm framework is added.

**Tech Stack:** Astro 5, TypeScript 6, BaseGame/GameTimer/ScoreManager, PixiJS 8, Tailwind 4, Vitest 3, Playwright 1.54, Bun 1.3.

**Spec:** `docs/superpowers/specs/2026-08-23-rhythm-reactor-design.md`

## Global Constraints

- One HPA-70 implementation PR; do not split this ticket across PRs.
- 60-second fixed run; four lanes; keyboard `D/F/J/K`; touch via four native buttons.
- Fixed 120 BPM visual grid (`0.5s` steps), first hit `2.0s`, last hit `57.5s`, exactly `86` notes.
- Note approach time `2.0s`; Perfect `±0.080s`; Good `±0.160s`; boundaries are inclusive.
- Initial stability `60`; Perfect `+4`; Good `+2`; miss `-6`; every 10th consecutive hit gets an additional `+5`; clamp `0..100`.
- Stability never ends the run; BaseGame timeout is the normal completion condition.
- Perfect base score `100`; Good base score `60`; multiplier adds `0.25×` per 10 combo and caps at `2.0×`; BaseGame time bonus is disabled.
- GamePage uses `showPause={false}`, `showEnd={false}`, `showReset={true}`.
- No audio/BGM/Web Audio, calibration, difficulty/song selection, random chart generation, chords/holds/slides, generic rhythm framework, canvas hit testing, DB/API/schema/auth changes, or core-runtime refactor.
- `BaseGame.ts`, `GameTimer.ts`, `ScoreManager.ts`, `GameInitializer.ts`, `PixiJSRenderer.ts`, score service, API routes, and DB/schema remain production-unchanged.
- Run the manual-play tuning checkpoint after Task 4 and before Task 5 freezes catalog/achievement thresholds.

---

## File Map

### New game-local production files

- `src/lib/games/rhythm-reactor/types.ts` — rules, state/config/stats/data contracts, hit-result types.
- `src/lib/games/rhythm-reactor/chart.ts` — three authored patterns and pure 86-note materializer.
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
- `src/lib/games.test.ts` — Task 5 freezes the active registration.
- `src/lib/games/shared/types.ts` — Task 5 exports the canonical game-data type into `GameData`.
- `src/lib/organisms.test.ts` — Task 5 changes the exact depth partition to `8 / 9 / 4`.
- `src/lib/achievements.ts` and `src/lib/achievements.test.ts` — Task 5 adds four game-local achievements.
- `src/pages/game-board-markup.test.ts` — Task 4 freezes the Astro/bootstrap/control contract.
- `e2e/games/play-coverage.spec.ts` — Task 6 adds playable + 375px proofs.
- `CLAUDE.md` — Task 5 updates implemented-game count/list, project structure, renderer note, and game-specific note.

---

### Task 1: Freeze chart, rules, and scoring contracts

**Files:**
- Create: `src/lib/games/rhythm-reactor/types.ts`
- Create: `src/lib/games/rhythm-reactor/chart.ts`
- Create: `src/lib/games/rhythm-reactor/chart.test.ts`
- Create: `src/lib/games/rhythm-reactor/scoring.ts`
- Create: `src/lib/games/rhythm-reactor/scoring.test.ts`

**Interfaces:**
- Produces `RHYTHM_REACTOR_RULES`, `RhythmReactorLane`, `RhythmReactorJudgment`, `RhythmReactorNote`, `RhythmReactorConfig`, `RhythmReactorState`, `RhythmReactorStats`, `RhythmReactorGameData`, `RhythmReactorHitResult`, `createRhythmReactorConfig()`.
- Produces `createRhythmReactorChart(): RhythmReactorNote[]`.
- Produces `calculateRhythmReactorHitPoints(judgment, comboAfterHit): number` and `calculateRhythmReactorAccuracy(perfectHits, goodHits, misses): number`.

- [ ] **Step 1: Write chart tests before the materializer**

Create `chart.test.ts` with structural assertions instead of an 86-object snapshot:

```ts
import { describe, expect, it } from 'vitest'
import {
    CORE_PATTERN,
    SURGE_PATTERN,
    WARMUP_PATTERN,
    createRhythmReactorChart,
} from './chart'
import { RHYTHM_REACTOR_RULES } from './types'

describe('createRhythmReactorChart', () => {
    it('materializes the frozen 86-note chart', () => {
        const chart = createRhythmReactorChart()
        expect(chart).toHaveLength(86)
        expect(chart[0]).toMatchObject({
            id: 'note-0',
            laneIndex: 0,
            hitTimeSeconds: 2,
        })
        expect(chart.at(-1)?.hitTimeSeconds).toBe(57.5)
        expect(chart.every(note => note.laneIndex >= 0 && note.laneIndex <= 3)).toBe(true)
        expect(chart.map(note => note.hitTimeSeconds)).toEqual(
            [...chart].map(note => note.hitTimeSeconds).sort((a, b) => a - b)
        )
        expect(new Set(chart.map(note => note.hitTimeSeconds)).size).toBe(chart.length)
        expect(RHYTHM_REACTOR_RULES.beatStepSeconds).toBe(0.5)
    })

    it('keeps the three authored source patterns and repeat counts explicit', () => {
        expect(WARMUP_PATTERN).toHaveLength(16)
        expect(CORE_PATTERN).toHaveLength(16)
        expect(SURGE_PATTERN).toHaveLength(16)
        expect(WARMUP_PATTERN.filter(step => step !== null)).toHaveLength(10)
        expect(CORE_PATTERN.filter(step => step !== null)).toHaveLength(12)
        expect(SURGE_PATTERN.filter(step => step !== null)).toHaveLength(14)
    })
})
```

- [ ] **Step 2: Run the chart test and verify RED**

Run:

```bash
bun run test:run -- src/lib/games/rhythm-reactor/chart.test.ts
```

Expected: FAIL because `chart.ts`/`types.ts` do not exist yet.

- [ ] **Step 3: Implement the exact rule and chart contracts**

In `types.ts`, define the central rules once:

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

Make `RhythmReactorConfig extends BaseGameConfig` include every numeric rule the game/renderer consumes. `createRhythmReactorConfig(overrides = {})` must return the frozen rules plus `achievementIntegration: true`, `pausable: false`, `resettable: true`.

In `chart.ts`, export the exact three 16-step patterns from the spec and materialize `[WARMUP×2, CORE×2, SURGE×3]`. Keep one global `stepIndex`; only non-null steps produce notes:

```ts
const sections = [
    { pattern: WARMUP_PATTERN, repeats: 2 },
    { pattern: CORE_PATTERN, repeats: 2 },
    { pattern: SURGE_PATTERN, repeats: 3 },
] as const

export function createRhythmReactorChart(): RhythmReactorNote[] {
    const notes: RhythmReactorNote[] = []
    let stepIndex = 0
    let noteIndex = 0
    for (const { pattern, repeats } of sections) {
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

- [ ] **Step 4: Write scoring tests**

Cover exact base values, multiplier edges, bad numeric combo normalization, and weighted accuracy:

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

- [ ] **Step 5: Implement one scoring authority**

In `scoring.ts`:

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
    const combo = Math.max(1, Math.floor(Number.isFinite(comboAfterHit) ? comboAfterHit : 1))
    const steps = Math.min(
        Math.floor(combo / RHYTHM_REACTOR_COMBO_STEP),
        RHYTHM_REACTOR_MAX_MULTIPLIER_STEPS
    )
    const base =
        judgment === 'perfect'
            ? RHYTHM_REACTOR_PERFECT_POINTS
            : RHYTHM_REACTOR_GOOD_POINTS
    return Math.floor(base * (1 + steps * RHYTHM_REACTOR_MULTIPLIER_STEP))
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

- [ ] **Step 6: Run Task 1 tests and typecheck**

```bash
bun run test:run -- \
  src/lib/games/rhythm-reactor/chart.test.ts \
  src/lib/games/rhythm-reactor/scoring.test.ts
bun run typecheck
```

Expected: both test files PASS; typecheck PASS.

- [ ] **Step 7: Commit the pure contracts**

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
- Constructor seam for focused tests:

```ts
constructor(
    config: RhythmReactorConfig = createRhythmReactorConfig(),
    callbacks: BaseGameCallbacks = {},
    chart: readonly RhythmReactorNote[] = createRhythmReactorChart()
)
```

- [ ] **Step 1: Add the failing stable-ID/model tests**

First add only the enum/icon expectations and game-model tests. The ID/icon change may exist before the active route because it does not make the game discoverable.

Game tests must use tiny explicit charts where timing boundaries matter:

```ts
const oneNote = [{ id: 'note-0', laneIndex: 0 as const, hitTimeSeconds: 2 }]
const game = new RhythmReactorGame(createRhythmReactorConfig(), {}, oneNote)
game.start()
game.update(1.92)
expect(game.hitLane(0)).toMatchObject({ judgment: 'perfect', points: 100 })
```

Required cases:

- initial state contains the full 86-note cloned chart and stability 60;
- exact `-0.080` and `+0.080` are Perfect;
- values just outside Perfect through exact `±0.160` are Good;
- values past `±0.160` are misses;
- closest same-lane note is selected when two are near;
- wrong/empty lane press registers exactly one miss and consumes no pending note;
- overdue note automatically expires when `elapsed > hitTime + 0.160`;
- miss resets combo;
- combo 10 applies the extra stability bonus on that hit;
- stability clamps at 0 and 100 and reaching 0 does not end the game;
- inactive/paused/invalid lane input returns `{ accepted: false, judgment: null, noteId: null, points: 0 }` with no mutation;
- reset reconstructs the chart and all counters;
- timeout converts every unresolved note into misses before final stats;
- `getGameStats()` and `getGameData()` report hits/perfect/good/miss/maxCombo/accuracy/finalStability consistently.

- [ ] **Step 2: Run the model tests and verify RED**

```bash
bun run test:run -- src/lib/games/rhythm-reactor/RhythmReactorGame.test.ts
```

Expected: FAIL because the game/ID are not implemented.

- [ ] **Step 3: Add stable ID + icon without active registration**

In `src/lib/games.ts` add:

```ts
RHYTHM_REACTOR = 'rhythm_reactor',
```

and add an exhaustive icon mapping entry:

```ts
[GameID.RHYTHM_REACTOR]: '🎵',
```

Do **not** add the active `GAMES` object until Task 5, when `/rhythm-reactor` exists.

- [ ] **Step 4: Implement the BaseGame state machine**

Core shape:

```ts
export class RhythmReactorGame extends BaseGame<
    RhythmReactorState,
    RhythmReactorConfig,
    RhythmReactorStats
> {
    private elapsedSimSeconds = 0
    private readonly sourceChart: readonly RhythmReactorNote[]

    constructor(config = createRhythmReactorConfig(), callbacks = {}, chart = createRhythmReactorChart()) {
        super(GameID.RHYTHM_REACTOR, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
        this.sourceChart = chart.map(note => ({ ...note }))
        this.state = this.createInitialState()
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
            pendingNotes: this.sourceChart.map(note => ({ ...note })),
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

Because `BaseGame` calls `createInitialState()` during `super(...)`, do **not** read an uninitialized subclass field from that first call. Use one of these two safe implementations and lock it in the test:

- make `createInitialState()` fall back to `createRhythmReactorChart()` until `sourceChart` exists, then reconstruct `state` once after the constructor assigns `sourceChart`; or
- pass the chart through a config-owned immutable factory input only if it does not leak chart data into public tuning config.

Prefer the first local fallback; do not refactor BaseGame.

`update(deltaTime)`:

1. guard inactive/paused/non-finite/non-positive;
2. clamp to `maxUpdateDelta`;
3. advance `elapsedSimSeconds` and `state.elapsedSeconds`;
4. expire every note where `elapsed > hitTime + goodWindow`;
5. emit exactly one state change for the update.

`hitLane()`:

1. validate active state and lane index;
2. expire overdue notes once;
3. choose the unresolved note in that lane with minimum absolute offset;
4. no candidate within Good window → one stray-press miss, no note removal;
5. matched note → remove, increment combo/maxCombo, classify inclusive Perfect/Good, apply clamped stability, add score using Task 1 scorer;
6. emit once and return the exact `RhythmReactorHitResult`.

Keep private helpers local:

```ts
private expireOverdueNotes(): number
private registerMiss(count: number = 1): void
private applySuccessfulHit(judgment: 'perfect' | 'good'): number
private emitStateChange(): void
```

`registerMiss(count)` increases misses, resets combo, subtracts `count * missStabilityLoss` with one clamp, and sets `lastJudgment='miss'` when `count > 0`.

`handleTimeUp()` must settle all remaining notes before BaseGame captures final stats:

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

- [ ] **Step 5: Run the model/ID tests and typecheck**

```bash
bun run test:run -- \
  src/lib/games/rhythm-reactor/RhythmReactorGame.test.ts \
  src/lib/games.test.ts
bun run typecheck
```

Expected: PASS; `getGameById(GameID.RHYTHM_REACTOR)` is still undefined until Task 5 and no test should falsely require registration yet.

- [ ] **Step 6: Commit the model**

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

Freeze only meaningful geometry/lifecycle contracts:

```ts
const config = createRhythmReactorConfig()
const rendererConfig = createRhythmReactorRendererConfig(config)
expect(rendererConfig).toMatchObject({
    width: 800,
    height: 420,
    laneCount: 4,
    approachSeconds: 2,
    noteSpawnY: 40,
    hitLineY: 340,
})
```

With Pixi graphics mocked like Signal Switch renderer tests, prove:

- setup creates exactly one static lane graphic and one dynamic scene graphic;
- static drawing makes four lane regions/separators and one hit line;
- a note more than `approachSeconds` away is not drawn;
- a note at `timeUntilHit === approachSeconds` is at `noteSpawnY`;
- a note at `timeUntilHit === 0` is centered on `hitLineY`;
- a late-but-still-pending note moves just past the hit line rather than being artificially frozen on it;
- cleanup destroys local graphics and then base resources.

- [ ] **Step 2: Run renderer test and verify RED**

```bash
bun run test:run -- src/lib/games/rhythm-reactor/RhythmReactorRenderer.test.ts
```

- [ ] **Step 3: Implement the two-layer renderer**

Use one fixed logical board. No sprites/textures/pooling.

```ts
private noteY(note: RhythmReactorNote, elapsedSeconds: number): number {
    const timeUntilHit = note.hitTimeSeconds - elapsedSeconds
    const progress = 1 - timeUntilHit / this.rhythmConfig.approachSeconds
    return lerp(
        this.rhythmConfig.noteSpawnY,
        this.rhythmConfig.hitLineY,
        progress
    )
}
```

Do not clamp `progress` at 1; this allows the visible late Good window to pass the line naturally. Only draw unresolved notes where:

```ts
note.hitTimeSeconds - state.elapsedSeconds <= approachSeconds
```

The game model already removes expired late notes.

Use lane index/position as the primary identity. Colors are decoration only. Draw a simple stability bar/reactor indicator from `state.stability`; do not make it interactive or add particles.

- [ ] **Step 4: Run renderer + game tests and typecheck**

```bash
bun run test:run -- src/lib/games/rhythm-reactor
bun run typecheck
```

- [ ] **Step 5: Commit the renderer**

```bash
git add src/lib/games/rhythm-reactor/RhythmReactorRenderer.ts \
        src/lib/games/rhythm-reactor/RhythmReactorRenderer.test.ts
git commit -m "feat(rhythm-reactor): render falling beat lanes"
```

---

### Task 4: Wire the playable Astro route, controls, lifecycle, and tuning checkpoint

**Files:**
- Create: `src/lib/games/rhythm-reactor/initFramework.ts`
- Create: `src/lib/games/rhythm-reactor/initFramework.test.ts`
- Create: `src/pages/rhythm-reactor/index.astro`
- Modify: `src/pages/game-board-markup.test.ts` — add Rhythm Reactor static/bootstrap assertions.

**Interfaces:**
- Produces `initRhythmReactorGameFramework(): Promise<RhythmReactorInitResult | undefined>`.
- Produces debug handle shape with `game`, `renderer`, `getGame`, `getState`, `cleanup`.
- Exposes page handle as `window.rhythmReactorGame` after async initialization.

- [ ] **Step 1: Write initializer and markup tests first**

Required initializer cases:

- missing `#rhythm-reactor-container` fails through the existing game-error path;
- renderer setup failure destroys partial renderer and returns undefined;
- four delegated buttons map `data-rhythm-lane="0..3"` to `hitLane()`;
- `D/F/J/K` and lowercase equivalents use the same API;
- key repeat, Ctrl/Meta/Alt, editable targets, and events originating from lane buttons are ignored;
- Start hides Start and enables active lane buttons;
- Reset returns idle 60s / hits 0 / misses 0 / stability 60, hides overlay, and disables lanes;
- Play Again calls `game.start()` after game over and immediately starts a clean run;
- end callback fills score/hits/misses/perfect/good/max combo/accuracy/stability fields;
- beforeunload warns only while active;
- one rAF loop calls `game.update(delta)` and `renderer.render(state)` and clamps outer delta to `0.1`;
- cleanup is idempotent, cancels rAF, removes tracked listeners, unsubscribes game end, destroys renderer/game.

Markup test must read the Astro source and assert:

```ts
expect(source).toContain('id="rhythm-reactor-controls"')
expect(source.match(/data-rhythm-lane=/g)).toHaveLength(4)
expect(source).toContain('showPause={false}')
expect(source).toContain('showEnd={false}')
expect(source).toContain('showReset={true}')
const domReady = source.indexOf("DOMContentLoaded")
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

- [ ] **Step 3: Build the complete Astro-owned route**

Use `GamePage`, `Badge`, `Button`, and `Card`. Required board/control IDs:

```text
#rhythm-reactor-container
#rhythm-reactor-canvas
#rhythm-reactor-status
#rhythm-reactor-stability
#rhythm-reactor-combo
#rhythm-reactor-hits
#rhythm-reactor-misses
#rhythm-reactor-judgment
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

Render button copy as `Lane 1 · D`, `Lane 2 · F`, `Lane 3 · J`, `Lane 4 · K`. Static idle text is `READY`, `60` stability, `0` combo/hits/misses. Keep all layout structure in Astro; TypeScript only changes text/disabled/display state.

Page bootstrap:

```ts
document.addEventListener('DOMContentLoaded', () => {
  initRhythmReactorGameFramework()
    .then(handle => {
      if (handle) {
        ;(window as Window & { rhythmReactorGame?: typeof handle }).rhythmReactorGame = handle
      }
    })
    .catch(error => console.error('Rhythm Reactor failed to initialize', error))
})
```

- [ ] **Step 4: Implement the local initializer by following Signal Switch, not abstracting it**

Key map:

```ts
const KEY_TO_LANE: Record<string, RhythmReactorLane> = {
    d: 0,
    f: 1,
    j: 2,
    k: 3,
}
```

Normalize `keyboardEvent.key.toLowerCase()`. Reuse `isEditableTarget()` from `shared/utils.ts`; do not create another helper.

For every state callback:

```ts
hits = state.perfectHits + state.goodHits
judgment = state.lastJudgment?.toUpperCase() ?? 'READY'
```

Accuracy final text uses `stats.accuracy.toFixed(1) + '%'`.

The rAF loop must be one owner:

```ts
const frame = (timestamp: number): void => {
    const delta = lastFrameTime === null
        ? 0
        : Math.min((timestamp - lastFrameTime) / 1000, config.maxUpdateDelta)
    lastFrameTime = timestamp
    const state = game.getState()
    if (state.isActive && !state.isPaused) game.update(delta)
    renderer.render(game.getState())
    frameId = requestAnimationFrame(frame)
}
```

Override Pixi inline canvas sizing exactly once after initialization:

```ts
canvas.style.width = '100%'
canvas.style.height = 'auto'
```

- [ ] **Step 5: Run all local unit/markup gates**

```bash
bun run test:run -- src/lib/games/rhythm-reactor src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
```

- [ ] **Step 6: Perform the mandatory manual-play tuning checkpoint**

Start the app:

```bash
bun run dev
```

Open `http://localhost:4325/rhythm-reactor` and check all five frozen questions from the spec:

1. first Lane 1 note has the full 2.0s readable approach;
2. ±80ms Perfect / ±160ms Good feels usable with both D/F/J/K and touch/click;
3. final Surge density (max 2 hits/s) stays readable at desktop and 375px width;
4. ordinary misses visibly reduce stability while a competent run can recover;
5. note center visually meets the hit line at judgment time.

If feel changes are needed, change only `RHYTHM_REACTOR_RULES` / scoring constants and their derived tests **now**. Do not add audio, calibration, difficulty, random generation, or a new timing subsystem.

Record the five PASS/adjusted results in the eventual PR description before Task 5 thresholds are treated as frozen.

- [ ] **Step 7: Commit the first playable game**

```bash
git add src/lib/games/rhythm-reactor/initFramework.ts \
        src/lib/games/rhythm-reactor/initFramework.test.ts \
        src/pages/rhythm-reactor/index.astro \
        src/pages/game-board-markup.test.ts
git commit -m "feat(rhythm-reactor): wire playable rhythm route"
```

---

### Task 5: Register the live game, shared data, achievements, and repository docs

**Files:**
- Modify: `src/lib/games.ts` — append active Rhythm Reactor `GAMES` row after Signal Switch.
- Modify: `src/lib/games.test.ts` — add exact registration/icon/URL assertions.
- Modify: `src/lib/games/shared/types.ts` — canonical Rhythm Reactor game-data alias + `GameData` union member.
- Modify: `src/lib/organisms.test.ts` — exact depth partition `8 / 9 / 4`.
- Modify: `src/lib/achievements.ts` — four Rhythm Reactor achievements.
- Modify: `src/lib/achievements.test.ts` — thresholds/data guards.
- Modify: `CLAUDE.md` — 21-game list/count, rhythm-reactor folder, Pixi renderer list, game-specific note.

**Interfaces:**
- Makes `GameID.RHYTHM_REACTOR` discoverable at `/rhythm-reactor`.
- Makes `RhythmReactorGameData` available to achievements through shared typing.

- [ ] **Step 1: Add failing registration/shared-type/organism tests**

Registration expectation:

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
expect(GAMES.filter(game => game.id === GameID.RHYTHM_REACTOR)).toHaveLength(1)
```

Update the existing organism partition assertion only:

```ts
expect(getGamesByDepth('shallow')).toHaveLength(8)
expect(getGamesByDepth('mid')).toHaveLength(9)
expect(getGamesByDepth('abyssal')).toHaveLength(4)
```

Keep the adjacency regression unchanged; the new tail must satisfy it naturally.

- [ ] **Step 2: Add failing achievement tests**

Freeze four definitions and their anti-vacuous conditions:

```ts
const achievements = getAchievementsByGame(GameID.RHYTHM_REACTOR)
expect(achievements.map(item => item.id)).toEqual([
    'rhythm_reactor_first_beat',
    'rhythm_reactor_chain_reaction',
    'rhythm_reactor_precision_control',
    'rhythm_reactor_coolant_reserve',
])
```

Then behaviorally prove:

- First Beat threshold is 100;
- Chain Reaction fails at maxCombo 19 and passes at 20;
- Precision Control fails with 59 hits even at 100% accuracy, fails at 60 hits/89.9%, passes at 60/90%;
- Coolant Reserve fails with 59 hits or stability 89, passes at 60 hits/stability 90.

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts
```

- [ ] **Step 4: Append the active catalog object**

In `GAMES`, after Signal Switch:

```ts
{
    id: GameID.RHYTHM_REACTOR,
    name: 'Rhythm Reactor',
    description: 'Hit falling reactor beats on time to build combo and keep the core stable',
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

Do not modify home-page code; the existing active-game catalog must surface it automatically.

- [ ] **Step 5: Add canonical shared game-data typing**

After Signal Switch in `src/lib/games/shared/types.ts`:

```ts
export type RhythmReactorGameData =
    import('../rhythm-reactor/types').RhythmReactorGameData
```

Append `| RhythmReactorGameData` to `GameData`. Do not duplicate the interface.

- [ ] **Step 6: Add the four achievements**

Use existing `score_threshold` / `in_game` types only:

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

Import the canonical shared type using the same convention as adjacent recent games.

- [ ] **Step 7: Update repository documentation without touching `AGENTS.md`**

`CLAUDE.md` must say 21 implemented games and include Rhythm Reactor in the overview, `src/lib/games/rhythm-reactor/` in the tree, Rhythm Reactor among Pixi canvas games, and one game-specific note describing `BaseGame + PixiJS + authored visual chart + window.rhythmReactorGame`.

If `AGENTS.md` is still a symlink to `CLAUDE.md`, leave the symlink itself unchanged.

- [ ] **Step 8: Run registration/achievement/navigation gates**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts
bun run test:e2e -- e2e/games/all-games-navigation.spec.ts
bun run typecheck
bun run lint
```

If the exact navigation spec path differs on the implementation branch, locate the existing `all-games-navigation.spec.ts` once and run that file; do not create a second navigation suite.

- [ ] **Step 9: Commit registration**

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
- Consumes the public `window.rhythmReactorGame` handle from Task 4.
- Uses public game methods only: `update`, `hitLane` indirectly through UI/keyboard, `getState`, and debug-only `end()` to avoid a real 60-second browser sleep.

- [ ] **Step 1: Add a bounded simulation helper to the Rhythm Reactor describe block**

Do not use real-time sleeps for note judgment. Advance the model through the existing debug handle:

```ts
async function advanceRhythmTo(
    page: Page,
    targetSeconds: number
): Promise<void> {
    await page.evaluate(target => {
        const game = (
            window as Window & {
                rhythmReactorGame?: {
                    game: {
                        update(deltaSeconds: number): void
                        getState(): { elapsedSeconds: number }
                    }
                }
            }
        ).rhythmReactorGame?.game
        if (!game) throw new Error('Rhythm Reactor debug handle not ready')

        const MAX_STEPS = 700
        for (let step = 0; step < MAX_STEPS; step += 1) {
            if (game.getState().elapsedSeconds >= target - 1e-9) return
            game.update(0.1)
        }
        throw new Error(`Rhythm Reactor did not reach ${target}s`)
    }, targetSeconds)
}
```

Because `2.0 / 0.1` is exact enough for the model tolerance, the first Lane 1 click/keypress should classify Perfect.

- [ ] **Step 2: Add the main browser journey**

Test sequence:

```text
GET /rhythm-reactor
→ canvas visible; four lane buttons visible; idle stability=60
→ Start
→ advance model to 2.0s
→ click [data-rhythm-lane="0"]
→ Hits=1, Combo=1, judgment=PERFECT, Score=100
→ Reset
→ Time=60, Hits=0, Misses=0, Stability=60, Start visible
→ Start again
→ advance to 2.0s
→ keyboard D
→ Hits=1, judgment=PERFECT
→ call debug handle game.end() and await overlay
→ final Hits=1 and overlay visible
→ Play Again
→ overlay hidden, Start hidden, Hits=0, Stability=60
```

Route `**/api/scores` to a successful stub before debug `end()` so this journey does not depend on auth/backend state.

- [ ] **Step 3: Add the 375×812 layout proof**

Set viewport `375×812`, load `/rhythm-reactor`, and assert:

- exactly four `[data-rhythm-lane]` buttons;
- all four are visible and their bounding boxes are inside the 375px viewport;
- `document.scrollingElement.scrollWidth <= 375`;
- Pixi canvas is visible, width `<= 375`, height `> 0`.

Do not freeze an exact CSS height or row count; only protect reachability/no-overflow.

- [ ] **Step 4: Run the focused browser suite**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Expected: Rhythm Reactor tests and all existing game journeys PASS.

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

Before declaring completion, verify no accidental scope expansion:

```bash
git diff --name-only "$(git merge-base HEAD main)"...HEAD
```

Expected production scope: only Rhythm Reactor-local files/page plus `games.ts`, shared game-data typing, achievements, and `CLAUDE.md`. No BaseGame/GameTimer/ScoreManager/GameInitializer/PixiJSRenderer/service/API/DB/schema/package changes.

- [ ] **Step 6: Commit browser coverage**

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(rhythm-reactor): cover browser lifecycle and mobile layout"
```

- [ ] **Step 7: Update the PR description with implementation evidence**

After implementation, replace the planning-only PR summary with:

- final frozen tuning values;
- the five manual-play checkpoint outcomes;
- targeted/unit/E2E/full-gate results;
- any approved scope deviation (otherwise explicitly say none);
- confirmation that the ticket stayed one PR and no audio/core/backend subsystem was introduced.

Do not create a second implementation PR for HPA-70; continue on the same branch/PR.

---

## Plan Self-Review

- **Spec coverage:** chart, timing windows, input, scoring, stability, timeout settlement, reset/replay, Pixi renderer, responsive route, registration, shared game data, achievements, browser proof, manual tuning, and final gates all map to Tasks 1–6.
- **YAGNI check:** no audio, calibration, song/difficulty selector, chart loader/editor, procedural generation, special notes, early meltdown, shared rhythm engine, core change, or backend/schema work.
- **Type consistency:** `RhythmReactorGameData` remains canonical in game `types.ts`; shared types alias it rather than duplicating it. Input always converges on `hitLane(laneIndex)`. Renderer derives position from `hitTimeSeconds` + `elapsedSeconds` rather than storing Y in note state.
- **Single-PR check:** all six implementation slices belong to the same HPA-70 branch/PR; each task is an independently testable commit, not a separate PR.
- **Placeholder scan:** no implementation decision is left TBD/TODO; the only implementation-time tuning permission is bounded to centralized constants at the explicit Task 4 manual checkpoint.
