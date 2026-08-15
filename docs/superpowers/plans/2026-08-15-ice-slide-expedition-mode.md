# Ice Slide Seeded Expedition Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-490 as a six-stage seeded Ice Slide Expedition mode with deterministic 2/2/2 stage assembly, Retry Seed/New Expedition lifecycle, three-star scoring, contextual completed/partial persistence, and no competitive leaderboard leakage.

**Architecture:** Add one pure `expedition.ts` materializer over HPA-489's one-stage generator. Keep Web Crypto seed creation, captured retry-run identity, HUD/result population, renderer lifecycle, and submission in `init.ts`; the Astro page supplies static DOM and event wiring. Add only two small shared mode-policy helpers in `scoring.ts` so Daily/Expedition objective behavior does not become repeated `daily || expedition` checks; keep real mode differences explicit.

**Tech Stack:** Astro 5, TypeScript 6, PixiJS 8, Vitest 3, Playwright 1.54, existing Kysely/Turso score context, Bun 1.3.1.

## Global Constraints

- Expedition has exactly six stages in this order: `easy, easy, medium, medium, hard, hard`.
- `createIceSlideExpeditionStage()` remains the only source of generated stage content; preserve its 64-attempt bound, 10,000-state solver cap, deterministic fallbacks, transform-orbit dedupe, and DEV diagnostics.
- `createIceSlideExpeditionRunDefinition()` is pure: no DOM, Pixi, Web Crypto, network, `Date`, or `Math.random()`.
- New Expedition captures a seed once from `crypto.getRandomValues`; Retry Seed reuses the already-materialized run snapshot and must not consume new randomness.
- Expedition stage scoring matches Daily's `+100` optional-star semantics; Expedition completion uses 360 seconds while Daily stays 300 seconds.
- Campaign retains the existing default-config `levelScore()` / `timeBonus()` path.
- Do not apply HPA-491 multipliers; all HPA-490 stages remain `scoreMultiplierBps = 10_000`.
- Completed and manually ended Expedition attempts persist with `mode='expedition'`, no competition key, and versioned `gameData`; an authenticated zero-score early End must persist.
- Anonymous Expedition play completes/ends locally without an error toast when submission returns `UNAUTHENTICATED`.
- Campaign remains unscoped and score-compatible; Daily ranking/admission stays unchanged.
- The full 32-hex Expedition seed stays in browser-owned captured run state. Do not add it to `IceSlideState` or persisted `IceSlideGameData` for HUD/history purposes.
- Keep `/ice-slide?mode=daily` as the only query-param preselection; `?mode=expedition` continues to fall back to Campaign.
- No Safe/Risky choices, Undo, snow, cracked ice, cross-seed ranking, resume, seed input/share UI, history UI, DB migration, API route, generic mode registry, or overlay framework.

---

## File structure

**Create**

- `src/lib/games/ice-slide/expedition.ts` — pure six-stage Expedition run materialization.
- `src/lib/games/ice-slide/expedition.test.ts` — deterministic assembly, multi-seed full-run uniqueness, tier order, and no-randomness coverage.

**Modify**

- `src/lib/games/ice-slide/run.ts` / `run.test.ts` — public Expedition run-key identity parser/formatter and single-source validation.
- `src/lib/games/ice-slide/scoring.ts` / `scoring.test.ts` — Expedition scoring config plus two small mode-policy helpers.
- `src/lib/games/ice-slide/game.ts` / `game.test.ts` — objective/star and completion scoring for Expedition using those helpers.
- `src/lib/services/scoreService.ts` / `scoreService.test.ts` — explicit zero-score submission opt-in.
- `src/lib/games/ice-slide/types.ts` — ship `expedition` as a playable mode.
- `src/lib/games/ice-slide/init.ts` / `init.test.ts` — Web Crypto seed capture, Retry/New lifecycle, contextual complete/partial submission, shared objective-mode overlays, and Expedition HUD/result population from the captured run seed.
- `src/pages/ice-slide/index.astro` — third radio, Expedition DOM, result actions, New Expedition wiring, Daily leaderboard isolation.
- `src/pages/game-board-markup.test.ts` — durable Expedition selectors.
- `e2e/games/play-coverage.spec.ts` — browser lifecycle coverage.

**Do not modify unless a failing HPA-490 test proves a regression in an already-shipped seam**

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

In `run.test.ts`, use the production hash only to construct the identity; the formatter accepts the identity rather than the raw seed:

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
  expect(formatIceSlideExpeditionRunKey(
    parseIceSlideExpeditionRunKey(runKey)!
  )).toBe(runKey)
})

it.each([
  'ice-slide:expedition:nothex:g1:r1',
  'ice-slide:expedition:12345678:g0:r1',
  'ice-slide:expedition:12345678:g1:r0',
])('rejects malformed Expedition key %s', runKey => {
  expect(parseIceSlideExpeditionRunKey(runKey)).toBeNull()
})

it('rejects malformed Expedition seed hashes when formatting', () => {
  expect(() =>
    formatIceSlideExpeditionRunKey({
      seedHash: 'ABCDEF12',
      generatorVersion: 1,
      rulesetVersion: 1,
    })
  ).toThrow(RangeError)
})
```

- [ ] **Step 2: Run run-key tests and verify RED**

```bash
bun run test:run -- src/lib/games/ice-slide/run.test.ts
```

Expected: FAIL because public Expedition identity helpers do not exist.

- [ ] **Step 3: Extract the Expedition grammar into inverse helpers**

In `run.ts`, retain the current key regex and add:

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
    throw new RangeError('expedition seedHash must be 8 lowercase hex characters')
  }
  assertPositiveInt(identity.generatorVersion, 'generatorVersion')
  assertPositiveInt(identity.rulesetVersion, 'rulesetVersion')
  return (
    `ice-slide:expedition:${identity.seedHash}:` +
    `g${identity.generatorVersion}:r${identity.rulesetVersion}`
  )
}
```

Refactor `assertValidIceSlideRunDefinition()` to call `parseIceSlideExpeditionRunKey(run.runKey)`, then keep the existing original-seed checks and separately assert:

```ts
hashString32Hex(run.seed) === identity.seedHash
```

Do not move raw-seed validation into the formatter; the formatter cannot reconstruct or validate the original seed.

- [ ] **Step 4: Re-run `run.test.ts` and verify GREEN**

```bash
bun run test:run -- src/lib/games/ice-slide/run.test.ts
```

Expected: PASS including existing Campaign/Daily cases.

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

it('uses the fixed 2/2/2 tier order with no transform-equivalent duplicates', () => {
  const run = createIceSlideExpeditionRunDefinition(SEED)
  expect(run.stages.map(stage => stage.difficulty)).toEqual([
    'easy', 'easy', 'medium', 'medium', 'hard', 'hard',
  ])
  expect(new Set(run.stages.map(stage => getBoardOrbitKey(stage.rows))).size).toBe(6)
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

Also assert:

```ts
const run = createIceSlideExpeditionRunDefinition(SEED)
expect(run.runKey).toBe(formatIceSlideExpeditionRunKey({
  seedHash: hashString32Hex(SEED),
  generatorVersion: ICE_SLIDE_EXPEDITION_GENERATOR_VERSION,
  rulesetVersion: ICE_SLIDE_RULESET_VERSION,
}))
expect(run.stages.every(stage => stage.objectiveIds.length === 1)).toBe(true)
expect(() => assertValidIceSlideRunDefinition(run)).not.toThrow()
```

- [ ] **Step 6: Add the HPA-490 cross-tier multi-seed assembly test**

This test must call the **six-stage run materializer**, not the HPA-489 per-tier validator:

```ts
it('materializes valid unique six-stage runs across 32 deterministic seeds', () => {
  for (let index = 0; index < 32; index++) {
    const seed = `hpa-490:full-run:${String(index).padStart(2, '0')}`
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

This is the direct guard against a stage-5/6 failure caused by canonical boards consumed by earlier tiers. Do not substitute `runIceSlideExpeditionValidation()`; it resets the key set per tier.

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

No retry loop belongs here.

- [ ] **Step 9: Run pure Expedition/run/generator tests and verify GREEN**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/generator.test.ts
```

Expected: PASS, including all 32 complete runs.

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

### Task 2: Centralize objective-mode/scoring policy and add Expedition scoring

**Files:**
- Modify: `src/lib/games/ice-slide/scoring.ts`
- Modify: `src/lib/games/ice-slide/scoring.test.ts`
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`

**Interfaces:**
- Consumes: existing `SCORING_CONFIG`, `DAILY_SCORING_CONFIG`, `levelScore()`, `timeBonus()`, `IceSlideMode`, objective completion.
- Produces:

```ts
export const EXPEDITION_SCORING_CONFIG: IceSlideModeScoringConfig = {
  objectiveStarBonus: 100,
  timeBudgetSeconds: 360,
  timeBonusPerSec: 5,
}

export function isIceSlideObjectiveMode(mode: IceSlideMode): boolean

export function iceSlideScoringConfig(
  mode: IceSlideMode
): IceSlideModeScoringConfig
```

- [ ] **Step 1: Add failing scoring policy tests**

In `scoring.test.ts`:

```ts
it('maps objective modes and scoring configs explicitly', () => {
  expect(isIceSlideObjectiveMode('campaign')).toBe(false)
  expect(isIceSlideObjectiveMode('daily')).toBe(true)
  expect(isIceSlideObjectiveMode('expedition')).toBe(true)

  expect(iceSlideScoringConfig('campaign')).toBe(SCORING_CONFIG)
  expect(iceSlideScoringConfig('daily')).toBe(DAILY_SCORING_CONFIG)
  expect(iceSlideScoringConfig('expedition')).toBe(EXPEDITION_SCORING_CONFIG)
})

it('uses Daily star value with a 360-second Expedition budget', () => {
  expect(EXPEDITION_SCORING_CONFIG).toEqual({
    objectiveStarBonus: 100,
    timeBudgetSeconds: 360,
    timeBonusPerSec: 5,
  })
  expect(timeBonus(300, EXPEDITION_SCORING_CONFIG)).toBe(300)
  expect(timeBonus(360, EXPEDITION_SCORING_CONFIG)).toBe(0)
})
```

- [ ] **Step 2: Run scoring tests and verify RED**

```bash
bun run test:run -- src/lib/games/ice-slide/scoring.test.ts
```

Expected: FAIL because Expedition config/helpers do not exist.

- [ ] **Step 3: Add the config and two tiny policy helpers**

In `scoring.ts`:

```ts
export const EXPEDITION_SCORING_CONFIG: IceSlideModeScoringConfig = {
  objectiveStarBonus: 100,
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

Import only `IceSlideMode` from `types.ts`. Do not create a registry/map object or generic mode metadata contract.

- [ ] **Step 4: Add failing game tests for Expedition stars and completion scoring**

Build a small explicit `mode: 'expedition'` run with signed stages and assert:

```ts
expect(result.stars.clear).toBe(true)
expect(result.stars.efficient).toBe(true)
expect(result.stars.bonus).toEqual({ id: 'no_reset', earned: true })
expect(result.stars.earnedCount).toBe(3)
expect(game.getState().starsEarned).toBe(3)
```

For a one-stage fixture completed at 300 elapsed seconds, assert the final Expedition score includes:

```ts
timeBonus(300, EXPEDITION_SCORING_CONFIG) === 300
```

Retain Daily's 300-second and Campaign completion assertions in the same regression set.

- [ ] **Step 5: Run game tests and verify RED**

```bash
bun run test:run -- src/lib/games/ice-slide/game.test.ts
```

Expected: Expedition currently follows Campaign objective/star semantics.

- [ ] **Step 6: Refactor `clearLevel()` to consume policy helpers**

Use:

```ts
const mode = this.activeRun.mode
const isObjectiveMode = isIceSlideObjectiveMode(mode)
const scoringConfig = iceSlideScoringConfig(mode)
```

Then:

- read the stage bonus objective only when `isObjectiveMode`;
- compute Efficient + Bonus optional stars only when `isObjectiveMode`;
- for Daily/Expedition call `levelScore({ ...scoringParams, optionalStarsEarned }, scoringConfig)`;
- for Campaign keep the existing `levelScore(scoringParams)` call;
- increment `state.starsEarned` only when `isObjectiveMode`;
- on completion, call `timeBonus(elapsedSeconds, scoringConfig)` only for objective modes and retain `timeBonus(elapsedSeconds)` for Campaign.

Do not branch on template IDs, seed, fallback state, or future route choices.

- [ ] **Step 7: Run scoring/game regressions and verify GREEN**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/scoring.test.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.win.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
```

Expected: PASS with Campaign/Daily expectations unchanged.

- [ ] **Step 8: Commit Task 2**

```bash
git add \
  src/lib/games/ice-slide/scoring.ts \
  src/lib/games/ice-slide/scoring.test.ts \
  src/lib/games/ice-slide/game.ts \
  src/lib/games/ice-slide/game.test.ts
git commit -m "feat(ice-slide): centralize Expedition scoring policy"
```

---

### Task 3: Permit zero-score persistence only for explicit Expedition submissions

**Files:**
- Modify: `src/lib/services/scoreService.ts`
- Modify: `src/lib/services/scoreService.test.ts`

**Interfaces:**
- Consumes: existing `saveGameScore()` and `SaveScoreOptions`.
- Produces:

```ts
export interface SaveScoreOptions {
  isStale?: () => boolean
  context?: ScoreSubmissionContext
  allowZeroScore?: boolean
}
```

- [ ] **Step 1: Add failing default/opt-in zero-score tests**

```ts
it('continues to skip zero scores by default', async () => {
  await saveGameScore(GameID.ICE_SLIDE, 0)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('submits zero when allowZeroScore is explicit', async () => {
  await saveGameScore(
    GameID.ICE_SLIDE,
    0,
    undefined,
    undefined,
    { solved: false, mode: 'expedition' },
    {
      allowZeroScore: true,
      context: { mode: 'expedition', rulesetVersion: 1 },
    }
  )
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('never submits a negative score', async () => {
  await saveGameScore(
    GameID.ICE_SLIDE,
    -1,
    undefined,
    undefined,
    { solved: false, mode: 'expedition' },
    { allowZeroScore: true }
  )
  expect(fetchMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run score-service tests and verify RED**

```bash
bun run test:run -- src/lib/services/scoreService.test.ts
```

Expected: explicit zero still returns before fetch.

- [ ] **Step 3: Implement the narrow guard**

Replace the current `score <= 0` check with:

```ts
if (score < 0 || (score === 0 && options?.allowZeroScore !== true)) {
  return
}
```

Do not change `submitScore()` or server validation; server score validation already accepts non-negative integer 0.

- [ ] **Step 4: Re-run score-service tests and verify GREEN**

```bash
bun run test:run -- src/lib/services/scoreService.test.ts
```

Expected: PASS with every existing caller retaining zero-score suppression.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib/services/scoreService.ts src/lib/services/scoreService.test.ts
git commit -m "feat(scores): allow explicit zero-score history rows"
```

---

### Task 4: Add browser seed capture, Retry/New lifecycle, and contextual Expedition submission

**Files:**
- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`

**Interfaces:**
- Consumes: `createIceSlideExpeditionRunDefinition()`, `cloneIceSlideRunDefinition()`, `isIceSlideObjectiveMode()`, current run guard, score service, Daily lifecycle.
- Produces:

```ts
export type IceSlidePlayableMode = 'campaign' | 'daily' | 'expedition'

export interface IceSlideHandle {
  start: (mode?: IceSlidePlayableMode) => Promise<void>
  playAgain: () => Promise<void>
  newExpedition: () => Promise<void>
  stop: () => void
  resetLevel: () => void
  cleanup: () => void
  getGame: () => IceSlideGame | null
}
```

`createExpeditionSeed()` and `retryRun` remain private to `init.ts`.

- [ ] **Step 1: Add failing start/retry/new-seed lifecycle tests**

Stub Web Crypto with two deterministic sequences:

```ts
const cryptoValues = [
  new Uint32Array([0x00112233, 0x44556677, 0x8899aabb, 0xccddeeff]),
  new Uint32Array([0x10213243, 0x54657687, 0x98a9bacb, 0xdcedfe0f]),
]
```

Verify:

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

await handle.newExpedition()
const next = handle.getGame()!.getState()
expect(next.runKey).not.toBe(first.runKey)
expect(getRandomValues).toHaveBeenCalledTimes(2)
```

Spy on `Math.random` and assert it remains untouched.

- [ ] **Step 2: Add failing complete/partial submission tests**

Mock `saveGameScore` and assert Expedition sends:

```ts
expect(saveGameScore).toHaveBeenCalledWith(
  GameID.ICE_SLIDE,
  expect.any(Number),
  expect.any(Function),
  expect.any(Function),
  expect.objectContaining({
    mode: 'expedition',
    stagesTotal: 6,
  }),
  expect.objectContaining({
    allowZeroScore: true,
    context: {
      mode: 'expedition',
      rulesetVersion: 1,
    },
  })
)
```

For immediate End, assert score `0` and `gameData.solved === false`. For completion, assert `solved === true`. Add an Expedition `UNAUTHENTICATED` case that does not call `onError`.

- [ ] **Step 3: Run init tests and verify RED**

```bash
bun run test:run -- src/lib/games/ice-slide/init.test.ts
```

Expected: Expedition is not playable and the new lifecycle paths do not exist.

- [ ] **Step 4: Expand the playable-mode type and import the pure materializer/policy helper**

Change only:

```ts
export type IceSlidePlayableMode = 'campaign' | 'daily' | 'expedition'
```

Import `createIceSlideExpeditionRunDefinition` and `isIceSlideObjectiveMode` into `init.ts`. Do not expose generator internals to the page.

- [ ] **Step 5: Add private Web Crypto seed capture**

```ts
function createExpeditionSeed(): string {
  const words = new Uint32Array(4)
  crypto.getRandomValues(words)
  return Array.from(words, word => word.toString(16).padStart(8, '0')).join('')
}
```

No catch/fallback lives inside this helper. The caller's existing `try/catch -> failRun()` owns cleanup/error display.

- [ ] **Step 6: Replace Daily-only retry state with a captured objective-run snapshot**

Use:

```ts
let retryRun: IceSlideRunDefinition | null = null
```

Rules:

- Daily start clones its materialized run into `retryRun`.
- Expedition start captures one seed, materializes all six stages, clones into `retryRun`.
- Campaign start clears `retryRun`.
- `playAgain()` clones `retryRun` when `isIceSlideObjectiveMode(currentMode)` and a snapshot exists; otherwise start Campaign.
- `newExpedition()` invokes the same fresh Expedition path and consumes a new seed.
- `dailyDateKey` remains Daily-only and is reset for Campaign/Expedition.

In `startRun(run?)`, derive `currentMode` from `run?.mode ?? 'campaign'`; do not preserve the old Daily-vs-Campaign binary assignment.

- [ ] **Step 7: Generalize existing stage-result overlay gating with the helper**

In `onLevelClear`:

```ts
if (!game || !isIceSlideObjectiveMode(game.getState().mode)) {
  return
}
```

Daily and Expedition then reuse the current non-final input lock/stage-clear behavior and final result callback path. Keep the existing DOM IDs for this task; Task 5 renames/populates the new neutral/result DOM together with the page markup so no unlisted `init.ts` edit is required later.

- [ ] **Step 8: Add contextual Expedition submission and explicit End behavior**

In `submitScore()`:

- Campaign remains unscoped.
- Daily keeps `{ mode:'daily', competitionKey, rulesetVersion }`.
- Expedition uses `{ mode:'expedition', rulesetVersion }` plus `allowZeroScore: true`.
- Suppress `UNAUTHENTICATED` when `isIceSlideObjectiveMode(gameData.mode)`.
- Do not collapse Daily/Expedition context construction into a registry; their payloads differ.

In `stop()`, retain an explicit Expedition-only branch:

```ts
if (mode === 'expedition') {
  if (status !== 'playing') return
  hideStageClear()
  game.stop()
  resetButtons()
  showOverlay('RUN ENDED', score)
  submitScore(score)
  syncHud()
  return
}
```

Daily End stays local-only; Campaign logic remains unchanged.

- [ ] **Step 9: Lock renderer/failure/cleanup regressions**

Extend init tests to ensure:

- a generated next stage with different dimensions causes `setupPixiJS` recreation after Continue;
- a thrown Expedition materialization error leaves `getGame() === null`, container empty, handlers removed, overlays/meta hidden, Start restored;
- cleanup invalidates stale submission callbacks and removes listeners.

Reuse existing renderer mocks/failRun assertions; no cleanup abstraction.

- [ ] **Step 10: Run lifecycle tests and verify GREEN**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit Task 4**

```bash
git add \
  src/lib/games/ice-slide/types.ts \
  src/lib/games/ice-slide/init.ts \
  src/lib/games/ice-slide/init.test.ts
git commit -m "feat(ice-slide): add Expedition run lifecycle"
```

---

### Task 5: Ship Expedition HUD/result DOM with `init.ts`-owned seed and summary population

**Files:**
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`
- Modify: `e2e/games/play-coverage.spec.ts`

**Interfaces:**
- Consumes: private `retryRun`, `isIceSlideObjectiveMode()`, `IceSlideHandle.start()`, `playAgain()`, `newExpedition()`, `getGame()`.
- Produces durable DOM selectors:

```text
input[value="expedition"]
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

The page does **not** own or reconstruct the full seed. `init.ts` populates seed/summary text from `retryRun.seed` plus game state/data.

- [ ] **Step 1: Add failing init tests for full-seed HUD and summary ownership**

Create the required DOM nodes in the existing init test fixture and stub crypto to produce:

```text
00112233445566778899aabbccddeeff
```

After `start('expedition')` assert:

```ts
expect(document.getElementById('expedition-seed')?.textContent).toBe(
  '00112233445566778899aabbccddeeff'
)
expect(document.getElementById('expedition-seed')?.textContent).not.toBe(
  parseIceSlideExpeditionRunKey(handle.getGame()!.getState().runKey)?.seedHash
)
```

After immediate End assert `#expedition-summary-seed` contains the same 32-hex seed and summary progress/counters reflect `game.getGameData()`.

This test prevents the page from trying to derive a seed from the 8-hex run-key hash.

- [ ] **Step 2: Add failing markup tests for the shipped Expedition DOM**

In `game-board-markup.test.ts` replace the old Expedition-absent assertion with:

```ts
expect(iceSlideMarkup).toContain('value="expedition"')
expect(iceSlideMarkup).toContain('id="expedition-meta"')
expect(iceSlideMarkup).toContain('id="expedition-seed"')
expect(iceSlideMarkup).toContain('id="expedition-summary"')
expect(iceSlideMarkup).toContain('id="new-expedition-btn"')
expect(iceSlideMarkup).toContain('id="run-final-stage-result"')
```

Keep every existing Daily leaderboard ID asserted.

- [ ] **Step 3: Run init/markup tests and verify RED**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: FAIL on missing Expedition/neutral DOM and seed/summary population.

- [ ] **Step 4: Add the third radio without changing URL preselection**

In `index.astro`, add Expedition beside Campaign/Daily. Preserve:

```ts
const selectedMode: IceSlidePlayableMode =
  requestedMode === 'daily' ? 'daily' : 'campaign'
```

Update `readSelectedMode()` only:

```ts
const value = modeRadios.find(radio => radio.checked)?.value
return value === 'daily'
  ? 'daily'
  : value === 'expedition'
    ? 'expedition'
    : 'campaign'
```

No registry.

- [ ] **Step 5: Add the Expedition HUD markup and populate it in `init.ts::syncHud()`**

Add a hidden `#expedition-meta` Card containing seed, stage/tier, stars, falls/resets, and Clear/Efficient/Bonus labels.

In `syncHud()`:

```ts
const mode = state.mode
const isDaily = mode === 'daily'
const isExpedition = mode === 'expedition'
setVisible('daily-meta', isDaily)
setVisible('expedition-meta', isExpedition)
```

For Expedition:

```ts
setText('expedition-seed', retryRun?.seed ?? '—')
setText(
  'expedition-stage-progress',
  `Stage ${state.levelIndex + 1} / ${state.stagesTotal} · ` +
    ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES[state.levelIndex].toUpperCase()
)
setText('expedition-stars', `Stars ${state.starsEarned} / 18`)
setText('expedition-attempts', `Falls ${state.falls} · Resets ${state.resets}`)
```

Populate Clear/Efficient/Bonus objective copy using the same objective-label source as Daily. Use `isIceSlideObjectiveMode(mode)` for shared objective copy, not another `daily || expedition` expression.

Do not add `difficulty` or `seed` to `IceSlideState` solely for HUD rendering.

- [ ] **Step 6: Neutralize final-star IDs in page + init together**

Rename:

```text
#daily-final-stage-result -> #run-final-stage-result
#daily-final-clear        -> #run-final-clear
#daily-final-efficient    -> #run-final-efficient
#daily-final-bonus        -> #run-final-bonus
```

Add `#run-final-heading`.

Update `hideFinalStageResult()` / `populateFinalStageResult()` in `init.ts` in the same task:

```ts
setText(
  'run-final-heading',
  game?.getState().mode === 'expedition' ? 'Expedition stars' : 'Daily stars'
)
```

Fill the three neutral rows from the existing `IceSlideStageClearResult`. Update Daily unit/markup/E2E selectors in this same task; no compatibility aliases for private DOM IDs.

- [ ] **Step 7: Add `init.ts`-owned Expedition final/End summary population**

Add hidden summary DOM in the page, but populate it only from `init.ts`:

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
  setText('expedition-summary-stars', `${data.starsEarned} / 18 stars`)
  setText('expedition-summary-moves', `${data.totalMoves} moves`)
  setText('expedition-summary-crystals', `${data.crystalsCollected} crystals`)
  setText(
    'expedition-summary-attempts',
    `${data.falls} falls · ${data.resets} resets`
  )
  setText('expedition-summary-time', formatTime(data.elapsedSeconds))
  setVisible('expedition-summary', true)
}
```

Call this after Expedition `onWin` result setup and after the Expedition `stop()` branch has called `game.stop()`. Hide it when starting a new run, changing away from Expedition, failing a run, or cleanup.

Do not persist the raw seed in `IceSlideGameData`.

- [ ] **Step 8: Keep action presentation in the page**

Add `#new-expedition-btn` under final stats.

Use one small page-local helper for button visibility/label only:

```ts
const syncResultActions = () => {
  const expedition = gameHandle?.getGame()?.getState().mode === 'expedition'
  playAgainBtn.textContent = expedition ? 'Retry Seed' : 'Play Again'
  newExpeditionBtn.classList.toggle('hidden', !expedition)
}
```

The page must not read `gameData` to populate summary fields and must not derive the seed from `runKey`.

Call the helper after result/End transitions and reset it on Change Mode/new starts.

- [ ] **Step 9: Wire New Expedition and preserve Daily leaderboard isolation**

`#new-expedition-btn` click:

1. hide the result overlay;
2. disable mode controls;
3. hide the Daily leaderboard;
4. call `gameHandle.newExpedition()`;
5. restore existing button/error behavior on rejection.

Mode changes/start paths call `leaderboardController.hide()` for Campaign/Expedition; only Daily computes/loads a competition key.

- [ ] **Step 10: Re-run init/markup tests and verify GREEN**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS, including full-seed/summary ownership tests and existing Daily selectors migrated to neutral final IDs.

- [ ] **Step 11: Add Playwright Expedition lifecycle coverage**

In the existing Ice Slide `test.describe`, install deterministic Web Crypto before navigation using `page.addInitScript()`. Override only `crypto.getRandomValues` calls for the `Uint32Array(4)` seed shape and delegate unrelated typed arrays to the native implementation.

Add browser assertions that prove:

1. selecting Expedition + Start shows the full 32-hex `#expedition-seed`, `Stage 1 / 6 · EASY`, and no Daily leaderboard;
2. immediate End sends `/api/scores` with score `0`, `context.mode === 'expedition'`, no `competitionKey`, and `gameData.solved === false` when mocked successful;
3. End summary displays the same full seed plus `0 / 6 stages` and counters;
4. Play Again reads `Retry Seed`; clicking it preserves full seed + run key;
5. End again + New Expedition consumes the second deterministic crypto value and changes seed/run identity;
6. Change Mode returns to exactly three enabled radio inputs;
7. `?mode=expedition` still preselects Campaign;
8. a non-final clear locks keyboard/pointer movement until Continue.

Use a deterministic generated-stage solution/path fixture pattern already present around Daily tests. Do not create a separate Expedition E2E harness.

- [ ] **Step 12: Run focused Ice Slide Playwright tests**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Expected: all existing Campaign/Daily/leaderboard tests plus Expedition tests PASS.

- [ ] **Step 13: Commit Task 5**

```bash
git add \
  src/lib/games/ice-slide/init.ts \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/ice-slide/index.astro \
  src/pages/game-board-markup.test.ts \
  e2e/games/play-coverage.spec.ts
git commit -m "feat(ice-slide): expose Expedition mode controls"
```

---

### Task 6: Run HPA-490 full-run, regression, and content-validation gates

**Files:**
- No planned production files.
- Any fix discovered here must stay within the HPA-490 file set above and be tied to a failing verification command.

**Interfaces:**
- Consumes the completed feature.
- Produces verification evidence only; no new abstraction/API.

- [ ] **Step 1: Re-run the direct HPA-490 six-stage assembly proof**

```bash
bun run test:run -- src/lib/games/ice-slide/expedition.test.ts
```

Expected: PASS including the 32-seed test where one canonical-key set survives all six tiers.

This is the assembly gate. Do not replace it with the HPA-489 script.

- [ ] **Step 2: Run all Ice Slide unit tests**

```bash
bun run test:run -- src/lib/games/ice-slide
```

Expected: PASS.

- [ ] **Step 3: Re-run HPA-489's generator/content validation as a regression gate**

```bash
bun run validate:ice-slide-expedition
```

Expected: all 1,000-seed-per-tier checks PASS with no invalid accepted stage.

This command validates the one-stage generator/templates within each tier; it is **not** the six-stage HPA-490 proof because its canonical-key set resets for each tier/seed prefix. Do not expand the script into a full-run fuzzer in this task.

- [ ] **Step 4: Run score-service and markup tests**

```bash
bun run test:run -- \
  src/lib/services/scoreService.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full unit suite**

```bash
bun run test:run
```

Expected: PASS.

- [ ] **Step 6: Run static quality gates**

```bash
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Expected: all commands exit 0. The current Codecov target is 90%; do not invent an HPA-490-specific threshold.

- [ ] **Step 7: Run focused and full E2E**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
bun run test:e2e
```

Expected: PASS in the configured repository environment.

- [ ] **Step 8: Verify scope mechanically**

```bash
git diff --name-only main...HEAD
git grep -n "Math.random" -- \
  src/lib/games/ice-slide/expedition.ts \
  src/lib/games/ice-slide/init.ts
git diff main...HEAD -- \
  scripts/validate-ice-slide-expedition.ts \
  src/lib/server/db \
  src/pages/api/scores.ts \
  src/pages/api/leaderboard.ts \
  src/lib/games/ice-slide/daily-leaderboard.ts
```

Expected:

- first command contains only planned HPA-490 implementation/tests/docs;
- second command has no Expedition seed/generation use of `Math.random()`;
- third command is empty.

- [ ] **Step 9: Commit only verification-driven fixes if required**

If Steps 1–8 are green, do not create an empty verification commit. If a planned HPA-490 file requires a concrete fix to make a gate pass, commit only that tested correction with a behavior-specific message.

---

## Plan self-review

- **Spec coverage:** six-stage assembly, deterministic Retry/New semantics, 2/2/2 tiers, objectives/stars, 360-second completion bonus, contextual complete/partial persistence including zero-score End, anonymous local behavior, leaderboard isolation, renderer recreation, overlays/input gating, Reset, cleanup, submission failures, full-seed HUD/summary ownership, and full-run cross-tier validation all map to explicit tasks.
- **Placeholder scan:** no implementation step depends on TBD/TODO or an unspecified API.
- **Type consistency:** `IceSlidePlayableMode`, `IceSlideExpeditionRunIdentity`, inverse run-key helpers, `createIceSlideExpeditionRunDefinition()`, `EXPEDITION_SCORING_CONFIG`, `isIceSlideObjectiveMode()`, `iceSlideScoringConfig()`, `SaveScoreOptions.allowZeroScore`, and `IceSlideHandle.newExpedition()` use the same names across tasks.
- **Ownership:** `init.ts` owns the captured raw seed and summary/HUD text; the page owns markup, result button presentation, Daily leaderboard wiring, and New Expedition click only.
- **Verification:** the 32-seed six-stage materializer test proves HPA-490 assembly; HPA-489's 1,000-seed-per-tier command remains a separate generator/content regression.
- **Scope check:** HPA-491 Safe/Risky/Undo, HPA-492 snow, HPA-493 cracked ice, ranking calibration, seed sharing, history UI, generic frameworks, and script refactors remain outside this plan.
