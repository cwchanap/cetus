# HPA-444 Platform-Neutral Game Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`; implement test-first and verify each task before continuing.

**Goal:** Complete Phase 0 of the Cetus mobile/monorepo work by removing browser-only dependencies from shared-intent game logic, injecting the existing score transport, and persisting `web | ios | android` on every score without changing current web gameplay behavior.

**Architecture:** Keep browser ownership in renderers and `init*.ts`. Game logic uses `globalThis` timers and explicit primitive dependencies only. `scoreService.submitScore()` remains the default web transport; `ScoreManager`, `saveGameScore()`, and the three handle-style initializers accept a `ScoreSubmitter` override. The existing `game_scores` additive capability upgrader gains the platform column; the existing single database score-write path remains authoritative.

**Tech stack:** Astro, TypeScript, Vitest, ESLint flat config, Playwright, Kysely, LibSQL/Turso, Zod, Bun.

**Spec:** `docs/superpowers/specs/2026-10-17-hpa-444-platform-neutral-game-logic-design.md`

## Global constraints

- One HPA-444 PR from planning through implementation.
- Do not start HPA-446/HPA-447 workspace or package extraction in this ticket.
- Do not add an API-client class, DI container, service locator, environment service, or second score repository.
- `submitScore(scoreData)` stays the canonical default web transport and keeps the current relative `/api/scores` fetch.
- Extend `SaveScoreOptions`; do not add another positional argument to the public `saveGameScore()` helper.
- Circuit Hacker, Satellite Sync, and Ice Slide stay on their blessed handle + `createRunGuard` architecture.
- Browser globals remain allowed in renderers, `GameInitializer`, and `init*.ts` files.
- `hasCompleteGameScoresContextColumns()` must continue to mean exactly the four Ice Slide context columns; platform readiness is separate.
- No platform filtering, platform leaderboard, platform index, UI label, or stats screen in HPA-444.
- Preserve score values, achievement/challenge behavior, run-guard behavior, Ice Slide generation output, and all current web controls.
- No art/SFX work.

---

## File map

### Browser portability / Ice Slide

Modify:

- `eslint.config.js`
- `src/lib/games/core/GameTimer.ts`
- `src/lib/games/evader/EvaderGame.ts`
- `src/lib/games/reflex/ReflexGame.ts`
- `src/lib/games/memory-matrix/MemoryMatrixGame.ts`
- `src/lib/games/circuit-hacker/game.ts`
- `src/lib/games/ice-slide/generator.ts`
- `src/lib/games/ice-slide/generator.test.ts`
- `src/lib/games/ice-slide/expedition.ts`
- `src/lib/games/ice-slide/expedition.test.ts`
- `src/lib/games/ice-slide/init.ts`
- `src/lib/games/ice-slide/init.test.ts`

### Score transport

Modify:

- `src/lib/services/scoreService.ts`
- `src/lib/services/scoreService.test.ts`
- `src/lib/games/core/ScoreManager.ts`
- `src/lib/games/core/core.test.ts`
- `src/lib/games/circuit-hacker/init.ts`
- relevant Circuit Hacker initializer test file(s)
- `src/lib/games/satellite-sync/init.ts`
- relevant Satellite Sync initializer test file(s)
- `src/lib/games/ice-slide/init.ts`
- `src/lib/games/ice-slide/init.test.ts`

### Platform validation / persistence

Modify:

- `src/lib/server/validations.ts`
- `src/lib/server/validations.test.ts`
- `src/pages/api/scores.ts`
- `src/pages/api/scores.test.ts`
- `src/lib/server/db/types.ts`
- `src/lib/server/db/game-score-context.ts`
- focused `game-score-context*.test.ts` files as required by the current migration seams
- `src/lib/server/db/queries.ts`
- `src/lib/server/db/queries.test.ts` and/or `queries.integration.test.ts` for persisted-row proof
- `src/lib/server/db/game-score-schema-files.test.ts`
- `scripts/init-db.sql`
- `better-auth_migrations/2025-07-06-schema-consolidation.sql`

Do not create a new migration framework or new score-storage module.

---

# Task 1 — Make the shared-intent game logic browser-neutral

**Outcome:** the known browser-global leaks are removed, Ice Slide generation no longer reads Astro/Vite environment state, and ESLint encodes the future shared-game boundary.

## 1.1 Write RED Ice Slide diagnostic tests

Update the existing fallback-warning coverage in `generator.test.ts` so the test controls a plain boolean rather than `vi.stubEnv()`.

Required cases:

- default / omitted flag does not emit the fallback warning;
- explicit false does not emit the warning;
- explicit true emits the current sanitized warning payload;
- the warning still includes `stageNumber`, `difficulty`, `seedHash`, max attempts, rejection counts, and `fallbackId` but never raw seed;
- the generated stage is structurally identical with the flag on or off.

Add/adjust `expedition.test.ts` coverage proving the run builder forwards the option to its six stage generations without changing deterministic run output.

Run RED:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/generator.test.ts \
  src/lib/games/ice-slide/expedition.test.ts
```

## 1.2 Move the DEV dependency to the initializer

In `generator.ts`, extend the existing generation input with one optional primitive:

```ts
warnOnFallback?: boolean
```

Replace:

```ts
if (import.meta.env.DEV) {
```

with the explicit input flag. Keep the warning body unchanged.

In `expedition.ts`, accept a small options object:

```ts
export interface IceSlideExpeditionGenerationOptions {
    warnOnGenerationFallback?: boolean
}

export function createIceSlideExpeditionRunDefinition(
    seed: string,
    options: IceSlideExpeditionGenerationOptions = {}
): IceSlideRunDefinition
```

Forward `options.warnOnGenerationFallback` to every `createIceSlideExpeditionStage()` call.

In `ice-slide/init.ts`, and only there, supply:

```ts
createIceSlideExpeditionRunDefinition(seed, {
    warnOnGenerationFallback: import.meta.env.DEV,
})
```

Direct tests, validation scripts, and Playwright fixture materialization keep using the default false option.

Run GREEN:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/generator.test.ts \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/games/ice-slide/init.test.ts
bun run validate:ice-slide-expedition
```

## 1.3 Replace browser timers with host-global timers

Change only the timer owner expression, not lifecycle logic:

```ts
globalThis.setInterval(...)
globalThis.setTimeout(...)
```

Files:

- `core/GameTimer.ts`
- `evader/EvaderGame.ts`
- `reflex/ReflexGame.ts`
- `memory-matrix/MemoryMatrixGame.ts`
- `circuit-hacker/game.ts`

Do not add timer wrappers or injected clocks in this ticket.

Run the existing focused tests for each touched game plus core. If a touched game has no dedicated test file, the later full suite is the owner; do not create a new test solely to assert spelling of `globalThis`.

## 1.4 Encode the browser boundary in ESLint

Add one flat-config block for `src/lib/games/**/*.ts` with:

```js
'no-restricted-globals': ['error', 'window', 'document']
```

Exclude:

- `**/init*.ts`;
- `**/renderer.ts` and `**/*Renderer.ts`;
- `src/lib/games/renderers/**`;
- `src/lib/games/core/BaseRenderer.ts`;
- `src/lib/games/core/RendererFactory.ts`;
- `src/lib/games/core/GameInitializer.ts`;
- `**/*.test.ts` / `**/*.spec.ts`.

Keep `globalThis` allowed.

Run:

```bash
bun run lint
```

Expected: no restricted-global errors in game logic and no mass false-positive cleanup in web-owned initializers/renderers.

---

# Task 2 — Add one injectable score-transport seam

**Outcome:** tests/mobile-prep can replace score transport without replacing global fetch, while current web calls still use `scoreService.submitScore()`.

## 2.1 Write RED `saveGameScore()` injection tests

In `scoreService.test.ts`, add a fake submitter and cover:

```ts
const injectedSubmitter = vi.fn().mockResolvedValue({ success: true })
```

Required assertions:

- positive score calls the injected submitter once with the exact `ScoreData` object;
- `gameData` and score context still appear exactly as today;
- score `<= 0` still calls neither injected transport nor callbacks;
- stale result still suppresses post-submit callbacks/notifications;
- when no injected submitter is provided, the existing exported `submitScore()` remains the default fetch path.

Run RED:

```bash
bun run test:run -- src/lib/services/scoreService.test.ts
```

## 2.2 Add `ScoreSubmitter` and extend the existing options bag

In `scoreService.ts`:

```ts
export type ScoreSubmitter = (
    scoreData: ScoreData
) => Promise<ScoreSubmissionResult>

export interface SaveScoreOptions {
    isStale?: () => boolean
    context?: ScoreSubmissionContext
    submitScore?: ScoreSubmitter
}
```

Inside `saveGameScore()`:

```ts
const scoreSubmitter = options?.submitScore ?? submitScore
const result = await scoreSubmitter(scoreData)
```

Leave all stale/error/browser-notification logic below that line unchanged.

Run GREEN:

```bash
bun run test:run -- src/lib/services/scoreService.test.ts
```

## 2.3 Write RED `ScoreManager` injection tests

Update the `scoreService` mock in `core.test.ts` so it exports both helpers expected by production code.

Replace direct-global-fetch tests with injected transport tests.

Required cases:

- achievement integration true: injected submitter receives `{ gameId, score, gameData }` and its result is returned;
- failed injected result yields `success: false` without a real fetch;
- non-integration branch forwards the exact injected submitter to `saveGameScore()` through `SaveScoreOptions` alongside `isStale`;
- thrown transport/save failures retain the current `success: false` behavior.

Run RED:

```bash
bun run test:run -- src/lib/games/core/core.test.ts
```

## 2.4 Remove `ScoreManager`'s direct API call

Add to `ScoreManagerConfig`:

```ts
submitScore?: ScoreSubmitter
```

Store the selected submitter once in the manager, defaulting to the existing `scoreService.submitScore`.

For `achievementIntegration: true`, call that submitter with the same score data that the old direct fetch body used. Return the typed `ScoreSubmissionResult` fields consumed by `BaseGame.end()`.

For `achievementIntegration: false`, keep `saveGameScore()` as the browser-notification/callback wrapper, but include the same selected submitter in its options.

Do not put base URL/header/platform branching in `ScoreManager`.

Run GREEN:

```bash
bun run test:run -- src/lib/games/core/core.test.ts
```

## 2.5 Write RED handle-game forwarding tests

For Circuit Hacker, Satellite Sync, and Ice Slide initializer tests, instantiate with an optional dependency object:

```ts
{ submitScore: injectedSubmitter }
```

Drive each existing completion/submission seam and assert that the transport received the expected score data.

Freeze the important game-specific contracts:

- Circuit Hacker keeps difficulty/time/rotation game data and stale guard;
- Satellite Sync keeps current game data and stale guard;
- Ice Slide keeps Campaign/Daily/Expedition game data, Daily/Expedition context, stale guard, and current unauthenticated objective-mode handling.

Do not test through a real network request.

## 2.6 Thread the dependency through the three local initializers

Add a small **local** dependency interface in each initializer:

```ts
interface <Game>Dependencies {
    submitScore?: ScoreSubmitter
}
```

Add an optional final initializer parameter defaulting to `{}` and pass `dependencies.submitScore` into the existing `saveGameScore()` options object.

Do not share these dependency interfaces across games; there is no reusable initializer framework being introduced here.

Run all three initializer test files plus score/core tests.

---

# Task 3 — Validate and persist score platform

**Outcome:** `/api/scores` defaults current web requests to `web`, accepts future `ios`/`android` submissions, and writes the platform on the existing score row.

## 3.1 Write RED Zod contract tests

In `validations.test.ts`, add:

- omitted `platform` -> parsed output contains `platform: 'web'`;
- explicit `web`, `ios`, and `android` -> accepted unchanged;
- unsupported string -> rejected;
- non-string -> rejected.

Then add in `validations.ts`:

```ts
export const scorePlatformSchema = z.enum(['web', 'ios', 'android'])
export type ScorePlatform = z.infer<typeof scorePlatformSchema>
```

and:

```ts
platform: scorePlatformSchema.optional().default('web')
```

Extend client-side `ScoreData` with:

```ts
platform?: ScorePlatform
```

Do not make current web callers explicitly send `web`; server defaulting is the compatibility path.

Run:

```bash
bun run test:run -- \
  src/lib/server/validations.test.ts \
  src/lib/services/scoreService.test.ts
```

## 3.2 Write RED schema-source tests

Extend `game-score-schema-files.test.ts` so both canonical DDL files must create a `platform` column and a fresh insert without an explicit platform reads back as `web`.

Expected DDL:

```sql
platform TEXT NOT NULL DEFAULT 'web'
```

Do not add a CHECK constraint or platform index.

Run RED:

```bash
bun run test:run -- src/lib/server/db/game-score-schema-files.test.ts
```

## 3.3 Extend the existing live schema upgrader

In `game-score-context.ts`:

- inspect `platform` alongside the existing columns;
- add a `platform` capability;
- add the missing-column operation using `TEXT NOT NULL DEFAULT 'web'`;
- reuse `addColumnToleratingConcurrentMigrator()`;
- make cache/refresh logic notice an otherwise-complete old schema that lacks platform;
- keep `hasCompleteGameScoresContextColumns()` checking **only** the four existing context columns;
- expose/use a separate platform-ready check at score-write time.

Add focused migration coverage for an old table without platform:

- first ensure adds it;
- existing rows read back `web`;
- a concurrent second migrator is tolerated by the same established mechanism;
- existing context completeness/fail-closed tests keep their meaning.

Do not rename/rebuild the migration subsystem in this ticket.

## 3.4 Update canonical schema/type declarations

Modify:

- `scripts/init-db.sql`;
- `better-auth_migrations/2025-07-06-schema-consolidation.sql`;
- `GameScoresTable` in `src/lib/server/db/types.ts`.

Use the same non-null `web` default in both SQL sources.

Run GREEN schema/migrator tests.

## 3.5 Write RED database persistence tests

Add a focused query/integration case that saves one score for each platform and selects the stored rows directly.

The write contract should prove:

- `web`, `ios`, and `android` reach the existing `game_scores` insert;
- platform is stored on the same row as user/game/score/context;
- `saveGameScoreWithAchievements()` still delegates exactly once to `saveGameScore()`;
- contextual score behavior and user-stat side effects stay unchanged.

No platform-specific read/query helper is added.

## 3.6 Thread platform through the existing single write path

Extend the internal DB write functions with a typed platform argument, defaulting to `web` for direct internal callers:

```ts
saveGameScore(userId, gameId, score, context?, platform = 'web')
saveGameScoreWithAchievements(
    userId,
    gameId,
    score,
    gameData?,
    context?,
    platform = 'web'
)
```

Before insert, ensure the platform schema capability is known/present. Add `platform` to the existing `NewGameScore` object.

Keep all existing context handling and stats updates in that same function.

Run targeted DB tests.

## 3.7 Write RED API forwarding tests

In `src/pages/api/scores.test.ts`, cover:

- omitted platform -> `saveGameScoreWithAchievements(..., 'web')`;
- explicit `ios` -> forwarded as `ios`;
- explicit `android` -> forwarded as `android`;
- invalid platform -> 400 and persistence is not called.

Preserve existing auth, Ice Slide admission, context, achievement, challenge, and coded-error tests.

## 3.8 Forward the parsed platform in `/api/scores`

Destructure the Zod-defaulted platform from `validation.data` and pass it to `saveGameScoreWithAchievements()` after the existing context argument.

Do not infer from User-Agent or headers.

Run:

```bash
bun run test:run -- \
  src/lib/server/validations.test.ts \
  src/pages/api/scores.test.ts \
  src/lib/server/db/game-score-schema-files.test.ts \
  src/lib/server/db/queries.test.ts \
  src/lib/server/db/queries.integration.test.ts
```

If the repository's integration file selection differs, run the actual focused DB files touched by the implementation rather than creating duplicate coverage.

---

# Task 4 — Portability audit and full regression gate

**Outcome:** the Phase 0 boundary is proven without pulling future mobile/package work into this PR.

## 4.1 Search for forbidden game-logic dependencies

Search `src/lib/games` for:

```text
window
document
import.meta.env
/api/scores
```

Classify every remaining hit.

Allowed hits must be confined to:

- `init*.ts`;
- renderers;
- `GameInitializer` / renderer core helpers;
- tests/spec fixtures where browser behavior is intentionally tested.

If a hit remains in a game class, generator, shared helper, or portable core file, fix it before proceeding. Do not weaken the ESLint exclusions to hide a real logic-layer dependency.

## 4.2 Run targeted regression set

At minimum re-run:

```bash
bun run test:run -- src/lib/services/scoreService.test.ts
bun run test:run -- src/lib/games/core/core.test.ts
bun run test:run -- src/lib/games/ice-slide/generator.test.ts src/lib/games/ice-slide/expedition.test.ts src/lib/games/ice-slide/init.test.ts
bun run test:run -- src/lib/server/validations.test.ts src/pages/api/scores.test.ts
bun run test:run -- src/lib/server/db/game-score-schema-files.test.ts
bun run validate:ice-slide-expedition
```

Also run the touched Circuit Hacker and Satellite Sync initializer/game tests.

## 4.3 Run the full quality gate

```bash
bun run lint
bun run typecheck
bun run test:run
bun run test:e2e
```

Do not mark HPA-444 complete with a skipped Playwright suite: the ticket explicitly requires unchanged browser behavior.

## 4.4 Final diff review

Before moving the PR out of draft implementation state, verify:

- no monorepo/package files were introduced;
- no renderer was made artificially platform-neutral;
- no duplicated score insert or API transport exists;
- no score/achievement/challenge rules changed;
- platform is stored but not yet queried as a product dimension;
- Ice Slide generated content is byte-for-byte/structurally unchanged for the same seed;
- all additions belong to this one HPA-444 PR.

## Completion checklist

- [ ] Five game-logic timer owners use `globalThis`.
- [ ] Ice Slide generator/expedition logic has no `import.meta.env` read.
- [ ] ESLint blocks `window`/`document` in shared-intent game logic and allows browser-owned init/renderers.
- [ ] `ScoreSubmitter` is injectable through `saveGameScore()` and `ScoreManager`.
- [ ] Circuit Hacker, Satellite Sync, and Ice Slide forward an injected submitter without architecture changes.
- [ ] Default web score transport still posts to `/api/scores` through the existing service.
- [ ] Zod defaults omitted platform to `web` and rejects unsupported values.
- [ ] `game_scores.platform` exists in fresh-schema and live additive-upgrade paths.
- [ ] API -> DB write persists `web | ios | android` on the existing score row.
- [ ] No platform-specific queries/UI/indexes were added.
- [ ] Ice Slide validator passes.
- [ ] Lint, typecheck, unit/integration tests, and Playwright pass.
