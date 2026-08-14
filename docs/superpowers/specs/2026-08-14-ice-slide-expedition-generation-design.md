# Ice Slide Authored Mutation Templates and Bounded Generation — Design

- **Date:** 2026-08-14
- **Status:** Proposed for HPA-489 implementation
- **Repository:** `cwchanap/cetus`
- **Linear issue:** HPA-489 — Build authored Ice Slide mutation templates and bounded seeded level generation
- **Parent design:** `docs/superpowers/specs/2026-07-30-ice-slide-replayability-design.md`

## 1. Summary

HPA-489 is the first Phase 2 Ice Slide replayability task. HPA-485 already provides deterministic materialized runs, seeded RNG, transforms, and stage signatures; HPA-486 provides the bounded production solver and quality gate; HPA-487 provides objective/scoring semantics and proves that `IceSlideGame` should consume a fully materialized run rather than participate in generation. HPA-488 is also complete, but is not a dependency of generation.

This task should stay one layer below Expedition mode:

- `templates.ts` owns nine checked-in mutation templates and their complete known-good fallback boards.
- `generator.ts` materializes **one deterministic stage at a time** from an explicit seed, stage number, difficulty, and set of already-used canonical boards.
- `quality.ts` gains only the two authored constraints it currently cannot express: minimum reachable stops and maximum hazards.
- a checked-in validation script exercises 1,000 seeds per tier; normal Vitest coverage keeps a deterministic 100-seed-per-tier smoke sweep.
- HPA-490 remains responsible for creating a random Expedition seed, assembling six stages, exposing Retry Seed/New Expedition, persisting personal results, and making Expedition browser-playable.

No generator framework, template DSL, registry, worker, cache, UI, database work, or dynamic tile machinery is needed.

## 2. Why HPA-489 Is Next

Linear models HPA-489 as blocked by HPA-485, HPA-486, and HPA-487. All three are Done. HPA-489 then blocks HPA-490, the six-stage Expedition mode.

Current `main` already has the seams this task should reuse:

- `src/lib/games/shared/seeded-rng.ts` — stable FNV-1a/Mulberry32, unbiased `nextInt`, `pick`, `shuffle`, and labeled forks.
- `src/lib/games/ice-slide/transforms.ts` — row and coordinate transforms for all eight board symmetries.
- `src/lib/games/ice-slide/solver.ts` — bounded BFS with `reachableStopCount`, crystal facts, and truncation.
- `src/lib/games/ice-slide/quality.ts` — parsing, duplicate, solver, par-band, and objective-feasibility rejection.
- `src/lib/games/ice-slide/run.ts` — materialized stage signature and run validation.
- `src/lib/games/ice-slide/daily.ts` — a useful example of generator-owned deterministic choices without moving RNG/clock behavior into gameplay.

The correct next seam is therefore authored content plus a bounded pure-ish stage materializer, not a second runtime path.

## 3. Approaches Considered

### 3.1 Recommended: authored catalog + single-stage materializer

Keep static template data in `templates.ts`, bounded deterministic materialization in `generator.ts`, and batch validation in one script. Return an `IceSlideStageDefinition` plus small generation metadata needed for validation/diagnostics.

This fits HPA-490 cleanly: it can call the stage materializer six times with stage numbers 1–6 and an accumulating canonical-key set, without HPA-489 guessing Expedition UI or persistence behavior.

### 3.2 Build the full six-stage Expedition run now

Rejected. HPA-490 explicitly owns six-stage assembly, random seed creation, Retry Seed/New Expedition, personal-result persistence, and browser integration. Pulling those forward would create a second design PR for the same mode and blur ticket ownership.

### 3.3 Generic generated-level framework / template DSL

Rejected. Only Ice Slide consumes mutation templates today. A generic registry, JSON schema, plugin interface, or reusable maze/generator abstraction would add indirection before a second consumer exists. Checked-in typed TypeScript data is simpler to review, refactor, and validate.

## 4. Fixed Scope Decisions

1. HPA-489 produces stage definitions, not complete Expedition runs.
2. `IceSlidePlayableMode` stays `campaign | daily`; do not expose Expedition in `init.ts` or `index.astro`.
3. Ship exactly nine v1 templates: three easy, three medium, and three hard.
4. Template `baseRows` contain only `#`, `.`, and exactly one `S`; they contain no `G`, `O`, `H`, or `C`. All variable entities come from named authored alternatives.
5. A template chooses exactly one named goal position and exactly one named **pattern** from each of rocks, hazards, and crystals. A pattern is a complete authored set of positions; `none` is represented explicitly as an empty pattern. The generator never chooses an arbitrary subset of positions.
6. All eight board transforms are available to v1 templates unless the template narrows `allowedTransforms` explicitly. Transform rows and slot coordinates before choosing/materializing mutations.
7. Selected mutation IDs are stable category-prefixed IDs such as `goal:south`, `rocks:center`, `hazards:none`, and `crystals:pair`. They are recorded in `IceSlideStageDefinition.mutationIds`.
8. `scoreMultiplierBps` is always `10_000` in HPA-489. HPA-491 owns risk/reward multipliers.
9. Each stage gets exactly one seeded bonus objective. `no_reset` is always syntactically eligible; `collect_all_crystals` requires at least one final `C`; `no_falls` requires at least one final `H`. The existing quality gate makes final feasibility authoritative.
10. Generation makes at most **64 candidate attempts per stage** and solves each candidate with **10,000 max states**.
11. Generation never calls `Math.random()` or `crypto.getRandomValues()`. HPA-490 creates a new random seed once; HPA-489 only consumes an explicit seed.
12. Exhaustion falls back to a deterministic order of checked-in full-row fallbacks for the requested tier. Fallbacks are validated against the same canonical-duplicate and solver/quality rules before use.
13. A fallback records `transform: 'identity'` and `mutationIds: ['fallback:<fallbackId>']`. It is a complete board, not a mutation recipe.
14. If all tier fallbacks are invalid or duplicate, generation throws. HPA-490's existing run-start failure boundary will own player-safe cleanup when that caller exists.
15. Campaign levels and Daily pools remain unchanged and are never imported as runtime template content. V1 fallback literals may intentionally mirror currently solver-proven Campaign boards, but are copied into `templates.ts` so later Campaign edits cannot silently change Expedition generator-v1 output.

## 5. Template Contracts

Keep template-only contracts beside their content rather than expanding the already broad `types.ts` with authoring-only shapes:

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

Template validation is deterministic checked-in-content validation, not a Zod/runtime schema. Assert:

- non-empty unique template/fallback/slot IDs;
- rectangular non-empty rows;
- exactly one `S` and no `G/O/H/C` in `baseRows`;
- non-empty unique `allowedTransforms`;
- at least one goal and one rock/hazard/crystal pattern (the latter may be `none=[]`);
- every authored position is in bounds and lands on `.` in the untransformed base;
- positions within one pattern are unique;
- positive ordered par band, positive `minReachableStops`, and non-negative integer `maxHazards`;
- `fallbackVariantId` resolves to a fallback with matching `templateId` and difficulty.

Cross-category positions may overlap across different authored alternatives. A selected candidate that creates an actual overlap is rejected for that attempt rather than banning useful coordinates from every other alternative.

## 6. Locked V1 Template Families

Coordinates are zero-based `(row,col)`. Pattern IDs below are part of generator-v1 output and therefore versioned content.

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

This is a separately checked-in family based on the 90-degree wall topology, not a runtime reference to `hard-absolute-zero`.

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

These are authored candidate spaces, not promises that every combination is accepted. The bounded quality gate is intentionally allowed to reject unsolvable, duplicate, collision, objective-infeasible, too-easy, or too-hard combinations.

## 7. Checked-in Fallbacks

Each template owns one complete fallback. Keep them as literals in `templates.ts`; do not import `ICE_SLIDE_LEVELS`.

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

The first eight intentionally copy currently solver-proven Campaign rows as independent literals; the ninth is the 90-degree full-row variant of the current hardest board. This gives every template a checked-in known-good recovery board without coupling generator-v1 output to `levels.ts`.

## 8. Quality Gate Extension

Extend the existing constraint shape additively:

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

Ordering stays deterministic:

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

Both new constraints are optional so Daily behavior and generator-v1 output remain unchanged.

## 9. Deterministic Stage Materializer

Expose a narrow API:

```ts
export const ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 1
export const ICE_SLIDE_EXPEDITION_MAX_ATTEMPTS = 64
export const ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES = 10_000

export interface IceSlideGeneratedStage {
    stage: IceSlideStageDefinition
    canonicalKey: string
    attempts: number
    usedFallback: boolean
    rejectionCounts: Readonly<Record<string, number>>
}

export function createIceSlideExpeditionStage(input: {
    seed: string
    stageNumber: number
    difficulty: IceSlideTemplateDifficulty
    existingCanonicalKeys?: ReadonlySet<string>
}): IceSlideGeneratedStage
```

`stageNumber` must be a positive safe integer. The materialized stage ID is `expedition:<stageNumber>`. HPA-490 can use stage numbers 1–6 directly.

### 9.1 Frozen RNG paths

```text
root:     createSeededRng(seed).fork('expedition:g1').fork('stage:<N>')
attempt:  root.fork('attempt:<1..64>')
template: attempt.fork('template')
transform:attempt.fork('transform')
goal:     attempt.fork('goal')
rocks:    attempt.fork('rocks')
hazards:  attempt.fork('hazards')
crystals: attempt.fork('crystals')
objective:attempt.fork('objective')
fallback: root.fork('fallback')
```

Fork labels and the ordering below are generator-versioned behavior.

### 9.2 Candidate attempt order

For each attempt 1–64:

1. pick one template from the requested difficulty tier;
2. pick one `allowedTransform`;
3. transform `baseRows` and **all slot coordinates** with existing `transformRows()` / `transformPosition()`;
4. pick one transformed goal and one transformed pattern from rocks, hazards, and crystals;
5. materialize final rows in category order goal → rocks → hazards → crystals; if two selected mutations collide or target a non-ice cell after earlier placement, reject the attempt as a materialization collision;
6. derive the syntactically eligible objective list from final rows in fixed order `collect_all_crystals`, `no_falls`, `no_reset`, then pick one objective;
7. call `validateIceSlideStageQuality()` with template par band, `10_000` states, accumulated canonical keys, `minReachableStops`, and `maxHazards`;
8. if rejected, increment the stable rejection counter and continue;
9. if accepted, materialize `IceSlideStageDefinition` with returned par/canonical key and compute `signature` through `createIceSlideStageSignature()`;
10. return immediately.

The accepted stage uses:

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

## 10. Exhaustion and Fallback Semantics

After 64 rejected candidates:

1. obtain all three fallbacks for the requested tier;
2. shuffle that fallback list with `stageRng.fork('fallback')`;
3. for each fallback, choose a deterministic syntactically eligible objective from `stageRng.fork('fallback:<id>:objective')`;
4. validate the complete fallback with the same par/stops/hazard constraints belonging to its template and the caller's existing canonical keys;
5. accept the first valid non-duplicate fallback;
6. emit one `console.warn` containing stage number, difficulty, seed hash (not raw seed), `attempts=64`, rejection counts, and chosen fallback ID;
7. return `usedFallback: true`, `attempts: 64`, and the fallback stage metadata.

If every fallback is invalid/duplicate, throw an `Error` that contains stage number and difficulty but no player-facing UI text.

There are three fallbacks per tier so the future six-stage run can use two stages of one tier without a single fallback board necessarily duplicating an earlier stage.

## 11. Validation Tooling

Add:

```text
scripts/validate-ice-slide-expedition.ts
```

and package script:

```json
"validate:ice-slide-expedition": "bun scripts/validate-ice-slide-expedition.ts"
```

The script runs exactly 1,000 deterministic seed keys per tier by default:

```text
ice-slide:validate:v1:<difficulty>:0000
...
ice-slide:validate:v1:<difficulty>:0999
```

For each seed, generate two stages of that tier using the actual future Expedition stage-number slots:

- easy: stage 1 then 2;
- medium: stage 3 then 4;
- hard: stage 5 then 6.

Pass stage 1's canonical key into stage 2's `existingCanonicalKeys`. For every result assert:

- accepted/fallback rows parse and solve without truncation;
- par remains inside the owning template band;
- objective is feasible;
- canonical keys differ within the pair;
- `mutationIds`, transform, rows, par, objective, multiplier, and signature reproduce byte-for-byte when regenerated with the same input;
- no `Math.random()` path is used.

Print per-tier totals for attempts, candidate rejections by reason, fallback count, and worst explored-state count. Exit non-zero on any invariant failure. Metrics are tuning output only; HPA-489 does not establish a rejection-rate or fallback-rate product SLA.

Normal CI keeps the same logic at 100 seeds per tier in `generator.validation.test.ts`. Do not add a new GitHub Actions job; the file is discovered by the existing Vitest run.

## 12. File Boundaries

### Create

- `src/lib/games/ice-slide/templates.ts` — authoring contracts, nine template definitions, nine fallbacks, static-content assertions/lookups.
- `src/lib/games/ice-slide/templates.test.ts` — structural checks and independent fallback quality checks.
- `src/lib/games/ice-slide/generator.ts` — bounded one-stage materialization and deterministic fallback selection.
- `src/lib/games/ice-slide/generator.test.ts` — attempt order, determinism, transforms, collisions, rejection/fallback behavior, signatures.
- `src/lib/games/ice-slide/generator.validation.test.ts` — 100-seed-per-tier CI smoke sweep.
- `scripts/validate-ice-slide-expedition.ts` — 1,000-seed-per-tier content validation/report.

### Modify

- `src/lib/games/ice-slide/quality.ts` / `quality.test.ts` — optional reachable-stop and hazard constraints.
- `package.json` — validation script only.

### Explicitly unchanged

- `levels.ts` and Daily stage pools;
- `game.ts`, `init.ts`, renderer, and Ice Slide page;
- `IceSlidePlayableMode`;
- score APIs, DB schema, leaderboards, and personal-history persistence;
- `ICE_SLIDE_RULESET_VERSION` (generation content/algorithm changes generator version, not physics/scoring ruleset);
- snow, cracked ice, Undo, route-choice, and ability code.

## 13. Testing Requirements

Unit tests must lock:

- all nine template IDs, tier counts, fallback links, and structural validation;
- all nine fallback boards accepted independently by the production quality gate;
- transformed slot coordinates use the same transform as transformed rows;
- complete pattern selection rather than arbitrary position subsets;
- materialization collision rejection;
- optional quality constraints and their rejection order;
- exact 64-attempt cap;
- stable fork labels through at least one frozen seed projection;
- byte-equivalent repeated output and rejection/fallback traces;
- canonical duplicate rejection using caller-provided keys;
- deterministic fallback order and fallback diagnostic;
- all-fallback-invalid throw behavior;
- `Math.random` patched to throw without affecting generation;
- 100 deterministic seeds per tier, two same-tier stages per seed, without invalid accepted output.

The manual validation command must cover 1,000 seeds per tier before template-pool or generator-v1 changes are merged.

## 14. Out of Scope

- generating the six-stage `IceSlideRunDefinition`;
- `crypto.getRandomValues()` seed creation;
- Retry Seed / New Expedition UI;
- Expedition mode selector/HUD/result overlay;
- Expedition score submission or personal history;
- global Expedition leaderboard or cross-seed calibration;
- Safe/Risky route choices, Undo charges, multipliers beyond `1.00×`;
- snow, cracked ice, dynamic solver state;
- arbitrary wall placement or procedural maze generation;
- JSON authoring files, external level editor, schema registry, generic generator framework.

## 15. Acceptance Checklist

HPA-489 is complete when:

- three easy, three medium, and three hard templates plus nine complete fallbacks are checked in;
- every template and fallback passes structural validation, and every fallback passes production solver/quality validation;
- same seed/version/stage/difficulty/existing-canonical input reproduces stage data and rejection/fallback behavior;
- accepted stages always satisfy start/goal shape, solver cap, par band, objective feasibility, reachable-stop floor, hazard ceiling, and canonical uniqueness;
- no generator path uses `Math.random()` or unbounded retry;
- exactly 64 candidate attempts precede deterministic fallback selection;
- the 100-seed-per-tier Vitest smoke passes;
- `bun run validate:ice-slide-expedition` passes 1,000 seeds per tier and prints actionable rejection/fallback diagnostics;
- Campaign and Daily content/output remain unchanged;
- no HPA-490 UI/run/persistence work is included.

## 16. Spec Self-Review

- **Placeholder scan:** no TBD/TODO or open algorithm choice remains.
- **Consistency:** stage generation stops at the materialized-stage boundary; HPA-490 still owns complete-run behavior.
- **Determinism:** content IDs, fork labels, attempt order, solver cap, fallback order, and output metadata are versioned and explicit.
- **Scope:** only two production modules are added, one existing quality seam is extended, and validation tooling is local to checked-in content.
- **YAGNI:** no generic generation framework, runtime registry, editor, worker, cache, or future dynamic-tile abstraction is introduced.
