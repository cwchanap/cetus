---
trigger: always_on
---

## Project Overview

Cetus is a sci-fi themed party games platform built with Astro and Tailwind CSS. The platform features multiple interactive games including Tetris, Bubble Shooter, Memory Matrix, Quick Math, Word Scramble, Reflex, and Sudoku with user authentication, score tracking, achievement system, and a modern neon-styled design.

## Development Commands

### Core Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run astro` - Run Astro CLI commands

### Database
- `npm run db:dev` - Start local Turso SQLite database server

### Environment Setup
Required environment variables in `.env`:
```
TURSO_DATABASE_URL=your_turso_database_url
TURSO_AUTH_TOKEN=your_turso_auth_token
BETTER_AUTH_SECRET=your_32_char_secret
BETTER_AUTH_URL=http://localhost:4321 # for development
GOOGLE_CLIENT_ID=your_google_client_id # optional
GOOGLE_CLIENT_SECRET=your_google_client_secret # optional
```

### Testing
- `npm run test` - Run tests with Vitest
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:run` - Run tests once (CI mode)
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:watch` - Run tests in watch mode

### End-to-End Testing
- `npm run test:e2e` - Run Playwright end-to-end tests
- `npm run test:e2e:ui` - Run Playwright tests with UI mode
- `npm run test:e2e:headed` - Run Playwright tests in headed mode
- `npm run test:e2e:debug` - Run Playwright tests in debug mode
- `npm run test:e2e:report` - Show Playwright test report

### Code Quality
- `npm run lint` - Lint codebase with ESLint
- `npm run lint:fix` - Auto-fix lint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## Architecture

### Tech Stack
- **Framework**: Astro 5.10.1 (server-side rendering) with TypeScript
- **Deployment**: Vercel adapter with server output
- **Styling**: Tailwind CSS 4.1.3 with extensive sci-fi theme system
- **Database**: LibSQL (Turso) with Kysely query builder
- **Authentication**: Better Auth with email/password and Google OAuth
- **Graphics**: PixiJS 8.10.2 for game rendering
- **Testing**: Vitest with jsdom environment and Testing Library
- **E2E Testing**: Playwright for end-to-end testing across browsers
- **Code Quality**: ESLint + Prettier with lint-staged and Husky
- **Environment**: dotenv for environment variable management

### Database Architecture
- **LibSQL/SQLite**: Primary database with Turso for production
- **Kysely**: Type-safe SQL query builder with schema validation
- **Better Auth**: Handles user authentication, sessions, and social providers
- **Game Scores**: User game history and statistics tracking
- **Type Safety**: Complete TypeScript interfaces for all database entities

Key database entities:
- `user`, `session`, `account`, `verification` (Better Auth tables)
- `game_scores` - Individual game score records
- `user_stats` - Aggregated user statistics and preferences
- `user_achievements` - User achievement tracking (achievement definitions stored in code)

### Project Structure
```
src/
├── components/ui/     # Reusable UI components with sci-fi styling
├── lib/
│   ├── auth.ts        # Better Auth configuration
│   ├── auth-client.ts # Client-side auth utilities
│   ├── score-client.ts # Score tracking utilities
│   ├── server/        # Server-side utilities
│   │   └── db/        # Database layer (Kysely + LibSQL)
│   │       ├── client.ts  # Database connection
│   │       ├── queries.ts # Typed query functions
│   │       └── types.ts   # Database schema types
│   ├── services/     # Business logic services
│   │   ├── achievementService.ts # Achievement checking and awarding
│   │   └── scoreService.ts # Centralized score management
│   └── games/        # Game-specific logic
│       ├── tetris/    # Tetris game implementation
│       ├── bubble-shooter/ # Bubble shooter implementation
│       ├── memory-matrix/ # Memory Matrix implementation
│       ├── quick-math/ # Quick Math implementation
│       ├── word-scramble/ # Word Scramble implementation
│       ├── reflex/ # Reflex game implementation
│       └── sudoku/ # Sudoku puzzle implementation
├── pages/
│   ├── api/          # API routes (auth, scores)
│   ├── login/        # Authentication pages
│   ├── signup/
│   ├── profile/      # User profile and statistics
│   └── [game]/       # Game-specific pages
├── layouts/          # Page layouts (main, app)
└── middleware.ts     # Auth middleware
```

### Authentication System
- **Better Auth**: Production-ready auth with email/password + OAuth
- **Session Management**: 7-day sessions with 1-day update intervals
- **Social Providers**: Google OAuth configured
- **Middleware**: Route protection and session validation
- **Type Safety**: Full TypeScript integration with auth state

### Game Engine Architecture
Games are modular with consistent patterns:
- **Types**: Game state, config, and entity definitions
- **Game Logic**: Core game mechanics and state management
- **Renderer**: PixiJS-based rendering with canvas management
- **Utils**: Shared utilities and helper functions
- **Init**: Game initialization and setup

Each game follows: `types.ts` → `game.ts` → `renderer.ts` → `utils.ts`

**Game-Specific Notes:**
- **Sudoku**: Uses `utils.ts` for validation logic and puzzle generation
- **Word Scramble**: Includes `words.ts` for word dictionary
- **Reflex/Memory Matrix**: Have dedicated test files for game logic
- **Quick Math**: Simpler structure without renderer (text-based)

### Services Architecture
- **Achievement Service**: Checks score thresholds and awards achievements automatically
- **Score Service**: Centralized score submission with achievement integration
- **Type Safety**: All services use strongly typed GameType and database interfaces

### UI Component System
All components follow consistent patterns:
- **TypeScript Props**: Strongly typed component interfaces
- **Variant System**: Button, Badge, Card variants with class-variance-authority
- **Sci-Fi Theme**: Neon glows, glass-morphism, holographic effects
- **Responsive Design**: Mobile-first with touch/hover states
- **Accessibility**: Focus management and ARIA attributes

### Tailwind Theme System
Comprehensive sci-fi design system:
- **Custom Utilities**: `.text-holographic`, `.bg-glass`, `.border-neon`
- **Animations**: `float`, `glow`, `holographic` keyframes
- **Color Palette**: Cyan/purple/pink gradients with opacity variants
- **Typography**: Orbitron (headers) + Inter (body) font stack
- **Effects**: Custom scrollbars, neon shadows, backdrop filters

## Testing Strategy

### Test Structure
- **Unit Tests**: `*.test.ts` files co-located with source code
- **Integration Tests**: API and database interaction testing
- **E2E Tests**: Playwright tests in `tests/e2e/` directory
- **Setup**: Global test setup in `src/test/setup.ts`
- **Coverage**: V8 coverage reports with HTML output
- **Environment**: jsdom for DOM testing with Testing Library

### Testing Patterns
- Database queries tested with in-memory SQLite
- Auth flows tested with mock sessions
- Game logic unit tests for core mechanics
- API endpoints tested with request/response mocking
- End-to-end user workflows tested with Playwright across browsers

## Development Guidelines

### Code Quality Standards
- **ESLint Rules**: TypeScript-specific rules with Astro plugin
- **Prettier**: Consistent formatting with Astro plugin
- **Husky**: Pre-commit hooks for linting and formatting
- **Unused Variables**: Warn on unused vars (prefix with `_` to ignore)
- **Type Safety**: Strict TypeScript with explicit any warnings

### Component Development
1. Use existing UI components from `src/components/ui/`
2. Follow TypeScript interface patterns for props
3. Apply sci-fi theme classes consistently
4. Implement responsive design with mobile-first approach
5. Use `cn()` utility for conditional styling
6. Add proper hover/focus states with accessibility

### Game Development
1. Follow modular game architecture pattern
2. Use PixiJS for canvas-based games
3. Implement proper state management
4. Add score tracking with database integration
5. Ensure mobile compatibility with touch events

### Database Operations
1. Use Kysely for all database queries
2. Follow established patterns in `src/lib/server/db/queries.ts`
3. Add proper TypeScript types for new entities
4. Test database operations with unit tests
5. Handle migrations through Better Auth system

## Important Architecture Notes

- **Server-Side Rendering**: Astro SSR with Vercel adapter
- **Client Hydration**: Minimal client-side JavaScript for interactivity
- **Type Safety**: End-to-end TypeScript from database to UI
- **Error Handling**: Consistent error patterns across API routes
- **Performance**: Optimized with code splitting and lazy loading
- **Security**: CSRF protection, secure sessions, environment variables
- **Achievement System**: Code-based achievement definitions with automatic checking
- **Score Integration**: All games use centralized score service with achievement notifications

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.