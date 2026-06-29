# Satellite Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add *Satellite Sync*, an orbital beam-alignment puzzle (the 14th Cetus game), fully integrated into the home page, leaderboard, and achievement systems.

**Architecture:** Hybrid — a standalone `SatelliteSyncGame` class that reuses core utilities `GameTimer` and `ScoreManager` from `src/lib/games/core/`, a functional PixiJS renderer (the circuit-hacker style), and an `init.ts` wiring layer. Static satellites on concentric rings emit beams the player drags to aim; releasing near a valid target snaps and locks it.

**Tech Stack:** Astro 5 + TypeScript, PixiJS 8, Tailwind, Vitest (jsdom), Kysely/LibSQL via existing score + achievement services.

## Global Constraints

- Package manager is **Bun** (`bun@1.3.1`). Run scripts with `bun run …`.
- All HTML structure lives in `.astro` pages; TypeScript only mutates dynamic content by element ID (never `innerHTML` the canvas container).
- Game ID string value is **`satellite_sync`**; route is **`/satellite-sync`**; home-page card title is **`Satellite Sync`**; icon is **`🛰️`**.
- Score submission uses `saveGameScore` from `@/lib/services/scoreService` (not `ScoreManager.saveFinalScore`) so achievement toasts surface via `window.showAchievementAward`.
- Tests run with `bun run test:run` (Vitest, jsdom). Lint with `bun run lint`. Type-check with `bun run astro check`.
- No comments in source files unless an existing convention requires them.
- Color palette constants live in the renderer; game logic is color-agnostic (just string equality).

---

### Task 1: Register Satellite Sync in the platform

**Files:**
- Modify: `src/lib/games.ts` (GameID enum, GAMES array, GAME_ICONS map)
- Modify: `src/pages/index.astro` (idMapping, difficultyLabels, durationLabels)
- Modify: `src/components/ui/GameCard.astro` (getGameUrl switch)
- Modify: `src/lib/games/shared/types.ts` (add `SatelliteSyncGameData` + union)
- Test: `src/lib/games.test.ts` (registration block)

**Interfaces:**
- Produces: `GameID.SATELLITE_SYNC` (value `'satellite_sync'`), a `GAMES` entry, `GAME_ICONS[GameID.SATELLITE_SYNC] = '🛰️'`, and `SatelliteSyncGameData` in the `GameData` union. All later tasks import `GameID` from `@/lib/games`.

- [ ] **Step 1: Add the GameID enum member**

In `src/lib/games.ts`, add `SATELLITE_SYNC` to the `GameID` enum (immediately after `CIRCUIT_HACKER`):

```typescript
    CIRCUIT_HACKER = 'circuit_hacker',
    SATELLITE_SYNC = 'satellite_sync',
```

- [ ] **Step 2: Add the GAMES registry entry**

In `src/lib/games.ts`, append to the `GAMES` array (after the Circuit Hacker entry, before the closing `]`):

```typescript
    {
        id: GameID.SATELLITE_SYNC,
        name: 'Satellite Sync',
        description:
            'Align orbital satellite beams with their targets before the timer expires',
        category: 'strategy',
        maxPlayers: 1,
        estimatedDuration: '6-8 minutes',
        difficulty: 'medium',
        tags: ['satellite', 'sync', 'single-player', 'timing'],
        isActive: true,
    },
```

- [ ] **Step 3: Add the icon**

In `src/lib/games.ts`, add to the `GAME_ICONS` map (after the Circuit Hacker line):

```typescript
    [GameID.SATELLITE_SYNC]: '🛰️',
```

- [ ] **Step 4: Wire the home page idMapping and labels**

In `src/pages/index.astro`:
- Add to `idMapping` (after `circuit_hacker: 12,`):

```typescript
  satellite_sync: 14,
```

- Add to `difficultyLabels` (after the Circuit Hacker line):

```typescript
  [GameID.SATELLITE_SYNC]: 'Medium',
```

- Add to `durationLabels` (after the Circuit Hacker line):

```typescript
  [GameID.SATELLITE_SYNC]: '6-8 minutes',
```

- [ ] **Step 5: Add the GameCard route**

In `src/components/ui/GameCard.astro`, add a case to the `getGameUrl` switch (before `default:`):

```typescript
    case 'Satellite Sync':
      return '/satellite-sync'
```

- [ ] **Step 6: Add SatelliteSyncGameData to shared types**

In `src/lib/games/shared/types.ts`, add the interface (after `CircuitHackerGameData`) and include it in the `GameData` union:

```typescript
// Satellite Sync-specific game data
export interface SatelliteSyncGameData {
    levelsCleared: number
    maxCombo: number
    totalLocks: number
    solved: boolean
    minTimeRemainingRatio: number
}
```

Then append `| SatelliteSyncGameData` to the `GameData` union (after `| CircuitHackerGameData`).

- [ ] **Step 7: Write the failing registration test**

Append to `src/lib/games.test.ts`:

```typescript
describe('Satellite Sync registration', () => {
    it('has a GameID and registry entry', () => {
        expect(GameID.SATELLITE_SYNC).toBe('satellite_sync')
        const game = getGameById(GameID.SATELLITE_SYNC)
        expect(game).toBeDefined()
        expect(game?.name).toBe('Satellite Sync')
        expect(game?.category).toBe('strategy')
        expect(game?.isActive).toBe(true)
    })

    it('has an icon', () => {
        expect(getGameIcon(GameID.SATELLITE_SYNC)).toBe('🛰️')
    })

    it('is included in the GAMES list exactly once', () => {
        expect(GAMES.filter(g => g.id === GameID.SATELLITE_SYNC)).toHaveLength(
            1
        )
    })
})
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun run test:run src/lib/games.test.ts`
Expected: PASS (the registration edits are the implementation; the test validates them).

- [ ] **Step 9: Commit**

```bash
git add src/lib/games.ts src/pages/index.astro src/components/ui/GameCard.astro src/lib/games/shared/types.ts src/lib/games.test.ts
git commit -m "feat(satellite-sync): register game in platform registry"
```

---

### Task 2: Geometry module (pure math)

**Files:**
- Create: `src/lib/games/satellite-sync/types.ts`
- Create: `src/lib/games/satellite-sync/geometry.ts`
- Create: `src/lib/games/satellite-sync/geometry.test.ts`

**Interfaces:**
- Produces: `WorldPoint`, `ringRadius`, `polarToWorld`, `normalizeAngle`, `angleDiff`, `bearing`, `segmentIntersectsCircle`, `findLockableTarget`. Later tasks (game, renderer, levels, scoring-adjacent) import these.

- [ ] **Step 1: Write the types module**

Create `src/lib/games/satellite-sync/types.ts`:

```typescript
export type BeamColor = 'cyan' | 'magenta' | 'yellow' | 'green'

export interface SatelliteDef {
    ring: number
    angle: number
    color: BeamColor
}

export interface MovingConfig {
    speed: number
    direction: 1 | -1
}

export interface TargetDef {
    ring: number
    angle: number
    color: BeamColor
    moving?: MovingConfig
}

export interface ObstacleDef {
    ring: number
    angle: number
    radius: number
    moving?: MovingConfig
}

export interface SatelliteSyncLevel {
    id: number
    name: string
    timeBudget: number
    rings: number
    satellites: SatelliteDef[]
    targets: TargetDef[]
    obstacles: ObstacleDef[]
}

export interface RuntimeSatellite {
    id: string
    ring: number
    angle: number
    color: BeamColor
    aimAngle: number
    lockedTargetId: string | null
    snapCandidateId: string | null
}

export interface RuntimeTarget {
    id: string
    ring: number
    defAngle: number
    currentAngle: number
    color: BeamColor
    moving: MovingConfig | null
    locked: boolean
    lockedBySatId: string | null
}

export interface RuntimeObstacle {
    id: string
    ring: number
    defAngle: number
    currentAngle: number
    radius: number
    moving: MovingConfig | null
}

export type SatelliteSyncStatus =
    | 'idle'
    | 'playing'
    | 'won'
    | 'lost'

export interface SatelliteSyncState {
    levelIndex: number
    levelName: string
    timeBudget: number
    timeRemaining: number
    satellites: RuntimeSatellite[]
    targets: RuntimeTarget[]
    obstacles: RuntimeObstacle[]
    combo: number
    multiplier: number
    score: number
    status: SatelliteSyncStatus
}

export interface LockInfo {
    combo: number
    multiplier: number
}

export interface SatelliteSyncCallbacks {
    onGameStart: () => void
    onTimeUpdate: (seconds: number) => void
    onScoreUpdate: (score: number) => void
    onLock: (info: LockInfo) => void
    onLevelClear: (levelNumber: number) => void
    onFail: (levelNumber: number, finalScore: number) => void
    onWin: (finalScore: number) => void
}
```

- [ ] **Step 2: Write the failing geometry tests**

Create `src/lib/games/satellite-sync/geometry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
    ringRadius,
    polarToWorld,
    normalizeAngle,
    angleDiff,
    bearing,
    segmentIntersectsCircle,
    findLockableTarget,
} from './geometry'

describe('normalizeAngle', () => {
    it('wraps negative and >360 values to [0,360)', () => {
        expect(normalizeAngle(-90)).toBe(270)
        expect(normalizeAngle(360)).toBe(0)
        expect(normalizeAngle(450)).toBe(90)
        expect(normalizeAngle(0)).toBe(0)
    })
})

describe('angleDiff', () => {
    it('returns the smallest angular distance', () => {
        expect(angleDiff(10, 20)).toBe(10)
        expect(angleDiff(350, 10)).toBe(20)
        expect(angleDiff(0, 180)).toBe(180)
        expect(angleDiff(90, 270)).toBe(180)
    })
})

describe('ringRadius / polarToWorld', () => {
    it('places angle 0 at the top and 90 at the right', () => {
        const top = polarToWorld(0, 0)
        expect(top.x).toBeCloseTo(0)
        expect(top.y).toBeCloseTo(-ringRadius(0))

        const right = polarToWorld(0, 90)
        expect(right.x).toBeCloseTo(ringRadius(0))
        expect(right.y).toBeCloseTo(0)
    })

    it('increases radius with ring index', () => {
        expect(ringRadius(1)).toBeGreaterThan(ringRadius(0))
    })
})

describe('bearing', () => {
    it('points up (0) when target is directly above', () => {
        expect(bearing({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(0)
    })

    it('points right (90) when target is to the right', () => {
        expect(bearing({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90)
    })

    it('points down (180) when target is directly below', () => {
        expect(bearing({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(180)
    })
})

describe('segmentIntersectsCircle', () => {
    it('detects a circle blocking the midpoint', () => {
        expect(
            segmentIntersectsCircle(
                { x: -2, y: 0 },
                { x: 2, y: 0 },
                { x: 0, y: 0 },
                0.5
            )
        ).toBe(true)
    })
    it('returns false when the circle is off the segment', () => {
        expect(
            segmentIntersectsCircle(
                { x: -2, y: 0 },
                { x: 2, y: 0 },
                { x: 0, y: 5 },
                0.5
            )
        ).toBe(false)
    })
    it('clamps to segment endpoints', () => {
        expect(
            segmentIntersectsCircle(
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 5, y: 0 },
                0.5
            )
        ).toBe(false)
    })
})

describe('findLockableTarget', () => {
    const satWorld = { x: 0, y: 0 }
    const noObstacles: { ring: number; currentAngle: number; radius: number }[] =
        []

    it('locks when color matches and aim is within threshold', () => {
        const targets = [
            {
                id: 't1',
                ring: 1,
                currentAngle: 0,
                color: 'cyan' as const,
                locked: false,
            },
        ]
        const found = findLockableTarget(
            satWorld,
            'cyan',
            0,
            targets,
            noObstacles,
            8
        )
        expect(found?.id).toBe('t1')
    })

    it('skips targets of a different color', () => {
        const targets = [
            {
                id: 't1',
                ring: 1,
                currentAngle: 0,
                color: 'magenta' as const,
                locked: false,
            },
        ]
        expect(
            findLockableTarget(satWorld, 'cyan', 0, targets, noObstacles, 8)
        ).toBeNull()
    })

    it('skips already-locked targets', () => {
        const targets = [
            {
                id: 't1',
                ring: 1,
                currentAngle: 0,
                color: 'cyan' as const,
                locked: true,
            },
        ]
        expect(
            findLockableTarget(satWorld, 'cyan', 0, targets, noObstacles, 8)
        ).toBeNull()
    })

    it('skips targets whose path is blocked by an obstacle', () => {
        const targets = [
            {
                id: 't1',
                ring: 1,
                currentAngle: 0,
                color: 'cyan' as const,
                locked: false,
            },
        ]
        const obstacles = [
            { ring: 1, currentAngle: 0, radius: 5 },
        ]
        expect(
            findLockableTarget(satWorld, 'cyan', 0, targets, obstacles, 8)
        ).toBeNull()
    })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test:run src/lib/games/satellite-sync/geometry.test.ts`
Expected: FAIL — `./geometry` does not exist.

- [ ] **Step 4: Implement geometry.ts**

Create `src/lib/games/satellite-sync/geometry.ts`:

```typescript
import type { BeamColor } from './types'

export const RING_RADIUS_BASE = 0.8
export const RING_RADIUS_STEP = 0.55

export interface WorldPoint {
    x: number
    y: number
}

export interface GeoTarget {
    id: string
    ring: number
    currentAngle: number
    color: BeamColor
    locked: boolean
}

export interface GeoObstacle {
    ring: number
    currentAngle: number
    radius: number
}

export function ringRadius(ring: number): number {
    return RING_RADIUS_BASE + ring * RING_RADIUS_STEP
}

export function polarToWorld(ring: number, angleDeg: number): WorldPoint {
    const r = ringRadius(ring)
    const rad = (angleDeg * Math.PI) / 180
    return { x: r * Math.sin(rad), y: -r * Math.cos(rad) }
}

export function normalizeAngle(angle: number): number {
    return ((angle % 360) + 360) % 360
}

export function angleDiff(a: number, b: number): number {
    const d = Math.abs(normalizeAngle(a) - normalizeAngle(b)) % 360
    return d > 180 ? 360 - d : d
}

export function bearing(from: WorldPoint, to: WorldPoint): number {
    const dx = to.x - from.x
    const dy = to.y - from.y
    return normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI)
}

export function segmentIntersectsCircle(
    p1: WorldPoint,
    p2: WorldPoint,
    center: WorldPoint,
    radius: number
): boolean {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const l2 = dx * dx + dy * dy
    let t = 0
    if (l2 > 0) {
        t = ((center.x - p1.x) * dx + (center.y - p1.y) * dy) / l2
        t = Math.max(0, Math.min(1, t))
    }
    const closestX = p1.x + t * dx
    const closestY = p1.y + t * dy
    const ddx = center.x - closestX
    const ddy = center.y - closestY
    return ddx * ddx + ddy * ddy <= radius * radius
}

export function findLockableTarget(
    satWorld: WorldPoint,
    satColor: BeamColor,
    aimAngle: number,
    targets: GeoTarget[],
    obstacles: GeoObstacle[],
    snapThreshold: number
): GeoTarget | null {
    let best: GeoTarget | null = null
    let bestDiff = Infinity
    for (const target of targets) {
        if (target.locked || target.color !== satColor) {
            continue
        }
        const targetWorld = polarToWorld(target.ring, target.currentAngle)
        const diff = angleDiff(bearing(satWorld, targetWorld), aimAngle)
        if (diff > snapThreshold || diff >= bestDiff) {
            continue
        }
        const blocked = obstacles.some(o =>
            segmentIntersectsCircle(
                satWorld,
                targetWorld,
                polarToWorld(o.ring, o.currentAngle),
                o.radius
            )
        )
        if (blocked) {
            continue
        }
        best = target
        bestDiff = diff
    }
    return best
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test:run src/lib/games/satellite-sync/geometry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/games/satellite-sync/types.ts src/lib/games/satellite-sync/geometry.ts src/lib/games/satellite-sync/geometry.test.ts
git commit -m "feat(satellite-sync): add pure geometry module"
```

---

### Task 3: Scoring module (pure functions)

**Files:**
- Create: `src/lib/games/satellite-sync/scoring.ts`
- Create: `src/lib/games/satellite-sync/scoring.test.ts`

**Interfaces:**
- Consumes: nothing (self-contained).
- Produces: `SCORING_CONFIG`, `comboMultiplier(comboCount)`, `lockPoints(comboCount)`, `levelClearBonus(levelNumber)`, `timeBonus(secondsRemaining)`.

- [ ] **Step 1: Write the failing scoring tests**

Create `src/lib/games/satellite-sync/scoring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
    comboMultiplier,
    lockPoints,
    levelClearBonus,
    timeBonus,
} from './scoring'

describe('comboMultiplier', () => {
    it('is 1 for combo counts of 1 or less', () => {
        expect(comboMultiplier(1)).toBe(1)
        expect(comboMultiplier(0)).toBe(1)
    })
    it('grows by 0.5 per combo step', () => {
        expect(comboMultiplier(2)).toBe(1.5)
        expect(comboMultiplier(3)).toBe(2)
        expect(comboMultiplier(4)).toBe(2.5)
    })
    it('caps at 3', () => {
        expect(comboMultiplier(5)).toBe(3)
        expect(comboMultiplier(20)).toBe(3)
    })
})

describe('lockPoints', () => {
    it('applies the combo multiplier to the base and rounds', () => {
        expect(lockPoints(1)).toBe(100)
        expect(lockPoints(2)).toBe(150)
        expect(lockPoints(3)).toBe(200)
    })
})

describe('levelClearBonus', () => {
    it('scales with 1-based level number', () => {
        expect(levelClearBonus(1)).toBe(250)
        expect(levelClearBonus(4)).toBe(1000)
        expect(levelClearBonus(8)).toBe(2000)
    })
})

describe('timeBonus', () => {
    it('awards 10 points per remaining second, never negative', () => {
        expect(timeBonus(0)).toBe(0)
        expect(timeBonus(12)).toBe(120)
        expect(timeBonus(-5)).toBe(0)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run src/lib/games/satellite-sync/scoring.test.ts`
Expected: FAIL — `./scoring` does not exist.

- [ ] **Step 3: Implement scoring.ts**

Create `src/lib/games/satellite-sync/scoring.ts`:

```typescript
export const SCORING_CONFIG = {
    lockBase: 100,
    comboStep: 0.5,
    comboCap: 3,
    levelBonusBase: 250,
    timeBonusPerSec: 10,
    comboWindowMs: 2500,
    snapThresholdDeg: 8,
} as const

export function comboMultiplier(comboCount: number): number {
    if (comboCount <= 1) {
        return 1
    }
    return Math.min(
        SCORING_CONFIG.comboCap,
        1 + SCORING_CONFIG.comboStep * (comboCount - 1)
    )
}

export function lockPoints(comboCount: number): number {
    return Math.round(SCORING_CONFIG.lockBase * comboMultiplier(comboCount))
}

export function levelClearBonus(levelNumber: number): number {
    return SCORING_CONFIG.levelBonusBase * levelNumber
}

export function timeBonus(secondsRemaining: number): number {
    return Math.max(0, secondsRemaining) * SCORING_CONFIG.timeBonusPerSec
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:run src/lib/games/satellite-sync/scoring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/satellite-sync/scoring.ts src/lib/games/satellite-sync/scoring.test.ts
git commit -m "feat(satellite-sync): add pure scoring module"
```

---

### Task 4: Authored levels + solvability check

**Files:**
- Create: `src/lib/games/satellite-sync/levels.ts`
- Create: `src/lib/games/satellite-sync/levels.test.ts`

**Interfaces:**
- Consumes: `SatelliteSyncLevel`, `BeamColor` from `./types`; `polarToWorld`, `segmentIntersectsCircle` from `./geometry`.
- Produces: `SATELLITE_SYNC_LEVELS: SatelliteSyncLevel[]` (8 levels) and `hasStaticMatching(level): boolean`.

- [ ] **Step 1: Write the failing solvability tests**

Create `src/lib/games/satellite-sync/levels.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { SATELLITE_SYNC_LEVELS, hasStaticMatching } from './levels'

describe('SATELLITE_SYNC_LEVELS', () => {
    it('has exactly 8 levels with sequential ids', () => {
        expect(SATELLITE_SYNC_LEVELS).toHaveLength(8)
        SATELLITE_SYNC_LEVELS.forEach((level, i) => {
            expect(level.id).toBe(i + 1)
            expect(level.name.length).toBeGreaterThan(0)
            expect(level.timeBudget).toBeGreaterThan(0)
        })
    })
})

describe('hasStaticMatching', () => {
    it('marks every shipped level solvable', () => {
        for (const level of SATELLITE_SYNC_LEVELS) {
            expect(hasStaticMatching(level)).toBe(true)
        }
    })

    it('rejects an unsolvable level (missing color)', () => {
        expect(
            hasStaticMatching({
                id: 99,
                name: 'bad',
                timeBudget: 30,
                rings: 1,
                satellites: [{ ring: 0, angle: 0, color: 'cyan' }],
                targets: [{ ring: 1, angle: 0, color: 'magenta' }],
                obstacles: [],
            })
        ).toBe(false)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run src/lib/games/satellite-sync/levels.test.ts`
Expected: FAIL — `./levels` does not exist.

- [ ] **Step 3: Implement levels.ts**

Create `src/lib/games/satellite-sync/levels.ts`:

```typescript
import type { SatelliteSyncLevel } from './types'
import {
    polarToWorld,
    segmentIntersectsCircle,
    type WorldPoint,
} from './geometry'

function pathClear(
    from: WorldPoint,
    to: WorldPoint,
    level: SatelliteSyncLevel
): boolean {
    return !level.obstacles.some(o => {
        const ow = polarToWorld(o.ring, o.angle)
        return segmentIntersectsCircle(from, to, ow, o.radius)
    })
}

function canReach(
    level: SatelliteSyncLevel,
    satIndex: number,
    targetIndex: number
): boolean {
    const sat = level.satellites[satIndex]
    const target = level.targets[targetIndex]
    if (sat.color !== target.color) {
        return false
    }
    const from = polarToWorld(sat.ring, sat.angle)
    const to = polarToWorld(target.ring, target.angle)
    return pathClear(from, to, level)
}

function matchingExists(level: SatelliteSyncLevel): boolean {
    const numTargets = level.targets.length
    const numSats = level.satellites.length
    if (numSats < numTargets) {
        return false
    }
    // Kuhn's algorithm for maximum bipartite matching. matchS[s] is the
    // target index assigned to satellite s (or -1). For each target we
    // search for an augmenting path, reassigning earlier targets when
    // needed so a greedy first-fit cannot reject a solvable level.
    const matchS = new Array<number>(numSats).fill(-1)
    const seen = new Array<boolean>(numSats).fill(false)

    const tryAssign = (t: number): boolean => {
        for (let s = 0; s < numSats; s++) {
            if (seen[s] || !canReach(level, s, t)) {
                continue
            }
            seen[s] = true
            if (matchS[s] === -1 || tryAssign(matchS[s])) {
                matchS[s] = t
                return true
            }
        }
        return false
    }

    let matched = 0
    for (let t = 0; t < numTargets; t++) {
        seen.fill(false)
        if (tryAssign(t)) {
            matched++
        }
    }
    return matched === numTargets
}

// Validates the static layout of a level: every target can be matched to
// a distinct same-color satellite with an unobstructed path. This does
// NOT account for moving entities or the time budget — it is a static
// sanity check used by the test suite, not a runtime solvability proof.
export function hasStaticMatching(level: SatelliteSyncLevel): boolean {
    return matchingExists(level)
}

export const SATELLITE_SYNC_LEVELS: SatelliteSyncLevel[] = [
    {
        id: 1,
        name: 'First Contact',
        timeBudget: 60,
        rings: 2,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 120, color: 'cyan' },
            { ring: 0, angle: 240, color: 'cyan' },
        ],
        targets: [
            { ring: 1, angle: 60, color: 'cyan' },
            { ring: 1, angle: 180, color: 'cyan' },
            { ring: 1, angle: 300, color: 'cyan' },
        ],
        obstacles: [],
    },
    {
        id: 2,
        name: 'Spectrum',
        timeBudget: 55,
        rings: 2,
        satellites: [
            { ring: 0, angle: 30, color: 'cyan' },
            { ring: 0, angle: 150, color: 'magenta' },
            { ring: 0, angle: 270, color: 'yellow' },
            { ring: 0, angle: 90, color: 'cyan' },
        ],
        targets: [
            { ring: 1, angle: 60, color: 'cyan' },
            { ring: 1, angle: 180, color: 'magenta' },
            { ring: 1, angle: 300, color: 'yellow' },
        ],
        obstacles: [],
    },
    {
        id: 3,
        name: 'Crossfire',
        timeBudget: 50,
        rings: 3,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 120, color: 'magenta' },
            { ring: 0, angle: 240, color: 'yellow' },
            { ring: 1, angle: 60, color: 'cyan' },
            { ring: 1, angle: 200, color: 'magenta' },
        ],
        targets: [
            { ring: 2, angle: 30, color: 'cyan' },
            { ring: 2, angle: 110, color: 'magenta' },
            { ring: 2, angle: 200, color: 'yellow' },
            { ring: 2, angle: 300, color: 'cyan' },
            { ring: 2, angle: 250, color: 'magenta' },
        ],
        obstacles: [],
    },
    {
        id: 4,
        name: 'Debris Field',
        timeBudget: 50,
        rings: 3,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 120, color: 'cyan' },
            { ring: 0, angle: 240, color: 'magenta' },
            { ring: 0, angle: 60, color: 'magenta' },
        ],
        targets: [
            { ring: 2, angle: 40, color: 'cyan' },
            { ring: 2, angle: 160, color: 'cyan' },
            { ring: 2, angle: 280, color: 'magenta' },
            { ring: 2, angle: 340, color: 'magenta' },
        ],
        obstacles: [{ ring: 1, angle: 90, radius: 0.3 }],
    },
    {
        id: 5,
        name: 'Orbit Drift',
        timeBudget: 45,
        rings: 2,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 120, color: 'cyan' },
            { ring: 0, angle: 240, color: 'cyan' },
        ],
        targets: [
            { ring: 1, angle: 0, color: 'cyan', moving: { speed: 18, direction: 1 } },
            { ring: 1, angle: 120, color: 'cyan', moving: { speed: 18, direction: -1 } },
            { ring: 1, angle: 240, color: 'cyan', moving: { speed: 18, direction: 1 } },
        ],
        obstacles: [],
    },
    {
        id: 6,
        name: 'Shifting Debris',
        timeBudget: 45,
        rings: 3,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 90, color: 'magenta' },
            { ring: 0, angle: 180, color: 'yellow' },
            { ring: 0, angle: 270, color: 'cyan' },
        ],
        targets: [
            { ring: 2, angle: 45, color: 'cyan', moving: { speed: 14, direction: 1 } },
            { ring: 2, angle: 135, color: 'magenta', moving: { speed: 14, direction: -1 } },
            { ring: 2, angle: 225, color: 'yellow', moving: { speed: 14, direction: 1 } },
            { ring: 2, angle: 315, color: 'cyan', moving: { speed: 14, direction: -1 } },
        ],
        obstacles: [{ ring: 1, angle: 0, radius: 0.28, moving: { speed: 10, direction: 1 } }],
    },
    {
        id: 7,
        name: 'Prismatic Storm',
        timeBudget: 40,
        rings: 3,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 72, color: 'magenta' },
            { ring: 0, angle: 144, color: 'yellow' },
            { ring: 0, angle: 216, color: 'green' },
            { ring: 0, angle: 288, color: 'cyan' },
            { ring: 0, angle: 36, color: 'magenta' },
        ],
        targets: [
            { ring: 2, angle: 20, color: 'cyan', moving: { speed: 12, direction: 1 } },
            { ring: 2, angle: 90, color: 'magenta', moving: { speed: 12, direction: -1 } },
            { ring: 2, angle: 160, color: 'yellow' },
            { ring: 2, angle: 230, color: 'green', moving: { speed: 12, direction: 1 } },
            { ring: 2, angle: 310, color: 'cyan', moving: { speed: 12, direction: -1 } },
            { ring: 2, angle: 340, color: 'magenta' },
        ],
        obstacles: [{ ring: 1, angle: 180, radius: 0.25 }],
    },
    {
        id: 8,
        name: 'Singularity',
        timeBudget: 40,
        rings: 3,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 90, color: 'magenta' },
            { ring: 0, angle: 180, color: 'yellow' },
            { ring: 0, angle: 270, color: 'green' },
            { ring: 0, angle: 45, color: 'cyan' },
            { ring: 0, angle: 225, color: 'magenta' },
        ],
        targets: [
            { ring: 2, angle: 30, color: 'cyan', moving: { speed: 16, direction: 1 } },
            { ring: 2, angle: 100, color: 'magenta', moving: { speed: 16, direction: -1 } },
            { ring: 2, angle: 170, color: 'yellow', moving: { speed: 16, direction: 1 } },
            { ring: 2, angle: 240, color: 'green', moving: { speed: 16, direction: -1 } },
            { ring: 2, angle: 310, color: 'cyan', moving: { speed: 16, direction: 1 } },
            { ring: 2, angle: 350, color: 'magenta', moving: { speed: 16, direction: -1 } },
        ],
        obstacles: [
            { ring: 1, angle: 60, radius: 0.25, moving: { speed: 12, direction: 1 } },
            { ring: 1, angle: 240, radius: 0.25, moving: { speed: 12, direction: -1 } },
        ],
    },
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:run src/lib/games/satellite-sync/levels.test.ts`
Expected: PASS — all 8 levels are solvable, and the unsolvable fixture is rejected.

If any shipped level fails the solvability check, an obstacle is blocking every valid path for some target. Nudge that obstacle's `angle` (or `radius`) away from the satellite→target bearings, or add one extra satellite of the needed color, until the test passes. This is expected level tuning, not a code change.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/satellite-sync/levels.ts src/lib/games/satellite-sync/levels.test.ts
git commit -m "feat(satellite-sync): add 8 authored levels with solvability check"
```

---

### Task 5: Game logic (SatelliteSyncGame)

**Files:**
- Create: `src/lib/games/satellite-sync/game.ts`
- Create: `src/lib/games/satellite-sync/game.test.ts`

**Interfaces:**
- Consumes: `GameTimer` from `../core/GameTimer`, `ScoreManager` from `../core/ScoreManager`, `GameID` from `@/lib/games`; geometry/scoring/levels/types from sibling modules.
- Produces: `class SatelliteSyncGame` with `start()`, `stop()`, `cleanup()`, `update(deltaMs)`, `beginAim(satId)`, `updateAim(satId, worldAngle)`, `endAim(satId)`, `aimAtTarget(satId, targetId)` (test/reuse helper), `getState()`, `getGameData()`.

- [ ] **Step 1: Write the failing game tests**

Create `src/lib/games/satellite-sync/game.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SatelliteSyncGame } from './game'
import type { SatelliteSyncCallbacks } from './types'

function makeCallbacks(): SatelliteSyncCallbacks & { calls: Record<string, unknown[]> } {
    const calls: Record<string, unknown[]> = {}
    const cbs = {
        onGameStart: () => {
            calls.start = (calls.start ?? []).concat([true])
        },
        onTimeUpdate: (s: number) => {
            calls.time = (calls.time ?? []).concat([s])
        },
        onScoreUpdate: (sc: number) => {
            calls.score = (calls.score ?? []).concat([sc])
        },
        onLock: (info: { combo: number; multiplier: number }) => {
            calls.lock = (calls.lock ?? []).concat([info])
        },
        onLevelClear: (n: number) => {
            calls.clear = (calls.clear ?? []).concat([n])
        },
        onFail: (n: number, sc: number) => {
            calls.fail = (calls.fail ?? []).concat([[n, sc]])
        },
        onWin: (sc: number) => {
            calls.win = (calls.win ?? []).concat([sc])
        },
    } as unknown as SatelliteSyncCallbacks &
        { calls: Record<string, unknown[]> }
    ;(cbs as { calls: Record<string, unknown[]> }).calls = calls
    return cbs
}

// Greedily clears the current level: for each target, try free satellites
// until one locks it. Works for the authored levels (each target has a
// reachable satellite among the extras). Avoids assuming a fixed
// satellite->target ordering.
function solveCurrentLevel(game: SatelliteSyncGame): void {
    const targetIds = game.getState().targets.map(t => t.id)
    for (const targetId of targetIds) {
        if (game.getState().targets.find(t => t.id === targetId)!.locked) {
            continue
        }
        for (const sat of game.getState().satellites) {
            if (sat.lockedTargetId) {
                continue
            }
            game.beginAim(sat.id)
            game.aimAtTarget(sat.id, targetId)
            game.endAim(sat.id)
            if (game.getState().targets.find(t => t.id === targetId)!.locked) {
                break
            }
        }
    }
}

describe('SatelliteSyncGame', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('starts on level 1 and reports the time budget', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        const state = game.getState()
        expect(state.levelIndex).toBe(0)
        expect(state.status).toBe('playing')
        expect(cbs.calls.start).toHaveLength(1)
        expect(state.timeRemaining).toBe(60)
        game.cleanup()
    })

    it('locks a target when aimed correctly and awards combo points', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        const sat = game.getState().satellites[0]
        const target = game.getState().targets[0]

        game.beginAim(sat.id)
        // Aim straight at the target's bearing (target on ring 1 at 60deg,
        // satellite on ring 0 at 0deg). Compute bearing to point exactly.
        const aim = game.aimAtTarget(sat.id, target.id)
        game.endAim(sat.id)

        expect(game.getState().targets[0].locked).toBe(true)
        expect(cbs.calls.lock).toHaveLength(1)
        expect(cbs.calls.score?.[0]).toBe(100)
        expect(aim).toBe(true)
        game.cleanup()
    })

    it('builds a combo on rapid successive locks', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        const state = game.getState()
        // Lock two different satellites onto two targets quickly.
        game.beginAim(state.satellites[0].id)
        game.aimAtTarget(state.satellites[0].id, state.targets[0].id)
        game.endAim(state.satellites[0].id)
        game.beginAim(state.satellites[1].id)
        game.aimAtTarget(state.satellites[1].id, state.targets[1].id)
        game.endAim(state.satellites[1].id)

        const lockCalls = cbs.calls.lock as { combo: number }[]
        expect(lockCalls[1].combo).toBe(2)
        game.cleanup()
    })

    it('clears the level and advances when all targets locked', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        solveCurrentLevel(game)
        expect(cbs.calls.clear).toHaveLength(1)
        expect(cbs.calls.clear?.[0]).toBe(1)
        expect(game.getState().levelIndex).toBe(1)
        game.cleanup()
    })

    it('fails the run when the level timer expires', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        vi.advanceTimersByTime(61_000)
        expect(cbs.calls.fail).toHaveLength(1)
        expect(game.getState().status).toBe('lost')
        game.cleanup()
    })

    it('wins after clearing all 8 levels', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        for (let lvl = 0; lvl < 8; lvl++) {
            solveCurrentLevel(game)
        }
        expect(cbs.calls.win).toHaveLength(1)
        expect(game.getState().status).toBe('won')
        const data = game.getGameData()
        expect(data.solved).toBe(true)
        expect(data.levelsCleared).toBe(8)
        game.cleanup()
    })

    it('re-aiming a locked satellite unlocks its previous target', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        const s = game.getState()
        game.beginAim(s.satellites[0].id)
        game.aimAtTarget(s.satellites[0].id, s.targets[0].id)
        game.endAim(s.satellites[0].id)
        expect(game.getState().targets[0].locked).toBe(true)
        // Grab it again -> previous target unlocks.
        game.beginAim(s.satellites[0].id)
        expect(game.getState().targets[0].locked).toBe(false)
        game.cleanup()
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run src/lib/games/satellite-sync/game.test.ts`
Expected: FAIL — `./game` does not exist.

- [ ] **Step 3: Implement game.ts**

Create `src/lib/games/satellite-sync/game.ts`:

```typescript
import { GameTimer } from '../core/GameTimer'
import { ScoreManager } from '../core/ScoreManager'
import { GameID } from '@/lib/games'
import { SATELLITE_SYNC_LEVELS } from './levels'
import {
    polarToWorld,
    bearing,
    normalizeAngle,
    angleDiff,
    segmentIntersectsCircle,
    findLockableTarget,
    type WorldPoint,
} from './geometry'
import {
    SCORING_CONFIG,
    comboMultiplier,
    lockPoints,
    levelClearBonus,
    timeBonus,
} from './scoring'
import type {
    SatelliteSyncCallbacks,
    SatelliteSyncState,
    RuntimeSatellite,
    SatelliteSyncGameData,
} from './types'

export class SatelliteSyncGame {
    private callbacks: SatelliteSyncCallbacks
    private scoreManager: ScoreManager
    private timer: GameTimer | null = null
    private state: SatelliteSyncState
    private maxCombo = 0
    private totalLocks = 0
    private minTimeRatio = 1
    private levelMinTime = 0

    constructor(callbacks: SatelliteSyncCallbacks) {
        this.callbacks = callbacks
        this.scoreManager = new ScoreManager({
            gameId: GameID.SATELLITE_SYNC,
            scoringConfig: {
                basePoints: SCORING_CONFIG.lockBase,
                bonusMultiplier: 1,
                timeBonus: true,
            },
            achievementIntegration: false,
            onScoreUpdate: score => this.callbacks.onScoreUpdate(score),
        })
        this.state = this.createIdleState()
    }

    private createIdleState(): SatelliteSyncState {
        return {
            levelIndex: 0,
            levelName: '',
            timeBudget: 0,
            timeRemaining: 0,
            satellites: [],
            targets: [],
            obstacles: [],
            combo: 0,
            multiplier: 1,
            score: 0,
            status: 'idle',
        }
    }

    start(): void {
        this.scoreManager.reset()
        this.maxCombo = 0
        this.totalLocks = 0
        this.minTimeRatio = 1
        this.loadLevel(0)
        this.callbacks.onGameStart()
    }

    stop(): void {
        this.stopTimer()
        this.state.status = 'idle'
    }

    cleanup(): void {
        this.stopTimer()
        this.scoreManager.removeAllListeners()
    }

    private loadLevel(index: number): void {
        const level = SATELLITE_SYNC_LEVELS[index]
        this.state.levelIndex = index
        this.state.levelName = level.name
        this.state.timeBudget = level.timeBudget
        this.state.timeRemaining = level.timeBudget
        this.state.combo = 0
        this.state.multiplier = 1
        this.state.satellites = level.satellites.map((s, i) => ({
            id: `sat-${i}`,
            ring: s.ring,
            angle: s.angle,
            color: s.color,
            aimAngle: 0,
            lockedTargetId: null,
            snapCandidateId: null,
        }))
        this.state.targets = level.targets.map((t, i) => ({
            id: `target-${i}`,
            ring: t.ring,
            defAngle: t.angle,
            currentAngle: t.angle,
            color: t.color,
            moving: t.moving ?? null,
            locked: false,
            lockedBySatId: null,
        }))
        this.state.obstacles = level.obstacles.map((o, i) => ({
            id: `obs-${i}`,
            ring: o.ring,
            defAngle: o.angle,
            currentAngle: o.angle,
            radius: o.radius,
            moving: o.moving ?? null,
        }))
        this.state.status = 'playing'
        this.levelMinTime = level.timeBudget

        this.stopTimer()
        this.timer = new GameTimer({
            duration: level.timeBudget,
            countDown: true,
            autoStart: false,
            onTick: t => {
                this.state.timeRemaining = t
                if (t < this.levelMinTime) {
                    this.levelMinTime = t
                }
                this.callbacks.onTimeUpdate(t)
            },
            onComplete: () => this.handleTimeout(),
        })
        this.timer.start()
        this.callbacks.onTimeUpdate(level.timeBudget)
    }

    private stopTimer(): void {
        if (this.timer) {
            this.timer.stop()
            this.timer = null
        }
    }

    private handleTimeout(): void {
        if (this.state.status !== 'playing') {
            return
        }
        this.updateMinRatio()
        this.state.status = 'lost'
        this.stopTimer()
        this.callbacks.onFail(this.state.levelIndex + 1, this.scoreManager.getScore())
    }

    private updateMinRatio(): void {
        const budget = this.state.timeBudget || 1
        const ratio = this.state.timeRemaining / budget
        if (ratio < this.minTimeRatio) {
            this.minTimeRatio = ratio
        }
    }

    update(deltaMs: number): void {
        if (this.state.status !== 'playing') {
            return
        }
        const dt = deltaMs / 1000
        for (const target of this.state.targets) {
            if (target.moving) {
                target.currentAngle = normalizeAngle(
                    target.currentAngle +
                        target.moving.speed * target.moving.direction * dt
                )
            }
        }
        for (const obs of this.state.obstacles) {
            if (obs.moving) {
                obs.currentAngle = normalizeAngle(
                    obs.currentAngle +
                        obs.moving.speed * obs.moving.direction * dt
                )
            }
        }
        if (
            this.state.combo > 0 &&
            Date.now() - this.lastLockTime() > SCORING_CONFIG.comboWindowMs
        ) {
            this.state.combo = 0
            this.state.multiplier = 1
        }
    }

    private lastLockAt = 0
    private lastLockTime(): number {
        return this.lastLockAt
    }

    beginAim(satId: string): void {
        const sat = this.findSatellite(satId)
        if (!sat || this.state.status !== 'playing') {
            return
        }
        if (sat.lockedTargetId) {
            this.unlockSatellite(sat)
        }
    }

    updateAim(satId: string, worldAngle: number): void {
        const sat = this.findSatellite(satId)
        if (!sat || this.state.status !== 'playing') {
            return
        }
        sat.aimAngle = worldAngle
        const candidate = findLockableTarget(
            this.satWorld(sat),
            sat.color,
            worldAngle,
            this.state.targets,
            this.state.obstacles,
            SCORING_CONFIG.snapThresholdDeg
        )
        sat.snapCandidateId = candidate ? candidate.id : null
    }

    endAim(satId: string): void {
        const sat = this.findSatellite(satId)
        if (!sat || this.state.status !== 'playing') {
            return
        }
        if (sat.snapCandidateId) {
            // Re-validate the previously previewed candidate by id: a
            // moving target may have drifted out of range between
            // updateAim() and this commit. Spec: "no stale locks." Do
            // not accept a different target just because it is now
            // closer on the ray — only lock the one the player saw.
            const target = this.state.targets.find(
                t => t.id === sat.snapCandidateId
            )
            if (target && !target.locked && target.color === sat.color) {
                const satWorld = this.satWorld(sat)
                const targetWorld = polarToWorld(
                    target.ring,
                    target.currentAngle
                )
                const diff = angleDiff(
                    bearing(satWorld, targetWorld),
                    sat.aimAngle
                )
                const blocked = this.state.obstacles.some(o =>
                    segmentIntersectsCircle(
                        satWorld,
                        targetWorld,
                        polarToWorld(o.ring, o.currentAngle),
                        o.radius
                    )
                )
                if (diff <= SCORING_CONFIG.snapThresholdDeg && !blocked) {
                    this.applyLock(sat, target.id)
                }
            }
        }
        sat.snapCandidateId = null
    }

    aimAtTarget(satId: string, targetId: string): boolean {
        const sat = this.findSatellite(satId)
        const target = this.state.targets.find(t => t.id === targetId)
        if (!sat || !target) {
            return false
        }
        const aim = bearing(this.satWorld(sat), polarToWorld(target.ring, target.currentAngle))
        this.updateAim(satId, aim)
        return sat.snapCandidateId === targetId
    }

    private applyLock(sat: RuntimeSatellite, targetId: string): void {
        const target = this.state.targets.find(t => t.id === targetId)
        if (!target || target.locked) {
            return
        }
        if (sat.lockedTargetId) {
            this.unlockSatellite(sat)
        }
        target.locked = true
        target.lockedBySatId = sat.id
        sat.lockedTargetId = target.id
        sat.aimAngle = bearing(
            this.satWorld(sat),
            polarToWorld(target.ring, target.currentAngle)
        )

        const now = Date.now()
        if (
            this.state.combo > 0 &&
            now - this.lastLockTime() <= SCORING_CONFIG.comboWindowMs
        ) {
            this.state.combo += 1
        } else {
            this.state.combo = 1
        }
        this.lastLockAt = now
        this.state.multiplier = comboMultiplier(this.state.combo)
        if (this.state.combo > this.maxCombo) {
            this.maxCombo = this.state.combo
        }
        this.totalLocks += 1

        const points = lockPoints(this.state.combo)
        this.scoreManager.addPoints(points, 'lock')
        this.state.score = this.scoreManager.getScore()
        this.callbacks.onLock({ combo: this.state.combo, multiplier: this.state.multiplier })

        if (this.state.targets.every(t => t.locked)) {
            this.handleLevelClear()
        }
    }

    private unlockSatellite(sat: RuntimeSatellite): void {
        if (!sat.lockedTargetId) {
            return
        }
        const target = this.state.targets.find(t => t.id === sat.lockedTargetId)
        if (target) {
            target.locked = false
            target.lockedBySatId = null
        }
        sat.lockedTargetId = null
        this.state.combo = 0
        this.state.multiplier = 1
    }

    private handleLevelClear(): void {
        this.updateMinRatio()
        const levelNumber = this.state.levelIndex + 1
        const bonus =
            levelClearBonus(levelNumber) + timeBonus(this.state.timeRemaining)
        this.scoreManager.addPoints(bonus, 'level_clear')
        this.state.score = this.scoreManager.getScore()
        this.callbacks.onLevelClear(levelNumber)

        if (levelNumber >= SATELLITE_SYNC_LEVELS.length) {
            this.state.status = 'won'
            this.stopTimer()
            this.callbacks.onWin(this.scoreManager.getScore())
        } else {
            this.loadLevel(this.state.levelIndex + 1)
        }
    }

    private findSatellite(id: string): RuntimeSatellite | undefined {
        return this.state.satellites.find(s => s.id === id)
    }

    private satWorld(sat: RuntimeSatellite): WorldPoint {
        return polarToWorld(sat.ring, sat.angle)
    }

    getState(): SatelliteSyncState {
        return {
            ...this.state,
            satellites: this.state.satellites.map(s => ({ ...s })),
            targets: this.state.targets.map(t => ({
                ...t,
                moving: t.moving ? { ...t.moving } : null,
            })),
            obstacles: this.state.obstacles.map(o => ({
                ...o,
                moving: o.moving ? { ...o.moving } : null,
            })),
        }
    }

    getGameData(): SatelliteSyncGameData {
        return {
            levelsCleared:
                this.state.status === 'won'
                    ? SATELLITE_SYNC_LEVELS.length
                    : this.state.levelIndex,
            maxCombo: this.maxCombo,
            totalLocks: this.totalLocks,
            solved: this.state.status === 'won',
            minTimeRemainingRatio: this.minTimeRatio,
        }
    }
}
```

Note: `SatelliteSyncGameData` (local, from `./types`) is structurally identical to the shared `SatelliteSyncGameData`; `init.ts` passes `getGameData()` straight to `saveGameScore`, which accepts the shared shape. `aimAtTarget` is a deterministic helper (points a satellite's beam exactly at a target and returns whether it snap-qualifies) used by `game.test.ts` and kept on the class for reuse.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:run src/lib/games/satellite-sync/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/satellite-sync/game.ts src/lib/games/satellite-sync/game.test.ts
git commit -m "feat(satellite-sync): add game logic with combos and level progression"
```

---

### Task 6: PixiJS renderer

**Files:**
- Create: `src/lib/games/satellite-sync/renderer.ts`
- Create: `src/lib/games/satellite-sync/renderer.test.ts`

**Interfaces:**
- Consumes: geometry (`polarToWorld`, `ringRadius`, `WorldPoint`), types (`SatelliteSyncState`, `RuntimeSatellite`).
- Produces: `RendererState`, `SceneLayout`, `setupScene(container, rings)`, `render(rendererState, state)`, `pixelToWorld(px, py, layout)`, `pointerToSatellite(px, py, satellites, layout)`, `cleanup(rendererState)`.

- [ ] **Step 1: Write the failing renderer tests**

Create `src/lib/games/satellite-sync/renderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
    buildLayout,
    pixelToWorld,
    pointerToSatellite,
} from './renderer'
import { polarToWorld } from './geometry'
import type { RuntimeSatellite } from './types'

describe('buildLayout', () => {
    it('centres the scene and scales to fit the outermost ring', () => {
        const layout = buildLayout(400, 400, 2)
        expect(layout.cx).toBe(200)
        expect(layout.cy).toBe(200)
        expect(layout.scale).toBeGreaterThan(0)
    })
})

describe('pixelToWorld / pointerToSatellite', () => {
    it('round-trips world -> pixel -> world', () => {
        const layout = buildLayout(400, 400, 2)
        const world = polarToWorld(0, 90)
        const px = layout.cx + world.x * layout.scale
        const py = layout.cy + world.y * layout.scale
        const back = pixelToWorld(px, py, layout)
        expect(back.x).toBeCloseTo(world.x, 5)
        expect(back.y).toBeCloseTo(world.y, 5)
    })

    it('finds the satellite under the pointer within grab radius', () => {
        const layout = buildLayout(400, 400, 2)
        const sat: RuntimeSatellite = {
            id: 'sat-0',
            ring: 0,
            angle: 0,
            color: 'cyan',
            aimAngle: 0,
            lockedTargetId: null,
            snapCandidateId: null,
        }
        const world = polarToWorld(sat.ring, sat.angle)
        const px = layout.cx + world.x * layout.scale
        const py = layout.cy + world.y * layout.scale
        expect(pointerToSatellite(px, py, [sat], layout)).toBe('sat-0')
    })

    it('returns null when no satellite is near', () => {
        const layout = buildLayout(400, 400, 2)
        const sat: RuntimeSatellite = {
            id: 'sat-0',
            ring: 0,
            angle: 0,
            color: 'cyan',
            aimAngle: 0,
            lockedTargetId: null,
            snapCandidateId: null,
        }
        expect(pointerToSatellite(5, 5, [sat], layout)).toBeNull()
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run src/lib/games/satellite-sync/renderer.test.ts`
Expected: FAIL — `./renderer` does not exist.

- [ ] **Step 3: Implement renderer.ts**

Create `src/lib/games/satellite-sync/renderer.ts`:

```typescript
import { Application, Graphics } from 'pixi.js'
import { polarToWorld, ringRadius, type WorldPoint } from './geometry'
import type { SatelliteSyncState, RuntimeSatellite } from './types'

export interface SceneLayout {
    cx: number
    cy: number
    scale: number
    rings: number
}

export interface RendererState {
    app: Application
    scene: Graphics
    layout: SceneLayout
}

const BACKGROUND = '#02030a'
const RING_COLOR = 0x1e3a5f
const BODY_COLOR = 0xfbbf24
const OBSTACLE_COLOR = 0x475569

const BEAM_COLORS: Record<string, number> = {
    cyan: 0x22d3ee,
    magenta: 0xf472b6,
    yellow: 0xfacc15,
    green: 0x4ade80,
}

export const GRAB_RADIUS_WORLD = 0.4

export function buildLayout(
    width: number,
    height: number,
    rings: number
): SceneLayout {
    const minDim = Math.min(width, height)
    const outerRadius = ringRadius(Math.max(0, rings - 1))
    const scale = (minDim * 0.42) / outerRadius
    return { cx: width / 2, cy: height / 2, scale, rings }
}

export function worldToPixel(world: WorldPoint, layout: SceneLayout) {
    return { x: layout.cx + world.x * layout.scale, y: layout.cy + world.y * layout.scale }
}

export function pixelToWorld(px: number, py: number, layout: SceneLayout): WorldPoint {
    return { x: (px - layout.cx) / layout.scale, y: (py - layout.cy) / layout.scale }
}

export function pointerToSatellite(
    px: number,
    py: number,
    satellites: RuntimeSatellite[],
    layout: SceneLayout
): string | null {
    const pointer = pixelToWorld(px, py, layout)
    let nearest: string | null = null
    let bestDist = GRAB_RADIUS_WORLD
    for (const sat of satellites) {
        const w = polarToWorld(sat.ring, sat.angle)
        const d = Math.hypot(w.x - pointer.x, w.y - pointer.y)
        if (d <= bestDist) {
            bestDist = d
            nearest = sat.id
        }
    }
    return nearest
}

export async function setupScene(
    container: HTMLElement,
    rings: number
): Promise<RendererState> {
    try {
        const size = 520
        const app = new Application()
        await app.init({
            width: size,
            height: size,
            backgroundColor: BACKGROUND,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        })
        container.appendChild(app.canvas)
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.3)'
        app.canvas.style.borderRadius = '12px'
        app.canvas.style.boxShadow = '0 0 30px rgba(6, 182, 212, 0.3)'
        app.canvas.style.touchAction = 'none'
        app.canvas.style.maxWidth = '100%'
        app.canvas.style.height = 'auto'

        const scene = new Graphics()
        app.stage.addChild(scene)
        const layout = buildLayout(size, size, rings)
        return { app, scene, layout }
    } catch (error) {
        while (container.firstChild) {
            container.removeChild(container.firstChild)
        }
        throw new Error(`Failed to initialize PixiJS: ${error}`)
    }
}

function beamLength(layout: SceneLayout): number {
    return ringRadius(Math.max(0, layout.rings - 1)) * 1.25 * layout.scale
}

export function render(
    rendererState: RendererState,
    state: SatelliteSyncState
): void {
    const { scene, layout } = rendererState
    scene.clear()

    for (let r = 0; r < layout.rings; r++) {
        const center = worldToPixel({ x: 0, y: 0 }, layout)
        scene.circle(center.x, center.y, ringRadius(r) * layout.scale).stroke({
            color: RING_COLOR,
            width: 1,
            alpha: 0.4,
        })
    }

    const bodyCenter = worldToPixel({ x: 0, y: 0 }, layout)
    scene.circle(bodyCenter.x, bodyCenter.y, layout.scale * 0.18).fill(BODY_COLOR)

    for (const obs of state.obstacles) {
        const p = worldToPixel(polarToWorld(obs.ring, obs.currentAngle), layout)
        scene.circle(p.x, p.y, obs.radius * layout.scale).fill(OBSTACLE_COLOR)
    }

    for (const sat of state.satellites) {
        const sp = worldToPixel(polarToWorld(sat.ring, sat.angle), layout)
        const rad = (sat.aimAngle * Math.PI) / 180
        const len = beamLength(layout)
        const beamEnd = {
            x: sp.x + Math.sin(rad) * len,
            y: sp.y - Math.cos(rad) * len,
        }
        const beamColor = BEAM_COLORS[sat.color] ?? 0x22d3ee
        scene.moveTo(sp.x, sp.y).lineTo(beamEnd.x, beamEnd.y).stroke({
            color: beamColor,
            width: sat.lockedTargetId ? 5 : 3,
            alpha: sat.lockedTargetId ? 1 : 0.7,
        })
        scene.circle(sp.x, sp.y, layout.scale * 0.12).fill(beamColor)
    }

    for (const target of state.targets) {
        const tp = worldToPixel(
            polarToWorld(target.ring, target.currentAngle),
            layout
        )
        const color = BEAM_COLORS[target.color] ?? 0x22d3ee
        const r = layout.scale * (target.locked ? 0.16 : 0.12)
        scene.circle(tp.x, tp.y, r).fill({ color, alpha: target.locked ? 1 : 0.45 })
        scene.circle(tp.x, tp.y, r).stroke({ color, width: 2 })
    }
}

export function cleanup(rendererState: RendererState): void {
    rendererState.app.destroy(true, { children: true, texture: true })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:run src/lib/games/satellite-sync/renderer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/satellite-sync/renderer.ts src/lib/games/satellite-sync/renderer.test.ts
git commit -m "feat(satellite-sync): add PixiJS orbital renderer"
```

---

### Task 7: Wiring layer (init.ts)

**Files:**
- Create: `src/lib/games/satellite-sync/init.ts`
- Create: `src/lib/games/satellite-sync/init.test.ts`

**Interfaces:**
- Consumes: `SatelliteSyncGame` from `./game`, renderer functions from `./renderer`, `saveGameScore` from `@/lib/services/scoreService`, `GameID` from `@/lib/games`, geometry `bearing`.
- Produces: `initializeSatelliteSync(container, callbacks)` returning `{ start, stop, cleanup, getGame }`.

- [ ] **Step 1: Write the failing init tests**

Create `src/lib/games/satellite-sync/init.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeSatelliteSync } from './init'

vi.mock('pixi.js', () => {
    const mockApp = {
        canvas: document.createElement('canvas'),
        init: vi.fn().mockResolvedValue(undefined),
        stage: { addChild: vi.fn() },
        destroy: vi.fn(),
    }
    return {
        Application: vi.fn(() => mockApp),
        Graphics: vi.fn(function (this: unknown) {
            return {
                clear: vi.fn(),
                circle: vi.fn().mockReturnThis(),
                moveTo: vi.fn().mockReturnThis(),
                lineTo: vi.fn().mockReturnThis(),
                stroke: vi.fn().mockReturnThis(),
                fill: vi.fn().mockReturnThis(),
                destroy: vi.fn(),
            }
        }),
    }
})

vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn(
        (
            _id: unknown,
            _score: unknown,
            onSuccess?: (r: { newAchievements?: string[] }) => void
        ) => {
            onSuccess?.({ newAchievements: [] })
            return Promise.resolve()
        }
    ),
}))

function setupDom(): HTMLElement {
    document.body.innerHTML = `
        <div id="game-canvas-container"></div>
        <span id="score">0</span>
        <span id="time-remaining">--</span>
        <span id="level">1</span>
        <button id="start-btn"></button>
        <button id="end-btn" style="display:none"></button>
        <div id="game-over-overlay" class="hidden">
            <h2 id="game-over-title"></h2>
            <span id="final-score">0</span>
            <button id="play-again-btn"></button>
        </div>
    `
    return document.getElementById('game-canvas-container')!
}

describe('initializeSatelliteSync', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    it('returns a handle with start/stop/cleanup/getGame', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, {
            onGameStart: vi.fn(),
            onTimeUpdate: vi.fn(),
            onScoreUpdate: vi.fn(),
            onLock: vi.fn(),
            onLevelClear: vi.fn(),
            onFail: vi.fn(),
            onWin: vi.fn(),
        })
        expect(typeof handle.start).toBe('function')
        expect(typeof handle.stop).toBe('function')
        expect(typeof handle.cleanup).toBe('function')
        expect(typeof handle.getGame).toBe('function')
        handle.cleanup()
    })

    it('starts the game and updates the time element', async () => {
        const container = setupDom()
        const onTime = vi.fn()
        const handle = await initializeSatelliteSync(container, {
            onGameStart: vi.fn(),
            onTimeUpdate: onTime,
            onScoreUpdate: vi.fn(),
            onLock: vi.fn(),
            onLevelClear: vi.fn(),
            onFail: vi.fn(),
            onWin: vi.fn(),
        })
        await handle.start()
        const timeEl = document.getElementById('time-remaining')!
        expect(timeEl.textContent).toBe('60')
        handle.cleanup()
    })

    it('submits the score and shows the overlay on fail', async () => {
        const { saveGameScore } = await import('@/lib/services/scoreService')
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, {
            onGameStart: vi.fn(),
            onTimeUpdate: vi.fn(),
            onScoreUpdate: vi.fn(),
            onLock: vi.fn(),
            onLevelClear: vi.fn(),
            onFail: vi.fn(),
            onWin: vi.fn(),
        })
        await handle.start()
        vi.advanceTimersByTime(61_000)
        await Promise.resolve()
        expect(saveGameScore).toHaveBeenCalled()
        expect(
            document.getElementById('game-over-overlay')!.classList.contains('hidden')
        ).toBe(false)
        handle.cleanup()
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run src/lib/games/satellite-sync/init.test.ts`
Expected: FAIL — `./init` does not exist.

- [ ] **Step 3: Implement init.ts**

Create `src/lib/games/satellite-sync/init.ts`:

```typescript
import { SatelliteSyncGame } from './game'
import {
    setupScene,
    render,
    pointerToSatellite,
    pixelToWorld,
    cleanup as rendererCleanup,
    type RendererState,
} from './renderer'
import { polarToWorld, bearing } from './geometry'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'
import type { SatelliteSyncCallbacks } from './types'

export interface SatelliteSyncHandle {
    start: () => Promise<void>
    stop: () => void
    cleanup: () => void
    getGame: () => SatelliteSyncGame | null
}

export interface SatelliteSyncUICallbacks extends SatelliteSyncCallbacks {
    onError?: (title: string, message: string) => void
}

function setText(id: string, value: string): void {
    const el = document.getElementById(id)
    if (el) {
        el.textContent = value
    }
}

function showOverlay(title: string, score: number): void {
    setText('game-over-title', title)
    setText('final-score', score.toString())
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

export async function initializeSatelliteSync(
    container: HTMLElement,
    callbacks: SatelliteSyncUICallbacks
): Promise<SatelliteSyncHandle> {
    let game: SatelliteSyncGame | null = null
    let renderer: RendererState | null = null
    let draggingSatId: string | null = null
    let rafId: number | null = null
    let lastFrame = 0

    const pointerHandlers: {
        down: ((e: PointerEvent) => void) | null
        move: ((e: PointerEvent) => void) | null
        up: ((e: PointerEvent) => void) | null
    } = { down: null, move: null, up: null }

    const teardownRenderer = (): void => {
        if (rafId !== null) {
            cancelAnimationFrame(rafId)
            rafId = null
        }
        if (renderer) {
            if (pointerHandlers.down) {
                renderer.app.canvas.removeEventListener('pointerdown', pointerHandlers.down)
            }
            if (pointerHandlers.move) {
                window.removeEventListener('pointermove', pointerHandlers.move)
            }
            if (pointerHandlers.up) {
                window.removeEventListener('pointerup', pointerHandlers.up)
            }
            rendererCleanup(renderer)
            renderer = null
        }
        pointerHandlers.down = null
        pointerHandlers.move = null
        pointerHandlers.up = null
        while (container.firstChild) {
            container.removeChild(container.firstChild)
        }
    }

    const loop = (ts: number): void => {
        if (!game || !renderer) {
            return
        }
        if (lastFrame === 0) {
            lastFrame = ts
        }
        const dt = ts - lastFrame
        lastFrame = ts
        game.update(dt)
        render(renderer, game.getState())
        if (game.getState().status === 'playing') {
            rafId = requestAnimationFrame(loop)
        }
    }

    const submitScore = async (score: number): Promise<void> => {
        if (!game || score <= 0) {
            return
        }
        const surfaceError = (message: string) =>
            callbacks.onError?.('Score Not Saved', `Score could not be submitted: ${message}`)
        try {
            await saveGameScore(
                GameID.SATELLITE_SYNC,
                score,
                result => {
                    if (result.newAchievements?.length) {
                        window.dispatchEvent(
                            new CustomEvent('achievementsEarned', {
                                detail: { achievementIds: result.newAchievements },
                            })
                        )
                    }
                },
                error => surfaceError(typeof error === 'string' ? error : 'Unknown error'),
                game.getGameData()
            )
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            surfaceError(message)
        }
    }

    const start = async (): Promise<void> => {
        if (game) {
            game.cleanup()
        }
        teardownRenderer()

        const sceneRings = Math.max(...SATELLITE_SYNC_LEVELS.map(l => l.rings))
        renderer = await setupScene(container, sceneRings)

        game = new SatelliteSyncGame({
            onGameStart: () => {
                callbacks.onGameStart()
                lastFrame = 0
                rafId = requestAnimationFrame(loop)
            },
            onTimeUpdate: t => {
                setText('time-remaining', t.toString())
                callbacks.onTimeUpdate(t)
            },
            onScoreUpdate: sc => {
                setText('score', sc.toString())
                callbacks.onScoreUpdate(sc)
            },
            onLock: info => callbacks.onLock(info),
            onLevelClear: level => {
                setText('level', level.toString())
                if (renderer && game) {
                    render(renderer, game.getState())
                }
                callbacks.onLevelClear(level)
            },
            onFail: (level, finalScore) => {
                if (rafId !== null) {
                    cancelAnimationFrame(rafId)
                    rafId = null
                }
                showOverlay("TIME'S UP!", finalScore)
                callbacks.onFail(level, finalScore)
                void submitScore(finalScore)
            },
            onWin: finalScore => {
                if (rafId !== null) {
                    cancelAnimationFrame(rafId)
                    rafId = null
                }
                showOverlay('MISSION COMPLETE!', finalScore)
                callbacks.onWin(finalScore)
                void submitScore(finalScore)
            },
        })

        const toPointerSat = (event: PointerEvent): string | null => {
            if (!renderer) {
                return null
            }
            const rect = renderer.app.canvas.getBoundingClientRect()
            const scaleX = rect.width / renderer.app.canvas.width
            const scaleY = rect.height / renderer.app.canvas.height
            const px = (event.clientX - rect.left) / scaleX
            const py = (event.clientY - rect.top) / scaleY
            return pointerToSatellite(px, py, game!.getState().satellites, renderer.layout)
        }

        const aimAngleFromPointer = (event: PointerEvent, satId: string): number => {
            if (!renderer || !game) {
                return 0
            }
            const rect = renderer.app.canvas.getBoundingClientRect()
            const scaleX = rect.width / renderer.app.canvas.width
            const scaleY = rect.height / renderer.app.canvas.height
            const px = (event.clientX - rect.left) / scaleX
            const py = (event.clientY - rect.top) / scaleY
            const sat = game.getState().satellites.find(s => s.id === satId)
            if (!sat) {
                return 0
            }
            const satWorld = polarToWorld(sat.ring, sat.angle)
            const pointerWorld = pixelToWorld(px, py, renderer.layout)
            return bearing(satWorld, pointerWorld)
        }

        pointerHandlers.down = (event: PointerEvent) => {
            if (!game || game.getState().status !== 'playing') {
                return
            }
            const satId = toPointerSat(event)
            if (satId) {
                draggingSatId = satId
                game.beginAim(satId)
                game.updateAim(satId, aimAngleFromPointer(event, satId))
            }
        }
        pointerHandlers.move = (event: PointerEvent) => {
            if (!game || !draggingSatId) {
                return
            }
            game.updateAim(draggingSatId, aimAngleFromPointer(event, draggingSatId))
        }
        pointerHandlers.up = () => {
            if (!game || !draggingSatId) {
                return
            }
            game.endAim(draggingSatId)
            draggingSatId = null
        }

        renderer.app.canvas.addEventListener('pointerdown', pointerHandlers.down)
        window.addEventListener('pointermove', pointerHandlers.move)
        window.addEventListener('pointerup', pointerHandlers.up)

        game.start()
        setText('level', '1')
        render(renderer, game.getState())
    }

    const stop = (): void => {
        game?.stop()
    }

    const cleanup = (): void => {
        game?.cleanup()
        game = null
        teardownRenderer()
    }

    return { start, stop, cleanup, getGame: () => game }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:run src/lib/games/satellite-sync/init.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/satellite-sync/init.ts src/lib/games/satellite-sync/init.test.ts
git commit -m "feat(satellite-sync): add init wiring with pointer input"
```

---

### Task 8: Game page + achievements

**Files:**
- Create: `src/pages/satellite-sync/index.astro`
- Modify: `src/lib/achievements.ts` (import, union, definitions)

**Interfaces:**
- Consumes: `initializeSatelliteSync` from the init module; canonical element IDs; `SatelliteSyncGameData` for achievement checks.

- [ ] **Step 1: Create the game page**

Create `src/pages/satellite-sync/index.astro`:

```astro
---
import AppLayout from '@/layouts/AppLayout.astro'
import Button from '@/components/ui/Button.astro'
import Card from '@/components/ui/Card.astro'
import Badge from '@/components/ui/Badge.astro'
import GameOverlay from '@/components/GameOverlay.astro'
import AchievementAward from '@/components/AchievementAward.astro'

const gameNavigation = [
  { href: '/', label: 'Home' },
  { href: '#', label: 'Satellite Sync' },
]
---

<AppLayout
  title="Satellite Sync - Cetus Minigames"
  description="Align orbital satellite beams with their targets before the timer expires"
  includeFooter={false}
  navigation={gameNavigation}
>
  <div class="px-6 py-4 border-b border-slate-700/50">
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center space-x-3">
        <div class="text-cyan-400 text-sm">🛰️ Satellite Sync</div>
      </div>
    </div>
  </div>

  <div class="px-6 py-8">
    <div class="max-w-6xl mx-auto">
      <div class="text-center mb-8">
        <h2 class="text-5xl font-orbitron font-bold text-holographic mb-4">
          SATELLITE SYNC
        </h2>
        <p class="text-gray-400 text-lg">
          Drag each satellite beam onto its matching target to lock on before the
          timer expires!
        </p>
      </div>

      <div class="flex flex-col lg:flex-row gap-8 items-start justify-center">
        <Card variant="glass" class="p-6 flex-shrink-0 w-full lg:w-auto">
          <div class="flex flex-col items-center space-y-4">
            <div class="flex space-x-4 mb-2">
              <Badge variant="outline" class="px-4 py-2">
                <span class="font-mono"
                  >Level: <span id="level" class="text-cyan-400">1</span></span
                >
              </Badge>
              <Badge variant="outline" class="px-4 py-2">
                <span class="font-mono"
                  >Time: <span id="time-remaining" class="text-cyan-400"
                    >--</span
                  >s</span
                >
              </Badge>
              <Badge variant="outline" class="px-4 py-2">
                <span class="font-mono"
                  >Score: <span id="score" class="text-cyan-400">0</span></span
                >
              </Badge>
            </div>

            <div class="relative w-full">
              <div
                id="game-canvas-container"
                class="bg-black/30 rounded-lg min-w-[240px] min-h-[240px] w-full"
              >
              </div>

              <div
                id="game-status"
                class="absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg"
              >
                <div class="text-center">
                  <div class="text-6xl mb-4">🛰️</div>
                  <div
                    class="text-xl text-cyan-400 font-orbitron font-bold mb-2"
                  >
                    SATELLITE SYNC
                  </div>
                  <div class="text-gray-400">Press Start to begin the mission!</div>
                </div>
              </div>
            </div>

            <div class="flex space-x-3">
              <Button id="start-btn" variant="primary">Start Game</Button>
              <Button id="end-btn" variant="outline" style="display: none;"
                >End Game</Button
              >
            </div>

            <GameOverlay defaultTitle="MISSION COMPLETE!" buttonText="Play Again">
              <div class="text-lg text-gray-300">
                Final Score: <span id="final-score" class="text-cyan-400">0</span>
              </div>
            </GameOverlay>
          </div>
        </Card>

        <div class="flex flex-col space-y-6">
          <Card variant="glass" class="p-6">
            <h3 class="text-lg font-orbitron font-bold text-cyan-400 mb-4">
              HOW TO PLAY
            </h3>
            <ul class="space-y-2 text-sm text-gray-400">
              <li>• Drag a satellite to aim its beam</li>
              <li>• Release near a matching-color target to lock on</li>
              <li>• Asteroids block the beam — find a clear path</li>
              <li>• Lock targets quickly to build a combo multiplier</li>
              <li>• Clear every target before the timer hits zero</li>
            </ul>
          </Card>

          <Card variant="glass" class="p-6">
            <h3 class="text-lg font-orbitron font-bold text-cyan-400 mb-4">
              SCORING
            </h3>
            <div class="space-y-2 text-sm text-gray-300">
              <div class="flex justify-between">
                <span class="text-gray-400">Lock:</span><span>100 × combo</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Combo:</span><span>+0.5 per chain (max ×3)</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Level clear:</span><span>250 × level</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Time bonus:</span><span>×10 / sec left</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>

    <script>
      import { initializeSatelliteSync } from '@/lib/games/satellite-sync/init'

      let gameHandle: Awaited<
        ReturnType<typeof initializeSatelliteSync>
      > | null = null

      const init = async () => {
        const container = document.getElementById('game-canvas-container')!
        const statusEl = document.getElementById('game-status')!
        const errorEl = document.getElementById('game-error')!
        const overlay = document.getElementById('game-over-overlay')!
        const startBtn = document.getElementById('start-btn')!
        const endBtn = document.getElementById('end-btn')!
        const playAgainBtn = document.getElementById('play-again-btn')!

        const resetButtonState = () => {
          startBtn.style.display = 'inline-flex'
          endBtn.style.display = 'none'
        }

        try {
          gameHandle = await initializeSatelliteSync(container, {
            onGameStart: () => {
              statusEl.classList.add('hidden')
              errorEl.classList.add('hidden')
              overlay.classList.add('hidden')
              startBtn.style.display = 'none'
              endBtn.style.display = 'inline-flex'
            },
            onTimeUpdate: () => {},
            onScoreUpdate: () => {},
            onLock: () => {},
            onLevelClear: () => {},
            onFail: () => {
              resetButtonState()
            },
            onWin: () => {
              resetButtonState()
            },
            onError: (_title, message) => {
              errorEl.textContent = message
              errorEl.classList.remove('hidden')
            },
          })

          startBtn.addEventListener('click', async () => {
            startBtn.style.display = 'none'
            try {
              await gameHandle!.start()
            } catch (error) {
              errorEl.textContent =
                error instanceof Error
                  ? error.message
                  : 'Failed to start the game. Please try again.'
              errorEl.classList.remove('hidden')
              resetButtonState()
            }
          })

          endBtn.addEventListener('click', () => {
            gameHandle!.stop()
            statusEl.classList.remove('hidden')
            resetButtonState()
          })

          playAgainBtn.addEventListener('click', () => {
            overlay.classList.add('hidden')
            errorEl.classList.add('hidden')
            statusEl.classList.remove('hidden')
            resetButtonState()
          })
        } catch (error) {
          errorEl.textContent =
            error instanceof Error
              ? error.message
              : 'Failed to initialize the game. Please refresh the page.'
          errorEl.classList.remove('hidden')
          resetButtonState()
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init)
      } else {
        init()
      }

      window.addEventListener('beforeunload', () => {
        gameHandle?.cleanup()
      })
    </script>
  </div>
  <AchievementAward />
</AppLayout>
```

- [ ] **Step 2: Add the achievements**

In `src/lib/achievements.ts`:
- Add `SatelliteSyncGameData` to the type import from `'./games/shared/types'` (line 3-13).
- Add `| SatelliteSyncGameData` to the `AchievementCheckData` union (after `| CircuitHackerGameData`).
- Add the achievement definitions to the `ACHIEVEMENTS` array (after the Circuit Hacker block, before the closing `]`):

```typescript
    // Satellite Sync achievements
    {
        id: 'satellite_sync_welcome',
        name: 'First Sync',
        description: 'Welcome to Satellite Sync! You locked your first beam.',
        logo: '🛰️',
        gameId: GameID.SATELLITE_SYNC,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'satellite_sync_combo',
        name: 'Combo Commander',
        description: 'Reach a ×3 combo chain in Satellite Sync.',
        logo: '🔗',
        gameId: GameID.SATELLITE_SYNC,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as SatelliteSyncGameData
                return data.maxCombo >= 5
            },
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'satellite_sync_complete',
        name: 'Mission Complete',
        description: 'Clear all 8 Satellite Sync levels.',
        logo: '🏆',
        gameId: GameID.SATELLITE_SYNC,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as SatelliteSyncGameData
                return data.solved === true && data.levelsCleared === 8
            },
        },
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'satellite_sync_untouchable',
        name: 'Untouchable',
        description:
            'Clear the Satellite Sync mission keeping every level timer above 25%.',
        logo: '🛡️',
        gameId: GameID.SATELLITE_SYNC,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as SatelliteSyncGameData
                return data.solved === true && data.minTimeRemainingRatio >= 0.25
            },
        },
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'satellite_sync_highcommand',
        name: 'High Command',
        description: 'Score 15,000 or more in Satellite Sync.',
        logo: '⭐',
        gameId: GameID.SATELLITE_SYNC,
        condition: {
            type: 'score_threshold',
            threshold: 15000,
        },
        rarity: AchievementRarity.LEGENDARY,
    },
```

- [ ] **Step 3: Run lint and type checks**

Run: `bun run lint` then `bun run astro check`
Expected: PASS with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/satellite-sync/index.astro src/lib/achievements.ts
git commit -m "feat(satellite-sync): add game page and achievements"
```

---

### Task 9: Final verification

**Files:**
- No new files.

- [ ] **Step 1: Run the full test suite**

Run: `bun run test:run`
Expected: All satellite-sync tests pass and no existing tests regress.

- [ ] **Step 2: Lint and type-check the whole project**

Run: `bun run lint && bun run astro check`
Expected: PASS.

- [ ] **Step 3: Smoke test in the browser**

Run: `bun run web:dev` (and `bun run db:dev` if not already running). Open `http://localhost:4325`:
- Confirm the **Satellite Sync** card appears with 🛰️ icon, Medium difficulty, 6-8 minutes duration, and Play Now links to `/satellite-sync`.
- Open the page, press **Start**, and verify: the orbital scene renders, dragging a satellite aims its beam, releasing near a matching target locks it, the timer counts down, and clearing all targets advances the level.
- Verify timer expiry shows the fail overlay; clearing level 8 shows the mission-complete overlay.
- Verify mobile (resize to a narrow viewport / device emulation): touch-drag aiming works.

- [ ] **Step 4: Final commit if any fixes were needed**

If Steps 1-3 surfaced fixes, commit them. Otherwise no commit.

```bash
git add -A
git commit -m "fix(satellite-sync): address verification findings"
```

---

## Self-Review Notes

- **Spec coverage:** Core mechanics (geometry lock-on) → Task 2; combos/scoring → Task 3; 8 authored levels + solvability → Task 4; level flow/fail/win/gameData → Task 5; orbital rendering + input → Tasks 6-7; home page + page + score submission → Tasks 1, 7, 8; achievements → Task 8; desktop+mobile → Task 6 (pointer events) verified Task 9.
- **Type consistency:** `GameID.SATELLITE_SYNC`, `BeamColor`, `findLockableTarget(satWorld, color, aim, targets, obstacles, snapThreshold)`, `SatelliteSyncGame` method names (`start/stop/cleanup/update/beginAim/updateAim/endAim/aimAtTarget/getState/getGameData`), renderer exports (`setupScene/render/pointerToSatellite/pixelToWorld/buildLayout/cleanup`), and `SatelliteSyncGameData` fields are used identically across tasks.
- **Note on `aimAtTarget`:** a test/DI helper on the game class that sets a perfect aim at a given target; production input in `init.ts` uses real pointer math (`updateAim`). Both converge on the same `applyLock` path.
