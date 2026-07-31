# Ice Slide Replayability, Daily Challenge, and Seeded Expedition — Design and Requirements

- **Date:** 2026-07-30
- **Status:** Draft for product and implementation review
- **Repository:** `cwchanap/cetus`
- **Original game issue:** [HPA-76 — Minigame: Ice Slide](https://linear.app/cwchanap/issue/HPA-76/minigame-ice-slide)
- **Original implementation:** [PR #48 — feat(ice-slide): add Ice Slide minigame](https://github.com/cwchanap/cetus/pull/48)

## 1. Summary

Ice Slide currently provides a fixed eight-level campaign. That campaign is useful as
an introduction and a stable score-optimization challenge, but repeated runs eventually
become memorization because the same layouts always appear in the same order.

This design preserves the existing campaign and adds replayability in three deliberate
layers:

1. **Daily Challenge:** five deterministic stages assembled from transformed authored
   boards, with the same run for every player on a given UTC date.
2. **Seeded Expedition:** six stages generated from authored mutation templates, with a
   new reproducible seed for each run.
3. **Evolving mechanics:** snow stopping tiles, cracked ice, and later expedition
   risk/reward choices that make board state and run decisions matter.

The design intentionally avoids unconstrained random maze generation. Every generated
stage must come from authored structure, be validated by the production solver, and
have a deterministic fallback.

## 2. Current State

The current implementation has several useful boundaries that should be retained:

- `levels.ts` owns eight authored string-grid levels and their BFS minimum `parMoves`.
- `physics.ts` provides pure grid parsing and slide resolution, apart from consuming
  crystals on the supplied grid clone.
- `game.ts` owns run state, fixed level progression, score accumulation, resets, and
  game-data reporting.
- `renderer.ts` draws the current state with PixiJS and translates keyboard/swipe input.
- `init.ts` owns the browser lifecycle, run guard, score submission, and DOM integration.
- The existing test suite already contains a BFS implementation that verifies every
  authored level is solvable and that each crystal can be collected.

The platform score table currently stores only user, game, score, and timestamp. The
submitted `gameData` is used transiently for achievements but is not persisted. A fair
per-day leaderboard therefore requires a small reusable score-context extension.

## 3. Product Goals

### 3.1 Goals

1. Preserve the existing campaign, scoring, achievements, controls, and leaderboard
   behavior unless a requirement below explicitly changes them.
2. Give returning players a meaningfully different puzzle run each day.
3. Ensure the same seed and version identifiers always produce the same run.
4. Guarantee that every shipped or generated stage is solvable without consumable
   abilities.
5. Keep competitive comparisons fair by separating campaign and daily scores.
6. Build reusable deterministic-run and score-context foundations that another
   level-based Cetus game can adopt later without requiring Ice Slide internals.
7. Keep generation bounded and recoverable; a rejected candidate must never leave the
   player on a loading screen or an invalid board.
8. Maintain full keyboard, swipe, mobile, reduced-motion, and anonymous-play support.

### 3.2 Non-goals

This roadmap does not include:

- Fully random wall-by-wall maze generation.
- User-authored or shared custom levels.
- Real-time multiplayer or head-to-head races.
- Server-authoritative move replay or comprehensive anti-cheat.
- Permanent stat upgrades, paid power, or an economy.
- Run resume after refresh; target runs remain short enough to restart.
- Changing the existing platform daily-challenge rotation algorithm.
- Migrating every Cetus game to the new score context in the first implementation.
- A global Expedition leaderboard before generated difficulty is calibrated across
  seeds.

## 4. Fixed Product Decisions

| Decision | Requirement |
|---|---|
| Campaign | The current eight levels remain fixed, ordered, and score-compatible. |
| Daily length | Five stages. |
| Expedition length | Six stages: two easy, two medium, and two hard. |
| Daily boundary | UTC, matching the existing platform challenge system. |
| Daily attempts | Unlimited; only the player's best completed result is ranked. |
| Daily generation v1 | Authored-level selection plus rotations/reflections; no tile mutation. |
| Expedition generation v1 | Authored mutation templates plus solver validation. |
| Competitive modes | Campaign keeps its current global leaderboard; Daily gets a per-date leaderboard. |
| Expedition ranking | Personal result/history only in the first release; no cross-seed global ranking. |
| Abilities | Generated stages must be solvable without them. Abilities are optional recovery tools only. |
| Failure handling | Bounded generation attempts followed by a known-good deterministic fallback. |

## 5. Modes

### 5.1 Campaign

Campaign is the default and remains the onboarding path.

Requirements:

- `IceSlideGame.start()` without an explicit run continues to start the existing
  eight-level campaign.
- Campaign uses the original level order, names, rows, `parMoves`, scoring constants,
  completion overlay, and score-submission semantics.
- Campaign submissions continue through the existing unscoped/global leaderboard path
  so historical and new campaign scores remain comparable.
- Campaign `End` continues to submit an accumulated partial score when the existing
  conditions are met.
- Campaign is not transformed and does not show Daily objective stars in the first
  replayability release.

### 5.2 Daily Challenge

Daily Challenge provides one shared puzzle sequence per UTC day.

Requirements:

- The run has exactly five stages.
- All players on the same generator/ruleset version receive identical final boards,
  objective assignments, names, and pars for the same UTC date.
- The seed string is:

  ```text
  ice-slide:daily:<generatorVersion>:<rulesetVersion>:YYYY-MM-DD
  ```

- The competition key is:

  ```text
  ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>
  ```

- A run started before UTC rollover remains attached to its captured competition key
  and may finish afterward. Starting a new run after rollover uses the new date.
- The player may retry the same daily run without limit.
- `Play Again` retries the same seed; it must not silently advance to a different run.
- Ending an incomplete Daily run does not submit a ranked score.
- Anonymous players can play and see results but cannot submit, matching current score
  behavior.
- The Daily view displays the UTC date, reset timing, stage progress, current objectives,
  stars earned, moves, crystals, and elapsed time.

#### 5.2.1 Daily stage selection

Daily generation v1 selects from the existing authored campaign levels without
replacement using these tier pools:

| Daily stage | Eligible authored levels |
|---|---|
| 1 | 1–2 |
| 2 | 2–3 |
| 3 | 3–5 |
| 4 | 5–7 |
| 5 | 7–8 |

If a seeded choice would repeat a template already used in the run, generation chooses
the next deterministic candidate in that stage's shuffled pool.

Each selected board receives one unique transformation from the square-grid symmetry
set when possible:

- identity
- rotate 90°
- rotate 180°
- rotate 270°
- horizontal reflection
- vertical reflection
- main-diagonal reflection
- anti-diagonal reflection

Symmetric duplicates are removed by canonical row hashing before the seeded choice is
made. The transformation utility must also support rectangular fixtures correctly,
including dimension swaps for quarter turns, even though the current campaign boards
are square.

### 5.3 Seeded Expedition

Expedition is a later mode built on controlled mutation templates.

Requirements:

- A new Expedition creates a random seed once with `crypto.getRandomValues`; all later
  decisions use deterministic seeded randomness.
- The UI supports both **Retry Seed** and **New Expedition**.
- A run contains six stages: two easy, two medium, and two hard.
- A template may define authored alternatives for goal placement, rocks, hazards,
  crystals, and optional-objective eligibility.
- The generator never places arbitrary walls outside authored template choices.
- No canonical board may repeat within a run.
- Expedition completion and partial results may be persisted for personal history and
  achievements, but they are excluded from the existing global campaign leaderboard.
- Cross-seed global ranking remains disabled until a separate calibration decision is
  made.

### 5.4 Expedition risk/reward extension

After basic Expedition is stable, add a choice after stages 2 and 4:

- **Safe Cache:** grants one Undo charge; the next stage keeps a `1.00×` multiplier.
- **Risk Protocol:** grants no Undo; the next stage receives one extra seeded optional
  objective and a `1.25×` subtotal multiplier.

Undo behavior is fixed as follows:

- It is available only after a non-hazard committed move.
- It restores player position, grid contents, collected-crystal state, and dynamic tile
  state to the previous snapshot.
- It consumes one charge.
- It does **not** decrement total or stage move counters; using Undo therefore still has
  an efficiency cost.
- Generated solutions and par calculations never assume an Undo charge.

## 6. Objective and Star System

Daily and Expedition stages use a three-star result model:

1. **Clear:** reach the goal.
2. **Efficient:** finish at or under the computed `parMoves`.
3. **Bonus objective:** one seeded eligible objective.

The initial bonus-objective pool is:

| Objective | Eligibility | Completion condition |
|---|---|---|
| `collect_all_crystals` | Board contains at least one crystal | All stage crystals were collected before clear. |
| `no_falls` | Board contains at least one hazard | No hazard was entered during the stage. |
| `no_reset` | Always | The Reset action was not used and no hazard reset occurred. |

Requirements:

- The bonus objective is chosen deterministically from the eligible set.
- Objective eligibility is calculated from the final transformed/generated board, not
  the source template.
- Objectives are evaluated at stage clear and cannot block the goal in Daily v1.
- A stage remains clearable even when an optional objective is missed.
- Hazard resets increment both the run's fall count and attempt/reset count.
- Manual Reset increments the attempt/reset count but not the fall count.
- Objective state must be visible before the player commits the first move.
- The stage-clear presentation shows earned and missed stars before advancing.
- Campaign achievements continue to evaluate their existing fields. New mode-specific
  achievements must use explicit `mode`, `starsEarned`, or run-version data rather than
  infer mode from score.

## 7. Scoring

All balance constants are centralized and covered by pure-function tests. Any change
that can alter competitive score meaning increments `rulesetVersion`.

### 7.1 Campaign

Campaign scoring is unchanged:

- Stage clear: `200 × levelNumber`
- Move efficiency: `max(0, (parMoves - movesUsed + 1) × 25)` when at or under par
- Crystal: `50 × collected`
- Completed-run time bonus: `max(0, (360 - elapsedSeconds) × 5)`

### 7.2 Daily

For each of the five stages:

```text
stage subtotal =
  200 × stageNumber
  + moveEfficiency(parMoves, movesUsed)
  + 50 × crystalsCollected
  + 100 × optionalStarsEarned
```

`optionalStarsEarned` counts the Efficient star and the seeded bonus-objective star;
the Clear star is represented by the stage-clear base.

On completion of all five stages:

```text
daily completion bonus = max(0, (300 - elapsedSeconds) × 5)
```

Falls and resets have no direct point deduction. Their cost is expressed through extra
moves/time and missed objectives.

### 7.3 Expedition

Basic Expedition uses the same stage formula with six stage numbers and:

```text
expedition completion bonus = max(0, (360 - elapsedSeconds) × 5)
```

When risk/reward choices ship, the selected route multiplier applies to the complete
next-stage subtotal after objective bonuses and is rounded down to an integer.

## 8. Deterministic Run Contracts

Generation and gameplay are separate. A generator materializes a complete run; the
game engine only consumes it.

```ts
export type IceSlideMode = 'campaign' | 'daily' | 'expedition'

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
  difficulty: 'tutorial' | 'easy' | 'medium' | 'hard'
  rows: string[]
  parMoves: number
  transform: BoardTransform
  mutationIds: string[]
  objectiveIds: IceSlideObjectiveId[]
  scoreMultiplierBps: number
  signature: string
}
```

Requirements:

- `rows` contains the final materialized board so gameplay does not depend on generator
  internals.
- `signature` is a stable hash of final rows, par, objectives, and scoring multiplier.
- `schemaVersion` changes only when serialized run shape compatibility changes.
- `generatorVersion` changes whenever the same seed could resolve to different stages,
  including template-pool or generation-algorithm changes.
- `rulesetVersion` changes whenever physics, objective interpretation, or scoring
  changes competitive meaning.
- No generator path may call `Math.random()`.
- Seed hashing and pseudo-random generation use stable integer arithmetic.
- Random choices use labeled/forked streams so adding a choice in one stage does not
  perturb unrelated later stages.
- The new RNG may be shared infrastructure, but this work must not silently change the
  existing platform challenge rotation output.

## 9. Ice Slide Game Data

Existing fields remain and new fields are additive:

```ts
export interface IceSlideGameData {
  levelsCleared: number
  totalMoves: number
  crystalsCollected: number
  elapsedSeconds: number
  solved: boolean
  perfectLevels: number

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
  routeChoices?: Array<'safe' | 'risky'>
  undoChargesUsed?: number
}
```

Requirements:

- Existing achievement checks continue to function from their original fields.
- `stageSignatures` contains only compact hashes, not complete board rows.
- Campaign reports a stable campaign run key and version data but submits through the
  existing global score scope.
- Daily `solved` is true only after all five stages clear.
- Expedition `solved` is true only after all six selected stages clear.

## 10. Solver and Quality Validation

The BFS currently embedded in tests becomes production code in `solver.ts` and remains
pure.

The solver must report at least:

```ts
interface IceSlideSolveResult {
  solvable: boolean
  minMoves: number | null
  reachableStopCount: number
  reachableCrystalIds: string[]
  objectiveFeasibility: Record<IceSlideObjectiveId, boolean>
  exploredStates: number
  truncated: boolean
}
```

Requirements:

- Existing campaign pars must still equal solver minimums.
- Solver state includes player position and consumed-crystal state.
- When cracked ice ships, solver state also includes dynamic collapsed-tile state.
- Solver exploration has an explicit state cap. Hitting the cap returns `truncated=true`
  and rejects the candidate; it must not be treated as solvable.
- A generated stage is accepted only when:
  - exactly one start and one goal exist;
  - the goal is reachable;
  - the computed par is inside its authored tier's allowed band;
  - every assigned objective is feasible;
  - every crystal required by an assigned objective is reachable;
  - the board is not a canonical duplicate of another stage in the run; and
  - the stage is solvable without Undo or any future ability.
- The generator makes at most 64 candidate attempts per stage.
- Exhausting attempts loads a deterministic known-good fallback for that tier and logs
  a development-visible diagnostic without exposing internal errors to the player.

## 11. Mutation Templates

Campaign levels remain `IceSlideLevel` definitions. Expedition uses a separate template
contract so fixed content is not overloaded with procedural metadata.

```ts
interface IceSlideTemplate {
  id: string
  name: string
  difficulty: 'easy' | 'medium' | 'hard'
  baseRows: string[]
  allowedTransforms: BoardTransform[]
  slots: {
    goals: NamedPosition[]
    rocks: NamedPosition[]
    hazards: NamedPosition[]
    crystalPatterns: NamedPositionGroup[]
  }
  constraints: {
    minPar: number
    maxPar: number
    minReachableStops: number
    maxHazards: number
  }
  fallbackVariantId: string
}
```

Requirements:

- Ship at least three templates per tier before enabling Expedition: nine total.
- Template slots are named and authored; run definitions record selected slot IDs.
- Generation order is fixed:
  1. select template;
  2. select transformation;
  3. transform static rows and slot coordinates;
  4. select slot alternatives;
  5. materialize final rows;
  6. choose eligible objectives;
  7. solve and validate;
  8. accept or retry.
- Every template includes a checked-in, known-good fallback variant.
- A content-validation script evaluates at least 1,000 seeds per tier before template
  pool changes are merged. Normal CI may use a deterministic 100-seed smoke set.

## 12. Score Persistence and Leaderboard Scoping

The platform score path gains optional context without changing legacy submissions.

Add nullable columns to `game_scores`:

```text
mode                TEXT NULL
competition_key     TEXT NULL
ruleset_version     INTEGER NULL
game_data_json      TEXT NULL
```

Add an index suitable for scoped ranking:

```text
(game_id, mode, competition_key, score DESC, created_at ASC)
```

Requirements:

- Existing rows remain valid and require no destructive rewrite.
- Existing game submissions that omit context behave exactly as they do today.
- Campaign continues to omit score context so historical and new campaign scores share
  the current leaderboard.
- Daily submits `mode='daily'`, its competition key, ruleset version, and serialized
  game data.
- Expedition submits `mode='expedition'` and versioned game data but is excluded from
  default global leaderboard queries.
- Score API validation bounds all strings and validates the Daily competition-key
  format. Comprehensive anti-cheat is outside scope.
- Ice Slide Daily submissions are accepted for ranking only when game data reports the
  matching run key, `mode='daily'`, and `solved=true`.
- `/api/leaderboard` remains backward compatible and gains optional `mode` and
  `competitionKey` filters.
- Daily ranking returns one row per user: that user's best completed submission.
- Ranking order is:
  1. score descending;
  2. elapsed seconds ascending;
  3. total moves ascending;
  4. submission time ascending.
- The Daily leaderboard UI shows rank, player, score, elapsed time, and total moves.
- A player's repeated attempts remain stored for history, but only the selected best
  row appears in the ranked result.
- Database initialization, migration compatibility, Kysely types, query tests, API
  tests, and legacy-schema tests must all be updated together.

## 13. New Tile Mechanics

### 13.1 Snow stopping tile

- Glyph: `N`
- Cell type: `snow`
- Entering snow stops the current slide immediately.
- Snow remains in place after use.
- It is not a wall: the player occupies the snow cell and may leave in a later move.
- Physics, solver, renderer, parsing, authoring documentation, and tests must agree on
  this behavior.
- Campaign boards remain unchanged.

### 13.2 Cracked ice

- Glyph: `F`
- Cell type: `fragile`
- The first traversal is safe.
- A fragile cell collapses only after the player has left it.
- Any later attempt to enter the collapsed cell behaves as a hazard fall.
- If the player stops on fragile ice, it remains safe while occupied and collapses when
  the player leaves on a later committed move.
- Hazard and manual resets restore the stage's original fragile state.
- Solver state must model collapsed cells; a static-board solver result is insufficient.
- Generated levels must be solvable without intentionally falling to reset fragile
  state.

## 14. UI and Interaction Requirements

- Add a compact mode selector before a run starts.
- Only shipped modes are selectable; do not show a permanently disabled Expedition
  placeholder in production.
- Campaign is selected by default.
- `/ice-slide?mode=daily` may preselect Daily when that mode is available.
- Start, End, Reset, and Play Again keep their existing keyboard-accessible behavior.
- Daily shows its date and UTC reset information without relying on color alone.
- Objectives have text labels and distinct complete/incomplete states.
- Stage-clear feedback is dismissible or automatically advances after a brief interval;
  reduced-motion users receive no forced animation delay.
- Swipe and keyboard input continue through the same movement entry point.
- Input is ignored while stage-clear, route-choice, or result overlays are active.
- Generated board-size changes continue to recreate and clean up the Pixi renderer
  safely.
- Snow, fragile ice, holes, goals, rocks, crystals, and the player must remain visually
  distinguishable under common color-vision deficiencies.

## 15. Architecture and File Boundaries

Suggested focused modules:

```text
src/lib/games/shared/
  seeded-rng.ts          # stable seed hash, RNG, labeled forks

src/lib/games/ice-slide/
  types.ts               # run, stage, objective, template, and state contracts
  levels.ts              # unchanged fixed campaign content
  run.ts                 # campaign and mode run construction
  transforms.ts          # grid and coordinate transformations
  solver.ts              # pure BFS/state-space validation
  objectives.ts          # eligibility and completion evaluation
  templates.ts           # authored Expedition templates and fallbacks
  generator.ts           # bounded deterministic Daily/Expedition generation
  physics.ts             # slide rules and dynamic tile transitions
  scoring.ts             # versioned pure score functions
  game.ts                # consumes a materialized run definition
  renderer.ts            # board and objective-related visual state
  init.ts                # selected mode, lifecycle, submission context
```

Platform score-context work remains outside the game folder in the existing score
service, API validation, database types/queries, schema scripts, and leaderboard UI.

Boundary requirements:

- `IceSlideGame` does not choose random values or inspect the current date.
- Generators do not mutate live game state.
- Solver and scoring modules have no DOM, Pixi, database, or network dependencies.
- Renderer does not decide objective completion or score.
- The page and `init.ts` do not reimplement generation or physics.
- A failed score submission does not invalidate a completed local run.

## 16. Error Handling and Fallbacks

- Invalid checked-in campaign content fails tests and development startup loudly.
- A generated candidate that fails parsing, validation, solver limits, objective
  feasibility, or duplicate detection is rejected and retried.
- Generation stops after 64 attempts per stage and uses the tier's known-good fallback.
- If even the checked-in fallback is invalid, the run fails through the existing
  `failRun` path, cleans up Pixi/input state, resets controls, and shows a player-safe
  error.
- Date, seed, and version parsing errors never fall back to `Math.random()`.
- A malformed `mode` query parameter falls back to Campaign and does not start a run
  automatically.
- Score-context migration failure preserves the existing campaign score path where
  possible and surfaces server diagnostics.
- Daily leaderboard failure does not prevent play; the page shows an unavailable state
  and keeps the local result.

## 17. Testing Requirements

### 17.1 Unit and property tests

- Known seed strings produce stable RNG sequences.
- Labeled RNG forks are independent of unrelated call order.
- All eight board transformations are correct for square and rectangular fixtures.
- Transform plus inverse returns the original rows and coordinate metadata.
- Symmetric boards deduplicate correctly.
- Existing campaign levels remain solvable with unchanged pars.
- Objective eligibility and completion cover crystals, hazards, manual reset, and falls.
- Daily generation produces the same run for the same date/version and different runs
  for a representative set of different dates.
- Generator attempt limits and fallback selection are deterministic.
- Mutation validation rejects missing start/goal, duplicates, impossible objectives,
  solver truncation, and out-of-band pars.
- Snow stops immediately.
- Fragile cells collapse only after exit and reset correctly.
- Scoring functions cover campaign compatibility, Daily stars, Expedition multipliers,
  and version constants.

### 17.2 Database and API tests

- Legacy schemas migrate safely.
- Legacy score submissions still work without context.
- Context and game data persist for Daily/Expedition.
- Default leaderboard excludes scoped modes.
- Daily filters require the matching competition key.
- Best-per-user ranking and all tie-breaks are deterministic.
- Incomplete or mismatched Ice Slide Daily submissions are not ranked.

### 17.3 Integration and end-to-end tests

- Campaign Start → move → clear → Reset → End remains compatible.
- Daily mode shows the expected date and deterministic first board.
- Daily retries reproduce the same run.
- Completing Daily submits once and displays the scoped leaderboard result.
- Incomplete Daily End does not submit a ranked result.
- Anonymous Daily play completes locally without submission.
- Mode and overlay transitions gate input correctly.
- Desktop keyboard and mobile swipe paths exercise the same run state.
- Reduced-motion behavior avoids forced movement or overlay animation waits.

## 18. Delivery Phases

### Phase 1 — Deterministic Daily MVP

- Versioned run contract and stable seeded RNG.
- Board transformations and production solver extraction.
- Campaign compatibility adapter.
- Mode selector and five-stage Daily generation from authored levels.
- Three-star objectives and Daily scoring.
- Versioned score context and per-day leaderboard.

### Phase 2 — Controlled Expedition

- Nine authored mutation templates and fallbacks.
- Bounded solver-validated generation.
- Six-stage seeded Expedition with Retry Seed/New Expedition.
- Personal Expedition result persistence, excluded from global ranking.

### Phase 3 — Run decisions and evolving boards

- Safe Cache / Risk Protocol choices.
- Undo charges and route multiplier.
- Snow stopping tiles.
- Cracked-ice dynamic state and stateful solver support.

## 19. Acceptance Criteria by Phase

### Phase 1

- Existing Campaign behavior and historical leaderboard compatibility are preserved.
- Two clients using the same UTC date and versions receive identical five-stage Daily
  run definitions and signatures.
- Every Daily stage is solver-validated and uses a correct computed par.
- Daily can be completed with keyboard and swipe controls.
- Daily displays three objectives/stars per stage.
- Only completed Daily runs are ranked.
- The per-day leaderboard shows one best result per user with documented tie-breaks.
- Generation and leaderboard failure states do not prevent local play.

### Phase 2

- At least nine authored templates ship, three per difficulty tier.
- A deterministic 1,000-seed-per-tier validation run produces no invalid accepted
  stages and every rejection terminates within the attempt/state caps.
- Expedition always materializes six playable stages or checked-in fallbacks.
- Retry Seed reproduces stage rows, pars, objectives, and signatures exactly.
- Expedition scores do not appear in the Campaign or Daily leaderboards.

### Phase 3

- Safe and risky choices apply the specified charge/objective/multiplier effects.
- Undo restores board state while retaining move cost.
- Snow and cracked-ice behavior is consistent across physics, solver, renderer, reset,
  and tests.
- No generated stage requires Undo or a deliberate fall to solve.

## 20. Workstream Decomposition

The implementation should be tracked as independently reviewable workstreams rather
than one large feature branch:

1. Persist optional versioned score context and add scoped leaderboard queries.
2. Add deterministic run definitions, seeded RNG, and board transformations.
3. Extract the production solver and quality validator.
4. Ship Daily Challenge mode, objectives, scoring, and mode UI.
5. Add the per-day best-per-player leaderboard experience.
6. Build authored mutation templates and bounded generation.
7. Add the six-stage seeded Expedition mode.
8. Add Safe Cache / Risk Protocol choices and Undo charges.
9. Add snow stopping tiles.
10. Add cracked-ice dynamic state and stateful solver support.

Each workstream receives its own implementation plan and pull request. Later workstreams
must not be folded into an earlier task merely because they touch the same files.
