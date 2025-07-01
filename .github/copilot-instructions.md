# GitHub Copilot Instructions for Cetus

This repository contains Cetus, a sci-fi themed single-player minigames platform built with Astro and Tailwind CSS.

## Project Context

### Overview
Cetus is a futuristic single-player gaming platform featuring interactive minigames with a focus on the "Quick Draw Challenge" drawing game. The application features a modern, neon-styled design with gradients, glowing effects, and animated backgrounds.

### Tech Stack
- **Framework**: Astro 5.10.1 with TypeScript
- **Styling**: Tailwind CSS 4.1.3 with custom sci-fi theme
- **UI Components**: Custom component library following shadcn/ui patterns
- **Graphics**: PixiJS 8.10.2 for canvas-based drawing functionality
- **Utilities**: clsx and tailwind-merge for conditional styling

## Code Style & Patterns

### Component Development
- Use TypeScript interfaces for all component props
- Follow Astro component syntax with frontmatter and JSX-like templates
- Utilize the `cn()` utility function for conditional classes
- Implement consistent hover effects and animations
- Always use the established sci-fi theme classes

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

### Game Development
- Focus on single-player experiences
- Implement proper game state management
- Use PixiJS for any drawing/canvas features
- Include timer and scoring systems
- Add progress tracking and achievements

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
```

## Testing Considerations
- Test drawing functionality across different devices
- Verify responsive behavior of game interfaces
- Ensure proper game state transitions
- Test touch interactions on mobile devices