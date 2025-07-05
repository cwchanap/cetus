# Cetus - Sci-Fi Gaming Platform

A futuristic single-player gaming platform featuring interactive minigames with a focus on the "Quick Draw Challenge" drawing game. Built with Astro, TypeScript, and Tailwind CSS.

## 🚀 Quick Start

```sh
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🧪 Development Workflow

### Testing
```sh
# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage

# Test UI
npm run test:ui
```

### Code Quality
```sh
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

## 🔄 CI/CD Pipeline

The project uses GitHub Actions for automated testing and building:

- **Lint & Format**: ESLint and Prettier checks
- **Test**: Unit tests with Vitest
- **Build**: Astro production build
- **Coverage**: Test coverage reporting (optional Codecov integration)

The CI pipeline runs on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

### Pre-commit Hooks

Husky is configured to run quality checks before commits:
- ESLint auto-fix on staged files
- Prettier formatting on staged files
- Tests run before push

## 🏗️ Tech Stack

- **Framework**: Astro 5.10.1 with TypeScript
- **Styling**: Tailwind CSS 4.1.3 with custom sci-fi theme
- **Testing**: Vitest with JSDOM
- **Graphics**: PixiJS 8.10.2 for canvas-based drawing
- **Database**: Turso (LibSQL) with Kysely query builder
- **Auth**: Better Auth with Google OAuth
- **Deployment**: Vercel

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/withastro/astro/tree/latest/examples/with-tailwindcss)
[![Open with CodeSandbox](https://assets.codesandbox.io/github/button-edit-lime.svg)](https://codesandbox.io/p/sandbox/github/withastro/astro/tree/latest/examples/with-tailwindcss)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/withastro/astro?devcontainer_path=.devcontainer/with-tailwindcss/devcontainer.json)
