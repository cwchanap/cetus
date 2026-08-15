# Ice Slide Authored Mutation Templates and Bounded Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement HPA-489 as a deterministic, bounded one-stage Expedition generator backed by nine authored mutation templates, checked-in full-row fallbacks, solver/quality validation, and one reusable content-validation loop, without shipping Expedition gameplay/UI yet.

**Architecture:** Keep authored content in `templates.ts`, candidate retry/fallback policy in `generator.ts`, and extend the existing pure `quality.ts` only with the two missing authored constraints. Validate a materialized board first with `objectiveIds: []`, then choose one bonus objective from the returned feasibility map, matching Daily. HPA-490 later owns random seed creation, six-stage assembly, Retry Seed/New Expedition, browser lifecycle, and persistence.

**Tech Stack:** Astro 5 repository, TypeScript 6, Bun 1.3, Vitest 3, existing Ice Slide FNV-1a/Mulberry32 RNG, board transforms, bounded BFS solver, and stage-quality validator.

## Global constraints

- HPA-489 materializes one `IceSlideStageDefinition` at a time; it does not build an `IceSlideRunDefinition` or expose Expedition in the browser.
- Ship exactly nine generator-v1 templates: three easy, three medium, three hard, plus one independent full-row fallback per template.
- `baseRows` contain only `#`, `.`, and exactly one `S`; goals/rocks/hazards/crystals come only from named authored alternatives.
- Select one complete authored pattern for rocks, hazards, and crystals; no arbitrary subsets.
- Transform static rows and all slot coordinates with `transformRows()` / `transformPosition()` before mutation placement. Do not use `getUniqueBoardTransforms()`.
- Generation order is fixed: template → transform → transformed slots → mutations → rows → quality with no objective → feasible objective pick → accept/retry.
- Accepted stage metadata records template ID, transform, mutation IDs, rows, computed par, one objective, `10_000` multiplier basis points, and signature.
- Candidate generation is capped at exactly 64 attempts; every solver call is capped at exactly 10,000 states.
- On 64 candidate rejections, try the requested tier's three full-row fallbacks in deterministic seeded order. Return fallback metadata; do not log from the generator.
- If no fallback is valid and non-duplicate, throw; no emergency board and no unbounded retry.
- `Math.random()` and `crypto.getRandomValues()` are forbidden in HPA-489 generation.
- Campaign levels, Daily pools/output, `IceSlidePlayableMode`, score APIs, database, UI, and `ICE_SLIDE_RULESET_VERSION` remain unchanged.
- Generator/content changes that alter same-input output require a future `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION` bump.
- Exact template rows, slots, constraints, and fallback rows come from `docs/superpowers/specs/2026-08-14-ice-slide-expedition-generation-design.md` §§6–7.

---

## File structure

### Create

- `src/lib/games/ice-slide/templates.ts` — authoring contracts, nine templates, nine independent fallbacks, compact catalog assertions/lookups.
- `src/lib/games/ice-slide/templates.test.ts` — structural catalog tests and independent fallback quality checks.
- `src/lib/games/ice-slide/generator.ts` — deterministic one-stage materialization, bounded retry, fallback selection, generation metadata.
- `src/lib/games/ice-slide/generator.test.ts` — determinism, transformed slots, collisions, duplicate handling, 64-attempt/fallback behavior, explicit generator-v1 goldens.
- `src/lib/games/ice-slide/generator.validation.test.ts` — invokes the shared validator at 100 seeds per tier.
- `scripts/validate-ice-slide-expedition.ts` — exports the shared validation loop and runs it at 1,000 seeds per tier when executed directly.

### Modify

- `src/lib/games/ice-slide/quality.ts`
- `src/lib/games/ice-slide/quality.test.ts`
- `package.json`

### Explicitly unchanged

- `src/lib/games/ice-slide/levels.ts`
- `src/lib/games/ice-slide/daily.ts`
- `src/lib/games/ice-slide/game.ts`
- `src/lib/games/ice-slide/init.ts`
- `src/lib/games/ice-slide/renderer.ts`
- `src/pages/ice-slide/index.astro`
- score/database/leaderboard code

---

### Task 1: Extend stage quality with authored stop/hazard constraints

**Files:**
- Modify: `src/lib/games/ice-slide/quality.ts`
- Modify: `src/lib/games/ice-slide/quality.test.ts`

**Produces:**

```ts
export interface IceSlideStageQualityConstraints {
    parBand: { minMoves: number; maxMoves: number }
    maxStates: number
    existingCanonicalKeys?: ReadonlySet<string>
    minReachableStops?: number
    maxHazards?: number
}

export type IceSlideStageRejectionReason =
    | 'invalid_board'
    | 'duplicate_board'
    | 'solver_truncated'
    | 'unsolvable'
    | 'par_out_of_band'
    | 'reachable_stops_below_min'
    | 'too_many_hazards'
    | 'objective_infeasible'
```

- [ ] **Step 1: Add failing constraint-bound tests**

Use the existing valid fixture in `quality.test.ts`:

```ts
expect(() =>
    validateIceSlideStageQuality(
        { id: 'valid', rows: SIMPLE_ROWS, objectiveIds: [] },
        {
            parBand: { minMoves: 1, maxMoves: 10 },
            maxStates: 10_000,
            minReachableStops: 1,
            maxHazards: 0,
        }
    )
).not.toThrow()

for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
        validateIceSlideStageQuality(candidate, {
            parBand: { minMoves: 1, maxMoves: 10 },
            maxStates: 10_000,
            minReachableStops: value,
        })
    ).toThrow(RangeError)
}

for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
        validateIceSlideStageQuality(candidate, {
            parBand: { minMoves: 1, maxMoves: 10 },
            maxStates: 10_000,
            maxHazards: value,
        })
    ).toThrow(RangeError)
}
```

- [ ] **Step 2: Run the focused test red**

```bash
bun run test:run -- src/lib/games/ice-slide/quality.test.ts
```

Expected: FAIL because the optional constraints/rejection reasons do not exist.

- [ ] **Step 3: Validate the optional fields**

Add to `validateConstraints()`:

```ts
if (
    constraints.minReachableStops !== undefined &&
    (!Number.isSafeInteger(constraints.minReachableStops) ||
        constraints.minReachableStops < 1)
) {
    throw new RangeError('minReachableStops must be a positive safe integer')
}

if (
    constraints.maxHazards !== undefined &&
    (!Number.isSafeInteger(constraints.maxHazards) || constraints.maxHazards < 0)
) {
    throw new RangeError('maxHazards must be a non-negative safe integer')
}
```

Do not give either field a default; `undefined` preserves current Daily semantics.

- [ ] **Step 4: Add failing rejection-order tests**

Lock both reasons and ordering:

```ts
expect(validateIceSlideStageQuality(candidate, {
    parBand: { minMoves: 1, maxMoves: 20 },
    maxStates: 10_000,
    minReachableStops: 999,
})).toMatchObject({ accepted: false, reason: 'reachable_stops_below_min' })

expect(validateIceSlideStageQuality(hazardCandidate, {
    parBand: { minMoves: 1, maxMoves: 20 },
    maxStates: 10_000,
    maxHazards: 0,
})).toMatchObject({ accepted: false, reason: 'too_many_hazards' })

expect(validateIceSlideStageQuality(parOutOfBandCandidate, {
    parBand: { minMoves: 99, maxMoves: 100 },
    maxStates: 10_000,
    minReachableStops: 999,
    maxHazards: 0,
})).toMatchObject({ accepted: false, reason: 'par_out_of_band' })
```

Also keep one direct `objective_infeasible` test so the quality API retains that behavior independently of the generator.

- [ ] **Step 5: Implement post-solver checks using existing facts**

Immediately after the current par-band check and before objective feasibility:

```ts
if (
    constraints.minReachableStops !== undefined &&
    solveResult.reachableStopCount < constraints.minReachableStops
) {
    return {
        accepted: false,
        reason: 'reachable_stops_below_min',
        message:
            `reachable stops ${solveResult.reachableStopCount} below minimum ` +
            `${constraints.minReachableStops}`,
        canonicalKey,
        solveResult,
    }
}

const hazardCount = countGlyphs(candidate.rows, 'H')
if (
    constraints.maxHazards !== undefined &&
    hazardCount > constraints.maxHazards
) {
    return {
        accepted: false,
        reason: 'too_many_hazards',
        message: `hazards ${hazardCount} exceed maximum ${constraints.maxHazards}`,
        canonicalKey,
        solveResult,
    }
}

const hasHazard = hazardCount > 0
```

Reuse the existing private `countGlyphs()`; do not add another scanner.

- [ ] **Step 6: Run quality + Daily regressions**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/daily.test.ts
```

Expected: PASS, including unchanged Daily golden output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/ice-slide/quality.ts src/lib/games/ice-slide/quality.test.ts
git commit -m "feat(ice-slide): extend generated stage quality constraints"
```

---

### Task 2: Add nine authored templates and nine independent fallbacks

**Files:**
- Create: `src/lib/games/ice-slide/templates.ts`
- Create: `src/lib/games/ice-slide/templates.test.ts`

**Produces:**

```ts
export type IceSlideTemplateDifficulty = Exclude<
    IceSlideDifficulty,
    'tutorial'
>

export interface IceSlideNamedPosition {
    id: string
    position: GridPosition
}

export interface IceSlideNamedPositionPattern {
    id: string
    positions: GridPosition[]
}

export interface IceSlideTemplate {
    id: string
    name: string
    difficulty: IceSlideTemplateDifficulty
    baseRows: string[]
    allowedTransforms: BoardTransform[]
    slots: {
        goals: IceSlideNamedPosition[]
        rocks: IceSlideNamedPositionPattern[]
        hazards: IceSlideNamedPositionPattern[]
        crystals: IceSlideNamedPositionPattern[]
    }
    constraints: {
        parBand: { minMoves: number; maxMoves: number }
        minReachableStops: number
        maxHazards: number
    }
    fallbackVariantId: string
}

export interface IceSlideTemplateFallback {
    id: string
    templateId: string
    difficulty: IceSlideTemplateDifficulty
    rows: string[]
}

export const ICE_SLIDE_EXPEDITION_TEMPLATES: readonly IceSlideTemplate[]
export const ICE_SLIDE_EXPEDITION_FALLBACKS: readonly IceSlideTemplateFallback[]
export function getIceSlideTemplatesByDifficulty(
    difficulty: IceSlideTemplateDifficulty
): readonly IceSlideTemplate[]
export function getIceSlideFallback(
    fallbackId: string
): IceSlideTemplateFallback
export function assertValidIceSlideTemplateCatalog(): void
```

- [ ] **Step 1: Write failing identity/count tests**

```ts
expect(
    ICE_SLIDE_EXPEDITION_TEMPLATES.map(template => [
        template.difficulty,
        template.id,
        template.fallbackVariantId,
    ])
).toEqual([
    ['easy', 'easy-open-lane', 'easy-open-lane-v1'],
    ['easy', 'easy-corner-pocket', 'easy-corner-pocket-v1'],
    ['easy', 'easy-bank-shot', 'easy-bank-shot-v1'],
    ['medium', 'medium-thin-ice', 'medium-thin-ice-v1'],
    ['medium', 'medium-crystal-cache', 'medium-crystal-cache-v1'],
    ['medium', 'medium-fracture-zone', 'medium-fracture-zone-v1'],
    ['hard', 'hard-deep-freeze', 'hard-deep-freeze-v1'],
    ['hard', 'hard-absolute-zero', 'hard-absolute-zero-v1'],
    ['hard', 'hard-zero-cross', 'hard-zero-cross-v1'],
])

expect(ICE_SLIDE_EXPEDITION_FALLBACKS.map(item => item.id)).toEqual([
    'easy-open-lane-v1',
    'easy-corner-pocket-v1',
    'easy-bank-shot-v1',
    'medium-thin-ice-v1',
    'medium-crystal-cache-v1',
    'medium-fracture-zone-v1',
    'hard-deep-freeze-v1',
    'hard-absolute-zero-v1',
    'hard-zero-cross-v1',
])
```

Also assert each tier has exactly three templates.

- [ ] **Step 2: Run the template test red**

```bash
bun run test:run -- src/lib/games/ice-slide/templates.test.ts
```

Expected: FAIL because `templates.ts` does not exist.

- [ ] **Step 3: Add exact contracts/content from design §§6–7**

Copy the nine `baseRows`, slot IDs/coordinates, constraints, and nine fallback row literals exactly. Use:

```ts
allowedTransforms: [...BOARD_TRANSFORMS]
```

Do not import `ICE_SLIDE_LEVELS` and do not derive fallbacks from Campaign at runtime.

- [ ] **Step 4: Write failing structural-validation tests**

Test the real catalog plus representative invalid clones. Cover:

- duplicate/empty IDs;
- non-rectangular/empty rows;
- zero or multiple `S`;
- forbidden `G/O/H/C` in `baseRows`;
- empty/duplicate transform list;
- no goal or missing pattern category;
- out-of-bounds/non-ice slot;
- duplicate coordinates inside one pattern;
- invalid par band/stop floor/hazard ceiling;
- missing/mismatched fallback.

A narrow exported helper is sufficient if needed:

```ts
export function assertValidIceSlideTemplate(
    template: IceSlideTemplate,
    fallbacks: readonly IceSlideTemplateFallback[]
): void
```

No registry/class/Zod schema.

- [ ] **Step 5: Implement compact Set/loop assertions**

Call `assertValidIceSlideTemplateCatalog()` once after the checked-in constants are defined so malformed authored content fails loudly in development/test.

- [ ] **Step 6: Independently validate every fallback**

```ts
for (const fallback of ICE_SLIDE_EXPEDITION_FALLBACKS) {
    const template = ICE_SLIDE_EXPEDITION_TEMPLATES.find(
        item => item.id === fallback.templateId
    )!

    const result = validateIceSlideStageQuality(
        { id: fallback.id, rows: fallback.rows, objectiveIds: [] },
        {
            parBand: template.constraints.parBand,
            maxStates: 10_000,
            minReachableStops: template.constraints.minReachableStops,
            maxHazards: template.constraints.maxHazards,
        }
    )

    expect(result, fallback.id).toMatchObject({ accepted: true })
}
```

Do not write a second start/goal parser; this production quality/solver path already validates shape.

- [ ] **Step 7: Run template + quality tests**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/templates.test.ts \
  src/lib/games/ice-slide/quality.test.ts
```

Expected: PASS. If a fallback fails its documented band/stops/hazard constraint, retune the literal or constraint in both the design and code rather than weakening the global gate.

- [ ] **Step 8: Commit**

```bash
git add \
  src/lib/games/ice-slide/templates.ts \
  src/lib/games/ice-slide/templates.test.ts
git commit -m "feat(ice-slide): add expedition mutation templates"
```

---

### Task 3: Implement bounded one-stage generation and fallback

**Files:**
- Create: `src/lib/games/ice-slide/generator.ts`
- Create: `src/lib/games/ice-slide/generator.test.ts`

**Produces:**

```ts
export const ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 1
export const ICE_SLIDE_EXPEDITION_MAX_ATTEMPTS = 64
export const ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES = 10_000

export type IceSlideGenerationRejectionReason =
    | IceSlideStageRejectionReason
    | 'materialization_collision'

export interface IceSlideGeneratedStage {
    stage: IceSlideStageDefinition
    canonicalKey: string
    attempts: number
    usedFallback: boolean
    rejectionCounts: Readonly<
        Partial<Record<IceSlideGenerationRejectionReason, number>>
    >
}

export function createIceSlideExpeditionStage(input: {
    seed: string
    stageNumber: number
    difficulty: IceSlideTemplateDifficulty
    existingCanonicalKeys?: ReadonlySet<string>
}): IceSlideGeneratedStage
```

- [ ] **Step 1: Write failing input/determinism/random-source tests**

```ts
expect(() =>
    createIceSlideExpeditionStage({
        seed: '',
        stageNumber: 1,
        difficulty: 'easy',
    })
).toThrow(RangeError)

for (const stageNumber of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
        createIceSlideExpeditionStage({
            seed: 'ice-slide:test',
            stageNumber,
            difficulty: 'easy',
        })
    ).toThrow(RangeError)
}

const input = {
    seed: 'ice-slide:expedition:test:v1',
    stageNumber: 1,
    difficulty: 'easy' as const,
}
expect(createIceSlideExpeditionStage(input)).toEqual(
    createIceSlideExpeditionStage(input)
)
```

Patch `Math.random()` to throw and assert generation still succeeds; production `generator.ts` must have no `crypto` import.

- [ ] **Step 2: Run generator tests red**

```bash
bun run test:run -- src/lib/games/ice-slide/generator.test.ts
```

Expected: FAIL on the missing module/exports.

- [ ] **Step 3: Add local transformed-slot/materialization helpers**

Use plain functions, not a generator class:

```ts
interface TransformedTemplateSlots {
    goals: IceSlideNamedPosition[]
    rocks: IceSlideNamedPositionPattern[]
    hazards: IceSlideNamedPositionPattern[]
    crystals: IceSlideNamedPositionPattern[]
}

type MaterializeResult =
    | { ok: true; rows: string[] }
    | { ok: false; reason: 'materialization_collision' }
```

Transform positions against original `baseRows.length` / `baseRows[0].length`, and materialize onto `transformRows(template.baseRows, transform)` in goal → rocks → hazards → crystals order. Only `.` may be replaced. `none=[]` writes nothing.

- [ ] **Step 4: Add failing transformed-slot/complete-pattern tests**

Prefer public-path tests through frozen seeds rather than exporting production-only helper APIs. Assert at least one non-identity result and a result containing `crystals:pair` has exactly two `C` cells.

- [ ] **Step 5: Implement the frozen candidate RNG tree**

```ts
const stageRng = createSeededRng(input.seed)
    .fork(`expedition:g${ICE_SLIDE_EXPEDITION_GENERATOR_VERSION}`)
    .fork(`stage:${input.stageNumber}`)
```

For attempts 1 through 64:

```ts
const attemptRng = stageRng.fork(`attempt:${attempt}`)
const template = attemptRng
    .fork('template')
    .pick(getIceSlideTemplatesByDifficulty(input.difficulty))
const transform = attemptRng
    .fork('transform')
    .pick(template.allowedTransforms)
```

Then transform slots and pick:

```ts
const goal = attemptRng.fork('goal').pick(slots.goals)
const rocks = attemptRng.fork('rocks').pick(slots.rocks)
const hazards = attemptRng.fork('hazards').pick(slots.hazards)
const crystals = attemptRng.fork('crystals').pick(slots.crystals)
```

On materialization collision, increment only `materialization_collision` and continue.

Validate the board **before** objective choice:

```ts
const quality = validateIceSlideStageQuality(
    {
        id: `${template.id}:attempt:${attempt}`,
        rows,
        objectiveIds: [],
    },
    {
        parBand: template.constraints.parBand,
        maxStates: ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
        existingCanonicalKeys: input.existingCanonicalKeys,
        minReachableStops: template.constraints.minReachableStops,
        maxHazards: template.constraints.maxHazards,
    }
)
```

If rejected, increment `quality.reason` and continue.

After acceptance:

```ts
const OBJECTIVE_ORDER = [
    'collect_all_crystals',
    'no_falls',
    'no_reset',
] as const

const eligibleObjectives = OBJECTIVE_ORDER.filter(
    objectiveId => quality.objectiveFeasibility[objectiveId]
)
const objectiveId = attemptRng.fork('objective').pick(eligibleObjectives)
```

Do not export Daily's private constant or introduce a shared objective-selection service. `no_reset` guarantees a non-empty list for every accepted board.

- [ ] **Step 6: Build accepted stage metadata**

Use one local `buildStage()` helper shared by candidate/fallback success. Candidate mutation IDs are exactly:

```ts
[goal.id, rocks.id, hazards.id, crystals.id]
```

Return `attempts: attempt`, `usedFallback: false`, accepted `canonicalKey`, and a defensive closed-union rejection-count copy.

- [ ] **Step 7: Add duplicate-board coverage**

```ts
const first = createIceSlideExpeditionStage(input)
const existing = new Set([first.canonicalKey])
const second = createIceSlideExpeditionStage({
    ...input,
    existingCanonicalKeys: existing,
})

expect(second.canonicalKey).not.toBe(first.canonicalKey)
expect(existing).toEqual(new Set([first.canonicalKey]))
```

The second call may accept a later candidate or fallback.

- [ ] **Step 8: Implement deterministic fallback after exactly 64 failures**

Resolve each tier template's full-row fallback, then shuffle:

```ts
const fallbackOrder = stageRng
    .fork('fallback')
    .shuffle(tierTemplates.map(template => ({
        template,
        fallback: getIceSlideFallback(template.fallbackVariantId),
    })))
```

For each fallback, validate first with `objectiveIds: []` and owning template constraints. Only after `quality.accepted` choose:

```ts
const objectiveId = stageRng
    .fork(`fallback:${fallback.id}:objective`)
    .pick(
        OBJECTIVE_ORDER.filter(
            id => quality.objectiveFeasibility[id]
        )
    )
```

Build the fallback stage with `transform: 'identity'` and `mutationIds: [`fallback:${fallback.id}`]`; return `usedFallback: true`, `attempts: 64`, and rejection metadata.

Do **not** call `console.warn` or accept a logger dependency. If all fallbacks reject:

```ts
throw new Error(
    `Ice Slide Expedition stage ${input.stageNumber} (${input.difficulty}) ` +
        'has no valid generated candidate or fallback'
)
```

- [ ] **Step 9: Test 64-reject/fallback behavior with Vitest module mocking only**

Mock `validateIceSlideStageQuality` so candidate calls 1–64 return one stable rejection, then delegate fallback calls to the real validator. Assert:

```ts
expect(result.usedFallback).toBe(true)
expect(result.attempts).toBe(64)
expect(result.stage.transform).toBe('identity')
expect(result.stage.mutationIds[0]).toMatch(/^fallback:/)
expect(validateMock).toHaveBeenCalledTimes(65)
```

Also assert rejection counts and fallback objective feasibility. There is no warn spy.

For the hard-failure case, reject every validator call and assert the candidate loop stops at 64 before the finite three-fallback list is exhausted. Do not add injectable validator/RNG/logger seams.

- [ ] **Step 10: Lock explicit generator-v1 goldens — no snapshots**

For these three seeds, assert the listed fields inline. These values freeze the validate-first objective contract and the current catalog/fork ordering.

```ts
expect(projectStage(createIceSlideExpeditionStage({
    seed: 'ice-slide:hpa-489:v1:easy',
    stageNumber: 1,
    difficulty: 'easy',
}))).toEqual({
    rows: [
        '#####',
        '#.C.#',
        '#H.G#',
        '#S..#',
        '#####',
    ],
    transform: 'reflect_horizontal',
    mutationIds: [
        'goal:east',
        'rocks:none',
        'hazards:west',
        'crystals:south-mid',
    ],
    objectiveIds: ['no_falls'],
    parMoves: 2,
    signature: 'is2-4c1bb3e2',
})

expect(projectStage(createIceSlideExpeditionStage({
    seed: 'ice-slide:hpa-489:v1:medium',
    stageNumber: 3,
    difficulty: 'medium',
}))).toEqual({
    rows: [
        '########',
        '#..#..S#',
        '#H....##',
        '#..#.#.#',
        '#......#',
        '#..#...#',
        '#G.....#',
        '########',
    ],
    transform: 'rotate_90',
    mutationIds: [
        'goal:southeast',
        'rocks:none',
        'hazards:southwest',
        'crystals:none',
    ],
    objectiveIds: ['no_falls'],
    parMoves: 3,
    signature: 'is2-cadf4ffb',
})

expect(projectStage(createIceSlideExpeditionStage({
    seed: 'ice-slide:hpa-489:v1:hard',
    stageNumber: 5,
    difficulty: 'hard',
}))).toEqual({
    rows: [
        '#########',
        '#.......#',
        '#.#...#.#',
        '#G......#',
        '##..H..##',
        '#...O...#',
        '#.#.#...#',
        '#.....#S#',
        '#########',
    ],
    transform: 'rotate_90',
    mutationIds: [
        'goal:south-mid',
        'rocks:center-east',
        'hazards:center',
        'crystals:none',
    ],
    objectiveIds: ['no_reset'],
    parMoves: 5,
    signature: 'is2-3a9b2699',
})
```

`projectStage()` is a test-local projection selecting exactly `rows`, `transform`, `mutationIds`, `objectiveIds`, `parMoves`, and `signature`.

Also keep:

```ts
const first = createIceSlideExpeditionStage(input)
const second = createIceSlideExpeditionStage(input)
expect(JSON.stringify(second)).toBe(JSON.stringify(first))
```

Do not create `__snapshots__` or use `toMatchSnapshot()`.

- [ ] **Step 11: Run focused generator regressions**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/generator.test.ts \
  src/lib/games/ice-slide/templates.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/run.test.ts
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add \
  src/lib/games/ice-slide/generator.ts \
  src/lib/games/ice-slide/generator.test.ts
git commit -m "feat(ice-slide): add bounded expedition stage generation"
```

---

### Task 4: Reuse one validation loop at 100 and 1,000 seeds per tier

**Files:**
- Create: `src/lib/games/ice-slide/generator.validation.test.ts`
- Create: `scripts/validate-ice-slide-expedition.ts`
- Modify: `package.json`

**Produces:**

```ts
export interface IceSlideExpeditionValidationStats {
    difficulty: IceSlideTemplateDifficulty
    seeds: number
    stageCount: number
    totalAttempts: number
    fallbacks: number
    rejectionCounts: Partial<
        Record<IceSlideGenerationRejectionReason, number>
    >
    worstExploredStates: number
}

export function runIceSlideExpeditionValidation(options: {
    seedsPerTier: number
    onStage?: (stage: IceSlideGeneratedStage) => void
}): IceSlideExpeditionValidationStats[]
```

The function lives in `scripts/validate-ice-slide-expedition.ts`; the Vitest file imports it. Keep CLI execution behind a main-module guard so importing the helper does not print or trigger the 1,000-seed sweep.

- [ ] **Step 1: Write the 100-seed smoke test against the shared helper**

```ts
import { runIceSlideExpeditionValidation } from '../../../../scripts/validate-ice-slide-expedition'

it('validates 100 deterministic seeds per tier', () => {
    const summaries = runIceSlideExpeditionValidation({ seedsPerTier: 100 })

    expect(summaries.map(item => [
        item.difficulty,
        item.seeds,
        item.stageCount,
    ])).toEqual([
        ['easy', 100, 200],
        ['medium', 100, 200],
        ['hard', 100, 200],
    ])
})
```

- [ ] **Step 2: Run the smoke test red**

```bash
bun run test:run -- src/lib/games/ice-slide/generator.validation.test.ts
```

Expected: FAIL because the script/helper does not exist.

- [ ] **Step 3: Implement the one validation loop**

Use exactly:

```ts
const TIER_STAGES = {
    easy: [1, 2],
    medium: [3, 4],
    hard: [5, 6],
} as const
```

For each difficulty and index from `0` through `seedsPerTier - 1`, derive:

```ts
const seed =
    `ice-slide:validate:v1:${difficulty}:` +
    String(index).padStart(4, '0')
```

Generate stage 1, then stage 2 with stage 1's canonical key in `existingCanonicalKeys`. For each generated stage, resolve the owning template and:

1. call `validateIceSlideStageQuality()` using `stage.stage.objectiveIds`, owner par/stops/hazard constraints, and the appropriate prior canonical Set;
2. throw if rejected or `quality.parMoves !== stage.stage.parMoves`;
3. call `solveIceSlideBoard(stage.stage, { maxStates: 10_000 })` and throw if truncated/unsolvable;
4. regenerate with identical input and throw unless `JSON.stringify()` is byte-identical;
5. throw if the same-tier pair has duplicate canonical keys;
6. fold attempts, fallback count, `stage.rejectionCounts`, and explored states into the closed-union stats;
7. invoke `onStage?.(stage)` after all invariants pass.

Error messages include difficulty, seed index, stage number, template ID, and invariant name. Stop on the first corrupted result; do not swallow errors.

Sort rejection keys only when formatting CLI output. The internal type remains:

```ts
Partial<Record<IceSlideGenerationRejectionReason, number>>
```

- [ ] **Step 4: Add the CLI wrapper and package script**

When executed directly:

```ts
const summaries = runIceSlideExpeditionValidation({ seedsPerTier: 1_000 })
for (const summary of summaries) {
    console.log(JSON.stringify({
        ...summary,
        rejectionCounts: Object.fromEntries(
            Object.entries(summary.rejectionCounts).sort(([a], [b]) =>
                a.localeCompare(b)
            )
        ),
    }))
}
```

Add only:

```json
"validate:ice-slide-expedition": "bun scripts/validate-ice-slide-expedition.ts"
```

No new Actions workflow.

- [ ] **Step 5: Run both depths**

```bash
bun run test:run -- src/lib/games/ice-slide/generator.validation.test.ts
bun run validate:ice-slide-expedition
```

Expected:

- Vitest exits 0 after 300 seeds / 600 generated stages;
- CLI exits 0 after 3,000 seeds / 6,000 generated stages;
- CLI prints one deterministic JSON line for easy, medium, hard;
- no invalid accepted board, objective mismatch, duplicate pair, truncation, or nondeterministic regeneration.

There is no rejection/fallback-rate SLA.

- [ ] **Step 6: Commit**

```bash
git add \
  src/lib/games/ice-slide/generator.validation.test.ts \
  scripts/validate-ice-slide-expedition.ts \
  package.json
git commit -m "test(ice-slide): validate expedition generator content"
```

---

### Task 5: Run full regression gates and verify HPA-489 boundaries

**Files:**
- No new production files expected.
- Modify only Task 1–4 files if a gate reveals a real HPA-489 defect.

- [ ] **Step 1: Run all Ice Slide unit tests**

```bash
bun run test:run -- src/lib/games/ice-slide
```

Expected: PASS, including unchanged Daily goldens and Campaign/run/solver regressions.

- [ ] **Step 2: Run the full unit suite**

```bash
bun run test:run
```

Expected: PASS.

- [ ] **Step 3: Run static/build gates**

```bash
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Expected: all exit 0. If formatting is the only failure, format intended files, inspect the diff, and rerun.

- [ ] **Step 4: Run the 1,000-seed-per-tier validator again**

```bash
bun run validate:ice-slide-expedition
```

Expected: exit 0. Put the three summary lines in the implementation PR description; do not convert current rates into thresholds.

- [ ] **Step 5: Verify changed-path scope**

```bash
git diff --name-only main...HEAD
```

Expected implementation paths are limited to:

```text
src/lib/games/ice-slide/quality.ts
src/lib/games/ice-slide/quality.test.ts
src/lib/games/ice-slide/templates.ts
src/lib/games/ice-slide/templates.test.ts
src/lib/games/ice-slide/generator.ts
src/lib/games/ice-slide/generator.test.ts
src/lib/games/ice-slide/generator.validation.test.ts
scripts/validate-ice-slide-expedition.ts
package.json
```

plus the approved design/plan docs if implementation starts from this branch. There must be no snapshot file and no `game.ts`, `init.ts`, page, DB, score, leaderboard, `levels.ts`, or `daily.ts` production change.

- [ ] **Step 6: Commit only real gate-driven cleanup if needed**

```bash
git add <only-files-fixed-for-verification>
git commit -m "test(ice-slide): finalize expedition generator verification"
```

Do not create an empty cleanup commit.

---

## Plan self-review

- **Spec coverage:** Tasks 1–4 cover the catalog/fallbacks, transform-then-place, validate-first objective selection, exact 64/10k bounds, duplicate handling, signatures, deterministic fallback metadata, explicit v1 goldens, and one shared 100/1,000-seed validation loop.
- **Placeholder scan:** no TODO/TBD, snapshot-generation step, logger seam, or duplicated validator loop remains.
- **Type consistency:** `IceSlideGenerationRejectionReason` is closed and every `rejectionCounts` consumer uses `Partial<Record<IceSlideGenerationRejectionReason, number>>`.
- **Generator-version contract:** objective RNG is consumed only after a board/fallback passes quality; changing the inline goldens requires an intentional version decision.
- **Scope check:** HPA-490 retains full-run assembly, random seed creation, UI, Retry Seed/New Expedition, and persistence.
- **YAGNI:** no generator class, logger injection, registry, JSON schema, editor, worker, cache, or generic cross-game abstraction.
