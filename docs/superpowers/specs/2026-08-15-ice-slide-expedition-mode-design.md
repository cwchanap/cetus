# Ice Slide Six-Stage Seeded Expedition Mode — Design

- **Date:** 2026-08-15
- **Status:** Proposed for HPA-490 implementation
- **Repository:** `cwchanap/cetus`
- **Linear issue:** HPA-490 — Add the six-stage seeded Ice Slide Expedition mode
- **Foundation:** HPA-484, HPA-487, and HPA-489 are complete on `main`

## 1. Summary

HPA-490 is an assembly and product-integration task. The repository already has the difficult foundations:

- versioned score context and isolation of contextual rows from the legacy Campaign leaderboard;
- materialized `IceSlideRunDefinition` / `IceSlideStageDefinition` contracts and Expedition run-key validation;
- Daily objective/star/scoring behavior and browser lifecycle patterns;
- nine authored Expedition template families, bounded solver validation, transform-invariant duplicate detection, deterministic fallbacks, and the one-stage `createIceSlideExpeditionStage()` seam.

Add one pure `expedition.ts` materializer for the fixed six-stage run, then extend the existing game/init/page seams. Keep browser randomness and captured retry identity in `init.ts`. Add only two small mode-policy helpers in `scoring.ts` to avoid duplicating `daily || expedition` checks.

Do not add a generated-run framework, mode registry, persistence service, new DB/API/leaderboard path, generic overlay system, or HPA-491 route-choice/Undo machinery.

## 2. Existing seams to reuse

Reuse directly:

- `src/lib/games/ice-slide/generator.ts`
  - `createIceSlideExpeditionStage({ seed, stageNumber, difficulty, existingCanonicalKeys })`
  - `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 1`
  - 64-attempt bound, 10,000-state solver cap, deterministic fallbacks, transform-orbit dedupe, DEV diagnostics.
- `src/lib/games/ice-slide/run.ts`
  - schema/ruleset constants, stage signatures, run validation, and existing private Expedition run-key grammar.
- `src/lib/games/ice-slide/game.ts`
  - consumes complete materialized runs and owns stage progression/counters/game data.
- `src/lib/games/ice-slide/init.ts`
  - owns browser lifecycle, retry state, Pixi recreation, HUD/overlay text, input locking, run guard, and score submission.
- `src/lib/games/ice-slide/scoring.ts`
  - pure configurable stage and completion scoring.
- HPA-484 score context
  - `scoreContextSchema` already accepts `mode='expedition'`;
  - contextual rows are already excluded from unscoped Campaign/global leaderboard reads;
  - Daily ranking explicitly selects Daily context.

No DB migration, DB query, `/api/scores`, `/api/leaderboard`, or Daily-leaderboard change is required.

## 3. Approaches considered

### 3.1 Recommended: pure run materializer + narrow integration

Create `expedition.ts` to assemble six stages from the HPA-489 one-stage generator. `init.ts` creates a browser seed, captures the materialized retry run, and owns HUD/result text that needs the raw seed. The Astro page supplies markup and event wiring.

Use two tiny helpers for shared Daily/Expedition objective/scoring policy. Keep real differences explicit: Daily has a competition key/ranking; Expedition may persist a positive-score partial End.

### 3.2 Generic mode framework

Rejected. Three modes do not justify a registry/controller hierarchy. Two pure helpers over the existing union are enough.

### 3.3 Assemble stages in `init.ts`

Rejected. Deterministic generation belongs outside DOM/Pixi/browser-randomness lifecycle and should stay unit-testable.

### 3.4 Persist zero-progress Expedition Ends

Rejected for HPA-490. Persisting score `0` would require relaxing both `init.ts` and `scoreService.ts`, but the resulting row is immediately consumed by generic profile/history/stat/challenge paths even though HPA-490 ships no Expedition-specific history reader. A Start → immediate End would count as a played game and could advance `PLAY_GAMES`/variety challenge state.

Positive-score partial Expedition rows already satisfy the ticket's useful personal-history/achievement intent. A stage-0 End remains a local result only. If a future Expedition history UI needs zero-progress attempts, add that behavior with an explicit product decision then.

## 4. Fixed decisions

1. Add one pure `src/lib/games/ice-slide/expedition.ts`; do not expand `generator.ts` into a run builder.
2. `IceSlidePlayableMode` becomes `campaign | daily | expedition` when HPA-490 ships.
3. The six stage difficulties are fixed:

   ```ts
   ['easy', 'easy', 'medium', 'medium', 'hard', 'hard']
   ```

4. `createIceSlideExpeditionRunDefinition(seed)` calls `createIceSlideExpeditionStage()` exactly six times with stage numbers 1–6 and one accumulating transform-orbit canonical-key set.
5. Add each returned canonical key only after successful stage generation.
6. The run materializer never calls Web Crypto, `Date`, DOM/Pixi, network, or `Math.random()`.
7. A fresh Expedition captures one 128-bit seed with `crypto.getRandomValues(new Uint32Array(4))`, serialized as 32 lowercase hex characters.
8. Web Crypto failure is loud through the existing `failRun()` path; never fall back to `Math.random()`.
9. Retry Seed clones the already-materialized run. It never regenerates from current template/generator code.
10. New Expedition is simply `handle.start('expedition')` again; do not add a redundant `handle.newExpedition()` method.
11. Expedition uses the Daily three-star model: Clear, Efficient, and one seeded bonus objective.
12. Expedition uses `objectiveStarBonus = 100`, `timeBudgetSeconds = 360`, `timeBonusPerSec = 5`.
13. The 360-second Expedition budget intentionally matches the current Campaign default. HPA-490 does not rebalance it. A zero completion-time bonus is an acceptable common v1 outcome on slower six-stage runs; do not write UI copy that promises finishing under 6:00 as a normal target.
14. Daily remains on its 300-second budget. Campaign keeps its existing default-config call path.
15. Add `isIceSlideObjectiveMode(mode)` and `iceSlideScoringConfig(mode)` in `scoring.ts`; do not create a registry.
16. All HPA-490 stages remain `scoreMultiplierBps = 10_000`; HPA-491 owns risk/reward multipliers.
17. Completed Expedition runs submit contextual `mode='expedition'` rows with no competition key.
18. Manual Expedition End submits only when accumulated score is **greater than zero**, matching the existing score-service contract. A zero-score End is local-only.
19. Positive-score partial Expedition rows intentionally participate in existing generic score history, user stats, achievements, and daily challenge progress. They require actual stage progress; zero-progress rows are not persisted.
20. Daily End remains local-only. Campaign behavior remains unchanged.
21. `UNAUTHENTICATED` is silent for Daily and Expedition so anonymous play remains local; other submission errors remain visible.
22. `failRun()` clears `retryRun`, resets `currentMode` to Campaign, and clears `dailyDateKey` so a failed mode start cannot leave stale retry identity behind.
23. `playAgain()` never silently falls from Daily/Expedition to Campaign if objective-mode retry state is unexpectedly missing; treat that invariant failure as an error.
24. The full 32-hex seed remains browser-owned captured run state. Do not add it to `IceSlideState` or persisted `IceSlideGameData` just for display.
25. `?mode=daily` and `?mode=expedition` preselect their shipped modes. Unknown values fall back to Campaign. Query preselection does not reproduce an Expedition seed; it only selects the mode before Start.
26. No run resume, seed input/share, personal-history UI, Safe/Risky choice, Undo, snow, cracked ice, cross-seed ranking, seasons, or rewards.

## 5. Expedition run construction

Create:

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
): IceSlideRunDefinition
```

The materializer:

1. rejects an empty seed;
2. creates one `Set<string>` for canonical keys;
3. generates all six stages with the same seed and fixed difficulty sequence;
4. passes prior keys to every later stage;
5. records each accepted key;
6. hashes the seed once for the run-key identity;
7. returns schema/generator/ruleset versions, `mode: 'expedition'`, the original seed, and all six materialized stages;
8. calls `assertValidIceSlideRunDefinition()` before returning.

There is no outer retry loop. HPA-489 already owns bounded candidate attempts and fallback selection.

### 5.1 Run-key helpers

Expose the existing grammar through an inverse pair matching Daily:

```ts
export interface IceSlideExpeditionRunIdentity {
  seedHash: string
  generatorVersion: number
  rulesetVersion: number
}

export function parseIceSlideExpeditionRunKey(
  runKey: string
): IceSlideExpeditionRunIdentity | null

export function formatIceSlideExpeditionRunKey(
  identity: IceSlideExpeditionRunIdentity
): string
```

The formatter validates the 8-lowercase-hex hash and positive versions. The run materializer performs `hashString32Hex(seed)` because it owns the raw seed. Run validation uses the parser and separately verifies that the run's seed hashes to the key identity.

No schema/ruleset bump is required for HPA-490.

## 6. Objective/scoring policy

Add:

```ts
export const EXPEDITION_SCORING_CONFIG: IceSlideModeScoringConfig = {
  objectiveStarBonus: 100,
  // Intentionally equal to the existing Campaign completion budget.
  timeBudgetSeconds: 360,
  timeBonusPerSec: 5,
}

export function isIceSlideObjectiveMode(mode: IceSlideMode): boolean {
  return mode !== 'campaign'
}

export function iceSlideScoringConfig(
  mode: IceSlideMode
): IceSlideModeScoringConfig {
  return mode === 'daily'
    ? DAILY_SCORING_CONFIG
    : mode === 'expedition'
      ? EXPEDITION_SCORING_CONFIG
      : SCORING_CONFIG
}
```

`IceSlideGame.clearLevel()` uses these helpers for objective/star behavior and mode config selection while preserving Campaign's existing default-config `levelScore()` / `timeBonus()` calls.

`init.ts` may use `isIceSlideObjectiveMode()` for truly shared stage-result/retry/auth behavior, but Daily competition behavior and Expedition End persistence remain explicit branches.

## 7. Browser lifecycle

Keep a single captured non-Campaign run:

```ts
let retryRun: IceSlideRunDefinition | null = null
```

Fresh Expedition seed helper:

```ts
function createExpeditionSeed(): string {
  const words = new Uint32Array(4)
  crypto.getRandomValues(words)
  return Array.from(words, word => word.toString(16).padStart(8, '0')).join('')
}
```

Behavior:

- Campaign start clears retry metadata and starts Campaign.
- Daily start materializes today's run and captures a clone in `retryRun`.
- Expedition start captures one Web Crypto seed, materializes all six stages, and captures a clone in `retryRun`.
- Retry Seed / Play Again clones the captured run for objective modes.
- If an objective mode somehow has no retry snapshot, fail loudly instead of silently starting Campaign.
- `failRun()` invalidates the run guard, destroys game/renderer, hides mode/result UI, **clears retry state**, resets internal mode to Campaign, and restores Start.
- Stage dimension changes continue to recreate Pixi exactly as today.

## 8. Submission semantics

Expedition completion or positive-score partial End submits:

```ts
{
  context: {
    mode: 'expedition',
    rulesetVersion: gameData.rulesetVersion,
  },
  gameData,
}
```

No competition key is sent.

Keep the existing `submitScore(finalScore)` positive-score guard. `scoreService.ts` remains untouched.

End behavior:

- Expedition score `> 0`: stop locally, show `RUN ENDED`, populate Expedition summary, submit `solved: false` contextual game data.
- Expedition score `0`: stop locally, show `RUN ENDED`, populate Expedition summary, **do not submit**.
- Expedition completion: submit once with `solved: true`.
- Daily End: local-only.
- Campaign: unchanged.

Submission failure never invalidates the local result. Silent `UNAUTHENTICATED` applies to Daily and Expedition only.

## 9. UI and interaction

### 9.1 Mode selector

Ship three radios:

```text
Campaign | Daily | Expedition
```

`?mode=expedition` preselects Expedition; Start still creates a fresh random seed.

### 9.2 Expedition HUD

Add a separate hidden `#expedition-meta` card. `init.ts::syncHud()` owns its text because `init.ts` owns `retryRun.seed`.

Display:

- full 32-hex seed;
- `Stage N / 6 · TIER`;
- cumulative `Stars X / Y`;
- cumulative Falls / Resets;
- Clear / Efficient / Bonus objective text.

Use the **materialized run** as the tier source:

```ts
retryRun?.stages[state.levelIndex]?.difficulty
```

Do not import the intended difficulty array into `init.ts` just for display.

Compute maximum stars from runtime state:

```ts
state.stagesTotal * 3
```

Moves, crystals, elapsed time, level, and score remain shared HUD fields.

### 9.3 Stage-clear/final result

Reuse the stage-clear overlay for Daily and Expedition non-final stages; input stays locked until Continue.

Rename Daily-only final-star IDs to neutral `#run-final-*` IDs in one cohesive DOM-contract task that updates `init.ts` and page markup together. Do not leave an intermediate commit where Expedition renders a `Daily stars` heading.

Expedition final/End summary includes seed, stages cleared / total, stars, moves, crystals, falls/resets, elapsed time.

`init.ts` populates values from `game.getGameData()` plus `retryRun?.seed`. The page owns action labels/wiring:

- Expedition result: Play Again label = **Retry Seed**; New Expedition visible.
- New Expedition button calls `gameHandle.start('expedition')` directly.
- Campaign/Daily: Play Again label remains **Play Again**; New Expedition hidden.
- Change Mode returns to idle.

### 9.4 Page bootstrap guard

Do not add all Expedition display-only nodes to the page's existing all-or-nothing `init()` DOM guard. `init.ts` setters already tolerate missing display nodes and `game-board-markup.test.ts` locks the required static IDs.

Use optional wiring for the New Expedition button (`newExpeditionBtn?.addEventListener(...)`) so a display/control typo cannot silently disable Campaign and Daily initialization. The markup test remains the build-time contract.

## 10. Error handling and residual risks

### 10.1 Full-run generation exhaustion

Because the entire six-stage run materializes before `game.start()`, cross-tier canonical-key exhaustion is a **pre-run** failure, not a mid-run failure. HPA-489 throws if a stage has no valid candidate/fallback remaining.

Mitigation:

- exercise **500 deterministic complete six-stage runs** in `expedition.test.ts`;
- assert every run has the fixed 2/2/2 sequence, six transform-orbit-unique boards, and passes run validation;
- retain HPA-489's 1,000-seed-per-tier validator as the deeper generator/content regression;
- runtime failure goes through `failRun()`, and the player can start a New Expedition with a fresh seed.

Do **not** assert that the 500-run sweep uses zero fallbacks. Fallbacks are explicitly valid HPA-489 output; HPA-489's validator already reports fallback frequency. HPA-490's direct test owns complete-run assembly, not a second fallback-quality policy.

### 10.2 Web Crypto failure

Fail through the normal player-safe error path. No pseudo-random fallback.

### 10.3 Retry-state corruption

`failRun()` clears captured retry state. Objective-mode `playAgain()` with no retry snapshot errors instead of silently starting Campaign.

### 10.4 Time-budget calibration

The 360-second budget is intentionally the current Campaign value. Six generated stages may often earn zero time bonus. That is acceptable for v1; HPA-490 does not add a balance study or misleading under-6:00 objective copy.

## 11. Testing

### 11.1 Pure run tests

Cover:

- parse/format Expedition key inverse semantics;
- same seed => deep-equal run;
- exact easy/easy/medium/medium/hard/hard order;
- unique transform-orbit keys across all six stages;
- current run-key/hash/version identity;
- one objective per stage;
- empty seed rejection;
- no `Math.random()`;
- **500 deterministic complete-run materializations** with all six stages unique and `assertValidIceSlideRunDefinition()` passing.

Do not reject a valid run merely because HPA-489 selected a fallback.

### 11.2 Game/scoring tests

Cover Expedition stars, 360-second config, Daily's unchanged 300-second config, Campaign unchanged behavior, cumulative stars, solved state, and stage signatures.

### 11.3 Lifecycle/submission tests

Cover:

- Web Crypto called once on fresh Expedition;
- Retry Seed consumes no new randomness and preserves run identity/signatures;
- fresh `start('expedition')` consumes new randomness;
- failed Expedition start clears `retryRun`, `dailyDateKey`, and internal mode state;
- objective-mode retry without a snapshot cannot silently start Campaign;
- completed Expedition contextual submission;
- positive-score End contextual partial submission;
- zero-score End does **not** call score submission;
- silent `UNAUTHENTICATED` for Expedition;
- visible non-auth submission errors preserve local result;
- renderer recreation, overlay input gating, reset, cleanup.

### 11.4 Markup/browser tests

Cover:

- third mode radio and durable Expedition/result IDs;
- `?mode=expedition` preselection;
- seed/tier/stars/falls/reset HUD;
- Daily leaderboard hidden for Expedition;
- Retry Seed preserves identity;
- New Expedition button calls fresh `start('expedition')` and changes identity under deterministic Web Crypto stubs;
- zero-score End stays local; positive partial End submits;
- neutral final-star heading;
- Change Mode restores enabled three-mode selector;
- Campaign/Daily regressions remain green.

## 12. Files

Create:

- `src/lib/games/ice-slide/expedition.ts`
- `src/lib/games/ice-slide/expedition.test.ts`

Modify:

- `src/lib/games/ice-slide/run.ts`
- `src/lib/games/ice-slide/run.test.ts`
- `src/lib/games/ice-slide/types.ts`
- `src/lib/games/ice-slide/scoring.ts`
- `src/lib/games/ice-slide/scoring.test.ts`
- `src/lib/games/ice-slide/game.ts`
- `src/lib/games/ice-slide/game.test.ts`
- `src/lib/games/ice-slide/init.ts`
- `src/lib/games/ice-slide/init.test.ts`
- `src/pages/ice-slide/index.astro`
- `src/pages/game-board-markup.test.ts`
- `e2e/games/play-coverage.spec.ts`

Do not modify:

- `src/lib/services/scoreService.ts` / tests;
- generator/templates/quality/solver/physics/renderer internals;
- `scripts/validate-ice-slide-expedition.ts`;
- DB schema/query files;
- `/api/scores.ts`;
- `/api/leaderboard.ts`;
- `daily-leaderboard.ts`.

## 13. YAGNI boundaries

No mode registry, generated-run framework, persistence subsystem, score-service zero opt-in, new DB/API route, seed share/input, history UI, cross-seed ranking, Safe/Risky route choice, Undo, snow, cracked ice, resume, or validation-script rewrite.

## 14. Acceptance mapping

- **Retry Seed exact reproduction:** captured materialized run clone.
- **New Expedition:** fresh Web Crypto seed via `start('expedition')`; no `Math.random()`.
- **2/2/2 run:** fixed sequence plus 500-run assembly sweep.
- **Validated/fallback content:** HPA-489 generator remains the only stage source; valid fallbacks stay allowed.
- **Campaign/Daily unchanged:** explicit regression tests and preserved scoring/query behavior.
- **Completed/partial persistence:** completion plus positive-score End persist contextual game data; zero-progress End stays local to avoid unrelated history/challenge side effects.
- **No leaderboard leakage:** existing context isolation; no ranking changes.
- **Anonymous local play:** silent objective-mode unauthenticated response.
- **Renderer/overlay/reset/retry/fresh/failure coverage:** existing lifecycle seams extended with unit/browser tests.

## 15. Self-review

- **Placeholder scan:** no TBD/TODO.
- **Consistency:** complete run materializes before play; seed remains browser-owned; page never reconstructs it from the hash.
- **Scope:** no HPA-491/HPA-492/HPA-493 work.
- **Reuse:** no DB/API/score-service/generator duplication.
- **Risk:** cross-tier exhaustion is covered by direct 500-run assembly testing and player-safe fresh-seed recovery.
