# API Contracts: 2048 Game

**Feature**: 001-2048-game  
**Date**: 2025-11-24

## Overview

The 2048 game uses existing Cetus API endpoints for score submission and achievement tracking. No new API endpoints are required.

---

## Existing Endpoints Used

### POST /api/scores

Submit game score with achievement checking.

**Request**:
```typescript
{
    gameId: '2048',
    score: number,
    gameData?: {
        maxTile: number,      // Highest tile value achieved
        mergeCount: number,   // Total merges during game
        gameWon: boolean      // Did player reach 2048?
    }
}
```

**Response (Success)**:
```typescript
{
    success: true,
    newAchievements?: Array<{
        id: string,
        name: string,
        description: string,
        icon: string,
        rarity: 'common' | 'rare' | 'epic' | 'legendary'
    }>
}
```

**Response (Error - 401 Unauthorized)**:
```typescript
{
    success: false,
    error: 'You must be logged in to save scores'
}
```

**Response (Error - 400 Bad Request)**:
```typescript
{
    success: false,
    error: 'Invalid score data'
}
```

---

### GET /api/scores/history

Get user's game history.

**Query Parameters**:
- `limit` (optional): Number of records to return (default: 10)

**Response**:
```typescript
{
    history: Array<{
        game_id: string,
        game_name: string,
        score: number,
        created_at: string
    }>
}
```

---

### GET /api/scores/best

Get user's best score for a specific game.

**Query Parameters**:
- `gameId`: The game identifier ('2048')

**Response**:
```typescript
{
    bestScore: number | null
}
```

---

## Client-Side Integration

The game will use the existing `scoreService.ts` for all API interactions:

```typescript
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

// On game over
await saveGameScore(
    GameID.GAME_2048,  // '2048'
    finalScore,
    (result) => {
        // Handle success, show achievements
        if (result.newAchievements?.length > 0) {
            window.dispatchEvent(
                new CustomEvent('achievementsEarned', {
                    detail: { achievementIds: result.newAchievements }
                })
            )
        }
    },
    (error) => {
        console.error('Failed to submit score:', error)
    },
    gameStats  // { maxTile, mergeCount, gameWon }
)
```

---

## No New Contracts Required

The 2048 game operates entirely within the existing Cetus API infrastructure:

1. **Score Submission**: Uses existing `/api/scores` endpoint
2. **Achievement Checking**: Handled by existing `achievementService.ts`
3. **Leaderboard**: Uses existing leaderboard infrastructure
4. **User Profile**: Game history appears in existing profile views

The only additions are:
- New `GameID.GAME_2048` enum value
- New achievement definitions in `achievements.ts`
- New game metadata in `games.ts`
