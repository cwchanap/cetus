# Ice Slide Daily Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit only valid completed Ice Slide Daily scores, rank one best result per player for the exact Daily competition, and show/refetch that ranking on the Ice Slide page without changing Campaign behavior.

**Architecture:** Reuse HPA-484's existing score-context persistence and `getScopedGameLeaderboard()` window query unchanged. `run.ts` owns the Daily key grammar in both directions plus pure Daily admission semantics; `/api/scores` and `/api/leaderboard` remain the only network seams. Viewer identity comes from middleware-populated `locals.user`. A small Ice-Slide-specific `daily-leaderboard.ts` module owns fetch/render/request-token behavior so the Astro page stays wiring-only and the risky async UI logic is unit-testable.

**Tech Stack:** Astro 5, TypeScript, Tailwind CSS 4, Better Auth middleware locals, Kysely + LibSQL/Turso, Vitest/jsdom, Playwright, Bun 1.3.1.

## Global Constraints

- Keep `/api/leaderboard?gameId=ice_slide` on the existing unscoped Campaign response path.
- Daily competition keys remain `ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>` and use UTC dates.
- Daily ranking order remains score DESC, elapsed seconds ASC, total moves ASC, submission time ASC; row ID stays only the existing final deterministic fallback for exact ties.
- Repeated attempts remain stored; only the existing best-per-user query chooses the displayed row.
- Do not modify `ScopedLeaderboardQuery`, `getScopedGameLeaderboard()`, or its real-LibSQL tie-break suite.
- Do not add database schema, a new endpoint, a best-score cache/table, a generic mode registry, a shared leaderboard component/framework, or another auth request.
- Do not add replay verification, score recomputation, historical Daily navigation, Expedition ranking, read-repair, or current-user rank lookup beyond returned rows.
- Astro owns durable HTML; client TypeScript may update/toggle existing structure and create leaderboard row children without `innerHTML`.
- Leaderboard failures must never enter the Ice Slide `failRun` path or invalidate a local result.
- Preserve HPA-487's captured Daily run identity across UTC rollover and Play Again.
- Leave the existing private `init.ts::formatTime()` behavior unchanged; the new leaderboard alone reuses shared `formatTime()`.
- Keep one frozen `2026-08-12` direction fixture in `test-fixtures.ts`; unit and E2E consumers import the same constant.
- Keep existing remote Codecov project/patch coverage requirements at 95%.

---

## File map

- `src/lib/games/ice-slide/run.ts` — parse/format the frozen Daily key and expose pure Daily admission reasons.
- `src/lib/games/ice-slide/run.test.ts` — identity round-trip and exact admission-reason tests.
- `src/lib/games/ice-slide/daily.ts` — current-version Daily competition-key convenience constructor.
- `src/lib/games/ice-slide/daily.test.ts` — frozen generator output plus shared playthrough replay.
- `src/lib/games/ice-slide/test-fixtures.ts` — single frozen `2026-08-12` direction fixture.
- `src/lib/games/ice-slide/init.ts` — consume the one Daily parser and report current successful score saves.
- `src/lib/games/ice-slide/init.test.ts` — callback staleness/error coverage; no time-format behavior change.
- `src/pages/api/scores.ts` — one Ice Slide dispatch to the pure admission helper.
- `src/pages/api/scores.test.ts` — HTTP 400/no-persist boundary coverage.
- `src/lib/server/validations.ts` — require `competitionKey` for `ice_slide + daily` alongside existing query-parameter relationship rules.
- `src/lib/server/validations.test.ts` — presence rule and generic-mode compatibility.
- `src/pages/api/leaderboard.ts` — semantic Daily-key validation plus viewer matching from `locals.user`.
- `src/pages/api/leaderboard.test.ts` — exact-key/read DTO/viewer tests using `locals`, with no auth mock.
- `src/lib/games/ice-slide/daily-leaderboard.ts` — page-local URL/state/row/fetch/request-token logic.
- `src/lib/games/ice-slide/daily-leaderboard.test.ts` — jsdom async/render/stale-request tests.
- `src/pages/ice-slide/index.astro` — static Daily ranking card and event wiring only.
- `src/pages/game-board-markup.test.ts` — durable leaderboard element IDs only.
- `e2e/games/play-coverage.spec.ts` — browser integration using the shared direction fixture.

Explicitly unchanged:

- `src/lib/server/db/scoped-leaderboard.ts`
- `src/lib/server/db/scoped-leaderboard.integration.test.ts`
- `src/middleware.ts`
- `env.d.ts`

---

### Task 1: Make `run.ts` the single Daily-key grammar owner

**Files:**
- Modify: `src/lib/games/ice-slide/run.ts`
- Modify: `src/lib/games/ice-slide/run.test.ts`
- Modify: `src/lib/games/ice-slide/daily.ts`
- Modify: `src/lib/games/ice-slide/daily.test.ts`
- Modify: `src/lib/games/ice-slide/init.ts`

**Interfaces:**

```ts
export interface IceSlideDailyRunIdentity {
    dateKey: string
    generatorVersion: number
    rulesetVersion: number
}

export function parseIceSlideDailyRunKey(
    runKey: string
): IceSlideDailyRunIdentity | null

export function formatIceSlideDailyRunKey(
    identity: IceSlideDailyRunIdentity
): string

export function createIceSlideDailyCompetitionKey(dateKey: string): string
```

`createIceSlideDailyCompetitionKey()` remains in `daily.ts`, but delegates grammar formatting to `run.ts` with current generator/ruleset constants.

- [ ] **Step 1: Add parser/formatter tests to `run.test.ts`**

Add imports for `parseIceSlideDailyRunKey` and `formatIceSlideDailyRunKey`.

```ts
it('parses an exact Daily competition identity', () => {
    expect(
        parseIceSlideDailyRunKey('ice-slide:daily:2026-08-12:g3:r2')
    ).toEqual({
        dateKey: '2026-08-12',
        generatorVersion: 3,
        rulesetVersion: 2,
    })
})

it('formats and round-trips a Daily competition identity', () => {
    const identity = {
        dateKey: '2026-08-12',
        generatorVersion: 3,
        rulesetVersion: 2,
    }
    const key = formatIceSlideDailyRunKey(identity)
    expect(key).toBe('ice-slide:daily:2026-08-12:g3:r2')
    expect(parseIceSlideDailyRunKey(key)).toEqual(identity)
})

it.each([
    'ice-slide:daily:2026-02-29:g1:r1',
    'ice-slide:daily:2026-08-12:g0:r1',
    'ice-slide:daily:2026-08-12:g1:r0',
    'ice-slide:daily:2026-08-12:g1',
    'ice-slide:daily:2026-08-12:g1:r1:extra',
    'daily:2026-08-12:g1:r1',
])('rejects invalid Daily competition key %s', runKey => {
    expect(parseIceSlideDailyRunKey(runKey)).toBeNull()
})

it.each([
    [{ dateKey: '2026-02-29', generatorVersion: 1, rulesetVersion: 1 }],
    [{ dateKey: '2026-08-12', generatorVersion: 0, rulesetVersion: 1 }],
    [{ dateKey: '2026-08-12', generatorVersion: 1, rulesetVersion: 0 }],
])('rejects invalid formatted identity %j', identity => {
    expect(() => formatIceSlideDailyRunKey(identity)).toThrow()
})
```

- [ ] **Step 2: Run the focused run tests and confirm red**

```bash
bun run test:run src/lib/games/ice-slide/run.test.ts
```

Expected: FAIL because the parser/formatter are not exported yet.

- [ ] **Step 3: Implement parse/format in `run.ts` and reuse the parser in run validation**

Keep the existing anchored `DAILY_KEY_PATTERN`. Add a positive-integer guard using the same signed-int domain as the run validator.

```ts
export function parseIceSlideDailyRunKey(
    runKey: string
): IceSlideDailyRunIdentity | null {
    const match = DAILY_KEY_PATTERN.exec(runKey)
    if (!match) {
        return null
    }

    try {
        assertValidIceSlideUtcDateKey(match[1])
    } catch {
        return null
    }

    const generatorVersion = Number(match[2])
    const rulesetVersion = Number(match[3])
    if (
        !Number.isSafeInteger(generatorVersion) ||
        generatorVersion < 1 ||
        !Number.isSafeInteger(rulesetVersion) ||
        rulesetVersion < 1
    ) {
        return null
    }

    return {
        dateKey: match[1],
        generatorVersion,
        rulesetVersion,
    }
}

export function formatIceSlideDailyRunKey(
    identity: IceSlideDailyRunIdentity
): string {
    assertValidIceSlideUtcDateKey(identity.dateKey)
    assertPositiveInt(identity.generatorVersion, 'generatorVersion')
    assertPositiveInt(identity.rulesetVersion, 'rulesetVersion')
    return (
        `ice-slide:daily:${identity.dateKey}:` +
        `g${identity.generatorVersion}:r${identity.rulesetVersion}`
    )
}
```

Replace the Daily branch's independent `DAILY_KEY_PATTERN.exec(...)` extraction with:

```ts
const identity = parseIceSlideDailyRunKey(run.runKey)
if (!identity) {
    throw new RangeError('daily runKey must match the daily key format')
}
```

Use `identity.generatorVersion`, `identity.rulesetVersion`, and `identity.dateKey` for version and expected-seed checks.

- [ ] **Step 4: Add the current-version constructor test in `daily.test.ts`**

```ts
it('builds the frozen generator-v1 Daily competition key', () => {
    expect(createIceSlideDailyCompetitionKey('2026-08-12')).toBe(
        'ice-slide:daily:2026-08-12:g1:r1'
    )
})
```

The existing literal `2026-08-12` generator fixture must remain byte-equivalent.

- [ ] **Step 5: Delegate the Daily constructor to `run.ts`**

In `daily.ts`:

```ts
export function createIceSlideDailyCompetitionKey(dateKey: string): string {
    return formatIceSlideDailyRunKey({
        dateKey,
        generatorVersion: ICE_SLIDE_DAILY_GENERATOR_VERSION,
        rulesetVersion: ICE_SLIDE_RULESET_VERSION,
    })
}
```

Then keep:

```ts
runKey: createIceSlideDailyCompetitionKey(dateKey),
```

Do not change the seed, fork labels, stage pools, transform/objective selection, or version constants.

- [ ] **Step 6: Delete `extractDailyDateKey()` from `init.ts`**

Import `parseIceSlideDailyRunKey` from `./run` and replace both current callers:

```ts
const capturedDateKey =
    dailyDateKey ?? parseIceSlideDailyRunKey(state.runKey)?.dateKey ?? ''
```

and:

```ts
dailyDateKey = parseIceSlideDailyRunKey(run.runKey)?.dateKey ?? null
```

Do **not** touch the existing private `formatTime()` in this task.

- [ ] **Step 7: Run the identity/generator/init regressions**

```bash
bun run test:run \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/init.test.ts
```

Expected: PASS, including existing UTC-rollover/retry behavior and the frozen generator fixture.

- [ ] **Step 8: Commit**

```bash
git add src/lib/games/ice-slide/run.ts src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/daily.ts src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/init.ts
git commit -m "refactor(ice-slide): centralize Daily competition identity"
```

---

### Task 2: Add independently testable Daily score-admission reasons

**Files:**
- Modify: `src/lib/games/ice-slide/run.ts`
- Modify: `src/lib/games/ice-slide/run.test.ts`
- Modify: `src/pages/api/scores.ts`
- Modify: `src/pages/api/scores.test.ts`

**Interfaces:**

```ts
export type IceSlideDailyAdmissionReason =
    | 'missing-context'
    | 'context-mode-mismatch'
    | 'missing-competition-key'
    | 'malformed-competition-key'
    | 'missing-game-data'
    | 'game-data-mode-mismatch'
    | 'unsolved'
    | 'run-key-mismatch'
    | 'generator-version-mismatch'
    | 'game-data-ruleset-mismatch'
    | 'context-ruleset-mismatch'
    | 'invalid-elapsed-seconds'
    | 'invalid-total-moves'

export function iceSlideDailyAdmissionError(
    context: {
        mode: string
        competitionKey?: string
        rulesetVersion: number
    } | undefined,
    gameData: Record<string, unknown> | undefined
): { reason: IceSlideDailyAdmissionReason } | null
```

The route maps every non-null result to the same public HTTP 400 body and does not persist.

- [ ] **Step 1: Add one accepted fixture and an exact-reason matrix to `run.test.ts`**

Define:

```ts
const validDailyContext = {
    mode: 'daily',
    competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
    rulesetVersion: 1,
}

const validDailyGameData = {
    mode: 'daily',
    solved: true,
    runKey: 'ice-slide:daily:2026-08-12:g1:r1',
    generatorVersion: 1,
    rulesetVersion: 1,
    elapsedSeconds: 87,
    totalMoves: 31,
}
```

Assert:

```ts
expect(
    iceSlideDailyAdmissionError(validDailyContext, validDailyGameData)
).toBeNull()
```

Then add explicit tests whose mutations isolate one reason at a time:

```ts
it.each([
    ['missing-context', undefined, validDailyGameData, 'missing-context'],
    [
        'context-mode-mismatch',
        { ...validDailyContext, mode: 'expedition' },
        validDailyGameData,
        'context-mode-mismatch',
    ],
    [
        'missing-competition-key',
        { mode: 'daily', rulesetVersion: 1 },
        validDailyGameData,
        'missing-competition-key',
    ],
    [
        'malformed-competition-key',
        { ...validDailyContext, competitionKey: 'ice-slide:daily:2026-02-29:g1:r1' },
        validDailyGameData,
        'malformed-competition-key',
    ],
    [
        'missing-game-data',
        validDailyContext,
        undefined,
        'missing-game-data',
    ],
    [
        'game-data-mode-mismatch',
        validDailyContext,
        { ...validDailyGameData, mode: 'expedition' },
        'game-data-mode-mismatch',
    ],
    [
        'unsolved',
        validDailyContext,
        { ...validDailyGameData, solved: false },
        'unsolved',
    ],
    [
        'run-key-mismatch',
        validDailyContext,
        { ...validDailyGameData, runKey: 'ice-slide:daily:2026-08-11:g1:r1' },
        'run-key-mismatch',
    ],
    [
        'generator-version-mismatch',
        validDailyContext,
        { ...validDailyGameData, generatorVersion: 2 },
        'generator-version-mismatch',
    ],
    [
        'game-data-ruleset-mismatch',
        validDailyContext,
        { ...validDailyGameData, rulesetVersion: 2 },
        'game-data-ruleset-mismatch',
    ],
    [
        'context-ruleset-mismatch',
        { ...validDailyContext, rulesetVersion: 2 },
        { ...validDailyGameData, rulesetVersion: 2 },
        'context-ruleset-mismatch',
    ],
    [
        'invalid-elapsed-seconds',
        validDailyContext,
        { ...validDailyGameData, elapsedSeconds: -1 },
        'invalid-elapsed-seconds',
    ],
    [
        'invalid-total-moves',
        validDailyContext,
        { ...validDailyGameData, totalMoves: -1 },
        'invalid-total-moves',
    ],
])('returns reason %s', (_name, context, gameData, expected) => {
    expect(iceSlideDailyAdmissionError(context, gameData)).toEqual({
        reason: expected,
    })
})
```

Also assert a non-Daily Campaign-like payload and a non-Daily Expedition payload both return `null`.

- [ ] **Step 2: Run the pure suite and confirm red**

```bash
bun run test:run src/lib/games/ice-slide/run.test.ts
```

Expected: FAIL because the admission helper does not exist.

- [ ] **Step 3: Implement the helper as ordered single-invariant branches**

Use one small metric guard:

```ts
function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
```

Implement in this exact order so each reason remains independently observable:

```ts
export function iceSlideDailyAdmissionError(
    context: DailyAdmissionContext | undefined,
    gameData: Record<string, unknown> | undefined
): { reason: IceSlideDailyAdmissionReason } | null {
    const claimsDaily =
        context?.mode === 'daily' || gameData?.mode === 'daily'
    if (!claimsDaily) {
        return null
    }
    if (!context) {
        return { reason: 'missing-context' }
    }
    if (context.mode !== 'daily') {
        return { reason: 'context-mode-mismatch' }
    }
    if (!context.competitionKey) {
        return { reason: 'missing-competition-key' }
    }

    const identity = parseIceSlideDailyRunKey(context.competitionKey)
    if (!identity) {
        return { reason: 'malformed-competition-key' }
    }
    if (!gameData) {
        return { reason: 'missing-game-data' }
    }
    if (gameData.mode !== 'daily') {
        return { reason: 'game-data-mode-mismatch' }
    }
    if (gameData.solved !== true) {
        return { reason: 'unsolved' }
    }
    if (gameData.runKey !== context.competitionKey) {
        return { reason: 'run-key-mismatch' }
    }
    if (gameData.generatorVersion !== identity.generatorVersion) {
        return { reason: 'generator-version-mismatch' }
    }
    if (gameData.rulesetVersion !== context.rulesetVersion) {
        return { reason: 'game-data-ruleset-mismatch' }
    }
    if (context.rulesetVersion !== identity.rulesetVersion) {
        return { reason: 'context-ruleset-mismatch' }
    }
    if (!isNonNegativeInteger(gameData.elapsedSeconds)) {
        return { reason: 'invalid-elapsed-seconds' }
    }
    if (!isNonNegativeInteger(gameData.totalMoves)) {
        return { reason: 'invalid-total-moves' }
    }
    return null
}
```

Do not collapse these checks back into one `||` chain.

- [ ] **Step 4: Add score-route boundary tests**

Use the existing authenticated-session and score persistence mocks. Add one valid Ice Slide Daily POST and representative invalid HTTP cases:

- unsolved Daily;
- malformed competition key;
- context/key ruleset mismatch where `gameData.rulesetVersion` matches context but the key is still `r1`;
- Expedition game data with Daily context.

Each invalid request that passes generic Zod must return 400 and leave `saveGameScoreWithAchievements` uncalled.

Negative metric transport remains covered by generic validation tests; the pure helper already freezes its own negative-metric invariants.

- [ ] **Step 5: Dispatch from `/api/scores` after generic validation**

Import `iceSlideDailyAdmissionError`. After `getGameById()` succeeds and before building `PersistedScoreContext`:

```ts
if (validatedGameId === GameID.ICE_SLIDE) {
    const admissionError = iceSlideDailyAdmissionError(context, gameData)
    if (admissionError) {
        console.warn(
            '[scores API] Rejected Ice Slide Daily score:',
            admissionError.reason
        )
        return badRequestResponse('Invalid Ice Slide Daily score data')
    }
}
```

Do not log the score payload. Do not add a public admission error-code family.

- [ ] **Step 6: Run score regressions**

```bash
bun run test:run \
  src/lib/games/ice-slide/run.test.ts \
  src/pages/api/scores.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: PASS. Existing non-Ice-Slide, Campaign, and generic score behavior remains unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/ice-slide/run.ts src/lib/games/ice-slide/run.test.ts \
  src/pages/api/scores.ts src/pages/api/scores.test.ts
git commit -m "feat(ice-slide): admit valid Daily scores only"
```

---

### Task 3: Require exact Daily reads and reuse middleware viewer identity

**Files:**
- Modify: `src/lib/server/validations.ts`
- Modify: `src/lib/server/validations.test.ts`
- Modify: `src/pages/api/leaderboard.ts`
- Modify: `src/pages/api/leaderboard.test.ts`

**Interfaces:**

- `ScopedLeaderboardQuery` remains unchanged.
- All scoped API rows gain `isCurrentUser: boolean`.
- All scoped API responses gain `viewerAuthenticated: boolean`.
- Unscoped responses remain unchanged.

- [ ] **Step 1: Add the Ice Slide Daily presence rule to `leaderboardQuerySchema` tests**

Add tests for:

```text
?gameId=ice_slide&mode=daily                            -> invalid
?gameId=ice_slide&mode=daily&competitionKey=<key>      -> valid
?gameId=tetris&mode=daily                              -> still valid
```

The valid exact key may use `ice-slide:daily:2026-08-12:g1:r1`; grammar semantics are route-owned, so the validation test only proves presence/transport relationships.

- [ ] **Step 2: Run validation tests and confirm red**

```bash
bun run test:run src/lib/server/validations.test.ts
```

Expected: FAIL because Ice Slide Daily does not yet require `competitionKey`.

- [ ] **Step 3: Extend `leaderboardQuerySchema.superRefine()`**

After the existing generic relationship rules, add:

```ts
// Ice Slide Daily additionally requires an exact competition key; the
// route validates that key's game-domain grammar with parseIceSlideDailyRunKey().
if (
    data.gameId === GameID.ICE_SLIDE &&
    data.mode === 'daily' &&
    !data.competitionKey
) {
    ctx.addIssue({
        code: 'custom',
        path: ['competitionKey'],
        message: 'competitionKey is required for Ice Slide Daily',
    })
}
```

Do not import the Ice Slide parser into generic validation code.

- [ ] **Step 4: Update leaderboard test setup before adding viewer tests**

The file-level game mock must include:

```ts
GameID: {
    TETRIS: 'tetris',
    ICE_SLIDE: 'ice_slide',
}
```

Add an Ice Slide game to `getAllGames()` fixtures.

Do **not** add `vi.mock('@/lib/auth')`; the route will not import auth.

Create a minimal route-context helper:

```ts
const routeContext = (
    url: string,
    user: { id: string } | null = null
) =>
    ({
        url: new URL(url),
        locals: { user, session: null },
    }) as never
```

Update every existing direct `GET({ url } as ...)` in this test file to include `locals` through the helper or an equivalent explicit object. No production `undefined` compatibility path is added just for old tests.

- [ ] **Step 5: Add exact-key semantic read tests**

Add:

- calendar-invalid key returns 400 and does not call `getScopedGameLeaderboard`;
- valid key calls the unchanged query with exactly:

```ts
{
    gameId: 'ice_slide',
    mode: 'daily',
    competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
    limit: 10,
}
```

- existing Tetris mode-only scoped request still calls the unchanged query with `competitionKey: undefined`.

- [ ] **Step 6: Add viewer metadata tests from `locals.user`**

For a scoped row whose private `userId` is `u1`, call with `locals.user = { id: 'u1' }` and assert:

```ts
expect(body.viewerAuthenticated).toBe(true)
expect(body.leaderboard[0]).toMatchObject({
    rank: 1,
    isCurrentUser: true,
})
expect(body.leaderboard[0]).not.toHaveProperty('userId')
```

Call the same scoped query with `locals.user = null` and assert:

```ts
expect(body.viewerAuthenticated).toBe(false)
expect(body.leaderboard[0].isCurrentUser).toBe(false)
```

Update the existing scoped Tetris `toEqual` assertion to include `viewerAuthenticated` and `isCurrentUser` because those fields are intentionally additive to all scoped responses.

Assert an unscoped game response does **not** gain either field.

- [ ] **Step 7: Run API tests and confirm new cases red**

```bash
bun run test:run src/pages/api/leaderboard.test.ts
```

Expected: exact-key semantic and viewer metadata assertions FAIL before route changes.

- [ ] **Step 8: Implement route semantics using `locals`**

Change the route signature:

```ts
export const GET: APIRoute = async ({ url, locals }) => {
```

The schema already guarantees key presence for Ice Slide Daily. In the scoped branch, keep a semantic companion comment and validate grammar:

```ts
// leaderboardQuerySchema requires the key's presence for Ice Slide Daily;
// this route validates the Ice Slide domain grammar/calendar semantics.
if (gameId === GameID.ICE_SLIDE && mode === 'daily') {
    if (!competitionKey || !parseIceSlideDailyRunKey(competitionKey)) {
        return badRequestResponse('Invalid Ice Slide Daily competitionKey')
    }
}
```

Call the existing query unchanged:

```ts
const scoped = await getScopedGameLeaderboard({
    gameId,
    mode,
    competitionKey,
    limit,
})
```

After success:

```ts
const viewerUserId = locals.user?.id ?? null
const leaderboard = scoped.rows.map((row, index) => ({
    rank: index + 1,
    ...toPublicScopedLeaderboardEntry(row),
    isCurrentUser: viewerUserId !== null && row.userId === viewerUserId,
}))

return jsonResponse({
    gameId,
    gameName: game.name,
    viewerAuthenticated: viewerUserId !== null,
    leaderboard,
})
```

Do not import `auth`, do not thread `request`, and do not add `getViewerUserId()`.

- [ ] **Step 9: Run validation/API regressions**

```bash
bun run test:run \
  src/lib/server/validations.test.ts \
  src/pages/api/leaderboard.test.ts
```

Expected: PASS, including generic Tetris mode-only behavior and unscoped Campaign response contracts.

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/validations.ts src/lib/server/validations.test.ts \
  src/pages/api/leaderboard.ts src/pages/api/leaderboard.test.ts
git commit -m "feat(ice-slide): scope Daily leaderboard reads"
```

---

### Task 4: Add a unit-tested Daily leaderboard controller and post-save refresh seam

**Files:**
- Create: `src/lib/games/ice-slide/daily-leaderboard.ts`
- Create: `src/lib/games/ice-slide/daily-leaderboard.test.ts`
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**

```ts
export interface DailyLeaderboardEntry {
    rank: number
    name: string
    score: number
    elapsedSeconds: number | null
    totalMoves: number | null
    isCurrentUser: boolean
}

export interface DailyLeaderboardResponse {
    viewerAuthenticated: boolean
    leaderboard: DailyLeaderboardEntry[]
}

export type DailyLeaderboardPanelState =
    | 'loading'
    | 'empty'
    | 'unavailable'
    | 'rows'

export function buildIceSlideDailyLeaderboardUrl(
    competitionKey: string
): string

export function formatDailyLeaderboardElapsed(
    seconds: number | null
): string

export function createDailyLeaderboardRowElement(
    entry: DailyLeaderboardEntry,
    document: Document
): HTMLElement

export function setDailyLeaderboardPanelState(
    elements: DailyLeaderboardElements,
    state: DailyLeaderboardPanelState
): void

export function createDailyLeaderboardController(
    elements: DailyLeaderboardElements,
    fetcher?: typeof fetch
): {
    load: (competitionKey: string) => Promise<void>
    hide: () => void
}
```

`IceSlideUICallbacks` gains:

```ts
onScoreSaved?: (gameData: IceSlideGameData) => void
```

- [ ] **Step 1: Add controller helper tests before implementation**

In `daily-leaderboard.test.ts`, mount the seven required static elements and test:

```ts
expect(
    buildIceSlideDailyLeaderboardUrl(
        'ice-slide:daily:2026-08-12:g1:r1'
    )
).toBe(
    '/api/leaderboard?gameId=ice_slide&mode=daily&competitionKey=' +
        'ice-slide%3Adaily%3A2026-08-12%3Ag1%3Ar1&limit=10'
)
```

Elapsed formatting:

```ts
expect(formatDailyLeaderboardElapsed(null)).toBe('—')
expect(formatDailyLeaderboardElapsed(87)).toBe('1:27')
expect(formatDailyLeaderboardElapsed(3665)).toBe('1:01:05')
```

The `3665` assertion belongs to the **new leaderboard formatter only**. Do not assert/change the existing in-run HUD's private `M:SS` formatter.

Row rendering must assert rank, player, localized score text, elapsed, moves, and a literal `YOU` badge for `isCurrentUser=true`, using `textContent`/children rather than `innerHTML`.

- [ ] **Step 2: Add controller-state tests**

Test `loading`, `empty`, `unavailable`, and `rows` visibility toggles through `setDailyLeaderboardPanelState()`.

Add a successful load using a mocked fetcher and assert:

- panel becomes visible;
- date is derived from `parseIceSlideDailyRunKey()`;
- signed-out note follows `viewerAuthenticated`;
- rows are replaced, not appended across refreshes.

Add an invalid-key load:

```ts
await controller.load('not-a-daily-key')
expect(unavailable).not.toHaveClass('hidden')
expect(rows).toHaveClass('hidden')
```

This must not silently leave previous ranking rows visible.

- [ ] **Step 3: Add delayed stale-response coverage**

Use two deferred fetch responses:

1. call `load(oldKey)`;
2. call `load(newKey)` before the first resolves;
3. resolve the new request with `New Pilot`;
4. resolve the old request with `Old Pilot`;
5. assert only `New Pilot` remains.

Then test `hide()` while a request is pending; releasing that request must not reveal the panel or render its row.

- [ ] **Step 4: Run the new module test and confirm red**

```bash
bun run test:run src/lib/games/ice-slide/daily-leaderboard.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 5: Implement `daily-leaderboard.ts` minimally**

Import:

```ts
import { formatTime } from '../shared/utils'
import { parseIceSlideDailyRunKey } from './run'
```

`formatDailyLeaderboardElapsed()` is:

```ts
export function formatDailyLeaderboardElapsed(
    seconds: number | null
): string {
    return seconds === null ? '—' : formatTime(seconds)
}
```

`load()` increments/captures one request token before parsing. If parsing fails, show the panel and set `unavailable`. For valid keys, set the date/loading state, fetch the exact URL, re-check the token after `fetch()` and after `json()`, then render current data only.

`hide()` increments the token before adding `hidden` to the panel.

Do not add `AbortController`, a class hierarchy, a store, or an event bus.

- [ ] **Step 6: Add `onScoreSaved` unit coverage to `init.test.ts`**

Reuse the existing mocked `saveGameScore`. Add:

1. current successful Daily save calls `onScoreSaved` once with game data containing `mode:'daily'`, `solved:true`, and the captured `runKey`;
2. `UNAUTHENTICATED` and generic score errors never call it;
3. starting a newer run before an older mocked success callback fires suppresses the stale callback.

- [ ] **Step 7: Implement the callback in `init.ts`**

Import `IceSlideGameData` only for the callback type. In the existing score success callback, after the run-guard stale check and achievement dispatch:

```ts
callbacks.onScoreSaved?.(gameData)
```

Do not fetch a leaderboard from `init.ts`.

Do not remove or replace the existing private `formatTime()`; HPA-488 leaves in-run HUD formatting unchanged.

- [ ] **Step 8: Add the static Astro card and markup IDs**

Place directly below `#daily-meta`:

```astro
<Card id="daily-leaderboard" variant="glass" class="hidden p-4">
  <div class="flex items-baseline justify-between gap-3">
    <h3 class="font-mono text-sm tracking-wide text-cetus-accent">
      ▸ DAILY RANKING
    </h3>
    <span id="daily-leaderboard-date" class="text-xs text-cetus-ink-muted">—</span>
  </div>
  <p id="daily-leaderboard-signed-out" class="hidden mt-2 text-xs text-cetus-ink-muted">
    Sign in to submit a ranked result. You can still view today's ranking.
  </p>
  <p id="daily-leaderboard-loading" class="mt-3 text-sm text-cetus-ink-muted">
    Loading ranking…
  </p>
  <p id="daily-leaderboard-empty" class="hidden mt-3 text-sm text-cetus-ink-muted">
    No ranked finishes yet.
  </p>
  <p id="daily-leaderboard-unavailable" class="hidden mt-3 text-sm text-cetus-ink-muted">
    Ranking is temporarily unavailable.
  </p>
  <div id="daily-leaderboard-rows" class="hidden mt-3 space-y-2"></div>
</Card>
```

Add all seven IDs to `src/pages/game-board-markup.test.ts`. Keep that test structural; do not assert Astro script source text.

- [ ] **Step 9: Wire the Astro page to the controller**

Import:

```ts
import { createDailyLeaderboardController } from '@/lib/games/ice-slide/daily-leaderboard'
import {
  createIceSlideDailyCompetitionKey,
  toIceSlideUtcDateKey,
} from '@/lib/games/ice-slide/daily'
```

Build the `DailyLeaderboardElements` object from the static IDs and construct one controller.

Use these transitions:

- after page init, if Daily is selected, `controller.load(currentUtcDailyKey())`;
- idle radio change to Daily loads current UTC key;
- idle radio change to Campaign calls `controller.hide()`;
- after `await gameHandle.start('daily')`, load `gameHandle.getGame()?.getState().runKey`;
- after Daily `playAgain()`, load the game's still-captured run key;
- `onScoreSaved(gameData)` loads `gameData.runKey` only when `gameData.mode === 'daily'`;
- Change Mode hides or loads based on the still-selected radio.

The page does not duplicate URL construction, parsing, token logic, row creation, or formatting.

- [ ] **Step 10: Run Task 4 unit/markup verification**

```bash
bun run test:run \
  src/lib/games/ice-slide/daily-leaderboard.test.ts \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

**Coverage boundary:** these tests execute the controller, callback, and durable markup. They do **not** execute the inline Astro event wiring from Step 9. Task 5 Playwright is intentionally the first executable proof that the page wiring connects those tested seams correctly.

- [ ] **Step 11: Commit**

```bash
git add src/lib/games/ice-slide/daily-leaderboard.ts \
  src/lib/games/ice-slide/daily-leaderboard.test.ts \
  src/lib/games/ice-slide/init.ts src/lib/games/ice-slide/init.test.ts \
  src/pages/ice-slide/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(ice-slide): show Daily leaderboard"
```

---

### Task 5: Share one frozen playthrough fixture, prove page wiring, and run repository gates

**Files:**
- Modify: `src/lib/games/ice-slide/test-fixtures.ts`
- Modify: `src/lib/games/ice-slide/daily.test.ts`
- Modify: `e2e/games/play-coverage.spec.ts`

**Interfaces:**

```ts
export const ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS = [
    ['S', 'E', 'S'],
    ['N', 'W', 'N', 'W'],
    ['W', 'N', 'E', 'S', 'W', 'N'],
    ['S', 'W', 'N', 'E', 'S', 'W'],
    ['E', 'S', 'W', 'N', 'E', 'S'],
] as const satisfies readonly (readonly Direction[])[]
```

- [ ] **Step 1: Put the direction fixture in `test-fixtures.ts` once**

Import `Direction` as a type and export the constant above.

Do not export browser key strings from the source fixture; it remains game-domain directions only.

- [ ] **Step 2: Unit-replay the shared fixture before Playwright consumes it**

In `daily.test.ts`, import:

```ts
import { IceSlideGame } from './game'
import { solveIceSlideBoard } from './solver'
import { ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS } from './test-fixtures'
```

Add:

```ts
it('locks the shared 2026-08-12 minimum-move completion fixture', () => {
    const run = createIceSlideDailyRunDefinition('2026-08-12')
    expect(ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS).toHaveLength(
        run.stages.length
    )

    const game = new IceSlideGame()
    game.start(run)

    for (const [stageIndex, directions] of
        ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS.entries()) {
        const stage = run.stages[stageIndex]
        const solved = solveIceSlideBoard(stage, {
            maxStates: ICE_SLIDE_DAILY_SOLVER_MAX_STATES,
        })
        expect(solved.truncated).toBe(false)
        expect(solved.minMoves).toBe(directions.length)

        for (const direction of directions) {
            game.move(direction)
        }

        if (stageIndex < run.stages.length - 1) {
            expect(game.getState().levelIndex).toBe(stageIndex + 1)
            expect(game.getState().status).toBe('playing')
        }
    }

    expect(game.getState().status).toBe('won')
    expect(game.getGameData().solved).toBe(true)
    game.destroy()
})
```

This validates the exact shared directions and their minimum-move lengths. It does not claim every optional star is earned.

- [ ] **Step 3: Run the unit consumer first**

```bash
bun run test:run src/lib/games/ice-slide/daily.test.ts
```

Expected: PASS before any browser test uses the fixture. If it fails, fix the fixture here rather than debugging an opaque Playwright failure.

- [ ] **Step 4: Import the same fixture in Playwright and derive keys**

At the top of `e2e/games/play-coverage.spec.ts`:

```ts
import { ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS } from '../../src/lib/games/ice-slide/test-fixtures'
```

Inside the Ice Slide test section:

```ts
const DIRECTION_TO_KEY = {
    N: 'ArrowUp',
    E: 'ArrowRight',
    S: 'ArrowDown',
    W: 'ArrowLeft',
} as const

async function completeFrozenDaily(page: Page): Promise<void> {
    for (
        let stage = 0;
        stage < ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS.length;
        stage++
    ) {
        for (const direction of
            ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS[stage]) {
            await page.keyboard.press(DIRECTION_TO_KEY[direction])
        }
        if (
            stage <
            ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS.length - 1
        ) {
            await expect(page.locator('#stage-clear-overlay')).toBeVisible()
            await page.locator('#stage-clear-continue-btn').click()
        }
    }
    await expect(page.locator('#game-over-overlay')).toBeVisible()
}
```

Do not hardcode a second arrow-key sequence array.

- [ ] **Step 5: Cover signed-out/empty and viewer-row rendering**

Fix time to `2026-08-12T20:00:00Z` and route `**/api/leaderboard?*`.

Empty response:

```json
{
  "gameId": "ice_slide",
  "gameName": "Ice Slide",
  "viewerAuthenticated": false,
  "leaderboard": []
}
```

Assert:

- request key equals `ice-slide:daily:2026-08-12:g1:r1`;
- empty state visible;
- signed-out note visible.

Viewer response:

```json
{
  "gameId": "ice_slide",
  "gameName": "Ice Slide",
  "viewerAuthenticated": true,
  "leaderboard": [{
    "rank": 1,
    "name": "Pilot",
    "score": 4321,
    "elapsedSeconds": 87,
    "totalMoves": 31,
    "isCurrentUser": true
  }]
}
```

Assert row text includes `1`, `Pilot`, `4,321`, `1:27`, `31`, and visible `YOU`.

- [ ] **Step 6: Cover leaderboard unavailable without blocking play**

Return 503 for the leaderboard route with the existing coded scoped-unavailable body. Assert `#daily-leaderboard-unavailable` is visible, then Start Daily and verify the Pixi canvas plus `#end-btn` remain usable. The generic `#game-error` surface must stay hidden for a leaderboard-only failure.

- [ ] **Step 7: Cover successful-submit refresh on the captured key**

Mock `/api/scores` with a 200 success body and count leaderboard requests. Start fixed-date Daily, record the current request count, call `completeFrozenDaily(page)`, then assert another leaderboard fetch occurs and its exact key remains:

```text
ice-slide:daily:2026-08-12:g1:r1
```

Inspect the POST body once and assert:

```ts
expect(body.context).toMatchObject({
    mode: 'daily',
    competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
    rulesetVersion: 1,
})
expect(body.gameData.solved).toBe(true)
```

- [ ] **Step 8: Cover delayed stale-response suppression through real page wiring**

Delay a Daily leaderboard response. While it is pending, switch idle mode selection to Campaign. Release the delayed response and assert:

- `#daily-leaderboard` remains hidden;
- delayed row text never appears.

This proves the Astro wiring actually calls the controller's tested invalidation path. Do not add `AbortController` only for this test.

- [ ] **Step 9: Run focused Ice Slide browser coverage**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Expected: all existing HPA-487 cases plus new leaderboard cases PASS.

- [ ] **Step 10: Run focused unit/API coverage once more**

```bash
bun run test:run \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/init.test.ts \
  src/lib/games/ice-slide/daily-leaderboard.test.ts \
  src/pages/api/scores.test.ts \
  src/lib/server/validations.test.ts \
  src/pages/api/leaderboard.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 11: Run full repository verification**

```bash
bun run test:run
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:coverage
```

Expected:

- tests/typecheck/lint/format/build exit 0;
- local coverage does not regress the repository below the configured 95% project target;
- remote Codecov project and patch checks remain authoritative after push.

- [ ] **Step 12: Commit the shared fixture/browser coverage**

```bash
git add src/lib/games/ice-slide/test-fixtures.ts \
  src/lib/games/ice-slide/daily.test.ts \
  e2e/games/play-coverage.spec.ts
git commit -m "test(ice-slide): cover Daily leaderboard flows"
```

---

## Plan self-review

- **Spec coverage:** Daily identity, exact semantic admission, exact-key reads, best-per-user reuse, middleware viewer highlighting, signed-out/loading/empty/unavailable states, successful-save refresh, stale suppression, Campaign compatibility, and failure isolation each map to a concrete task.
- **Reuse:** `getScopedGameLeaderboard()` stays unchanged; `locals.user` avoids a second auth lookup; shared `formatTime()` is used only for the new leaderboard; existing `test-fixtures.ts` owns the frozen playthrough once.
- **Identity consistency:** `run.ts` owns parse + format grammar. `daily.ts` only supplies current generator/ruleset constants to the formatter. `init.ts`, writes, reads, and client display all parse through the same function.
- **Admission consistency:** every semantic invariant has a distinct closed-union reason test, while the public API still emits one stable 400 body.
- **Client test seam:** request-token/render logic is executed under jsdom in Task 4. Task 4 explicitly does not claim to execute Astro event wiring; Task 5 Playwright proves that integration.
- **HUD compatibility:** HPA-488 does not change the existing Ice Slide in-run `M:SS` formatter; the shared formatter is used only by the new ranking panel.
- **Fixture consistency:** one direction fixture feeds both the unit replay and browser key translation; Playwright does not own a duplicate sequence.
- **Placeholder scan:** no TBD/TODO/future implementation step remains.
- **Scope check:** no schema, endpoint family, ranking query change, auth preflight/lookup, shared UI abstraction, replay verifier, historical browser, Expedition ranking, or current-user rank query has entered the plan.
