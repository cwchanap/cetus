# Deterministic Ice Slide Runs — Design Spec

- **Linear issue:** [HPA-485 — Introduce deterministic Ice Slide run definitions, seeded RNG, and board transforms](https://linear.app/cwchanap/issue/HPA-485/introduce-deterministic-ice-slide-run-definitions-seeded-rng-and-board)
- **Parent roadmap:** [HPA-483 — Ice Slide replayability](https://linear.app/cwchanap/issue/HPA-483/ice-slide-replayability-daily-challenge-seeded-expedition-and-evolving)
- **Parent requirements:** [Ice Slide replayability design](https://github.com/cwchanap/cetus/blob/docs/ice-slide-replayability-spec/docs/superpowers/specs/2026-07-30-ice-slide-replayability-design.md)
- **Date:** 2026-08-02
- **Status:** Draft for review

## 1. Summary

Ice Slide currently treats its checked-in `ICE_SLIDE_LEVELS` array as both authored
content and the active run. `IceSlideGame` selects levels directly from that array,
which is sufficient for the fixed Campaign but does not provide a stable boundary for
Daily Challenge or Expedition runs.

This design introduces that boundary in four parts:

1. A dependency-free deterministic RNG with stable string hashing, bounded integer
   selection, deterministic pick/shuffle behavior, and independent labeled forks.
2. Pure utilities for all eight rotations/reflections of a rectangular board.
3. Versioned materialized run and stage contracts with canonical board hashes and
   stable stage signatures.
4. A Campaign adapter that materializes the existing eight levels, followed by a
   refactor of `IceSlideGame` to consume an explicit run while keeping `start()` with
   no argument behavior-compatible with the current Campaign.

The key architectural decision is that **generation finishes before gameplay starts**.
A run contains final rows, par values, objectives, multipliers, and signatures. The
game engine consumes this snapshot; it never reads a date, chooses a transform, or
makes a random selection.

## 2. Problem

The current implementation has useful module boundaries but no run abstraction:

- `levels.ts` owns the eight authored Campaign levels.
- `physics.ts` parses rows and resolves slides.
- `game.ts` directly imports `getLevel()` and `ICE_SLIDE_LEVELS` for loading,
  progression, scoring, and completion.
- `init.ts` calls `game.start()` and preserves the existing Campaign partial-End and
  score-submission behavior.
- Several branch tests replace `./levels` with module-level mocks to force a one-stage
  board.

This creates three constraints for replayable modes:

1. A generated or selected run cannot be passed into the game as data.
2. Random/date selection could become entangled with gameplay and retry behavior.
3. Future work would need to keep revisiting `game.ts` as Daily and Expedition add
   generation rules.

The deterministic primitives also need explicit compatibility guarantees. A seed is a
long-lived identifier: changing its hash, stream, bounded-selection algorithm, pick or
shuffle draw pattern, transform ordering, fork semantics, canonical serialization, or
signature preimage would silently change historical runs. Those details therefore need
versioned, golden-tested contracts rather than incidental helper implementations.

## 3. Goals

1. Define versioned Ice Slide mode, run, stage, transform, objective-ID, and signature
   contracts.
2. Provide a stable integer-only seeded RNG with deterministic string hashing,
   unbiased bounded integers, deterministic pick/shuffle behavior, independent labeled
   streams, and no `Math.random()` dependency.
3. Support all eight dihedral transforms for row grids and coordinates, including
   rectangular boards whose dimensions swap on quarter turns and diagonal
   reflections.
4. Provide canonical row serialization, compact board hashes, inverse transforms, and
   collision-safe symmetric-output deduplication.
5. Materialize the current eight authored levels as a Campaign run without changing
   rows, order, names, pars, scoring, completion, or partial-End semantics.
6. Make `IceSlideGame` consume a complete run snapshot while preserving `start()` as
   the existing Campaign entry point.
7. Extend state and current-write game data additively with run identity/version
   metadata and zero-valued counters required by later replayability work.
8. Keep RNG, transforms, signatures, and run construction pure and reusable without
   DOM, Pixi, database, network, storage, or date dependencies.

## 4. Non-goals

This issue does not implement:

- Daily stage selection, UTC date capture, mode selection UI, objectives UI, Daily
  scoring, or Daily submission gating.
- Production solver extraction or generated-stage quality validation.
- Mutation templates, bounded Expedition generation, fallbacks, or Expedition UI.
- Score-context persistence or scoped leaderboard queries.
- Snow, cracked ice, route choices, Undo, or other evolving mechanics.
- `routeChoices` or `undoChargesUsed` fields from the parent design; evolving-mechanics
  work introduces them when their runtime meaning exists.
- Any change to the existing platform Daily Challenge rotation in
  `src/lib/challenges.ts`.
- A migration of Ice Slide to the generic `BaseGame` framework. The existing
  handle-based architecture remains intentional.

## 5. Design principles

### 5.1 Materialize before play

A generator or adapter produces an `IceSlideRunDefinition` containing final stage rows.
`IceSlideGame` only interprets the supplied data. This separation makes retries exact,
keeps date/random logic out of the runtime loop, and gives downstream work a stable
input contract.

### 5.2 Compatibility is additive

Existing state fields, callbacks, achievement data, scoring functions, and UI behavior
remain available. New fields are added rather than replacing `levelIndex`,
`levelName`, `levelsCleared`, or `perfectLevels` with stage-oriented names.

### 5.3 Determinism is an API

The hash algorithm, seed-to-state mapping, PRNG algorithm, bounded-integer algorithm,
pick draw pattern, shuffle direction/draw pattern, transform order, transform labels,
canonical row format, signature preimage, signature format, and fork derivation are
observable behavior. Golden tests lock them.

Generator versions are **per materializer/mode**, not one global counter shared by all
modes. A future RNG or Expedition-generation change increments the versions of modes
whose output can change; it does not change the fixed Campaign version or run key when
Campaign materialization is unaffected.

### 5.4 Compact hashes are identifiers, not equality proofs

A 32-bit hash is sufficient for compact metadata, but it is not used as the sole
equality key. Board deduplication stores complete canonical row serialization, so a
hash collision cannot incorrectly remove a distinct board. Stage signatures are also
compact identifiers rather than uniqueness or security proofs.

## 6. Versioned contracts

Add the following contracts to `src/lib/games/ice-slide/types.ts`:

```ts
export type IceSlideMode = 'campaign' | 'daily' | 'expedition'

export type IceSlideDifficulty =
    | 'tutorial'
    | 'easy'
    | 'medium'
    | 'hard'

export type IceSlideObjectiveId =
    | 'collect_all_crystals'
    | 'no_falls'
    | 'no_reset'

export type BoardTransform =
    | 'identity'
    | 'rotate_90'
    | 'rotate_180'
    | 'rotate_270'
    | 'reflect_horizontal'
    | 'reflect_vertical'
    | 'reflect_main_diagonal'
    | 'reflect_anti_diagonal'

export interface IceSlideRunDefinition {
    schemaVersion: 1
    generatorVersion: number
    rulesetVersion: number
    mode: IceSlideMode
    runKey: string
    seed: string | null
    stages: IceSlideStageDefinition[]
}

export interface IceSlideStageDefinition {
    id: string
    name: string
    templateId: string
    difficulty: IceSlideDifficulty
    rows: string[]
    parMoves: number
    transform: BoardTransform
    mutationIds: string[]
    objectiveIds: IceSlideObjectiveId[]
    scoreMultiplierBps: number
    signature: string
}
```

`scoreMultiplierBps` is an integer basis-point representation of a unit multiplier:

```text
10000 = 1.00×
12500 = 1.25×
```

HPA-485 transports and signs this value but does not apply it to Campaign scoring.
Structural validation accepts `1000..50000` inclusive (`0.10×..5.00×`). This keeps
future authored values within a deliberate scoring range and prevents nonsensical or
overflow-prone multipliers from entering materialized runs.

### 6.1 Version meanings

- `schemaVersion` changes only when the serialized run/stage shape is no longer
  compatible.
- `generatorVersion` belongs to the run's materializer. It changes whenever the same
  mode-specific seed and inputs can materialize a different run.
- `rulesetVersion` changes whenever physics, objective interpretation, or scoring
  changes competitive meaning.

Initial HPA-485 constants are:

```ts
export const ICE_SLIDE_RUN_SCHEMA_VERSION = 1 as const
export const ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION = 1
export const ICE_SLIDE_RULESET_VERSION = 1

export const CAMPAIGN_RUN_KEY =
    `ice-slide:campaign:` +
    `g${ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION}:` +
    `r${ICE_SLIDE_RULESET_VERSION}`
```

The initial golden Campaign key is:

```text
ice-slide:campaign:g1:r1
```

Daily and Expedition add their own generator-version constants. Changing their RNG,
selection pools, mutation logic, or fallback behavior does not bump
`ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION` unless the fixed Campaign adapter output changes.

### 6.2 Objective-ID evolution

`IceSlideObjectiveId` is a closed serialized contract, not an open string bag.

- Adding an objective ID is a type/contract change.
- If generated runs begin emitting it, increment that mode's `generatorVersion`.
- If the interpretation of an existing objective ID changes, increment
  `rulesetVersion`.
- A schema-version bump is needed only when the serialized shape changes.

### 6.3 Run-key formats and cross-field validation

Run keys are transport-safe identifiers compatible with score-context competition keys:

```ts
const RUN_KEY_PATTERN = /^[A-Za-z0-9:._-]+$/
const RUN_KEY_MAX_LENGTH = 128
```

Every run key must:

- be `1..128` characters;
- match `RUN_KEY_PATTERN`;
- start with the exact prefix for its mode;
- end in `:g<generatorVersion>:r<rulesetVersion>` whose integers exactly match the
  run fields.

Per-mode formats are:

```text
Campaign:
ice-slide:campaign:g<generatorVersion>:r<rulesetVersion>

Daily:
ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>

Expedition:
ice-slide:expedition:<seedHash>:g<generatorVersion>:r<rulesetVersion>
```

Additional relationships:

- Campaign key must equal `CAMPAIGN_RUN_KEY` and `seed` must be `null`.
- Daily `YYYY-MM-DD` must be a calendar-valid date, not merely lexical: the regex only
  checks `\d{4}-\d{2}-\d{2}`, so the validator additionally round-trips the parsed
  year/month/day through `new Date(Date.UTC(year, month - 1, day))` and requires the UTC
  components to match, rejecting impossible dates such as `2026-02-30` or `2026-13-01`
  before comparing generator/ruleset versions.
- Daily `seed` must equal
  `ice-slide:daily:<generatorVersion>:<rulesetVersion>:YYYY-MM-DD`, using the same date
  captured in the run key.
- Expedition `seed` must be non-empty and contain no U+001F. `<seedHash>` must equal
  `hashString32Hex(seed)`.

The Expedition hash is compact routing metadata, not sole identity. Complete identity
still includes mode, key, explicit versions, and ordered stage signatures.

## 7. Stable seeded RNG

Create `src/lib/games/shared/seeded-rng.ts`. It is generic enough for other level-based
games but does not replace the existing platform challenge rotation.

### 7.1 Public API

```ts
export interface SeededRng {
    nextUint32(): number
    nextFloat(): number
    nextInt(maxExclusive: number): number
    pick<T>(items: readonly T[]): T
    shuffle<T>(items: readonly T[]): T[]
    fork(label: string): SeededRng
}

export function hashString32(value: string): number
export function hashString32Hex(value: string): string
export function createSeededRng(seedKey: string): SeededRng
```

### 7.2 String hashing

Use FNV-1a over JavaScript UTF-16 code units:

```ts
export function hashString32(value: string): number {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}
```

Locked vector:

```text
hashString32('ice-slide:test') = 2769670846
hashString32Hex('ice-slide:test') = a515d2be
```

### 7.3 Seed validation, seed-to-state mapping, and Mulberry32

The public `createSeededRng(seedKey)` rejects an empty seed key or a key containing the
reserved U+001F fork-path separator. This prevents a top-level seed such as
`a\u001fb` from colliding with the nested path `createSeededRng('a').fork('b')`.

The exact initial-state rule is:

```ts
initial state = hashString32(seedKey)
```

Use this Mulberry32 reference implementation:

```ts
function createSeededRng(seedKey: string): SeededRng {
    assertSeedSegment(seedKey, 'seedKey')
    return createSeededRngFromPath(seedKey)
}

function createSeededRngFromPath(seedPath: string): SeededRng {
    let state = hashString32(seedPath)

    const nextUint32 = (): number => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^=
            value + Math.imul(value ^ (value >>> 7), value | 61)
        return (value ^ (value >>> 14)) >>> 0
    }

    // nextFloat, nextInt, pick, shuffle, and fork close over this stream.
    // fork uses createSeededRngFromPath so the internal separator is allowed.
}
```

The first five `nextUint32()` values for a **fresh**
`createSeededRng('ice-slide:test')` are:

```text
1843037723
574486829
1018436590
1120027984
770965377
```

`nextFloat()` divides the unsigned output by `2^32`, producing `[0, 1)`.

### 7.4 Bounded integer selection

`nextInt(maxExclusive)` accepts integer bounds from `1` through `2^31 - 1` inclusive.
Use this exact rejection-sampling algorithm:

```ts
function nextInt(maxExclusive: number): number {
    if (
        !Number.isInteger(maxExclusive) ||
        maxExclusive < 1 ||
        maxExclusive > 0x7fffffff
    ) {
        throw new RangeError(
            'maxExclusive must be an integer from 1 through 2147483647'
        )
    }

    const range = 0x1_0000_0000
    const limit = Math.floor(range / maxExclusive) * maxExclusive

    let value: number
    do {
        value = nextUint32()
    } while (value >= limit)

    return value % maxExclusive
}
```

`range` and `limit` are ordinary JavaScript numbers and must not be coerced through a
bitwise operation.

Each locked example below starts from a **separate fresh RNG**:

```text
createSeededRng('ice-slide:test').nextInt(1) = 0

const rng = createSeededRng('ice-slide:test')
five consecutive rng.nextInt(7) values = 2, 0, 3, 5, 0
```

The `nextInt(7)` sequence is not measured after consuming the `nextInt(1)` example.

### 7.5 Deterministic pick

`pick()` consumes exactly one `nextInt(items.length)` draw and returns that element:

```ts
function pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
        throw new RangeError('Cannot pick from an empty array')
    }
    return items[nextInt(items.length)]
}
```

A one-item pick still consumes one `nextInt(1)` draw. This draw pattern is observable
generator behavior.

Locked vector from a fresh RNG:

```text
createSeededRng('ice-slide:test')
    .pick(['A', 'B', 'C', 'D', 'E'])
= 'D'
```

### 7.6 Deterministic shuffle

`shuffle()` returns a new array and leaves its input unchanged. It uses descending
Fisher–Yates with one bounded draw per iteration:

```ts
function shuffle<T>(items: readonly T[]): T[] {
    const result = [...items]
    for (let index = result.length - 1; index > 0; index--) {
        const swapIndex = nextInt(index + 1)
        ;[result[index], result[swapIndex]] = [
            result[swapIndex],
            result[index],
        ]
    }
    return result
}
```

Locked vector from a fresh RNG:

```text
createSeededRng('ice-slide:test')
    .shuffle(['A', 'B', 'C', 'D', 'E'])
= ['C', 'A', 'E', 'B', 'D']
```

### 7.7 Labeled forks

A fork is derived from the immutable seed path, not from the parent's draw position:

```text
child path = parent path + U+001F + label
```

`fork(label)` rejects empty labels and labels containing U+001F, then calls the internal
`createSeededRngFromPath(childPath)` helper. It does not call the public top-level
seed validator on the combined path.

Consequences:

- Calling `fork('stage:1')` before or after parent draws produces the same stream.
- A new choice inside `stage:1` does not perturb `stage:2`.
- Nested labels form stable paths.
- Separate child instances do not share mutable state.

Locked first outputs from separate fresh parents:

```text
createSeededRng('ice-slide:test').fork('stage:1').nextUint32()
= 694760629

createSeededRng('ice-slide:test').fork('stage:2').nextUint32()
= 2216382472
```

### 7.8 Existing platform rotation remains isolated

`src/lib/challenges.ts` currently uses its own date hash and `Math.sin` helper. HPA-485
does not import, replace, or refactor it. Its output remains byte-for-byte compatible.

## 8. Board transforms

Create `src/lib/games/ice-slide/transforms.ts`. All row transformations are defined by
one coordinate mapping rather than eight independent row-manipulation implementations.
This keeps row and named-coordinate behavior aligned.

### 8.1 Transform order

```ts
export const BOARD_TRANSFORMS = [
    'identity',
    'rotate_90',
    'rotate_180',
    'rotate_270',
    'reflect_horizontal',
    'reflect_vertical',
    'reflect_main_diagonal',
    'reflect_anti_diagonal',
] as const
```

This order is generator behavior and is golden-tested.

### 8.2 Naming

- `reflect_horizontal`: reflect across the horizontal axis; swap top/bottom rows.
- `reflect_vertical`: reflect across the vertical axis; swap left/right columns.
- `reflect_main_diagonal`: top-left to bottom-right diagonal.
- `reflect_anti_diagonal`: top-right to bottom-left diagonal.

### 8.3 Coordinate mappings

For input dimensions `R × C`:

| Transform | Output dimensions | Input `(row, col)` maps to |
| --- | --- | --- |
| `identity` | `R × C` | `(row, col)` |
| `rotate_90` | `C × R` | `(col, R - 1 - row)` |
| `rotate_180` | `R × C` | `(R - 1 - row, C - 1 - col)` |
| `rotate_270` | `C × R` | `(C - 1 - col, row)` |
| `reflect_horizontal` | `R × C` | `(R - 1 - row, col)` |
| `reflect_vertical` | `R × C` | `(row, C - 1 - col)` |
| `reflect_main_diagonal` | `C × R` | `(col, row)` |
| `reflect_anti_diagonal` | `C × R` | `(C - 1 - col, R - 1 - row)` |

For:

```text
ABC
DEF
```

expected rows are:

| Transform | Rows |
| --- | --- |
| `identity` | `ABC`, `DEF` |
| `rotate_90` | `DA`, `EB`, `FC` |
| `rotate_180` | `FED`, `CBA` |
| `rotate_270` | `CF`, `BE`, `AD` |
| `reflect_horizontal` | `DEF`, `ABC` |
| `reflect_vertical` | `CBA`, `FED` |
| `reflect_main_diagonal` | `AD`, `BE`, `CF` |
| `reflect_anti_diagonal` | `FC`, `EB`, `DA` |

### 8.4 APIs and inverses

```ts
export function transformRows(
    rows: readonly string[],
    transform: BoardTransform
): string[]

export function transformPosition(
    position: GridPosition,
    inputRows: number,
    inputCols: number,
    transform: BoardTransform
): GridPosition

export function inverseBoardTransform(
    transform: BoardTransform
): BoardTransform
```

- `rotate_90` and `rotate_270` are inverses.
- Every other transform is self-inverse, including `rotate_180` and both diagonal
  reflections.
- Transform plus inverse restores rows and named coordinates.

## 9. Canonical rows and symmetric deduplication

### 9.1 Shared rectangular-row validation

`transformRows()` and `serializeBoardRows()` use one pure rectangular-row validator.
It rejects:

- an empty row list;
- a zero-column first row;
- any jagged row.

This prevents malformed rows from receiving an ambiguous or incorrect canonical key.
Glyph validation remains a separate concern owned by run parsing/validation.

### 9.2 Serialization

Canonical serialization is:

```text
<rowCount>x<columnCount> U+001F <row0> U+001E <row1> ...
```

Example:

```text
['AB', 'CD'] -> 2x2\u001fAB\u001eCD
```

```ts
export function serializeBoardRows(rows: readonly string[]): string
export function hashBoardRows(rows: readonly string[]): string
```

`hashBoardRows()` returns the lowercase eight-character FNV-1a hex hash of the exact
serialization.

### 9.3 Unique transformed variants

```ts
export interface TransformedBoardVariant {
    transform: BoardTransform
    rows: string[]
    canonicalKey: string
    hash: string
}

export function getUniqueBoardTransforms(
    rows: readonly string[]
): TransformedBoardVariant[]
```

Evaluate transforms in `BOARD_TRANSFORMS` order and retain the first transform producing
each complete canonical serialization. Store `canonicalKey`, not the compact hash, in
the deduplication set.

## 10. Stage signatures and competitive identity

A stage signature identifies materialized playable content. It does not by itself prove
uniqueness or provide the ruleset interpretation.

Competitive identity uses:

```text
mode + runKey + generatorVersion + rulesetVersion + ordered stageSignatures
```

Consumers must not compare or rank results by an individual signature or signature list
alone.

### 10.1 Included fields

The signature includes:

- final canonical rows;
- `parMoves`;
- `transform` label;
- sorted `mutationIds`;
- `difficulty`;
- sorted `objectiveIds`;
- `scoreMultiplierBps`.

It excludes display name, stage ID, and template ID. Two generation paths producing
the same playable content receive the same signature.

### 10.2 Exact preimage and public format

Use U+001D as the field separator. Canonical rows retain U+001F/U+001E:

```ts
const sortedMutationIds = [...mutationIds].sort()
const sortedObjectiveIds = [...objectiveIds].sort()
const payload = [
    'ice-slide-stage:v2',
    `rows=${serializeBoardRows(rows)}`,
    `parMoves=${parMoves}`,
    `transform=${transform}`,
    `mutationIds=${sortedMutationIds.join(',')}`,
    `difficulty=${difficulty}`,
    `objectiveIds=${sortedObjectiveIds.join(',')}`,
    `scoreMultiplierBps=${scoreMultiplierBps}`,
].join('\u001d')

const signature = `is2-${hashString32Hex(payload)}`
```

The labels, order, separators, empty-objective and empty-mutation representation,
decimal numeric representation, and sorting are observable generator behavior.

For First Frost:

```ts
rows = ['#####', '#S..#', '#...#', '#G..#', '#####']
parMoves = 1
transform = 'identity'
mutationIds = []
difficulty = 'tutorial'
objectiveIds = []
scoreMultiplierBps = 10000
```

Exact preimage:

```text
ice-slide-stage:v2\u001drows=5x5\u001f#####\u001e#S..#\u001e#...#\u001e#G..#\u001e#####\u001dparMoves=1\u001dtransform=identity\u001dmutationIds=\u001ddifficulty=tutorial\u001dobjectiveIds=\u001dscoreMultiplierBps=10000
```

Golden signature:

```text
is2-68616e2d
```

## 11. Campaign materialization

Create `src/lib/games/ice-slide/run.ts`. `levels.ts` remains the unchanged source of
Campaign content.

### 11.1 Campaign adapter

```ts
export function createCampaignRunDefinition(): IceSlideRunDefinition
```

The adapter returns a fresh defensive snapshot:

```ts
{
    schemaVersion: ICE_SLIDE_RUN_SCHEMA_VERSION,
    generatorVersion: ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION,
    rulesetVersion: ICE_SLIDE_RULESET_VERSION,
    mode: 'campaign',
    runKey: CAMPAIGN_RUN_KEY,
    seed: null,
    stages: [...],
}
```

Stage mapping:

| Existing level | Stage/template ID | Difficulty |
| --- | --- | --- |
| 1 | `campaign:1` | `tutorial` |
| 2 | `campaign:2` | `easy` |
| 3 | `campaign:3` | `easy` |
| 4 | `campaign:4` | `medium` |
| 5 | `campaign:5` | `medium` |
| 6 | `campaign:6` | `medium` |
| 7 | `campaign:7` | `hard` |
| 8 | `campaign:8` | `hard` |

Every stage preserves name, rows, and `parMoves`, with:

```ts
transform: 'identity'
mutationIds: []
objectiveIds: []
scoreMultiplierBps: 10000
```

Difficulty is metadata only. HPA-487 Daily v1 uses the authored index pools from the
parent design, not these difficulty tags.

### 11.2 Structural validation and cloning

```ts
export function assertValidIceSlideRunDefinition(
    run: IceSlideRunDefinition
): void

export function cloneIceSlideRunDefinition(
    run: IceSlideRunDefinition
): IceSlideRunDefinition
```

Validation covers:

- schema version `1`;
- positive signed-32-bit generator/ruleset versions;
- mode-specific run-key format and cross-field version/seed relationships from §6.3;
- `1..64` stages;
- unique non-empty stage IDs;
- recognized difficulty/transform labels;
- non-empty rectangular rows;
- every glyph is a key of `GLYPH_TO_CELL` in `types.ts`;
- positive signed-32-bit `parMoves`;
- integer `scoreMultiplierBps` in `1000..50000`;
- unique non-empty mutation IDs;
- unique recognized objective IDs;
- signature exactly matching materialized stage fields.

Both run validation and `physics.parseGrid()` use `GLYPH_TO_CELL`; neither maintains an
independent glyph list.

Structural validation deliberately stops before minimum-solution length, exact
start/goal counts, objective feasibility, crystal reachability, and quality bands.
HPA-486 owns those checks.

Cloning includes rows, stage arrays, mutation IDs, objective IDs, and signatures. No
caller-owned array remains reachable from the active game.

HPA-489 owns authored mutation templates, seeded mutation choices, bounded generation,
and `templateId`/`mutationIds` population.

## 12. `IceSlideGame` integration

### 12.1 Constructor and idle state

The constructor creates a fresh Campaign definition and idle state but does **not** run
the public structural assertion. The checked-in Campaign is guaranteed by exact adapter
and validation tests. Therefore `new IceSlideGame()` introduces no new runtime throw
path.

Before first start:

- `status === 'idle'`;
- mode/key/versions match Campaign constants;
- `stagesTotal === 8`;
- `stageSignatures` contains all eight Campaign signatures in order;
- score/move/crystal/clear/star/fall/reset/time counters are zero;
- `getGameData().solved === false`.

### 12.2 Start contract and error boundary

```ts
start(run?: IceSlideRunDefinition): void
```

Behavior:

1. If `run` is explicit, structurally validate and deep-clone it before stopping any timer or mutating state.
2. If `run` is omitted, create a fresh known-good Campaign definition.
3. Stop any existing timer.
4. Store the active run.
5. Create playing state and load stage zero.
6. Start the timer and invoke callbacks in the existing order.

An invalid **explicit** run throws synchronously before the existing timer is stopped, before any
state mutation, and before the new timer starts; prior state is left unchanged.
The direct caller owns that exception boundary.

HPA-485 leaves `init.ts` unchanged. Its current `game.start()` call is outside the
renderer `try/catch`, but it only uses the no-argument checked-in Campaign path, so
HPA-485 adds no user-supplied validation failure there. Existing checked-in level parse
failures remain programmer errors as they are today.

Before HPA-487 passes a generated Daily run through the UI handle, it must place
`game.start(run)` inside `initializeIceSlide`'s `failRun` error boundary (or validate
before changing button/UI state) so an invalid generated run restores controls and calls
`onError`.

Tests lock that construction/default start do not throw and invalid explicit starts
throw without changing the prior state.

### 12.3 Stage loading, state rebuilds, and progression

`game.ts` no longer imports `getLevel()` or `ICE_SLIDE_LEVELS`. It loads:

```ts
this.activeRun.stages[index]
```

Legacy public names remain:

- `levelIndex` is the stage index;
- `levelName` is the stage name;
- `onLevelClear(levelNumber)` remains one-based;
- `levelsCleared` remains cumulative.

Completion compares with `activeRun.stages.length`.

Every state construction/rebuild—constructor, start, stage advance, manual Reset, and
hazard reload—carries:

```text
mode
runKey
runSchemaVersion
generatorVersion
rulesetVersion
stagesTotal
starsEarned
falls
resets
stageSignatures
```

`stageSignatures` is always the ordered list for the complete run, never only cleared
stages.

`starsEarned` means the cumulative number of stage stars earned in the active run.
HPA-485 initializes and preserves it as zero because Campaign has no star evaluation.
HPA-487 defines the Clear/Efficient/Bonus star rules and increments it. `falls` and
`resets` are likewise initialized/preserved here and incremented by HPA-487.

### 12.4 Scoring boundary

HPA-485 does not expose Daily or Expedition. The game keeps existing `levelScore()` and
`timeBonus()` behavior using stage position, par, moves, and crystals. It does not apply
`scoreMultiplierBps`; every Campaign stage is `10000`.

`scoring.ts` remains unchanged.

### 12.5 State and game data

Add to both `IceSlideState` and current-write `IceSlideGameData`:

```ts
mode: IceSlideMode
runKey: string
runSchemaVersion: 1
generatorVersion: number
rulesetVersion: number
stagesTotal: number
starsEarned: number
falls: number
resets: number
stageSignatures: string[]
```

Existing fields remain unchanged:

```ts
levelsCleared
totalMoves
crystalsCollected
elapsedSeconds
solved
perfectLevels
```

These new fields remain in HPA-485 because the issue explicitly requires additive
state/game-data output. Their persistence behavior is narrower than the TypeScript
shape:

- Current Campaign submissions are unscoped and pass no score context, so the API uses
  game data transiently for achievements but does not persist `gameDataJson`.
- HPA-487 contextual Daily submissions persist game data with score context.
- Historical persisted rows may lack these fields. Readers must treat them as optional
  on read and normalize by schema/version; they are required on new writes from the
  updated game.
- The score API's 16 KiB game-data cap applies only when context is present. Daily has
  five signatures and Expedition six; the structural maximum of 64 stages keeps the
  signature list safely bounded for future contextual writes.

`getState()` and `getGameData()` return copied signature arrays.

`src/lib/games/shared/types.ts` re-exports the canonical Ice Slide type. Additive fields
require no edit there; removal/renaming of existing fields would be breaking.

### 12.6 Achievement compatibility

HPA-485 exposes only Campaign, so existing achievements continue to receive their
current fields and meanings.

The existing `ice_slide_complete` condition (`solved && levelsCleared === 8`) is only
semantically correct for Campaign. Before HPA-487 exposes other modes, legacy Ice Slide
achievements that describe Campaign levels—including completion and any use of
`perfectLevels`—must be explicitly gated with `mode === 'campaign'` or replaced with
mode-specific achievements. An eight-stage non-Campaign run must not unlock “Clear all
8 Ice Slide levels,” and a shorter Daily must not be permanently ineligible because of
Campaign-specific counts.

### 12.7 Reset, hazard, stop, and completion compatibility

No Campaign semantics change:

- blocked moves remain no-ops;
- manual Reset clears attempt crystals and stage moves while preserving run score/time
  and run metadata;
- hazard reset keeps the failed move count and cannot farm crystals;
- Campaign completion keeps the 360-second time bonus;
- `stop()` changes playing to idle;
- `init.ts` still submits a positive partial Campaign score on End;
- existing achievement fields remain available.

## 13. Physics parsing compatibility

Narrow parsing to what it consumes:

```ts
interface IceSlideGridSource {
    id: string | number
    rows: readonly string[]
}
```

`parseGrid()` preserves the same validation categories and error-message templates, and
continues to use `GLYPH_TO_CELL`. Interpolated identifiers may now be strings, so the
rendered message changes from e.g. `Level 3 ...` to `Level campaign:3 ...`; the spec
does not require byte-identical rendered text for different input IDs.

## 14. Test migration and coverage

### 14.1 RNG tests

Lock:

- FNV numeric/hex vectors;
- exact string-to-state mapping and five Mulberry32 outputs;
- top-level empty/U+001F seed rejection;
- parent/fork independence and label rejection;
- `nextFloat()` range;
- fresh-RNG `nextInt(1)` and `nextInt(7)` vectors;
- upper bound/invalid bound behavior and no bitwise limit coercion;
- exact `pick()` draw behavior, empty rejection, one-item draw, and `'D'` vector;
- descending Fisher–Yates vector and immutability;
- no `Math.random()` calls.

### 14.2 Transform/canonicalization tests

Cover:

- all eight rectangular outputs;
- coordinate/glyph alignment;
- dimension swaps and inverse round trips;
- empty/zero-column/jagged rejection in both transform and serialization APIs;
- canonical boundary/dimension distinctions;
- one/two/four/eight symmetry variants;
- first-transform retention.

### 14.3 Run construction tests

Prove:

- exact eight-stage Campaign content;
- per-mode generator constants and stable Campaign key;
- run-key transport pattern, length, prefixes, version suffixes, Daily seed/date
  relationship, and Expedition seed hash;
- exact First Frost signature/preimage;
- signature order independence and semantic sensitivity;
- defensive cloning;
- stage-count and multiplier bounds;
- shared `GLYPH_TO_CELL` acceptance;
- structural invalid fixtures fail descriptively.

### 14.4 Game integration tests

Prove:

- constructor and default start do not throw;
- idle getters expose complete Campaign metadata and zero counters;
- invalid explicit start throws before state mutation;
- explicit run length/progression works;
- caller mutation cannot affect active state;
- every rebuild preserves complete run metadata/signatures/counters;
- existing win/hazard/reset/crystal/timer/stop behavior remains green;
- branch tests use explicit fixtures rather than `vi.mock('./levels')`;
- renderer fixture supplies required additive fields.

### 14.5 Future HPA-487 gates

HPA-487 tests must additionally prove:

- explicit generated start errors flow through `failRun` and restore controls;
- legacy achievements are Campaign-gated;
- contextual game-data writes fit the 16 KiB cap;
- Daily run key and seed satisfy the HPA-485 validator.

### 14.6 Repository verification

```bash
bunx vitest run \
  src/lib/games/shared/seeded-rng.test.ts \
  src/lib/games/ice-slide/transforms.test.ts \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/physics.test.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.win.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts \
  src/lib/games/ice-slide/game.crystal-farm.test.ts \
  src/lib/games/ice-slide/game.crystal-hazard-farm.test.ts \
  src/lib/games/ice-slide/renderer.test.ts

bun run test:run
bun run typecheck
bun run lint
bun run format:check
```

**Typecheck baseline (regression handling).** `bun run typecheck` is not expected to
exit zero on `main` or on this branch. The repository carries a documented two-error
baseline that predates this work and is out of scope:

- `src/lib/games/ice-slide/init.test.ts:36` — ts(2556), a spread argument tuple-type error.
- `src/lib/games/ice-slide/init.ts:178` — ts(2358), an `instanceof` left-hand-side error.

Record the exact `bun run typecheck` error count before starting the branch and again
after each verification step. The required outcome is a **zero delta**: the same two
baseline errors and no others. Any new error in the files this branch touches
(`run.ts`, `run.test.ts`, `test-fixtures.ts`, `transforms.ts`, `transforms.test.ts`,
`seeded-rng.ts`, `seeded-rng.test.ts`, `game.ts`) is a regression and must be fixed
before the branch can merge. Do not fix the two baseline errors here.

## 15. File boundaries

### New

```text
src/lib/games/shared/seeded-rng.ts
src/lib/games/shared/seeded-rng.test.ts
src/lib/games/ice-slide/transforms.ts
src/lib/games/ice-slide/transforms.test.ts
src/lib/games/ice-slide/run.ts
src/lib/games/ice-slide/run.test.ts
src/lib/games/ice-slide/test-fixtures.ts
```

### Modified

```text
src/lib/games/ice-slide/types.ts
src/lib/games/ice-slide/physics.ts
src/lib/games/ice-slide/physics.test.ts
src/lib/games/ice-slide/game.ts
src/lib/games/ice-slide/game.test.ts
src/lib/games/ice-slide/game.win.test.ts
src/lib/games/ice-slide/game.hazard.test.ts
src/lib/games/ice-slide/game.crystal-farm.test.ts
src/lib/games/ice-slide/game.crystal-hazard-farm.test.ts
src/lib/games/ice-slide/renderer.test.ts
```

### Explicitly unchanged in HPA-485

```text
src/lib/challenges.ts
src/lib/games/ice-slide/levels.ts
src/lib/games/ice-slide/scoring.ts
src/lib/games/ice-slide/init.ts
src/lib/games/ice-slide/renderer.ts
src/lib/games/shared/types.ts
src/lib/achievements.ts
DOM, database, network, and score-submission modules
```

`init.ts` and achievement changes described above are required gates for HPA-487, not
HPA-485 production edits.

## 16. Alternatives considered

### 16.1 Replace the platform challenge RNG

Rejected. It is already user-visible and explicitly protected by parent requirements.

### 16.2 Pass only a seed into the game

Rejected. Gameplay would become responsible for generation/version/retry semantics.

### 16.3 Keep separate Campaign and generated progression paths

Rejected. It would duplicate reset, score, completion, and game-data logic.

### 16.4 Deduplicate by compact hash only

Rejected. Complete canonical serialization is cheap and collision-safe.

### 16.5 Include generation metadata in signatures

Rejected. Signatures identify final playable content; stage metadata and mode-specific
versions preserve provenance.

### 16.6 Use a cryptographic hash

Not required. FNV-1a is not used for security or sole equality.

### 16.7 Use one global generator version

Rejected. It would change fixed Campaign identity for unrelated Daily/Expedition
algorithm changes. Generator versions belong to materializers/modes.

### 16.8 Remove generator version from Campaign key

Rejected. Campaign materialization still has a versioned adapter contract. A
Campaign-specific generator version preserves that axis without coupling it to other
modes.

### 16.9 Defer all new game-data fields to HPA-487

Rejected because HPA-485 explicitly requires the additive game-data contract. The spec
instead distinguishes required current writes from optional historical reads and notes
that unscoped Campaign game data is not persisted today.

## 17. Risks and mitigations

### Accidental Campaign drift

Exact adapter comparisons and no-argument Campaign tests.

### Seed-output drift

Reference code and golden vectors lock hash, state mapping, stream, bounded integers,
pick, shuffle, forks, transforms, canonicalization, and signatures.

### Invalid explicit run escapes UI recovery

HPA-485 exposes no explicit UI run. HPA-487 must move explicit start into `failRun`.

### Campaign identity changes for unrelated generator work

Use per-mode generator versions and a Campaign-specific version constant.

### Run-key/version mismatch

Pure structural validation checks transport shape, prefix, suffix versions, and
mode-specific seed relationships.

### State rebuild loses run context

Explicit carry list and tests cover every rebuild path.

### Historical game-data shape mismatch

Current writes are required; persisted reads normalize absent fields by version.
Campaign remains unpersisted without context.

### Legacy achievements unlock in the wrong mode

HPA-487 must gate Campaign achievements before exposing Daily/Expedition.

### HPA-485 absorbs solver or mutation work

Structural validation stops before quality checks; HPA-486 and HPA-489 retain ownership.

## 18. Delivery and review boundaries

Implement HPA-485 as one PR with four logical commits:

1. `feat(games): add deterministic seeded rng`
2. `feat(ice-slide): add board transforms and canonical variants`
3. `feat(ice-slide): materialize versioned campaign runs`
4. `refactor(ice-slide): consume explicit run definitions`

Review focuses on:

1. exact RNG, pick, shuffle, and fork contracts;
2. rectangular transform semantics;
3. canonicalization/signature preimage;
4. mode-specific version/run-key invariants;
5. Campaign behavior compatibility;
6. idle/start/state-rebuild behavior;
7. clean ownership boundaries for HPA-486/HPA-487/HPA-489.

## 19. Acceptance-criteria traceability

| HPA-485 criterion | Design section |
| --- | --- |
| Existing callers work through `start()` | §§11–12 |
| Campaign content/scoring/completion/partial End unchanged | §§11–12, 14 |
| Known seeds and independent forks are stable | §7 |
| All row/coordinate transforms and inverse round trips work | §8 |
| Symmetric boards produce unique canonical variants | §9 |
| Runs contain final rows/stable signatures; gameplay makes no random/date choices | §§6, 10–12 |
| Pure modules have no DOM/Pixi/database/network dependency | §§3–5, 15 |
| Platform Daily rotation remains unchanged | §§4, 7.8, 15 |
| Extended state/game data retains achievement fields | §§12.5–12.6 |

## 20. Approval gate

After approval, synchronize the existing HPA-485 implementation plan against this spec
before code work. In particular, copy the exact Mulberry32 seed mapping, fresh-RNG
vector semantics, `pick()` contract, per-mode version constants, run-key validation,
explicit-start error boundary, game-data read/write distinction, and achievement gate.
