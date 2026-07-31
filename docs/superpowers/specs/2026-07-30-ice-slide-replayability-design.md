# Ice Slide Replayability, Daily Challenge, and Seeded Expedition — Design and Requirements

- **Date:** 2026-07-30
- **Status:** Draft for review; Linear roadmap created
- **Repository:** `cwchanap/cetus`
- **Linear roadmap:** [HPA-483 — Ice Slide replayability](https://linear.app/cwchanap/issue/HPA-483/ice-slide-replayability-daily-challenge-seeded-expedition-and-evolving)
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
3. **Evolving mechanics:** risk/reward choices, limited Undo charges, snow stopping
   tiles, and cracked ice that changes board state.

The design intentionally avoids unconstrained random maze generation. Every generated
stage must come from authored structure, be validated by the production solver, and
have a deterministic checked-in fallback.

## 2. Current State

The current implementation has useful boundaries that should be retained:

- `levels.ts` owns eight authored string-grid levels and their BFS minimum `parMoves`.
- `physics.ts` provides grid parsing and slide resolution, apart from consuming crystals
  on the supplied grid clone.
- `game.ts` owns run state, fixed level progression, score accumulation, resets, and
  game-data reporting.
- `renderer.ts` draws state with PixiJS and translates keyboard/swipe input.
- `init.ts` owns browser lifecycle, the run guard, score submission, and DOM integration.
- The existing test suite contains a BFS implementation that verifies every authored
  level is solvable and that each crystal can be collected.

The platform score table currently stores only user, game, score, and timestamp.
Submitted `gameData` is used transiently for achievements but is not persisted. A fair
per-day leaderboard therefore requires a small reusable score-context extension.

## 3. Product Goals

### 3.1 Goals

1. Preserve the existing campaign, scoring, achievements, controls, and leaderboard
   behavior unless a requirement below explicitly changes them.
2. Give returning players a meaningfully different puzzle run each day.
3. Ensure the same seed and version identifiers always produce the same materialized
   run.
4. Guarantee that every shipped or generated stage is solvable without consumable
   abilities or an intentional fall/reset loop.
5. Keep competitive comparisons fair by separating Campaign and Daily scores.
6. Build reusable deterministic-run and score-context foundations that another
   level-based Cetus game can adopt later without depending on Ice Slide internals.
7. Keep generation bounded and recoverable; rejection must never leave the player on an
   invalid board or an indefinite loading state.
8. Maintain keyboard, swipe, mobile, reduced-motion, anonymous-play, and existing error
   cleanup support.

### 3.2 Non-goals

This roadmap does not include:

- Fully random wall-by-wall maze generation.
- User-authored or shared custom levels.
- Real-time multiplayer or head-to-head races.
- Server-authoritative move replay or comprehensive anti-cheat.
- Permanent stat upgrades, paid power, or an economy.
- Run resume after refresh; target runs remain short enough to restart.
- Changing the existing platform daily-challenge rotation algorithm.
- Migrating every Cetus game to score context in the first implementation.
- A global Expedition leaderboard before generated difficulty is calibrated across
  seeds.
- Seasonal leagues or historical Daily calendar browsing.

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
| Expedition ranking | Personal result/history only initially; no cross-seed global ranking. |
| Abilities | Generated stages must be solvable without them. Abilities are optional recovery tools only. |
| Failure handling | Bounded generation attempts followed by a known-good deterministic fallback. |

## 5. Modes

### 5.1 Campaign

Campaign remains the default onboarding and fixed optimization path.

Requirements:

- `IceSlideGame.start()` without an explicit run starts the existing eight-level
  Campaign.
- Campaign uses the original level order, names, rows, `parMoves`, scoring constants,
  completion overlay, and score-submission semantics.
- Campaign submissions continue through the unscoped/global leaderboard path so
  historical and new Campaign scores remain comparable.
- Campaign `End` continues to submit an accumulated partial score when the existing
  conditions are met.
- Campaign is not transformed and does not show Daily objective stars in the first
  replayability release.
- Existing Campaign achievement fields remain available and keep their current meaning.

### 5.2 Daily Challenge

Daily Challenge provides one shared puzzle sequence per UTC day.

Requirements:

- The run contains exactly five stages.
- All players using the same generator and ruleset versions receive identical final
  boards, objectives, names, and pars for the same UTC date.
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
- The player may retry the same Daily run without limit.
- `Play Again` retries the same seed and must not silently advance to a different run.
- Ending an incomplete Daily run does not submit a ranked score.
- Anonymous players can play and see local results but cannot submit, matching current
  score behavior.
- The Daily view displays the UTC date, reset timing, stage progress, objectives, stars,
  moves, crystals, and elapsed time.

#### 5.2.1 Daily stage selection

Daily generation v1 selects from existing authored Campaign levels without template
repetition using these tier pools:

| Daily stage | Eligible authored levels |
|---|---|
| 1 | 1–2 |
| 2 | 2–3 |
| 3 | 3–5 |
| 4 | 5–7 |
| 5 | 7–8 |

If a seeded choice would repeat a template already used in the run, generation chooses
the next deterministic candidate in that stage's seeded pool order.

Each selected board receives one seeded transformation from the square-grid symmetry
set:

- identity
- rotate 90°
- rotate 180°
- rotate 270°
- horizontal reflection
- vertical reflection
- main-diagonal reflection
- anti-diagonal reflection

Transformation labels may repeat across different stages. What must not repeat is the
final canonical board within one run. Symmetric duplicates of a source board are
removed by canonical row hashing before seeded selection.

The transformation utility must support rectangular fixtures correctly, including
row/column dimension swaps for quarter turns, even though the current Campaign boards
are square.

### 5.3 Seeded Expedition

Expedition is a later mode built on controlled mutation templates.

Requirements:

- A new Expedition creates a random seed once with `crypto.getRandomValues`; all later
  choices use deterministic seeded randomness.
- The UI supports **Retry Seed** and **New Expedition**.
- A run contains six stages: two easy, two medium, and two hard.
- A template defines authored alternatives for goal placement, rocks, hazards,
  crystals, transformations, and optional-objective eligibility.
- The generator never places arbitrary walls or entities outside authored template
  choices.
- No canonical board may repeat within a run.
- Expedition completion and partial results may be persisted for personal history and
  achievements, but they are excluded from Campaign and Daily leaderboards.
- Cross-seed global ranking remains disabled until a separate calibration decision is
  approved.

### 5.4 Expedition risk/reward extension

After basic Expedition is stable, add one choice after stages 2 and 4:

- **Safe Cache:** grant one Undo charge; the next stage keeps a `1.00×` multiplier.
- **Risk Protocol:** grant no Undo; the next stage receives one extra seeded eligible
  optional objective and a `1.25×` subtotal multiplier.

Undo behavior is fixed:

- Undo is available only immediately after a non-hazard committed move.
- Undo restores player position, grid contents, collected-crystal state,
  objective-relevant state, and dynamic tile state to the previous snapshot.
- Undo consumes one charge.
- Undo does **not** decrement total or stage move counters; using it still has an
  efficiency cost.
- Generated solutions and par calculations never assume an Undo charge.
- Campaign and Daily never expose route choices or Undo.

## 6. Objective and Star System

Daily and Expedition stages use a three-star result model:

1. **Clear:** reach the goal.
2. **Efficient:** finish at or under computed `parMoves`.
3. **Bonus objective:** one seeded eligible objective.

The initial bonus-objective pool is:

| Objective | Eligibility | Completion condition |
|---|---|---|
| `collect_all_crystals` | Final board contains at least one crystal | All stage crystals were collected before clear. |
| `no_falls` | Final board contains at least one hazard | No hazard was entered during the stage. |
| `no_reset` | Always | Neither manual Reset nor a hazard reset occurred. |

Requirements:

- The bonus objective is selected deterministically from the eligible set.
- Eligibility is calculated from the final transformed/generated board, not the source
  template.
- Daily v1 objectives are optional and cannot lock the goal.
- Missing an optional objective never makes a stage uncleared.
- A hazard increments both fall count and reset/attempt count.
- Manual Reset increments reset/attempt count but not fall count.
- Objective state is visible before the first committed move.
- Stage-clear feedback shows earned and missed stars before advancing.
- New mode-specific achievements use explicit mode/star/version data and never infer
  mode from score alone.

## 7. Scoring

All balance constants are centralized and covered by pure-function tests. Any change
that alters competitive score meaning increments `rulesetVersion`.

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

`optionalStarsEarned` counts the Efficient star and seeded bonus-objective star. The
Clear star is represented by the stage-clear base.

After all five stages:

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

When route choices ship, the selected multiplier applies to the complete next-stage
subtotal after objective bonuses and is rounded down to an integer.

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

- `rows` contains the final materialized board, so gameplay does not depend on generator
  internals.
- `signature` is a stable compact hash of final rows, par, objectives, and multiplier.
- `schemaVersion` changes only when serialized run-shape compatibility changes.
- `generatorVersion` changes whenever the same seed could resolve to different stages,
  including template-pool or generation-algorithm changes.
- `rulesetVersion` changes whenever physics, objective interpretation, or scoring
  changes competitive meaning.
- No generator path may call `Math.random()`.
- Seed hashing and pseudo-random generation use stable integer arithmetic.
- Random choices use labeled/forked streams so adding a choice in one stage does not
  perturb unrelated later stages.
- The RNG foundation may be shared, but this work must not silently change existing
  platform Daily Challenge outputs.
- `IceSlideGame` never reads the current date or chooses random values.

## 9. Ice Slide Game Data

Existing fields remain, and new fields are additive:

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
- `stageSignatures` contains compact hashes, not complete board rows.
- Campaign reports stable run/version data but submits through the existing unscoped
  leaderboard path.
- Daily `solved` is true only after all five stages clear.
- Expedition `solved` is true only after all six selected stages clear.
- Partial Expedition data may be stored for history, but it is never competitively
  ranked.

## 10. Solver and Quality Validation

The BFS currently embedded in tests becomes pure production code in `solver.ts`.

The solver reports at least:

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

- Existing Campaign pars remain equal to solver minimums.
- Solver state includes player position and consumed-crystal state.
- When cracked ice ships, solver state also includes collapsed-tile state.
- Solver exploration has an explicit state cap. Hitting it returns `truncated=true` and
  rejects the candidate; truncation is never treated as solvable.
- A generated stage is accepted only when:
  - exactly one start and one goal exist;
  - the goal is reachable;
  - computed par is inside the authored tier's allowed band;
  - every assigned objective is feasible;
  - every crystal required by an assigned objective is reachable;
  - the board is not a canonical duplicate of another stage in the run; and
  - the stage is solvable without Undo or any future ability.
- Generation makes at most 64 candidate attempts per stage.
- Exhausting attempts loads the deterministic known-good fallback for that tier and
  logs a development-visible diagnostic without exposing internals to the player.

## 11. Mutation Templates

Campaign levels remain fixed `IceSlideLevel` definitions. Expedition uses a separate
contract so authored Campaign content is not overloaded with procedural metadata.

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
- `baseRows` contains exactly one start glyph and no goal glyph. Generation selects
  exactly one goal from the authored goal slots.
- Template slots are named and authored; run definitions record selected slot IDs.
- `fallbackVariantId` resolves to a checked-in full-row stage variant, not a partial
  mutation recipe.
- Generation order is fixed:
  1. select template;
  2. select transformation;
  3. transform static rows and slot coordinates;
  4. select slot alternatives;
  5. materialize final rows;
  6. choose eligible objectives;
  7. solve and validate;
  8. accept or retry.
- Every template includes a checked-in known-good fallback variant.
- A content-validation command evaluates at least 1,000 seeds per tier before template
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
- Existing submissions that omit context behave as they do today.
- Campaign continues to omit competitive context so historical and new Campaign scores
  share the current leaderboard.
- Daily submits `mode='daily'`, its competition key, ruleset version, and serialized
  game data.
- Expedition submits `mode='expedition'` and versioned game data but is excluded from
  default global leaderboard queries.
- Score API validation bounds strings and payload size and validates Daily
  competition-key format. Comprehensive anti-cheat remains out of scope.
- Ice Slide Daily submissions enter ranking only when game data reports matching run
  identity, `mode='daily'`, and `solved=true`.
- `/api/leaderboard` remains backward compatible and gains optional `mode` and
  `competitionKey` filters.
- The default leaderboard returns only unscoped/Campaign rows.
- Daily ranking returns one row per user: that user's best completed submission.
- Ranking order is:
  1. score descending;
  2. elapsed seconds ascending;
  3. total moves ascending;
  4. submission time ascending.
- Daily leaderboard UI shows rank, player, score, elapsed time, and total moves.
- Repeated attempts remain stored for history, but only the selected best row appears
  in ranked output.
- Database initialization, migration compatibility, Kysely types, query tests, API
  tests, and legacy-schema tests change together.

## 13. New Tile Mechanics

### 13.1 Snow stopping tile

- Glyph: `N`
- Cell type: `snow`
- Entering snow stops the current slide immediately.
- Snow remains in place after use.
- It is not a wall: the player occupies the snow cell and may leave on a later move.
- Physics, solver, renderer, parsing, authoring docs, and tests must agree.
- Campaign boards remain unchanged.
- The mechanic increments the ruleset version wherever it can affect versioned runs.

### 13.2 Cracked ice

- Glyph: `F`
- Cell type: `fragile`
- First traversal is safe.
- A fragile cell collapses only after the player has left it.
- If the player stops on fragile ice, it remains safe while occupied and collapses when
  the player leaves on a later committed move.
- Any later attempt to enter the collapsed cell behaves as a hazard fall.
- Hazard and manual resets restore the stage's original fragile state.
- Undo restores exact pre-move fragile/collapsed state while retaining move cost.
- Solver state includes collapsed cells; a static-board result is insufficient.
- Generated stages must be solvable without intentionally falling to reset fragile
  state.

## 14. UI, Interaction, and Accessibility

- Add a compact mode selector before a run starts.
- Only shipped modes are selectable; do not show a permanently disabled Expedition
  placeholder in production.
- Campaign is selected by default.
- `/ice-slide?mode=daily` may preselect Daily when available.
- Start, End, Reset, and Play Again keep keyboard-accessible behavior.
- Daily shows date and UTC reset information without relying on color alone.
- Objectives have text labels and distinct complete/incomplete states.
- Stage-clear feedback is dismissible or automatically advances after a brief interval;
  reduced-motion users receive no forced animation delay.
- Swipe and keyboard input continue through the same movement entry point.
- Input is ignored while stage-clear, route-choice, or result overlays are active.
- Generated board-size changes continue to recreate and clean up Pixi safely.
- Snow, fragile ice, collapsed ice, holes, goals, rocks, crystals, and player must remain
  visually distinguishable under common color-vision deficiencies.
- A leaderboard outage does not block local play or completion.

## 15. Architecture and File Boundaries

Suggested focused modules:

```text
src/lib/games/shared/
  seeded-rng.ts          # stable seed hash, RNG, labeled forks

src/lib/games/ice-slide/
  types.ts               # run, stage, objective, template, state contracts
  levels.ts              # unchanged fixed Campaign content
  run.ts                 # Campaign and mode run construction
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

- `IceSlideGame` does not choose random values or inspect current date.
- Generators do not mutate live game state.
- Solver and scoring modules have no DOM, Pixi, database, or network dependencies.
- Renderer does not decide objective completion or score.
- Page and `init.ts` do not reimplement generation or physics.
- A failed score submission does not invalidate a completed local run.
- Checked-in content and fallbacks are validated independently of UI integration.

## 16. Error Handling and Fallbacks

- Invalid checked-in Campaign content fails tests and development startup loudly.
- A generated candidate that fails parsing, solver limits, objective feasibility,
  duplicate detection, or quality constraints is rejected and retried.
- Generation stops after 64 attempts per stage and uses the tier's known-good fallback.
- If even a checked-in fallback is invalid, the run fails through the existing
  `failRun` path, cleans up Pixi/input state, resets controls, and shows a player-safe
  error.
- Date, seed, and version parsing errors never fall back to `Math.random()`.
- A malformed `mode` query parameter falls back to Campaign and does not auto-start.
- Score-context migration failure preserves existing Campaign score behavior where
  possible and emits server diagnostics.
- Daily leaderboard failure shows an unavailable state and keeps the local result.
- Stale async score/leaderboard responses cannot mutate a newer run.

## 17. Testing Requirements

### 17.1 Unit and property tests

- Known seed strings produce stable RNG sequences.
- Labeled RNG forks are independent of unrelated call order.
- All eight board transformations are correct for square and rectangular fixtures.
- Transform plus inverse returns original rows and coordinate metadata.
- Symmetric boards deduplicate correctly.
- Existing Campaign levels remain solvable with unchanged pars.
- Objective eligibility/completion covers crystals, hazards, manual Reset, and falls.
- Daily generation is identical for the same date/version and varies over representative
  different dates.
- Generator attempt limits and fallback selection are deterministic.
- Mutation validation rejects missing/multiple start or goal, duplicates, impossible
  objectives, solver truncation, and out-of-band pars.
- Snow stops immediately and remains traversable on a later move.
- Fragile cells collapse only after exit and reset/Undo correctly.
- Scoring covers Campaign compatibility, Daily stars, Expedition multipliers, and
  version constants.

### 17.2 Database and API tests

- Legacy schemas migrate safely.
- Legacy score submissions still work without context.
- Context and game data persist for Daily/Expedition.
- Default leaderboard excludes scoped modes.
- Daily filters require matching competition key.
- Best-per-user ranking and every tie-break are deterministic.
- Incomplete or mismatched Ice Slide Daily submissions are not ranked.
- Oversized/malformed context and game data return bounded validation errors.

### 17.3 Integration and end-to-end tests

- Campaign Start → move → clear → Reset → End remains compatible.
- Daily mode shows expected date and deterministic first board.
- Daily retries reproduce the same run.
- Completing Daily submits once and displays scoped leaderboard result.
- Incomplete Daily End does not submit a ranked result.
- Anonymous Daily play completes locally without submission.
- Expedition Retry Seed and New Expedition have distinct deterministic behavior.
- Mode, stage-clear, route-choice, and result overlays gate input correctly.
- Desktop keyboard and mobile swipe paths exercise the same state transitions.
- Reduced-motion behavior avoids forced movement or overlay animation waits.
- Snow and fragile mechanics agree across runtime, solver, reset, renderer, and Undo.

## 18. Delivery Phases

### Phase 1 — Deterministic Daily MVP

- Versioned score context and scoped ranking queries.
- Versioned run contract, stable seeded RNG, and board transformations.
- Production solver extraction and quality validator.
- Mode selector and five-stage Daily generation from authored levels.
- Three-star objectives and Daily scoring.
- Per-date best-per-player leaderboard.

### Phase 2 — Controlled Expedition

- Nine authored mutation templates and full-row fallbacks.
- Bounded solver-validated generation.
- Six-stage seeded Expedition with Retry Seed/New Expedition.
- Personal Expedition result persistence, excluded from global ranking.

### Phase 3 — Run decisions and evolving boards

- Safe Cache / Risk Protocol choices.
- Undo charges and snapshot support.
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

- At least nine templates ship, three per difficulty tier.
- A deterministic 1,000-seed-per-tier validation run produces no invalid accepted
  stages, and every rejection terminates within attempt/state caps.
- Expedition always materializes six playable stages or checked-in fallbacks.
- Retry Seed reproduces rows, pars, objectives, mutation IDs, and signatures exactly.
- Expedition scores do not appear in Campaign or Daily leaderboards.

### Phase 3

- Safe and Risk choices apply the specified charge/objective/multiplier effects.
- Undo restores board state while retaining move cost.
- Snow and cracked-ice behavior is consistent across physics, solver, renderer, reset,
  signatures, versions, and tests.
- No generated stage requires Undo or a deliberate fall/reset to solve.

## 20. Linear Workstream Map

Each workstream receives its own implementation plan and independently reviewable pull
request. Later work must not be folded into an earlier issue merely because it touches
the same files.

| Phase | Issue | Scope | Blocked by |
|---|---|---|---|
| 1 | [HPA-484](https://linear.app/cwchanap/issue/HPA-484/persist-versioned-game-score-context-and-add-scoped-leaderboard) | Persist optional score context and add scoped leaderboard queries | — |
| 1 | [HPA-485](https://linear.app/cwchanap/issue/HPA-485/introduce-deterministic-ice-slide-run-definitions-seeded-rng-and-board) | Run definitions, seeded RNG, transformations, Campaign adapter | — |
| 1 | [HPA-486](https://linear.app/cwchanap/issue/HPA-486/extract-the-ice-slide-production-solver-and-generation-quality) | Production solver and stage quality validator | HPA-485 |
| 1 | [HPA-487](https://linear.app/cwchanap/issue/HPA-487/ship-ice-slide-daily-challenge-mvp-with-mode-selection-and-three-star) | Daily mode, objectives, scoring, and mode UI | HPA-484, HPA-485, HPA-486 |
| 1 | [HPA-488](https://linear.app/cwchanap/issue/HPA-488/add-the-per-day-ice-slide-leaderboard-and-best-per-player-ranking) | Per-day best-per-player ranking and UI | HPA-484, HPA-487 |
| 2 | [HPA-489](https://linear.app/cwchanap/issue/HPA-489/build-authored-ice-slide-mutation-templates-and-bounded-seeded-level) | Nine mutation templates, bounded generation, fallbacks, validation command | HPA-485, HPA-486, HPA-487 |
| 2 | [HPA-490](https://linear.app/cwchanap/issue/HPA-490/add-the-six-stage-seeded-ice-slide-expedition-mode) | Six-stage Expedition mode and personal result persistence | HPA-484, HPA-487, HPA-489 |
| 3 | [HPA-491](https://linear.app/cwchanap/issue/HPA-491/add-expedition-saferisky-choices-and-undo-charges) | Safe/Risk choices and Undo charges | HPA-490 |
| 3 | [HPA-492](https://linear.app/cwchanap/issue/HPA-492/add-snow-stopping-tiles-with-solver-and-renderer-support) | Snow stopping tiles | HPA-486 |
| 3 | [HPA-493](https://linear.app/cwchanap/issue/HPA-493/add-cracked-ice-dynamic-state-and-stateful-solver-support) | Cracked-ice dynamic state and stateful solver | HPA-491, HPA-492 |

## 21. Spec Self-Review

- **Placeholder scan:** no TBD, TODO, or unspecified implementation decision remains in
  the approved scope.
- **Consistency:** Campaign remains fixed and unscoped; Daily alone is competitively
  scoped; Expedition remains non-global until calibration.
- **Scope:** the roadmap is decomposed into ten bounded issues across three phases.
- **Ambiguity resolution:** transformation labels may repeat but final boards may not;
  mutation bases contain one start and no goal; fallbacks are complete materialized row
  sets; abilities are never required by solver acceptance.
