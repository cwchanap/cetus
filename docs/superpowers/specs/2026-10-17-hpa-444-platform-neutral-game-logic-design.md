# HPA-444 Platform-Neutral Game Logic Design

**Linear:** HPA-444 — Make game logic platform-neutral and score submission injectable

**Status:** Planning contract for one HPA-444 PR.

## Goal

Prepare the current Cetus game layer for the later Expo/monorepo work without starting that migration now.

HPA-444 removes browser-only assumptions from code that is intended to become shared game logic, introduces one score-transport dependency seam, and records the submitting platform on score rows. Existing Astro gameplay, score, achievement, challenge, leaderboard, and Ice Slide behavior must remain unchanged on web.

This is Phase 0 only. It deliberately stops before workspace/package extraction, React Native UI, a shared API client, or mobile authentication.

## Current repository facts

The July ticket still matches the current tree, with a few important details that the implementation must preserve:

- `GameTimer`, `EvaderGame`, `ReflexGame`, `MemoryMatrixGame`, and Circuit Hacker logic still call `window.setInterval` / `window.setTimeout`.
- `ice-slide/generator.ts` still reads `import.meta.env.DEV` to decide whether a deterministic fallback warning is emitted.
- `ScoreManager.saveFinalScore()` currently has two branches, but its only production caller is `BaseGame.end()`, and all BaseGame games enable the direct-fetch branch. Satellite Sync uses a `ScoreManager` only for in-game scoring and submits separately from its initializer.
- `scoreService.submitScore()` is already the canonical object-shaped transport call and is the only helper that should continue to own the default relative `/api/scores` request.
- Circuit Hacker, Satellite Sync, and Ice Slide intentionally use handle-style initializers plus `createRunGuard` and manual `saveGameScore()` calls. They are not BaseGame migration debt.
- `game_scores` already has a lazy additive schema upgrader for the optional score-context columns used by Ice Slide Daily/Expedition. The new `platform` column should reuse that established capability/migration seam rather than introduce another migration framework.
- Renderers, `GameInitializer`, and every `init*.ts` file are web-owned boundaries in the later HPA-447 package split. Browser globals remain valid there. `shared/utils.ts:isEditableTarget()` also uses `HTMLElement`, but only web initializers consume it; track this known future-extraction move rather than disguising it as portable.

## Product / architecture contract

After HPA-444:

1. Shared-intent game logic does not directly reference `window`, `document`, `import.meta.env`, or a hard-coded API URL.
2. Browser-specific code remains in renderers and initializers; this ticket does not try to make those files React Native compatible.
3. A `ScoreSubmitter` function is the only new score transport dependency. `BaseGameConfig.submitScore` makes injection reachable from every BaseGame subclass without per-game rewrites. There is no DI container, repository class, API-client package, or service locator.
4. Web keeps the current default transport: `scoreService.submitScore()` performs `fetch('/api/scores')`.
5. Tests and future mobile game hosts can inject another submitter into portable BaseGame logic without replacing global `fetch` or importing browser UI. Current browser-owned handle initializers remain unchanged; a future mobile initializer will pass its submitter directly to `saveGameScore()`.
6. Every accepted score is attributable to `platform = 'web' | 'ios' | 'android'`; omitted platform defaults to `web` at the API boundary. Web inserts omit the column and rely on `TEXT NOT NULL DEFAULT 'web'` once present (including retroactive labeling of historical rows when upgraded). Explicit iOS/Android writes migrate and store their platform before insertion.
7. Platform is metadata only in this task. Existing leaderboards, personal bests, history, achievements, challenges, and stats continue to combine all platforms.

## Non-goals

Do **not** add any of the following in HPA-444:

- Bun workspaces or `apps/*` / `packages/*` moves;
- `@cetus/games`, `@cetus/shared`, or `@cetus/api-client`;
- Expo, React Native, Skia, mobile screens, or mobile auth/session transport;
- a generic dependency-injection framework;
- optional submitter bags in the three existing web-only handle initializers;
- a second score service or second database insert path;
- platform-specific leaderboard/stat filters or a platform index;
- renderer or initializer rewrites merely to remove browser APIs;
- a generic environment/config service for the one Ice Slide DEV diagnostic;
- changes to scoring rules, achievement thresholds, challenge semantics, or stale-run behavior.

Those belong to the later mobile/monorepo phases.

## Reuse decisions

### Reuse `scoreService.submitScore()` as the default web transport

`submitScore(scoreData)` already owns the fetch request, response parsing, public error-code mapping, and `ScoreSubmissionResult`. Make that function injectable instead of introducing a parallel request abstraction.

Add a named function type beside the existing score-service data contracts:

```ts
export type ScoreSubmitter = (
    scoreData: ScoreData
) => Promise<ScoreSubmissionResult>
```

Extend the existing options bag rather than adding another positional parameter to `saveGameScore()`:

```ts
export interface SaveScoreOptions {
    isStale?: () => boolean
    context?: ScoreSubmissionContext
    submitScore?: ScoreSubmitter
}
```

This preserves the repository's existing decision that `saveGameScore()` should not keep growing positional arguments.

### Reuse the current handle-game boundary

Circuit Hacker, Satellite Sync, and Ice Slide stay handle-based. Their existing **web-owned** initializers continue calling `saveGameScore()` without new dependencies. The `SaveScoreOptions.submitScore` seam is sufficient for a future platform-specific initializer; do not introduce unused web-initializer dependency bags or a shared initializer framework.

### Reuse the existing `game_scores` additive schema machinery

The score-context upgrader already handles schema inspection, additive `ALTER TABLE`, Vercel concurrency, and cached/single-flight probes. Add the platform capability to this machinery, but **do not run it for every web score**.

- The existing four-column `hasCompleteGameScoresContextColumns()` remains unchanged to preserve scoped-leaderboard isolation.
- Ordinary unscoped `web` inserts keep the current direct-to-insert path and omit `platform`. Once the column exists, the SQLite default records `web`; adding the column later retrospectively labels all older rows `web`.
- Explicit `ios`/`android` inserts invoke the migrator and include the platform value; migration/insert failures use the generic `SCORE_WRITE_FAILED` path, never `SCORE_CONTEXT_UNAVAILABLE`.
- Contextual `web` inserts keep the existing context ensure; platform-only migration failures must not disable a context-ready web submission. Cover that case as a regression. Do not create another migration framework or a new outward-facing error code.

This retains HPA-444's platform-persistence requirement while preventing an unrelated platform schema upgrade from gating all existing unscoped web games.

### Reuse browser boundaries instead of eliminating browser APIs everywhere

HPA-447 already defines the future package split. The lint boundary should reflect it:

**Restricted game logic**

- Base game/core logic that is intended for `@cetus/games`;
- shared game algorithms/data;
- each game's game class, types, utils, generators, rules, and authored data.

**Allowed browser-owned code**

- all `init*.ts` files;
- game renderers (`renderer.ts`, `*Renderer.ts`, and `src/lib/games/renderers/**`);
- `BaseRenderer`, `RendererFactory`, and `GameInitializer`;
- `ice-slide/daily-leaderboard.ts` (web-only leaderboard fetch, DOM-row construction and panel controller; do not move/refactor it in Phase 0);
- tests/specs.

The rule is a guardrail for the extraction boundary, not a ban on browser APIs in the web application.

## Browser-global removal

### Timers

Replace the five game-logic timer calls with `globalThis.setInterval` / `globalThis.setTimeout`.

The five receiving fields currently use `number | null`. Because the project's Node types can make host-global timers return `NodeJS.Timeout`, update each field to the matching `ReturnType<typeof setInterval> | null` or `ReturnType<typeof setTimeout> | null` and run `bun run typecheck` immediately after the edits. The affected logic owners are `core/GameTimer.ts`, `evader/EvaderGame.ts`, `reflex/ReflexGame.ts`, `memory-matrix/MemoryMatrixGame.ts`, and `circuit-hacker/game.ts`.

Do not inject clocks or change timing, cleanup, pause/resume, or gameplay cadence.

### ESLint boundary

Add one flat-config override for `src/lib/games/**/*.ts` with:

```js
'no-restricted-globals': ['error', 'window', 'document']
```

Exclude the browser-owned files listed above plus tests/specs. Keep the exclusion pattern structural (`init*.ts`, renderer patterns, named core web helpers) with one explicit `ice-slide/daily-leaderboard.ts` exception rather than enumerating all 23 games. If the final audit discovers another web-only helper with an unexpected filename, classify its ownership before adding a narrow exclusion; do not suppress browser globals in actual game logic.

Do not ban `globalThis`: it is the portable host-global API needed by timers.

## Ice Slide environment dependency

`ice-slide/generator.ts` currently emits a development-only fallback `console.warn` behind `import.meta.env.DEV`. The pure generator already returns `usedFallback` and `rejectionCounts`, and the expedition validator reports fallback diagnostics from those fields. Remove **only** the redundant DEV-gated warning and its environment-dependent test expectations.

Keep fallback selection, rejection counters, generated stages, RNG and hashes unchanged. Do not thread an environment boolean through `generator.ts`, `expedition.ts`, and `init.ts`; do not add an environment service.

## Score transport injection

### Canonical transport type

`scoreService.ts` remains the current home of `ScoreData`, `ScoreSubmissionResult`, `SaveScoreOptions`, `submitScore()`, and the new `ScoreSubmitter` type until HPA-447 moves shared request/response types into packages.

`saveGameScore()` selects transport once:

```ts
const submit = options?.submitScore ?? submitScore
const result = await submit(scoreData)
```

Everything after submission remains unchanged:

- stale-run suppression;
- achievement notification dispatch;
- challenge-complete notification dispatch;
- success/error callbacks;
- public error-code handling.

### `ScoreManager` and `BaseGame`

Add `submitScore?: ScoreSubmitter` to both `BaseGameConfig` and `ScoreManagerConfig`. `BaseGame` forwards `config.submitScore` when constructing the manager, so a subclass can accept `new TetrisGame({ submitScore })` without edits to every game.

`ScoreManager.saveFinalScore()` has one production caller, `BaseGame.end()`. Replace its two branches with one `this.submitScore({ gameId, score, gameData })` call returning typed `ScoreSubmissionResult` (and the existing caught-error `success: false` behavior). Delete the unused `achievementIntegration` flag from both configs and all game config literals/types; let typecheck identify references. Remove the unused `isStale` argument from `saveFinalScore()`: `BaseGame.end()` remains responsible for suppressing stale reward payload **after** persistence, while local end events still fire before the await.

Remove the unused `saveGameScore` import from core `ScoreManager`. Fix its incorrect declared `newAchievements?: string[]` to the API's actual `AchievementNotification[]` through `ScoreSubmissionResult` without modifying runtime payloads. Replace the structural duplicate `ChallengeUpdates` in `core/types.ts` with a type alias to `NonNullable<ScoreSubmissionResult['challengeUpdates']>`; audit `BaseGame.end()` and its listeners with typecheck.

The three handle-game **web** initializers do not change. They retain their `saveGameScore()` and `createRunGuard` behavior. No API-client class, DI framework, mobile initializer, or new per-game constructor is needed.

## Platform request contract

Define the API-facing platform schema beside the other score validation contracts:

```ts
export const scorePlatformSchema = z.enum(['web', 'ios', 'android'])
export type ScorePlatform = z.infer<typeof scorePlatformSchema>
```

Add to `scoreSubmissionSchema`:

```ts
platform: scorePlatformSchema.optional().default('web')
```

`ScoreData` gains optional `platform?: ScorePlatform` so a future mobile submitter can supply its platform while current web callers omit it.

Validation behavior:

- missing -> parsed as `web`;
- `web`, `ios`, `android` -> accepted;
- any other value or non-string -> 400;
- no user-agent inference and no trusted-header machinery.

The request body remains backward-compatible for current web code because platform is optional at transport input and defaulted by the server.

## Platform persistence

### Schema

Add to both canonical `game_scores` DDL sources:

```sql
platform TEXT NOT NULL DEFAULT 'web'
```

Existing rows become `web` when the additive migration runs. There is no CHECK constraint or platform index in this task; Zod owns the public input vocabulary and there are no platform-filtered queries yet.

Update:

- `scripts/init-db.sql`;
- `better-auth_migrations/2025-07-06-schema-consolidation.sql`;
- `src/lib/server/db/types.ts` (`GameScoresTable.platform: ColumnType<string, string | undefined, string>`; only the existing production insert populates it explicitly);
- `src/lib/server/db/game-score-schema-files.test.ts`.

### Live additive schema upgrade

Extend `src/lib/server/db/game-score-context.ts` with inspection and concurrent-safe addition of `platform TEXT NOT NULL DEFAULT 'web'`; preserve the cached/single-flight ensure and existing four-column context-completeness semantics.

Do **not** call the schema ensure unconditionally from `saveGameScore()`. It runs only for contextual scores (as today) and explicit non-`web` platforms. A failed platform upgrade must not turn a context-ready web score into `SCORE_CONTEXT_UNAVAILABLE`, nor affect an unscoped web insert. An explicit mobile-platform insert must fail with `SCORE_WRITE_FAILED` rather than silently mislabeling itself as `web`.

The `game_scores.platform` field is `ColumnType<string, string | undefined, string>`, allowing the existing single insert site to omit it for web (DB default) and set it for mobile. No platform index, CHECK constraint, second DB write function, or platform-ready public code.

### Single write path

Keep `saveGameScoreWithAchievements()` delegating exactly once to `saveGameScore()`. The API passes its validated/defaulted platform through the existing write path.

- `web`: omit `platform` from the insert object; do not start a schema upgrade on an otherwise-unscoped score.
- `ios`/`android`: call the existing additive ensure and insert an explicit `platform` only after it is available; fail with `SCORE_WRITE_FAILED` if upgrade/insertion fails.
- Any score with `context`: preserve the existing context-availability guard, including `SCORE_CONTEXT_UNAVAILABLE` only for incomplete contextual columns.

All existing stats, achievements, challenges, best scores, leaderboards, and score acceptance remain unchanged.

## Error and lifecycle behavior

Injection changes **where** the request is performed, not game lifecycle semantics.

Keep these invariants:

- score `<= 0` still short-circuits in `saveGameScore()`;
- `isStale` is checked after transport before browser notifications/callbacks;
- BaseGame still publishes local completion before awaiting persistence;
- Circuit Hacker, Satellite Sync, and Ice Slide still surface score errors through their current page callbacks;
- Ice Slide keeps Daily/Expedition context exactly as today;
- the server continues to return `SCORE_CONTEXT_UNAVAILABLE` only for incomplete contextual-schema cases; explicit iOS/Android platform upgrade/insert failures use `SCORE_WRITE_FAILED`; unscoped web scores bypass that migration;
- platform metadata does not affect score acceptance, score value, achievements, challenges, or ranking.

## Test strategy

### Portable logic guard

- Existing timer/game tests remain green after `globalThis` conversion.
- `bun run lint` is the enforcement test for accidental `window`/`document` reintroduction in restricted game logic.
- Final verification also uses a focused source search to confirm the only remaining browser references under `src/lib/games` are in allowed initializer/renderer/web-helper/test files.

### Ice Slide

Remove the `import.meta.env.DEV`-gated generator fallback warning, and replace only its environment-dependent test with assertions on the existing `usedFallback` and `rejectionCounts` return fields. Keep all generator/expedition tests and the validator passing with exactly the same deterministic outputs.

### Score transport

`scoreService.test.ts`: injected submitter receives exact payload; default fetch, stale-run suppression, callbacks and notifications stay unchanged.

`core.test.ts`: assert the injected submitter is reachable through a representative `BaseGame` game, called exactly once without a global fetch mock; verify failure result and stale-reward suppression. Assert the single `ScoreManager` path returns the typed `newAchievements` object array. Delete obsolete tests of the removed no-integration branch. Current Circuit Hacker, Satellite Sync and Ice Slide initializer tests remain as regression coverage, without new dependency bags.

### Platform

`validations.test.ts`:

- omitted platform parses to `web`;
- three supported values parse;
- unsupported value fails.

`scores.test.ts`:

- omitted platform forwards `web` to persistence;
- explicit `ios` / `android` is forwarded;
- invalid platform returns 400 before persistence.

DB/schema tests:

- both schema DDL files include `platform` with `web` default;
- lazy migration adds platform to an old `game_scores` table and existing rows read back `web`;
- an unscoped web score inserts successfully on an old table even if platform migration would fail, with no pre-insert platform upgrade;
- existing contextual web scores retain their behavior if only platform migration fails;
- an explicit `ios` / `android` score forces a migration and stores its value (or fails generically), never falling back to `web`;
- existing context/schema tests remain green.

### Final gate

Run at minimum:

```bash
bun run lint
bun run typecheck
bun run test:run
bun run test:e2e
```

Also run the Ice Slide expedition validator because its direct generator calls must remain portable:

```bash
bun run validate:ice-slide-expedition
```

## Success criteria

HPA-444 is complete when:

- intended shared game logic has no direct `window`, `document`, `import.meta.env`, or hard-coded API URL dependency; the known DOM-only `shared/utils.ts:isEditableTarget()` helper is tracked as an HPA-447 extraction caveat;
- the lint boundary prevents those browser globals from returning to game logic;
- score persistence can be driven by an injected `ScoreSubmitter` while web defaults behave exactly as before;
- BaseGame forwards the injected submitter to its ScoreManager; browser-owned Circuit Hacker, Satellite Sync, and Ice Slide initializers remain unchanged;
- `/api/scores` validates/defaults platform; explicit mobile scores persist their value, and web scores are labeled `web` by the column default (including historical rows after migration);
- no platform-specific product behavior or package/mobile architecture is introduced early;
- targeted tests, full unit tests, typecheck, lint, Ice Slide validation, and Playwright all pass.
