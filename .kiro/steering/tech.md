# Technology Stack

## Core Framework
- **Astro 5.10.1** - Static site generator with server-side rendering
- **TypeScript** - Strict typing enabled with path aliases (`@/*` → `./src/*`)
- **Node.js** - ES modules (`"type": "module"`)

## Frontend
- **Tailwind CSS 4.1.3** - Utility-first CSS with custom sci-fi theme
- **PixiJS 8.10.2** - WebGL-based 2D graphics for games
- **Canvas Confetti** - Particle effects for achievements
- **Lucide React** - Icon library

## Backend & Database
- **Turso (LibSQL)** - SQLite-compatible database
- **Kysely** - Type-safe SQL query builder
- **Better Auth** - Authentication with Google OAuth and email/password

## Testing & Quality
- **Vitest** - Unit testing with JSDOM environment
- **Playwright** - End-to-end testing
- **ESLint** - Code linting with TypeScript and Astro support
- **Prettier** - Code formatting
- **Husky** - Git hooks for pre-commit quality checks

## Deployment
- **Vercel** - Hosting platform with server-side rendering

## Common Commands

### Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run db:dev       # Start local Turso database
```

### Testing
```bash
npm run test         # Run unit tests in watch mode
npm run test:run     # Run unit tests once
npm run test:coverage # Run tests with coverage report
npm run test:ui      # Open Vitest UI
npm run test:e2e     # Run Playwright e2e tests
npm run test:e2e:ui  # Run e2e tests with UI
```

### Code Quality
```bash
npm run lint         # Check code with ESLint
npm run lint:fix     # Fix ESLint issues automatically
npm run format       # Format code with Prettier
npm run format:check # Check if code is formatted
```

## Build Configuration
- **Output**: Server-side rendering enabled
- **Vite**: Custom Tailwind CSS plugin integration
- **TypeScript**: Strict mode with Astro's strict config
- **Coverage**: V8 provider with HTML reports