# Ice Slide Seeded Expedition Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-490 as a six-stage seeded Ice Slide Expedition mode with deterministic 2/2/2 stage assembly, Retry Seed/New Expedition lifecycle, three-star scoring, contextual completed/partial persistence, and no competitive leaderboard leakage.

**Architecture:** Add one pure `expedition.ts` materializer over the existing HPA-489 one-stage generator. Keep random seed creation in browser-owned `init.ts`, keep gameplay on the existing materialized-run engine, and extend the already-shipped Daily objective/star/product seams only where Expedition shares behavior. Reuse the existing score-context platform; no DB, API, leaderboard, generator-framework, or route-choice subsystem is added.

**Tech Stack:** Astro 5, TypeScript 6, PixiJS 8, Vitest 3, Playwright 1.54, existing Kysely/Turso score context, Bun 1.3.1.

## Global Constraints

- Expedition has exactly six stages in this order: `easy, easy, medium, medium, hard, hard`.
- `createIceSlideExpeditionStage()` remains the only source of generated stage content; preserve its 64-attempt bound, 10,000-state solver cap, fallbacks, transform-orbit dedupe, and DEV diagnostics.
- `createIceSlideExpeditionRunDefinition()` is pure: no DOM, Pixi, Web Crypto, network, `Date`, or `Math.random()`.
- New Expedition captures a seed once from `crypto.getRandomValues`; Retry Seed reuses the already-materialized run snapshot and must not consume new randomness.
- Expedition stage scoring matches Daily's `+100` optional-star semantics; Expedition completion uses a 360-second budget while Daily stays at 300 seconds.
- Do not apply future route-choice multipliers; HPA-490 stages remain `scoreMultiplierBps = 10_000` and HPA-491 owns non-1.00 multipliers.
- Completed and manually ended Expedition attempts persist with `mode='expedition'`, no competition key, and versioned `gameData`; an early zero-score End must also persist when authenticated.
- Anonymous Expedition play completes/ends locally without an error toast when score submission returns `UNAUTHENTICATED`.
- Campaign remains unscoped and score-compatible; Daily ranking/admission behavior remains unchanged.
- Keep `/ice-slide?mode=daily` as the only query-param preselection. `?mode=expedition` may continue to fall back to Campaign.
- No Safe/Risky choices, Undo, snow, cracked ice, cross-seed leaderboard, resume-after-refresh, seed input/share UI, new history UI, new DB migration, or generic mode framework.

---

## File structure

**Create**

- `src/lib/games/ice-slide/expedition.ts` — pure six-stage Expedition run materialization.
- `src/lib/games/ice-slide/expedition.test.ts` — deterministic assembly, tier order, uniqueness, and no-randomness coverage.

**Modify**

- `src/lib/games/ice-slide/run.ts` / `run.test.ts` — public Expedition run-key format/parse helpers and single-source validation.
- `src/lib/games/ice-slide/scoring.ts` / `scoring.test.ts` — Expedition scoring config.
- `src/lib/games/ice-slide/game.ts` / `game.test.ts` — objective/star and completion scoring for Expedition.
- `src/lib/services/scoreService.ts` / `scoreService.test.ts` — explicit zero-score submission opt-in.
- `src/lib/games/ice-slide/types.ts` — ship `expedition` as a playable mode.
- `src/lib/games/ice-slide/init.ts` / `init.test.ts` — Web Crypto seed capture, Retry Seed/New Expedition, Expedition HUD/result lifecycle, contextual complete/partial submission.
- `src/pages/ice-slide/index.astro` — third mode radio, Expedition HUD/summary/buttons, Daily leaderboard isolation.
- `src/pages/game-board-markup.test.ts` — durable Expedition selectors.
- `e2e/games/play-coverage.spec.ts` — real browser lifecycle coverage.

**Do not modify unless a regression in an already-shipped seam is demonstrated by a failing HPA-490 test**

- `src/lib/games/ice-slide/generator.ts`
- `src/lib/games/ice-slide/templates.ts`
- `src/lib/games/ice-slide/quality.ts`
- `src/lib/games/ice-slide/solver.ts`
- `src/lib/games/ice-slide/physics.ts`
- `src/lib/games/ice-slide/renderer.ts`
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
- Consumes: `createIceSlideExpeditionStage()`, `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION`, `ICE_SLIDE_RUN_SCHEMA_VERSION`, `ICE_SLIDE_RULESET_VERSION`, `hashString32Hex()`, `assertValidIceSlideRunDefinition()`.
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

export function formatIceSlideExpeditionRunKey(input: {
  seed: string
  generatorVersion: number
  rulesetVersion: number
}): string

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

- [ ] **Step 1: Add failing run-key parse/format tests**

Add tests to `run.test.ts` that compute the seed hash through production code rather than duplicating FNV behavior:

```ts
it('round-trips Expedition run identity', () => {
  const seed = '00112233445566778899aabbccddeeff'
  const runKey = formatIceSlideExpeditionRunKey({
    seed,
    generatorVersion: 1,
    rulesetVersion: 1,
  })

  expect(runKey).toBe(
    `ice-slide:expedition:${hashString32Hex(seed)}:g1:r1`
  )
  expect(parseIceSlideExpeditionRunKey(runKey)).toEqual({
    seedHash: hashString32Hex(seed),
    generatorVersion: 1,
    rulesetVersion: 1,
  })
})

it.each([
  'ice-slide:expedition:nothex:g1:r1',
  'ice-slide:expedition:12345678:g0:r1',
  'ice-slide:expedition:12345678:g1:r0',
])('rejects malformed Expedition key %s', runKey => {
  expect(parseIceSlideExpeditionRunKey(runKey)).toBeNull()
})
```

- [ ] **Step 2: Run the key tests and verify RED**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/run.test.ts
```

Expected: FAIL because the public Expedition formatter/parser do not exist.

- [ ] **Step 3: Extract Expedition grammar into public helpers and reuse it in run validation**

In `run.ts`, keep the existing regex grammar but route validation through the new parser:

```ts
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

export function formatIceSlideExpeditionRunKey(input: {
  seed: string
  generatorVersion: number
  rulesetVersion: number
}): string {
  if (input.seed.length === 0 || input.seed.includes('\u001f')) {
    throw new RangeError('expedition seed must be non-empty without U+001F')
  }
  assertPositiveInt(input.generatorVersion, 'generatorVersion')
  assertPositiveInt(input.rulesetVersion, 'rulesetVersion')
  return (
    `ice-slide:expedition:${hashString32Hex(input.seed)}:` +
    `g${input.generatorVersion}:r${input.rulesetVersion}`
  )
}
```

In `assertValidIceSlideRunDefinition()`, replace direct `EXPEDITION_KEY_PATTERN.exec()` parsing with `parseIceSlideExpeditionRunKey()`, then keep the current seed/hash/version equality checks.

- [ ] **Step 4: Re-run `run.test.ts` and verify GREEN**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/run.test.ts
```

Expected: PASS, including existing Campaign/Daily validation cases.

- [ ] **Step 5: Add failing pure run-materializer tests**

Create `expedition.test.ts` with real generation for one stable seed:

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

it('uses the fixed 2/2/2 tier order with no transform-equivalent duplicate', () => {
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

Also assert `run.runKey === formatIceSlideExpeditionRunKey(...)`, generator/ruleset versions are current, every stage has exactly one objective, and `assertValidIceSlideRunDefinition(run)` does not throw.

- [ ] **Step 6: Run Expedition tests and verify RED**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/expedition.test.ts
```

Expected: FAIL because `expedition.ts` does not exist.

- [ ] **Step 7: Implement the six-stage materializer**

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
      seed,
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

Do not add retry loops here: the one-stage generator already owns all bounded retry/fallback behavior.

- [ ] **Step 8: Run pure Expedition/run tests and verify GREEN**

Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/generator.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add \
  src/lib/games/ice-slide/expedition.ts \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/games/ice-slide/run.ts \
  src/lib/games/ice-slide/run.test.ts
git commit -m "feat(ice-slide): materialize seeded Expedition runs"
```

---

### Task 2: Reuse Daily's three-star stage scoring with a 360-second Expedition completion budget

**Files:**
- Modify: `src/lib/games/ice-slide/scoring.ts`
- Modify: `src/lib/games/ice-slide/scoring.test.ts`
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`

**Interfaces:**
- Consumes: existing `levelScore()`, `timeBonus()`, objective completion, run mode/state data.
- Produces:

```ts
export const EXPEDITION_SCORING_CONFIG: IceSlideModeScoringConfig = {
  objectiveStarBonus: 100,
  timeBudgetSeconds: 360,
  timeBonusPerSec: 5,
}
```

- [ ] **Step 1: Add failing scoring-config tests**

In `scoring.test.ts`:

```ts
it('uses Daily star value with a 360-second Expedition completion budget', () => {
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

Expected: FAIL because `EXPEDITION_SCORING_CONFIG` does not exist.

- [ ] **Step 3: Add the config without changing Campaign/Daily constants**

Add only the new exported constant beside `DAILY_SCORING_CONFIG`.

- [ ] **Step 4: Add failing game tests for Expedition stars and completion scoring**

Build an explicit small `mode: 'expedition'` run in `game.test.ts` using the existing stage-signature helper, then assert:

```ts
expect(result.stars.clear).toBe(true)
expect(result.stars.efficient).toBe(true)
expect(result.stars.bonus).toEqual({ id: 'no_reset', earned: true })
expect(result.stars.earnedCount).toBe(3)
expect(game.getState().starsEarned).toBe(3)
```

For a one-stage fixture completed at 300 elapsed seconds, assert the final Expedition score includes `timeBonus(300, EXPEDITION_SCORING_CONFIG) === 300`. Keep the existing Daily 300-second budget assertion and Campaign completion assertion in the same suite so regressions are visible together.

- [ ] **Step 5: Run game tests and verify RED**

```bash
bun run test:run -- src/lib/games/ice-slide/game.test.ts
```

Expected: Expedition currently behaves like Campaign for objectives/stars and therefore fails the new assertions.

- [ ] **Step 6: Generalize only the objective/scoring decisions in `clearLevel()`**

Use local mode predicates/config selection rather than a registry:

```ts
const isObjectiveMode =
  this.activeRun.mode === 'daily' || this.activeRun.mode === 'expedition'

const scoringConfig =
  this.activeRun.mode === 'daily'
    ? DAILY_SCORING_CONFIG
    : this.activeRun.mode === 'expedition'
      ? EXPEDITION_SCORING_CONFIG
      : SCORING_CONFIG
```

Then:

- read the stage bonus objective when `isObjectiveMode`;
- count Efficient + Bonus optional stars when `isObjectiveMode`;
- use `levelScore(scoringParams, scoringConfig)` for Daily/Expedition and preserve the existing Campaign call/semantics;
- increment `state.starsEarned` when `isObjectiveMode`;
- call `timeBonus(state.elapsedSeconds, scoringConfig)` on completion.

Do not read `templateId`, `mutationIds`, seed, or generator diagnostics in `game.ts`.

- [ ] **Step 7: Run scoring/game regression tests and verify GREEN**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/scoring.test.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.win.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
```

Expected: PASS; Campaign and Daily expectations remain unchanged.

- [ ] **Step 8: Commit Task 2**

```bash
git add \
  src/lib/games/ice-slide/scoring.ts \
  src/lib/games/ice-slide/scoring.test.ts \
  src/lib/games/ice-slide/game.ts \
  src/lib/games/ice-slide/game.test.ts
git commit -m "feat(ice-slide): score Expedition stars and completion"
```

---

### Task 3: Permit zero-score persistence only for explicit Expedition End submissions

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

- [ ] **Step 1: Add failing score-service tests**

Add a fetch/mock assertion for both default and opt-in zero behavior:

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
```

Also assert negative values never submit even when `allowZeroScore: true`.

- [ ] **Step 2: Run tests and verify RED**

```bash
bun run test:run -- src/lib/services/scoreService.test.ts
```

Expected: explicit zero still returns before fetch.

- [ ] **Step 3: Implement the narrow opt-in**

Replace the current `score <= 0` guard with:

```ts
if (score < 0 || (score === 0 && options?.allowZeroScore !== true)) {
  return
}
```

Do not change `submitScore()` or server validation; the server already accepts non-negative integer score 0.

- [ ] **Step 4: Re-run score-service tests and verify GREEN**

```bash
bun run test:run -- src/lib/services/scoreService.test.ts
```

Expected: PASS with all existing games retaining zero-score suppression.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib/services/scoreService.ts src/lib/services/scoreService.test.ts
git commit -m "feat(scores): allow explicit zero-score history rows"
```

---

### Task 4: Add browser seed capture, Retry Seed/New Expedition, and contextual Expedition submission

**Files:**
- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`

**Interfaces:**
- Consumes: `createIceSlideExpeditionRunDefinition()`, `cloneIceSlideRunDefinition()`, current run guard, score service, Daily lifecycle.
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

`createExpeditionSeed()` stays private to `init.ts`.

- [ ] **Step 1: Add failing start/retry/new-seed lifecycle tests**

Stub Web Crypto with two deterministic 4-word sequences:

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

- [ ] **Step 2: Add failing submission tests for completion and partial End**

Mock `saveGameScore` and assert Expedition uses:

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

For immediate End, assert the score argument is 0 and `gameData.solved === false`. For completion, assert `solved === true`. Add an `UNAUTHENTICATED` callback case that does not call `onError`.

- [ ] **Step 3: Run init tests and verify RED**

```bash
bun run test:run -- src/lib/games/ice-slide/init.test.ts
```

Expected: Expedition is not a playable mode and the new handle/lifecycle paths do not exist.

- [ ] **Step 4: Expand the playable-mode type and import the pure Expedition materializer**

Change only:

```ts
export type IceSlidePlayableMode = 'campaign' | 'daily' | 'expedition'
```

Import `createIceSlideExpeditionRunDefinition` into `init.ts`; do not expose generator internals to the page.

- [ ] **Step 5: Add private Web Crypto seed capture**

Implement exactly:

```ts
function createExpeditionSeed(): string {
  const words = new Uint32Array(4)
  crypto.getRandomValues(words)
  return Array.from(words, word => word.toString(16).padStart(8, '0')).join('')
}
```

No catch/fallback inside this helper. The caller's existing `try/catch -> failRun()` owns player-safe failure handling.

- [ ] **Step 6: Replace Daily-only retry state with a captured non-Campaign run snapshot**

Use:

```ts
let retryRun: IceSlideRunDefinition | null = null
```

Rules:

- Daily start clones its materialized run into `retryRun`.
- Expedition start creates one seed, materializes all six stages, clones into `retryRun`.
- Campaign start clears/ignores `retryRun` for retry semantics.
- `playAgain()` clones `retryRun` only when current mode is Daily or Expedition.
- `newExpedition()` invokes the same fresh Expedition start path and therefore captures a new seed.

Keep `dailyDateKey` Daily-only and reset it to `null` when starting Campaign/Expedition.

- [ ] **Step 7: Generalize stage-result overlays from Daily to objective modes**

In `onLevelClear`, return early only for Campaign. Daily and Expedition both:

- lock input and show `stage-clear-overlay` on non-final stages;
- populate the neutral final-star result on the final stage.

Do not add an Expedition-specific movement path; pointer/keyboard still call the same `game.move()` entry point.

- [ ] **Step 8: Submit contextual Expedition results on win and End**

In `submitScore()`:

- preserve Campaign unscoped options;
- preserve Daily `{ mode:'daily', competitionKey, rulesetVersion }`;
- add Expedition `{ mode:'expedition', rulesetVersion }` with `allowZeroScore: true`;
- allow score 0 to reach `saveGameScore` only for Expedition;
- suppress `UNAUTHENTICATED` for Daily and Expedition.

In `stop()` add a dedicated Expedition branch:

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

Daily End remains local-only. Campaign logic remains unchanged.

- [ ] **Step 9: Lock renderer recreation/failure/cleanup regressions**

Extend existing init tests to ensure a generated stage with different dimensions triggers `setupPixiJS` recreation after Continue, and a thrown Expedition materialization error leaves:

- `getGame() === null`;
- container empty;
- no stale pointer/keyboard handlers;
- stage/meta overlays hidden;
- Start restored.

Reuse existing renderer mocks and `failRun()` expectations rather than adding a new cleanup abstraction.

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

### Task 5: Ship the Expedition selector, HUD, result summary, Retry Seed, and New Expedition controls

**Files:**
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`
- Modify: `e2e/games/play-coverage.spec.ts`

**Interfaces:**
- Consumes: `IceSlidePlayableMode`, `IceSlideHandle.start()`, `playAgain()`, `newExpedition()`, `getGame().getState()/getGameData()`.
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

- [ ] **Step 1: Update markup tests first and verify RED**

Replace the old assertion that Expedition is absent with:

```ts
expect(iceSlideMarkup).toContain('value="expedition"')
expect(iceSlideMarkup).toContain('id="expedition-meta"')
expect(iceSlideMarkup).toContain('id="new-expedition-btn"')
expect(iceSlideMarkup).toContain('id="run-final-stage-result"')
```

Keep all existing Daily leaderboard IDs asserted.

Run:

```bash
bun run test:run -- src/pages/game-board-markup.test.ts
```

Expected: FAIL on missing Expedition selectors.

- [ ] **Step 2: Add the third mode radio without changing URL preselection**

Add the Expedition radio beside Campaign/Daily. Keep:

```ts
const selectedMode: IceSlidePlayableMode =
  requestedMode === 'daily' ? 'daily' : 'campaign'
```

This deliberately preserves the existing `?mode=expedition -> Campaign` behavior.

Update `readSelectedMode()` with an explicit three-way branch:

```ts
const value = modeRadios.find(radio => radio.checked)?.value
return value === 'daily'
  ? 'daily'
  : value === 'expedition'
    ? 'expedition'
    : 'campaign'
```

Do not introduce a mode registry.

- [ ] **Step 3: Add the Expedition HUD card**

Add a hidden `#expedition-meta` Card with seed, stage/tier, cumulative stars, falls/resets, and current Clear/Efficient/Bonus text. Continue using shared `#moves`, `#crystals`, `#time-remaining`, `#score`, and `#level` for common stats.

In `init.ts` `syncHud()`, show exactly one of Daily meta / Expedition meta based on `state.mode`. Use the fixed tier array by stage index rather than adding `difficulty` to `IceSlideState` solely for display.

- [ ] **Step 4: Neutralize the final three-star block**

Rename Daily-only final IDs to the `#run-final-*` IDs above. `populateFinalStageResult()` sets the heading based on mode and fills the same three rows for Daily/Expedition.

Update Daily unit/markup/E2E selectors in the same commit so there is no compatibility shim for the old private DOM IDs.

- [ ] **Step 5: Add Expedition final/End summary and action-state helper**

Add hidden `#expedition-summary` and `#new-expedition-btn` under final stats.

Create one page-local helper that reads the current game data/state after win/End and, only for Expedition:

- populates seed, `levelsCleared / 6`, stars, moves, crystals, falls/resets, elapsed time;
- shows `#expedition-summary` and New Expedition;
- changes `#play-again-btn` text to `Retry Seed`.

For Campaign/Daily idle/result states, hide Expedition summary/New Expedition and restore Play Again text.

Do not create a shared overlay component.

- [ ] **Step 6: Wire New Expedition and preserve Daily leaderboard isolation**

`#new-expedition-btn` click:

1. hides the current result overlay;
2. disables mode controls;
3. calls `gameHandle.newExpedition()`;
4. leaves Daily leaderboard hidden;
5. restores existing error/button behavior on rejection.

Mode changes and run starts call `leaderboardController.hide()` for Campaign/Expedition; only Daily loads a competition key.

- [ ] **Step 7: Re-run markup/unit tests and verify GREEN**

```bash
bun run test:run -- \
  src/pages/game-board-markup.test.ts \
  src/lib/games/ice-slide/init.test.ts
```

Expected: PASS.

- [ ] **Step 8: Add Playwright Expedition lifecycle coverage**

In the existing Ice Slide `test.describe`, add deterministic crypto initialization before navigation. Use `page.addInitScript()` to override `crypto.getRandomValues` with a queue of known `Uint32Array` words while delegating unrelated typed arrays to the native implementation.

Add tests that prove:

1. selecting Expedition + Start shows `#expedition-meta`, `Stage 1 / 6 · EASY`, six-stage state, and no Daily leaderboard;
2. End before any clear sends `/api/scores` with score `0`, `context.mode === 'expedition'`, no `competitionKey`, and `gameData.solved === false` when the request is mocked authenticated/successful;
3. after End, Play Again reads `Retry Seed`; clicking it preserves `#expedition-seed` and active run key;
4. End again + New Expedition consumes the second deterministic crypto value and changes seed/run identity;
5. Change Mode returns to idle with exactly three enabled radio inputs;
6. the existing `?mode=expedition` fallback test remains Campaign because URL preselection was intentionally not added.

For stage-clear input gating, use a deterministic generated stage route from the running game state and the production solver/path fixture pattern already used by Daily helpers; after a non-final clear, assert keyboard input does not change moves until `#stage-clear-continue-btn` is clicked.

- [ ] **Step 9: Run focused Ice Slide Playwright tests**

Run:

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Expected: all Campaign, Daily, leaderboard, and Expedition Ice Slide browser tests PASS.

- [ ] **Step 10: Commit Task 5**

```bash
git add \
  src/pages/ice-slide/index.astro \
  src/pages/game-board-markup.test.ts \
  e2e/games/play-coverage.spec.ts
git commit -m "feat(ice-slide): expose Expedition mode controls"
```

---

### Task 6: Run the complete HPA-490 regression and content-validation gates

**Files:**
- No planned production files.
- Any change discovered here must be limited to the HPA-490 files listed above and tied to a failing command from this task.

**Interfaces:**
- Consumes the completed feature.
- Produces verification evidence for PR review; no new API or abstraction.

- [ ] **Step 1: Run all Ice Slide unit tests**

```bash
bun run test:run -- src/lib/games/ice-slide
```

Expected: PASS.

- [ ] **Step 2: Re-run HPA-489's deep Expedition content validation**

```bash
bun run validate:ice-slide-expedition
```

Expected: all 1,000-seed-per-tier validation checks PASS with no invalid accepted stage. HPA-490 does not alter generator/template output.

- [ ] **Step 3: Run score-service and markup tests**

```bash
bun run test:run -- \
  src/lib/services/scoreService.test.ts \
  src/pages/game-board-markup.test.ts
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

Expected: all commands exit 0. The repository's current Codecov target is 90%; do not add a new HPA-490-specific coverage threshold.

- [ ] **Step 6: Run focused and full E2E**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
bun run test:e2e
```

Expected: PASS in the repository's configured E2E environment.

- [ ] **Step 7: Verify scope mechanically**

```bash
git diff --name-only main...HEAD
git grep -n "Math.random" -- src/lib/games/ice-slide/expedition.ts src/lib/games/ice-slide/init.ts
git diff main...HEAD -- \
  src/lib/server/db \
  src/pages/api/leaderboard.ts \
  src/lib/games/ice-slide/daily-leaderboard.ts
```

Expected:

- first command contains only the planned HPA-490 implementation/tests/docs;
- second command has no Expedition seed/generation use of `Math.random()`;
- third command is empty.

- [ ] **Step 8: Commit only verification-driven fixes, if any were required**

When Steps 1–7 are already green, do not create an empty verification commit. If a listed HPA-490 file required a concrete fix to make one of those commands pass, commit that tested fix with a message naming the corrected behavior.

---

## Plan self-review

- **Spec coverage:** six-stage assembly, deterministic Retry/New semantics, 2/2/2 tiers, objectives/stars, 360-second completion bonus, contextual complete/partial persistence including zero-score End, anonymous local behavior, leaderboard isolation, renderer recreation, overlays/input gating, Reset, cleanup, and submission failures all map to explicit tasks.
- **Placeholder scan:** no implementation step depends on TBD/TODO or an unspecified API.
- **Type consistency:** `IceSlidePlayableMode`, Expedition run identity helpers, `createIceSlideExpeditionRunDefinition()`, `EXPEDITION_SCORING_CONFIG`, `SaveScoreOptions.allowZeroScore`, and `IceSlideHandle.newExpedition()` use the same names across tasks.
- **Scope check:** HPA-491 Safe/Risky/Undo, HPA-492 snow, HPA-493 cracked ice, ranking calibration, seed sharing, history UI, and generic frameworks remain outside this plan.
