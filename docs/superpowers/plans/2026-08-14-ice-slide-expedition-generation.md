# Ice Slide Authored Mutation Templates and Bounded Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement HPA-489 as a deterministic bounded one-stage Expedition generator backed by nine authored mutation templates, transform-invariant in-run duplicate detection, checked-in full-row fallbacks, solver/quality validation, and one reusable multi-seed validation loop, without shipping Expedition gameplay/UI yet.

**Architecture:** Keep authored content in `templates.ts`, bounded retry/fallback policy in `generator.ts`, and extend existing `quality.ts` only with the two missing authored constraints. Final-board duplicate identity is stronger than `quality.ts`'s literal-row key: `generator.ts` derives the minimum serialized key across the fully materialized board's transform orbit. HPA-490 later assembles six returned stages and owns random seed creation, browser lifecycle, and persistence.

**Tech Stack:** Astro 5 repository, TypeScript 6, Bun 1.3, Vitest 3, existing FNV-1a/Mulberry32 RNG, Ice Slide transforms, bounded BFS solver, and stage-quality validator.

## Global Constraints

- Materialize one `IceSlideStageDefinition` at a time; do not build an `IceSlideRunDefinition` or expose Expedition in the browser.
- Ship exactly nine generator-v1 templates: three easy, three medium, three hard, plus one complete checked-in fallback per template.
- `baseRows` contain only `#`, `.`, and exactly one `S`; goals/rocks/hazards/crystals come only from named authored alternatives.
- Select complete patterns, never arbitrary position subsets.
- Keep per-template `allowedTransforms`; HPA-489 explicitly owns allowed-transform authoring even though all v1 templates use all eight.
- Transform static rows and slot coordinates before materializing mutations.
- Final-board canonical keys are transform-invariant. Rotated/reflected copies count as the same puzzle.
- Validate with `objectiveIds: []` first, then pick from `quality.objectiveFeasibility` in fixed order `collect_all_crystals`, `no_falls`, `no_reset`.
- Candidate generation is capped at exactly 64 attempts; every solver call is capped at 10,000 states.
- After exhaustion, try the requested tier's checked-in fallbacks in deterministic seeded order. If none is usable, throw.
- Fallback use emits exactly one development-only `console.warn` with hashed seed and structured metadata; do not inject a logger.
- Never call `Math.random()` or `crypto.getRandomValues()` in HPA-489 generation.
- Existing Campaign levels, Daily output/pools, `IceSlidePlayableMode`, score APIs, DB, UI, and `ICE_SLIDE_RULESET_VERSION` remain unchanged.
- HPA-489 requires final-puzzle uniqueness, not template-ID uniqueness. Do not add `existingTemplateIds` unless the product requirement changes.
- Exact template rows/slots/fallbacks come from `docs/superpowers/specs/2026-08-14-ice-slide-expedition-generation-design.md` §§6–7.

---

## File Structure

### Create

- `src/lib/games/ice-slide/templates.ts` — authoring-only contracts, nine templates, nine independent fallbacks, compact checked-in-content validation and lookups.
- `src/lib/games/ice-slide/templates.test.ts` — catalog structure, transform-orbit family uniqueness, fallback solver/quality validation.
- `src/lib/games/ice-slide/generator.ts` — one-stage deterministic materialization, transform-invariant duplicate key, bounded retry, deterministic fallback, one-shot dev diagnostic.
- `src/lib/games/ice-slide/generator.test.ts` — deterministic output, transform/slot behavior, orbit duplicate semantics, collision/rejection/fallback paths, explicit generator-v1 goldens.
- `src/lib/games/ice-slide/generator.validation.test.ts` — 100-seed-per-tier smoke using the shared validation helper.
- `scripts/validate-ice-slide-expedition.ts` — shared validation helper plus 1,000-seed-per-tier CLI reporting.

### Modify

- `src/lib/games/ice-slide/quality.ts` — optional reachable-stop floor and hazard ceiling only.
- `src/lib/games/ice-slide/quality.test.ts` — additive constraint/rejection-order tests.
- `package.json` — add `validate:ice-slide-expedition` only.

### Explicitly unchanged

- `src/lib/games/ice-slide/levels.ts`
- `src/lib/games/ice-slide/daily.ts`
- `src/lib/games/ice-slide/run.ts`
- `src/lib/games/ice-slide/game.ts`
- `src/lib/games/ice-slide/init.ts`
- `src/lib/games/ice-slide/renderer.ts`
- `src/pages/ice-slide/index.astro`
- score/database/leaderboard code

---

### Task 1: Extend the stage-quality gate with optional stop/hazard constraints

**Files:**
- Modify: `src/lib/games/ice-slide/quality.ts`
- Modify: `src/lib/games/ice-slide/quality.test.ts`

**Produces:**

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

- [ ] **Step 1: Add failing constraint-bound tests**

Use existing local quality fixtures; do not create a second fixture module.

```ts
expect(() =>
    validateIceSlideStageQuality(candidate, {
        parBand: { minMoves: 1, maxMoves: 20 },
        maxStates: 10_000,
        minReachableStops: 1,
        maxHazards: 0,
    })
).not.toThrow()

for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
        validateIceSlideStageQuality(candidate, {
            parBand: { minMoves: 1, maxMoves: 20 },
            maxStates: 10_000,
            minReachableStops: value,
        })
    ).toThrow(RangeError)
}

for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
        validateIceSlideStageQuality(candidate, {
            parBand: { minMoves: 1, maxMoves: 20 },
            maxStates: 10_000,
            maxHazards: value,
        })
    ).toThrow(RangeError)
}
```

- [ ] **Step 2: Run red**

```bash
bun run test:run -- src/lib/games/ice-slide/quality.test.ts
```

Expected: FAIL because new constraints/reasons are absent.

- [ ] **Step 3: Implement additive constraint validation**

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
    (!Number.isSafeInteger(constraints.maxHazards) ||
        constraints.maxHazards < 0)
) {
    throw new RangeError('maxHazards must be a non-negative safe integer')
}
```

No default values; `undefined` preserves existing semantics.

- [ ] **Step 4: Add failing rejection/order tests**

Lock:

```ts
expect(validate(candidate, {
    parBand: { minMoves: 1, maxMoves: 20 },
    maxStates: 10_000,
    minReachableStops: 999,
})).toMatchObject({
    accepted: false,
    reason: 'reachable_stops_below_min',
})

expect(validate(hazardCandidate, {
    parBand: { minMoves: 1, maxMoves: 20 },
    maxStates: 10_000,
    maxHazards: 0,
})).toMatchObject({
    accepted: false,
    reason: 'too_many_hazards',
})
```

And rejection order:

1. `par_out_of_band` before stop/hazard policy;
2. `reachable_stops_below_min` before hazard/objective policy;
3. `too_many_hazards` before objective feasibility.

- [ ] **Step 5: Implement post-solver checks**

Immediately after the existing par-band check and before objective feasibility:

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

Reuse `hazardCount > 0` for the existing `hasHazard` calculation.

- [ ] **Step 6: Run quality + unchanged Daily regressions**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/daily.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/ice-slide/quality.ts src/lib/games/ice-slide/quality.test.ts
git commit -m "feat(ice-slide): extend generated stage quality constraints"
```

---

### Task 2: Add nine distinct authored templates and nine fallbacks

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
export function getIceSlideFallback(id: string): IceSlideTemplateFallback
export function assertValidIceSlideTemplateCatalog(): void
```

- [ ] **Step 1: Write exact catalog identity tests**

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
```

Assert three templates per tier and exact fallback IDs.

- [ ] **Step 2: Run red**

```bash
bun run test:run -- src/lib/games/ice-slide/templates.test.ts
```

Expected: FAIL because `templates.ts` is absent.

- [ ] **Step 3: Add contracts and exact content**

Copy exact rows/coordinates/constraints/fallbacks from design §§6–7. All v1 templates use:

```ts
allowedTransforms: [...BOARD_TRANSFORMS]
```

Do not import `ICE_SLIDE_LEVELS`.

The third hard family is the new rectangular topology:

```ts
baseRows = [
    '#########',
    '#S..#...#',
    '#.......#',
    '#.....#.#',
    '#..#....#',
    '#.#.....#',
    '#.....#.#',
    '#########',
]
```

Its fallback is:

```ts
[
    '#########',
    '#S..#...#',
    '#.......#',
    '#.....#.#',
    '#..#....#',
    '#.#.....#',
    '#.....#G#',
    '#########',
]
```

- [ ] **Step 4: Add structural-validation tests**

Test real catalog success plus representative invalid clones for:

- empty/duplicate IDs;
- empty/non-rectangular rows;
- zero/multiple `S`;
- forbidden `G/O/H/C` in base, plus an unknown-glyph clone proving every
  `baseRows` cell must be one of `#`, `.`, or `S`;
- fallback rows missing their single `S` or containing a non-playable glyph
  (reuse the production board parser for the glyph check);
- empty/duplicate transform list;
- missing goal/category alternatives;
- out-of-bounds or non-ice positions;
- duplicate positions inside a pattern;
- invalid par/stop/hazard constraints;
- missing/mismatched fallback.

Use simple module-local loops/Sets. Do not export the private validators from `run.ts`; that would couple authoring validation to run-schema internals.

- [ ] **Step 5: Add transform-orbit family uniqueness test**

Use the existing orbit builder on complete `baseRows`:

```ts
function orbitKey(rows: readonly string[]): string {
    return getUniqueBoardTransforms(rows)
        .map(variant => variant.canonicalKey)
        .sort()[0]
}

const keys = ICE_SLIDE_EXPEDITION_TEMPLATES.map(template =>
    orbitKey(template.baseRows)
)
expect(new Set(keys)).toHaveSize(keys.length)
```

This specifically prevents the old `hard-zero-cross === rotate_90(hard-absolute-zero)` content mistake from returning.

- [ ] **Step 6: Validate every fallback with production quality**

For each fallback resolve its owning template and call:

```ts
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

Every fallback — including the rectangular `hard-zero-cross-v1` — is checked
against its owning template's declared par band (`hard-zero-cross` declares
`[5, 10]`), plus that band's stop floor and hazard ceiling. No fallback is
retuned solely to hit an exact par value.

- [ ] **Step 7: Run template + quality tests**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/templates.test.ts \
  src/lib/games/ice-slide/quality.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add \
  src/lib/games/ice-slide/templates.ts \
  src/lib/games/ice-slide/templates.test.ts
git commit -m "feat(ice-slide): add expedition mutation templates"
```

---

### Task 3: Implement bounded generation, orbit dedupe, and fallback

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

Input contract: `createIceSlideExpeditionStage` requires a non-empty `seed`
and a positive safe-integer `stageNumber`. Violations throw a `RangeError`
with the exact messages `'seed must be non-empty'` and `'stageNumber must be
a positive safe integer'`.

Cover empty seed, invalid stage numbers (asserting those exact `RangeError`
messages), repeated `toEqual` output, and:

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

No production `crypto` import.

- [ ] **Step 2: Run red**

```bash
bun run test:run -- src/lib/games/ice-slide/generator.test.ts
```

Expected: FAIL on missing module/exports.

- [ ] **Step 3: Add local transform/materialization helpers**

Use plain data helpers, no class.

```ts
type MaterializeResult =
    | { ok: true; rows: string[] }
    | { ok: false; reason: 'materialization_collision' }
```

Transform coordinates against original base dimensions; materialize onto `transformRows(template.baseRows, transform)` in goal → rocks → hazards → crystals order. Only `.` may be replaced.

- [ ] **Step 4: Add the transform-invariant canonical-key helper**

Export one shared helper from `transforms.ts` (also used by the template
catalog validator):

```ts
export function getBoardOrbitKey(rows: readonly string[]): string {
    return getUniqueBoardTransforms(rows)
        .map(variant => variant.canonicalKey)
        .sort()[0]
}
```

This is invoked only after final rows exist.

Add a test-local equivalent and assert:

```ts
const result = createIceSlideExpeditionStage(input)
const expected = orbitKey(result.stage.rows)
const rotated = transformRows(result.stage.rows, 'rotate_90')

expect(result.canonicalKey).toBe(expected)
expect(orbitKey(rotated)).toBe(expected)
```

- [ ] **Step 5: Implement frozen candidate RNG tree**

```ts
const stageRng = createSeededRng(input.seed)
    .fork(`expedition:g${ICE_SLIDE_EXPEDITION_GENERATOR_VERSION}`)
    .fork(`stage:${input.stageNumber}`)
```

For `attempt` 1–64:

```ts
const attemptRng = stageRng.fork(`attempt:${attempt}`)
const template = attemptRng
    .fork('template')
    .pick(getIceSlideTemplatesByDifficulty(input.difficulty))
const transform = attemptRng
    .fork('transform')
    .pick(template.allowedTransforms)
```

Pick transformed goal/rock/hazard/crystal alternatives from `goal`, `rocks`, `hazards`, `crystals` forks.

On materialization collision increment `materialization_collision` and continue.

Then:

```ts
const canonicalKey = getBoardOrbitKey(rows)
if (input.existingCanonicalKeys?.has(canonicalKey)) {
    increment('duplicate_board')
    continue
}
```

Call quality **without** `existingCanonicalKeys`:

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
        minReachableStops: template.constraints.minReachableStops,
        maxHazards: template.constraints.maxHazards,
    }
)
```

On rejection increment `quality.reason` and continue.

After acceptance:

```ts
const OBJECTIVE_ORDER = [
    'collect_all_crystals',
    'no_falls',
    'no_reset',
] as const

const eligibleObjectives = OBJECTIVE_ORDER.filter(
    id => quality.objectiveFeasibility[id]
)
if (eligibleObjectives.length === 0) {
    increment('objective_infeasible')
    continue
}
const objectiveId = attemptRng.fork('objective').pick(eligibleObjectives)
```

If the eligible set is empty the attempt is rejected as `objective_infeasible`
and generation retries within the same 64-attempt bound — `pick` must never
receive an empty list. Cover this with a test that mocks accepted quality
results carrying an all-infeasible `objectiveFeasibility` map and asserts
bounded candidate retry, then bounded fallback attempts, ending in the
exhaustion error.

- [ ] **Step 6: Build accepted stage metadata**

Use one local `buildStage()` helper shared by candidate/fallback success. Candidate mutation IDs are exactly:

```ts
[goal.id, rocks.id, hazards.id, crystals.id]
```

Return the transform-invariant `canonicalKey`, `attempts: attempt`, `usedFallback: false`, and a defensive copy of closed-union rejection counts.

- [ ] **Step 7: Add orbit-duplicate input coverage**

Generate a first stage; pass its returned key back without mutating caller state:

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

Also assert `first.canonicalKey` equals the orbit key of every `transformRows(first.stage.rows, transform)` variant.

- [ ] **Step 8: Implement deterministic fallback after 64 attempts**

Resolve and shuffle tier fallbacks:

```ts
const fallbackOrder = stageRng
    .fork('fallback')
    .shuffle(tierTemplates.map(template => ({
        template,
        fallback: getIceSlideFallback(template.fallbackVariantId),
    })))
```

For each fallback:

1. derive transform-invariant key;
2. reject/increment `duplicate_board` if caller already used it;
3. validate with `objectiveIds: []`, owning constraints, no literal duplicate Set;
4. select objective from accepted `quality.objectiveFeasibility` with `stageRng.fork(`fallback:${fallback.id}:objective`)`; if nothing is eligible, increment `objective_infeasible` and try the next fallback;
5. build with `transform: 'identity'`, `mutationIds: [`fallback:${fallback.id}`]`, and a defensive copy of `fallback.rows`;
6. in development, emit exactly one warning:

```ts
if (import.meta.env.DEV) {
    console.warn('Ice Slide Expedition generation fallback', {
        stageNumber: input.stageNumber,
        difficulty: input.difficulty,
        seedHash: hashString32Hex(input.seed),
        attempts: ICE_SLIDE_EXPEDITION_MAX_ATTEMPTS,
        rejectionCounts: { ...rejectionCounts },
        fallbackId: fallback.id,
    })
}
```

Do not log raw seed and do not add logger injection. Tests must verify the
warning fires under `import.meta.env.DEV === true` and is suppressed under
`false` (e.g. via `vi.stubEnv`).

If none accept, throw:

```ts
throw new Error(
    `Ice Slide Expedition stage ${input.stageNumber} (${input.difficulty}) ` +
        'has no valid generated candidate or fallback'
)
```

- [ ] **Step 9: Test 64-attempt fallback without brittle call counts**

Mock only the imported quality module. The mock distinguishes candidate IDs from full-row fallback IDs rather than assuming every attempt reaches quality:

```ts
const validateMock = vi.mocked(validateIceSlideStageQuality)
validateMock.mockImplementation((candidate, constraints) => {
    if (String(candidate.id).includes(':attempt:')) {
        return {
            accepted: false,
            reason: 'unsolvable',
            message: 'forced candidate rejection',
        }
    }
    return realValidate(candidate, constraints)
})
```

Materialization collisions legitimately bypass quality. Assert the invariant instead of `toHaveBeenCalledTimes(65)`:

```ts
const candidateQualityCalls = validateMock.mock.calls.filter(
    ([candidate]) => String(candidate.id).includes(':attempt:')
).length
const collisionCount = result.rejectionCounts.materialization_collision ?? 0
const fallbackCalls = validateMock.mock.calls.length - candidateQualityCalls

expect(result.usedFallback).toBe(true)
expect(result.attempts).toBe(64)
expect(candidateQualityCalls + collisionCount).toBe(64)
expect(fallbackCalls).toBeGreaterThanOrEqual(1)
expect(fallbackCalls).toBeLessThanOrEqual(3)
expect(result.stage.transform).toBe('identity')
expect(result.stage.mutationIds[0]).toMatch(/^fallback:/)
expect(warn).toHaveBeenCalledTimes(1)
```

For all-fallback failure, force every quality call to reject and assert the bounded error path. Do not add injectable validator/RNG/logger parameters.

- [ ] **Step 10: Lock explicit generator-v1 goldens — no snapshots**

Use a test-local `projectStage()` selecting exactly rows, transform, mutation IDs, objective IDs, par, and signature.

Easy:

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
```

Medium:

```ts
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
```

Hard — updated for the distinct rectangular `hard-zero-cross` family:

```ts
expect(projectStage(createIceSlideExpeditionStage({
    seed: 'ice-slide:hpa-489:v1:hard',
    stageNumber: 5,
    difficulty: 'hard',
}))).toEqual({
    rows: [
        '#########',
        '#.....#G#',
        '#.#.....#',
        '#.O#....#',
        '#.....#.#',
        '#....CH.#',
        '#S..#...#',
        '#########',
    ],
    transform: 'reflect_horizontal',
    mutationIds: [
        'goal:southeast',
        'rocks:center-west',
        'hazards:upper-east',
        'crystals:northeast',
    ],
    objectiveIds: ['no_falls'],
    parMoves: 5,
    signature: 'is2-40f46428',
})
```

Keep byte-repeat proof:

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
    worstAttempts: number
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

- [ ] **Step 1: Write the 100-seed smoke against the shared helper**

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

    for (const summary of summaries) {
        expect(summary.worstAttempts).toBeGreaterThanOrEqual(1)
        expect(summary.worstAttempts).toBeLessThanOrEqual(64)
    }
})
```

Do not add a hardware-dependent wall-clock assertion. The deterministic attempt/state metrics are the tuning signal; Vitest's normal timeout remains the hang guard.

- [ ] **Step 2: Run red**

```bash
bun run test:run -- src/lib/games/ice-slide/generator.validation.test.ts
```

Expected: FAIL because the shared helper/script does not exist.

- [ ] **Step 3: Implement one validation loop**

Use future tier/stage slots:

```ts
const TIER_STAGES = {
    easy: [1, 2],
    medium: [3, 4],
    hard: [5, 6],
} as const
```

Seed format:

```ts
const seed =
    `ice-slide:validate:v1:${difficulty}:` +
    String(index).padStart(4, '0')
```

For each seed, iterate every stage number in `TIER_STAGES[difficulty]`,
keeping one shared canonical-key Set of previously generated stage keys.
Stage generation receives the shared Set; replay validation receives a
snapshot of that Set taken before generation, so the newly generated key
is not treated as an existing duplicate:

1. snapshot the shared canonical-key Set before generation (e.g.
   `new Set(shared)`);
2. generate the stage with `existingCanonicalKeys` set to the shared Set;
3. assert the returned transform-invariant key is new in the shared Set
   (do not add it yet);
4. recompute the minimum transform-orbit key for each final board and assert
   it equals returned `canonicalKey`;
5. regenerate the input with `existingCanonicalKeys` set to the
   pre-generation snapshot and assert byte-identical output;
6. only after replay succeeds, add the returned `canonicalKey` to the
   shared Set;
7. independently validate final stages using their selected `objectiveIds`
   and owning template par/stops/hazard constraints; do **not** pass the
   orbit-key set into `quality.ts`;
8. solve each board with 10,000 states and assert solvable/not truncated;
9. fold attempts, `worstAttempts`, fallback count, closed-union rejections,
   and worst explored states into stats (`stageCount` =
   `seedsPerTier * TIER_STAGES[difficulty].length`);
10. invoke optional `onStage`.

The shared helper must not duplicate the generator's template/stage-selection algorithm beyond the tier/stage mapping above.

- [ ] **Step 4: Add CLI entry point around the same helper**

Use a main-module guard such as:

```ts
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
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
}
```

Keep rejection-count typing closed in helper code; sorting for JSON does not create a second diagnostic vocabulary.

- [ ] **Step 5: Add package script only**

```json
"validate:ice-slide-expedition": "bun scripts/validate-ice-slide-expedition.ts"
```

No new workflow file.

- [ ] **Step 6: Run both depths**

```bash
bun run test:run -- src/lib/games/ice-slide/generator.validation.test.ts
bun run validate:ice-slide-expedition
```

Expected:

- 100-seed/tier smoke exits 0;
- 1,000-seed/tier command exits 0;
- two final boards per seed are never transform-equivalent duplicates;
- output has easy/medium/hard summaries including `totalAttempts`, `worstAttempts`, fallbacks, rejection counts, and worst explored states.

There is deliberately no fallback-rate SLA; fallbacks are a required recovery path, not a validation failure by definition.

- [ ] **Step 7: Commit**

```bash
git add \
  src/lib/games/ice-slide/generator.validation.test.ts \
  scripts/validate-ice-slide-expedition.ts \
  package.json
git commit -m "test(ice-slide): validate expedition generator content"
```

---

### Task 5: Run full regression gates and verify scope

**Files:**
- No new production files expected.
- Modify only Task 1–4 files if verification exposes an HPA-489 defect.

- [ ] **Step 1: Run all Ice Slide unit tests**

```bash
bun run test:run -- src/lib/games/ice-slide
```

Expected: PASS, including unchanged Daily generator goldens and Campaign/run/solver regressions.

- [ ] **Step 2: Run repository tests**

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

Expected: all exit 0.

If formatting alone fails on intended files, run `bun run format`, inspect the exact diff, and rerun the gate.

- [ ] **Step 4: Run final 1,000-seed validation**

```bash
bun run validate:ice-slide-expedition
```

Expected: exit 0. Record the three tier summaries in the implementation PR description. Do not turn observed attempts/fallback counts into new product thresholds without a separate decision.

- [ ] **Step 5: Verify changed-file scope**

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

plus the approved design/plan docs if implementation starts from this branch.

There must be no production changes to `levels.ts`, `daily.ts`, `run.ts`, `game.ts`, `init.ts`, page/UI, DB, score, or leaderboard code.

- [ ] **Step 6: Commit gate-driven cleanup only if needed**

```bash
git add <only-files-fixed-for-verification>
git commit -m "test(ice-slide): finalize expedition generator verification"
```

Do not create an empty cleanup commit.

---

## Plan Self-Review

- **Spec coverage:** Tasks 1–4 cover typed template content, all nine fallbacks, transform/slot materialization, transform-invariant duplicate identity, validate-first objectives, 64-attempt cap, 10,000-state solver bound, deterministic fallback/diagnostic behavior, explicit v1 goldens, and one 100/1,000-seed validation loop.
- **Review resolution:** stale prior-revision claims are ignored; transform-orbit dedupe, distinct hard topology, and collision-safe fallback test counts are incorporated. Fallbacks, per-template allowed transforms, and the lack of template-ID uniqueness are retained because they match HPA-489's actual contract.
- **Placeholder scan:** no TBD/TODO, unspecified API, or “tests later” step remains.
- **Type consistency:** `IceSlideTemplateDifficulty`, quality constraints, generation rejection union, `IceSlideGeneratedStage`, and validation stats are introduced before consumers use them.
- **Scope:** HPA-490 still owns complete run assembly, seed creation, UI, and persistence.
- **YAGNI:** no generator class, DI/logger interface, registry, JSON schema, editor, worker, cache, cross-game abstraction, or hardware-dependent performance gate is introduced.
