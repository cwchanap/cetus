# Quickstart: 2048 Game Development

**Feature**: 001-2048-game  
**Date**: 2025-11-24

## Prerequisites

- Node.js 18+ installed
- Repository cloned: `git clone https://github.com/cwchanap/cetus.git`
- Feature branch checked out: `git checkout 001-2048-game`

---

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

This starts both the Turso database server and Astro dev server. The game will be accessible at `http://localhost:4325/2048/`.

### 3. Run in Database-Only or Web-Only Mode

```bash
# Database only (for database work)
npm run db:dev

# Web server only (if database already running)
npm run web:dev
```

---

## File Structure to Create

```
src/lib/games/2048/
├── types.ts        # Start here - define interfaces
├── game.ts         # Core game logic
├── renderer.ts     # PixiJS rendering
├── init.ts         # Initialization and event binding
├── utils.ts        # Helper functions
└── game.test.ts    # Unit tests

src/pages/2048/
└── index.astro     # Game page

e2e/games/
└── 2048.spec.ts    # E2E tests
```

---

## Development Workflow

### Step 1: Define Types (types.ts)

Create the data model interfaces first:
- `Position`, `Tile`, `Board`
- `Direction`, `MoveResult`, `Animation`
- `GameState`, `GameStats`, `GameCallbacks`

### Step 2: Implement Game Logic (game.ts)

Core functions to implement:
1. `createGameState()` - Initialize empty game state
2. `spawnTile(state)` - Add new tile to random empty cell
3. `move(state, direction)` - Process move and return result
4. `isGameOver(state)` - Check for valid moves
5. `startGame(state)` - Initialize with 2 tiles
6. `endGame(state)` - Finalize and return stats

### Step 3: Write Unit Tests (game.test.ts)

Test critical game logic:
- Tile spawning in empty cells
- Move mechanics (slide, merge)
- Single-merge-per-move rule
- Game over detection
- Score calculation

```bash
# Run tests
npm run test src/lib/games/2048/game.test.ts

# Run with watch mode
npm run test:watch
```

### Step 4: Create Renderer (renderer.ts)

PixiJS setup and rendering:
1. `setupPixiJS(container, config)` - Initialize PixiJS application
2. `draw(renderer, state)` - Render current game state
3. `animateMove(animations)` - Animate tile movements
4. Tile color mapping based on value

### Step 5: Create Initialization (init.ts)

Game entry point:
1. DOM element lookup
2. Event listener setup (keyboard, touch)
3. Game loop management
4. Score submission integration

### Step 6: Create Game Page (index.astro)

Follow existing game page patterns:
- AppLayout with game navigation
- Game container with specific ID
- GameOverlay component
- Start/End/Reset buttons
- Score display

### Step 7: Register Game

Update existing files:
- `src/lib/games.ts` - Add `GameID.GAME_2048` and game metadata
- `src/lib/achievements.ts` - Add 2048 achievements

### Step 8: E2E Tests (2048.spec.ts)

Playwright tests:
- Navigate to game page
- Start game
- Verify tile spawning
- Test keyboard controls
- Test game over detection

```bash
# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui
```

---

## Testing Commands

```bash
# Unit tests (Vitest)
npm run test                    # Watch mode
npm run test:run                # Single run
npm run test:coverage           # With coverage

# E2E tests (Playwright)
npm run test:e2e                # Run all
npm run test:e2e:ui             # With UI
npm run test:e2e:headed         # Browser visible
npm run test:e2e:debug          # Debug mode
```

---

## Code Quality

```bash
# Lint
npm run lint
npm run lint:fix

# Format
npm run format
npm run format:check
```

---

## Key Patterns to Follow

### 1. Astro-TypeScript Integration

HTML structure in `.astro` files, TypeScript only manipulates dynamic content:

```astro
<!-- In index.astro -->
<div id="game-2048-container" class="border-2 border-cyan-400/50">
  <!-- PixiJS renders tiles here -->
</div>
```

```typescript
// In init.ts - query existing element
const container = document.getElementById('game-2048-container')
```

### 2. Button State Pattern

```javascript
startBtn.addEventListener('click', () => {
  startBtn.style.display = 'none'
  endBtn.style.display = 'inline-flex'
  // Start game...
})
```

### 3. Score Submission Pattern

```typescript
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

await saveGameScore(
    GameID.GAME_2048,
    finalScore,
    (result) => {
        if (result.newAchievements?.length > 0) {
            window.dispatchEvent(
                new CustomEvent('achievementsEarned', {
                    detail: { achievementIds: result.newAchievements }
                })
            )
        }
    },
    (error) => console.error(error),
    gameStats
)
```

---

## Debugging

- Browser DevTools for canvas inspection
- Game instance: `window.game2048?.getState()`
- Console logs in `init.ts` for state debugging
