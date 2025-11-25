# Research: 2048 Game Implementation

**Feature**: 001-2048-game  
**Date**: 2025-11-24

## Overview

This document consolidates research findings for implementing the 2048 game in the Cetus platform.

---

## 1. Game Mechanics

### Decision: Classic 2048 Rules
**Rationale**: The classic 2048 mechanics are well-understood and provide the expected user experience. Deviating would confuse players familiar with the original game.

**Implementation Details**:
- 4x4 grid (16 cells)
- Initial spawn: 2 tiles with value 2 or 4 (90% probability for 2)
- After each valid move: spawn 1 new tile (2 or 4, 90/10 split)
- Tiles slide until hitting edge or another tile
- Matching tiles merge into sum (2+2=4, 4+4=8, etc.)
- Each tile can only merge once per move
- Win condition: Create a 2048 tile (continue playing allowed)
- Lose condition: No valid moves (grid full + no adjacent matches)

**Alternatives Considered**:
- 5x5 grid: Rejected - too easy, not classic experience
- 3x3 grid: Rejected - too difficult, frustrating gameplay
- Different spawn probabilities: Rejected - 90/10 is industry standard

---

## 2. Rendering Approach

### Decision: PixiJS Canvas Rendering
**Rationale**: Consistent with other Cetus games (Tetris, Reflex, Evader). PixiJS provides smooth animations and efficient rendering for tile movements and merges.

**Implementation Details**:
- Container dimensions: 400x400 pixels (100px per tile)
- Tile size: 90x90 pixels with 10px gap
- Color scheme: Gradient based on tile value (sci-fi neon theme)
- Animation: Tile slide ~100ms, merge pop ~150ms
- Text: Tile values rendered with PixiJS Text, responsive font size

**Alternatives Considered**:
- DOM-based rendering: Rejected - less smooth animations, harder to achieve sci-fi effects
- CSS Grid: Rejected - animation complexity, inconsistent with other games
- Canvas 2D (raw): Rejected - PixiJS already in use, more work for same result

---

## 3. Input Handling

### Decision: Keyboard + Touch Swipe Gestures
**Rationale**: Support both desktop (arrow keys) and mobile (swipe) users for full accessibility.

**Implementation Details**:
- Keyboard: Arrow keys (up, down, left, right)
- Touch: Swipe detection with minimum threshold (30px)
- Input debouncing: Block new input until animation completes (~200ms)
- Invalid move detection: If board state unchanged, no new tile spawns

**Touch Detection Algorithm**:
```
touchStart → record startX, startY
touchMove → calculate deltaX, deltaY
touchEnd → if max(|deltaX|, |deltaY|) > 30px:
            if |deltaX| > |deltaY|: horizontal swipe (left/right)
            else: vertical swipe (up/down)
```

**Alternatives Considered**:
- WASD keys: Rejected - not intuitive for puzzle games
- Click/tap direction buttons: Could add as accessibility fallback

---

## 4. Score Calculation

### Decision: Standard 2048 Scoring
**Rationale**: Industry-standard scoring ensures fair competition and familiar experience.

**Implementation Details**:
- Score = Sum of all merged tile values during gameplay
- When two 4s merge → score += 8
- When two 8s merge → score += 16
- Score displayed in real-time during gameplay
- Final score submitted on game over or manual end

**Alternatives Considered**:
- Time-based bonuses: Rejected - 2048 is strategy, not speed
- Combo multipliers: Rejected - not standard, changes game balance

---

## 5. Achievement Integration

### Decision: Score-Based + Tile Milestone Achievements
**Rationale**: Follow existing achievement patterns with game-specific tile milestones.

**Proposed Achievements**:

| ID | Name | Description | Condition | Rarity |
|----|------|-------------|-----------|--------|
| 2048_welcome | First Slide | Welcome to 2048! You scored your first points. | score >= 1 | Common |
| 2048_novice | 2048 Novice | Score 500 points in 2048 | score >= 500 | Common |
| 2048_apprentice | 2048 Apprentice | Score 1000 points in 2048 | score >= 1000 | Common |
| 2048_expert | 2048 Expert | Score 2500 points in 2048 | score >= 2500 | Rare |
| 2048_master | 2048 Master | Score 5000 points in 2048 | score >= 5000 | Epic |
| 2048_tile_256 | Power of Two | Create a 256 tile | in_game: maxTile >= 256 | Common |
| 2048_tile_512 | Halfway There | Create a 512 tile | in_game: maxTile >= 512 | Common |
| 2048_tile_1024 | Almost There | Create a 1024 tile | in_game: maxTile >= 1024 | Rare |
| 2048_tile_2048 | 2048 Champion | Create a 2048 tile | in_game: maxTile >= 2048 | Epic |
| 2048_tile_4096 | Beyond 2048 | Create a 4096 tile | in_game: maxTile >= 4096 | Legendary |

**Alternatives Considered**:
- Move-count achievements: Rejected - encourages inefficient play
- Time-based achievements: Rejected - 2048 is not a speed game

---

## 6. Color Scheme

### Decision: Sci-Fi Neon Gradient Theme
**Rationale**: Match Cetus platform aesthetic while maintaining tile value readability.

**Tile Colors** (PixiJS hex format):

| Value | Background | Text Color | Notes |
|-------|------------|------------|-------|
| 2 | 0x1a1a2e | 0x00ffff (cyan) | Dark base, neon text |
| 4 | 0x16213e | 0x00ffff | Slightly lighter |
| 8 | 0x0f3460 | 0xffffff | Blue tint |
| 16 | 0x533483 | 0xffffff | Purple range |
| 32 | 0x7b2cbf | 0xffffff | Deeper purple |
| 64 | 0xe94560 | 0xffffff | Pink/red |
| 128 | 0xff6b6b | 0x1a1a2e | Coral, dark text |
| 256 | 0xffd93d | 0x1a1a2e | Yellow glow |
| 512 | 0x6bcb77 | 0x1a1a2e | Green |
| 1024 | 0x4d96ff | 0xffffff | Bright blue |
| 2048 | 0x00ffff | 0x1a1a2e | Cyan glow (victory!) |
| 4096+ | 0xff00ff | 0xffffff | Magenta (legendary) |

---

## 7. Game State Persistence

### Decision: No Mid-Game Persistence
**Rationale**: Consistent with other Cetus games. Only final scores are persisted.

**Implementation Details**:
- Game state lives in memory only
- Browser refresh/close = game lost
- Score submission on game over or manual "End Game"
- Authenticated users get scores saved to database
- Guest users can play but scores not persisted

**Alternatives Considered**:
- LocalStorage save: Rejected - complexity, inconsistent with platform
- Server-side save: Rejected - overkill for casual game

---

## 8. GameID Registration

### Decision: Add GAME_2048 to GameID Enum
**Rationale**: Required for score service and achievement integration.

**Implementation**:
```typescript
// In src/lib/games.ts
export enum GameID {
    // ... existing games
    GAME_2048 = '2048',
}
```

**Database Compatibility**: The game_scores table accepts string game_id, no migration needed.

---

## Summary

All research questions resolved. No NEEDS CLARIFICATION items remain. Ready to proceed to Phase 1: Design & Contracts.
