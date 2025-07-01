# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cetus is a sci-fi themed party games platform built with Astro and Tailwind CSS. The project focuses on creating futuristic, interactive multiplayer games with a specific emphasis on the "Quick Draw" drawing game. The application features a modern, neon-styled design with gradients, glowing effects, and animated backgrounds.

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run astro` - Run Astro CLI commands

## Architecture

### Tech Stack
- **Framework**: Astro 5.10.1 with TypeScript
- **Styling**: Tailwind CSS 4.1.3 with custom sci-fi theme
- **UI Components**: Custom component library with shadcn/ui patterns
- **Graphics**: PixiJS 8.10.2 for canvas-based drawing functionality
- **Utilities**: clsx and tailwind-merge for conditional styling

### Project Structure
```
src/
├── components/ui/     # Reusable UI components (Button, Card, Badge, Avatar)
├── lib/              # Utility functions (cn helper)
├── pages/            # Astro pages and routing
│   ├── index.astro   # Main landing page
│   └── drawing/      # Quick Draw game pages
├── styles/           # Global CSS and Tailwind configuration
└── layouts/          # Page layouts
```

### UI Component System
- **Button**: Supports variants (primary, outline, destructive, etc.) with sci-fi styling and hover effects
- **Card**: Glass-morphism effects with neon borders and glow animations
- **Badge**: Status indicators with color-coded variants
- **Avatar**: Circular avatars with gradient backgrounds

### Styling Approach
- Uses a comprehensive sci-fi theme with custom Tailwind utilities
- Holographic text effects, neon glows, and animated gradients
- Glass-morphism with backdrop blur effects
- Custom animations: float, glow, holographic
- Consistent color palette: cyan, purple, pink gradients

### Quick Draw Game Features
- **Lobby System**: Room creation, joining, and spectating
- **Drawing Canvas**: PixiJS-powered drawing with brush tools, colors, and eraser
- **Real-time Chat**: Guess submission and chat messaging
- **Game State**: Timer, rounds, player scores, and leaderboards

## Key Implementation Details

### Canvas Drawing System
- Built with PixiJS for high-performance 2D graphics
- Supports brush and eraser tools with variable sizes
- Color palette with hex-to-number conversion
- Touch and mouse event handling
- Responsive canvas sizing

### Component Patterns
- All components use TypeScript interfaces for props
- Consistent use of `cn()` utility for conditional classes
- Astro component syntax with frontmatter and JSX-like templates
- Built-in hover effects and animations

### Navigation Structure
- Main hub at root (`/`) showcasing all available games
- Quick Draw game at `/drawing` (lobby) and `/drawing/game` (gameplay)
- Breadcrumb navigation showing current game context

## Common Development Patterns

When adding new games or features:
1. Follow the existing component structure in `src/components/ui/`
2. Use the established sci-fi theme classes (neon, glow, holographic)
3. Implement responsive design with mobile-first approach
4. Add hover states and transitions for interactive elements
5. Use the `cn()` utility for conditional styling
6. Follow TypeScript patterns for component props

## Important Notes

- The project uses Astro's static site generation with client-side interactivity
- All animations and effects are CSS-based with some JavaScript enhancements
- The design system prioritizes accessibility while maintaining the sci-fi aesthetic
- Game state management is currently client-side only (no backend integration)