# Cetus Homepage — Abyssal Redesign Spec

- **Date:** 2026-07-06
- **Status:** Approved design, ready for implementation planning
- **Scope:** Homepage only (`src/pages/index.astro` and the components it renders)

## Overview

Redesign the Cetus homepage around a single, ownable concept: **Cetus is the
deep ocean at night.** The product is named after the whale / sea-monster
constellation, and the current "MINIGAMES OF THE FUTURE" treatment leans on
generic neon-sci-fi defaults (cyan/purple/pink gradient, holographic text,
floating particles, emoji icons, Orbitron caps). This redesign replaces those
defaults with a deep-sea bioluminescent identity that no other minigames site
has.

The homepage's single job stays the same: **get a visitor into a game, fast,
with no login required.** The new design serves that job by making the hero
itself a playable game picker, and by organizing the 14 games by how deep a
session goes.

## Design decisions (locked during brainstorm)

| Axis | Decision |
|---|---|
| Aesthetic | Abyssal Bioluminescence — owns the name "Cetus" |
| Hero | Vitrine: the hero doubles as the game picker |
| Catalog | Depth-zoned (Shallow / Mid-water / Abyssal) |
| Game card | Vessel — each game is a specimen in a glass jar |
| Mood | Quiet drifting bioluminescence behind the hero (disciplined) |

## Design tokens

### Palette

| Token | Value | Use |
|---|---|---|
| `--abyss` | `#04060A` | page background |
| `--abyss-card` | `#06090F` | card / vessel body |
| `--abyss-raised` | `#0A1018` | hover / raised surfaces |
| `--ink` | `#EAF6FF` | primary text |
| `--ink-muted` | `#8A98A6` | secondary text |
| `--ink-faint` | `#6A7C8A` | labels, metadata |
| `--hairline` | `rgba(234,246,255,0.10)` | dividers, vessel walls |
| `--teal` | `#1FE3C0` | primary accent |
| `--amber` | `#F2B33D` | accent / abyssal marker |
| `--magenta` | `#FF3D8A` | accent |
| `--ice` | `#6FE3FF` | accent |
| `--green` | `#5DFF9F` | accent (5th organism color) |

Accents are never used as a gradient on the wordmark or backgrounds. They are
point glows — the bioluminescence of individual organisms.

### Typography

| Role | Family | Treatment |
|---|---|---|
| Display (wordmark, hero, game names) | **Fraunces** (variable serif) | italic 300 for the wordmark; regular 400 for game names |
| Body | **Inter** | 400 / 500 / 600 |
| Data (labels, catalog nos., depth) | **JetBrains Mono** | 500, wide tracking, uppercase |

**Orbitron is retired on the homepage.** Type scale is led by the serif — the
italic Fraunces wordmark is the single most distinctive typographic move and
replaces the animated holographic gradient.

### Form

- Glass **vessels** with soft inner glow and `1px` hairline walls.
- Rounded vessel silhouettes (jar body radius ~26px). The jar outline is the
  page's repeating visual motif.
- **No** neon drop-shadow stacking, **no** `text-holographic`, **no** emoji as
  icons. Bioluminescence is drawn, not emoji-fied.

## The signature — every game is a unique organism

Each of the 14 games is represented by a small CSS-drawn bioluminescent
organism inside its vessel. To keep this maintainable, organisms come from a
**taxonomy of six shapes**, each rendered in a per-game signature color:

1. **Orb** — glowing sphere, optional orbit ring
2. **Siphonophore** — vertical serpentine chain of dots
3. **Spiral** — coiled line
4. **Frond** — branching filaments
5. **Cluster** — tight constellation of dots
6. **Lattice** — grid of glowing nodes

A game's identity = `(shape, color, optional variant)` and lives as data (see
Implementation). The shape carries the game's *nature* (grid, chain, single
focus, branching); the color carries individuality. No two adjacent specimens
in the catalog share both shape and color.

### Proposed organism assignments (adjustable)

| Game | Shape | Color | Depth zone |
|---|---|---|---|
| Reflex | Orb | magenta | Shallow |
| Quick Math | Orb | amber | Shallow |
| Word Scramble | Frond | green | Shallow |
| Bejeweled | Cluster | magenta | Shallow |
| Evader | Spiral | teal | Shallow |
| Snake | Siphonophore | green | Mid-water |
| Tetris | Lattice | teal | Mid-water |
| 2048 | Cluster | amber | Mid-water |
| Path Navigator | Spiral | ice | Mid-water |
| Bubble Shooter | Orb + orbit | ice | Mid-water |
| Circuit Hacker | Frond | ice | Mid-water |
| Sudoku | Lattice | amber | Abyssal |
| Satellite Sync | Orb + orbit | teal | Abyssal |
| Memory Matrix | Cluster | magenta | Abyssal |

## Homepage composition

```
┌─────────────────────────────────────────────┐
│ NAV  cetus            catalog  leaderboard   │  ← abyssal-themed on this page only
├─────────────────────────────────────────────┤
│                                             │
│        Cetus  (italic Fraunces)             │
│   a catalog of single-player games,         │  HERO VITRINE
│   trawled from the deep. no login.          │  ~5 featured specimens, click → play
│                                             │
│   [jar] [jar] [jar] [jar] [jar]             │
│         · 8 drifting particles ·            │
├─────────────────────────────────────────────┤
│  SHALLOW · 0–200m                           │  CATALOG, depth-zoned
│  [jar] [jar] [jar] [jar] [jar]              │
│                                             │
│  MID-WATER · 1000m                          │
│  [jar] [jar] [jar] [jar] [jar] [jar]        │
│                                             │
│  ABYSSAL · 4000m+                           │
│  [jar] [jar] [jar]                          │
├─────────────────────────────────────────────┤
│  No login, play in one click · Signs in to   │  VALUE STRIP
│  track your depths · Works on any screen.    │  (one quiet line)
├─────────────────────────────────────────────┤
│  footer                                     │
└─────────────────────────────────────────────┘
```

### 1. Hero vitrine
- Italic Fraunces **Cetus** wordmark.
- One-line positioning: *"A catalog of single-player games, trawled from the
  deep. No login."*
- Horizontal **vitrine of 5 featured specimens** — the most accessible games
  (proposed: Reflex, Bejeweled, Snake, 2048, Tetris). Each is a real link to
  the game; click → play instantly.
- **~8 drifting bioluminescent particles** behind the hero (down from the
  current 30). Gentle vertical drift, low opacity, per-particle color from the
  accent palette.
- Cue to scroll: *"browse all fourteen ↓"*.

### 2. Catalog, depth-zoned
- Three zones, each with a quiet **mono depth label** (`SHALLOW · 0–200m`,
  `MID-WATER · 1000m`, `ABYSSAL · 4000m+`) and a one-line note on what lives
  there.
- Vessel cards flow in a responsive grid within each zone.
- **No search/filter UI.** 14 games does not need it; depth is the index.

### 3. Value strip
Replaces the current 4-card emoji "Why Choose Cetus?" block. Three short
statements on one quiet line, separated by middots:

> *No login — play in one click · Sign in to track your depths · Works on any
> screen.*

### 4. Footer
Minimal. The existing leaderboard/achievements promo box is **removed**;
leaderboard moves into the nav as a plain link.

## Specimen card (Vessel) component

The workhorse. Replaces `GameCard.astro` rendering on the homepage.

```
┌──────────────────┐
│      ▄▄▄         │  ← lid + neck (dark metal)
│   ┌──────────┐   │
│   │ ·glow·   │   │  ← glass body, hairline wall, inner glow
│   │  organism │  │  ← unique shape + color per game
│   │   ····    │  │
│   └──────────┘   │
│                  │
│      N°·03       │  ← catalog no. (mono, teal, faint)
│     Bejeweled    │  ← name (Fraunces regular)
│  0–200m · SHALLOW│  ← depth (mono, faint)
│      ● ● ○       │  ← difficulty dots (3)
└──────────────────┘
```

- **Whole card is the play affordance.** Hover: organism glow intensifies,
  vessel lifts ~3px, soft outer pulse. The whole card links to the game.
- **Data shown:** catalog number, name, depth reading, 3-dot difficulty.
- **Removed from current card:** emoji icon, "Play Now" pill button (the whole
  card is the action), separate duration label (folded into depth).
- **Coming-soon state:** the jar is empty/dark, organism absent, card
  non-interactive (none of the 14 use it today, but keep the state).

## Depth zone assignment (5 / 6 / 3)

Depth blends **session length** and **demands on the player** (not raw
difficulty, which is why long-but-easy Bubble Shooter is mid-water, not
abyssal).

| Zone | Depth | Games | Rationale |
|---|---|---|---|
| Shallow | 0–200m | Reflex, Quick Math, Word Scramble, Bejeweled, Evader | ≤ ~3 min, pick-up-and-play |
| Mid-water | 1000m | Snake, Tetris, 2048, Path Navigator, Bubble Shooter, Circuit Hacker | focused 3–10 min sessions |
| Abyssal | 4000m+ | Sudoku, Satellite Sync, Memory Matrix | long and/or hardest; the deep divers |

This is a default and is cheap to retune (it is data, not layout). *Memory
Matrix sits in the abyss because it is the hardest brain-taxing game; flag for
review during implementation.*

## Motion & interaction

- **Hero particles:** ~8 elements, gentle vertical drift (CSS keyframes, ~6–10s
  loop), opacity ~0.25–0.4, per-particle accent color.
- **Vessel hover:** organism glow intensifies (box-shadow / filter), card
  translates up ~3px, a single soft pulse ring. ~200ms ease.
- **Hero vitrine specimens:** same hover treatment; the featured row also gets
  a one-time entrance fade/slide on load.
- `prefers-reduced-motion: reduce` → **all** drift and pulse disabled; glow
  becomes static; hover becomes a plain color change only.

## Accessibility

- **Contrast:** ink `#EAF6FF` on `#04060A` is well above WCAG AA. Muted
  `#8A98A6` on `#04060A` passes AA for large/normal text; `#6A7C8A` is reserved
  for non-essential metadata and kept ≥ 14px.
- **Focus:** visible focus ring (`--teal`, 2px offset) on every interactive
  specimen (they are links).
- **Reduced motion** honored everywhere (above).
- **Semantics:** the catalog is a `<ul>` of links; zone labels are headings;
  the vitrine is a `<nav aria-label="Featured games">`.
- **No information conveyed by color alone** — every organism also has a unique
  shape, and depth is conveyed by the text label, not the color.

## Scope & implementation approach

### Homepage-only theming (the main wrinkle)

The homepage shares `Navigation`, `Footer`, `Button`, `Card` with every other
page, all currently styled cyan/purple. To keep the redesign scoped to the
homepage **without touching other pages**:

1. Introduce the abyssal tokens above as CSS custom properties under a
   `.theme-abyssal` scope, applied to a wrapper on the homepage (the homepage
   gets its own layout, e.g. `AbyssalLayout.astro`, or `AppLayout` accepts a
   `theme="abyssal"` prop).
2. Convert the shared components used on the homepage (`Navigation`, `Footer`,
   `Button`, `Card`) to read **semantic** tokens (`--accent`, `--bg`, `--ink`,
   `--hairline`) rather than hardcoded `from-cyan-500` / `text-cyan-400`.
3. Under `.theme-abyssal`, semantic tokens resolve to the abyssal palette.
   Under the default scope, they resolve to the existing cyan/purple values —
   so **every other page renders exactly as it does today.**

This is the disciplined way to honor "homepage only" while keeping the shared
shell coherent on the homepage. It is the single biggest implementation risk
and should be sequenced first in the plan.

### Files touched (expected)

- `src/pages/index.astro` — rewritten to the new composition.
- `src/styles/global.css` — add `.theme-abyssal` token scope.
- `src/components/ui/SpecimenCard.astro` — new Vessel rendering (the specimen
  card; replaces the deprecated `GameCard.astro`, which is removed).
- `src/components/ui/Navigation.astro`, `Footer.astro`, `Button.astro`,
  `Card.astro` — switched to semantic tokens (default values unchanged).
- New: `src/components/organisms/Organism.astro` — pure CSS/SVG shapes,
  data-driven organism taxonomy renderer.
- New: `src/lib/organisms.ts` — organism taxonomy types + per-game
  organism/depth assignment data + helpers.
- New: homepage-specific layout or `AppLayout` theme prop.
- `src/lib/games.ts` — extend the game record with `organism`
  (`{ shape, color }`) and `depth` (`'shallow' | 'mid' | 'abyssal'`) fields.

### Fonts

Add Fraunces + JetBrains Mono to the font `<link>` in the homepage layout (or
swap the global font link if adopted site-wide later). Inter is already loaded.

## Non-goals (out of scope)

- Other pages (game pages, dashboard, profile, leaderboard, auth) keep the
  current cyan/purple theme.
- No changes to game logic, scoring, achievements, or auth.
- No new imagery libraries or heavy assets — organisms are CSS/SVG.
- No search/filter, no personalization, no "recently played" row.
- No removal of the existing sci-fi Tailwind utilities (they remain for other
  pages and for the in-game overlays).

## Open / adjustable items

1. **Featured 5 in the hero vitrine** — proposed Reflex, Bejeweled, Snake,
   2048, Tetris (most accessible / best showcase of organism variety). Confirm
   or swap.
2. **Memory Matrix depth** — proposed Abyssal (hardest). Could be Mid-water.
3. **Organism → game mapping** — proposed above; cheap to retune since it is
   data.
4. **Abyssal tokens: scoped wrapper vs. global swap.** Spec recommends the
   scoped `.theme-abyssal` wrapper to protect other pages. Confirm.
