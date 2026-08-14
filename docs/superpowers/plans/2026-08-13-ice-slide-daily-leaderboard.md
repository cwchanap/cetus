# Ice Slide Daily Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit only valid completed Ice Slide Daily scores, rank one best result per player for the exact Daily competition, and show/refetch that ranking on the Ice Slide page without changing Campaign behavior.

**Architecture:** Reuse HPA-484's existing score-context persistence and `getScopedGameLeaderboard()` window query unchanged. `run.ts` owns the single Daily-key parser plus pure Daily admission semantics; `/api/scores` and `/api/leaderboard` remain the only network seams. A small Ice-Slide-specific `daily-leaderboard.ts` module owns fetch/render/request-token behavior so the Astro page stays wiring-only and the risky async UI logic is unit-testable.

**Tech Stack:** Astro 5, TypeScript, Tailwind CSS 4, Better Auth, Kysely + LibSQL/Turso, Vitest/jsdom, Playwright, Bun 1.3.1.

## Global Constraints

- Keep `/api/leaderboard?gameId=ice_slide` on the existing unscoped Campaign response path.
- Daily competition keys remain `ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>` and use UTC dates.
- Daily ranking order remains score DESC, elapsed seconds ASC, total moves ASC, submission time ASC; row ID is only the existing final deterministic fallback for exact ties.
- Repeated attempts remain stored; only the existing best-per-user query chooses the displayed row.
- `getScopedGameLeaderboard()` and `ScopedLeaderboardQuery` remain unchanged in HPA-488; the exact competition key is the competitive scope.
- Do not add database schema, a new endpoint, a best-score cache/table, a generic mode registry, a shared leaderboard component, or an auth preflight request.
- Do not add replay verification, score recomputation, historical Daily navigation, Expedition ranking, read-repair for pre-HPA-488 malformed rows, or current-user rank lookup beyond returned rows.
- Astro owns durable HTML; client TypeScript may update/toggle existing structure and create leaderboard row children without `innerHTML`.
- Leaderboard or viewer-auth lookup failure must never enter the Ice Slide `failRun` path or invalidate a local result.
- Preserve HPA-487's captured Daily run identity across UTC rollover and Play Again.
- Reuse `src/lib/games/shared/utils.ts::formatTime`; do not add another M:SS formatter.
- Keep existing remote Codecov project/patch coverage requirements at 95%.

---

## File map

One new production module is intentional because it turns page-local async/render behavior into executable unit tests.

- `src/lib/games/ice-slide/run.ts` — single Daily run-key parser plus pure Daily score-admission helper.
- `src/lib/games/ice-slide/daily.ts` — centralize construction of the frozen Daily competition key.
- `src/lib/games/ice-slide/init.ts` — consume the one parser for captured date identity, reuse shared `formatTime`, and report successful score saves.
- `src/pages/api/scores.ts` — call the pure Ice Slide Daily admission helper before persistence.
- `src/pages/api/leaderboard.ts` — require exact Ice Slide Daily identity and add viewer metadata to scoped responses.
- `src/lib/games/ice-slide/daily-leaderboard.ts` — Ice-Slide-specific URL/state/row/fetch/request-token logic.
- `src/pages/ice-slide/index.astro` — static Daily leaderboard card plus event wiring only.
- Existing colocated tests and `e2e/games/play-coverage.spec.ts` — contract, DOM, async-state, and browser coverage.

Explicitly **not modified**:

- `src/lib/server/db/scoped-leaderboard.ts`
- `src/lib/server/db/scoped-leaderboard.integration.test.ts`

---

### Task 1: Make one Daily competition-identity parser serve every consumer

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

export function createIceSlideDailyCompetitionKey(dateKey: string): string
```

`createIceSlideDailyRunDefinition(dateKey)` must continue producing byte-equivalent generator-v1 run keys, seeds, stages, objectives, and signatures.

- [ ] **Step 1: Write failing parser tests in `run.test.ts`**

Add the parser import and lock exact identity plus malformed/calendar-invalid/unsafe versions:

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

it.each([
    'ice-slide:daily:2026-02-29:g1:r1',
    'ice-slide:daily:2026-08-12:g0:r1',
    'ice-slide:daily:2026-08-12:g1:r0',
    'ice-slide:daily:2026-08-12:g1',
    'ice-slide:daily:2026-08-12:g1:r1:extra',
    'daily:2026-08-12:g1:r1',
    'ice-slide:daily:2026-08-12:g999999999999999999999:r1',
])('rejects invalid Daily competition key %s', runKey => {
    expect(parseIceSlideDailyRunKey(runKey)).toBeNull()
})
```

- [ ] **Step 2: Run the focused run suite and confirm red**

```bash
bun run test:run src/lib/games/ice-slide/run.test.ts
```

Expected: FAIL because `parseIceSlideDailyRunKey` is not exported.

- [ ] **Step 3: Implement the parser and reuse it in Daily run validation**

Keep `DAILY_KEY_PATTERN` as the single syntax regex. Parse versions once and reject anything outside the existing positive signed-integer contract:

```ts
export interface IceSlideDailyRunIdentity {
    dateKey: string
    generatorVersion: number
    rulesetVersion: number
}

export function parseIceSlideDailyRunKey(
    runKey: string
): IceSlideDailyRunIdentity | null {
    const match = DAILY_KEY_PATTERN.exec(runKey)
    if (!match) {
        return null
    }

    const generatorVersion = Number(match[2])
    const rulesetVersion = Number(match[3])

    try {
        assertValidIceSlideUtcDateKey(match[1])
        assertPositiveInt(generatorVersion, 'generatorVersion')
        assertPositiveInt(rulesetVersion, 'rulesetVersion')
    } catch {
        return null
    }

    return {
        dateKey: match[1],
        generatorVersion,
        rulesetVersion,
    }
}
```

Replace the Daily branch's independent regex extraction with:

```ts
const identity = parseIceSlideDailyRunKey(run.runKey)
if (!identity) {
    throw new RangeError('daily runKey must match the daily key format')
}
if (run.generatorVersion !== identity.generatorVersion) {
    throw new RangeError('daily generatorVersion must match the runKey')
}
if (run.rulesetVersion !== identity.rulesetVersion) {
    throw new RangeError('daily rulesetVersion must match the runKey')
}
const expectedSeed =
    `ice-slide:daily:${identity.generatorVersion}:` +
    `${identity.rulesetVersion}:${identity.dateKey}`
```

Do not retain another Daily-key regex parser elsewhere in `run.ts`.

- [ ] **Step 4: Add the competition-key constructor test in `daily.test.ts`**

```ts
it('builds the frozen generator-v1 Daily competition key', () => {
    expect(createIceSlideDailyCompetitionKey('2026-08-12')).toBe(
        'ice-slide:daily:2026-08-12:g1:r1'
    )
})

it('rejects an invalid Daily competition date', () => {
    expect(() => createIceSlideDailyCompetitionKey('2026-02-29')).toThrow(
        RangeError
    )
})
```

- [ ] **Step 5: Implement the constructor and use it in the Daily materializer**

In `daily.ts`:

```ts
export function createIceSlideDailyCompetitionKey(dateKey: string): string {
    assertValidIceSlideUtcDateKey(dateKey)
    return (
        `ice-slide:daily:${dateKey}:` +
        `g${ICE_SLIDE_DAILY_GENERATOR_VERSION}:r${ICE_SLIDE_RULESET_VERSION}`
    )
}
```

Replace only the run-key literal:

```ts
runKey: createIceSlideDailyCompetitionKey(dateKey),
```

Do not change the Daily seed, fork labels, stage pools, transform/objective selection, or version constants.

- [ ] **Step 6: Remove the weaker `init.ts` Daily-date parser**

Import `parseIceSlideDailyRunKey` from `./run`, delete:

```ts
function extractDailyDateKey(runKey: string): string | null {
    return /^ice-slide:daily:(\d{4}-\d{2}-\d{2}):/.exec(runKey)?.[1] ?? null
}
```

Replace both live consumers:

```ts
const capturedDateKey =
    dailyDateKey ?? parseIceSlideDailyRunKey(state.runKey)?.dateKey ?? ''
```

and:

```ts
dailyDateKey = parseIceSlideDailyRunKey(run.runKey)?.dateKey ?? null
```

The `startRun()` Daily branch uses the same expression when it needs to recover the captured date from an explicit run.

- [ ] **Step 7: Run identity/generator/init regressions**

```bash
bun run test:run \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/init.test.ts
```

Expected: PASS, including the existing literal `2026-08-12` generator-v1 fixture and rollover/Play Again tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/games/ice-slide/run.ts src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/daily.ts src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/init.ts
git commit -m "refactor(ice-slide): centralize Daily competition identity"
```

---

### Task 2: Put Ice Slide Daily score admission in pure domain code

**Files:**
- Modify: `src/lib/games/ice-slide/run.ts`
- Modify: `src/lib/games/ice-slide/run.test.ts`
- Modify: `src/pages/api/scores.ts`
- Modify: `src/pages/api/scores.test.ts`

**Interfaces:**

```ts
export function iceSlideDailyAdmissionError(
    context: {
        mode: string
        competitionKey?: string
        rulesetVersion: number
    } | undefined,
    gameData: Record<string, unknown> | undefined
): string | null
```

The route calls this only for `GameID.ICE_SLIDE`. Invalid semantic Daily claims return the existing HTTP 400 bad-request response and never call `saveGameScoreWithAchievements()`.

- [ ] **Step 1: Add pure admission fixtures to `run.test.ts`**

Define one valid payload:

```ts
const validDailyContext = {
    mode: 'daily',
    competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
    rulesetVersion: 1,
}

const validDailyGameData = {
    levelsCleared: 5,
    totalMoves: 31,
    crystalsCollected: 2,
    elapsedSeconds: 87,
    solved: true,
    perfectLevels: 3,
    mode: 'daily',
    runKey: 'ice-slide:daily:2026-08-12:g1:r1',
    runSchemaVersion: 1,
    generatorVersion: 1,
    rulesetVersion: 1,
    stagesTotal: 5,
    starsEarned: 13,
    falls: 0,
    resets: 0,
    stageSignatures: ['a', 'b', 'c', 'd', 'e'],
}
```

Assert the valid claim returns `null`, then cover every domain invariant:

```ts
it.each([
    ['missing context', undefined, validDailyGameData],
    ['unsolved', validDailyContext, { ...validDailyGameData, solved: false }],
    ['game-data mode mismatch', validDailyContext, { ...validDailyGameData, mode: 'expedition' }],
    ['context mode mismatch', { ...validDailyContext, mode: 'expedition' }, validDailyGameData],
    ['malformed competition key', { ...validDailyContext, competitionKey: 'ice-slide:daily:2026-02-29:g1:r1' }, { ...validDailyGameData, runKey: 'ice-slide:daily:2026-02-29:g1:r1' }],
    ['run-key mismatch', validDailyContext, { ...validDailyGameData, runKey: 'ice-slide:daily:2026-08-11:g1:r1' }],
    ['generator mismatch', validDailyContext, { ...validDailyGameData, generatorVersion: 2 }],
    ['game-data ruleset mismatch', validDailyContext, { ...validDailyGameData, rulesetVersion: 2 }],
    ['context ruleset mismatch', { ...validDailyContext, rulesetVersion: 2 }, validDailyGameData],
    ['negative elapsed', validDailyContext, { ...validDailyGameData, elapsedSeconds: -1 }],
    ['negative moves', validDailyContext, { ...validDailyGameData, totalMoves: -1 }],
])('rejects Daily admission: %s', (_name, context, gameData) => {
    expect(iceSlideDailyAdmissionError(context, gameData)).not.toBeNull()
})
```

Also cover missing `elapsedSeconds` and `totalMoves` by cloning/deleting those keys before calling the helper.

Finally assert a non-Daily Ice Slide payload such as `{ mode: 'expedition' }` + `{ mode: 'expedition' }` returns `null`; HPA-488 must not accidentally implement Expedition admission.

- [ ] **Step 2: Run the run suite and confirm red**

```bash
bun run test:run src/lib/games/ice-slide/run.test.ts
```

Expected: FAIL because `iceSlideDailyAdmissionError` does not exist.

- [ ] **Step 3: Implement the pure helper next to the parser**

Use one local integer guard and the parser from Task 1:

```ts
function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function iceSlideDailyAdmissionError(
    context: {
        mode: string
        competitionKey?: string
        rulesetVersion: number
    } | undefined,
    gameData: Record<string, unknown> | undefined
): string | null {
    const claimsDaily =
        context?.mode === 'daily' || gameData?.mode === 'daily'
    if (!claimsDaily) {
        return null
    }

    if (context?.mode !== 'daily' || !context.competitionKey || !gameData) {
        return 'Invalid Ice Slide Daily score data'
    }

    const identity = parseIceSlideDailyRunKey(context.competitionKey)
    if (
        !identity ||
        gameData.mode !== 'daily' ||
        gameData.solved !== true ||
        gameData.runKey !== context.competitionKey ||
        gameData.generatorVersion !== identity.generatorVersion ||
        gameData.rulesetVersion !== context.rulesetVersion ||
        context.rulesetVersion !== identity.rulesetVersion ||
        !isNonNegativeInteger(gameData.elapsedSeconds) ||
        !isNonNegativeInteger(gameData.totalMoves)
    ) {
        return 'Invalid Ice Slide Daily score data'
    }

    return null
}
```

Do not import `ScoreSubmissionInput`, `GameID`, server modules, or auth into `run.ts`.

- [ ] **Step 4: Add score-route red tests**

In `scores.test.ts`, add an Ice Slide game fixture and a valid request using the same payload. Assert 200 and the existing persistence call shape.

Add representative HTTP 400/no-persist cases for:

1. `solved:false`;
2. malformed but transport-safe `competitionKey='ice-slide:daily:2026-02-29:g1:r1'` with matching `gameData.runKey`;
3. `context.mode='daily'` with `gameData.mode='expedition'`;
4. `elapsedSeconds:-1` and `totalMoves:-1` — these are expected to be caught by generic Zod before domain admission, but still must return 400 and skip persistence.

Keep or add one non-Ice-Slide contextual score regression proving a generic Tetris scoped submission is still accepted; the route must dispatch Daily semantics only for `GameID.ICE_SLIDE`.

- [ ] **Step 5: Wire one route call before `PersistedScoreContext` construction**

Import `iceSlideDailyAdmissionError`. After game resolution:

```ts
if (validatedGameId === GameID.ICE_SLIDE) {
    const dailyAdmissionError = iceSlideDailyAdmissionError(context, gameData)
    if (dailyAdmissionError) {
        return badRequestResponse(dailyAdmissionError)
    }
}
```

Do not add a route-local semantic closure, new error code, stage regeneration, score recomputation, or board inspection.

- [ ] **Step 6: Run score/domain regressions**

```bash
bun run test:run \
  src/lib/games/ice-slide/run.test.ts \
  src/pages/api/scores.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/ice-slide/run.ts src/lib/games/ice-slide/run.test.ts \
  src/pages/api/scores.ts src/pages/api/scores.test.ts
git commit -m "feat(ice-slide): admit valid Daily scores only"
```

---

### Task 3: Require exact Daily reads and add privacy-safe viewer metadata

**Files:**
- Modify: `src/pages/api/leaderboard.ts`
- Modify: `src/pages/api/leaderboard.test.ts`

**Interfaces:**

- `getScopedGameLeaderboard()` remains:

```ts
getScopedGameLeaderboard({
    gameId,
    mode,
    competitionKey,
    limit,
})
```

No `rulesetVersion` field is added.

- Every scoped API row gains `isCurrentUser: boolean`.
- Every scoped API response gains `viewerAuthenticated: boolean`.
- Unscoped Campaign response shape remains unchanged.

- [ ] **Step 1: Update test mocks before adding new assertions**

In `leaderboard.test.ts`, extend the mocked `GameID` immediately:

```ts
GameID: {
    TETRIS: 'tetris',
    ICE_SLIDE: 'ice_slide',
},
```

Add the file-level auth mock, matching `scores.test.ts`:

```ts
vi.mock('@/lib/auth', () => ({
    auth: {
        api: {
            getSession: vi.fn(),
        },
    },
}))
```

Import `auth` for `vi.mocked(auth.api.getSession)` assertions.

Update `beforeEach()` so auth defaults to signed out:

```ts
vi.mocked(auth.api.getSession).mockResolvedValue(null)
```

Do this before writing Ice Slide assertions; otherwise importing real `auth.ts` requires secrets and the Tetris-only `GameID` mock makes the Daily branch unreachable.

- [ ] **Step 2: Update the existing scoped Tetris response assertion for additive viewer fields**

The current mode-only Tetris scoped request remains valid. Its response now intentionally contains:

```ts
expect(body.viewerAuthenticated).toBe(false)
expect(body.leaderboard).toEqual([
    {
        rank: 1,
        name: 'Player',
        username: 'player',
        image: null,
        score: 500,
        created_at: '2026-08-01T00:00:00.000Z',
        mode: 'daily',
        competitionKey: null,
        rulesetVersion: 2,
        elapsedSeconds: 12,
        totalMoves: 34,
        isCurrentUser: false,
    },
])
```

This is an additive scoped contract change. Do not weaken the unscoped shape assertions.

- [ ] **Step 3: Add Ice Slide Daily read-admission tests**

Mock an Ice Slide game entry and assert:

```text
GET /api/leaderboard?gameId=ice_slide&mode=daily
=> 400, query not called
```

```text
GET /api/leaderboard?gameId=ice_slide&mode=daily&competitionKey=ice-slide:daily:2026-02-29:g1:r1
=> 400, query not called
```

For a valid key:

```ts
expect(getScopedGameLeaderboard).toHaveBeenCalledWith({
    gameId: 'ice_slide',
    mode: 'daily',
    competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
    limit: 10,
})
```

Retain the existing generic mode-only Tetris test and assert it still forwards:

```ts
{
    gameId: 'tetris',
    mode: 'daily',
    competitionKey: undefined,
    limit: 10,
}
```

- [ ] **Step 4: Add authenticated, signed-out, and auth-failure viewer tests**

The route signature will use `{ url, request }`, so new scoped tests pass a real request:

```ts
const url = new URL(
    'http://localhost/api/leaderboard?gameId=ice_slide&mode=daily&competitionKey=ice-slide%3Adaily%3A2026-08-12%3Ag1%3Ar1'
)
const request = new Request(url)
const response = await GET({ url, request } as never)
```

For a private row `userId:'u1'`, mock:

```ts
vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'u1' },
    session: {},
} as never)
```

Assert:

```ts
expect(body.viewerAuthenticated).toBe(true)
expect(body.leaderboard[0]).toMatchObject({
    rank: 1,
    isCurrentUser: true,
})
expect(body.leaderboard[0]).not.toHaveProperty('userId')
```

Then cover:

- `getSession -> null`: 200, `viewerAuthenticated:false`, all `isCurrentUser:false`;
- `getSession` rejects: same public 200/false behavior;
- `GET ?gameId=ice_slide` unscoped: no `viewerAuthenticated`, no `isCurrentUser`, and auth lookup is not required.

- [ ] **Step 5: Run the API suite and confirm red**

```bash
bun run test:run src/pages/api/leaderboard.test.ts
```

Expected: the new exact-key and viewer-metadata assertions FAIL.

- [ ] **Step 6: Implement exact Ice Slide Daily admission without changing the query contract**

Change the route signature:

```ts
export const GET: APIRoute = async ({ url, request }) => {
```

Import `GameID`, `parseIceSlideDailyRunKey`, and `auth`.

Before the scoped query:

```ts
if (gameId === GameID.ICE_SLIDE && mode === 'daily') {
    if (!competitionKey) {
        return badRequestResponse(
            'competitionKey is required for Ice Slide Daily'
        )
    }
    if (!parseIceSlideDailyRunKey(competitionKey)) {
        return badRequestResponse('Invalid Ice Slide Daily competitionKey')
    }
}
```

Keep the existing call shape exactly:

```ts
const scoped = await getScopedGameLeaderboard({
    gameId,
    mode,
    competitionKey,
    limit,
})
```

- [ ] **Step 7: Add best-effort viewer lookup only after a successful scoped query**

Use a helper that tolerates older tests passing no `request`:

```ts
async function getViewerUserId(
    request: Request | undefined
): Promise<string | null> {
    if (!request) {
        return null
    }
    try {
        const session = await auth.api.getSession({ headers: request.headers })
        return session?.user.id ?? null
    } catch {
        return null
    }
}
```

After `scoped.success`:

```ts
const viewerUserId = await getViewerUserId(request)
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

Do not run auth lookup for unscoped responses and do not expose `userId`.

- [ ] **Step 8: Run API plus unchanged DB-ranking regressions**

```bash
bun run test:run \
  src/pages/api/leaderboard.test.ts \
  src/lib/server/db/scoped-leaderboard.integration.test.ts \
  src/lib/server/validations.test.ts
```

Expected: PASS. The DB file is included only to prove HPA-484's best-per-user/tie-break query remains unchanged and green.

- [ ] **Step 9: Commit**

```bash
git add src/pages/api/leaderboard.ts src/pages/api/leaderboard.test.ts
git commit -m "feat(ice-slide): scope Daily leaderboard reads"
```

---

### Task 4: Put Daily leaderboard async/render state in a unit-tested game module

**Files:**
- Create: `src/lib/games/ice-slide/daily-leaderboard.ts`
- Create: `src/lib/games/ice-slide/daily-leaderboard.test.ts`
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**

`IceSlideUICallbacks` gains:

```ts
onScoreSaved?: (gameData: IceSlideGameData) => void
```

The new module exports:

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

export interface DailyLeaderboardElements {
    panel: HTMLElement
    date: HTMLElement
    signedOut: HTMLElement
    loading: HTMLElement
    empty: HTMLElement
    unavailable: HTMLElement
    rows: HTMLElement
}

export interface DailyLeaderboardController {
    load: (competitionKey: string) => Promise<void>
    hide: () => void
}
```

Durable page IDs:

```text
daily-leaderboard
daily-leaderboard-date
daily-leaderboard-signed-out
daily-leaderboard-loading
daily-leaderboard-empty
daily-leaderboard-unavailable
daily-leaderboard-rows
```

- [ ] **Step 1: Add `init.test.ts` score-saved callback red tests**

Reuse the existing mocked `saveGameScore` and add:

1. current successful Daily save calls `onScoreSaved` once with the submitted `gameData`;
2. `UNAUTHENTICATED`/other score error never calls it;
3. if a newer run invalidates the run guard before the old success callback fires, the stale callback never reaches it.

Match at least:

```ts
expect(onScoreSaved).toHaveBeenCalledWith(
    expect.objectContaining({
        mode: 'daily',
        solved: true,
        runKey: 'ice-slide:daily:2026-08-12:g1:r1',
        rulesetVersion: 1,
    })
)
```

- [ ] **Step 2: Run `init.test.ts` and confirm red**

```bash
bun run test:run src/lib/games/ice-slide/init.test.ts
```

Expected: FAIL because the callback does not exist/fire.

- [ ] **Step 3: Add `onScoreSaved` and remove Ice Slide's duplicate formatter**

Import `IceSlideGameData` for the callback type and `formatTime` from `../shared/utils`. Delete the local `formatTime()` implementation from `init.ts`.

In the existing score success callback, after the stale check and achievement dispatch:

```ts
callbacks.onScoreSaved?.(gameData)
```

Do not fetch leaderboard data from `init.ts`.

- [ ] **Step 4: Write failing unit tests for `daily-leaderboard.ts`**

Create a jsdom fixture with all seven elements. Tests must cover:

```ts
expect(
    buildIceSlideDailyLeaderboardUrl(
        'ice-slide:daily:2026-08-12:g1:r1'
    )
).toBe(
    '/api/leaderboard?gameId=ice_slide&mode=daily&competitionKey=' +
        'ice-slide%3Adaily%3A2026-08-12%3Ag1%3Ar1&limit=10'
)

expect(formatDailyLeaderboardElapsed(null)).toBe('—')
expect(formatDailyLeaderboardElapsed(87)).toBe('1:27')
```

For row construction, assert a current-user row contains rank/name/formatted score/elapsed/moves plus literal `YOU`, and a non-current row does not contain `YOU`.

For state toggling, assert exactly one of loading/empty/unavailable/rows is visible for each `DailyLeaderboardPanelState`.

For the controller:

- a successful empty signed-out response shows panel/date/signed-out + empty state;
- a 503 shows unavailable without throwing;
- a delayed response resolved after `hide()` does not append rows or unhide the panel;
- a delayed older load resolved after a newer load cannot replace the newer date/rows.

- [ ] **Step 5: Run the new module suite and confirm red**

```bash
bun run test:run src/lib/games/ice-slide/daily-leaderboard.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 6: Implement the focused helper module**

Use `formatTime` from `../shared/utils`, `GameID.ICE_SLIDE`, and `parseIceSlideDailyRunKey`.

URL builder:

```ts
export function buildIceSlideDailyLeaderboardUrl(
    competitionKey: string
): string {
    return (
        `/api/leaderboard?gameId=${GameID.ICE_SLIDE}&mode=daily&` +
        `competitionKey=${encodeURIComponent(competitionKey)}&limit=10`
    )
}
```

Elapsed wrapper:

```ts
export function formatDailyLeaderboardElapsed(
    seconds: number | null
): string {
    return seconds === null ? '—' : formatTime(seconds)
}
```

State helper:

```ts
export function setDailyLeaderboardPanelState(
    elements: DailyLeaderboardElements,
    state: DailyLeaderboardPanelState
): void {
    elements.loading.classList.toggle('hidden', state !== 'loading')
    elements.empty.classList.toggle('hidden', state !== 'empty')
    elements.unavailable.classList.toggle('hidden', state !== 'unavailable')
    elements.rows.classList.toggle('hidden', state !== 'rows')
}
```

`createDailyLeaderboardRowElement()` must use `document.createElement`, `textContent`, and classes only; never `innerHTML`. Format scores with `toLocaleString()`. Render a literal `YOU` badge only for `isCurrentUser`.

Implement `createDailyLeaderboardController(elements, fetcher = fetch)` as one closure with `let requestToken = 0`:

```ts
export function createDailyLeaderboardController(
    elements: DailyLeaderboardElements,
    fetcher: typeof fetch = fetch
): DailyLeaderboardController {
    let requestToken = 0

    return {
        async load(competitionKey) {
            const identity = parseIceSlideDailyRunKey(competitionKey)
            if (!identity) {
                return
            }

            const token = ++requestToken
            elements.panel.classList.remove('hidden')
            elements.date.textContent = identity.dateKey
            elements.signedOut.classList.add('hidden')
            setDailyLeaderboardPanelState(elements, 'loading')

            try {
                const response = await fetcher(
                    buildIceSlideDailyLeaderboardUrl(competitionKey)
                )
                if (token !== requestToken) {
                    return
                }
                if (!response.ok) {
                    setDailyLeaderboardPanelState(elements, 'unavailable')
                    return
                }

                const data =
                    (await response.json()) as DailyLeaderboardResponse
                if (token !== requestToken) {
                    return
                }

                while (elements.rows.firstChild) {
                    elements.rows.removeChild(elements.rows.firstChild)
                }
                for (const entry of data.leaderboard) {
                    elements.rows.appendChild(
                        createDailyLeaderboardRowElement(entry, document)
                    )
                }
                elements.signedOut.classList.toggle(
                    'hidden',
                    data.viewerAuthenticated
                )
                setDailyLeaderboardPanelState(
                    elements,
                    data.leaderboard.length > 0 ? 'rows' : 'empty'
                )
            } catch {
                if (token === requestToken) {
                    setDailyLeaderboardPanelState(elements, 'unavailable')
                }
            }
        },

        hide() {
            requestToken += 1
            elements.panel.classList.add('hidden')
        },
    }
}
```

Do not add `AbortController`, a store, event bus, class hierarchy, or generic leaderboard abstraction.

- [ ] **Step 7: Add the static Astro card and structural markup assertions**

Place below `#daily-meta`:

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

Add all seven IDs to `src/pages/game-board-markup.test.ts`. Keep that test structural; behavior belongs in `daily-leaderboard.test.ts` and Playwright.

- [ ] **Step 8: Make the Astro script wiring-only**

Import:

```ts
import {
  createDailyLeaderboardController,
  type DailyLeaderboardElements,
} from '@/lib/games/ice-slide/daily-leaderboard'
import {
  createIceSlideDailyCompetitionKey,
  toIceSlideUtcDateKey,
} from '@/lib/games/ice-slide/daily'
```

Query the seven elements, build `DailyLeaderboardElements`, and instantiate one controller. Keep page helpers limited to identity handoff:

```ts
const currentUtcDailyKey = () =>
  createIceSlideDailyCompetitionKey(toIceSlideUtcDateKey(new Date()))

const loadCurrentDailyLeaderboard = () =>
  dailyLeaderboardController.load(currentUtcDailyKey())

const loadCapturedDailyLeaderboard = () => {
  const state = gameHandle?.getGame()?.getState()
  if (state?.mode === 'daily') {
    void dailyLeaderboardController.load(state.runKey)
  }
}
```

Wire exact transitions:

- after initialization, if selected radio is Daily, load today's key;
- idle radio change to Daily -> load today's key;
- idle radio change to Campaign -> `hide()`;
- after successful `await gameHandle.start('daily')` -> load captured `state.runKey`;
- after successful Daily `playAgain()` -> load captured `state.runKey`;
- `onScoreSaved(gameData)` -> if `gameData.mode === 'daily'`, load `gameData.runKey`;
- Change Mode -> return to idle controls; if selected radio is Daily load today's current key, otherwise hide;
- leaderboard errors remain inside the controller and never touch `#game-error`/`failRun`.

This keeps rollover behavior correct: in-progress/post-save refresh uses captured identity; idle selection uses the current UTC identity.

- [ ] **Step 9: Run focused DOM/client/init suites**

```bash
bun run test:run \
  src/lib/games/ice-slide/init.test.ts \
  src/lib/games/ice-slide/daily-leaderboard.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS, including stale-response tests before browser coverage runs.

- [ ] **Step 10: Commit**

```bash
git add src/lib/games/ice-slide/init.ts src/lib/games/ice-slide/init.test.ts \
  src/lib/games/ice-slide/daily-leaderboard.ts \
  src/lib/games/ice-slide/daily-leaderboard.test.ts \
  src/pages/ice-slide/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(ice-slide): show Daily leaderboard"
```

---

### Task 5: Lock the frozen Daily playthrough before using it in Playwright

**Files:**
- Modify: `src/lib/games/ice-slide/daily.test.ts`
- Modify: `e2e/games/play-coverage.spec.ts`

**Interfaces:**
- Consumes the exact HPA-487 generator-v1 fixture for `2026-08-12`.
- No production interface changes.

- [ ] **Step 1: Add a unit replay for the exact five browser sequences**

In `daily.test.ts`, import `IceSlideGame` and `Direction`. Lock the exact directions:

```ts
const DAILY_2026_08_12_DIRECTIONS: readonly (readonly Direction[])[] = [
    ['S', 'E', 'S'],
    ['N', 'W', 'N', 'W'],
    ['W', 'N', 'E', 'S', 'W', 'N'],
    ['S', 'W', 'N', 'E', 'S', 'W'],
    ['E', 'S', 'W', 'N', 'E', 'S'],
]
```

Replay them through the real game/runtime contract:

```ts
it('locks the 2026-08-12 browser playthrough against the materialized Daily', () => {
    const run = createIceSlideDailyRunDefinition('2026-08-12')
    const game = new IceSlideGame()

    try {
        game.start(run)
        for (const [stageIndex, directions] of
            DAILY_2026_08_12_DIRECTIONS.entries()) {
            expect(directions).toHaveLength(run.stages[stageIndex].parMoves)
            for (const direction of directions) {
                game.move(direction)
            }
        }

        expect(game.getState().status).toBe('won')
        expect(game.getGameData()).toMatchObject({
            mode: 'daily',
            runKey: 'ice-slide:daily:2026-08-12:g1:r1',
            solved: true,
            levelsCleared: 5,
        })
    } finally {
        game.destroy()
    }
})
```

Stages 3 and 4 have `collect_all_crystals` as an optional bonus. The test requires a completed run, not all optional stars; this directly validates the same crystal-mutating runtime that Playwright will drive.

- [ ] **Step 2: Run the unit fixture before adding browser dependence**

```bash
bun run test:run src/lib/games/ice-slide/daily.test.ts
```

Expected: PASS. If any sequence is wrong, correct it here first; do not discover the mistake for the first time in Playwright.

- [ ] **Step 3: Add the matching Playwright helper**

Use the exact arrow-key translation of the unit fixture:

```ts
const DAILY_2026_08_12_SOLUTIONS = [
    ['ArrowDown', 'ArrowRight', 'ArrowDown'],
    ['ArrowUp', 'ArrowLeft', 'ArrowUp', 'ArrowLeft'],
    ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'],
    ['ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'],
    ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'],
] as const

async function completeFrozenDaily(page: Page): Promise<void> {
    for (let stage = 0; stage < DAILY_2026_08_12_SOLUTIONS.length; stage++) {
        for (const key of DAILY_2026_08_12_SOLUTIONS[stage]) {
            await page.keyboard.press(key)
        }
        if (stage < DAILY_2026_08_12_SOLUTIONS.length - 1) {
            await expect(page.locator('#stage-clear-overlay')).toBeVisible()
            await page.locator('#stage-clear-continue-btn').click()
        }
    }
    await expect(page.locator('#game-over-overlay')).toBeVisible()
}
```

- [ ] **Step 4: Cover signed-out/empty and ranked-current-user rendering**

With fixed time `2026-08-12T20:00:00Z`, intercept `**/api/leaderboard?*`.

Empty signed-out response:

```json
{
  "gameId": "ice_slide",
  "gameName": "Ice Slide",
  "viewerAuthenticated": false,
  "leaderboard": []
}
```

Assert the request contains exact competition key `ice-slide:daily:2026-08-12:g1:r1`, the empty state is visible, and the sign-in note is visible.

Current-user row response:

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

Assert rows show `1`, `Pilot`, `4,321`, `1:27`, `31`, and visible `YOU` text.

- [ ] **Step 5: Cover unavailable ranking without blocking play**

Return status 503 with the normal scoped-unavailable body. Assert `#daily-leaderboard-unavailable` is visible, then start Daily and verify the Pixi canvas and `#end-btn` remain usable. `#game-error` must stay hidden for a leaderboard-only failure.

- [ ] **Step 6: Cover successful-submit refresh on the captured key**

Mock `/api/scores` with a 200 success body and count leaderboard requests. Start the fixed-date Daily, record the request count, call `completeFrozenDaily(page)`, then assert a later request occurs and its `competitionKey` remains:

```text
ice-slide:daily:2026-08-12:g1:r1
```

Inspect the POST once and assert:

```ts
context.mode === 'daily'
context.competitionKey === 'ice-slide:daily:2026-08-12:g1:r1'
gameData.solved === true
```

This proves `onScoreSaved` refreshes the captured competition rather than recomputing today's identity.

- [ ] **Step 7: Keep one browser integration proof for stale suppression**

Delay one Daily leaderboard response. While pending, switch the idle mode selection to Campaign. Release the old response and assert:

- `#daily-leaderboard` remains hidden;
- delayed row text never appears;
- Campaign remains selectable/startable.

The detailed request-token semantics are already red/green in `daily-leaderboard.test.ts`; this test proves page wiring invokes invalidation correctly.

- [ ] **Step 8: Run focused Ice Slide browser coverage**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Expected: all existing HPA-487 cases plus the new leaderboard cases PASS.

- [ ] **Step 9: Run focused unit/API/integration suites once more**

```bash
bun run test:run \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/init.test.ts \
  src/lib/games/ice-slide/daily-leaderboard.test.ts \
  src/lib/server/db/scoped-leaderboard.integration.test.ts \
  src/pages/api/scores.test.ts \
  src/pages/api/leaderboard.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 10: Run full repository verification**

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

- [ ] **Step 11: Commit the deterministic fixture and E2E coverage**

```bash
git add src/lib/games/ice-slide/daily.test.ts e2e/games/play-coverage.spec.ts
git commit -m "test(ice-slide): cover Daily leaderboard flows"
```

---

## Plan self-review

- **Spec coverage:** Daily identity/admission, exact-key read isolation, unchanged best-per-user ranking, viewer highlighting, signed-out/loading/empty/unavailable states, successful-save refresh, stale suppression, Campaign compatibility, and failure isolation each map to a concrete task.
- **Parser consistency:** `assertValidIceSlideRunDefinition`, `init.ts`, score admission, leaderboard admission, and client identity display all consume `parseIceSlideDailyRunKey`; `extractDailyDateKey` is removed.
- **Query consistency:** no `ScopedLeaderboardQuery.rulesetVersion` field or duplicate ruleset filter is introduced; exact competition key is the Daily scope.
- **Test seams:** score semantics live in a pure helper; async page behavior lives in `daily-leaderboard.ts`; the frozen browser keypresses are validated by a unit replay before Playwright.
- **Existing-test compatibility:** the plan explicitly mocks `@/lib/auth`, adds `GameID.ICE_SLIDE`, threads `request`, and updates the existing scoped Tetris response for additive viewer fields.
- **Placeholder scan:** no TBD/TODO/future implementation step remains.
- **Scope check:** no schema, endpoint family, shared UI abstraction, replay verifier, historical browser, Expedition ranking, read repair, or current-user rank query has entered the plan.
