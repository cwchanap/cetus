# Ice Slide Daily Leaderboard — Design

- **Date:** 2026-08-13
- **Linear:** HPA-488 — Add the per-day Ice Slide leaderboard and best-per-player ranking
- **Repository:** `cwchanap/cetus`
- **Dependencies:** HPA-484 complete; HPA-487 merged in PR #61 on 2026-08-13
- **Status:** Implementation design

## 1. Summary

HPA-488 completes the competitive half of Ice Slide Daily without creating another leaderboard subsystem.

HPA-484 already provides persisted score context plus a scoped best-per-user query. HPA-487 now submits completed Daily runs with `mode='daily'`, the captured run key as `competitionKey`, ruleset version, and full Ice Slide game data. The remaining work is therefore narrow:

1. reject malformed or mismatched Ice Slide Daily score submissions before persistence;
2. require an exact Daily competition key for Ice Slide Daily leaderboard reads;
3. reuse the existing scoped query while constraining it to the ruleset encoded by that key;
4. add current-viewer metadata without exposing user IDs;
5. render a page-local Daily leaderboard panel and refresh it only after a successful completed submission.

No new database table, endpoint family, shared leaderboard framework, persistence service, or generic game-mode registry is needed.

## 2. Goals

- Rank only completed, internally consistent Ice Slide Daily submissions.
- Keep each UTC date/generator/ruleset combination isolated by exact competition key.
- Keep one best displayed result per player while retaining all attempts in history.
- Preserve the existing ranking order: score descending, elapsed seconds ascending, total moves ascending, submission time ascending.
- Show rank, player, score, elapsed time, and total moves on the Ice Slide page.
- Highlight the authenticated viewer's row when it is present in the returned top results.
- Show clear loading, empty, signed-out, and unavailable states.
- Refresh the active Daily ranking after a successful Daily score save.
- Keep Campaign leaderboard behavior and `/api/leaderboard?gameId=ice_slide` unchanged.
- Keep local Daily play/completion usable when score saving or leaderboard loading fails.

## 3. Non-goals

- Historical Daily calendar/navigation.
- A second Ice Slide-specific leaderboard endpoint.
- A materialized best-score table or cache.
- A current-user rank query when the user is outside the returned top-N rows.
- One-attempt-only Daily restrictions.
- Server replay verification, score recomputation, or broader anti-cheat.
- Cross-seed Expedition ranking.
- A shared client leaderboard component for other games.
- Changes to the global leaderboard page.

## 4. Approaches considered

### A. Reuse the scoped query and specialize the existing score/leaderboard routes — selected

Keep `/api/scores` and `/api/leaderboard` as the only network seams. Add Ice Slide Daily semantic checks to score admission, exact-key enforcement to the scoped leaderboard branch, and a small page-local renderer.

**Why selected:** it reuses every expensive piece already delivered by HPA-484, touches the fewest abstractions, and leaves generic scoped ranking available for future modes.

### B. Add `/api/ice-slide/daily-leaderboard`

This would make the Daily contract obvious but duplicate request validation, ranking DTO assembly, unavailable handling, and tests already present in `/api/leaderboard`.

**Rejected:** more surface area with no product capability gain.

### C. Fetch generic scoped rows and filter/validate them only in the browser

This would avoid server changes but would allow malformed Daily submissions into persisted/ranked data and would keep the mode-only cross-date query footgun.

**Rejected:** the ticket explicitly owns server admission and competitive isolation.

## 5. Competition identity contract

The existing Daily run key is also the competition key:

```text
ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>
```

`run.ts` remains the owner of that syntax. Export a small parser:

```ts
export interface IceSlideDailyRunIdentity {
    dateKey: string
    generatorVersion: number
    rulesetVersion: number
}

export function parseIceSlideDailyRunKey(
    runKey: string
): IceSlideDailyRunIdentity | null
```

The parser must reject malformed keys and calendar-invalid dates. `assertValidIceSlideRunDefinition()` should reuse it rather than maintaining a second interpretation of the same format.

`daily.ts` also exports:

```ts
export function createIceSlideDailyCompetitionKey(dateKey: string): string
```

`createIceSlideDailyRunDefinition()` uses this helper for `run.runKey`. The browser uses the same helper to ask for the currently selectable Daily leaderboard before a run starts. This prevents duplicated string construction while preserving the captured run key for a Daily started before UTC rollover.

Changing this helper does not change generator-v1 output; it only centralizes the already-frozen string format.

## 6. Score admission

Keep the generic Zod transport schema unchanged. Ice Slide Daily semantics belong after generic validation and game-ID resolution in `src/pages/api/scores.ts`.

A score is treated as an Ice Slide Daily claim when `gameId === ice_slide` and either the submitted context or game data claims `mode='daily'`. Such a claim is accepted only when all of these are true:

- context exists and `context.mode === 'daily'`;
- `context.competitionKey` exists and parses as a valid Ice Slide Daily run key;
- `gameData` exists;
- `gameData.mode === 'daily'`;
- `gameData.solved === true`;
- `gameData.runKey === context.competitionKey`;
- `gameData.generatorVersion` equals the generator version encoded in the competition key;
- `gameData.rulesetVersion === context.rulesetVersion`;
- `context.rulesetVersion` equals the ruleset version encoded in the competition key;
- `gameData.elapsedSeconds` is a non-negative integer;
- `gameData.totalMoves` is a non-negative integer.

Invalid Daily claims return the existing HTTP 400 bad-request shape and are not persisted. No new public error-code family is required; the existing score client already maps a 400 response to invalid score data.

This deliberately does **not** recompute scores, regenerate stages, or verify move history. That remains outside HPA-488.

Campaign behavior is unchanged because Campaign still submits without competitive context. Future Expedition context is also unaffected unless it incorrectly claims Daily identity.

## 7. Scoped ranking and API contract

### 7.1 Query reuse

`getScopedGameLeaderboard()` remains the only best-per-user ranking implementation. Add one optional field to its query contract:

```ts
rulesetVersion?: number
```

When supplied, the SQL filters `game_scores.ruleset_version` to that exact version; when omitted, existing generic behavior remains unchanged.

The existing window-function order is retained:

1. score descending;
2. elapsed seconds ascending, valid values before missing values;
3. total moves ascending, valid values before missing values;
4. `created_at` ascending;
5. row ID ascending only as an internal deterministic fallback when all documented fields tie exactly.

HPA-484 already has deterministic database coverage for the four documented tie-break levels. HPA-488 adds only the exact-ruleset isolation regression rather than rewriting that ranking test suite.

### 7.2 Ice Slide Daily read admission

`GET /api/leaderboard` keeps all existing forms, except the Ice Slide Daily combination becomes stricter:

```text
/api/leaderboard?gameId=ice_slide&mode=daily&competitionKey=<exact-key>&limit=10
```

For `gameId=ice_slide&mode=daily`:

- `competitionKey` is required;
- it must parse as a valid Ice Slide Daily key;
- the parsed ruleset version is passed to `getScopedGameLeaderboard()`.

This prevents the existing generic mode-only query from combining multiple Ice Slide Daily dates or versions. Other games/modes retain HPA-484's generic mode-only behavior.

### 7.3 Viewer metadata

The scoped API branch performs an optional session lookup after the ranking query. Public leaderboard access remains public.

The public row keeps its existing fields and gains:

```ts
isCurrentUser: boolean
```

The scoped response gains:

```ts
viewerAuthenticated: boolean
```

`isCurrentUser` is computed by comparing the private DB `userId` with the session user ID before calling/combining the public DTO. The raw user ID remains absent from the response.

An auth lookup failure degrades to an unauthenticated viewer rather than failing an otherwise available public leaderboard.

The unscoped Campaign response shape is untouched.

## 8. Ice Slide page UX

Add one `Card` below the existing Daily metadata in `src/pages/ice-slide/index.astro`. Astro owns all durable structure and state containers; client TypeScript only toggles visibility/text and creates row children, matching the repository DOM ownership rule.

The panel contains:

- heading and active competition date;
- signed-out note: the player may view rankings but must sign in to submit;
- loading state;
- empty state;
- unavailable state;
- ranked row list.

Each ranked row shows:

```text
#rank  Player [YOU]
score  elapsed  moves
```

The viewer row receives both a visible `YOU` label and a visual border/background treatment, so identity is not communicated by color alone.

No avatar/profile-link system is pulled into this game-local panel; the ticket only requires player identity plus ranking metrics.

### 8.1 Loading lifecycle

Before a run starts, selecting Daily loads the key produced from the current UTC date.

When a Daily starts, the page reloads using the run's captured `runKey`. This matters around UTC rollover: a run started at 23:59:59 remains attached to the old competition even if it finishes after midnight.

`initializeIceSlide()` gains one optional UI-only callback:

```ts
onScoreSaved?: (gameData: IceSlideGameData) => void
```

It fires only after `saveGameScore()` reports success and the run guard says the response is still current. The page refreshes the leaderboard using `gameData.runKey` only when `gameData.mode === 'daily'`.

Anonymous completion does not fire this callback because the score was not persisted; the local result remains intact and the signed-out leaderboard note stays visible.

### 8.2 Stale requests

The page owns one monotonically increasing leaderboard request token. Every load captures the token and competition key; responses render only when both are still current.

Switching to Campaign or starting a newer Daily invalidates older requests. No `AbortController`, global store, event bus, or shared run guard is added for this one page-local fetch.

A 503/error switches only the leaderboard panel to unavailable. It never calls the game `failRun` path and never hides the local completion overlay.

## 9. File boundaries

Expected implementation files:

```text
src/lib/games/ice-slide/run.ts
src/lib/games/ice-slide/run.test.ts
src/lib/games/ice-slide/daily.ts
src/lib/games/ice-slide/daily.test.ts
src/pages/api/scores.ts
src/pages/api/scores.test.ts
src/lib/server/db/scoped-leaderboard.ts
src/lib/server/db/scoped-leaderboard.integration.test.ts
src/pages/api/leaderboard.ts
src/pages/api/leaderboard.test.ts
src/lib/games/ice-slide/init.ts
src/lib/games/ice-slide/init.test.ts
src/pages/ice-slide/index.astro
src/pages/game-board-markup.test.ts
e2e/games/play-coverage.spec.ts
```

No production file is created for HPA-488.

## 10. Test strategy

### Pure/unit

- valid and invalid Daily competition-key parsing;
- key construction preserves generator-v1/run-key output;
- score admission accepts the exact HPA-487 payload;
- score admission rejects omitted context, unsolved data, mode mismatch, run-key mismatch, generator mismatch, ruleset mismatch, missing metrics, and Expedition masquerading as Daily;
- `onScoreSaved` fires once after a current successful save and never on stale/error/unauthenticated paths.

### Database/API

- exact `rulesetVersion` filtering excludes a mismatched persisted row;
- existing score/elapsed/moves/time ranking tests continue to pass;
- Ice Slide Daily leaderboard requests require and validate `competitionKey`;
- current-viewer rows gain `isCurrentUser=true` without exposing `userId`;
- signed-out scoped responses return `viewerAuthenticated=false`;
- Campaign/unscoped API tests keep their current response shape.

### Browser

Use the existing Ice Slide Playwright section. Add deterministic route-backed assertions for:

- Daily selection loads the exact active key and renders empty/signed-out states;
- ranked rows render all required metrics and the `YOU` marker;
- a leaderboard 503 shows unavailable while Start/Daily play remains usable;
- a successful current-run save triggers a second fetch for the same captured key;
- a delayed stale leaderboard response cannot reappear after switching to Campaign/newer identity.

Existing HPA-487 rollover/Play Again tests remain the source of truth for captured Daily identity.

## 11. Acceptance mapping

- **Different dates/generator/ruleset versions do not mix:** exact key required; key parser validates generator/ruleset identity; query also filters exact ruleset.
- **One row per user / better retries:** reused HPA-484 partitioned query.
- **Tie-break order:** reused HPA-484 SQL and deterministic DB tests.
- **Incomplete/mismatched/malformed/Expedition submissions cannot rank:** rejected before persistence by Ice Slide Daily admission.
- **Campaign compatibility:** Campaign writes and unscoped read branch remain unchanged.
- **Local play survives failures:** leaderboard errors are page-local; score errors retain HPA-487 behavior.
- **Authenticated/anonymous/empty/failure/success coverage:** split across API, init/page, and Playwright tests as described above.

## 12. Self-review

- No placeholder requirement remains.
- The design adds no new database schema or endpoint.
- The generic scoped query stays generic; Ice Slide-specific semantics stay at the API/game boundary.
- The UI adds no reusable component before a second consumer exists.
- Historical navigation, anti-cheat, Expedition ranking, and current-user rank-beyond-top-N remain explicitly out of scope.
