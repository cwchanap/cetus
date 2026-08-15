# Ice Slide Authored Mutation Templates and Bounded Generation — Design

- **Date:** 2026-08-14
- **Status:** Proposed for HPA-489 implementation
- **Repository:** `cwchanap/cetus`
- **Linear issue:** HPA-489 — Build authored Ice Slide mutation templates and bounded seeded level generation
- **Foundation designs:**
  - `docs/superpowers/specs/2026-08-02-deterministic-ice-slide-runs-design.md`
  - `docs/superpowers/specs/2026-08-03-ice-slide-production-solver-design.md`

## 1. Summary

HPA-489 is the first Phase 2 Ice Slide replayability task. The current repository already has the seams this work needs:

- deterministic materialized stage/run contracts, seeded RNG, transforms, and signatures from HPA-485;
- the bounded production solver and pure stage-quality gate from HPA-486;
- Daily objective/scoring semantics and a proven materialize-before-play boundary from HPA-487.

HPA-489 should stay one layer below Expedition mode:

- `templates.ts` owns nine checked-in mutation templates and nine complete known-good fallback boards;
- `generator.ts` materializes **one deterministic `IceSlideStageDefinition` at a time** from an explicit seed, stage number, difficulty, and caller-owned canonical-key set;
- `quality.ts` gains only the two authored constraints it cannot currently express: minimum reachable stops and maximum hazards;
- one validation loop is reused at two depths: 100 seeds per tier in Vitest and 1,000 seeds per tier from a Bun command;
- HPA-490 remains responsible for creating a random Expedition seed, assembling six stages, Retry Seed/New Expedition, browser UX, and personal-result persistence.

No generator framework, template DSL, registry, worker, cache, UI, database work, or dynamic-tile machinery is needed.

## 2. Ownership and existing seams

Use the existing repository boundaries directly:

- `src/lib/games/shared/seeded-rng.ts` — stable FNV-1a/Mulberry32, unbiased `nextInt`, `pick`, `shuffle`, and labeled forks.
- `src/lib/games/ice-slide/transforms.ts` — `transformRows()` and `transformPosition()` for all eight board symmetries.
- `src/lib/games/ice-slide/solver.ts` — bounded BFS with `reachableStopCount`, crystal facts, explored-state count, and truncation.
- `src/lib/games/ice-slide/quality.ts` — parsing, duplicate, solver, par-band, and objective-feasibility rejection.
- `src/lib/games/ice-slide/run.ts` — `IceSlideStageDefinition`, signatures, and versioned run contracts.
- `src/lib/games/ice-slide/daily.ts` — reference ordering for validate-first objective selection.

Do not use `getUniqueBoardTransforms()` for Expedition generation. Daily applies it to complete authored boards; Expedition transforms `baseRows` and authored slot coordinates first, then materializes mutations, and canonical uniqueness is evaluated on the resulting final board.

Do not reuse `src/lib/games/circuit-hacker/generator.ts`; it uses `Math.random()` and has unrelated generation semantics.

## 3. Approaches considered

### 3.1 Recommended: authored catalog + one-stage materializer

Keep static template data in `templates.ts`, bounded deterministic materialization in `generator.ts`, and content validation in one shared validation function used by test and CLI entry points.

This gives HPA-490 a narrow seam: call the stage materializer six times with stage numbers 1–6 and an accumulating canonical-key set.

### 3.2 Full six-stage Expedition run now

Rejected. HPA-490 owns run assembly, random seed creation, Retry Seed/New Expedition, personal-result persistence, and browser integration.

### 3.3 Generic generated-level framework / template DSL

Rejected. Only Ice Slide consumes mutation templates. Typed checked-in TypeScript data is smaller and easier to review than a registry, JSON schema, plugin interface, or generalized maze generator.

## 4. Fixed decisions

1. HPA-489 produces individual stages, not `IceSlideRunDefinition` values.
2. `IceSlidePlayableMode` remains `campaign | daily`.
3. Ship exactly nine generator-v1 templates: three easy, three medium, three hard.
4. Template `baseRows` contain only `#`, `.`, and exactly one `S`; they contain no `G`, `O`, `H`, or `C`.
5. Select exactly one named goal and exactly one complete named pattern from rocks, hazards, and crystals. `none=[]` is an explicit pattern; never choose arbitrary subsets.
6. Transform `baseRows` and every slot coordinate with the same `BoardTransform` before mutation placement.
7. Record stable category-prefixed mutation IDs such as `goal:south`, `rocks:center`, `hazards:none`, and `crystals:pair`.
8. `scoreMultiplierBps` is `10_000` for HPA-489. HPA-491 owns risk/reward multipliers.
9. Validate the materialized board with `objectiveIds: []` first. After an accepted quality result, choose exactly one bonus objective from `quality.objectiveFeasibility` in the fixed order `collect_all_crystals`, `no_falls`, `no_reset`. This matches Daily and avoids rejecting a playable board because a syntactically eligible objective happened to be infeasible.
10. Candidate generation makes at most **64 attempts per stage**; each solver call uses **10,000 max states**.
11. Generation never calls `Math.random()` or `crypto.getRandomValues()`. HPA-490 owns one-time random seed creation.
12. After 64 candidate failures, try the requested tier's three checked-in full-row fallbacks in deterministic seeded order.
13. Fallback boards go through the same duplicate, solver, par, reachable-stop, and hazard checks with `objectiveIds: []`; choose the bonus objective only after a fallback is accepted.
14. A fallback records `transform: 'identity'` and `mutationIds: ['fallback:<fallbackId>']`.
15. Fallback use is returned as metadata only. The materializer does not log. Validation tooling owns tuning/report output.
16. If all tier fallbacks are invalid or duplicate, throw. There is no emergency board or unbounded retry.
17. Campaign levels and Daily pools remain unchanged. Fallback literals may mirror current Campaign rows, but are copied into `templates.ts`; generator-v1 does not import `ICE_SLIDE_LEVELS` as content.
18. Generator/content changes that alter same-input output require an Expedition generator-version bump. `ICE_SLIDE_RULESET_VERSION` does not change for this work.

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

Template validation is simple checked-in-content validation, not a Zod/runtime schema. Assert:

- unique non-empty template/fallback/slot IDs;
- rectangular non-empty rows;
- exactly one `S` and no `G/O/H/C` in `baseRows`;
- non-empty unique `allowedTransforms`;
- at least one goal and one rock/hazard/crystal pattern;
- authored positions are in bounds and land on `.` in untransformed `baseRows`;
- no duplicate coordinates inside one pattern;
- positive ordered par band, positive `minReachableStops`, non-negative integer `maxHazards`;
- `fallbackVariantId` resolves to a fallback with matching template and difficulty.

Cross-category positions may overlap across different alternatives. Only an actually selected overlap is rejected as `materialization_collision`.

## 6. Locked generator-v1 template families

Coordinates are zero-based `(row,col)`. IDs and ordering below are generator-versioned content.

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

```ts
baseRows = [
  '#########', '#...#..S#', '#.#....##', '#.......#',
  '#.....#.#', '#.......#', '#.#...#.#', '#...#...#', '#########',
]
goals = {
  'goal:southwest': (7,1),
  'goal:south-mid': (7,3),
  'goal:west-pocket': (5,1),
}
rocks = {
  'rocks:none': [],
  'rocks:center-west': [(4,2)],
  'rocks:center-east': [(4,5)],
}
hazards = {
  'hazards:none': [],
  'hazards:center': [(4,4)],
  'hazards:upper-east': [(3,6)],
}
crystals = {
  'crystals:none': [],
  'crystals:northeast': [(2,5)],
  'crystals:southwest': [(6,3)],
  'crystals:pair': [(2,5),(6,3)],
}
constraints = { parBand: [5,10], minReachableStops: 7, maxHazards: 1 }
fallbackVariantId = 'hard-zero-cross-v1'
```

These are candidate spaces, not promises that every combination is valid. The bounded gate may reject collisions, invalid/duplicate boards, truncation, unsolvable boards, out-of-band pars, too few reachable stops, or too many hazards.

## 7. Checked-in full-row fallbacks

Keep fallbacks as literals in `templates.ts`; do not import `ICE_SLIDE_LEVELS`.

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
  '#########', '#...#..S#', '#.#..C.##', '#.......#',
  '#.O.H.#.#', '#.......#', '#.#C..#.#', '#G..#...#', '#########',
]
```

The first eight intentionally copy currently solver-proven Campaign rows as independent literals; the ninth is a full-row rotated variant. If a fallback fails its owning template's par/stops/hazard constraints during implementation, retune that literal or constraint in both this design and code; do not weaken the shared quality gate.

## 8. Quality-gate extension

Extend the current constraint shape additively:

```ts
export interface IceSlideStageQualityConstraints {
    parBand: { minMoves: number; maxMoves: number }
    maxStates: number
    existingCanonicalKeys?: ReadonlySet<string>
    minReachableStops?: number
    maxHazards?: number
}
```

Add two closed rejection reasons:

```ts
| 'reachable_stops_below_min'
| 'too_many_hazards'
```

Deterministic order remains:

1. validate constraints;
2. parse/serialize board;
3. duplicate check;
4. solve;
5. reject truncation;
6. reject unsolvable;
7. reject par outside band;
8. reject reachable-stop count below minimum;
9. reject hazard count above maximum;
10. reject assigned objective infeasibility;
11. accept.

Both new fields are optional. Daily passes neither, so Daily generator-v1 remains byte-stable. Reuse `solveResult.reachableStopCount` and the existing `countGlyphs()` helper; do not add a second board scanner.

HPA-489 generator calls the quality gate with `objectiveIds: []`, so `objective_infeasible` remains a direct quality-gate behavior/test but is not expected from the normal Expedition candidate/fallback path.

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

`stageNumber` is a positive safe integer. Stage ID is `expedition:<stageNumber>`.

### 9.1 Frozen RNG paths

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

Fork labels, catalog order, and the order below are generator-versioned behavior.

### 9.2 Candidate order

For attempts 1–64:

1. pick one template from the requested tier;
2. pick one `allowedTransform`;
3. transform `baseRows` and all slot coordinates with `transformRows()` / `transformPosition()`;
4. pick one transformed goal and one complete transformed rocks/hazards/crystals pattern;
5. materialize in category order goal → rocks → hazards → crystals; reject any selected collision/non-ice target as `materialization_collision`;
6. call `validateIceSlideStageQuality()` with `objectiveIds: []`, the template par band, `10_000` states, caller canonical keys, `minReachableStops`, and `maxHazards`;
7. on rejection, increment `quality.reason` and continue;
8. on acceptance, build eligible objectives in the fixed order below from `quality.objectiveFeasibility` and pick with `attemptRng.fork('objective')`:

   ```ts
   const OBJECTIVE_ORDER = [
       'collect_all_crystals',
       'no_falls',
       'no_reset',
   ] as const
   ```

9. materialize `IceSlideStageDefinition` with the accepted par/canonical key and `createIceSlideStageSignature()`;
10. return immediately.

Do not export or reuse Daily's private objective-order constant. Copy these three IDs into `generator.ts`; a shared objective-selection service would be more machinery than this task needs.

Accepted candidate metadata is:

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

1. resolve the three fallbacks for the requested tier;
2. shuffle them with `stageRng.fork('fallback')`;
3. for each fallback, call `validateIceSlideStageQuality()` with `objectiveIds: []`, the owning template constraints, and caller canonical keys;
4. if rejected, continue to the next fallback;
5. if accepted, select the bonus objective from `quality.objectiveFeasibility` using the same fixed objective order and `stageRng.fork(`fallback:${fallback.id}:objective`)`;
6. return the first accepted fallback with `transform: 'identity'`, `mutationIds: [`fallback:${fallback.id}`]`, `usedFallback: true`, `attempts: 64`, and the accumulated closed-union `rejectionCounts`.

The generator does **not** call `console.warn`. `IceSlideGeneratedStage` already reports fallback use, attempts, and rejections; the content-validation command is the tuning/diagnostic surface.

If all three fallbacks are invalid or duplicate, throw an `Error` containing stage number and difficulty but no player-facing text.

There are three fallbacks per tier so HPA-490 can later request two same-tier stages without a single fallback board necessarily duplicating an earlier stage.

## 11. One validation loop, two depths

Keep the package script:

```json
"validate:ice-slide-expedition": "bun scripts/validate-ice-slide-expedition.ts"
```

The script file also exports the one reusable loop:

```ts
export function runIceSlideExpeditionValidation(options: {
    seedsPerTier: number
    onStage?: (stage: IceSlideGeneratedStage) => void
}): IceSlideExpeditionValidationSummary[]
```

`generator.validation.test.ts` imports that helper and runs it with `seedsPerTier: 100`. The CLI entry point invokes the same helper with `seedsPerTier: 1_000` and prints one stable JSON summary per tier. Keep the CLI execution behind a main-module guard so importing the helper in Vitest does not print or run the 1,000-seed sweep.

Seed keys are:

```text
ice-slide:validate:v1:<difficulty>:0000
...
ice-slide:validate:v1:<difficulty>:<N-1 padded to 4 digits>
```

For each seed generate two same-tier stages using the future Expedition slots:

- easy: 1 then 2;
- medium: 3 then 4;
- hard: 5 then 6.

Thread stage 1's canonical key into stage 2. The shared loop checks:

- stage 2 canonical key differs from stage 1;
- repeated generation is byte-identical;
- each final stage independently passes `validateIceSlideStageQuality()` with its owning template constraints and `objectiveIds: stage.objectiveIds`;
- par matches the quality result;
- `solveIceSlideBoard(..., { maxStates: 10_000 })` is solvable and not truncated;
- metadata/signature remain internally consistent.

Return/aggregate per-tier:

```ts
interface IceSlideExpeditionValidationStats {
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
```

Sort rejection keys before CLI printing. Do not reopen diagnostics as `Record<string, number>`. There is no rejection-rate/fallback-rate SLA and no new GitHub Actions job.

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

- nine template IDs/tier counts/fallback links and structural validation;
- all nine fallback boards accepted independently by production quality rules;
- transformed slot coordinates use the same transform as `baseRows`;
- complete pattern selection, not arbitrary subsets;
- materialization-collision rejection;
- optional quality constraints and rejection order;
- exact 64-attempt cap;
- stable RNG paths through explicit inline generator-v1 goldens;
- byte-equivalent repeated output and rejection/fallback traces;
- caller canonical-set duplicate handling without mutating that Set;
- deterministic fallback order and `usedFallback` metadata;
- all-fallback-invalid throw behavior;
- `Math.random` patched to throw without affecting generation;
- the shared validation loop at 100 seeds per tier.

Do not use Vitest snapshots. For one frozen seed per tier, assert `rows`, `transform`, `mutationIds`, `objectiveIds`, `parMoves`, and `signature` inline. Changing those expected literals is an explicit generator-version decision.

The manual command runs the same validation loop at 1,000 seeds per tier before template-pool or generator-v1 changes are merged.

## 14. Acceptance checklist

HPA-489 is complete when:

- three easy, three medium, and three hard templates plus nine complete fallbacks are checked in;
- every template/fallback passes structural validation and every fallback passes production quality validation;
- same seed/version/stage/difficulty/existing-canonical input reproduces stage data and rejection/fallback behavior;
- accepted stages satisfy start/goal shape, solver cap, par band, selected-objective feasibility, reachable-stop floor, hazard ceiling, and canonical uniqueness;
- no generator path uses `Math.random()`, `crypto.getRandomValues()`, logging, or unbounded retry;
- exactly 64 candidate attempts precede deterministic fallback selection;
- the 100-seed-per-tier Vitest smoke uses the same helper as the 1,000-seed-per-tier command;
- `bun run validate:ice-slide-expedition` prints closed-union rejection/fallback diagnostics and exits successfully;
- Campaign and Daily content/output remain unchanged;
- no HPA-490 UI/run/persistence work is included.

## 15. Out of scope

- six-stage `IceSlideRunDefinition` assembly;
- Expedition seed creation with `crypto.getRandomValues()`;
- Retry Seed / New Expedition UI;
- Expedition mode selector/HUD/results;
- Expedition score submission or personal history;
- global Expedition leaderboard/calibration;
- Safe/Risky choices, Undo, multipliers beyond `1.00×`;
- snow, cracked ice, dynamic solver state;
- arbitrary wall placement or procedural maze generation;
- JSON authoring files, editor, registry, generic generator framework.

## 16. Spec self-review

- **Placeholder scan:** no TBD/TODO or open algorithm choice remains.
- **Consistency:** quality accepts the board before generator-owned objective selection for both candidates and fallbacks.
- **Determinism:** catalog order, fork labels, attempt order, solver cap, objective order, fallback order, and metadata are explicit generator-v1 contracts.
- **Diagnostics:** `rejectionCounts` stays on the closed union; generator logging and snapshot files are absent.
- **Validation:** one loop drives both the 100- and 1,000-seed depths.
- **Scope:** HPA-490 still owns full-run behavior; HPA-489 remains content + one-stage generation only.
