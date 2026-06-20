# Circuit Hacker — Design Spec

- **Linear issue:** [HPA-69 — Minigame: Circuit Hacker](https://linear.app/cwchanap/issue/HPA-69/minigame-circuit-hacker)
- **Date:** 2026-06-19
- **Status:** Approved design, ready for implementation planning

## Overview

Circuit Hacker is a sci-fi tile-rotation puzzle, the 13th game on the Cetus
platform. The player rotates circuit tiles to form a powered path from a fixed
**source** node to one or more **core** nodes before a countdown timer expires.
It is a single-puzzle-per-run game with four difficulty tiers chosen up front,
rendered on a PixiJS canvas, and integrated into the existing leaderboard,
achievement, and home-page systems.

## Gameplay & Flow

1. Player picks a difficulty (Easy / Medium / Hard / Expert).
2. Player presses **Start** → a solvable, scrambled puzzle is generated and the
   countdown timer begins.
3. Player taps/clicks a tile → it rotates 90° clockwise → connectivity is
   recomputed → powered segments glow.
4. **Win:** all cores are powered → timer stops, final score is computed and
   submitted (when logged in). Win overlay shows stats.
5. **Fail:** timer reaches 0 before all cores are powered → fail overlay. No
   score is submitted.
6. **Restart / New Puzzle:** regenerates a fresh puzzle at the same difficulty.

Locked tiles (source and core) are not rotatable. Taps on blockers or locked
tiles are ignored.

## Difficulty Tiers

Starting values; tunable during implementation.

| Tier   | Grid  | Cores | Blockers | Timer | Score Multiplier |
|--------|-------|-------|----------|-------|------------------|
| Easy   | 5×5   | 1     | 0        | 120s  | ×1               |
| Medium | 7×7   | 1     | ~3       | 180s  | ×2               |
| Hard   | 9×9   | 2     | ~6       | 240s  | ×3.5             |
| Expert | 11×11 | 3     | ~10      | 300s  | ×5               |

All four tiers share a single per-game leaderboard ranked by final score, so the
multiplier lets harder tiers top the board.

## Circuit Model

- A tile has connectors on a subset of `{N, E, S, W}`.
- Tile types:
  - **straight** — 2 opposite connectors
  - **elbow** — 2 adjacent connectors
  - **T-junction** — 3 connectors
  - **cross** — 4 connectors
  - **source** — locked start node
  - **core** — locked endpoint node
- **Blockers** are empty cells with no tile.
- Rotating a tile rotates its connector set 90° clockwise.
- Two adjacent tiles **connect** only if both have connectors facing each other
  (e.g. tile A has an E connector and the tile to its east has a W connector).
- **Powered** = the set of cells reachable from the source via mutually-facing
  connectors, computed by BFS/flood-fill from the source. Recomputed every time
  a tile rotates.
- **Win condition:** every core cell is in the powered set. Loose or dangling
  tiles elsewhere on the board are allowed (path-to-core, not full-network).

## Puzzle Generation

The generator guarantees solvability by construction (no separate solver):

1. Place the source and core(s) on the grid.
2. Carve a guaranteed connecting path from the source to each core (e.g. random
   walk / routing on the grid), assigning each path cell a tile type whose
   connectors fit the path.
3. Fill remaining non-path cells with random valid tiles.
4. Drop blockers onto a selection of non-path cells (count per difficulty),
   never on the source, cores, or required path cells.
5. **Scramble**: randomly rotate every rotatable tile to a random orientation.

Because a valid solution exists by construction, the puzzle is always solvable.
Generation retries with a capped attempt count if a step fails (e.g. cannot
route all cores); on exhausting attempts it falls back to a simpler layout.

Rejected alternative: random fill + a solver to verify solvability. More code
and can loop on unsolvable boards.

## Scoring

```
finalScore = round( (base + timeBonus + rotationBonus) × tierMultiplier )
```

- `base = 1000`
- `timeBonus = secondsRemaining × 15`
- `rotationBonus = max(0, rotationBudget − rotationsUsed) × 25`
  - `rotationBudget = rotatableTileCount × 2`
- `tierMultiplier` per the difficulty table above.

`gameData` submitted with the score carries
`{ difficulty, secondsRemaining, rotationsUsed }` for history and future stats.
The leaderboard ranks on `finalScore` only. Failed runs submit no score (the
score service already skips submissions where `score <= 0`).

## Architecture & File Structure

Uses the core game framework (`BaseGame`, `BaseRenderer` + `RendererFactory`
PixiJS path), consistent with Evader and Bejeweled.

```
src/lib/games/circuit-hacker/
  types.ts       # tile types, connector directions, CircuitHackerState/Config/Stats, Difficulty enum
  game.ts        # CircuitHackerGame extends BaseGame: rotateTile, flood-fill power, win check, scoring
  generator.ts   # solvable puzzle generation + scramble
  renderer.ts    # CircuitHackerRenderer extends BaseRenderer (PixiJS): draw grid/tiles, power glow, pointer→cell hit-testing
  utils.ts       # connector rotation, opposite/adjacency helpers, scoring helpers
  init.ts        # wire game + renderer + GameTimer, difficulty selection, score submission, button/overlay state
  types.test.ts / game.test.ts / generator.test.ts / utils.test.ts / renderer.test.ts / init.test.ts
src/pages/circuit-hacker/index.astro   # all HTML structure: difficulty selector, score/time/rotation badges, canvas container, GameOverlay, controls, how-to-play
```

Per the project's Astro–TypeScript pattern, all HTML structure lives in the
Astro page; TypeScript only manipulates dynamic content and the canvas.

### Component Responsibilities

- **types.ts** — shared type definitions; no logic.
- **generator.ts** — pure puzzle construction; given a difficulty config, returns
  a solvable scrambled grid plus the known solution metadata used by tests.
- **utils.ts** — pure connector math (rotate connector set, opposite direction,
  do-two-cells-connect) and scoring helpers. Independently unit-testable.
- **game.ts** — owns game state and rules: applying a rotation, recomputing the
  powered set, detecting a win, tracking rotation count, computing final score.
  Depends on utils and generator.
- **renderer.ts** — pure presentation: draws the grid, tiles, and power glow, and
  maps a pointer event to a grid cell. No game rules.
- **init.ts** — wiring layer: difficulty selection, timer, event handlers,
  overlay/button state, and score submission.

## Integration Points

- `src/lib/games.ts`:
  - Add `CIRCUIT_HACKER = 'circuit_hacker'` to the `GameID` enum.
  - Add a `GAMES` entry: category `puzzle`, difficulty `medium`,
    `estimatedDuration: '2-5 minutes'`, appropriate tags, `isActive: true`.
  - Add a `GAME_ICONS` entry (proposed 🔌).
- `src/components/ui/GameCard.astro`: add
  `case 'Circuit Hacker': return '/circuit-hacker'` to `getGameUrl`.
- `src/pages/index.astro`: add an `idMapping` entry; optional
  `difficultyLabels` / `durationLabels` entries.
- `src/lib/server/validations.ts` and `scoreService.formatGameName` auto-derive
  from `GameID` — no changes required.
- `src/lib/achievements.ts`: add a small set of achievements — e.g. first solve,
  solve on Hard, solve on Expert, and a fast-solve bonus.

## Data Flow

1. Page load → `init.ts` reads the selected difficulty.
2. On **Start** → `generator` builds a solvable scrambled puzzle → game state
   initialized → renderer draws → `GameTimer` starts counting down.
3. Tap/click → renderer hit-tests pointer → cell → `game.rotateTile(row, col)` →
   game recomputes the powered set via flood-fill → renderer updates power glow →
   game checks win.
4. **Win** → timer stops → `game` computes `finalScore` →
   `saveGameScore(gameId, finalScore, onSuccess, onError, gameData)` →
   win overlay with stats; achievement/challenge notifications via existing hooks.
5. **Timer expiry** → timer stops → fail overlay; no score submitted.
6. **Restart / New Puzzle** → regenerate at the same difficulty, reset counters.

## Error Handling

- Puzzle generation retries with a capped attempt count; falls back to a simpler
  layout if it cannot route all cores.
- `saveGameScore` failures and the unauthenticated (401) case are handled
  non-blockingly, matching existing games — the game remains playable and the
  user is informed without an exception.
- Taps on blockers or locked (source/core) tiles are ignored.
- Pointer-to-cell math is clamped to grid bounds; out-of-bounds taps are no-ops.

## Testing Strategy

- **generator.test.ts** — every generated puzzle is solvable (the known solution
  connects source → all cores); grid dimensions, core count, and blocker count
  match the tier; scramble actually changes orientations.
- **utils.test.ts** — connector rotation, opposite direction, and the
  do-two-adjacent-cells-connect predicate; scoring helpers.
- **game.test.ts** — `rotateTile` updates orientation and increments the rotation
  count; flood-fill marks the correct powered cells; win detected when all cores
  are powered; final-score formula including tier multiplier; locked tiles do not
  rotate.
- **renderer.test.ts** — pointer→cell mapping; expected draw calls with PixiJS
  mocked (following existing renderer test patterns).
- **init.test.ts** — start/restart wiring; timer expiry → fail overlay and no
  submission; solve → `saveGameScore` called with the correct args and
  `gameData`; difficulty selection applies the right config.

## Acceptance Criteria (from HPA-69)

How this design satisfies each criterion:

- **Appears on the home page** with icon, duration, difficulty, and Play Now link
  → registry (`games.ts`) + `GameCard` route + `index.astro` wiring.
- **Start / solve / fail / restart** a puzzle → gameplay flow + `init.ts`.
- **Final score submitted** to the existing leaderboard/progress flow when logged
  in → `saveGameScore` + achievements integration.
- **Works on desktop and mobile controls** → tap/click rotation handled
  identically via PixiJS pointer events.
