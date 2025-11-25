# Data Model: 2048 Game

**Feature**: 001-2048-game  
**Date**: 2025-11-24

## Overview

This document defines the data model for the 2048 game implementation. All entities are defined as TypeScript interfaces for type safety.

---

## Entities

### 1. Position

Represents a coordinate on the game board.

```typescript
interface Position {
    row: number    // 0-3 (top to bottom)
    col: number    // 0-3 (left to right)
}
```

**Validation Rules**:
- `row` must be 0-3 (inclusive)
- `col` must be 0-3 (inclusive)

---

### 2. Tile

Represents a numbered tile on the board.

```typescript
interface Tile {
    id: string          // Unique identifier for animation tracking (e.g., "tile-1", "tile-2")
    value: number       // Power of 2: 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096...
    position: Position  // Current position on the board
    mergedFrom?: Tile[] // If this tile was created from a merge, references source tiles (for animation)
    isNew?: boolean     // True if tile was just spawned (for spawn animation)
}
```

**Validation Rules**:
- `id` must be unique within current game session
- `value` must be a power of 2 (2, 4, 8, 16, ...)
- `value` minimum is 2
- `position` must be valid (within board bounds)

**State Transitions**:
- NEW: Tile spawns with `isNew = true`, value 2 or 4
- MOVED: Tile position changes, `isNew` cleared
- MERGED: Two tiles combine, new tile created with `mergedFrom` populated
- DESTROYED: Tile removed from board (after merge animation)

---

### 3. Board

Represents the 4x4 game grid.

```typescript
type Board = (Tile | null)[][]  // 4x4 array, null = empty cell
```

**Structure**:
```
board[row][col]
  - board[0][0] = top-left
  - board[0][3] = top-right
  - board[3][0] = bottom-left
  - board[3][3] = bottom-right
```

**Validation Rules**:
- Must be exactly 4 rows × 4 columns
- Each cell contains either a `Tile` or `null`
- No two tiles can occupy the same position

---

### 4. Direction

Represents the four possible move directions.

```typescript
type Direction = 'up' | 'down' | 'left' | 'right'
```

---

### 5. MoveResult

Represents the outcome of a move operation.

```typescript
interface MoveResult {
    board: Board           // New board state after move
    moved: boolean         // True if any tiles moved
    scoreGained: number    // Points earned from merges in this move
    mergeCount: number     // Number of merges that occurred
    animations: Animation[] // Animation data for renderer
}
```

---

### 6. Animation

Data for rendering tile animations.

```typescript
interface Animation {
    type: 'move' | 'merge' | 'spawn'
    tileId: string
    from?: Position    // For move: starting position
    to: Position       // Target position
    value?: number     // For merge/spawn: tile value
}
```

---

### 7. GameState

Complete game state for the 2048 game.

```typescript
interface GameState {
    board: Board
    score: number
    gameStarted: boolean
    gameOver: boolean
    won: boolean           // True when 2048 tile created (can continue playing)
    moveCount: number      // Total moves made
    maxTile: number        // Highest tile value achieved
    lastMoveAnimations: Animation[]  // Animations from last move
    tileIdCounter: number  // For generating unique tile IDs
}
```

**Initial State**:
```typescript
{
    board: [[null, null, null, null], [null, null, null, null], [null, null, null, null], [null, null, null, null]],
    score: 0,
    gameStarted: false,
    gameOver: false,
    won: false,
    moveCount: 0,
    maxTile: 0,
    lastMoveAnimations: [],
    tileIdCounter: 0
}
```

**State Transitions**:
- IDLE → PLAYING: `startGame()` called, two tiles spawned, `gameStarted = true`
- PLAYING → WON: 2048 tile created, `won = true` (continue allowed)
- PLAYING/WON → GAME_OVER: No valid moves, `gameOver = true`
- ANY → IDLE: `resetGame()` called

---

### 8. GameStats

Statistics for achievement tracking and score submission.

```typescript
interface GameStats {
    finalScore: number
    maxTile: number
    moveCount: number
    mergeCount: number      // Total merges during game
    gameWon: boolean        // Did player reach 2048?
}
```

---

### 9. GameCallbacks

Callback interfaces for game lifecycle events.

```typescript
interface GameCallbacks {
    onScoreChange?: (score: number) => void
    onGameOver?: (finalScore: number, stats: GameStats) => void
    onWin?: () => void
    onMove?: (result: MoveResult) => void
}
```

---

## Relationships

```
GameState
├── Board (1:1)
│   └── Tile[] (0-16 tiles on board)
│       └── Position (1:1 per tile)
├── Animation[] (last move animations)
└── GameStats (derived on game over)
```

---

## Database Integration

The 2048 game uses the existing `game_scores` table. No new tables required.

**Score Submission Payload**:
```typescript
{
    gameId: '2048',         // GameID.GAME_2048
    score: number,          // Final score
    gameData: GameStats     // For achievement checking
}
```

**Achievement gameData Fields**:
- `maxTile`: For tile milestone achievements (256, 512, 1024, 2048, 4096)
- `mergeCount`: For potential future achievements
- `gameWon`: For 2048 Champion achievement validation
