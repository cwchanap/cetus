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
- `ScoreManager` has two persistence paths: the achievement-enabled branch calls `fetch('/api/scores')` directly, while the non-integration branch calls `saveGameScore()`.
- `scoreService.submitScore()` is already the canonical object-shaped transport call and is the only helper that should continue to own the default relative `/api/scores` request.
- Circuit Hacker, Satellite Sync, and Ice Slide intentionally use handle-style initializers plus `createRunGuard` and manual `saveGameScore()` calls. They are not BaseGame migration debt.
- `game_scores` already has a lazy additive schema upgrader for the optional score-context columns used by Ice Slide Daily/Expedition. The new `platform` column should reuse that established capability/migration seam rather than introduce another migration framework.
- Renderers, `GameInitializer`, and every `init*.ts` file are web-owned boundaries in the later HPA-447 package split. Browser globals remain valid there.

## Product / architecture contract

After HPA-444:

1. Shared-intent game logic does not directly reference `window`, `document`, `import.meta.env`, or a hard-coded API URL.
2. Browser-specific code remains in renderers and initializers; this ticket does not try to make those files React Native compatible.
3. A `ScoreSubmitter` function is the only new score transport dependency. There is no DI container, repository class, API-client package, or service locator.
4. Web keeps the current default transport: `scoreService.submitScore()` performs `fetch('/api/scores')`.
5. Tests and later mobile callers can inject another submitter without replacing global `fetch` or importing browser UI.
6. Every accepted score request is persisted with `platform = 'web' | 'ios' | 'android'`; omitted platform defaults to `web` at the API validation boundary.
7. Platform is metadata only in this task. Existing leaderboards, personal bests, history, achievements, challenges, and stats continue to combine all platforms.

## Non-goals

Do **not** add any of the following in HPA-444:

- Bun workspaces or `apps/*` / `packages/*` moves;
- `@cetus/games`, `@cetus/shared`, or `@cetus/api-client`;
- Expo, React Native, Skia, mobile screens, or mobile auth/session transport;
- a generic dependency-injection framework;
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

Circuit Hacker, Satellite Sync, and Ice Slide stay handle-based. Their initializers accept a small optional dependency bag containing `submitScore?: ScoreSubmitter`, then pass it through the existing `SaveScoreOptions` object together with `isStale` and (for Ice Slide) score context.

Do not create a shared initializer/dependencies framework for three call sites.

### Reuse the existing `game_scores` additive schema machinery

The current score-context upgrader already handles:

- schema capability inspection;
- additive `ALTER TABLE` operations;
- concurrent Vercel instances racing the same column addition;
- cached/single-flight probing;
- safe retry semantics.

Extend that machinery with the `platform` column rather than adding an unrelated migration runner.

The legacy `hasCompleteGameScoresContextColumns()` meaning stays unchanged: it continues to answer only whether `mode`, `competition_key`, `ruleset_version`, and `game_data_json` exist. Platform readiness is checked separately at the write path so leaderboard isolation semantics do not accidentally change.

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
- tests/specs.

The rule is a guardrail for the extraction boundary, not a ban on browser APIs in the web application.

## Browser-global removal

### Timers

Replace the five game-logic timer calls with `globalThis` equivalents:

```ts
globalThis.setInterval(...)
globalThis.setTimeout(...)
```

Touched production logic:

- `src/lib/games/core/GameTimer.ts`
- `src/lib/games/evader/EvaderGame.ts`
- `src/lib/games/reflex/ReflexGame.ts`
- `src/lib/games/memory-matrix/MemoryMatrixGame.ts`
- `src/lib/games/circuit-hacker/game.ts`

No timing cadence, pause/resume behavior, cleanup behavior, or timer ownership changes.

### ESLint boundary

Add one flat-config override for `src/lib/games/**/*.ts` with:

```js
'no-restricted-globals': ['error', 'window', 'document']
```

Exclude the browser-owned files listed above plus tests/specs. Keep the exclusion pattern structural (`init*.ts`, renderer patterns, named core web helpers) rather than enumerating all 23 games.

Do not ban `globalThis`: it is the portable host-global API needed by timers.

## Ice Slide environment dependency

`createIceSlideExpeditionStage()` is deterministic game logic, but its fallback diagnostic currently reads Astro/Vite environment state.

Move the environment read to `ice-slide/init.ts` and thread a plain boolean through the existing pure generation path:

```ts
createIceSlideExpeditionRunDefinition(seed, {
    warnOnGenerationFallback: import.meta.env.DEV,
})
```

The run builder forwards that boolean to each generated stage; the generator emits its existing sanitized warning only when the boolean is true.

Rules:

- default is `false` for direct production/test/script calls;
- generated rows, objectives, signatures, run keys, RNG forks, attempt counts, and fallback selection must be identical regardless of the flag;
- keep the current warning payload and hashed seed; never log the raw seed;
- do not inject a logger or create an environment service.

This keeps the generator portable while leaving environment knowledge in the web initializer.

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

### `ScoreManager`

Add `submitScore?: ScoreSubmitter` to `ScoreManagerConfig` and remove its direct `fetch('/api/scores')` branch.

`ScoreManager` uses the injected/default submitter for the achievement-enabled path and forwards the same submitter through `saveGameScore()` for the non-integration path. The current BaseGame stale-run policy stays intact: a completed score is still submitted, while save-derived reward payload is suppressed if the run becomes stale while the request is in flight.

Use `ScoreSubmissionResult` as the typed transport result rather than reconstructing a second response shape. This also removes the current untyped-JSON seam in the direct-fetch branch.

Do **not** add an API-client class or teach `ScoreManager` about base URLs, cookies, headers, iOS, or Android.

### Handle-style games

Add only a local optional dependency bag to each initializer:

```ts
interface <Game>Dependencies {
    submitScore?: ScoreSubmitter
}
```

Affected initializers:

- `circuit-hacker/init.ts`
- `satellite-sync/init.ts`
- `ice-slide/init.ts`

Each initializer passes `dependencies.submitScore` through `SaveScoreOptions`. All current callback ordering, run guards, score context, retry semantics, overlays, and achievement events stay unchanged.

The default web call sites pass no dependencies and therefore keep using the existing web transport.

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
- `src/lib/server/db/types.ts`;
- `src/lib/server/db/game-score-schema-files.test.ts`.

### Live additive schema upgrade

Extend `src/lib/server/db/game-score-context.ts` rather than creating a second migrator:

- inspect whether `platform` exists;
- add `platform TEXT NOT NULL DEFAULT 'web'` with the same concurrent-migrator tolerance as the existing columns;
- include platform readiness in the cache/refresh decision so a process with complete context columns but an old table still upgrades once;
- keep `hasCompleteGameScoresContextColumns()` scoped to the four contextual columns;
- expose/check platform readiness separately before score insertion.

If platform readiness cannot be confirmed, the write fails through the existing score-write failure path; do not silently insert an untagged row.

### Single write path

Keep `saveGameScoreWithAchievements()` delegating exactly once to `saveGameScore()`.

The API passes the validated platform down that path and `saveGameScore()` adds it to the existing `NewGameScore` object. Do not add a mobile-specific insert function or duplicate the stats/favorite-game side effects.

Existing leaderboard/history/best-score reads require no platform predicate in HPA-444.

## Error and lifecycle behavior

Injection changes **where** the request is performed, not game lifecycle semantics.

Keep these invariants:

- score `<= 0` still short-circuits in `saveGameScore()`;
- `isStale` is checked after transport before browser notifications/callbacks;
- BaseGame still publishes local completion before awaiting persistence;
- Circuit Hacker, Satellite Sync, and Ice Slide still surface score errors through their current page callbacks;
- Ice Slide keeps Daily/Expedition context exactly as today;
- the server continues to return `SCORE_CONTEXT_UNAVAILABLE` only for the existing contextual-schema failure case;
- platform metadata does not affect score acceptance, score value, achievements, challenges, or ranking.

## Test strategy

### Portable logic guard

- Existing timer/game tests remain green after `globalThis` conversion.
- `bun run lint` is the enforcement test for accidental `window`/`document` reintroduction in restricted game logic.
- Final verification also uses a focused source search to confirm the only remaining browser references under `src/lib/games` are in allowed initializer/renderer/web-helper/test files.

### Ice Slide

Update generator/expedition tests so fallback diagnostics are controlled by an explicit boolean rather than `vi.stubEnv`:

- default/false does not warn;
- true warns with the same sanitized payload;
- true vs false yields the same generated stage/run.

Initializer coverage verifies the web boundary supplies `import.meta.env.DEV`; no other game-logic file may read it.

### Score transport

`scoreService.test.ts`:

- injected submitter receives the exact `ScoreData` object;
- default path still reaches the existing fetch transport;
- stale suppression and callback/notification behavior are unchanged.

`core.test.ts`:

- achievement-enabled `ScoreManager` uses an injected submitter and never requires global fetch;
- non-integration `ScoreManager` forwards the same submitter to `saveGameScore()`;
- success/failure/reward payload behavior stays typed and unchanged.

Handle-game initializer tests:

- Circuit Hacker, Satellite Sync, and Ice Slide forward an injected submitter;
- their existing stale-run and Ice Slide context assertions remain green.

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
- lazy migration adds platform to an old `game_scores` table;
- direct score persistence stores the passed platform;
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

- intended shared game logic has no direct `window`, `document`, `import.meta.env`, or hard-coded API URL dependency;
- the lint boundary prevents those browser globals from returning to game logic;
- score persistence can be driven by an injected `ScoreSubmitter` while web defaults behave exactly as before;
- Circuit Hacker, Satellite Sync, and Ice Slide forward that dependency without changing their blessed handle architecture;
- `/api/scores` validates/defaults platform and every persisted score has a platform value;
- no platform-specific product behavior or package/mobile architecture is introduced early;
- targeted tests, full unit tests, typecheck, lint, Ice Slide validation, and Playwright all pass.
