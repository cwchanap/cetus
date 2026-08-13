# Ice Slide Daily Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit only valid completed Ice Slide Daily scores, rank one best result per player for the exact Daily competition, and show/refetch that ranking on the Ice Slide page without changing Campaign behavior.

**Architecture:** Reuse HPA-484's existing score-context persistence and `getScopedGameLeaderboard()` window query. Ice Slide-specific semantic admission stays at the existing score/leaderboard API boundary; the Ice Slide page owns one static Astro leaderboard card and a small request-token loader, while `init.ts` only reports a successful score save through an additive callback.

**Tech Stack:** Astro 5, TypeScript, Tailwind CSS 4, Better Auth, Kysely + LibSQL/Turso, Vitest, Playwright, Bun 1.3.1.

## Global Constraints

- Keep `/api/leaderboard?gameId=ice_slide` on the existing unscoped Campaign response path.
- Daily competition keys remain `ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>` and use UTC dates.
- Daily ranking order remains score DESC, elapsed seconds ASC, total moves ASC, submission time ASC; row ID is only the existing final deterministic fallback for exact ties.
- Repeated attempts remain stored; only the existing best-per-user query chooses the displayed row.
- Do not add database schema, a new endpoint, a best-score cache/table, a generic mode registry, a shared leaderboard component, or an auth preflight request.
- Do not add replay verification, score recomputation, historical Daily navigation, Expedition ranking, or current-user rank lookup beyond returned rows.
- Astro owns durable HTML; client TypeScript may only update/toggle existing structure and create leaderboard row children without `innerHTML`.
- Leaderboard or viewer-auth lookup failure must never enter the Ice Slide `failRun` path or invalidate a local result.
- Preserve HPA-487's captured Daily run identity across UTC rollover and Play Again.
- Keep existing remote Codecov project/patch coverage requirements at 95%.

---

## File map

No new production module is needed.

- `src/lib/games/ice-slide/run.ts` — parse the already-frozen Daily run-key identity.
- `src/lib/games/ice-slide/daily.ts` — centralize construction of the already-frozen Daily competition key.
- `src/pages/api/scores.ts` — reject invalid Ice Slide Daily claims before persistence.
- `src/lib/server/db/scoped-leaderboard.ts` — optionally constrain an existing scoped query to one ruleset version.
- `src/pages/api/leaderboard.ts` — require exact Ice Slide Daily identity and add viewer metadata only to scoped responses.
- `src/lib/games/ice-slide/init.ts` — report a successful, non-stale score save to the page.
- `src/pages/ice-slide/index.astro` — static Daily leaderboard card plus page-local fetch/render/staleness logic.
- Existing colocated tests and `e2e/games/play-coverage.spec.ts` — contract and browser coverage.

---

### Task 1: Freeze one Daily competition-identity seam

**Files:**
- Modify: `src/lib/games/ice-slide/run.ts`
- Modify: `src/lib/games/ice-slide/run.test.ts`
- Modify: `src/lib/games/ice-slide/daily.ts`
- Modify: `src/lib/games/ice-slide/daily.test.ts`

**Interfaces:**
- Produces:

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

- `createIceSlideDailyRunDefinition(dateKey)` must continue producing byte-equivalent generator-v1 run keys and seeds.

- [ ] **Step 1: Write failing parser tests in `run.test.ts`**

Add the parser import and lock valid identity plus malformed/calendar-invalid keys:

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
    'daily:2026-08-12:g1:r1',
])('rejects invalid Daily competition key %s', runKey => {
    expect(parseIceSlideDailyRunKey(runKey)).toBeNull()
})
```

- [ ] **Step 2: Run the focused run tests and confirm red**

Run:

```bash
bun run test:run src/lib/games/ice-slide/run.test.ts
```

Expected: FAIL because `parseIceSlideDailyRunKey` is not exported.

- [ ] **Step 3: Implement the parser and reuse it in Daily run validation**

In `run.ts`, keep `DAILY_KEY_PATTERN` as the single syntax regex and add:

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

    try {
        assertValidIceSlideUtcDateKey(match[1])
    } catch {
        return null
    }

    return {
        dateKey: match[1],
        generatorVersion: Number(match[2]),
        rulesetVersion: Number(match[3]),
    }
}
```

Replace the Daily branch's independent numeric extraction with the parsed identity:

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

- [ ] **Step 4: Add the competition-key helper test in `daily.test.ts`**

```ts
it('builds the frozen generator-v1 Daily competition key', () => {
    expect(createIceSlideDailyCompetitionKey('2026-08-12')).toBe(
        'ice-slide:daily:2026-08-12:g1:r1'
    )
})
```

The existing generator-v1 fixture must remain unchanged.

- [ ] **Step 5: Implement `createIceSlideDailyCompetitionKey()` and use it in the run materializer**

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

Then replace only the `runKey` literal construction:

```ts
runKey: createIceSlideDailyCompetitionKey(dateKey),
```

Do not change the Daily seed, fork labels, stage pools, transform/objective selection, or version constants.

- [ ] **Step 6: Run both focused suites**

```bash
bun run test:run src/lib/games/ice-slide/run.test.ts src/lib/games/ice-slide/daily.test.ts
```

Expected: PASS, including the existing literal `2026-08-12` generator-v1 fixture.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/ice-slide/run.ts src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/daily.ts src/lib/games/ice-slide/daily.test.ts
git commit -m "refactor(ice-slide): centralize Daily competition identity"
```

---

### Task 2: Reject invalid Ice Slide Daily score claims before persistence

**Files:**
- Modify: `src/pages/api/scores.ts`
- Modify: `src/pages/api/scores.test.ts`

**Interfaces:**
- Consumes: `parseIceSlideDailyRunKey()` from Task 1 and the existing `ScoreSubmissionInput` shape.
- Produces: no new endpoint or public error code; invalid semantic Daily claims return the existing HTTP 400 bad-request response and never call `saveGameScoreWithAchievements()`.

- [ ] **Step 1: Add one valid Daily admission fixture to `scores.test.ts`**

Use the real `GameID.ICE_SLIDE` and a game fixture whose ID is `ice_slide`. The accepted request body is:

```ts
const dailyGameData = {
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

const body = {
    gameId: 'ice_slide',
    score: 4321,
    gameData: dailyGameData,
    context: {
        mode: 'daily',
        competitionKey: dailyGameData.runKey,
        rulesetVersion: 1,
    },
}
```

Assert 200 and that persistence receives exactly that game data plus:

```ts
{
    mode: 'daily',
    competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
    rulesetVersion: 1,
    gameDataJson: JSON.stringify(dailyGameData),
}
```

- [ ] **Step 2: Add a table of invalid Daily claims**

Each case must return 400 and leave `saveGameScoreWithAchievements` uncalled:

```ts
it.each([
    ['missing context', body => ({ ...body, context: undefined })],
    ['unsolved', body => ({ ...body, gameData: { ...body.gameData, solved: false } })],
    ['game-data mode mismatch', body => ({ ...body, gameData: { ...body.gameData, mode: 'expedition' } })],
    ['context mode mismatch', body => ({ ...body, context: { ...body.context, mode: 'expedition' } })],
    ['run-key mismatch', body => ({ ...body, gameData: { ...body.gameData, runKey: 'ice-slide:daily:2026-08-11:g1:r1' } })],
    ['generator mismatch', body => ({ ...body, gameData: { ...body.gameData, generatorVersion: 2 } })],
    ['game-data ruleset mismatch', body => ({ ...body, gameData: { ...body.gameData, rulesetVersion: 2 } })],
    ['context ruleset mismatch', body => ({ ...body, context: { ...body.context, rulesetVersion: 2 } })],
    ['missing elapsed metric', body => {
        const gameData = { ...body.gameData }
        delete gameData.elapsedSeconds
        return { ...body, gameData }
    }],
    ['missing move metric', body => {
        const gameData = { ...body.gameData }
        delete gameData.totalMoves
        return { ...body, gameData }
    }],
])('rejects Ice Slide Daily claim: %s', async (_name, mutate) => {
    // clone the valid body, mutate one semantic invariant, POST it,
    // expect status 400 and no persistence call.
})
```

Also add an explicit case where `context.mode='daily'` and `gameData.mode='expedition'` so an Expedition payload cannot enter Daily ranking by context spoofing.

- [ ] **Step 3: Run the API suite and confirm the invalid cases are currently green-to-save or otherwise fail expectations**

```bash
bun run test:run src/pages/api/scores.test.ts
```

Expected: the new semantic-admission assertions FAIL because the route currently persists transport-valid Daily claims without comparing their identities.

- [ ] **Step 4: Add a local semantic validator to `scores.ts`**

Keep it in the route file because HPA-488 has one caller:

```ts
function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function validateIceSlideDailyClaim(
    gameId: GameID,
    context: ScoreSubmissionInput['context'],
    gameData: ScoreSubmissionInput['gameData']
): string | null {
    if (gameId !== GameID.ICE_SLIDE) {
        return null
    }

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

Import `ScoreSubmissionInput` and `parseIceSlideDailyRunKey`. After `getGameById()` succeeds and before building `PersistedScoreContext`:

```ts
const dailyAdmissionError = validateIceSlideDailyClaim(
    validatedGameId,
    context,
    gameData
)
if (dailyAdmissionError) {
    return badRequestResponse(dailyAdmissionError)
}
```

Do not regenerate the Daily, recompute score, inspect stage rows, or introduce a new error-code branch.

- [ ] **Step 5: Run score API and score-service regressions**

```bash
bun run test:run src/pages/api/scores.test.ts src/lib/services/scoreService.test.ts
```

Expected: PASS. Existing non-Ice-Slide and Campaign score requests remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/scores.ts src/pages/api/scores.test.ts
git commit -m "feat(ice-slide): admit valid Daily scores only"
```

---

### Task 3: Constrain Daily reads and add private viewer matching

**Files:**
- Modify: `src/lib/server/db/scoped-leaderboard.ts`
- Modify: `src/lib/server/db/scoped-leaderboard.integration.test.ts`
- Modify: `src/pages/api/leaderboard.ts`
- Modify: `src/pages/api/leaderboard.test.ts`

**Interfaces:**
- Extends:

```ts
export interface ScopedLeaderboardQuery {
    gameId: string
    mode: string
    competitionKey?: string
    rulesetVersion?: number
    limit?: number
}
```

- Scoped API rows gain `isCurrentUser: boolean`.
- Scoped API response gains `viewerAuthenticated: boolean`.
- Unscoped Campaign response shape remains unchanged.

- [ ] **Step 1: Add a real-LibSQL exact-ruleset regression**

Extend the integration seed helper if necessary to use `gameId: 'ice_slide'`, then insert two users under the same exact competition key with different stored ruleset versions. Query:

```ts
const result = await getScopedGameLeaderboard({
    gameId: 'ice_slide',
    mode: 'daily',
    competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
    rulesetVersion: 1,
    limit: 10,
})
```

Assert only the `ruleset_version=1` row is returned. Do not duplicate the existing score/elapsed/moves/created-at tie-break matrix; those HPA-484 tests remain authoritative.

- [ ] **Step 2: Run the integration test and confirm red**

```bash
bun run test:run src/lib/server/db/scoped-leaderboard.integration.test.ts
```

Expected: FAIL because the query contract does not accept/apply `rulesetVersion` yet.

- [ ] **Step 3: Add the optional SQL ruleset predicate**

In `scoped-leaderboard.ts`:

```ts
const rulesetFilter =
    query.rulesetVersion === undefined
        ? sql``
        : sql`AND gs.ruleset_version = ${query.rulesetVersion}`
```

Apply it in the `scoped` CTE beside the existing game/mode/competition predicates:

```sql
AND gs.ruleset_version IS NOT NULL
${competitionFilter}
${rulesetFilter}
```

When omitted, behavior must remain byte-for-byte equivalent to HPA-484's generic scoped query.

- [ ] **Step 4: Add Ice Slide Daily API admission tests**

Update the game mock to expose both `tetris` and `ice_slide`. Add tests that:

```ts
// Missing exact key is rejected only for Ice Slide Daily.
GET /api/leaderboard?gameId=ice_slide&mode=daily -> 400

// Invalid/calendar-invalid exact key is rejected.
GET /api/leaderboard?gameId=ice_slide&mode=daily&competitionKey=ice-slide:daily:2026-02-29:g1:r1 -> 400

// Exact key forwards its parsed ruleset.
expect(getScopedGameLeaderboard).toHaveBeenCalledWith({
    gameId: 'ice_slide',
    mode: 'daily',
    competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
    rulesetVersion: 1,
    limit: 10,
})

// Existing generic mode-only Tetris request remains legal and forwards no ruleset.
```

- [ ] **Step 5: Add viewer-metadata tests before implementation**

Mock `@/lib/auth`. For a scoped row with private `userId: 'u1'`:

```ts
vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'u1' },
    session: {},
} as never)
```

Call `GET` with a real `Request` and assert:

```ts
expect(body.viewerAuthenticated).toBe(true)
expect(body.leaderboard[0]).toMatchObject({
    isCurrentUser: true,
    rank: 1,
})
expect(body.leaderboard[0]).not.toHaveProperty('userId')
```

Add signed-out (`getSession -> null`) and auth-lookup-rejection cases; both must still return the public leaderboard with `viewerAuthenticated:false` and `isCurrentUser:false`.

Also assert an unscoped `?gameId=ice_slide` response does **not** gain `viewerAuthenticated` or `isCurrentUser`.

- [ ] **Step 6: Run the API suite and confirm red**

```bash
bun run test:run src/pages/api/leaderboard.test.ts
```

Expected: new Ice Slide admission and viewer metadata tests FAIL.

- [ ] **Step 7: Implement the Ice Slide Daily branch and optional viewer lookup**

Import `GameID`, `parseIceSlideDailyRunKey`, and `auth`. Add a small best-effort helper:

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

In the scoped branch:

```ts
let rulesetVersion: number | undefined
if (gameId === GameID.ICE_SLIDE && mode === 'daily') {
    if (!competitionKey) {
        return badRequestResponse(
            'competitionKey is required for Ice Slide Daily'
        )
    }
    const identity = parseIceSlideDailyRunKey(competitionKey)
    if (!identity) {
        return badRequestResponse('Invalid Ice Slide Daily competitionKey')
    }
    rulesetVersion = identity.rulesetVersion
}

const scoped = await getScopedGameLeaderboard({
    gameId,
    mode,
    competitionKey,
    rulesetVersion,
    limit,
})
```

After a successful query:

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

Do not run session lookup for unscoped responses.

- [ ] **Step 8: Run all scoped query/API regressions**

```bash
bun run test:run \
  src/lib/server/db/scoped-leaderboard.integration.test.ts \
  src/pages/api/leaderboard.test.ts \
  src/lib/server/validations.test.ts
```

Expected: PASS, including existing generic Tetris mode-only behavior and unscoped response contracts.

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/db/scoped-leaderboard.ts \
  src/lib/server/db/scoped-leaderboard.integration.test.ts \
  src/pages/api/leaderboard.ts src/pages/api/leaderboard.test.ts
git commit -m "feat(ice-slide): scope Daily leaderboard reads"
```

---

### Task 4: Refresh the page-local Daily leaderboard after successful saves

**Files:**
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**
- Extends `IceSlideUICallbacks` with:

```ts
onScoreSaved?: (gameData: IceSlideGameData) => void
```

- Adds durable page IDs:

```text
daily-leaderboard
daily-leaderboard-date
daily-leaderboard-signed-out
daily-leaderboard-loading
daily-leaderboard-empty
daily-leaderboard-unavailable
daily-leaderboard-rows
```

- [ ] **Step 1: Add `init.test.ts` callback-order/staleness tests**

Reuse the existing mocked `saveGameScore`. Add three focused assertions:

1. current successful Daily save calls `onScoreSaved` once with `game.getGameData()`;
2. score error/`UNAUTHENTICATED` never calls `onScoreSaved`;
3. if a new run invalidates the run guard before the old success callback fires, the stale callback never reaches `onScoreSaved`.

The success assertion should match at least:

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

- [ ] **Step 2: Run the focused init suite and confirm red**

```bash
bun run test:run src/lib/games/ice-slide/init.test.ts
```

Expected: FAIL because `onScoreSaved` does not exist/fire.

- [ ] **Step 3: Add the optional callback in `init.ts`**

Import `IceSlideGameData` for the callback type. In the existing score success callback, after the stale guard and achievement dispatch:

```ts
callbacks.onScoreSaved?.(gameData)
```

Do not issue a leaderboard fetch from `init.ts`; network/display ownership stays on the Astro page.

- [ ] **Step 4: Add the static Astro leaderboard card**

Place it directly below `#daily-meta` so it follows the Daily brief without covering the Pixi board:

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
  <p id="daily-leaderboard-loading" class="mt-3 text-sm text-cetus-ink-muted">Loading ranking…</p>
  <p id="daily-leaderboard-empty" class="hidden mt-3 text-sm text-cetus-ink-muted">No ranked finishes yet.</p>
  <p id="daily-leaderboard-unavailable" class="hidden mt-3 text-sm text-cetus-ink-muted">Ranking is temporarily unavailable.</p>
  <div id="daily-leaderboard-rows" class="hidden mt-3 space-y-2"></div>
</Card>
```

Add all seven IDs to `src/pages/game-board-markup.test.ts`; keep the test structural and do not assert client source text.

- [ ] **Step 5: Add page-local response types and formatting helpers**

Inside the existing client script:

```ts
type DailyLeaderboardEntry = {
  rank: number
  name: string
  score: number
  elapsedSeconds: number | null
  totalMoves: number | null
  isCurrentUser: boolean
}

type DailyLeaderboardResponse = {
  viewerAuthenticated: boolean
  leaderboard: DailyLeaderboardEntry[]
}

const formatElapsed = (seconds: number | null) => {
  if (seconds === null) return '—'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}
```

Query all seven static elements during `init()` and include them in the existing required-element guard.

- [ ] **Step 6: Implement token-based load/render logic without `innerHTML`**

Maintain exactly one page-local counter:

```ts
let leaderboardRequestToken = 0
```

A load increments/captures it and uses the exact key:

```ts
const loadDailyLeaderboard = async (competitionKey: string) => {
  const token = ++leaderboardRequestToken
  const identity = parseIceSlideDailyRunKey(competitionKey)
  if (!identity) return

  dailyLeaderboard.classList.remove('hidden')
  dailyLeaderboardDate.textContent = identity.dateKey
  setLeaderboardState('loading')

  try {
    const response = await fetch(
      `/api/leaderboard?gameId=ice_slide&mode=daily&competitionKey=${encodeURIComponent(competitionKey)}&limit=10`
    )
    if (token !== leaderboardRequestToken) return
    if (!response.ok) {
      setLeaderboardState('unavailable')
      return
    }

    const data = (await response.json()) as DailyLeaderboardResponse
    if (token !== leaderboardRequestToken) return
    renderLeaderboardRows(data.leaderboard)
    dailyLeaderboardSignedOut.classList.toggle(
      'hidden',
      data.viewerAuthenticated
    )
    setLeaderboardState(data.leaderboard.length ? 'rows' : 'empty')
  } catch {
    if (token === leaderboardRequestToken) {
      setLeaderboardState('unavailable')
    }
  }
}
```

`renderLeaderboardRows()` must clear children with `while (firstChild) removeChild(firstChild)` and construct each row with `document.createElement`, `textContent`, and classes. For `entry.isCurrentUser`, render a literal `YOU` badge plus a stronger border/background class; otherwise render no badge.

`setLeaderboardState()` toggles only the four state containers (`loading`, `empty`, `unavailable`, `rows`). It must not hide the game board, Daily result overlay, or error surface.

- [ ] **Step 7: Wire selection, captured run identity, success refresh, and invalidation**

Import `createIceSlideDailyCompetitionKey`, `toIceSlideUtcDateKey`, and `parseIceSlideDailyRunKey` into the page script.

Use these exact transitions:

```ts
const currentUtcDailyKey = () =>
  createIceSlideDailyCompetitionKey(toIceSlideUtcDateKey(new Date()))

const invalidateLeaderboard = () => {
  leaderboardRequestToken += 1
  dailyLeaderboard.classList.add('hidden')
}
```

- after `initializeIceSlide()` resolves, load `currentUtcDailyKey()` only when the selected radio is Daily;
- on a radio change to Daily while idle, load the current UTC key;
- on a radio change to Campaign, call `invalidateLeaderboard()`;
- after `await gameHandle.start('daily')`, read `gameHandle.getGame()?.getState().runKey` and load that captured key;
- after `await gameHandle.playAgain()` in Daily, reload the returned state's same captured key;
- implement `onScoreSaved(gameData)` and call `loadDailyLeaderboard(gameData.runKey)` only for `gameData.mode === 'daily'`;
- Change Mode returns to idle controls, then shows/loads the leaderboard only if the still-selected radio is Daily; choosing Campaign hides it;
- `cleanup()`/page unload naturally invalidates by leaving the page; no global listener/store is added.

This guarantees a run started before rollover refreshes its original competition instead of today's newly computed key.

- [ ] **Step 8: Run focused DOM/init regressions**

```bash
bun run test:run \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/games/ice-slide/init.ts src/lib/games/ice-slide/init.test.ts \
  src/pages/ice-slide/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(ice-slide): show Daily leaderboard"
```

---

### Task 5: Lock browser flows and run the repository gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`

**Interfaces:**
- Consumes the exact HPA-487 generator-v1 fixture for `2026-08-12`.
- No production interface changes.

- [ ] **Step 1: Add a helper that completes the frozen `2026-08-12` Daily**

The existing generator-v1 fixture has five minimum solutions. Keep this helper in the Ice Slide Playwright section so a generator-version bump forces a deliberate test update:

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

- [ ] **Step 2: Cover signed-out + empty and required row rendering with mocked leaderboard responses**

Use `page.clock.setFixedTime(new Date('2026-08-12T20:00:00Z'))` and `page.route('**/api/leaderboard?*', ...)`.

First return:

```json
{
  "gameId": "ice_slide",
  "gameName": "Ice Slide",
  "viewerAuthenticated": false,
  "leaderboard": []
}
```

Assert the request contains the exact key `ice-slide:daily:2026-08-12:g1:r1`, the empty state is visible, and the signed-out copy is visible.

In a second test return one row:

```json
{
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

Assert `#daily-leaderboard-rows` shows rank `1`, `Pilot`, `4,321`, `1:27`, `31`, and visible `YOU` text.

- [ ] **Step 3: Cover unavailable-with-playability**

Fulfill the leaderboard route with status 503 and the normal coded error body. Assert `#daily-leaderboard-unavailable` becomes visible, then start Daily and verify the Pixi canvas plus `#end-btn` are still usable. Do not expect the generic `#game-error` surface for a leaderboard-only failure.

- [ ] **Step 4: Cover successful-submit refresh on the captured key**

Mock `/api/scores` with a 200 success body and count leaderboard requests. Start fixed-date Daily, capture the current leaderboard request count, call `completeFrozenDaily(page)`, then:

```ts
await expect.poll(() => leaderboardRequestCount).toBeGreaterThan(beforeCompletion)
expect(lastCompetitionKey).toBe(
    'ice-slide:daily:2026-08-12:g1:r1'
)
```

The POST body should also be inspected once to prove the completed submission carries `context.mode='daily'`, the same competition key, and `gameData.solved=true`.

- [ ] **Step 5: Cover stale leaderboard suppression**

Delay one Daily leaderboard response with a promise. While it is pending, switch the idle mode selection to Campaign. Release the old response and assert `#daily-leaderboard` remains hidden and the delayed row text never appears. This is the browser proof for the request-token guard; do not add `AbortController` only for the test.

- [ ] **Step 6: Run focused Ice Slide browser coverage**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Expected: all existing HPA-487 cases plus the new leaderboard cases PASS.

- [ ] **Step 7: Run focused unit/integration suites once more**

```bash
bun run test:run \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/init.test.ts \
  src/lib/server/db/scoped-leaderboard.integration.test.ts \
  src/pages/api/scores.test.ts \
  src/pages/api/leaderboard.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run full repository verification**

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
- local coverage does not regress the repository below the configured 95% project target; remote Codecov project and patch checks remain authoritative after push.

- [ ] **Step 9: Commit the E2E coverage**

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(ice-slide): cover Daily leaderboard flows"
```

---

## Plan self-review

- **Spec coverage:** Daily admission, exact competition/ruleset isolation, best-per-user reuse, viewer highlighting, signed-out/loading/empty/unavailable states, successful-save refresh, stale suppression, Campaign compatibility, and failure isolation each map to a concrete task above.
- **Placeholder scan:** no TBD/TODO/future implementation step remains.
- **Type consistency:** `parseIceSlideDailyRunKey`, `createIceSlideDailyCompetitionKey`, `ScopedLeaderboardQuery.rulesetVersion`, `viewerAuthenticated`, `isCurrentUser`, and `onScoreSaved(IceSlideGameData)` use one spelling/signature throughout.
- **Scope check:** no schema, endpoint family, shared UI abstraction, replay verifier, historical browser, Expedition ranking, or current-user rank query has entered the plan.
