# GitHub Copilot Instructions for Cetus

This repository contains Cetus, a sci-fi themed single-player minigames platform built with Astro and Tailwind CSS.

## Project Context

### Overview
Cetus is a futuristic single-player gaming platform featuring interactive minigames including Tetris, Bubble Shooter, Memory Matrix, Quick Math, Word Scramble, Reflex Coin Collection, and Sudoku. The application features a modern, neon-styled design with gradients, glowing effects, and animated backgrounds, plus a comprehensive achievement system.

### Tech Stack
- **Framework**: Astro 5.10.1 with TypeScript
- **Styling**: Tailwind CSS 4.1.3 with custom sci-fi theme + tw-animate-css
- **Authentication**: Better Auth 1.2.12 with Google OAuth integration
- **Database**: LibSQL/SQLite with Turso, Kysely 0.28.2 as query builder
- **UI Components**: Custom component library following shadcn/ui patterns
- **Graphics**: PixiJS 8.10.2 for canvas-based drawing functionality
- **Testing**: Vitest 3.2.4 (unit tests), Playwright 1.54.1 (E2E tests)
- **Utilities**: clsx, tailwind-merge, class-variance-authority for styling

## Code Style & Patterns

### Architecture & Database
- **Database**: LibSQL/SQLite with Kysely for type-safe queries
- **Auth**: Better Auth handles user sessions, OAuth providers, and account management
- **Tables**: `user`, `session`, `account`, `verification` (auth), `game_scores`, `user_stats`, `user_achievements`
- **Achievement System**: Code-defined achievements with dynamic progress tracking
- **Score System**: Automatic achievement checking on score submission

### Component Development
- Use TypeScript interfaces for all component props
- Follow Astro component syntax with frontmatter and JSX-like templates
- Utilize the `cn()` utility function for conditional classes
- Implement consistent hover effects and animations
- Always use the established sci-fi theme classes
- Use class-variance-authority for component variants

### Styling Guidelines
- **Theme**: Sci-fi aesthetic with holographic text effects, neon glows, and animated gradients
- **Colors**: Consistent cyan, purple, pink gradient palette
- **Effects**: Glass-morphism with backdrop blur, glow animations, floating effects
- **Responsive**: Mobile-first approach with responsive breakpoints
- **Animations**: Use custom Tailwind classes: `animate-float`, `animate-glow`, `text-holographic`

### UI Component System
When working with UI components:
- **Button**: Use variants (primary, outline, destructive) with proper sizing (sm, md, lg)
- **Card**: Apply glass-morphism with `variant="sci-fi"` or `variant="glass"`
- **Badge**: Use color-coded variants (success, warning, error, outline)
- **Avatar**: Implement gradient backgrounds with proper sizing

### Canvas & Interactive Elements
- Use PixiJS for any canvas-based functionality
- Implement proper touch and mouse event handling
- Support variable brush sizes and color palettes
- Handle responsive canvas sizing with proper scaling

## File Structure Patterns

### Page Organization
```
src/pages/
├── index.astro           # Main landing page
├── [game-name]/
│   └── index.astro      # Game page following this pattern
```

### Component Structure
```
src/components/ui/
├── Button.astro         # Button variants with sci-fi styling
├── Card.astro          # Glass-morphism cards with neon borders
├── Badge.astro         # Status indicators
└── Avatar.astro        # Circular avatars with gradients
```

## Common Code Patterns

### Component Props Interface
```typescript
interface Props {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  class?: string;
}
```

### Conditional Styling with cn()
```typescript
const classes = cn(
  'base-classes',
  {
    'variant-classes': variant === 'primary',
    'size-classes': size === 'lg'
  },
  className
);
```

### Achievement Integration Pattern
```typescript
// In game logic, submit scores with optional game data
const result = await fetch('/api/scores', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    gameId: 'tetris', 
    score: finalScore,
    gameData: { /* game-specific data for achievements */ }
  })
});

// Handle achievement notifications
if (result.newAchievements?.length > 0) {
  window.showAchievementAward?.(result.newAchievements);
}
```

### Database Query Pattern
```typescript
// Type-safe queries with Kysely
const scores = await db
  .selectFrom('game_scores')
  .selectAll()
  .where('user_id', '=', userId)
  .where('game_id', '=', gameId)
  .orderBy('score', 'desc')
  .execute();
```

### Sci-Fi Theme Classes
- `text-holographic` - Holographic text effect
- `bg-sci-fi-dark` - Dark sci-fi background
- `border-neon-cyan` - Cyan neon border
- `shadow-glow-purple` - Purple glow shadow
- `animate-float` - Floating animation

## Development Guidelines

### When Adding New Features
1. Follow the established single-player minigames pattern
2. Use the sci-fi component system consistently
3. Implement proper TypeScript typing
4. Add responsive design considerations
5. Include hover states and smooth transitions
6. Test canvas functionality across devices

### Achievement System Development
- **Definitions**: All achievements defined in `src/lib/achievements.ts` with rarity levels
- **Types**: Score-based (`score_threshold`) and custom event-based achievements
- **Integration**: Automatic checking via `saveGameScoreWithAchievements()`
- **Notifications**: Real-time achievement award notifications with `AchievementAward` component
- **Progress Tracking**: Dynamic progress calculation for score-based achievements
- **Game-Specific**: Support for in-game events (Tetris line clears, Reflex coin streaks)

### Database Architecture Patterns
- **Migrations**: Better Auth migrations in `better-auth_migrations/`
- **Schema**: Complete TypeScript interfaces in `src/lib/server/db/types.ts`
- **Queries**: All database operations in `src/lib/server/db/queries.ts`
- **Services**: Business logic separated into `src/lib/services/`
- **Achievement Storage**: User achievements stored as records, definitions in code

### Game Development
- Focus on single-player experiences with comprehensive scoring systems
- Implement proper game state management with TypeScript types
- Use PixiJS for any drawing/canvas features
- Include timer and scoring systems with real-time updates
- Add progress tracking and comprehensive achievement integration
- Support both score-based and event-based achievements (Tetris line clears, Reflex streaks)
- Use `/api/scores` endpoint for score submission with automatic achievement checking

### Navigation & Routing
- Use breadcrumb navigation for game context
- Implement "Back to Menu" functionality
- Follow the `/game-name/index.astro` pattern
- Ensure proper link styling with `text-white no-underline`

## Performance Considerations
- Optimize PixiJS applications for mobile devices
- Use CSS animations over JavaScript when possible
- Implement proper loading states for games
- Consider viewport sizing for responsive canvas elements
- **Database**: Use Kysely query builder for type-safe, optimized queries
- **Caching**: Leverage browser caching for static assets and components

## Security & Authentication
- **Better Auth**: Handles OAuth, sessions, and user management
- **Protected Routes**: Check `Astro.locals.user` for authentication
- **API Security**: Validate sessions on all protected API endpoints
- **Environment Variables**: Use `.env` for sensitive configuration

## Accessibility Guidelines
- Maintain sci-fi aesthetic while ensuring accessibility
- Use proper ARIA labels for interactive elements
- Ensure sufficient color contrast for readability
- Implement keyboard navigation for games

## Common Imports
```typescript
import '@/styles/global.css';
import Button from '@/components/ui/Button.astro';
import Card from '@/components/ui/Card.astro';
import Badge from '@/components/ui/Badge.astro';
import { cn } from '@/lib/utils';

// Authentication & Database
import { auth } from '@/lib/auth';
import { authClient } from '@/lib/auth-client';
import { saveGameScoreWithAchievements } from '@/lib/server/db/queries';
import { getAchievementNotifications } from '@/lib/services/achievementService';

// Achievement System
import { getAllAchievements, getAchievementsByGame, AchievementRarity } from '@/lib/achievements';
import { checkAndAwardAchievements } from '@/lib/services/achievementService';
```

## Testing Considerations
- Test drawing functionality across different devices
- Verify responsive behavior of game interfaces
- Ensure proper game state transitions
- Test touch interactions on mobile devices
- **Unit Tests**: Vitest with jsdom environment for component and service testing
- **E2E Tests**: Playwright for browser automation and full user journey testing
- **Achievement System**: Test score thresholds and in-game event achievements
- **Database Queries**: Mock Kysely for service layer testing