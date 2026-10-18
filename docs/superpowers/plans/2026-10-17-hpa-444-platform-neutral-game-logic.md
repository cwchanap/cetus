# HPA-444 Platform-Neutral Game Logic Implementation Plan

> **For agentic workers:** implement test-first, keep changes on this existing HPA-444 PR, and run each task's verification before moving on.

**Goal:** Prepare Cetus game logic for later mobile/monorepo extraction without implementing that extraction. Remove browser-global dependencies, make score submission injectable end-to-end for BaseGame games, and persist platform metadata without gating existing unscoped web score writes on a live migration.

**Spec:** `docs/superpowers/specs/2026-10-17-hpa-444-platform-neutral-game-logic-design.md`

**Stack:** Astro, TypeScript, ESLint flat config, Vitest, Playwright, Kysely, SQLite/LibSQL (Turso), Zod, Bun.

## Locked scope and decisions

- One HPA-444 PR; no workspaces, package moves, Expo, mobile auth, new API client, DI container, or game renderer rewrites.
- `scoreService.submitScore()` remains the default web transport; `SaveScoreOptions.submitScore` is the override. Keep the existing callback and stale-run handling.
- Add `BaseGameConfig.submitScore` and forward it to `ScoreManager`. All BaseGame games gain the seam without per-game constructors or initializer rewrites.
- Use ONE typed `ScoreManager.saveFinalScore()` submission branch. Remove the unused `achievementIntegration` config field and non-integration branch (the only production save caller is `BaseGame.end()`).
- Circuit Hacker, Satellite Sync, and Ice Slide keep their web-owned handle + `createRunGuard` initializers unchanged. Do **not** add unused dependency bags to their web initializers; future mobile initializers can call `saveGameScore()` with its injection option.
- Remove the redundant Ice Slide DEV-gated fallback warning, retaining the existing returned fallback diagnostics and validator; do not thread a new environment flag.
- Keep `platform` in HPA-444 because persistence is part of this ticket. It is metadata only: no indexes, CHECK constraints, filters, UI, or new score insert path. Do not require a platform schema upgrade before ordinary unscoped `web` writes.
- Preserve the four-column meaning of `hasCompleteGameScoresContextColumns()`, existing public error codes, achievement/challenge behavior, run guards, and deterministic generation.

## File map

**Portability:** `eslint.config.js`, `src/lib/games/core/GameTimer.ts`, `evader/EvaderGame.ts`, `reflex/ReflexGame.ts`, `memory-matrix/MemoryMatrixGame.ts`, `circuit-hacker/game.ts` (each under `src/lib/games/`); `src/lib/games/ice-slide/generator.ts` and `generator.test.ts`.

**Score seam:** `src/lib/services/scoreService.ts` and test; `src/lib/games/core/types.ts`, `BaseGame.ts`, `ScoreManager.ts`, and `core.test.ts`; existing `achievementIntegration` config literals/types/tests found by code search. Do not touch the three handle-based `init.ts` files for injection.

**Platform:** `src/lib/server/validations.ts` and test; `src/pages/api/scores.ts` and test; `src/lib/server/db/types.ts`, `game-score-context.ts` and focused tests, `queries.ts` and focused tests, `game-score-schema-files.test.ts`; `scripts/init-db.sql` and `better-auth_migrations/2025-07-06-schema-consolidation.sql`.

---

# Task 1 — Portable game logic and a truthful lint boundary

## 1.1 Freeze current behavior with targeted tests

Review the timer tests (`core.test.ts`, affected game tests) and the expedition generator fallback tests. The generator already returns `usedFallback` and `rejectionCounts`; capture these rather than expecting a development console warning. Preserve structural equality for repeated generation inputs.

Do not modify fallback selection or seed handling to satisfy a test.

## 1.2 Convert five timer owners and field types

In the five logic files listed in the file map, replace only `window.setInterval` / `window.setTimeout` with `globalThis.setInterval` / `globalThis.setTimeout`.

**Critical type correction:** the receiving fields currently use `number | null`. Update each to the matching host-global type:

```ts
private intervalId: ReturnType<typeof setInterval> | null = null
private timeoutId: ReturnType<typeof setTimeout> | null = null
```

Use the correct property names in each owner (`GameTimer.intervalId`, `EvaderGame.spawnTimerId`, `ReflexGame.spawnTimerId`, `MemoryMatrixGame.matchTimeoutId`, `CircuitHackerGame.timer`). No injected clock or new timer abstraction.

Immediately run:

```bash
bun run typecheck
bun run test:run -- src/lib/games/core/core.test.ts
```

Also run focused tests for the four affected game classes. Typecheck is not deferred to the final gate.

## 1.3 Remove the unused Ice Slide DEV diagnostic

Delete only the `import.meta.env.DEV` conditional `console.warn` in `ice-slide/generator.ts`. If the only remaining use of a diagnostic-only import disappears, remove that import (retain `hashString32Hex` if used for canonical keys elsewhere).

Replace the `vi.stubEnv('DEV', ...)` test assertions with explicit `usedFallback` / `rejectionCounts` assertions. If any unrelated fallback tests spy on `console.warn`, remove just the obsolete spy assertion; keep solver/fallback validity checks.

Do not change `expedition.ts` or `init.ts` APIs. No `warnOnFallback` / `warnOnGenerationFallback` option.

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/generator.test.ts src/lib/games/ice-slide/expedition.test.ts
bun run validate:ice-slide-expedition
bun run typecheck
```

## 1.4 Add the restricted-global lint guard

Add one ESLint flat-config override for game logic under `src/lib/games/**/*.ts`:

```js
'no-restricted-globals': ['error', 'window', 'document']
```

Exclude web boundaries: `**/init*.ts`, `**/renderer.ts`, `**/*Renderer.ts`, `src/lib/games/renderers/**`, `core/BaseRenderer.ts`, `core/RendererFactory.ts`, `core/GameInitializer.ts`, tests/specs, and the explicitly browser-owned `ice-slide/daily-leaderboard.ts` DOM/controller helper.

Keep `globalThis` allowed. Classify any unexpected additional hit by actual ownership before narrowing the exclusion.

Run `bun run lint` and `bun run typecheck`.

---

# Task 2 — One score submission path reachable through BaseGame

## 2.1 RED: inject `saveGameScore()` transport

In `src/lib/services/scoreService.test.ts`, test a `vi.fn()` submitter passed through the existing `SaveScoreOptions` bag. Cover exact score data including context and gameData, zero/negative score short-circuit, stale-run callback/notification suppression, error behavior, and unchanged default transport.

Run RED:

```bash
bun run test:run -- src/lib/services/scoreService.test.ts
```

## 2.2 GREEN: implement the existing options-bag seam

In `scoreService.ts`:

```ts
export type ScoreSubmitter = (data: ScoreData) => Promise<ScoreSubmissionResult>

export interface SaveScoreOptions {
    isStale?: () => boolean
    context?: ScoreSubmissionContext
    submitScore?: ScoreSubmitter
}
```

In `saveGameScore()`, select `options?.submitScore ?? submitScore` and call it instead of calling the exported default directly. No new positional arguments or new notification service.

Run the score-service tests and `bun run typecheck`.

## 2.3 RED: assert injection from a real BaseGame

In `src/lib/games/core/core.test.ts`, test constructing a representative BaseGame game (or the existing concrete test subclass) with `submitScore: injectedSubmitter` and reaching `BaseGame.end()`. Verify: exactly one request, same frozen end score/data, no required global fetch, local completion before await, and suppression of save-derived rewards when a run becomes stale.

Also cover `ScoreManager`'s typed success/failure behavior and `newAchievements: AchievementNotification[]`. Do **not** write tests for the unreachable non-integration branch.

## 2.4 GREEN: propagate the injected submitter and delete the dead branch

- `BaseGameConfig` (`core/types.ts`): add `submitScore?: ScoreSubmitter`.
- `BaseGame`: pass `config.submitScore` to `new ScoreManager(...)`.
- `ScoreManagerConfig`: add `submitScore?: ScoreSubmitter`; select provided/default `scoreService.submitScore()`.
- `ScoreManager.saveFinalScore()`: replace direct `fetch('/api/scores')` and the unused `saveGameScore()` alternative with ONE request returning typed `ScoreSubmissionResult`. Retain catch -> `{ success: false }`. Remove the unused `isStale` parameter; `BaseGame.end()` owns post-request reward suppression.
- Delete `achievementIntegration` from `BaseGameConfig`, `ScoreManagerConfig`, all concrete config types, defaults, and test literals identified by `rg 'achievementIntegration' src/lib/games`. This is deleted branching, not a new behavior toggle. Satellite Sync only uses its ScoreManager for tracking score and submits independently.
- Replace `core/types.ts`'s duplicate challenge-update structural interface with `type ChallengeUpdates = NonNullable<ScoreSubmissionResult['challengeUpdates']>` (or use the transport type directly where better).
- Correct the old `newAchievements?: string[]` declaration to the API's `AchievementNotification[]` type. Follow TypeScript errors in `BaseGame.end()`'s structured `end` event and existing listeners without converting runtime achievement objects into IDs.

Do not modify handle initializer APIs, per-game constructors, or score rules.

Run:

```bash
bun run test:run -- src/lib/services/scoreService.test.ts src/lib/games/core/core.test.ts
bun run typecheck
bun run lint
```

## 2.5 Existing handle-game regression

Run current `circuit-hacker/init.test.ts`, `satellite-sync/init.test.ts` and `ice-slide/init.test.ts`. Their browser-owned initializers continue to mock/use `scoreService` exactly as today; there are no new dependency bags. Keep existing stale-run, retry and Ice Slide context behavior.

---

# Task 3 — Platform metadata without a web-wide migration dependency

## 3.1 RED/GREEN: Zod validation + client type

Extend `scoreSubmissionSchema` with `platform: z.enum(['web', 'ios', 'android']).optional().default('web')`; export a `ScorePlatform` type. Add `platform?: ScorePlatform` to transport `ScoreData`.

Tests in `validations.test.ts`: omitted -> `web`; explicit three allowed values; unsupported/non-string -> 400. In `scores.test.ts` assert parsed/defaulted platform is forwarded and invalid values do not reach persistence.

Keep current web callers free to omit `platform` and avoid UA/header inference.

## 3.2 RED/GREEN: schema sources and typed row

Add `platform TEXT NOT NULL DEFAULT 'web'` to both canonical `game_scores` DDL sources. Extend `game-score-schema-files.test.ts` to assert a fresh omitted-platform row reads `web`.

Type `GameScoresTable.platform: ColumnType<string, string | undefined, string>` in `db/types.ts`. Keep no CHECK/index. The existing `NewGameScore` construction remains the single insert site.

Run the focused schema tests and `bun run typecheck`.

## 3.3 RED/GREEN: additive schema upgrade, preserving context isolation

Extend the existing `game-score-context.ts` capability inspection and concurrency-tolerant add-column machinery to support `platform`. Keep `hasCompleteGameScoresContextColumns()` **four-column-only**. No new migrator or outward-facing error type.

Tests must prove:

- The lazy upgrade adds `platform` to an old table, with historical rows reading `web`.
- Races between Vercel instances tolerate duplicate column creation.
- Complete contextual columns remain usable for **web** writes even if adding the unrelated platform column fails; do not turn that case into `SCORE_CONTEXT_UNAVAILABLE`.
- A non-web score's platform insertion never silently falls back to `web`.
- Cached fast paths do not falsely treat missing platform as migrated for a non-web request.

An optional existing-ensure parameter or a small scoped internal guard is acceptable **only if** necessary to preserve these cases. Do not create an independent schema-migration subsystem or a second platform-error contract. Keep changes in the established migrator and its existing tests.

Run the focused migrator/concurrent-migrator tests and `bun run typecheck`.

## 3.4 RED/GREEN: existing single insert path

Extend internal `saveGameScore(userId, gameId, score, context?, platform = 'web')` and `saveGameScoreWithAchievements(..., context?, platform = 'web')`; forward the parsed platform from `src/pages/api/scores.ts`.

**Critical dispatch (do not change unscoped web writes):**

```ts
if (context || platform !== 'web') {
    const state = await ensureGameScoresContextSchema()
    // Existing context-completeness guard applies only when context is present.
}
const newScore: NewGameScore = { user_id: userId, game_id: gameId, score }
if (platform !== 'web') {
    newScore.platform = platform
}
// Existing context columns are still included only for contextual scores.
```

The migrator must support explicit non-web writes (including tables that already have four context columns but not platform). If migration/insertion fails for iOS/Android, return existing generic `SCORE_WRITE_FAILED`. Ordinary unscoped web inserts omit the column and never await schema ensure; the DDL default labels web after migration and existing historical rows receive the same default.

Add DB integration tests for all three platforms, an old-schema web insert with a failing platform migration, contextual-web preservation, and failed non-web migration. Verify stats and achievement delegation are unchanged.

Run:

```bash
bun run test:run -- src/lib/server/db/queries.test.ts src/lib/server/db/queries.integration.test.ts
bun run test:run -- src/lib/server/validations.test.ts src/pages/api/scores.test.ts
bun run typecheck
```

Adapt command paths to existing focused files; do not create duplicate tests.

## 3.5 Platform risk / rollback boundary

**Risk:** live `ALTER TABLE` on Turso is not proved solely by in-memory SQLite tests. It can fail under concurrent deployments or transient DB errors.

**Mitigation:** current unscoped web games remain independent of the migration; explicit non-web writes fail loudly instead of being mislabeled; contextual-web error contracts and isolation remain unchanged. Keep the additive change idempotent. Do not introduce a separate migration service or broad retry mechanism. A real Turso staging/prod smoke check, if available during implementation, should verify an existing table migrates before declaring platform support complete. Do not claim it passed without actually running it.

---

# Task 4 — Audit and verification

## 4.1 Browser-boundary audit

Search under `src/lib/games` for `window`, `document`, `import.meta.env`, `/api/scores`, plus DOM-type dependencies such as `HTMLElement`, `HTMLButtonElement` and `instanceof`.

Classify the known `src/lib/games/shared/utils.ts:isEditableTarget()` as a **web-only** keyboard helper called from `initFramework.ts`; it will need extraction in HPA-447's no-DOM package but does not justify moving it in HPA-444. Do not claim all of `shared/utils.ts` is platform-neutral or expand the lint rule to ban DOM types prematurely.

Allowed browser references stay in renderers, `init*.ts`, `ice-slide/daily-leaderboard.ts`, known DOM-only helper(s), and tests. Any other actual game-logic dependency must be eliminated.

## 4.2 Targeted and full regression

Re-run touched timer and core score tests, existing handle initializer tests, generator/expedition tests, schema/API/DB tests, and the expedition validator. Then:

```bash
bun run lint
bun run typecheck
bun run test:run
bun run test:e2e
bun run validate:ice-slide-expedition
```

Review the final PR diff for: no workspace/mobile/UI work, no redundant handle dependency bags, one score submission path, unchanged stale-run behavior, platform metadata with **no new web-wide write precondition**, and unchanged game rules. Do not mark the task complete with Playwright skipped.

## Completion checklist

- [ ] Five timer owners use `globalThis` with `ReturnType` timer fields; per-task typecheck passes.
- [ ] Ice Slide generator has no `import.meta.env` or redundant DEV warning; deterministic output/validator unchanged.
- [ ] ESLint bans browser globals in portable logic while allowing named web boundaries.
- [ ] Injected `ScoreSubmitter` travels `BaseGameConfig -> BaseGame -> ScoreManager` and `SaveScoreOptions` independently.
- [ ] ScoreManager has one typed submit path, no dead `achievementIntegration` config, correct achievement/challenge types and stale reward handling.
- [ ] Handle-style browser initializers are unchanged; their tests pass.
- [ ] API validates/defaults `web | ios | android`; persisted mobile scores preserve identity and web rows use the DB default.
- [ ] Existing unscoped web score inserts never depend on platform migration; scoped context error behavior is preserved.
- [ ] Known DOM-only `isEditableTarget()` is recorded as an extraction caveat, not mistakenly called portable.
- [ ] Full lint/typecheck/test/e2e/expedition-validation gate passes.
