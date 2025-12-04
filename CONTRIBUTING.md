# Contributing to Cetus

Thank you for your interest in contributing to Cetus! This document provides guidelines and information for contributors.

## 🚀 Development Setup

### Prerequisites
- Node.js 20+ or Bun 1.3.1+
- Git

### Quick Start
```bash
# Clone the repository
git clone <repository-url>
cd cetus

# Install dependencies (choose one)
npm install          # Recommended for E2E testing
bun install          # Faster, for development

# Start development server
npm run dev          # For E2E test development
bun run dev          # Faster development experience
```

## 🧪 Testing

### Unit Tests
```bash
# Run unit tests
npm run test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage
```

### E2E Tests (Playwright)
**Important**: E2E tests have compatibility considerations with Bun.

#### Recommended Approach
```bash
# Use Node.js for reliable E2E testing
npm run web:dev &    # Start dev server
npx playwright test  # Run E2E tests

# Or use the combined script
npm run test:e2e
```

#### Alternative: Bun --smol
If you prefer to use Bun locally for E2E tests:
```bash
# Use Bun with reduced memory footprint
bun --smol run web:dev &
bunx playwright test
```

### Testing Matrix
The CI pipeline tests under multiple environments:
- **Main CI**: Bun 1.3.1 for lint, unit tests, and builds
- **E2E CI**: Node.js 20 for Playwright tests (due to compatibility)

## 🏗️ Build & Development

### Available Scripts
```bash
# Development
npm run dev          # Start dev server (use for E2E testing)
bun run dev          # Fast dev server (general development)

# Building
npm run build        # Production build
bun run build        # Faster production build

# Code Quality
npm run lint         # ESLint
npm run format       # Prettier
npm run format:check # Check formatting
```

### Tech Stack
- **Framework**: Astro 5.10.1 with TypeScript
- **Styling**: Tailwind CSS 4.1.3
- **Testing**: Vitest + Playwright
- **Database**: Turso (LibSQL)
- **Auth**: Better Auth

## 🔧 Development Guidelines

### Code Style
- Use TypeScript for all new code
- Follow existing patterns and conventions
- Run `npm run lint:fix` before committing
- Use Prettier for formatting

### Commit Messages
Use conventional commits:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `test:` for test additions/modifications
- `refactor:` for code refactoring

### Pull Requests
1. Create a feature branch from `main`
2. Make your changes
3. Add tests for new functionality
4. Ensure all tests pass
5. Update documentation if needed
6. Submit PR with clear description

## ⚠️ Known Issues & Workarounds

### Playwright/Bun Compatibility
**Issue**: Playwright E2E tests may fail with regular Bun due to memory constraints when running the full development server stack.

**Current Solution**:
- E2E tests run under Node.js in CI
- Use Node.js for local E2E test development
- Use `bun --smol` as alternative for local Bun E2E testing

**Why This Approach**:
- Ensures reliable CI/CD pipeline
- Maintains Bun's performance benefits for development
- Provides flexibility for contributors

**References**:
- [Playwright/Bun compatibility discussion](https://github.com/microsoft/playwright/issues/31106)
- [Bun memory management issues](https://github.com/oven-sh/bun/issues/4287)

### Development Server Issues
If you encounter issues with the development server:

1. **Memory Issues**: Try `bun --smol run dev`
2. **Port Conflicts**: Ensure port 4325 is available
3. **Database Issues**: Check Turso configuration in `.env`

## 📝 Documentation

- Update README.md for user-facing changes
- Add inline comments for complex logic
- Update this CONTRIBUTING.md for process changes

## 🐛 Reporting Issues

When reporting issues, please include:
- Environment details (OS, Node/Bun version)
- Steps to reproduce
- Expected vs actual behavior
- Error messages/logs
- Screenshots if applicable

## 💬 Getting Help

- Check existing issues and discussions
- Create a new issue with the "question" label
- Join our community discussions

## 📄 License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to Cetus! 🚀