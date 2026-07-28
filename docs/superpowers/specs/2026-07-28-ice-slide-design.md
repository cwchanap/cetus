# Ice Slide — Design Spec

- **Linear issue:** [HPA-76 — Minigame: Ice Slide](https://linear.app/cwchanap/issue/HPA-76/minigame-ice-slide)
- **Date:** 2026-07-28
- **Status:** Approved design, ready for implementation

## Overview

Ice Slide is a sci-fi slippery-tile movement puzzle, the 15th game on the Cetus
platform. The player chooses a cardinal direction and slides across ice until
stopped by a wall, rock, or boundary — then repeats until they land on the goal.
Optional holes reset the level; crystals grant bonus points when collected.

It is a multi-level game: a sequence of 8 authored levels of rising difficulty
(larger boards, denser obstacles, hazards, and crystals). A full run targets the
issue's **2–6 minute** round length. The game is rendered on a PixiJS canvas and
integrated into the existing leaderboard, achievement, and home-page systems.

## Gameplay & Flow

1. Player presses **Start** → level 1 loads; an elapsed-time clock begins.
2. Player issues a move (arrow keys / WASD / swipe). The avatar slides in that
   direction across ice until it would enter a blocking cell, then stops on the
   last valid ice/goal/crystal cell. Each committed slide counts as **one move**.
3. **Crystal:** sliding onto or through a crystal collects it (removed from the
   board) and continues the slide.
4. **Hazard (hole):** entering a hole fails the attempt — player snaps back to
   the level start, crystals on that level are restored, move count keeps the
   failed move.
5. **Level cleared:** player stops on the goal → level-clear + move-efficiency +
   crystal bonuses awarded → next level loads.
6. **Mission complete:** level 8 cleared → win overlay; final score submitted
   (when logged in). Overlay shows move count and elapsed time.
7. **Reset** reloads the current level (keeps run score and elapsed time; adds
   nothing; move count for the level restarts).
8. **Restart / End** ends the run; accumulated score is submitted if > 0.

There is no hard fail timer — scoring rewards fewer moves and faster completion.

## Scene & Mechanics

**Cell types:**

| Glyph | Type     | Behavior |
|-------|----------|----------|
| `#`   | wall     | Impassable; slide stops on the cell before |
| `.`   | ice      | Slide continues through |
| `S`   | start    | Ice; initial player position (treated as ice after spawn) |
| `G`   | goal     | Landing here clears the level (stops the slide) |
| `O`   | rock     | Impassable obstacle (same stop rule as wall) |
| `H`   | hazard   | Entering resets the level attempt |
| `C`   | crystal  | Collectible on ice; remove on contact, continue sliding |

**Slide rule.** From the current cell, step one cell at a time in the chosen
direction. Before entering the next cell:

- If out of bounds, wall, or rock → stop on the current cell.
- If hazard → fall (level reset).
- If goal → move onto it and stop (level clear).
- If ice or crystal → move onto it (collect crystal if present) and continue.

A move that does not change position (already blocked adjacent) is a no-op and
does **not** increment the move counter.

**Controls (desktop + mobile).** Keyboard: arrow keys / WASD. Touch: swipe
gesture on the canvas (Pointer Events + delta threshold). Both use the same
`move(direction)` entry point.

## Level Progression

| # | Name            | Introduces                         | Size |
|---|-----------------|------------------------------------|------|
| 1 | First Frost     | Open ice corridor to goal          | 5×5  |
| 2 | Corner Pocket   | Forced corner banking via walls    | 6×6  |
| 3 | Bank Shot       | Multi-wall banking paths           | 7×7  |
| 4 | Thin Ice        | First hazard holes                 | 7×7  |
| 5 | Crystal Cache   | Crystals for bonus points          | 8×8  |
| 6 | Fracture Zone   | Hazards + rocks combined           | 8×8  |
| 7 | Deep Freeze     | Dense maze, crystals               | 9×9  |
| 8 | Absolute Zero   | Tightest layout, all mechanics     | 9×9  |

## Scoring

Pure functions in `scoring.ts`:

- **Level clear base:** `200 × levelNumber`
- **Move efficiency:** `max(0, (parMoves − movesUsed) × 25)` where `parMoves` is
  authored per level
- **Crystal bonus:** `50 × crystalsCollected` (this level)
- **Time bonus on mission complete:** `max(0, (360 − elapsedSeconds) × 5)`
  (rewards finishing under ~6 minutes)

Score accumulates across levels and is submitted once at run end via
`saveGameScore`.

`gameData` submitted with the score:

```ts
interface IceSlideGameData {
  levelsCleared: number
  totalMoves: number
  crystalsCollected: number
  elapsedSeconds: number
  solved: boolean
  perfectLevels: number // levels cleared at or under parMoves
}
```

## Architecture & File Structure

**Handle-based pattern** (Circuit Hacker / Satellite Sync): standalone game class
plus `createRunGuard` + `saveGameScore`.

```text
src/lib/games/ice-slide/
  types.ts      # CellType, Direction, LevelDef, State, GameData, Callbacks
  levels.ts     # 8 authored levels (string grids + parMoves)
  physics.ts    # PURE: parseGrid, findStart, slide(state, dir)
  scoring.ts    # PURE: levelClearPoints, moveBonus, crystalBonus, timeBonus
  game.ts       # IceSlideGame — level progression, move/reset, gameData
  renderer.ts   # PixiJS grid draw + swipe helpers
  init.ts       # initializeIceSlide → { start, stop, resetLevel, cleanup, getGame }
  *.test.ts
src/pages/ice-slide/index.astro
```

## Integration Points

- `GameID.ICE_SLIDE = 'ice_slide'` in `games.ts` (+ GAMES entry, icon `🧊`,
  organism `{ shape: 'lattice', color: 'ice' }`, depth `mid`, duration
  `2-6 minutes`, category `puzzle`)
- Page at `/ice-slide` via `getGameUrl`
- `IceSlideGameData` in shared types + achievements (~5)
- Homepage copy: fourteen → fifteen
- `game-board-markup.test.ts` includes `ice-slide`

## Achievements

| Achievement      | Rarity    | Condition |
|------------------|-----------|-----------|
| First Slide Out  | COMMON    | score ≥ 1 |
| Efficient Glide  | RARE      | `perfectLevels >= 3` |
| Crystal Collector| RARE      | `crystalsCollected >= 4` |
| Absolute Zero    | EPIC      | `solved === true` (all 8) |
| Ice Legend       | LEGENDARY | score ≥ 8,000 |

## Acceptance Criteria (from HPA-76)

- **Appears on the home page** with icon, duration, difficulty, and Play Now link
  → registry + SpecimenCard via `getGameUrl`.
- **Start / move / solve / reset / restart** → gameplay flow + init wiring.
- **Final score submitted** when logged in → `saveGameScore` + achievements.
- **Desktop and mobile controls** → keyboard + swipe via Pointer Events.
