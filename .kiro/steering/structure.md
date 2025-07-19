# Project Structure

## Root Directory
```
├── src/                    # Source code
├── public/                 # Static assets
├── db/                     # SQLite database files
├── scripts/                # Database initialization scripts
├── tests/                  # End-to-end tests
├── coverage/               # Test coverage reports
├── .astro/                 # Astro build artifacts
├── .kiro/                  # Kiro steering rules
└── dist/                   # Production build output
```

## Source Structure (`src/`)

### Pages (`src/pages/`)
- **File-based routing** - Each `.astro` file becomes a route
- **API routes** - `src/pages/api/` for server endpoints
- **Game pages** - Individual folders for each game (e.g., `tetris/`, `memory-matrix/`)
- **Auth pages** - `login/`, `signup/`, `profile/`

### Components (`src/components/`)
- **UI components** - `src/components/ui/` for reusable UI elements
- **Game components** - Game-specific Astro components
- **Test files** - Co-located `.test.ts` files with components

### Library (`src/lib/`)
- **Games** - `src/lib/games/` with individual game folders
- **Services** - `src/lib/services/` for business logic
- **Server** - `src/lib/server/` for database and server utilities
- **Auth** - Authentication configuration and client
- **Utils** - Shared utility functions

### Game Structure Pattern
Each game follows this structure:
```
src/lib/games/{game-name}/
├── game.ts         # Core game logic
├── types.ts        # Game-specific types
├── init.ts         # Game initialization
├── renderer.ts     # Rendering logic (if needed)
├── utils.ts        # Game utilities
└── test.ts         # Game tests
```

## Key Conventions

### File Naming
- **Astro components** - PascalCase (e.g., `GameCard.astro`)
- **TypeScript files** - camelCase (e.g., `scoreService.ts`)
- **Test files** - Same name with `.test.ts` suffix
- **API routes** - kebab-case folders, camelCase files

### Import Aliases
- `@/*` maps to `./src/*` for clean imports
- Use absolute imports from `@/` instead of relative paths

### Database
- **Kysely** for type-safe queries
- **Migrations** in `better-auth_migrations/`
- **Local SQLite** files in `db/` directory

### Testing
- **Unit tests** co-located with source files
- **E2E tests** in `tests/e2e/` with page objects
- **Test setup** in `src/test/setup.ts`

### Styling
- **Tailwind classes** with custom sci-fi utilities
- **Global styles** in `src/styles/global.css`
- **Component-scoped styles** in Astro components