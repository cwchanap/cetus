# Ice Slide Authored Mutation Templates and Bounded Generation — Design

- **Date:** 2026-08-14
- **Status:** Proposed for HPA-489 implementation
- **Repository:** `cwchanap/cetus`
- **Linear issue:** HPA-489 — Build authored Ice Slide mutation templates and bounded seeded level generation
- **Foundation designs:**
  - `docs/superpowers/specs/2026-08-02-deterministic-ice-slide-runs-design.md`
  - `docs/superpowers/specs/2026-08-03-ice-slide-production-solver-design.md`

## 1. Summary

HPA-489 is the first Phase 2 Ice Slide replayability task. The repository already has the seams this work needs:

- HPA-485: deterministic materialized stage/run contracts, seeded RNG, board/coordinate transforms, and stage signatures;
- HPA-486: bounded production solver and pure stage-quality gate;
- HPA-487: Daily objective/scoring semantics and a proven materialize-before-play boundary.

HPA-489 stays one layer below Expedition mode:

- `templates.ts` owns nine typed mutation templates and nine complete checked-in fallback boards;
- `generator.ts` materializes **one deterministic `IceSlideStageDefinition` at a time** from an explicit seed, stage number, difficulty, and caller-owned transform-invariant canonical-key set;
- `quality.ts` gains only two optional authored constraints: minimum reachable stops and maximum hazards;
- one validation loop is reused at two depths: 100 seeds per tier in Vitest and 1,000 seeds per tier from a Bun command;
- HPA-490 owns random seed creation, six-stage run assembly, Retry Seed/New Expedition, browser UX, and personal-result persistence.

No generator framework, template DSL, registry, worker, cache, UI, database work, or dynamic-tile machinery is needed.

## 2. Existing seams and reuse

Reuse directly:

- `src/lib/games/shared/seeded-rng.ts` — stable FNV-1a/Mulberry32, unbiased `nextInt`, `pick`, `shuffle`, and labeled forks.
- `src/lib/games/ice-slide/transforms.ts` — `transformRows()`, `transformPosition()`, `serializeBoardRows()`, and `getUniqueBoardTransforms()`.
- `src/lib/games/ice-slide/solver.ts` — bounded BFS with `reachableStopCount`, crystal facts, explored-state count, and truncation.
- `src/lib/games/ice-slide/quality.ts` — parsing, literal-row duplicate detection, solver, par-band, and objective-feasibility rejection.
- `src/lib/games/ice-slide/run.ts` — materialized stage signature and run contracts.
- `src/lib/games/ice-slide/daily.ts` — reference ordering for validate-first objective selection.

`getUniqueBoardTransforms()` has one narrow Expedition use: **after** a candidate/fallback is fully materialized, derive the transform-orbit canonical key used for in-run duplicate detection. Do not use it to choose the template transform or to deduplicate partially authored templates.

Do not reuse `src/lib/games/circuit-hacker/generator.ts`; it uses `Math.random()` and has unrelated generation semantics.

The private `assertUniqueNonEmpty()` / `assertPositiveInt()` helpers in `run.ts` remain private. Exporting run-schema internals only to validate checked-in authoring content would increase coupling; `templates.ts` keeps tiny local Set/integer checks instead.

## 3. Approaches considered

### 3.1 Recommended: typed catalog + one-stage materializer

Keep static authoring data in `templates.ts`, bounded deterministic materialization in `generator.ts`, and content validation in one shared helper consumed by test and CLI entry points.

HPA-490 receives a narrow seam: call the stage materializer six times with stage numbers 1–6 and an accumulating canonical-key set.

### 3.2 Full six-stage Expedition run now

Rejected. HPA-490 owns run assembly, random seed creation, Retry Seed/New Expedition, persistence, and browser integration.

### 3.3 Generic generated-level framework / template DSL

Rejected. Only Ice Slide consumes mutation templates. Typed checked-in TypeScript data is smaller and easier to review than a registry, JSON schema, plugin interface, or generalized maze generator.

## 4. Fixed decisions

1. HPA-489 produces individual stages, not `IceSlideRunDefinition` values.
2. `IceSlidePlayableMode` remains `campaign | daily`.
3. Ship exactly nine generator-v1 templates: three easy, three medium, three hard.
4. Template `baseRows` contain only `#`, `.`, and exactly one `S`; no `G`, `O`, `H`, or `C`.
5. Select exactly one named goal and one complete named pattern from rocks, hazards, and crystals. `none=[]` is explicit; never choose arbitrary subsets.
6. Transform `baseRows` and every slot coordinate with the same `BoardTransform` before mutation placement.
7. Each template owns `allowedTransforms`. V1 uses all eight transforms for all nine templates, but the field stays because HPA-489 explicitly defines allowed transforms per authored template and later content may narrow them.
8. Record stable category-prefixed mutation IDs such as `goal:south`, `rocks:center`, `hazards:none`, and `crystals:pair`.
9. `scoreMultiplierBps` is `10_000`; HPA-491 owns risk/reward multipliers.
10. Validate a materialized board with `objectiveIds: []` first. After acceptance, choose exactly one bonus objective from `quality.objectiveFeasibility` in fixed order `collect_all_crystals`, `no_falls`, `no_reset`.
11. Candidate generation makes at most **64 attempts per stage**; each solver call uses **10,000 max states**.
12. Generation never calls `Math.random()` or `crypto.getRandomValues()`. HPA-490 owns one-time random seed creation.
13. In-run duplicate identity is **transform-invariant**: rotated/reflected copies of the same fully materialized puzzle are duplicates.
14. After 64 candidate failures, try the requested tier's three checked-in full-row fallbacks in deterministic seeded order.
15. Fallbacks pass the same transform-invariant duplicate check, solver, par, reachable-stop, and hazard checks with `objectiveIds: []`; select the objective only after acceptance.
16. A fallback records `transform: 'identity'` and `mutationIds: ['fallback:<fallbackId>']`.
17. Fallback use returns `usedFallback`, `attempts`, and rejection metadata **and emits one development-only `console.warn`**. Do not add logger injection.
18. If all tier fallbacks are invalid or duplicate, throw. There is no emergency board or unbounded retry.
19. Campaign levels and Daily pools remain unchanged. Fallback literals may mirror solver-proven Campaign rows, but generator-v1 never imports `ICE_SLIDE_LEVELS` as content.
20. Generator/content changes that alter same-input output require an Expedition generator-version bump. `ICE_SLIDE_RULESET_VERSION` does not change for this work.
21. HPA-489 requires canonical-board uniqueness, not template-ID uniqueness. Different accepted mutations from the same template may appear in one future run if their transform-invariant final boards differ; do not add anticipatory `existingTemplateIds` state.

## 5. Template contracts

Keep authoring-only shapes beside the content rather than adding them to `types.ts`:

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
```

Checked-in catalog validation asserts:

- unique non-empty template/fallback/slot IDs;
- rectangular non-empty rows;
- exactly one `S` and no `G/O/H/C` in `baseRows`;
- non-empty unique `allowedTransforms`;
- at least one goal and one rock/hazard/crystal pattern;
- authored positions are in bounds and land on `.` in untransformed `baseRows`;
- no duplicate coordinates inside one pattern;
- positive ordered par band, positive `minReachableStops`, non-negative integer `maxHazards`;
- `fallbackVariantId` resolves to a fallback with matching template and difficulty;
- the nine base template families have distinct transform-orbit keys, so one authored family is not merely a rotated/reflected copy of another.

Cross-category positions may overlap across alternatives. Only an actually selected overlap is rejected as `materialization_collision`.

## 6. Locked generator-v1 template families

Coordinates are zero-based `(row,col)`. IDs, array ordering, rows, coordinates, constraints, and transform lists are generator-versioned content.

Every v1 template uses:

```ts
allowedTransforms: [...BOARD_TRANSFORMS]
```

### 6.1 Easy

#### `easy-open-lane`

```ts
baseRows = ['#####', '#S..#', '#...#', '#...#', '#####']
goals = {
  'goal:south': (3,1),
  'goal:southeast': (3,3),
  'goal:east': (2,3),
}
rocks = {
  'rocks:none': [],
  'rocks:center': [(2,2)],
}
hazards = {
  'hazards:none': [],
  'hazards:west': [(2,1)],
}
crystals = {
  'crystals:none': [],
  'crystals:northeast': [(1,3)],
  'crystals:south-mid': [(3,2)],
}
constraints = { parBand: [1,4], minReachableStops: 3, maxHazards: 1 }
fallbackVariantId = 'easy-open-lane-v1'
```

#### `easy-corner-pocket`

```ts
baseRows = ['######', '#S#..#', '#....#', '##.#.#', '#....#', '######']
goals = {
  'goal:southeast': (4,4),
  'goal:northeast': (1,4),
  'goal:east-pocket': (3,4),
}
rocks = {
  'rocks:none': [],
  'rocks:center-left': [(2,2)],
  'rocks:lower-mid': [(4,2)],
}
hazards = {
  'hazards:none': [],
  'hazards:center': [(2,3)],
}
crystals = {
  'crystals:none': [],
  'crystals:left-mid': [(2,1)],
  'crystals:lower-left': [(4,1)],
}
constraints = { parBand: [2,5], minReachableStops: 3, maxHazards: 1 }
fallbackVariantId = 'easy-corner-pocket-v1'
```

#### `easy-bank-shot`

```ts
baseRows = [
  '#######', '#S.#..#', '#...#.#', '##....#',
  '#.#.#.#', '#.....#', '#######',
]
goals = {
  'goal:southeast': (5,5),
  'goal:northeast': (1,5),
  'goal:east-notch': (4,5),
}
rocks = {
  'rocks:none': [],
  'rocks:center': [(3,3)],
  'rocks:lower-center': [(5,3)],
}
hazards = {
  'hazards:none': [],
  'hazards:center-east': [(3,4)],
}
crystals = {
  'crystals:none': [],
  'crystals:upper-mid': [(2,3)],
  'crystals:lower-left': [(5,2)],
}
constraints = { parBand: [3,6], minReachableStops: 5, maxHazards: 1 }
fallbackVariantId = 'easy-bank-shot-v1'
```

### 6.2 Medium

#### `medium-thin-ice`

```ts
baseRows = [
  '#######', '#S....#', '##.#..#', '#.....#',
  '#..#.##', '#.....#', '#######',
]
goals = {
  'goal:southeast': (5,5),
  'goal:south-mid': (5,2),
  'goal:west-notch': (4,1),
}
rocks = {
  'rocks:none': [],
  'rocks:center': [(3,3)],
  'rocks:north-east': [(1,4)],
}
hazards = {
  'hazards:none': [],
  'hazards:north': [(2,4)],
  'hazards:south': [(4,2)],
  'hazards:pair': [(2,4),(4,2)],
}
crystals = {
  'crystals:none': [],
  'crystals:center-east': [(3,4)],
  'crystals:south-center': [(5,3)],
}
constraints = { parBand: [4,7], minReachableStops: 5, maxHazards: 2 }
fallbackVariantId = 'medium-thin-ice-v1'
```

#### `medium-crystal-cache`

```ts
baseRows = [
  '########', '#S#....#', '#......#', '#......#',
  '##..#.##', '#......#', '#.#....#', '#......#', '########',
]
goals = {
  'goal:southeast': (7,6),
  'goal:south-mid': (7,4),
  'goal:west-pocket': (5,1),
}
rocks = {
  'rocks:none': [],
  'rocks:upper-center': [(2,4)],
  'rocks:lower-east': [(6,5)],
}
hazards = {
  'hazards:none': [],
  'hazards:upper-east': [(2,5)],
  'hazards:lower-mid': [(6,3)],
}
crystals = {
  'crystals:none': [],
  'crystals:northwest': [(3,2)],
  'crystals:east': [(5,6)],
  'crystals:pair': [(3,2),(5,6)],
}
constraints = { parBand: [5,9], minReachableStops: 6, maxHazards: 1 }
fallbackVariantId = 'medium-crystal-cache-v1'
```

#### `medium-fracture-zone`

```ts
baseRows = [
  '########', '#S#....#', '#..#...#', '#......#',
  '##.#.#.#', '#......#', '#......#', '########',
]
goals = {
  'goal:southeast': (6,6),
  'goal:east': (5,6),
  'goal:southwest': (6,1),
}
rocks = {
  'rocks:none': [],
  'rocks:west-notch': [(4,2)],
  'rocks:center': [(3,4)],
}
hazards = {
  'hazards:none': [],
  'hazards:north': [(2,4)],
  'hazards:southwest': [(6,2)],
  'hazards:pair': [(2,4),(6,2)],
}
crystals = {
  'crystals:none': [],
  'crystals:center-left': [(3,2)],
  'crystals:lower-east': [(5,5)],
}
constraints = { parBand: [3,7], minReachableStops: 5, maxHazards: 2 }
fallbackVariantId = 'medium-fracture-zone-v1'
```

### 6.3 Hard

#### `hard-deep-freeze`

```ts
baseRows = [
  '#########', '#S#.....#', '#...#.#.#', '#.......#',
  '##..#..##', '#.......#', '#.#.#...#', '#.......#', '#########',
]
goals = {
  'goal:southeast': (7,7),
  'goal:south-mid': (7,5),
  'goal:east-pocket': (5,7),
}
rocks = {
  'rocks:none': [],
  'rocks:center-north': [(3,4)],
  'rocks:center-south': [(5,4)],
}
hazards = {
  'hazards:none': [],
  'hazards:mid-east': [(4,5)],
  'hazards:lower-west': [(6,3)],
}
crystals = {
  'crystals:none': [],
  'crystals:northwest': [(3,2)],
  'crystals:east': [(5,6)],
  'crystals:pair': [(3,2),(5,6)],
}
constraints = { parBand: [5,10], minReachableStops: 7, maxHazards: 1 }
fallbackVariantId = 'hard-deep-freeze-v1'
```

#### `hard-absolute-zero`

```ts
baseRows = [
  '#########', '#S#.....#', '#...#.#.#', '#.......#',
  '##.....##', '#.......#', '#.#...#.#', '#.......#', '#########',
]
goals = {
  'goal:southeast': (7,7),
  'goal:east-pocket': (5,7),
  'goal:south-mid': (7,5),
}
rocks = {
  'rocks:none': [],
  'rocks:lower-center': [(6,4)],
  'rocks:upper-center': [(3,4)],
}
hazards = {
  'hazards:none': [],
  'hazards:center': [(4,4)],
  'hazards:lower-west': [(6,3)],
}
crystals = {
  'crystals:none': [],
  'crystals:northwest': [(3,2)],
  'crystals:east': [(5,6)],
  'crystals:pair': [(3,2),(5,6)],
}
constraints = { parBand: [5,10], minReachableStops: 7, maxHazards: 1 }
fallbackVariantId = 'hard-absolute-zero-v1'
```

#### `hard-zero-cross`

`hard-zero-cross` is intentionally rectangular so it cannot be in the 9×9 transform orbit of the other hard families.

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
goals = {
  'goal:southeast': (6,7),
  'goal:south-mid': (6,4),
  'goal:east-pocket': (3,7),
}
rocks = {
  'rocks:none': [],
  'rocks:center-west': [(4,2)],
  'rocks:center-east': [(5,6)],
}
hazards = {
  'hazards:none': [],
  'hazards:center': [(4,5)],
  'hazards:upper-east': [(2,6)],
}
crystals = {
  'crystals:none': [],
  'crystals:northeast': [(2,5)],
  'crystals:southwest': [(6,2)],
  'crystals:pair': [(2,5),(6,2)],
}
constraints = { parBand: [5,10], minReachableStops: 7, maxHazards: 1 }
fallbackVariantId = 'hard-zero-cross-v1'
```

## 7. Checked-in full-row fallbacks

Fallbacks are explicit HPA-489 requirements. Keep them as independent literals in `templates.ts`; do not import `ICE_SLIDE_LEVELS`.

```ts
'easy-open-lane-v1' =
  ['#####', '#S..#', '#...#', '#G..#', '#####']

'easy-corner-pocket-v1' =
  ['######', '#S#..#', '#....#', '##.#.#', '#...G#', '######']

'easy-bank-shot-v1' = [
  '#######', '#S.#..#', '#...#.#', '##....#',
  '#.#.#.#', '#....G#', '#######',
]

'medium-thin-ice-v1' = [
  '#######', '#S....#', '##.#H.#', '#.....#',
  '#.H#.##', '#....G#', '#######',
]

'medium-crystal-cache-v1' = [
  '########', '#S#....#', '#......#', '#.C....#',
  '##..#.##', '#.....C#', '#.#....#', '#.....G#', '########',
]

'medium-fracture-zone-v1' = [
  '########', '#S#....#', '#..#H..#', '#......#',
  '##O#.#.#', '#......#', '#.H...G#', '########',
]

'hard-deep-freeze-v1' = [
  '#########', '#S#.....#', '#...#.#.#', '#.C.....#',
  '##..#..##', '#.....C.#', '#.#.#...#', '#......G#', '#########',
]

'hard-absolute-zero-v1' = [
  '#########', '#S#.....#', '#...#.#.#', '#.C.....#',
  '##..H..##', '#.....C.#', '#.#.O.#.#', '#......G#', '#########',
]

'hard-zero-cross-v1' = [
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

The first eight intentionally copy currently solver-proven Campaign rows as independent literals. The ninth is authored from the distinct rectangular `hard-zero-cross` topology. Task 2 validates every fallback with the production solver/quality gate; if a literal fails its owning template constraints, retune the literal/constraint in both design and code rather than weakening the shared gate.

## 8. Quality-gate extension

Extend additively:

```ts
export interface IceSlideStageQualityConstraints {
    parBand: { minMoves: number; maxMoves: number }
    maxStates: number
    existingCanonicalKeys?: ReadonlySet<string>
    minReachableStops?: number
    maxHazards?: number
}
```

Add:

```ts
| 'reachable_stops_below_min'
| 'too_many_hazards'
```

Existing deterministic order remains:

1. validate constraints;
2. parse/serialize board;
3. literal-row duplicate check;
4. solve;
5. truncation;
6. unsolvable;
7. par band;
8. reachable-stop floor;
9. hazard ceiling;
10. assigned objective feasibility;
11. accept.

Both fields are optional. Daily passes neither, so Daily generator-v1 remains byte-stable. Reuse `solveResult.reachableStopCount` and existing `countGlyphs()`.

HPA-489 generator calls quality with `objectiveIds: []` and **without** `existingCanonicalKeys`; Expedition owns stronger transform-orbit duplicate checking before the quality call. The quality gate keeps its current literal-row duplicate feature for existing consumers such as Daily/direct tests.

## 9. Deterministic one-stage materializer

Expose:

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

`existingCanonicalKeys` and the returned `canonicalKey` use the same transform-invariant final-board identity.

### 9.1 Transform-invariant board key

Keep this helper local to `generator.ts`:

```ts
function getTransformInvariantCanonicalKey(rows: readonly string[]): string {
    return getUniqueBoardTransforms(rows)
        .map(variant => variant.canonicalKey)
        .sort()[0]
}
```

This intentionally reuses `getUniqueBoardTransforms()` **only on complete materialized rows**. It collapses all rotations/reflections of one puzzle to one key without changing Daily or `quality.ts`.

### 9.2 Frozen RNG paths

```text
root:      createSeededRng(seed).fork('expedition:g1').fork('stage:<N>')
attempt:   root.fork('attempt:<1..64>')
template:  attempt.fork('template')
transform: attempt.fork('transform')
goal:      attempt.fork('goal')
rocks:     attempt.fork('rocks')
hazards:   attempt.fork('hazards')
crystals:  attempt.fork('crystals')
objective: attempt.fork('objective')  # consumed only after board quality accepts
fallback:  root.fork('fallback')
```

### 9.3 Candidate order

For attempts 1–64:

1. pick one template from the requested tier;
2. pick one `allowedTransform`;
3. transform `baseRows` and all slot coordinates;
4. pick one transformed goal and one complete rocks/hazards/crystals pattern;
5. materialize goal → rocks → hazards → crystals; selected overlaps/non-ice targets reject as `materialization_collision`;
6. derive the transform-invariant final-board key; if `existingCanonicalKeys` contains it, increment `duplicate_board` and continue;
7. call `validateIceSlideStageQuality()` with `objectiveIds: []`, template par/stops/hazard constraints, `10_000` states, and **no** `existingCanonicalKeys`;
8. on quality rejection, increment `quality.reason` and continue;
9. on acceptance, filter fixed `OBJECTIVE_ORDER` through `quality.objectiveFeasibility` and pick with `attemptRng.fork('objective')`;
10. build/sign the stage and return the transform-invariant canonical key.

```ts
const OBJECTIVE_ORDER = [
    'collect_all_crystals',
    'no_falls',
    'no_reset',
] as const
```

Do not export Daily's private objective constant or add a shared objective service.

Accepted candidate metadata remains:

```ts
{
  id: `expedition:${stageNumber}`,
  name: template.name,
  templateId: template.id,
  difficulty: template.difficulty,
  rows,
  parMoves: quality.parMoves,
  transform,
  mutationIds: [goal.id, rocks.id, hazards.id, crystals.id],
  objectiveIds: [bonusObjective],
  scoreMultiplierBps: 10_000,
  signature: createIceSlideStageSignature(...),
}
```

## 10. Exhaustion and fallback semantics

After 64 rejected candidates:

1. resolve the three fallbacks for the tier;
2. shuffle with `stageRng.fork('fallback')`;
3. for each fallback, derive the transform-invariant key and reject it as `duplicate_board` if already used;
4. call quality with `objectiveIds: []`, owning template constraints, and no literal duplicate set;
5. after acceptance, pick the bonus objective from `quality.objectiveFeasibility` using `stageRng.fork(`fallback:${fallback.id}:objective`)`;
6. build with `transform: 'identity'`, `mutationIds: [`fallback:${fallback.id}`]`, `usedFallback: true`, `attempts: 64`, and return the transform-invariant key;
7. emit exactly one stable development diagnostic:

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

Do not log the raw seed and do not inject a logger.

If all three fallbacks are invalid/duplicate, throw an `Error` containing stage number and difficulty but no player-facing text.

## 11. One validation loop, two depths

Keep:

```json
"validate:ice-slide-expedition": "bun scripts/validate-ice-slide-expedition.ts"
```

The script file exports the shared loop:

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

`generator.validation.test.ts` calls it with 100. The CLI calls the same function with 1,000 behind a main-module guard and prints stable JSON summaries.

For each seed generate two same-tier future slots:

- easy: stages 1, 2;
- medium: 3, 4;
- hard: 5, 6.

Thread stage 1's **transform-invariant** key into stage 2. The shared loop checks:

- the two orbit keys differ;
- recomputing `getTransformInvariantCanonicalKey(stage.rows)` equals the returned key;
- repeated generation is byte-identical;
- final stages independently pass quality with selected objectives and owning constraints;
- par matches the quality result;
- the production solver is solvable and not truncated;
- metadata/signature remain internally consistent.

Aggregate attempts, **worst attempt count**, fallback count, closed-union rejection counts, and worst solver-state count. Sort rejection keys before CLI printing.

The 100-seed smoke intentionally has no hardware-dependent wall-clock assertion. Vitest's normal timeout already prevents a hung test, while deterministic `worstAttempts`, total attempts, and solver-state metrics expose content-cost regressions without making CI depend on machine speed. There is no fallback-rate/rejection-rate product SLA and no new GitHub Actions job.

## 12. File boundaries

### Create

- `src/lib/games/ice-slide/templates.ts`
- `src/lib/games/ice-slide/templates.test.ts`
- `src/lib/games/ice-slide/generator.ts`
- `src/lib/games/ice-slide/generator.test.ts`
- `src/lib/games/ice-slide/generator.validation.test.ts`
- `scripts/validate-ice-slide-expedition.ts`

### Modify

- `src/lib/games/ice-slide/quality.ts`
- `src/lib/games/ice-slide/quality.test.ts`
- `package.json`

### Explicitly unchanged

- `levels.ts` and Daily stage pools/output;
- `game.ts`, `init.ts`, renderer, and Ice Slide page;
- `IceSlidePlayableMode`;
- score APIs, DB schema, leaderboards, and personal-history persistence;
- `ICE_SLIDE_RULESET_VERSION`;
- snow, cracked ice, Undo, route choice, and abilities.

## 13. Testing requirements

Unit tests lock:

- all nine template IDs/tier counts/fallback links and structural validation;
- transform-orbit uniqueness of all nine template bases;
- all nine fallback boards accepted independently by production quality rules;
- transformed slot coordinates use the same transform as `baseRows`;
- complete pattern selection, not arbitrary subsets;
- materialization collision rejection;
- optional quality constraints/rejection order;
- transform-invariant duplicate rejection for rotated/reflected final boards;
- exact 64-attempt cap;
- stable RNG paths through explicit inline generator-v1 goldens;
- byte-equivalent repeated output/rejection/fallback traces;
- caller canonical Set is never mutated;
- deterministic fallback order, one development warning, and `usedFallback` metadata;
- all-fallback-invalid throw behavior;
- `Math.random` patched to throw without affecting generation;
- shared validation loop at 100 seeds per tier.

Do not use Vitest snapshots. One frozen seed per tier asserts rows, transform, mutation IDs, objective IDs, par, and signature inline. Changing those literals is an explicit generator-version decision.

## 14. Acceptance checklist

HPA-489 is complete when:

- three easy, three medium, and three hard template families plus nine full-row fallbacks are checked in;
- no two template bases are transform-equivalent;
- every fallback passes structural and production quality validation;
- same seed/version/stage/difficulty/existing-orbit-key input reproduces stage data and rejection/fallback behavior;
- rotated/reflected copies of an already-used final puzzle are rejected;
- accepted stages satisfy start/goal shape, solver cap, par band, selected-objective feasibility, reachable-stop floor, hazard ceiling, and canonical uniqueness;
- no generator path uses `Math.random()`, `crypto.getRandomValues()`, logger injection, or unbounded retry;
- exactly 64 candidate attempts precede deterministic fallback selection;
- fallback use emits one development-only diagnostic and remains playable if every generated candidate rejects;
- the 100-seed Vitest smoke uses the same helper as the 1,000-seed command;
- validation output includes attempts, worst attempts, rejections, fallbacks, and worst solver states;
- Campaign/Daily content and output remain unchanged;
- no HPA-490 UI/run/persistence work is included.

## 15. Out of scope

- six-stage `IceSlideRunDefinition` assembly;
- Expedition seed creation;
- Retry Seed / New Expedition UI;
- Expedition mode selector/HUD/results;
- Expedition score submission/history;
- global Expedition leaderboard/calibration;
- Safe/Risky route choices, Undo, non-1.00× multipliers;
- snow/cracked ice/dynamic solver state;
- arbitrary wall placement/procedural maze generation;
- JSON authoring, editor, registry, generator class, worker, cache, generic cross-game generation.

## 16. Review-resolution notes

- The stale-branch finding about missing prior revisions does not apply to the current branch; validate-first objectives, shared validation helper, explicit goldens, closed rejection types, and corrected foundation paths were already committed before this revision.
- Transform-invariant duplicate detection is accepted and now uses the existing transform-orbit enumerator on **final materialized rows only**.
- The old `hard-zero-cross` was exactly a transformed `hard-absolute-zero`; it is replaced by a distinct rectangular topology and fallback.
- Removing fallbacks is rejected because HPA-489 explicitly requires a full-row fallback per template, deterministic fallback on exhaustion, a development-visible fallback diagnostic, and playable fallbacks when every candidate rejects.
- `existingTemplateIds` is not added: HPA-489 specifies canonical puzzle uniqueness, not unique template IDs, and a same-template/different-mutation stage is valid variety.
- `allowedTransforms` stays because it is an explicit authored-template requirement even though all v1 templates currently choose all eight.
- No hardware-dependent wall-clock test is added; deterministic attempt/state metrics are expanded instead.
