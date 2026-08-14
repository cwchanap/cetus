# Ice Slide Authored Mutation Templates and Bounded Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement HPA-489 as a deterministic, bounded one-stage Expedition generator backed by nine authored mutation templates, checked-in full-row fallbacks, solver/quality validation, and reproducible content-validation tooling, without shipping Expedition gameplay/UI yet.

**Architecture:** Keep authored content in `templates.ts`, keep candidate retry/fallback policy in `generator.ts`, and extend the existing pure `quality.ts` only with the two missing authored constraints. HPA-490 will later assemble six returned stages into a run and own seed creation, Retry Seed/New Expedition, browser lifecycle, and persistence; HPA-489 never reaches into game/init/page/database code.

**Tech Stack:** Astro 5 repository, TypeScript 6, Bun 1.3, Vitest 3, existing Ice Slide FNV-1a/Mulberry32 seeded RNG, board transforms, bounded BFS solver, and stage-quality validator.

## Global Constraints

- HPA-489 materializes one `IceSlideStageDefinition` at a time; it does not build an `IceSlideRunDefinition` or expose Expedition in the browser.
- Ship exactly nine generator-v1 templates: three easy, three medium, three hard, plus one complete checked-in fallback per template.
- `baseRows` contain only `#`, `.`, and exactly one `S`; goals/rocks/hazards/crystals are selected only from named authored alternatives.
- One complete authored pattern is selected independently for rocks, hazards, and crystals; no arbitrary subset placement.
- Transform static rows and all slot coordinates before selecting/materializing mutations.
- Generation order is fixed: template → transform → transformed slots → mutations → rows → objective → solve/validate → accept/retry.
- Accepted stage metadata records template ID, transform, category-prefixed mutation IDs, final rows, computed par, objective, `10_000` multiplier basis points, and signature.
- Candidate generation is capped at exactly 64 attempts per stage; each solver call is capped at exactly 10,000 states.
- On 64 candidate rejections, try the requested tier's checked-in full-row fallbacks in deterministic seeded order and warn once on fallback use.
- If no fallback is valid and non-duplicate, throw; do not invent an emergency board or unbounded retry.
- `Math.random()` and `crypto.getRandomValues()` are forbidden in HPA-489 generation. HPA-490 owns one-time random Expedition seed creation.
- Existing Campaign levels, Daily pools/output, `IceSlidePlayableMode`, score APIs, database, UI, and `ICE_SLIDE_RULESET_VERSION` remain unchanged.
- Generator/content changes that alter same-seed output require a future `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION` bump.
- The implementation source of truth for exact template rows, slot coordinates, constraints, and fallback rows is `docs/superpowers/specs/2026-08-14-ice-slide-expedition-generation-design.md` §§6–7; copy those literals exactly rather than deriving them from Campaign content at runtime.

---

## File Structure

### Create

- `src/lib/games/ice-slide/templates.ts` — template-only contracts, nine authored templates, nine independent full-row fallbacks, static-content assertions, and tier/fallback lookup helpers.
- `src/lib/games/ice-slide/templates.test.ts` — structural catalog tests plus independent solver/quality checks for every fallback.
- `src/lib/games/ice-slide/generator.ts` — deterministic one-stage candidate materialization, bounded retry loop, fallback selection, diagnostic metadata.
- `src/lib/games/ice-slide/generator.test.ts` — deterministic output, transform/slot handling, collision, duplicate, attempt-cap, fallback, warning, signature, and random-source tests.
- `src/lib/games/ice-slide/generator.validation.test.ts` — normal-CI 100-seed-per-tier smoke sweep using two same-tier stage slots per seed.
- `scripts/validate-ice-slide-expedition.ts` — 1,000-seed-per-tier content validation and tuning report.

### Modify

- `src/lib/games/ice-slide/quality.ts` — optional reachable-stop floor and hazard ceiling plus closed rejection reasons.
- `src/lib/games/ice-slide/quality.test.ts` — validation/rejection-order coverage for the two additive constraints.
- `package.json` — add `validate:ice-slide-expedition` only.

### Explicitly unchanged

- `src/lib/games/ice-slide/levels.ts`
- `src/lib/games/ice-slide/daily.ts`
- `src/lib/games/ice-slide/game.ts`
- `src/lib/games/ice-slide/init.ts`
- `src/lib/games/ice-slide/renderer.ts`
- `src/pages/ice-slide/index.astro`
- score/database/leaderboard code

---

### Task 1: Extend the existing stage-quality gate with authored stop/hazard constraints

**Files:**
- Modify: `src/lib/games/ice-slide/quality.ts`
- Modify: `src/lib/games/ice-slide/quality.test.ts`

**Interfaces:**
- Consumes: current `solveIceSlideBoard()` result fields, especially `reachableStopCount`, and the existing final board rows.
- Produces:

```ts
export interface IceSlideStageQualityConstraints {
    parBand: {
        minMoves: number
        maxMoves: number
    }
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

- [ ] **Step 1: Add red tests for valid optional constraint bounds**

Add focused cases beside the existing constraint-validation tests:

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

for (const minReachableStops of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
        validateIceSlideStageQuality(candidate, {
            parBand: { minMoves: 1, maxMoves: 10 },
            maxStates: 10_000,
            minReachableStops,
        })
    ).toThrow(RangeError)
}

for (const maxHazards of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
        validateIceSlideStageQuality(candidate, {
            parBand: { minMoves: 1, maxMoves: 10 },
            maxStates: 10_000,
            maxHazards,
        })
    ).toThrow(RangeError)
}
```

Use an existing simple valid fixture from `quality.test.ts` for `SIMPLE_ROWS` / `candidate`; do not create a second fixture module.

- [ ] **Step 2: Run the focused quality tests and confirm red**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/quality.test.ts
```

Expected: FAIL because the new optional constraints/rejection reasons are not implemented.

- [ ] **Step 3: Validate the additive constraints without changing existing behavior**

Extend `validateConstraints()`:

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

Do not give either field a default in the interface or caller. `undefined` means the current Daily/Campaign-quality semantics exactly.

- [ ] **Step 4: Add red tests for the two new rejection reasons and their ordering**

Use explicit boards whose ordinary solver/par checks pass. Assert:

```ts
expect(
    validateIceSlideStageQuality(candidate, {
        parBand: { minMoves: 1, maxMoves: 20 },
        maxStates: 10_000,
        minReachableStops: 999,
    })
).toMatchObject({
    accepted: false,
    reason: 'reachable_stops_below_min',
})
```

and a solvable board with one `H`:

```ts
expect(
    validateIceSlideStageQuality(hazardCandidate, {
        parBand: { minMoves: 1, maxMoves: 20 },
        maxStates: 10_000,
        maxHazards: 0,
    })
).toMatchObject({
    accepted: false,
    reason: 'too_many_hazards',
})
```

Also lock ordering:

```ts
// Par wins before stop/hazard policy.
expect(validate(parOutOfBandCandidate, {
    parBand: { minMoves: 99, maxMoves: 100 },
    maxStates: 10_000,
    minReachableStops: 999,
    maxHazards: 0,
})).toMatchObject({ accepted: false, reason: 'par_out_of_band' })

// Stop policy wins before hazard/objective policy.
expect(validate(hazardCandidate, {
    parBand: { minMoves: 1, maxMoves: 20 },
    maxStates: 10_000,
    minReachableStops: 999,
    maxHazards: 0,
    // include an infeasible objective if the fixture supports it
})).toMatchObject({ accepted: false, reason: 'reachable_stops_below_min' })
```

- [ ] **Step 5: Implement deterministic post-solver checks**

Immediately after the existing par-band rejection and before objective feasibility:

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
```

Reuse `hazardCount` for the existing `hasHazard` calculation instead of scanning twice:

```ts
const hasHazard = hazardCount > 0
```

- [ ] **Step 6: Run quality + Daily regression tests**

Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/daily.test.ts
```

Expected: PASS, proving optional fields did not perturb Daily generator-v1 behavior.

- [ ] **Step 7: Commit the independently reviewable quality seam**

```bash
git add src/lib/games/ice-slide/quality.ts src/lib/games/ice-slide/quality.test.ts
git commit -m "feat(ice-slide): extend generated stage quality constraints"
```

---

### Task 2: Add the nine authored templates and nine independent fallback boards

**Files:**
- Create: `src/lib/games/ice-slide/templates.ts`
- Create: `src/lib/games/ice-slide/templates.test.ts`

**Interfaces:**
- Consumes: `BoardTransform`, `GridPosition`, `IceSlideDifficulty`, `validateIceSlideStageQuality()`, and `BOARD_TRANSFORMS`.
- Produces:

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

- [ ] **Step 1: Write red catalog identity/count tests**

Lock the exact template IDs in tier order:

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

for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    expect(getIceSlideTemplatesByDifficulty(difficulty)).toHaveLength(3)
}
```

Lock fallback IDs independently:

```ts
expect(ICE_SLIDE_EXPEDITION_FALLBACKS.map(f => f.id)).toEqual([
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

- [ ] **Step 2: Run the new template test and confirm red**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/templates.test.ts
```

Expected: FAIL because `templates.ts` does not exist.

- [ ] **Step 3: Add template-only contracts and exact checked-in content**

Create `templates.ts` with the interfaces above. Copy **exactly** the nine `baseRows`, named slot IDs/coordinates, constraints, and nine fallback row literals from the approved design §§6–7.

Use the existing stable transform order rather than spelling a second order:

```ts
allowedTransforms: [...BOARD_TRANSFORMS]
```

Do not import `ICE_SLIDE_LEVELS`; the fallback row literals must be independent checked-in Expedition content even when they intentionally equal current Campaign rows.

- [ ] **Step 4: Write red structural-validation tests**

Test the exported assertion on the real catalog:

```ts
expect(() => assertValidIceSlideTemplateCatalog()).not.toThrow()
```

Then unit-test the private validation behavior indirectly by temporarily cloning representative invalid definitions into a small exported-for-test helper only if needed. Prefer a module-private validator plus a narrow export:

```ts
export function assertValidIceSlideTemplate(
    template: IceSlideTemplate,
    fallbacks: readonly IceSlideTemplateFallback[]
): void
```

This is acceptable production API because `generator.ts` may call it at catalog initialization; do not add a class/registry.

Cover:

- duplicate/empty template ID;
- non-rectangular/empty rows;
- zero or multiple `S`;
- forbidden `G/O/H/C` in `baseRows`;
- empty/duplicate transform list;
- no goal alternatives;
- missing rock/hazard/crystal pattern list (while `none=[]` itself is valid);
- out-of-bounds position;
- slot position on a base `#` or `S` instead of `.`;
- duplicate coordinates inside one pattern;
- invalid par band / stop floor / hazard ceiling;
- missing or mismatched fallback.

- [ ] **Step 5: Implement compact catalog assertions**

Use simple loops/Sets. Required helpers are enough:

```ts
function countGlyph(rows: readonly string[], glyph: string): number
function assertUniqueIds(items: readonly { id: string }[], label: string): void
function assertPositionOnBaseIce(
    rows: readonly string[],
    position: GridPosition,
    label: string
): void
```

`assertValidIceSlideTemplateCatalog()` must also assert global uniqueness across template IDs and fallback IDs and that every fallback points at exactly one existing matching-tier template.

Call `assertValidIceSlideTemplateCatalog()` once at module initialization after the constants are defined so malformed checked-in content fails loudly in development/test.

- [ ] **Step 6: Independently validate every fallback with production quality rules**

In `templates.test.ts`, for each fallback:

```ts
const template = ICE_SLIDE_EXPEDITION_TEMPLATES.find(
    item => item.id === fallback.templateId
)!

const result = validateIceSlideStageQuality(
    {
        id: fallback.id,
        rows: fallback.rows,
        objectiveIds: [],
    },
    {
        parBand: template.constraints.parBand,
        maxStates: 10_000,
        minReachableStops: template.constraints.minReachableStops,
        maxHazards: template.constraints.maxHazards,
    }
)

expect(result, fallback.id).toMatchObject({ accepted: true })
```

Also assert exactly one `S` and one `G` by relying on the quality/solver path; do not build a separate parser.

- [ ] **Step 7: Run template + quality tests**

Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/templates.test.ts \
  src/lib/games/ice-slide/quality.test.ts
```

Expected: PASS for all nine templates/fallbacks.

If one authored literal fails its documented par/stop/hazard constraints, tune that template literal or constraint **in both the design doc and implementation** before proceeding; do not weaken the global quality gate or special-case a fallback.

- [ ] **Step 8: Commit the content catalog**

```bash
git add \
  src/lib/games/ice-slide/templates.ts \
  src/lib/games/ice-slide/templates.test.ts
git commit -m "feat(ice-slide): add expedition mutation templates"
```

---

### Task 3: Implement the bounded deterministic one-stage generator and fallback path

**Files:**
- Create: `src/lib/games/ice-slide/generator.ts`
- Create: `src/lib/games/ice-slide/generator.test.ts`

**Interfaces:**
- Consumes:
  - `createSeededRng(seed).fork(label)` from shared RNG;
  - `transformRows()` / `transformPosition()` from `transforms.ts`;
  - template/fallback lookup APIs from Task 2;
  - `validateIceSlideStageQuality()` from Task 1;
  - `createIceSlideStageSignature()` from `run.ts`.
- Produces:

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

The slightly stronger `rejectionCounts` type above is compatible with the design's `Readonly<Record<string, number>>` intent while keeping callers on the closed reason union.

- [ ] **Step 1: Write red input/determinism/random-source tests**

Add:

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

Patch global random to prove the path is independent:

```ts
const random = vi.spyOn(Math, 'random').mockImplementation(() => {
    throw new Error('Math.random must not be called')
})
try {
    expect(() => createIceSlideExpeditionStage(input)).not.toThrow()
} finally {
    random.mockRestore()
}
```

Do not patch `crypto.getRandomValues()` globally unless the test environment exposes it; production generator code should simply have no `crypto` import.

- [ ] **Step 2: Run generator tests and confirm red**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/generator.test.ts
```

Expected: FAIL on missing generator module/exports.

- [ ] **Step 3: Add local transform/materialization helpers before the retry loop**

Use plain data helpers in `generator.ts`; do not create a generator class.

```ts
interface TransformedTemplateSlots {
    goals: IceSlideNamedPosition[]
    rocks: IceSlideNamedPositionPattern[]
    hazards: IceSlideNamedPositionPattern[]
    crystals: IceSlideNamedPositionPattern[]
}
```

Transform every coordinate against the original `baseRows.length` / `baseRows[0].length`:

```ts
function transformPositionPattern(
    pattern: IceSlideNamedPositionPattern,
    inputRows: number,
    inputCols: number,
    transform: BoardTransform
): IceSlideNamedPositionPattern {
    return {
        id: pattern.id,
        positions: pattern.positions.map(position =>
            transformPosition(position, inputRows, inputCols, transform)
        ),
    }
}
```

Materialize onto `transformRows(template.baseRows, transform)` using category order goal → rocks → hazards → crystals. Only `.` may be replaced. Return a closed collision result instead of throwing for an ordinary candidate collision:

```ts
type MaterializeResult =
    | { ok: true; rows: string[] }
    | { ok: false; reason: 'materialization_collision' }
```

Write the glyphs `G`, `O`, `H`, `C` respectively. `none=[]` naturally writes nothing.

- [ ] **Step 4: Write red transform and complete-pattern tests**

Use a rectangular in-test template shape by calling a module-exported helper only if necessary. Prefer testing through a real template with a seed that produces a non-identity transform; lock that result with a snapshot:

```ts
const result = createIceSlideExpeditionStage({
    seed: 'ice-slide:hpa-489:transform-fixture',
    stageNumber: 3,
    difficulty: 'medium',
})
expect(result).toMatchSnapshot()
```

The committed snapshot must include `rows`, `transform`, all four `mutationIds`, objective, par, and signature. Review the generated snapshot before committing; it becomes a generator-v1 regression vector.

For complete-pattern behavior, find a deterministic seed whose accepted `mutationIds` includes `crystals:pair` and assert the final rows contain exactly two `C`; never expose a production “choose subset” API just for the test.

- [ ] **Step 5: Implement the exact frozen RNG tree and candidate loop**

Validate `seed` by calling `createSeededRng(seed)` and validate `stageNumber` explicitly.

Build the root:

```ts
const stageRng = createSeededRng(input.seed)
    .fork(`expedition:g${ICE_SLIDE_EXPEDITION_GENERATOR_VERSION}`)
    .fork(`stage:${input.stageNumber}`)
```

For `attempt` from 1 through `ICE_SLIDE_EXPEDITION_MAX_ATTEMPTS` inclusive:

```ts
const attemptRng = stageRng.fork(`attempt:${attempt}`)
const template = attemptRng
    .fork('template')
    .pick(getIceSlideTemplatesByDifficulty(input.difficulty))
const transform = attemptRng
    .fork('transform')
    .pick(template.allowedTransforms)
```

Transform all slot coordinates, then pick exactly one alternative from each category:

```ts
const goal = attemptRng.fork('goal').pick(slots.goals)
const rocks = attemptRng.fork('rocks').pick(slots.rocks)
const hazards = attemptRng.fork('hazards').pick(slots.hazards)
const crystals = attemptRng.fork('crystals').pick(slots.crystals)
```

On materialization collision, increment `materialization_collision` and continue.

Build syntactic objective eligibility in fixed order:

```ts
const eligibleObjectives: IceSlideObjectiveId[] = []
if (rows.some(row => row.includes('C'))) {
    eligibleObjectives.push('collect_all_crystals')
}
if (rows.some(row => row.includes('H'))) {
    eligibleObjectives.push('no_falls')
}
eligibleObjectives.push('no_reset')

const objectiveId = attemptRng.fork('objective').pick(eligibleObjectives)
```

Call quality with:

```ts
const quality = validateIceSlideStageQuality(
    {
        id: `${template.id}:attempt:${attempt}`,
        rows,
        objectiveIds: [objectiveId],
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

On quality rejection, increment `quality.reason` and continue.

- [ ] **Step 6: Materialize accepted stage metadata in one helper**

Create one local `buildStage()` helper shared by candidate/fallback success:

```ts
function buildStage(input: {
    stageNumber: number
    name: string
    templateId: string
    difficulty: IceSlideTemplateDifficulty
    rows: string[]
    parMoves: number
    transform: BoardTransform
    mutationIds: string[]
    objectiveId: IceSlideObjectiveId
}): IceSlideStageDefinition {
    const stage: IceSlideStageDefinition = {
        id: `expedition:${input.stageNumber}`,
        name: input.name,
        templateId: input.templateId,
        difficulty: input.difficulty,
        rows: [...input.rows],
        parMoves: input.parMoves,
        transform: input.transform,
        mutationIds: [...input.mutationIds],
        objectiveIds: [input.objectiveId],
        scoreMultiplierBps: 10_000,
        signature: '',
    }
    stage.signature = createIceSlideStageSignature(stage)
    return stage
}
```

Candidate mutation IDs must be exactly:

```ts
[goal.id, rocks.id, hazards.id, crystals.id]
```

Return `attempts: attempt`, `usedFallback: false`, quality `canonicalKey`, and a defensive copy of rejection counts.

- [ ] **Step 7: Write red duplicate-board coverage**

Generate one stage, then regenerate the same input with its canonical key pre-populated:

```ts
const first = createIceSlideExpeditionStage(input)
const second = createIceSlideExpeditionStage({
    ...input,
    existingCanonicalKeys: new Set([first.canonicalKey]),
})

expect(second.canonicalKey).not.toBe(first.canonicalKey)
```

This intentionally permits the second call to find a later candidate or fallback. Also assert the caller's Set is unchanged.

- [ ] **Step 8: Implement deterministic fallback selection after exactly 64 failed attempts**

Create a tier fallback list by resolving each tier template's `fallbackVariantId`, then:

```ts
const fallbackOrder = stageRng
    .fork('fallback')
    .shuffle(tierTemplates.map(template => ({
        template,
        fallback: getIceSlideFallback(template.fallbackVariantId),
    })))
```

For each entry:

1. derive syntactic objectives from the fallback rows in the same fixed order;
2. pick with `stageRng.fork(`fallback:${fallback.id}:objective`)`;
3. call quality with that template's par/stops/hazard constraints and the caller canonical set;
4. if accepted, build the stage with `transform: 'identity'` and `mutationIds: [`fallback:${fallback.id}`]`;
5. `console.warn` exactly once and return.

Warning payload should be one stable object for testability:

```ts
console.warn('Ice Slide Expedition generation fallback', {
    stageNumber: input.stageNumber,
    difficulty: input.difficulty,
    seedHash: hashString32Hex(input.seed),
    attempts: ICE_SLIDE_EXPEDITION_MAX_ATTEMPTS,
    rejectionCounts: { ...rejectionCounts },
    fallbackId: fallback.id,
})
```

Do not log the raw seed.

If none is valid:

```ts
throw new Error(
    `Ice Slide Expedition stage ${input.stageNumber} (${input.difficulty}) ` +
        'has no valid generated candidate or fallback'
)
```

- [ ] **Step 9: Test the 64-attempt cap and fallback without production dependency injection**

In `generator.test.ts`, mock only the imported quality module:

```ts
vi.mock('./quality', async importOriginal => {
    const actual = await importOriginal<typeof import('./quality')>()
    return {
        ...actual,
        validateIceSlideStageQuality: vi.fn(actual.validateIceSlideStageQuality),
    }
})
```

For the fallback test, configure the mock so calls 1–64 return one stable rejected result, then delegate to the real validator for fallback calls. Assert:

```ts
expect(result.usedFallback).toBe(true)
expect(result.attempts).toBe(64)
expect(result.stage.transform).toBe('identity')
expect(result.stage.mutationIds[0]).toMatch(/^fallback:/)
expect(validateMock).toHaveBeenCalledTimes(65) // first fallback accepted
expect(warn).toHaveBeenCalledTimes(1)
```

For the hard failure test, return rejection for every call and assert the thrown message plus that candidate calls stop after 64 before the finite fallback list is exhausted. Restore mocks after each test.

This keeps retry-test seams entirely in Vitest; do not add injectable validator/RNG/logger parameters to production code.

- [ ] **Step 10: Lock a generator-v1 snapshot and repeated byte output**

For one seed per tier, commit Vitest snapshots of the full returned value:

```ts
for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const input = {
        seed: `ice-slide:hpa-489:v1:${difficulty}`,
        stageNumber: difficulty === 'easy' ? 1 : difficulty === 'medium' ? 3 : 5,
        difficulty,
    }
    const first = createIceSlideExpeditionStage(input)
    const second = createIceSlideExpeditionStage(input)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(first).toMatchSnapshot()
}
```

Run once with snapshot update only after manually confirming rows/metadata satisfy the approved design. Future output changes require an intentional generator-version decision rather than silently re-recording snapshots.

- [ ] **Step 11: Run focused generator regressions**

Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/generator.test.ts \
  src/lib/games/ice-slide/templates.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/run.test.ts
```

Expected: PASS.

- [ ] **Step 12: Commit the bounded generator**

```bash
git add \
  src/lib/games/ice-slide/generator.ts \
  src/lib/games/ice-slide/generator.test.ts \
  src/lib/games/ice-slide/__snapshots__/generator.test.ts.snap
git commit -m "feat(ice-slide): add bounded expedition stage generation"
```

If Vitest stores the snapshot at a different standard path, stage that generated snapshot path instead; do not hand-author snapshot serialization.

---

### Task 4: Add deterministic 100-seed CI smoke and 1,000-seed content-validation command

**Files:**
- Create: `src/lib/games/ice-slide/generator.validation.test.ts`
- Create: `scripts/validate-ice-slide-expedition.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createIceSlideExpeditionStage()`, template lookup, and `solveIceSlideBoard()`/`validateIceSlideStageQuality()` for independent post-generation assertions.
- Produces: package command `bun run validate:ice-slide-expedition`.

- [ ] **Step 1: Write the 100-seed-per-tier smoke test**

Use this exact tier/stage mapping:

```ts
const TIER_STAGES = {
    easy: [1, 2],
    medium: [3, 4],
    hard: [5, 6],
} as const
```

For each difficulty and `index` from 0 through 99:

```ts
const seed =
    `ice-slide:validate:v1:${difficulty}:` +
    String(index).padStart(4, '0')

const first = createIceSlideExpeditionStage({
    seed,
    stageNumber: TIER_STAGES[difficulty][0],
    difficulty,
})
const second = createIceSlideExpeditionStage({
    seed,
    stageNumber: TIER_STAGES[difficulty][1],
    difficulty,
    existingCanonicalKeys: new Set([first.canonicalKey]),
})
```

Assert:

```ts
expect(second.canonicalKey).not.toBe(first.canonicalKey)
expect(JSON.stringify(regenerateFirst)).toBe(JSON.stringify(first))
expect(JSON.stringify(regenerateSecond)).toBe(JSON.stringify(second))
```

For each generated stage, resolve its owning template:

- candidate: `stage.templateId` directly;
- fallback: still keep the owning template ID in `stage.templateId`; only mutation ID starts with `fallback:`.

Then independently call `validateIceSlideStageQuality()` with the owning template's constraints and assert `accepted: true` and `quality.parMoves === stage.parMoves`.

For stage 2, include stage 1's canonical key in that independent validation call as well.

- [ ] **Step 2: Run the smoke test and tune authored content only if needed**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/generator.validation.test.ts
```

Expected: PASS for 300 seeds / 600 generated stages total.

If it fails because a tier's three fallbacks cannot produce two distinct same-tier stages under an exhaustion path, fix the affected checked-in content/fallback in `templates.ts` and the design doc rather than weakening duplicate detection.

- [ ] **Step 3: Implement the standalone 1,000-seed-per-tier validator**

Create `scripts/validate-ice-slide-expedition.ts` with the same tier/stage mapping and exact seeds `0000`–`0999`.

Accumulate:

```ts
interface TierStats {
    stageCount: number
    totalAttempts: number
    fallbacks: number
    rejectionCounts: Record<string, number>
    worstExploredStates: number
}
```

For each stage:

1. generate it;
2. independently call `validateIceSlideStageQuality()` with the owner template constraints and appropriate prior canonical Set;
3. throw if rejected, par mismatches, canonical duplicates within the pair, or repeated generation is not byte-identical;
4. call `solveIceSlideBoard(stage.stage, { maxStates: 10_000 })` and throw if truncated/unsolvable;
5. fold `stage.rejectionCounts`, attempts, fallback count, and `solveResult.exploredStates` into stats.

Use a compact failure message containing difficulty, seed index, stage number, template ID, and invariant name. Do not swallow exceptions or continue after corrupted content.

Print one deterministic table-like line per tier, for example:

```ts
console.log(
    JSON.stringify({
        difficulty,
        seeds: 1_000,
        stages: stats.stageCount,
        attempts: stats.totalAttempts,
        fallbacks: stats.fallbacks,
        worstExploredStates: stats.worstExploredStates,
        rejectionCounts: stats.rejectionCounts,
    })
)
```

Sort `rejectionCounts` keys before printing so report diffs are stable.

- [ ] **Step 4: Add only the package script**

Add to `package.json` scripts:

```json
"validate:ice-slide-expedition": "bun scripts/validate-ice-slide-expedition.ts"
```

Do not add a new workflow file; existing normal CI discovers the 100-seed Vitest file.

- [ ] **Step 5: Run both validation depths**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/generator.validation.test.ts
bun run validate:ice-slide-expedition
```

Expected:

- smoke test exits 0;
- validation command exits 0 after 3,000 deterministic seeds / 6,000 generated stages total;
- output has one line for easy, medium, hard with attempts/rejections/fallback/worst-state metrics;
- no invalid accepted stage, duplicate pair, or nondeterministic regeneration.

There is deliberately no required maximum rejection/fallback rate in HPA-489; the report is for content tuning, not a hidden product SLA.

- [ ] **Step 6: Commit validation tooling**

```bash
git add \
  src/lib/games/ice-slide/generator.validation.test.ts \
  scripts/validate-ice-slide-expedition.ts \
  package.json
git commit -m "test(ice-slide): validate expedition generator content"
```

---

### Task 5: Run full regression gates and verify HPA-489 scope boundaries

**Files:**
- No new production files expected.
- Modify only code/tests from Tasks 1–4 if a gate exposes a real HPA-489 defect.

**Interfaces:**
- Consumes: final branch from Tasks 1–4.
- Produces: a verified HPA-489 implementation ready for review; no HPA-490 behavior.

- [ ] **Step 1: Run all Ice Slide unit tests**

```bash
bun run test:run -- src/lib/games/ice-slide
```

Expected: PASS, including unchanged Daily golden output and Campaign/run/solver regressions.

- [ ] **Step 2: Run the complete repository unit suite**

```bash
bun run test:run
```

Expected: PASS.

- [ ] **Step 3: Run static quality gates**

```bash
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Expected: all exit 0. If `format:check` fails on only intended files, run `bun run format`, inspect the diff, and rerun the gate before committing.

- [ ] **Step 4: Run the 1,000-seed-per-tier content validator one final time**

```bash
bun run validate:ice-slide-expedition
```

Expected: exit 0. Record the three printed tier summaries in the implementation PR description; do not turn current rejection/fallback counts into hard-coded thresholds.

- [ ] **Step 5: Verify no prohibited runtime/platform scope leaked in**

Run:

```bash
git diff --name-only main...HEAD
```

Expected changed implementation paths are limited to:

```text
src/lib/games/ice-slide/quality.ts
src/lib/games/ice-slide/quality.test.ts
src/lib/games/ice-slide/templates.ts
src/lib/games/ice-slide/templates.test.ts
src/lib/games/ice-slide/generator.ts
src/lib/games/ice-slide/generator.test.ts
src/lib/games/ice-slide/__snapshots__/generator.test.ts.snap
src/lib/games/ice-slide/generator.validation.test.ts
scripts/validate-ice-slide-expedition.ts
package.json
```

plus the already-approved design/plan docs if implementation starts from this branch. There must be no `game.ts`, `init.ts`, page, DB, score, leaderboard, `levels.ts`, or `daily.ts` production change.

- [ ] **Step 6: Commit any gate-driven cleanup separately**

Only if needed:

```bash
git add <only-the-files-fixed-for-verification>
git commit -m "test(ice-slide): finalize expedition generator verification"
```

Do not create an empty cleanup commit.

---

## Plan Self-Review

- **Spec coverage:** Tasks 1–4 cover template contract/content, all nine fallbacks, exact generation order, transformed slots, 64-attempt cap, 10,000-state solver bound, canonical dedupe, objectives, signatures, deterministic fallbacks/diagnostics, 100-seed CI smoke, and 1,000-seed validation command.
- **Placeholder scan:** no TODO/TBD, unspecified function, or “add tests later” step remains. Exact content is frozen in the companion design §§6–7 and named as the literal source for Task 2.
- **Type consistency:** `IceSlideTemplateDifficulty`, `IceSlideTemplate`, fallback lookup, quality constraints, `IceSlideGeneratedStage`, and rejection reason types are introduced before later tasks consume them.
- **Scope check:** complete six-stage run assembly, seed creation, UI, persistence, and Expedition browser mode remain HPA-490; HPA-489 stays independently testable as content + stage generation.
- **YAGNI check:** no generator class, dependency-injection framework, registry, JSON schema, editor, worker, cache, or generic cross-game abstraction is introduced.
