<!--
=============================================================================
SYNC IMPACT REPORT
=============================================================================
Version change: 0.0.0 → 1.0.0 (MAJOR - Initial constitution ratification)

Modified principles: N/A (initial version)

Added sections:
- Core Principles (5 principles)
- Technology Stack
- Development Workflow
- Governance

Removed sections: N/A (initial version)

Templates requiring updates:
✅ .specify/templates/plan-template.md - Constitution Check section exists, compatible
✅ .specify/templates/spec-template.md - Requirements section compatible with principles
✅ .specify/templates/tasks-template.md - Phase structure compatible with testing discipline

Follow-up TODOs: None
=============================================================================
-->

# Cetus Constitution

## Core Principles

### I. Type Safety

All code MUST maintain end-to-end TypeScript type safety from database schema to UI components.

- Database entities MUST have complete TypeScript interfaces in `src/lib/server/db/types.ts`
- All API endpoints MUST use strongly typed request/response interfaces
- Component props MUST be defined with TypeScript interfaces
- Kysely query builder MUST be used for type-safe database queries
- The `any` type SHOULD be avoided; explicit typing is required

**Rationale**: Type safety eliminates runtime errors, enables refactoring confidence, and provides
self-documenting code contracts across the full stack.

### II. Test-First Development

Testing MUST be comprehensive and cover unit, integration, and end-to-end scenarios.

- Unit tests (`*.test.ts`) MUST be co-located with source code
- Vitest with jsdom environment MUST be used for unit and integration tests
- Playwright MUST be used for E2E tests in the `e2e/` directory
- Game logic MUST have dedicated unit tests for core mechanics
- API endpoints MUST be tested with request/response mocking
- Test coverage reports MUST be generated for CI validation

**Rationale**: Comprehensive testing ensures reliability, enables safe refactoring, and catches
regressions before they reach production.

### III. Astro-TypeScript Integration Pattern

All game HTML structure MUST be defined in Astro components; TypeScript MUST only manipulate
dynamic content.

- Astro components are responsible for: HTML structure, styling, layout, overlays
- TypeScript is responsible for: dynamic content (cards, pieces, game objects)
- `innerHTML` MUST NOT be used to create structure; query existing DOM elements instead
- Game containers MUST use specific IDs for renderer targeting
- Button state management MUST follow the established Start/End/Reset pattern

**Rationale**: This separation ensures styling integrity, improves maintainability, and prevents
hydration issues in the SSR architecture.

### IV. Component Architecture

Reusable UI components MUST follow established patterns with consistent sci-fi theming.

- Components MUST use TypeScript props interfaces
- Variant system with class-variance-authority MUST be used for component variants
- The `cn()` utility function MUST be used for conditional styling
- Sci-fi theme classes (neon glows, glass-morphism, holographic effects) MUST be applied consistently
- Mobile-first responsive design MUST be implemented
- Accessibility attributes (ARIA labels, focus management) MUST be included

**Rationale**: Consistent component patterns enable rapid development, maintain visual coherence,
and ensure accessibility compliance.

### V. Code Quality Standards

Code quality MUST be enforced through automated tooling and pre-commit hooks.

- ESLint with TypeScript-specific rules and Astro plugin MUST pass on all commits
- Prettier MUST be used for consistent code formatting
- Husky pre-commit hooks MUST run linting and formatting checks
- Unused variables MUST trigger warnings (prefix with `_` to suppress intentionally)
- CI pipeline MUST include lint, format, test, and build stages

**Rationale**: Automated quality enforcement reduces code review burden, maintains consistency,
and prevents technical debt accumulation.

## Technology Stack

The following technology choices are mandated for the Cetus platform:

- **Framework**: Astro with TypeScript and SSR via Vercel adapter
- **Styling**: Tailwind CSS with custom sci-fi theme system
- **Database**: LibSQL/SQLite with Turso (production), Kysely query builder
- **Authentication**: Better Auth with email/password and Google OAuth
- **Graphics**: PixiJS for canvas-based game rendering
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **Code Quality**: ESLint, Prettier, Husky with lint-staged

Technology changes MUST be documented and approved through the governance process.

## Development Workflow

All development work MUST follow established workflows:

- **Local Development**: `npm run dev` starts both database and web server
- **Feature Branches**: All features MUST be developed on feature branches
- **Pre-commit**: Husky hooks MUST pass before commits are accepted
- **CI Pipeline**: GitHub Actions MUST pass lint, format, test, and build stages
- **Game Development**: Games MUST follow the modular architecture (types → game → renderer → utils)
- **Score Integration**: All games MUST use the centralized score service with achievement integration

Pull requests MUST include:
- Passing CI checks
- Updated tests for new functionality
- Documentation updates if API changes occur

## Governance

This constitution supersedes all other practices and documentation when conflicts arise.

**Amendment Procedure**:
1. Proposed changes MUST be documented with rationale
2. Changes MUST be reviewed and approved
3. Version MUST be incremented according to semantic versioning:
   - MAJOR: Backward incompatible principle changes or removals
   - MINOR: New principle/section added or materially expanded
   - PATCH: Clarifications, wording, typo fixes
4. Dependent templates and documentation MUST be updated for consistency

**Compliance Review**:
- All PRs MUST verify compliance with constitution principles
- Complexity deviations MUST be justified in the Complexity Tracking section of plans
- Use `AGENTS.md` and `.github/copilot-instructions.md` for runtime development guidance

**Version**: 1.0.0 | **Ratified**: 2025-11-24 | **Last Amended**: 2025-11-24
