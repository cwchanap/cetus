# Cetus Homepage — Abyssal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic neon-sci-fi homepage with an "Abyssal Bioluminescence" identity — a hero vitrine of playable specimen-games, a depth-zoned catalog, and a deep-sea token system scoped to the homepage only.

**Architecture:** Introduce a `cetus-*` semantic-token layer (CSS variables mapped into Tailwind v4 via `@theme inline`) that resolves to current cyan/purple values under `:root` and to abyssal values under a `.theme-abyssal` scope. `AppLayout` gains a `theme` prop; the homepage opts in. Shared shell components (`Button`, `Card`, `Navigation`, `Footer`) switch to `cetus-*` utilities so they render unchanged on other pages and abyssal on the homepage. A new `Organism` renderer draws each game's bioluminescent identity; a new `SpecimenCard` renders the vessel card.

**Tech Stack:** Astro 5 (SSR), Tailwind CSS v4 (`@theme inline`), TypeScript, Vitest (jsdom). Package manager: **Bun** (`bun@1.3.1`).

**Spec:** `docs/superpowers/specs/2026-07-06-homepage-abyssal-redesign-design.md`

## Global Constraints

Copied verbatim from the spec; every task implicitly inherits these.

- **Scope:** Homepage only — `src/pages/index.astro` and the components it renders. Other pages MUST render exactly as they do today.
- **Palette tokens (abyssal):** `abyss #04060A` · `card #06090F` · `ink #EAF6FF` · `ink-muted #8A98A6` · `hairline rgba(234,246,255,0.10)` · `teal #1FE3C0` · `amber #F2B33D` · `magenta #FF3D8A` · `ice #6FE3FF` · `green #5DFF9F`.
- **Type:** Display = **Fraunces** (italic 300 wordmark, regular 400 game names). Body = **Inter**. Data = **JetBrains Mono**. **Orbitron is retired on the homepage.**
- **Form:** No `text-holographic`, no animated holographic gradient, no emoji as icons on the homepage, no neon drop-shadow stacking.
- **Motion:** `prefers-reduced-motion: reduce` disables ALL drift/pulse; glow becomes static; hover becomes plain color change.
- **Accessibility:** ink on abyss ≥ WCAG AA; visible teal focus ring on every interactive specimen; catalog is a `<ul>` of links; depth conveyed by text label, not color alone.
- **Featured 5 (hero vitrine):** Reflex, Bejeweled, Snake, 2048, Tetris.
- **Depth zones (5/6/3):** Shallow = Reflex, Quick Math, Word Scramble, Bejeweled, Evader · Mid-water = Snake, Tetris, 2048, Path Navigator, Bubble Shooter, Circuit Hacker · Abyssal = Sudoku, Satellite Sync, Memory Matrix.
- **Test command:** `bun run test:run` (single file: `bun run test src/lib/games.test.ts`). **Lint:** `bun run lint`. **Format:** `bun run format`.
- **Test pattern:** Astro markup is tested by reading the `.astro` source with `readFileSync` and asserting with `toContain` / `toMatch` / `not.toContain` (see `src/pages/auth-pages.test.ts`, `src/pages/game-board-markup.test.ts`). Data/logic is tested in pure-TS vitest.

## File Structure

**Create:**
- `src/components/organisms/Organism.astro` — renders one of 6 bioluminescent shapes from `{ shape, color }`. Pure CSS/SVG, reduced-motion-safe.
- `src/components/ui/SpecimenCard.astro` — the Vessel card (jar + organism + meta); whole card is an `<a>` link.
- `src/lib/organisms.ts` — organism taxonomy types + per-game organism/depth assignment data + helpers.
- `src/lib/organisms.test.ts` — data tests.
- `src/pages/index-markup.test.ts` — homepage markup assertions.

**Modify:**
- `src/lib/games.ts` — extend `Game` with optional `organism` + `depth`; export depth helpers + featured list (thin wrappers over `organisms.ts`).
- `src/lib/games.test.ts` — tests for new fields/helpers.
- `src/styles/global.css` — add `cetus-*` tokens (default + `.theme-abyssal`) and `@theme inline` mappings; add `.theme-abyssal` background override + reduced-motion + drift keyframes.
- `src/layouts/AppLayout.astro` — add `theme?: 'default' | 'abyssal'` prop; apply scope class + conditional fonts.
- `src/components/ui/Button.astro`, `Card.astro`, `Navigation.astro`, `Footer.astro` — switch hardcoded cyan/purple to `cetus-*` utilities.
- `src/pages/index.astro` — full rewrite to abyssal composition.

**Do not touch:** any other page, game logic, scoring, auth, the existing sci-fi utilities in `tailwind.config.js` (kept for other pages + in-game overlays).

---

### Task 1: Add organism + depth data to the game registry

**Files:**
- Create: `src/lib/organisms.ts`
- Create: `src/lib/organisms.test.ts`
- Modify: `src/lib/games.ts` (extend `Game` interface + per-game fields)
- Modify: `src/lib/games.test.ts`

**Interfaces:**
- Produces (from `organisms.ts`):
  - `type OrganismShape = 'orb' | 'chain' | 'spiral' | 'frond' | 'cluster' | 'lattice'`
  - `type OrganismColor = 'teal' | 'amber' | 'magenta' | 'ice' | 'green'`
  - `type DepthZone = 'shallow' | 'mid' | 'abyssal'`
  - `interface OrganismIdentity { shape: OrganismShape; color: OrganismColor; orb?: boolean }` — `orb` adds the orbital ring (used by Bubble Shooter, Satellite Sync).
  - `const ORGANISM_BY_GAME: Record<GameID, { organism: OrganismIdentity; depth: DepthZone }>`
  - `function getOrganism(id: GameID): OrganismIdentity`
  - `function getDepth(id: GameID): DepthZone`
  - `function getGamesByDepth(zone: DepthZone, games?: Game[]): Game[]`
  - `const FEATURED_GAME_IDS: GameID[]` — `[REFLEX, BEJEWELED, SNAKE, GAME_2048, TETRIS]`
  - `function getFeaturedGames(games?: Game[]): Game[]`
  - `const DEPTH_LABELS: Record<DepthZone, { label: string; reading: string; note: string }>`
- `Game` (in `games.ts`) gains required `organism: OrganismIdentity` and `depth: DepthZone`, populated for all 14 games.

- [ ] **Step 1: Write the failing data test**

Create `src/lib/organisms.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GAMES, GameID } from './games'
import {
    ORGANISM_BY_GAME,
    getOrganism,
    getDepth,
    getGamesByDepth,
    getFeaturedGames,
    FEATURED_GAME_IDS,
    DEPTH_LABELS,
    type OrganismShape,
    type OrganismColor,
    type DepthZone,
} from './organisms'

const SHAPES: OrganismShape[] = [
    'orb',
    'chain',
    'spiral',
    'frond',
    'cluster',
    'lattice',
]
const COLORS: OrganismColor[] = ['teal', 'amber', 'magenta', 'ice', 'green']
const ZONES: DepthZone[] = ['shallow', 'mid', 'abyssal']

describe('organism registry', () => {
    it('assigns an organism and depth to every registered game', () => {
        for (const g of GAMES) {
            expect(ORGANISM_BY_GAME).toHaveProperty(g.id)
            const entry = ORGANISM_BY_GAME[g.id]
            expect(SHAPES).toContain(entry.organism.shape)
            expect(COLORS).toContain(entry.organism.color)
            expect(ZONES).toContain(entry.depth)
        }
    })

    it('every game record carries the matching organism + depth', () => {
        for (const g of GAMES) {
            expect(g.organism).toBeDefined()
            expect(g.depth).toBeDefined()
            expect(g.organism).toEqual(ORGANISM_BY_GAME[g.id].organism)
            expect(g.depth).toBe(ORGANISM_BY_GAME[g.id].depth)
        }
    })

    it('exposes accessors', () => {
        expect(getOrganism(GameID.REFLEX).shape).toBe('orb')
        expect(getOrganism(GameID.REFLEX).color).toBe('magenta')
        expect(getDepth(GameID.SUDOKU)).toBe('abyssal')
        expect(getDepth(GameID.REFLEX)).toBe('shallow')
    })

    it('partitions games into 5 / 6 / 3 by depth', () => {
        expect(getGamesByDepth('shallow')).toHaveLength(5)
        expect(getGamesByDepth('mid')).toHaveLength(6)
        expect(getGamesByDepth('abyssal')).toHaveLength(3)
        // no game is double-counted
        const all = [
            ...getGamesByDepth('shallow'),
            ...getGamesByDepth('mid'),
            ...getGamesByDepth('abyssal'),
        ]
        expect(all).toHaveLength(GAMES.length)
        // depth label maps for each zone
        for (const z of ZONES) {
            expect(DEPTH_LABELS[z].reading).toMatch(/\dm/)
        }
    })

    it('returns the featured five in the spec order', () => {
        expect(FEATURED_GAME_IDS).toEqual([
            GameID.REFLEX,
            GameID.BEJEWELED,
            GameID.SNAKE,
            GameID.GAME_2048,
            GameID.TETRIS,
        ])
        expect(getFeaturedGames().map(g => g.id)).toEqual(FEATURED_GAME_IDS)
    })

    it('marks the two orbiting games', () => {
        expect(ORGANISM_BY_GAME[GameID.BUBBLE_SHOOTER].organism.orb).toBe(true)
        expect(ORGANISM_BY_GAME[GameID.SATELLITE_SYNC].organism.orb).toBe(true)
        expect(ORGANISM_BY_GAME[GameID.QUICK_MATH].organism.orb).toBeFalsy()
    })
})
```

Append to `src/lib/games.test.ts` (inside the top-level scope, after existing describes):

```ts
import { getDepth, getGamesByDepth, getFeaturedGames } from './organisms'

describe('Game registry organism/depth fields', () => {
    it('every game has organism + depth populated', () => {
        for (const g of GAMES) {
            expect(g.organism).toBeDefined()
            expect(g.depth).toBeDefined()
        }
    })

    it('depth helpers re-exported via games module are consistent', () => {
        expect(getGamesByDepth('abyssal').map(g => g.id).sort()).toEqual(
            GAMES.filter(g => g.depth === 'abyssal')
                .map(g => g.id)
                .sort()
        )
        expect(getFeaturedGames()).toHaveLength(5)
        expect(getDepth(GameID.MEMORY_MATRIX)).toBe('abyssal')
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
bun run test src/lib/organisms.test.ts src/lib/games.test.ts
```
Expected: FAIL (`Cannot find module './organisms'`, `g.organism` undefined).

- [ ] **Step 3: Implement `src/lib/organisms.ts`**

```ts
import { GAMES, GameID, type Game } from './games'

export type OrganismShape =
    | 'orb'
    | 'chain'
    | 'spiral'
    | 'frond'
    | 'cluster'
    | 'lattice'

export type OrganismColor = 'teal' | 'amber' | 'magenta' | 'ice' | 'green';

export type DepthZone = 'shallow' | 'mid' | 'abyssal'

export interface OrganismIdentity {
    shape: OrganismShape
    color: OrganismColor
    /** draw an orbit ring around an orb (Bubble Shooter, Satellite Sync) */
    orb?: boolean
}

type GameEntry = { organism: OrganismIdentity; depth: DepthZone }

// Per the approved spec table.
export const ORGANISM_BY_GAME: Record<GameID, GameEntry> = {
    [GameID.REFLEX]: { organism: { shape: 'orb', color: 'magenta' }, depth: 'shallow' },
    [GameID.QUICK_MATH]: { organism: { shape: 'orb', color: 'amber' }, depth: 'shallow' },
    [GameID.WORD_SCRAMBLE]: { organism: { shape: 'frond', color: 'green' }, depth: 'shallow' },
    [GameID.BEJEWELED]: { organism: { shape: 'cluster', color: 'magenta' }, depth: 'shallow' },
    [GameID.EVADER]: { organism: { shape: 'spiral', color: 'teal' }, depth: 'shallow' },
    [GameID.SNAKE]: { organism: { shape: 'chain', color: 'green' }, depth: 'mid' },
    [GameID.TETRIS]: { organism: { shape: 'lattice', color: 'teal' }, depth: 'mid' },
    [GameID.GAME_2048]: { organism: { shape: 'cluster', color: 'amber' }, depth: 'mid' },
    [GameID.PATH_NAVIGATOR]: { organism: { shape: 'spiral', color: 'ice' }, depth: 'mid' },
    [GameID.BUBBLE_SHOOTER]: { organism: { shape: 'orb', color: 'ice', orb: true }, depth: 'mid' },
    [GameID.CIRCUIT_HACKER]: { organism: { shape: 'frond', color: 'ice' }, depth: 'mid' },
    [GameID.SUDOKU]: { organism: { shape: 'lattice', color: 'amber' }, depth: 'abyssal' },
    [GameID.SATELLITE_SYNC]: { organism: { shape: 'orb', color: 'teal', orb: true }, depth: 'abyssal' },
    [GameID.MEMORY_MATRIX]: { organism: { shape: 'cluster', color: 'magenta' }, depth: 'abyssal' },
}

export const FEATURED_GAME_IDS: GameID[] = [
    GameID.REFLEX,
    GameID.BEJEWELED,
    GameID.SNAKE,
    GameID.GAME_2048,
    GameID.TETRIS,
]

export const DEPTH_LABELS: Record<
    DepthZone,
    { label: string; reading: string; note: string }
> = {
    shallow: {
        label: 'Shallow',
        reading: '0–200m',
        note: 'Quick reactions. Pick up and play.',
    },
    mid: {
        label: 'Mid-water',
        reading: '1000m',
        note: 'Focused sessions. A few minutes in.',
    },
    abyssal: {
        label: 'Abyssal',
        reading: '4000m+',
        note: 'The deep divers. Long and absorbing.',
    },
}

export function getOrganism(id: GameID): OrganismIdentity {
    return ORGANISM_BY_GAME[id].organism
}

export function getDepth(id: GameID): DepthZone {
    return ORGANISM_BY_GAME[id].depth
}

export function getGamesByDepth(zone: DepthZone, games: Game[] = GAMES): Game[] {
    return games.filter(g => g.depth === zone && g.isActive)
}

export function getFeaturedGames(games: Game[] = GAMES): Game[] {
    const byId = new Map(games.map(g => [g.id, g]))
    return FEATURED_GAME_IDS.map(id => byId.get(id)).filter((g): g is Game => Boolean(g))
}
```

- [ ] **Step 4: Extend the `Game` interface + populate fields in `src/lib/games.ts`**

In `src/lib/games.ts`:

1. Add the import at the top:
```ts
import type { OrganismIdentity, DepthZone } from './organisms'
```

2. Extend the `Game` interface (add two optional fields so the type stays backward-compatible):
```ts
export interface Game {
    id: GameID
    name: string
    description: string
    category: 'puzzle' | 'action' | 'strategy'
    maxPlayers?: number
    estimatedDuration?: string
    difficulty: 'easy' | 'medium' | 'hard'
    tags: string[]
    isActive: boolean
    organism: OrganismIdentity
    depth: DepthZone
}
```

3. The organism + depth fields are inlined directly on each `GAMES` entry (see step 2 above), so no post-declaration mutation or circular import is needed. The `ORGANISM_BY_GAME` map and helpers in `organisms.ts` are derived one-directionally from `GAMES`:

```ts
// organisms.ts — imports from games.ts one-directionally
import { GAMES, GameID, type Game, type OrganismIdentity, type DepthZone } from './games'

export const ORGANISM_BY_GAME: Record<GameID, GameEntry> = Object.fromEntries(
    GAMES.map(g => [g.id, { organism: g.organism, depth: g.depth }])
) as Record<GameID, GameEntry>
```

> **Note:** This avoids the circular import that would arise if `games.ts` imported from `organisms.ts`. The registry is one-directional: `organisms.ts` derives `ORGANISM_BY_GAME` from the already-populated `GAMES` array. Consumers import helpers from `organisms.ts` directly.

- [ ] **Step 5: Run tests to verify they pass**

```
bun run test src/lib/organisms.test.ts src/lib/games.test.ts
```
Expected: PASS (all new tests green; existing registry tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/organisms.ts src/lib/organisms.test.ts src/lib/games.ts src/lib/games.test.ts
git commit -m "feat(games): add organism + depth data to the game registry"
```

---

### Task 2: Add the abyssal theme tokens (`cetus-*` + `.theme-abyssal`)

**Files:**
- Modify: `src/styles/global.css`
- Create: `src/styles/global.test.ts`

**Interfaces:**
- Produces CSS variables consumed by Tasks 3–7. The exact names below are the contract; do not rename them in later tasks.
  - `--cetus-accent`, `--cetus-accent-2` (accents — text/border/glow and gradient partner)
  - `--cetus-btn-from`, `--cetus-btn-to` (button gradient stops)
  - `--cetus-page-bg` (page background — overrides `.bg-sci-fi-dark` under abyssal)
  - `--cetus-surface`, `--cetus-hairline`, `--cetus-ink`, `--cetus-ink-muted`
- Produces Tailwind utilities (via `@theme inline`): `text-cetus-accent`, `text-cetus-accent-2`, `bg-cetus-surface`, `border-cetus-hairline`, `text-cetus-ink`, `text-cetus-ink-muted`. Button gradient uses arbitrary values: `from-[var(--cetus-btn-from)] to-[var(--cetus-btn-to)]`.

- [ ] **Step 1: Write the failing markup test**

Create `src/styles/global.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf-8')

describe('abyssal theme tokens', () => {
    const tokens = [
        '--cetus-accent:',
        '--cetus-accent-2:',
        '--cetus-btn-from:',
        '--cetus-btn-to:',
        '--cetus-page-bg:',
        '--cetus-surface:',
        '--cetus-hairline:',
        '--cetus-ink:',
        '--cetus-ink-muted:',
    ]

    it('defines every cetus token in the default scope', () => {
        for (const t of tokens) expect(css).toContain(t)
    })

    it('maps cetus tokens into the Tailwind theme', () => {
        expect(css).toContain('--color-cetus-accent: var(--cetus-accent)')
        expect(css).toContain('--color-cetus-surface: var(--cetus-surface)')
        expect(css).toContain('--color-cetus-ink: var(--cetus-ink)')
        expect(css).toContain('--color-cetus-hairline: var(--cetus-hairline)')
    })

    it('defines a .theme-abyssal scope that overrides the accents', () => {
        expect(css).toMatch(/\.theme-abyssal[^{]*\{/)
        expect(css).toContain('/* abyssal accent scope */')
    })

    it('overrides the sci-fi page background under abyssal scope', () => {
        expect(css).toMatch(/\.theme-abyssal[^{]*\.bg-sci-fi-dark/)
    })

    it('honors prefers-reduced-motion by disabling drift', () => {
        expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run test src/styles/global.test.ts
```
Expected: FAIL (tokens absent).

- [ ] **Step 3: Implement — append to `src/styles/global.css`**

Add the token mappings inside the existing `@theme inline { … }` block (after the `--color-sidebar-ring` line, before the closing `}`):

```css
  --color-cetus-accent: var(--cetus-accent);
  --color-cetus-accent-2: var(--cetus-accent-2);
  --color-cetus-surface: var(--cetus-surface);
  --color-cetus-hairline: var(--cetus-hairline);
  --color-cetus-ink: var(--cetus-ink);
  --color-cetus-ink-muted: var(--cetus-ink-muted);
```

Add the default `:root` values. Inside the existing `:root { … }` block (before its closing `}`), append:

```css
  /* Cetus semantic tokens — default resolves to exact Tailwind v4 colors so
     non-abyssal pages are byte-identical to before tokenization. */
  --cetus-accent: oklch(0.789 0.154 211.53); /* cyan-400 */
  --cetus-accent-2: oklch(0.627 0.265 303.9); /* purple-500 */
  --cetus-btn-from: oklch(0.715 0.143 215.221); /* cyan-500 */
  --cetus-btn-to: oklch(0.558 0.288 302.321); /* purple-600 */
  --cetus-page-bg: linear-gradient(135deg, rgb(15 23 42), rgb(88 28 135), rgb(15 23 42));
  --cetus-surface: oklch(0 0 0 / 0.05);
  --cetus-hairline: oklch(0.372 0.028 257.286 / 0.5); /* slate-700/50 */
  --cetus-ink: var(--foreground);
  --cetus-ink-muted: oklch(0.872 0.01 258.338); /* gray-300 */
  --cetus-footer-ink: oklch(0.707 0.022 257.328); /* gray-400 */
```

Also add mode-specific surface override in the existing `.dark` block:

```css
  /* Cetus surface: white-opacity for dark backgrounds
     (root uses black-opacity for light mode, matching --border pattern). */
  --cetus-surface: rgba(255, 255, 255, 0.05);
```

Append the abyssal scope + background override + reduced-motion at the end of the file:

```css
/* ---------- Abyssal accent scope (homepage only) ---------- */
.theme-abyssal {
  --cetus-accent: #1fe3c0;       /* teal */
  --cetus-accent-2: #f2b33d;     /* amber */
  --cetus-btn-from: #1fe3c0;     /* teal (tonal button) */
  --cetus-btn-to: #0e9e84;       /* deep teal */
  --cetus-page-bg: #04060a;      /* abyss */
  --cetus-surface: #06090f;      /* card */
  --cetus-hairline: rgba(234, 246, 255, 0.1);
  --cetus-ink: #eaf6ff;
  --cetus-ink-muted: #8a98a6;
  --cetus-footer-ink: var(--cetus-ink-muted);
  /* Wordmark: Fraunces italic + static ink. */
  --cetus-display-font: 'Fraunces', serif;
  --cetus-display-weight: 300;
  --cetus-display-style: italic;
  --cetus-wordmark-bg: none;
  --cetus-wordmark-fill: var(--cetus-ink);
  --cetus-wordmark-animation: none;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', 'Menlo', monospace;

  background: var(--cetus-page-bg);
  color: var(--cetus-ink);
}

/* Override the shared .bg-sci-fi-dark gradient only when abyssal is active. */
.theme-abyssal.bg-sci-fi-dark,
.theme-abyssal .bg-sci-fi-dark {
  background: var(--cetus-page-bg);
}

/* ---------- Drift + reduced motion (homepage atmosphere) ---------- */
@keyframes cetus-drift {
  0%   { transform: translateY(0) translateX(0); opacity: 0.25; }
  50%  { transform: translateY(-14px) translateX(6px); opacity: 0.45; }
  100% { transform: translateY(0) translateX(0); opacity: 0.25; }
}

.cetus-particle {
  animation: cetus-drift 7s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .cetus-particle,
  .cetus-drift-host,
  .cetus-specimen {
    animation: none !important;
    transition: none !important;
  }
  .cetus-specimen:hover {
    transform: none !important;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run test src/styles/global.test.ts
```
Expected: PASS.

- [ ] **Step 5: Run lint + format**

```
bun run format
bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css src/styles/global.test.ts
git commit -m "feat(theme): add cetus semantic tokens and abyssal scope"
```

---

### Task 3: Give `AppLayout` a `theme` prop

**Files:**
- Modify: `src/layouts/AppLayout.astro`
- Create: `src/layouts/AppLayout.test.ts`

**Interfaces:**
- Produces: `AppLayout` accepts `theme?: 'default' | 'abyssal'`. When `'abyssal'`, the `<body>` gets the `theme-abyssal` class and the font `<link>` includes **Fraunces** + **JetBrains Mono** (Inter stays).

- [ ] **Step 1: Write the failing markup test**

Create `src/layouts/AppLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(process.cwd(), 'src/layouts/AppLayout.astro'), 'utf-8')

describe('AppLayout theme prop', () => {
    it('declares a theme prop with default and abyssal options', () => {
        expect(src).toMatch(/theme\??:\s*['"]default['"]\s*\|\s*['"]abyssal['"]/)
        expect(src).toMatch(/theme\s*=\s*['"]default['"]/)
    })

    it('applies theme-abyssal to the body conditionally', () => {
        expect(src).toContain('theme-abyssal')
        expect(src).toMatch(/theme\s*===\s*['"]abyssal['"]|theme\s*==\s*['"]abyssal['"]/)
    })

    it('loads Fraunces and JetBrains Mono', () => {
        expect(src).toContain('Fraunces')
        expect(src).toContain('JetBrains+Mono')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run test src/layouts/AppLayout.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement — modify `src/layouts/AppLayout.astro`**

In the frontmatter `Props` interface, add the theme:

```ts
export interface Props {
    title?: string
    description?: string
    includeFooter?: boolean
    navigation?: Array<{ href: string; label: string }>
    theme?: 'default' | 'abyssal'
}
```

In the destructure, add `theme = 'default'`:

```ts
const {
    title = 'Cetus - Single Player Minigames',
    description = 'The ultimate single-player gaming experience with futuristic minigames.',
    includeFooter = true,
    navigation,
    theme = 'default',
    ...props
} = Astro.props
```

Replace the single Google Fonts `<link href=…>` line with a conditional one. (Find the existing `<link href="https://fonts.googleapis.com/css2?family=Orbitron…>` and replace it with:)

```astro
<link
  href={
    theme === 'abyssal'
      ? 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'
      : 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400;500;600;700&display=swap'
  }
  rel="stylesheet"
/>
```

On the `<body>` element, add the conditional class. Change:

```astro
<body
  class="min-h-screen bg-sci-fi-dark text-foreground overflow-x-hidden scrollbar-sci-fi font-inter"
  {...props}
>
```

to:

```astro
<body
  class:list={[
    'min-h-screen bg-sci-fi-dark text-foreground overflow-x-hidden scrollbar-sci-fi font-inter',
    { 'theme-abyssal': theme === 'abyssal' },
  ]}
  {...props}
>
```

> The default-theme rendering is byte-identical to before (no `theme-abyssal` class, Orbitron/Inter font link, same body classes) — so every other page is unchanged.

- [ ] **Step 4: Run test to verify it passes**

```
bun run test src/layouts/AppLayout.test.ts
```
Expected: PASS.

- [ ] **Step 5: Run full suite to confirm no regressions on other pages**

```
bun run test:run
```
Expected: PASS (all pre-existing tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/layouts/AppLayout.astro src/layouts/AppLayout.test.ts
git commit -m "feat(layout): add theme prop to AppLayout for abyssal scope"
```

---

### Task 4: Switch shared shell components to `cetus-*` tokens

**Files:**
- Modify: `src/components/ui/Button.astro`
- Modify: `src/components/ui/Card.astro`
- Modify: `src/components/ui/Navigation.astro`
- Modify: `src/components/ui/Footer.astro`
- Create: `src/components/ui/shell-tokens.test.ts`

**Interfaces:**
- Consumes: the `cetus-*` utilities + arbitrary-value gradient tokens from Task 2.
- Produces: the four shell components render identically on default pages (tokens resolve to current cyan/purple) and abyssal on the homepage (tokens resolve to teal/amber). No prop changes.

> **Why this is the riskiest task:** these components are used on every page. The token values under `:root` are chosen to equal today's exact colors, so visual output on non-homepage pages must not change. The full test suite + a dev-server spot-check of one non-homepage page (e.g. `/leaderboard`) is the gate.

- [ ] **Step 1: Write the failing markup test**

Create `src/components/ui/shell-tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) =>
    readFileSync(resolve(process.cwd(), p), 'utf-8')

describe('shell components use cetus tokens (not hardcoded cyan/purple)', () => {
    it('Button primary uses the token gradient, not from-cyan-500', () => {
        const s = read('src/components/ui/Button.astro')
        expect(s).not.toMatch(/from-cyan-500/)
        expect(s).toContain('from-[var(--cetus-btn-from)]')
        expect(s).toContain('to-[var(--cetus-btn-to)]')
        expect(s).not.toMatch(/to-purple-600/)
    })

    it('Button outline uses cetus-accent, not text-cyan-400', () => {
        const s = read('src/components/ui/Button.astro')
        expect(s).not.toMatch(/text-cyan-400/)
        expect(s).toContain('text-cetus-accent')
        expect(s).toContain('border-cetus-accent')
    })

    it('Card sci-fi variant uses cetus surface/hairline/accent', () => {
        const s = read('src/components/ui/Card.astro')
        expect(s).toContain('bg-cetus-surface')
        expect(s).toContain('border-cetus-hairline')
        expect(s).toContain('hover:border-cetus-accent')
    })

    it('Navigation logo + links use cetus tokens', () => {
        const s = read('src/components/ui/Navigation.astro')
        expect(s).not.toMatch(/from-cyan-400/)
        expect(s).toContain('cetus-btn-from')
        expect(s).toContain('text-cetus-ink-muted')
    })

    it('Footer uses cetus hairline + ink-muted', () => {
        const s = read('src/components/ui/Footer.astro')
        expect(s).toContain('border-cetus-hairline')
        expect(s).toContain('text-cetus-ink-muted')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run test src/components/ui/shell-tokens.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Update `src/components/ui/Button.astro`**

In the `buttonVariants.variant` object, replace the `outline` and `primary` entries:

```ts
    outline:
      'border-2 border-cetus-accent text-cetus-accent bg-transparent hover:bg-cetus-accent hover:text-[var(--cetus-page-bg)]',
    secondary:
      'bg-gradient-to-r from-slate-700 to-slate-800 text-white border border-slate-600 hover:from-slate-600 hover:to-slate-700',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
    primary:
      'bg-gradient-to-r from-[var(--cetus-btn-from)] to-[var(--cetus-btn-to)] text-white shadow-lg shadow-black/20 hover:brightness-110',
```

Leave `default` and `destructive` untouched. (The `sciFiClasses` string can stay; it only adds focus-ring utilities.)

- [ ] **Step 4: Update `src/components/ui/Card.astro`**

Replace the `'sci-fi'` and `glass` variant entries:

```ts
    'sci-fi':
      'group relative bg-cetus-surface border border-cetus-hairline rounded-2xl hover:border-cetus-accent/60 transition-all duration-300',
    glass: 'bg-cetus-surface/80 rounded-3xl border border-cetus-hairline',
```

- [ ] **Step 5: Update `src/components/ui/Navigation.astro`**

Replace the logo block and the nav link classes. The logo `<div>`:

```astro
      <div
        class="w-10 h-10 bg-gradient-to-r from-[var(--cetus-btn-from)] to-[var(--cetus-btn-to)] rounded-lg flex items-center justify-center shadow-lg shadow-black/20"
      >
        <span class="text-xl font-bold text-white">{logo}</span>
      </div>
```

The nav link `<a>`:

```astro
            class="text-cetus-ink-muted hover:text-cetus-accent transition-colors duration-300"
```

- [ ] **Step 6: Update `src/components/ui/Footer.astro`**

Change the `classes` `cn(...)`:

```ts
const classes = cn(
  'relative z-10 px-6 py-8 border-t border-cetus-hairline',
  className
)
```

and the paragraph:

```astro
    <p class="text-cetus-ink-muted">{copyright}</p>
```

- [ ] **Step 7: Run the new test + the full suite**

```
bun run test src/components/ui/shell-tokens.test.ts
bun run test:run
```
Expected: PASS (new test green; all pre-existing tests green — confirms no other page broke).

- [ ] **Step 8: Dev-server spot-check (manual)**

```
bun run web:dev
```
Open `http://localhost:4325/leaderboard` and one game page. Confirm they look identical to before (cyan/purple, Orbitron headings). The homepage will still look old until Task 7 — that's expected.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/Button.astro src/components/ui/Card.astro src/components/ui/Navigation.astro src/components/ui/Footer.astro src/components/ui/shell-tokens.test.ts
git commit -m "refactor(ui): switch shell components to cetus semantic tokens"
```

---

### Task 5: Build the `Organism` renderer

**Files:**
- Create: `src/components/organisms/Organism.astro`
- Create: `src/components/organisms/Organism.test.ts`

**Interfaces:**
- Consumes: `OrganismIdentity` from `src/lib/organisms.ts` (`{ shape, color, orb? }`).
- Produces: `Organism.astro` with `Props { identity: OrganismIdentity; class?: string }`. Renders one glowing shape. Color is applied via a `data-color` attribute + scoped CSS (reduced-motion-safe).

- [ ] **Step 1: Write the failing markup test**

Create `src/components/organisms/Organism.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(
    resolve(process.cwd(), 'src/components/organisms/Organism.astro'),
    'utf-8'
)

describe('Organism renderer', () => {
    it('accepts an OrganismIdentity prop', () => {
        expect(src).toMatch(/identity:\s*OrganismIdentity/)
    })

    it('branches on all six shapes', () => {
        for (const shape of [
            'orb',
            'chain',
            'spiral',
            'frond',
            'cluster',
            'lattice',
        ]) {
            expect(src).toContain(`'${shape}'`)
        }
    })

    it('renders color via a data attribute, not color alone', () => {
        expect(src).toMatch(/data-color/)
    })

    it('supports the orbit ring variant', () => {
        expect(src).toContain('orbit')
    })
})
```

Also append a data-level test to `src/lib/organisms.test.ts` (guarantees every identity color is one of the five) — already covered by Task 1's registry test; no new test needed here.

- [ ] **Step 2: Run test to verify it fails**

```
bun run test src/components/organisms/Organism.test.ts
```
Expected: FAIL (file missing).

- [ ] **Step 3: Implement `src/components/organisms/Organism.astro`**

```astro
---
import type { HTMLAttributes } from 'astro/types'
import type { OrganismIdentity } from '@/lib/organisms'

export interface Props extends HTMLAttributes<'div'> {
    identity: OrganismIdentity
    class?: string
}

const { identity, class: className = '', ...props } = Astro.props
const { shape, color, orb } = identity
---

<div
  class:list={['cetus-org', `cetus-org--${shape}`, className]}
  data-color={color}
  data-orb={orb ? 'true' : undefined}
  {...props}
>
  {shape === 'orb' && (
    <div class="cetus-org__orb"></div>
  )}
  {shape === 'chain' && (
    <div class="cetus-org__chain">
      <i></i><i></i><i></i><i></i><i></i><i></i><i></i>
    </div>
  )}
  {shape === 'spiral' && (
    <svg class="cetus-org__spiral" viewBox="0 0 60 60" aria-hidden="true">
      <path
        d="M30 30 m0 0 a12 12 0 1 1 12 12 a20 20 0 1 1 -20 -20 a28 28 0 1 1 28 28"
        fill="none"
        stroke-width="1.5"
        stroke-linecap="round"
        pathLength={100}
      ></path>
    </svg>
  )}
  {shape === 'frond' && (
    <div class="cetus-org__frond">
      <i></i><i></i><i></i><i></i><i></i>
    </div>
  )}
  {shape === 'cluster' && (
    <div class="cetus-org__cluster">
      <i></i><i></i><i></i><i></i><i></i><i></i><i></i>
    </div>
  )}
  {shape === 'lattice' && (
    <div class="cetus-org__lattice">
      <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
    </div>
  )}
  {orb && <span class="cetus-org__orbit" aria-hidden="true"></span>}
</div>

<style>
  /* Color resolves from the data-color attribute -> CSS custom prop -> glow. */
  .cetus-org {
    --org: var(--cetus-accent);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cetus-org[data-color='teal']    { --org: #1fe3c0; }
  .cetus-org[data-color='amber']   { --org: #f2b33d; }
  .cetus-org[data-color='magenta'] { --org: #ff3d8a; }
  .cetus-org[data-color='ice']     { --org: #6fe3ff; }
  .cetus-org[data-color='green']   { --org: #5dff9f; }

  .cetus-org__orb {
    width: 46px;
    height: 46px;
    border-radius: 50% 50% 46% 46%;
    background: radial-gradient(
      circle at 50% 35%,
      var(--org),
      color-mix(in srgb, var(--org) 25%, transparent) 60%,
      transparent
    );
    box-shadow: 0 0 28px color-mix(in srgb, var(--org) 55%, transparent);
  }

  .cetus-org__chain,
  .cetus-org__cluster,
  .cetus-org__frond,
  .cetus-org__lattice {
    display: flex;
    gap: 4px;
  }
  .cetus-org__chain {
    flex-direction: column;
    gap: 5px;
  }
  .cetus-org__chain i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--org);
    box-shadow: 0 0 10px color-mix(in srgb, var(--org) 70%, transparent);
  }
  .cetus-org__chain i:first-child { width: 11px; height: 11px; }
  .cetus-org__chain i:nth-child(2) { width: 9px; height: 9px; }

  .cetus-org__cluster {
    width: 52px;
    height: 52px;
    position: relative;
  }
  .cetus-org__cluster i {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--org);
    box-shadow: 0 0 8px color-mix(in srgb, var(--org) 70%, transparent);
  }
  .cetus-org__cluster i:nth-child(1) { top: 20%; left: 40%; }
  .cetus-org__cluster i:nth-child(2) { top: 40%; left: 20%; }
  .cetus-org__cluster i:nth-child(3) { top: 40%; left: 60%; }
  .cetus-org__cluster i:nth-child(4) { top: 60%; left: 40%; }
  .cetus-org__cluster i:nth-child(5) { top: 25%; left: 65%; }
  .cetus-org__cluster i:nth-child(6) { top: 65%; left: 25%; }
  .cetus-org__cluster i:nth-child(7) { top: 50%; left: 50%; width: 6px; height: 6px; }

  .cetus-org__lattice {
    width: 52px;
    height: 52px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .cetus-org__lattice i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--org);
    box-shadow: 0 0 8px color-mix(in srgb, var(--org) 70%, transparent);
  }

  .cetus-org__frond {
    flex-direction: row;
    align-items: flex-end;
    gap: 3px;
    height: 48px;
  }
  .cetus-org__frond i {
    width: 2px;
    background: linear-gradient(var(--org), transparent);
    border-radius: 2px;
  }
  .cetus-org__frond i:nth-child(1) { height: 60%; }
  .cetus-org__frond i:nth-child(2) { height: 100%; }
  .cetus-org__frond i:nth-child(3) { height: 80%; }
  .cetus-org__frond i:nth-child(4) { height: 45%; }
  .cetus-org__frond i:nth-child(5) { height: 65%; }

  .cetus-org__spiral {
    width: 56px;
    height: 56px;
    stroke: var(--org);
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--org) 70%, transparent));
  }

  .cetus-org__orbit {
    position: absolute;
    inset: -22px;
    border: 1px dashed color-mix(in srgb, var(--org) 40%, transparent);
    border-radius: 50%;
  }

  /* Gentle ambient pulse; disabled under reduced-motion (global rule). */
  .cetus-org {
    animation: cetus-drift 8s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .cetus-org { animation: none !important; }
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run test src/components/organisms/Organism.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/organisms/Organism.astro src/components/organisms/Organism.test.ts
git commit -m "feat(organisms): add bioluminescent organism renderer"
```

---

### Task 6: Build the `SpecimenCard` (Vessel)

**Files:**
- Create: `src/components/ui/SpecimenCard.astro`
- Create: `src/components/ui/SpecimenCard.test.ts`

**Interfaces:**
- Consumes: `Game` (+ its `organism`, `depth`) from `src/lib/games.ts`; `getGameUrl`, `DEPTH_LABELS` from `src/lib/organisms.ts` (re-exported via `games.ts`); `Organism.astro` from Task 5.
- Produces: `SpecimenCard.astro` `Props { game: Game; catalogNumber: number; class?: string }`. Renders the whole card as an `<a href=getGameUrl(game.id)>` containing the vessel (lid/neck/body), the `<Organism>`, and meta (catalog no., name, depth reading, 3 difficulty dots). Whole-card hover lifts the vessel and intensifies glow; reduced-motion is honored by the global rule.

- [ ] **Step 1: Write the failing markup test**

Create `src/components/ui/SpecimenCard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(
    resolve(process.cwd(), 'src/components/ui/SpecimenCard.astro'),
    'utf-8'
)

describe('SpecimenCard (Vessel)', () => {
    it('renders the whole card as a link to the game url', () => {
        expect(src).toContain("import { getGameUrl }")
        expect(src).toMatch(/href=\{getGameUrl\(game\.id\)\}/)
    })

    it('renders the vessel (lid + neck + body)', () => {
        expect(src).toContain('vessel__lid')
        expect(src).toContain('vessel__neck')
        expect(src).toContain('vessel__body')
    })

    it('embeds the Organism component', () => {
        expect(src).toMatch(/import Organism/)
        expect(src).toMatch(/<Organism/)
    })

    it('shows catalog number, name, depth reading, difficulty dots', () => {
        expect(src).toContain('catalogNumber')
        expect(src).toContain('vessel__name')
        expect(src).toContain('DEPTH_LABELS')
        expect(src).toContain('difficulty-dots')
    })

    it('has no emoji icon and no Play Now pill', () => {
        expect(src).not.toContain('getGameIcon')
        expect(src).not.toContain('Play Now')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run test src/components/ui/SpecimenCard.test.ts
```
Expected: FAIL (file missing).

- [ ] **Step 3: Implement `src/components/ui/SpecimenCard.astro`**

```astro
---
import { cn } from '@/lib/utils'
import { getGameUrl } from '@/lib/games'
import { DEPTH_LABELS } from '@/lib/organisms'
import Organism from '@/components/organisms/Organism.astro'
import type { HTMLAttributes } from 'astro/types'
import type { Game } from '@/lib/games'

export interface Props extends HTMLAttributes<'a'> {
    game: Game
    catalogNumber: number
    class?: string
}

const { game, catalogNumber, class: className = '', ...props } = Astro.props

const available = game.isActive
const depth = game.depth ? DEPTH_LABELS[game.depth] : null
const difficultyDots =
    game.difficulty === 'easy' ? 1 : game.difficulty === 'medium' ? 2 : 3
const n = String(catalogNumber).padStart(2, '0')
---

<a
  href={available ? getGameUrl(game.id) : undefined}
  aria-disabled={available ? undefined : 'true'}
  data-testid="specimen-card"
  class:list={[
    'cetus-specimen vessel group relative block rounded-2xl p-5 text-center',
    !available && 'opacity-50 pointer-events-none',
    className,
  ]}
  {...props}
>
  <div class="vessel__lid"></div>
  <div class="vessel__neck"></div>
  <div class="vessel__body">
    {available && game.organism ? (
      <Organism identity={game.organism} />
    ) : (
      <span class="vessel__empty" aria-hidden="true"></span>
    )}
  </div>

  <div class="vessel__meta">
    <div class="vessel__no">N°·{n}</div>
    <div class="vessel__name">{game.name}</div>
    {depth && (
      <div class="vessel__depth">{depth.reading} · {depth.label.toUpperCase()}</div>
    )}
    <div
      class="difficulty-dots"
      role="img"
      aria-label={`difficulty ${game.difficulty}`}
    >
      <span class:list={[{ on: difficultyDots >= 1 }]}></span>
      <span class:list={[{ on: difficultyDots >= 2 }]}></span>
      <span class:list={[{ on: difficultyDots >= 3 }]}></span>
    </div>
  </div>
</a>

<style>
  .vessel {
    text-decoration: none;
    transition: transform 0.2s ease;
  }
  .vessel:hover { transform: translateY(-3px); }
  .vessel:focus-visible {
    outline: 2px solid var(--cetus-accent);
    outline-offset: 2px;
    transform: translateY(-3px);
  }
  .vessel:focus-visible .vessel__body {
    box-shadow: inset 0 0 34px color-mix(in srgb, var(--cetus-accent) 18%, transparent),
      0 0 24px color-mix(in srgb, var(--cetus-accent) 25%, transparent);
  }

  .vessel__lid {
    width: 50px;
    height: 8px;
    margin: 0 auto;
    background: linear-gradient(#2a3340, #161c24);
    border-radius: 3px 3px 1px 1px;
  }
  .vessel__neck {
    width: 78px;
    height: 10px;
    margin: 0 auto;
    border-left: 1px solid var(--cetus-hairline);
    border-right: 1px solid var(--cetus-hairline);
  }
  .vessel__body {
    width: 118px;
    height: 138px;
    margin: 0 auto;
    border: 1px solid var(--cetus-hairline);
    border-radius: 18px 18px 26px 26px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--cetus-accent) 6%, transparent), transparent 60%);
    box-shadow: inset 0 0 30px color-mix(in srgb, var(--cetus-accent) 8%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .vessel:hover .vessel__body {
    box-shadow: inset 0 0 34px color-mix(in srgb, var(--cetus-accent) 18%, transparent),
      0 0 24px color-mix(in srgb, var(--cetus-accent) 25%, transparent);
  }
  .vessel__empty { width: 30px; height: 30px; border-radius: 50%; background: var(--cetus-hairline); }

  .vessel__meta { margin-top: 0.85rem; color: var(--cetus-ink); }
  .vessel__no {
    font: 500 14px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.1em;
    color: var(--cetus-accent);
    opacity: 0.7;
  }
  .vessel__name {
    font: 400 22px/1.1 'Fraunces', serif;
    color: var(--cetus-ink);
    margin: 7px 0 5px;
  }
  .vessel__depth {
    font: 500 14px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.05em;
    color: var(--cetus-ink-muted);
  }
  .difficulty-dots { display: flex; gap: 4px; justify-content: center; margin-top: 9px; }
  .difficulty-dots span { width: 5px; height: 5px; border-radius: 50%; background: color-mix(in srgb, var(--cetus-ink) 20%, transparent); }
  .difficulty-dots span.on { background: var(--cetus-accent); box-shadow: 0 0 6px var(--cetus-accent); }

  @media (prefers-reduced-motion: reduce) {
    .vessel:hover,
    .vessel:focus-visible { transform: none; }
    .vessel:hover .vessel__body,
    .vessel:focus-visible .vessel__body {
      box-shadow: inset 0 0 30px color-mix(in srgb, var(--cetus-accent) 8%, transparent);
    }
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run test src/components/ui/SpecimenCard.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/SpecimenCard.astro src/components/ui/SpecimenCard.test.ts
git commit -m "feat(ui): add SpecimenCard vessel component"
```

---

### Task 7: Rewrite the homepage to the abyssal composition

**Files:**
- Modify: `src/pages/index.astro` (full rewrite of the body)
- Create: `src/pages/index-markup.test.ts`

**Interfaces:**
- Consumes: `AppLayout` (`theme="abyssal"`), `SpecimenCard`, `getGamesByDepth`, `getFeaturedGames`, `DEPTH_LABELS`, `getAllGames`, `GameID`.
- Produces: homepage with hero vitrine (5 featured specimens) + 3 depth-zoned catalogs + value strip. No `Hero`/`FeatureCard`/promo box/emoji icons on this page.

- [ ] **Step 1: Write the failing markup test**

Create `src/pages/index-markup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(process.cwd(), 'src/pages/index.astro'), 'utf-8')

describe('homepage abyssal composition', () => {
    it('opts into the abyssal theme', () => {
        expect(src).toMatch(/theme\s*=\s*['"]abyssal['"]/)
    })

    it('renders a hero vitrine of featured specimens', () => {
        expect(src).toContain('id="hero-vitrine"')
        expect(src).toContain('getFeaturedGames')
        expect(src).toMatch(/Cetus/) // wordmark
    })

    it('renders the three depth zones with mono labels', () => {
        expect(src).toContain('getGamesByDepth')
        expect(src).toContain("'shallow'")
        expect(src).toContain("'mid'")
        expect(src).toContain("'abyssal'")
        expect(src).toContain('DEPTH_LABELS')
    })

    it('uses SpecimenCard, not the old GameCard', () => {
        expect(src).toMatch(/import SpecimenCard/)
        expect(src).not.toContain('GameCard')
    })

    it('renders the value strip with the three promises', () => {
        expect(src).toContain('No login')
        expect(src).toContain('track your depths')
        expect(src).toContain('any screen')
    })

    it('removes the old hero / features / promo box', () => {
        expect(src).not.toContain('MINIGAMES OF THE FUTURE')
        expect(src).not.toContain('Compete for Glory')
        expect(src).not.toContain('FeatureCard')
        expect(src).not.toContain('text-holographic')
    })

    it('keeps Orbitron off the homepage', () => {
        expect(src).not.toMatch(/font-orbitron/)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run test src/pages/index-markup.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Rewrite `src/pages/index.astro`**

Replace the entire file with:

```astro
---
import AppLayout from '@/layouts/AppLayout.astro'
import Container from '@/components/ui/Container.astro'
import SpecimenCard from '@/components/ui/SpecimenCard.astro'
import {
    getAllGames,
    getGamesByDepth,
    getFeaturedGames,
    DEPTH_LABELS,
    type DepthZone,
} from '@/lib/games'

const user = Astro.locals.user
const games = getAllGames()
const featured = getFeaturedGames(games)
const zones: DepthZone[] = ['shallow', 'mid', 'abyssal']

// Catalog numbers run 01..14, assigned within each zone in registry order.
const catalogIndex = new Map<string, number>()
let n = 1
for (const z of zones) {
    for (const g of getGamesByDepth(z, games)) {
        catalogIndex.set(g.id, n++)
    }
}
---

<AppLayout
  title="Cetus — A catalog of single-player games"
  description="Fourteen single-player minigames, trawled from the deep. No login — play in one click."
  theme="abyssal"
>
  <!-- HERO VITRINE -->
  <section id="hero-vitrine" class="relative px-6 pt-20 pb-16">
    <!-- drifting bioluminescence (reduced-motion disables via global CSS) -->
    <div class="cetus-drift-host absolute inset-0 pointer-events-none" aria-hidden="true">
      {
        Array.from({ length: 8 }).map((_, i) => (
          <span
            class="cetus-particle absolute rounded-full"
            style={`left:${10 + i * 11}%; top:${15 + ((i * 37) % 70)}%; width:3px; height:3px; background:${i % 2 ? '#1FE3C0' : '#F2B33D'}; animation-delay:${i * 0.8}s;`}
          />
        ))
      }
    </div>

    <Container class="relative max-w-5xl text-center">
      <p class="font-mono text-xs tracking-[0.34em] text-cetus-accent">
        CETUS · DEEP CATALOG
      </p>
      <h1 class="mt-5 text-6xl md:text-8xl" style="font: italic 300 1em/0.95 'Fraunces', serif;">
        Cetus
      </h1>
      <p class="mx-auto mt-6 max-w-xl text-cetus-ink-muted">
        A catalog of single-player games, trawled from the deep. No login — play
        in one click.
      </p>

      <nav aria-label="Featured games" class="mt-12">
        <ul class="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {
            featured.map(g => (
              <li>
                <SpecimenCard game={g} catalogNumber={catalogIndex.get(g.id)!} />
              </li>
            ))
          }
        </ul>
      </nav>

      <p class="mt-10 font-mono text-xs tracking-[0.2em] text-cetus-ink-muted">
        <a href="#catalog">browse all fourteen ↓</a>
      </p>
    </Container>
  </section>

  <!-- CATALOG, DEPTH-ZONED -->
  <section id="catalog" class="relative px-6 py-16">
    <Container class="max-w-7xl">
      {
        zones.map(zone => {
          const meta = DEPTH_LABELS[zone]
          const inZone = getGamesByDepth(zone, games)
          return (
            <div class="mb-16 last:mb-0">
              <header class="mb-6 flex items-baseline gap-4 border-b border-cetus-hairline pb-3">
                <h2 class="text-sm font-medium tracking-[0.18em] text-cetus-accent">
                  {meta.label.toUpperCase()}
                </h2>
                <span class="font-mono text-xs text-cetus-ink-muted">
                  {meta.reading}
                </span>
                <span class="ml-auto hidden text-sm text-cetus-ink-muted sm:block">
                  {meta.note}
                </span>
              </header>
              <ul class="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
                {inZone.map(g => (
                  <li>
                    <SpecimenCard game={g} catalogNumber={catalogIndex.get(g.id)!} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })
      }
    </Container>
  </section>

  <!-- VALUE STRIP -->
  <section class="relative px-6 py-12">
    <Container class="max-w-4xl text-center">
      <p class="text-sm text-cetus-ink-muted">
        No login — play in one click ·{' '}
        <a href="/login" class="text-cetus-accent hover:underline">
          sign in to track your depths
        </a>{' '}
        · works on any screen
      </p>
    </Container>
  </section>
</AppLayout>
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run test src/pages/index-markup.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro src/pages/index-markup.test.ts
git commit -m "feat(homepage): rewrite to abyssal vitrine + depth-zoned catalog"
```

---

### Task 8: Verification — full suite, lint, format, build, visual smoke

**Files:** none (verification only).

- [ ] **Step 1: Run the complete test suite**

```
bun run test:run
```
Expected: ALL PASS — including all new tests and every pre-existing test (confirms no other page regressed).

- [ ] **Step 2: Lint + format**

```
bun run format
bun run lint
```
Expected: no errors. Commit any formatting changes:

```bash
git add -A && git commit -m "style: format homepage redesign" || echo "nothing to format"
```

- [ ] **Step 3: Production build**

```
bun run build
```
Expected: build succeeds with no type errors (`@astrojs/check`).

- [ ] **Step 4: Dev-server visual smoke (manual)**

```
bun run web:dev
```
Open `http://localhost:4325/` and confirm:
- Abyssal dark background, teal/amber accents, Fraunces italic "Cetus" wordmark.
- Hero vitrine shows 5 specimens; clicking one opens the game.
- Three depth zones each render their specimen cards with unique organisms.
- Hovering a vessel lifts it and intensifies the glow.
- Value strip is one quiet line.
- Then open `http://localhost:4325/leaderboard` and a game page — confirm they are **unchanged** (cyan/purple, Orbitron).

- [ ] **Step 5: Final commit if any fixes were needed during the smoke check**

```bash
git add -A && git commit -m "fix(homepage): smoke-check adjustments" || echo "clean"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** every spec section maps to a task — tokens (T2), theme scope (T2/T3), shared-component theming (T4), organism taxonomy (T1 data + T5 renderer), Vessel card (T6), composition + hero + depth zones + value strip + footer (T7), motion + reduced-motion (T2 global rule + T5/T6 local rules), accessibility (focus via `<a>`, semantics via `<ul>`/`<nav>`, color-not-alone via shape + text labels), non-goals respected (no other page touched; sci-fi utilities kept). ✓

**Placeholder scan:** no TBD/TODO/"add appropriate …". Every code step contains real code. ✓

**Type consistency:** `OrganismIdentity` / `DepthZone` defined in T1, consumed unchanged in T5 (`identity: OrganismIdentity`) and T6 (`game.organism`, `game.depth`). `DEPTH_LABELS`, `getGamesByDepth`, `getFeaturedGames`, `getGameUrl` signatures match across producers (T1) and consumers (T6/T7). ✓

**Risks flagged inline:** T1 circular import (explained safe), T4 cross-page visual risk (manual spot-check gate in T4 Step 8 + T8 Step 4).
