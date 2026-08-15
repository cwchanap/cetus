# Ice Slide Seeded Expedition Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-490 as a six-stage seeded Ice Slide Expedition mode with deterministic 2/2/2 assembly, Retry Seed/New Expedition behavior, three-star scoring, positive-progress partial persistence, and no competitive leaderboard leakage.

**Architecture:** Add one pure `expedition.ts` materializer over HPA-489's one-stage generator. Keep Web Crypto seed creation, captured retry identity, HUD/result population, renderer lifecycle, and score submission in `init.ts`. Reuse two tiny mode-policy helpers in `scoring.ts`; keep real Daily/Expedition differences explicit. The page supplies static DOM and event wiring only.

**Tech Stack:** Astro 5, TypeScript 6, PixiJS 8, Vitest 3, Playwright 1.54, existing Kysely/Turso score context, Bun 1.3.1.

## Global Constraints

- Expedition has exactly six stages: `easy, easy, medium, medium, hard, hard`.
- `createIceSlideExpeditionStage()` remains the only generated-stage source; preserve its 64-attempt bound, 10,000-state solver cap, valid deterministic fallbacks, transform-orbit dedupe, and DEV diagnostics.
- `createIceSlideExpeditionRunDefinition()` is pure: no DOM, Pixi, Web Crypto, network, `Date`, or `Math.random()`.
- New Expedition captures one seed from `crypto.getRandomValues`; Retry Seed reuses the already-materialized run snapshot and consumes no new randomness.
- Expedition stage scoring uses the Daily `+100` optional-star semantics; completion uses 360 seconds, intentionally equal to Campaign's existing default budget. Daily stays at 300 seconds.
- Campaign keeps its existing default-config `levelScore()` / `timeBonus()` call path.
- Completed Expedition and **positive-score** manual End attempts persist with `mode='expedition'`, no competition key, and versioned game data.
- A zero-score stage-0 End remains local and does not create a generic history/stat/challenge row.
- Anonymous Expedition play completes/ends locally without an error toast on `UNAUTHENTICATED`.
- Campaign remains unscoped and score-compatible; Daily admission/ranking remains unchanged.
- The raw 32-hex seed stays on the browser-owned captured run; do not add it to `IceSlideState` or persisted `IceSlideGameData` just for display.
- `?mode=daily` and `?mode=expedition` preselect shipped modes; unknown query values fall back to Campaign.
- No Safe/Risky choices, Undo, snow, cracked ice, cross-seed ranking, resume, seed input/share UI, history UI, DB/API work, score-service zero opt-in, mode registry, or generic overlay framework.

---

## File structure

**Create**

- `src/lib/games/ice-slide/expedition.ts` — pure six-stage run materialization.
- `src/lib/games/ice-slide/expedition.test.ts` — deterministic assembly, 500-run cross-tier sweep, uniqueness, and no-randomness coverage.

**Modify**

- `src/lib/games/ice-slide/run.ts` / `run.test.ts` — public Expedition identity parser/formatter and shared validation.
- `src/lib/games/ice-slide/scoring.ts` / `scoring.test.ts` — Expedition config plus two small mode-policy helpers.
- `src/lib/games/ice-slide/game.ts` / `game.test.ts` — objective/star/completion scoring for Expedition.
- `src/lib/games/ice-slide/types.ts` — ship Expedition as a playable mode.
- `src/lib/games/ice-slide/init.ts` / `init.test.ts` — Web Crypto seed capture, retry/failure state, contextual completion/partial submission, objective-mode overlay/HUD/result behavior.
- `src/pages/ice-slide/index.astro` — third mode radio, Expedition DOM/action wiring, query preselection, leaderboard isolation.
- `src/pages/game-board-markup.test.ts` — durable Expedition/result IDs.
- `e2e/games/play-coverage.spec.ts` — real browser lifecycle coverage.

**Do not modify unless a failing HPA-490 test proves an already-shipped regression**

- `src/lib/services/scoreService.ts` / tests
- `src/lib/games/ice-slide/generator.ts`
- `src/lib/games/ice-slide/templates.ts`
- `src/lib/games/ice-slide/quality.ts`
- `src/lib/games/ice-slide/solver.ts`
- `src/lib/games/ice-slide/physics.ts`
- `src/lib/games/ice-slide/renderer.ts`
- `scripts/validate-ice-slide-expedition.ts`
- DB schema/query files
- `/api/scores.ts`
- `/api/leaderboard.ts`
- `daily-leaderboard.ts`

---

### Task 1: Materialize a complete deterministic six-stage Expedition run

**Files:**
- Create: `src/lib/games/ice-slide/expedition.ts`
- Create: `src/lib/games/ice-slide/expedition.test.ts`
- Modify: `src/lib/games/ice-slide/run.ts`
- Modify: `src/lib/games/ice-slide/run.test.ts`

**Interfaces:**
- Consumes: `createIceSlideExpeditionStage()`, `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION`, `ICE_SLIDE_RUN_SCHEMA_VERSION`, `ICE_SLIDE_RULESET_VERSION`, `hashString32Hex()`, `getBoardOrbitKey()`, `assertValidIceSlideRunDefinition()`.
- Produces:

```ts
export interface IceSlideExpeditionRunIdentity {
  seedHash: string
  generatorVersion: number
  rulesetVersion: number
}

export function parseIceSlideExpeditionRunKey(
  runKey: string
): IceSlideExpeditionRunIdentity | null

export function formatIceSlideExpeditionRunKey(
  identity: IceSlideExpeditionRunIdentity
): string

export const ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES: readonly [
  'easy',
  'easy',
  'medium',
  'medium',
  'hard',
  'hard',
]

export function createIceSlideExpeditionRunDefinition(
  seed: string
): IceSlideRunDefinition
```

- [ ] **Step 1: Add failing inverse run-key tests**

In `run.test.ts`:

```ts
it('round-trips Expedition run identity', () => {
  const seed = '00112233445566778899aabbccddeeff'
  const identity = {
    seedHash: hashString32Hex(seed),
    generatorVersion: 1,
    rulesetVersion: 1,
  }

  const runKey = formatIceSlideExpeditionRunKey(identity)

  expect(runKey).toBe(
    `ice-slide:expedition:${identity.seedHash}:g1:r1`
  )
  expect(parseIceSlideExpeditionRunKey(runKey)).toEqual(identity)
  expect(
    formatIceSlideExpeditionRunKey(parseIceSlideExpeditionRunKey(runKey)!)
  ).toBe(runKey)
})

it.each([
  'ice-slide:expedition:nothex:g1:r1',
  'ice-slide:expedition:12345678:g0:r1',
  'ice-slide:expedition:12345678:g1:r0',
])('rejects malformed Expedition key %s', runKey => {
  expect(parseIceSlideExpeditionRunKey(runKey)).toBeNull()
})

it('rejects non-lowercase-hex Expedition hashes when formatting', () => {
  expect(() =>
    formatIceSlideExpeditionRunKey({
      seedHash: 'ABCDEF12',
      generatorVersion: 1,
      rulesetVersion: 1,
    })
  ).toThrow(RangeError)
})
```

- [ ] **Step 2: Run key tests and verify RED**

```bash
bun run test:run -- src/lib/games/ice-slide/run.test.ts
```

Expected: FAIL because the public Expedition helper pair does not exist.

- [ ] **Step 3: Extract the existing Expedition grammar into inverse helpers**

In `run.ts`:

```ts
export interface IceSlideExpeditionRunIdentity {
  seedHash: string
  generatorVersion: number
  rulesetVersion: number
}

export function parseIceSlideExpeditionRunKey(
  runKey: string
): IceSlideExpeditionRunIdentity | null {
  const match = EXPEDITION_KEY_PATTERN.exec(runKey)
  if (!match) return null

  const generatorVersion = Number(match[2])
  const rulesetVersion = Number(match[3])
  if (!isPositiveInt(generatorVersion) || !isPositiveInt(rulesetVersion)) {
    return null
  }

  return {
    seedHash: match[1],
    generatorVersion,
    rulesetVersion,
  }
}

export function formatIceSlideExpeditionRunKey(
  identity: IceSlideExpeditionRunIdentity
): string {
  if (!/^[0-9a-f]{8}$/.test(identity.seedHash)) {
    throw new RangeError(
      'expedition seedHash must be 8 lowercase hex characters'
    )
  }
  assertPositiveInt(identity.generatorVersion, 'generatorVersion')
  assertPositiveInt(identity.rulesetVersion, 'rulesetVersion')
  return (
    `ice-slide:expedition:${identity.seedHash}:` +
    `g${identity.generatorVersion}:r${identity.rulesetVersion}`
  )
}
```

Refactor the Expedition branch of `assertValidIceSlideRunDefinition()` to call the parser, then keep the existing raw-seed validation and check:

```ts
if (hashString32Hex(run.seed) !== identity.seedHash) {
  throw new RangeError(
    'expedition runKey hash must equal hashString32Hex(seed)'
  )
}
```

- [ ] **Step 4: Re-run run tests and verify GREEN**

```bash
bun run test:run -- src/lib/games/ice-slide/run.test.ts
```

Expected: PASS including existing Campaign/Daily validation cases.

- [ ] **Step 5: Add failing single-seed materializer tests**

Create `expedition.test.ts`:

```ts
const SEED = '00112233445566778899aabbccddeeff'

it('materializes the same six-stage run for the same seed', () => {
  const first = createIceSlideExpeditionRunDefinition(SEED)
  const second = createIceSlideExpeditionRunDefinition(SEED)
  expect(second).toEqual(first)
  expect(first.mode).toBe('expedition')
  expect(first.seed).toBe(SEED)
  expect(first.stages).toHaveLength(6)
})

it('uses the fixed 2/2/2 order with six unique board orbits', () => {
  const run = createIceSlideExpeditionRunDefinition(SEED)
  expect(run.stages.map(stage => stage.difficulty)).toEqual([
    'easy', 'easy', 'medium', 'medium', 'hard', 'hard',
  ])
  expect(
    new Set(run.stages.map(stage => getBoardOrbitKey(stage.rows))).size
  ).toBe(6)
  expect(run.stages.map(stage => stage.id)).toEqual([
    'expedition:1', 'expedition:2', 'expedition:3',
    'expedition:4', 'expedition:5', 'expedition:6',
  ])
})

it('does not use Math.random', () => {
  const random = vi.spyOn(Math, 'random')
  createIceSlideExpeditionRunDefinition(SEED)
  expect(random).not.toHaveBeenCalled()
})

it('rejects an empty seed', () => {
  expect(() => createIceSlideExpeditionRunDefinition('')).toThrow(RangeError)
})
```

Also assert the run key uses `hashString32Hex(SEED)`, every stage has one objective, current versions are used, and `assertValidIceSlideRunDefinition(run)` does not throw.

- [ ] **Step 6: Add the direct 500-seed complete-run sweep**

This test calls the **new six-stage materializer**, not the HPA-489 per-tier validator:

```ts
it('materializes 500 valid unique complete runs', () => {
  for (let index = 0; index < 500; index++) {
    const seed = `hpa-490:full-run:${String(index).padStart(3, '0')}`
    const run = createIceSlideExpeditionRunDefinition(seed)

    expect(run.stages.map(stage => stage.difficulty)).toEqual([
      'easy', 'easy', 'medium', 'medium', 'hard', 'hard',
    ])
    expect(run.stages).toHaveLength(6)
    expect(
      new Set(run.stages.map(stage => getBoardOrbitKey(stage.rows))).size
    ).toBe(6)
    expect(() => assertValidIceSlideRunDefinition(run)).not.toThrow()
  }
})
```

Do **not** assert `usedFallback === false` or inspect `mutationIds` to reject fallbacks. Fallbacks are valid HPA-489 output. HPA-489's deep validator already records fallback frequency; this test owns cross-tier full-run assembly/exhaustion.

- [ ] **Step 7: Run Expedition tests and verify RED**

```bash
bun run test:run -- src/lib/games/ice-slide/expedition.test.ts
```

Expected: FAIL because `expedition.ts` does not exist.

- [ ] **Step 8: Implement the six-stage materializer**

Create `expedition.ts`:

```ts
export const ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES = [
  'easy',
  'easy',
  'medium',
  'medium',
  'hard',
  'hard',
] as const

export function createIceSlideExpeditionRunDefinition(
  seed: string
): IceSlideRunDefinition {
  if (seed.length === 0) {
    throw new RangeError('seed must be non-empty')
  }

  const canonicalKeys = new Set<string>()
  const stages = ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES.map(
    (difficulty, index) => {
      const generated = createIceSlideExpeditionStage({
        seed,
        stageNumber: index + 1,
        difficulty,
        existingCanonicalKeys: canonicalKeys,
      })
      canonicalKeys.add(generated.canonicalKey)
      return generated.stage
    }
  )

  const run: IceSlideRunDefinition = {
    schemaVersion: ICE_SLIDE_RUN_SCHEMA_VERSION,
    generatorVersion: ICE_SLIDE_EXPEDITION_GENERATOR_VERSION,
    rulesetVersion: ICE_SLIDE_RULESET_VERSION,
    mode: 'expedition',
    runKey: formatIceSlideExpeditionRunKey({
      seedHash: hashString32Hex(seed),
      generatorVersion: ICE_SLIDE_EXPEDITION_GENERATOR_VERSION,
      rulesetVersion: ICE_SLIDE_RULESET_VERSION,
    }),
    seed,
    stages,
  }

  assertValidIceSlideRunDefinition(run)
  return run
}
```

No outer retry loop belongs here.

- [ ] **Step 9: Run pure Expedition/run/generator tests and verify GREEN**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/generator.test.ts
```

Expected: PASS including all 500 complete runs.

- [ ] **Step 10: Commit Task 1**

```bash
git add \
  src/lib/games/ice-slide/expedition.ts \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/games/ice-slide/run.ts \
  src/lib/games/ice-slide/run.test.ts
git commit -m "feat(ice-slide): materialize seeded Expedition runs"
```

---

### Task 2: Centralize objective-mode scoring policy and add Expedition scoring

**Files:**
- Modify: `src/lib/games/ice-slide/scoring.ts`
- Modify: `src/lib/games/ice-slide/scoring.test.ts`
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`

**Interfaces:**
- Consumes: `SCORING_CONFIG`, `DAILY_SCORING_CONFIG`, `levelScore()`, `timeBonus()`, `IceSlideMode`, objective completion.
- Produces:

```ts
export const EXPEDITION_SCORING_CONFIG: IceSlideModeScoringConfig
export function isIceSlideObjectiveMode(mode: IceSlideMode): boolean
export function iceSlideScoringConfig(
  mode: IceSlideMode
): IceSlideModeScoringConfig
```

- [ ] **Step 1: Add failing policy/config tests**

```ts
it('maps objective modes and scoring configs explicitly', () => {
  expect(isIceSlideObjectiveMode('campaign')).toBe(false)
  expect(isIceSlideObjectiveMode('daily')).toBe(true)
  expect(isIceSlideObjectiveMode('expedition')).toBe(true)

  expect(iceSlideScoringConfig('campaign')).toBe(SCORING_CONFIG)
  expect(iceSlideScoringConfig('daily')).toBe(DAILY_SCORING_CONFIG)
  expect(iceSlideScoringConfig('expedition')).toBe(
    EXPEDITION_SCORING_CONFIG
  )
})

it('uses a 360-second Expedition completion budget', () => {
  expect(EXPEDITION_SCORING_CONFIG).toEqual({
    objectiveStarBonus: 100,
    timeBudgetSeconds: 360,
    timeBonusPerSec: 5,
  })
  expect(EXPEDITION_SCORING_CONFIG.timeBudgetSeconds).toBe(
    SCORING_CONFIG.timeBudgetSeconds
  )
  expect(timeBonus(300, EXPEDITION_SCORING_CONFIG)).toBe(300)
  expect(timeBonus(360, EXPEDITION_SCORING_CONFIG)).toBe(0)
})
```

- [ ] **Step 2: Run scoring tests and verify RED**

```bash
bun run test:run -- src/lib/games/ice-slide/scoring.test.ts
```

- [ ] **Step 3: Add the config and two tiny helpers**

```ts
export const EXPEDITION_SCORING_CONFIG: IceSlideModeScoringConfig = {
  objectiveStarBonus: 100,
  // Intentionally equal to the current Campaign completion budget.
  timeBudgetSeconds: 360,
  timeBonusPerSec: 5,
}

export function isIceSlideObjectiveMode(mode: IceSlideMode): boolean {
  return mode !== 'campaign'
}

export function iceSlideScoringConfig(
  mode: IceSlideMode
): IceSlideModeScoringConfig {
  return mode === 'daily'
    ? DAILY_SCORING_CONFIG
    : mode === 'expedition'
      ? EXPEDITION_SCORING_CONFIG
      : SCORING_CONFIG
}
```

Do not create a mode registry/map.

- [ ] **Step 4: Add failing game tests for Expedition stars and completion bonus**

Use a small signed explicit Expedition run and assert:

```ts
expect(result.stars.clear).toBe(true)
expect(result.stars.efficient).toBe(true)
expect(result.stars.bonus).toEqual({ id: 'no_reset', earned: true })
expect(result.stars.earnedCount).toBe(3)
expect(game.getState().starsEarned).toBe(3)
```

For a one-stage test at 300 elapsed seconds, assert Expedition includes `timeBonus(300, EXPEDITION_SCORING_CONFIG) === 300`. Keep Daily's 300-second and Campaign completion assertions alongside it.

- [ ] **Step 5: Run game tests and verify RED**

```bash
bun run test:run -- src/lib/games/ice-slide/game.test.ts
```

- [ ] **Step 6: Refactor `clearLevel()` to consume the helpers**

Use:

```ts
const mode = this.activeRun.mode
const isObjectiveMode = isIceSlideObjectiveMode(mode)
const scoringConfig = iceSlideScoringConfig(mode)
```

Then:

- read bonus objective only for objective modes;
- compute Efficient + Bonus optional stars only for objective modes;
- call configured `levelScore()` for Daily/Expedition;
- keep Campaign's existing default `levelScore(scoringParams)` call;
- accumulate `starsEarned` only for objective modes;
- call configured `timeBonus()` only for objective modes, preserving Campaign's default call.

- [ ] **Step 7: Run scoring/game regressions and verify GREEN**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/scoring.test.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.win.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
```

- [ ] **Step 8: Commit Task 2**

```bash
git add \
  src/lib/games/ice-slide/scoring.ts \
  src/lib/games/ice-slide/scoring.test.ts \
  src/lib/games/ice-slide/game.ts \
  src/lib/games/ice-slide/game.test.ts
git commit -m "feat(ice-slide): add Expedition scoring policy"
```

---

### Task 3: Add browser seed capture, safe Retry Seed state, and contextual Expedition persistence

**Files:**
- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`

**Interfaces:**
- Consumes: `createIceSlideExpeditionRunDefinition()`, `cloneIceSlideRunDefinition()`, `isIceSlideObjectiveMode()`, existing run guard/score service.
- Produces:

```ts
export type IceSlidePlayableMode = 'campaign' | 'daily' | 'expedition'
```

No new handle method is added; New Expedition reuses `start('expedition')`.

- [ ] **Step 1: Add failing fresh/retry lifecycle tests**

Stub Web Crypto with two deterministic word arrays and verify:

```ts
await handle.start('expedition')
const first = handle.getGame()!.getState()
expect(first.mode).toBe('expedition')
expect(first.stagesTotal).toBe(6)
expect(getRandomValues).toHaveBeenCalledTimes(1)

await handle.playAgain()
const retry = handle.getGame()!.getState()
expect(retry.runKey).toBe(first.runKey)
expect(retry.stageSignatures).toEqual(first.stageSignatures)
expect(getRandomValues).toHaveBeenCalledTimes(1)

await handle.start('expedition')
const fresh = handle.getGame()!.getState()
expect(fresh.runKey).not.toBe(first.runKey)
expect(getRandomValues).toHaveBeenCalledTimes(2)
```

Spy on `Math.random()` and assert it remains untouched.

- [ ] **Step 2: Add failing submission tests**

Mock `saveGameScore` and prove:

- completion sends `mode='expedition'`, no competition key, `solved: true`;
- positive-score End sends `mode='expedition'`, `solved: false`;
- immediate zero-score End never calls `saveGameScore`;
- `UNAUTHENTICATED` for Expedition does not call `onError`.

Expected Expedition options:

```ts
expect.objectContaining({
  context: {
    mode: 'expedition',
    rulesetVersion: 1,
  },
})
```

There is no `allowZeroScore` option.

- [ ] **Step 3: Add failing stale-retry failure tests**

Model the real dangerous sequence:

1. start Daily successfully;
2. attempt Expedition with Web Crypto/materialization throwing;
3. assert failure clears the captured retry snapshot and internal Daily date/mode state;
4. verify a later retry path cannot silently relaunch the previous Daily run.

Also add an invariant test that objective-mode `playAgain()` with no retry snapshot rejects instead of starting Campaign.

- [ ] **Step 4: Run init tests and verify RED**

```bash
bun run test:run -- src/lib/games/ice-slide/init.test.ts
```

- [ ] **Step 5: Ship the playable mode and private seed helper**

Change:

```ts
export type IceSlidePlayableMode = 'campaign' | 'daily' | 'expedition'
```

Add:

```ts
function createExpeditionSeed(): string {
  const words = new Uint32Array(4)
  crypto.getRandomValues(words)
  return Array.from(words, word => word.toString(16).padStart(8, '0')).join('')
}
```

No fallback inside the helper.

- [ ] **Step 6: Generalize the captured retry run and clear it on failure**

Replace `retryDailyRun` with:

```ts
let retryRun: IceSlideRunDefinition | null = null
```

In `failRun()` add the state reset before restoring controls:

```ts
retryRun = null
currentMode = 'campaign'
dailyDateKey = null
```

`failRun()` still destroys game/renderer and invalidates the run guard.

- [ ] **Step 7: Implement fresh Campaign/Daily/Expedition starts**

Rules:

- Campaign: clear retry metadata and start Campaign.
- Daily: materialize current date, capture clone, start run.
- Expedition: create one seed, materialize six-stage run, capture clone, start run.

`startRun(run)` sets:

```ts
currentMode = run?.mode ?? 'campaign'
dailyDateKey =
  run?.mode === 'daily'
    ? parseIceSlideDailyRunKey(run.runKey)?.dateKey ?? null
    : null
```

- [ ] **Step 8: Make `playAgain()` safe for objective modes**

Use an explicit invariant:

```ts
if (isIceSlideObjectiveMode(currentMode)) {
  if (!retryRun) {
    throw new Error('Ice Slide retry run is unavailable')
  }
  const run = cloneIceSlideRunDefinition(retryRun)
  dailyDateKey =
    run.mode === 'daily'
      ? parseIceSlideDailyRunKey(run.runKey)?.dateKey ?? null
      : null
  await startRun(run)
  return
}

await startRun()
```

Do not silently fall back to Campaign from Daily/Expedition.

- [ ] **Step 9: Add Expedition submission context without changing positive-score gating**

Keep:

```ts
if (!game || finalScore <= 0) {
  return
}
```

Select options explicitly:

```ts
const options =
  gameData.mode === 'daily'
    ? {
        isStale,
        context: {
          mode: 'daily' as const,
          competitionKey: gameData.runKey,
          rulesetVersion: gameData.rulesetVersion,
        },
      }
    : gameData.mode === 'expedition'
      ? {
          isStale,
          context: {
            mode: 'expedition' as const,
            rulesetVersion: gameData.rulesetVersion,
          },
        }
      : { isStale }
```

Suppress `UNAUTHENTICATED` when `isIceSlideObjectiveMode(gameData.mode)`.

- [ ] **Step 10: Add an explicit Expedition End branch**

```ts
if (mode === 'expedition') {
  if (status !== 'playing') return
  hideStageClear()
  const shouldSubmit = score > 0
  game.stop()
  resetButtons()
  showOverlay('RUN ENDED', score)
  if (shouldSubmit) {
    submitScore(score)
  }
  syncHud()
  return
}
```

This deliberately leaves stage-0 score `0` local-only while preserving a visible local result.

- [ ] **Step 11: Lock renderer/failure/cleanup regressions**

Extend existing tests for renderer recreation on generated stage-size changes, cleanup of pointer/keyboard handlers, and failed start resetting retry/mode/date state.

- [ ] **Step 12: Run lifecycle tests and verify GREEN**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/lib/games/ice-slide/expedition.test.ts
```

- [ ] **Step 13: Commit Task 3**

```bash
git add \
  src/lib/games/ice-slide/types.ts \
  src/lib/games/ice-slide/init.ts \
  src/lib/games/ice-slide/init.test.ts
git commit -m "feat(ice-slide): add Expedition run lifecycle"
```

---

### Task 4: Add the neutral objective-run presentation contract and Expedition HUD/summary

**Files:**
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**
- Consumes: captured `retryRun`, objective-mode predicate, game state/data.
- Produces durable DOM IDs:

```text
#expedition-meta
#expedition-seed
#expedition-stage-progress
#expedition-stars
#expedition-attempts
#expedition-objective-clear
#expedition-objective-efficient
#expedition-objective-bonus
#run-final-stage-result
#run-final-heading
#run-final-clear
#run-final-efficient
#run-final-bonus
#expedition-summary
#expedition-summary-seed
#expedition-summary-progress
#expedition-summary-stars
#expedition-summary-moves
#expedition-summary-crystals
#expedition-summary-attempts
#expedition-summary-time
#new-expedition-btn
```

This task intentionally changes `init.ts` and page markup **together** so the DOM-ID rename never lands in a green-but-runtime-broken intermediate commit.

- [ ] **Step 1: Change markup tests first and verify RED**

In `game-board-markup.test.ts`, replace the old “Expedition absent” assertion with required third-radio/Expedition IDs and neutral `#run-final-*` IDs. Keep every Daily leaderboard selector assertion.

```bash
bun run test:run -- src/pages/game-board-markup.test.ts
```

Expected: FAIL on missing new IDs.

- [ ] **Step 2: Add the third radio, Expedition meta, summary, and neutral final markup**

Add the Expedition radio beside Campaign/Daily.

Rename existing Daily-only final IDs to `#run-final-*` directly; do not keep compatibility aliases.

Add hidden Expedition meta/summary blocks and New Expedition button. Do not add “finish within 6:00” objective copy; the time budget is a score bonus, not a promised normal completion target.

- [ ] **Step 3: Neutralize final-star population in `init.ts`**

Replace Daily-only IDs with neutral IDs and set the heading from the active mode:

```ts
setText(
  'run-final-heading',
  game?.getState().mode === 'expedition'
    ? 'Expedition stars'
    : 'Daily stars'
)
```

Populate Clear/Efficient/Bonus through the existing formatter.

- [ ] **Step 4: Generalize stage-result overlay gating here**

In `onLevelClear`, return only for Campaign:

```ts
if (!game || !isIceSlideObjectiveMode(game.getState().mode)) {
  return
}
```

Daily and Expedition non-final stages lock input/show the shared stage-clear overlay; final stages populate the neutral final-star block.

Keeping this in the presentation task avoids the Task 3 intermediate where Expedition would render a literal `Daily stars` heading.

- [ ] **Step 5: Populate Expedition HUD from the materialized captured run**

In `syncHud()`:

```ts
const isDaily = state.mode === 'daily'
const isExpedition = state.mode === 'expedition'
setVisible('daily-meta', isDaily)
setVisible('expedition-meta', isExpedition)
```

For Expedition:

```ts
const seed = retryRun?.seed ?? '—'
const tier = retryRun?.stages[state.levelIndex]?.difficulty
const maxStars = state.stagesTotal * 3

setText('expedition-seed', seed)
setText(
  'expedition-stage-progress',
  `Stage ${state.levelIndex + 1} / ${state.stagesTotal}` +
    (tier ? ` · ${tier.toUpperCase()}` : '')
)
setText('expedition-stars', `Stars ${state.starsEarned} / ${maxStars}`)
setText('expedition-attempts', `Falls ${state.falls} · Resets ${state.resets}`)
```

Use current stage objective IDs for Clear/Efficient/Bonus copy. Do not import `ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES` into `init.ts` for display.

- [ ] **Step 6: Add `populateExpeditionSummary()` in `init.ts`**

Read generic run data plus the captured seed:

```ts
const populateExpeditionSummary = (): void => {
  if (!game || game.getState().mode !== 'expedition') {
    setVisible('expedition-summary', false)
    return
  }

  const data = game.getGameData()
  setText('expedition-summary-seed', retryRun?.seed ?? '—')
  setText(
    'expedition-summary-progress',
    `${data.levelsCleared} / ${data.stagesTotal} stages`
  )
  setText(
    'expedition-summary-stars',
    `${data.starsEarned} / ${data.stagesTotal * 3} stars`
  )
  setText('expedition-summary-moves', String(data.totalMoves))
  setText('expedition-summary-crystals', String(data.crystalsCollected))
  setText(
    'expedition-summary-attempts',
    `Falls ${data.falls} · Resets ${data.resets}`
  )
  setText('expedition-summary-time', formatTime(data.elapsedSeconds))
  setVisible('expedition-summary', true)
}
```

Call it after Expedition win and after the Expedition stop branch has stopped the game, regardless of whether score was 0 or positive.

- [ ] **Step 7: Keep Expedition display nodes out of the page's all-or-nothing bootstrap guard**

The page script does not need to dereference meta/summary text nodes because `init.ts` owns population. Keep those display-only IDs out of the existing giant null guard.

Query the New Expedition button as optional page wiring:

```ts
const newExpeditionBtn = document.getElementById('new-expedition-btn')
```

Do not make a missing optional Expedition display node prevent Campaign/Daily initialization; the markup test is the static contract.

- [ ] **Step 8: Update init/markup tests for HUD sources and summary**

Assert:

- tier comes from `retryRun.stages[state.levelIndex].difficulty`;
- max stars uses `state.stagesTotal * 3`;
- raw seed comes from captured run, not run-key hash;
- neutral final heading is Daily vs Expedition correctly;
- zero-score End still gets local summary;
- positive partial End gets the same local summary plus submission from Task 3.

- [ ] **Step 9: Run presentation unit/markup tests and verify GREEN**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/game-board-markup.test.ts
```

- [ ] **Step 10: Commit Task 4**

```bash
git add \
  src/lib/games/ice-slide/init.ts \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/ice-slide/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "feat(ice-slide): add Expedition run presentation"
```

---

### Task 5: Wire shipped Expedition controls and browser lifecycle

**Files:**
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `e2e/games/play-coverage.spec.ts`

**Interfaces:**
- Consumes: `IceSlidePlayableMode`, `IceSlideHandle.start()`, `playAgain()`, `getGame()` and Task 4 DOM.
- Produces: shipped mode selection, Retry Seed/New Expedition actions, Daily leaderboard isolation.

- [ ] **Step 1: Preselect both shipped non-Campaign modes**

Replace the Daily-only query ternary with:

```ts
const requestedMode = new URLSearchParams(window.location.search).get('mode')
const selectedMode: IceSlidePlayableMode =
  requestedMode === 'daily'
    ? 'daily'
    : requestedMode === 'expedition'
      ? 'expedition'
      : 'campaign'
```

This selects a mode only; Expedition still captures a fresh seed on Start.

- [ ] **Step 2: Read the three radio values explicitly**

```ts
const readSelectedMode = (): IceSlidePlayableMode => {
  const value = modeRadios.find(radio => radio.checked)?.value
  return value === 'daily'
    ? 'daily'
    : value === 'expedition'
      ? 'expedition'
      : 'campaign'
}
```

No registry.

- [ ] **Step 3: Add one page-local action-state helper**

```ts
const syncResultActions = () => {
  const isExpedition =
    gameHandle?.getGame()?.getState().mode === 'expedition'
  playAgainBtn.textContent = isExpedition ? 'Retry Seed' : 'Play Again'
  newExpeditionBtn?.classList.toggle('hidden', !isExpedition)
}
```

Call it after result-producing win/End paths; restore default state when starting/changing modes.

- [ ] **Step 4: Wire New Expedition to the existing `start()` API**

```ts
newExpeditionBtn?.addEventListener('click', async () => {
  overlay.classList.add('hidden')
  startBtn.style.display = 'none'
  endBtn.style.display = 'inline-flex'
  setModeControlsDisabled(true)
  hideDailyLeaderboard()
  try {
    await gameHandle?.start('expedition')
  } catch (error) {
    errorEl.textContent =
      error instanceof Error ? error.message : 'Failed to start Expedition'
    errorEl.classList.remove('hidden')
    resetButtonState()
    restoreIdleModeControlsIfNoResult()
  }
})
```

Do not add `IceSlideHandle.newExpedition()`.

- [ ] **Step 5: Keep Daily leaderboard behavior exact**

Only Daily selection/start/retry loads a Daily competition key. Campaign and Expedition call `leaderboardController.hide()`.

- [ ] **Step 6: Add deterministic browser crypto setup**

Use `page.addInitScript()` before navigation to override `crypto.getRandomValues` for the Expedition 4-word `Uint32Array` calls with two known seeds, delegating unrelated calls to the native method.

- [ ] **Step 7: Add E2E coverage for Expedition start/retry/fresh/query behavior**

Prove:

1. `/ice-slide?mode=expedition` preselects Expedition but remains idle until Start;
2. Start shows Expedition meta, six stages, Stage 1/EASY, and hides Daily leaderboard;
3. immediate End shows local Expedition summary, sends no `/api/scores` request, and labels Play Again as Retry Seed;
4. Retry Seed preserves displayed seed/run key and consumes no second crypto seed;
5. New Expedition calls the existing fresh start path and changes displayed seed/run key;
6. Change Mode returns to an enabled three-radio selector.

- [ ] **Step 8: Add positive-partial submission browser coverage**

Use a deterministic generated route to clear at least one non-final stage, Continue, then End. Assert `/api/scores` receives:

```ts
expect(body).toMatchObject({
  context: {
    mode: 'expedition',
    rulesetVersion: 1,
  },
  gameData: {
    mode: 'expedition',
    solved: false,
    levelsCleared: expect.any(Number),
  },
})
```

Also assert `score > 0` and no `competitionKey` is present.

- [ ] **Step 9: Lock stage-clear input gating in the browser**

After a non-final Expedition clear, assert keyboard input does not change moves until `#stage-clear-continue-btn` is clicked, then verify the next stage accepts movement.

- [ ] **Step 10: Re-run Campaign/Daily browser regressions**

Keep existing Campaign, Daily rollover, Daily retry, ranking, failure, and stale-response tests green. Replace the old `mode=expedition -> Campaign` assertion with Expedition preselection; keep an unknown-mode fallback test.

- [ ] **Step 11: Run focused E2E and verify GREEN**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

- [ ] **Step 12: Commit Task 5**

```bash
git add \
  src/pages/ice-slide/index.astro \
  e2e/games/play-coverage.spec.ts
git commit -m "feat(ice-slide): wire Expedition mode controls"
```

---

### Task 6: Run HPA-490 regression and content-validation gates

**Files:**
- No planned production changes.
- Any verification fix must stay within the HPA-490 files above and correspond to a failing command.

- [ ] **Step 1: Run all Ice Slide unit tests**

```bash
bun run test:run -- src/lib/games/ice-slide
```

Expected: PASS, including the 500-run full Expedition assembly sweep.

- [ ] **Step 2: Re-run HPA-489 deep per-tier content validation**

```bash
bun run validate:ice-slide-expedition
```

Expected: 1,000-seed-per-tier validation passes. Treat this as generator/content regression evidence, not the HPA-490 full-run proof.

- [ ] **Step 3: Run markup tests**

```bash
bun run test:run -- src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the full unit suite**

```bash
bun run test:run
```

Expected: PASS.

- [ ] **Step 5: Run static quality gates**

```bash
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Expected: all exit 0. Current Codecov target remains the repository's existing 90%; do not invent an HPA-490 threshold.

- [ ] **Step 6: Run focused and full E2E**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
bun run test:e2e
```

Expected: PASS in the configured E2E environment.

- [ ] **Step 7: Verify scope mechanically**

```bash
git diff --name-only main...HEAD
git grep -n "Math.random" -- \
  src/lib/games/ice-slide/expedition.ts \
  src/lib/games/ice-slide/init.ts
git diff main...HEAD -- \
  src/lib/services/scoreService.ts \
  src/lib/server/db \
  src/pages/api/scores.ts \
  src/pages/api/leaderboard.ts \
  src/lib/games/ice-slide/daily-leaderboard.ts \
  scripts/validate-ice-slide-expedition.ts
```

Expected:

- first command contains only planned HPA-490 implementation/tests/docs;
- second has no Expedition seed/generation use of `Math.random()`;
- third is empty.

- [ ] **Step 8: Commit only verification-driven fixes if required**

Do not create an empty verification commit. If a planned HPA-490 file needs a concrete fix to make a gate pass, commit that tested behavior only.

---

## Plan self-review

- **Spec coverage:** six-stage assembly, deterministic Retry/New semantics, 2/2/2 tiers, objective stars, 360-second completion config, completed/positive-partial persistence, zero-progress local End, anonymous local behavior, leaderboard isolation, renderer recreation, overlays/input gating, Reset, cleanup, submission failures, and failure-state retry cleanup all map to explicit tasks.
- **Placeholder scan:** no TBD/TODO or unspecified interface remains.
- **Type consistency:** Expedition identity helpers, run materializer, scoring helpers, `IceSlidePlayableMode`, and existing `IceSlideHandle.start()`/`playAgain()` APIs use the same names throughout.
- **Task sizing:** deterministic run/scoring/lifecycle/presentation/browser concerns are separated; the neutral DOM-ID rename lands with both producer and markup in Task 4 so no green-but-broken intermediate is planned.
- **Scope check:** no score-service zero opt-in, DB/API work, HPA-491 route choices/Undo, HPA-492 snow, HPA-493 cracked ice, history UI, or validation-script rewrite.
