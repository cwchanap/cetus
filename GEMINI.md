
# Gemini Code Assistant Documentation

## Project Overview

This project is a web application built with Astro, a modern front-end framework for building fast, content-focused websites. It uses TypeScript for type safety, Tailwind CSS for styling, and Playwright for end-to-end testing.

## Key Technologies

- **Framework**: [Astro](https://astro.build/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Testing**: [Vitest](https://vitest.dev/) (unit/integration), [Playwright](https://playwright.dev/) (end-to-end)
- **Database**: [Turso](https://turso.tech/) with [LibSQL](https://libsql.org/)
- **Authentication**: [better-auth](https://www.npmjs.com/package/better-auth)
- **Linting**: [ESLint](https://eslint.org/)
- **Formatting**: [Prettier](https://prettier.io/)

## Important Scripts

- `dev`: Starts the development server.
- `build`: Builds the application for production.
- `preview`: Previews the production build locally.
- `db:dev`: Starts the Turso development database.
- `test`: Runs all Vitest tests.
- `test:e2e`: Runs all Playwright end-to-end tests.
- `lint`: Lints the codebase with ESLint.
- `format`: Formats the codebase with Prettier.

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development database**:
   ```bash
   npm run db:dev
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

## Testing

- **Unit/Integration Tests**: `npm test`
- **End-to-End Tests**: `npm run test:e2e`

## Linting and Formatting

- **Lint**: `npm run lint`
- **Format**: `npm run format`
