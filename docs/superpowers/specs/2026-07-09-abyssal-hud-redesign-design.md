# Cetus Homepage — Abyssal HUD Redesign Spec

- **Date:** 2026-07-09
- **Status:** Approved design, ready for implementation planning
- **Scope:** Homepage (`src/pages/index.astro` + components it renders) **and the shared shell** (`Navigation.astro`, `Footer.astro`)
- **Predecessor:** `2026-07-06-homepage-abyssal-redesign-design.md` (the current "abyssal museum" treatment this builds on)

## Overview

The current homepage (shipped 2026-07-06) owns a distinctive "deep-sea specimen
catalog" identity — glass vessels, bioluminescent organisms, depth zones, Fraunces
italic wordmark. It is tasteful and ownable, but it reads as a quiet **museum**,
not a **gaming hub**. It lacks the energy a visitor expects from a sci-fi
minigames site.

This redesign does **not** replace the abyssal concept. Instead it overlays a
sci-fi **game HUD** onto it: **museum meets arcade**, at a balanced ~50/50 split.
The specimen jars, organisms, depth zones, Fraunces wordmark, dark abyss bg, and
"no login — play in one click" positioning all stay. What is added is a third
neon accent, HUD corner brackets, default vessel glow, scanline + grid-horizon
atmosphere, score-strip section headers, and an expanded mono label system.

The result keeps Cetus ownable (no other minigames site looks like a deep-sea
HUD) while delivering the gaming energy the product promises.

## Design decisions (locked during brainstorm)

| Axis | Decision |
|---|---|
| Direction | **Museum-meets-arcade hybrid** — keep concept, inject energy (NOT a revert to generic neon, NOT a full rebuild) |
| Intensity | **Balanced ~50/50** — glow by default, HUD framing, animated strips, scanlines/grid, neon dividers |
| Palette | **Bioluminescent neon** — brighter teal + amber, plus a new third magenta accent for HUD chrome |
| Scope | Homepage content **+ shared Navigation and Footer shell** |

## What stays vs. what's added

**Stays (the abyssal foundation):**
- Specimen-jar metaphor (`SpecimenCard` vessel + lid/neck/body)
- Organism shapes (`orb`, `chain`, `spiral`, `frond`, `cluster`, `lattice`) and their colors
- Depth-zone catalog concept (Shallow / Mid-water / Abyssal)
- Fraunces italic wordmark, Inter body, JetBrains Mono labels
- Dark abyss page background `#04060a`
- "No login — play in one click" value-strip positioning

**Added (the HUD overlay):**
- Third accent token `--cetus-accent-3` (electric magenta)
- Brightened primary/secondary tokens
- Full-page scanline overlay + hero grid-horizon backdrop
- HUD corner brackets on every specimen panel
- Vessel glow **by default** (not only on hover) + magenta targeting ring on hover
- Difficulty rendered as a segmented "power bar" instead of dots
- Bracketed mono catalog tags `[ N°·01 ]`
- Hero kicker with blinking terminal cursor + scan-line sweep
- Score-strip (mission-briefing) depth-zone headers with neon sweep dividers
- Navigation: bracketed logo tile, sweeping underlines, gradient hairline edge
- Footer: gradient top divider, mono "system status" labels

## Design tokens

### Palette changes (`.theme-abyssal` scope in `global.css`)

| Token | Current value | New value | Role |
|---|---|---|---|
| `--cetus-accent` | `#1fe3c0` teal | `#22f5d0` (brighter teal) | Primary chrome, vessel glow, links |
| `--cetus-accent-2` | `#f2b33d` amber | `#ffc24a` (brighter amber) | Catalog numbers, depth readings, power-bar fill |
| `--cetus-accent-3` (**NEW**) | — | `#ff3d8a` electric magenta | HUD brackets, hover rings, arcade accents, sweeps |

Notes:
- `--cetus-accent-3` value `#ff3d8a` matches the existing `Organism.astro` `data-color='magenta'` (`#ff3d8a`), so it is already a first-class color in the system — not a new invention.
- Page bg `#04060a`, surface `#06090f`, ink `#eaf6ff`, ink-muted `#8a98a6`, hairline `rgba(234,246,255,0.10)` are all **unchanged**.
- Default (non-abyssal) pages are untouched — all changes live under `.theme-abyssal`.

### Color discipline

Magenta (`--cetus-accent-3`) is **reserved chrome only**. It never appears on
backgrounds, the wordmark, or body text. It appears only on: HUD corner brackets
(hover state), vessel targeting rings (hover), score-strip sweep animations,
nav active underlines, and the footer/nav gradient hairlines. This keeps it
"special" so the page doesn't drift toward generic neon.

## Component-by-component design

### 1. Atmosphere layer (global, `.theme-abyssal`)

- **Scanline overlay**: `body::after` (or a dedicated host element scoped to
  abyssal), `position: fixed; inset: 0; pointer-events: none;`
  `background: repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px);`
  `mix-blend-mode: overlay; z-index` below content. Disabled under
  `prefers-reduced-motion` (static, lower opacity).
- **Grid horizon** (hero `#hero-vitrine` only): a faint perspective floor-grid
  behind the wordmark, built from two CSS linear-gradients (vertical + horizontal
  hairlines) on a pseudo-element, skewed with `transform: perspective(...)`.
  Slow drift animation (translateX loop, ~20s). Reduced-motion: static.
- **Bioluminescent particles**: keep the existing 8 drifting particles but
  brighten via the new tokens; add 3–4 magenta particles interleaved among the
  teal/amber ones (vary `--cetus-accent` / `-2` / `-3`).

### 2. SpecimenCard → "Specimen Panel" (the centerpiece)

Markup is **additive** — the existing `<a data-testid="specimen-card">` anchor
and its lid/neck/body/organism structure stay. Added chrome:

- **HUD corner brackets**: 4 L-shaped brackets at the card corners. Implemented
  via `::before` / `::after` on a wrapper plus per-corner background-mask, or 4
  small `<i>` elements. Teal (`--cetus-accent`) by default; **magenta**
  (`--cetus-accent-3`) on hover/focus. ~12px legs, 1.5px stroke.
- **Default glow**: `.vessel__body` carries an inner teal glow at rest
  (`box-shadow: inset 0 0 30px color-mix(... accent 10% ...)`) so vessels read
  as "powered on," not dormant. Hover **intensifies** teal and adds a magenta
  outer targeting ring (`0 0 0 1px accent-3, 0 0 24px accent-3/40%`).
- **Difficulty power bar**: replace the 3 difficulty dots with a 5-segment bar
  (easy = 2 segs filled, medium = 3, hard = 5). Amber fill, unfilled segments
  dimmed. Followed by a mono `DIFF·{n}` label. Keeps `role="img"` +
  `aria-label="difficulty {level}"` for a11y.
- **Bracketed catalog tag**: `N°·01` restyled to `[ N°·01 ]` (mono, amber),
  terminal feel.

Accessibility: brackets and the power bar are decorative (`aria-hidden`); the
existing `aria-label` on the difficulty meter carries the semantic meaning.

**Inactive / coming-soon degradation:** the card already gates on
`available = game.isActive` (`!available` → `opacity-50 pointer-events-none`,
no `href`). The HUD chrome must degrade with it: brackets dim to ink-faint, the
default glow is suppressed, and the power bar renders unfilled with a
`SOON` mono tag in place of `DIFF·{n}`. (Note: all 14 games are currently
`isActive: true`, so this path is dormant — but it must not render a "powered-on"
panel for a game that cannot be played.)

### 3. Hero (`#hero-vitrine`)

- **Kicker**: `▸ CETUS · DEEP CATALOG_` — mono, teal, with a blinking underscore
  cursor (`_`) via a CSS blink animation. Reduced-motion: static underscore.
- **Wordmark** "Cetus": keep Fraunces italic 300 (museum anchor) but add a
  layered `text-shadow` glow — soft teal bloom + faint magenta edge. This is the
  single biggest "museum meets arcade" signal: serif type, neon halo.
- **Scan line**: a 1px hairline that sweeps top→bottom across the tagline once on
  page load (CSS keyframe, `forwards`, one-shot). Reduced-motion: omitted.
- **Featured cards**: identical Specimen Panel treatment.

**Mobile featured vitrine:** the current grid is `grid-cols-1 … sm:grid-cols-3
lg:grid-cols-5` (`index.astro`), which stacks all 5 featured cards into one tall
column below 640px — fine for the quiet museum cards, but the heavier HUD panels
would make the hero oppressively tall and fight the "get into a game fast" goal.
On mobile (`<640px`) the featured vitrine becomes a **horizontal scroll strip**:
`flex overflow-x-auto snap-x` with each panel `min-w-[80%] snap-center`, peeking
the next card's bracket frame at the right edge — an arcade carousel. A
`-webkit-scrollbar` hide keeps it clean. `sm:` and up keep the existing grid.
Reduced-motion: no change (scroll is user-driven, not animated).

### 4. Catalog → "Mission depth strips" (`#catalog`)

Each depth-zone header (currently a flex row with label + reading + note) becomes
a mission-briefing strip:

```
▸ SHALLOW · 0–200m ━━━━━━━━━━━━━━━━━━━ Quick reactions. Pick up and play.
```

- **Label**: bracketed teal mono (`▸ SHALLOW`).
- **Reading**: amber mono (`· 0–200m`).
- **Divider**: a neon hairline (flex-1) with a slow magenta **sweep** — a small
  bright segment traveling left→right along the line (~6s loop). Reduced-motion:
  solid hairline, no sweep.
- **Note**: muted ink, right-aligned (unchanged content).

### 5. Navigation (`Navigation.astro`, shared shell)

Token-driven components retint automatically; explicit additions:

- **Logo tile**: corner-bracket frame (teal), matching the specimen panels.
- **Nav links**: a thin teal underline that **sweeps** in on hover; magenta on
  the active/current page.
- **Header bottom edge**: a neon hairline (teal→magenta gradient) spanning the
  header width.
- **Wordmark**: token-driven (`.cetus-wordmark`), picks up the glow via the
  hero wordmark treatment if reused; otherwise keep current token glow.

### 6. Footer (`Footer.astro`, shared shell)

- **Top divider**: teal→magenta gradient hairline (mirror of the nav edge).
- **Labels**: restyle small footer labels to mono "system status" tone
  (e.g. `SYSTEM · v1.0`, uppercase, tracked) — tasteful, not gimmicky. Existing
  links and content unchanged.

## Typography (unchanged families, expanded mono role)

| Role | Family | Change |
|---|---|---|
| Display (wordmark) | Fraunces | Unchanged; **+glow** |
| Body | Inter | Unchanged |
| Data / HUD chrome | JetBrains Mono | **Promoted** — now carries all brackets, readings, status bars, kickers, footer system labels |

No new font requests. The abyssal font payload already loads Fraunces + Inter +
JetBrains Mono.

## Motion & accessibility

- All added animation (scanlines drift, grid horizon, particle drift, blink
  cursor, scan-line sweep, divider sweep, underline sweep) is **disabled under
  `prefers-reduced-motion: reduce`**. Existing `@media (prefers-reduced-motion)`
  block in `global.css` is extended to cover new keyframes.
- Scanline overlay opacity is low (~3%) so it never harms text contrast; WCAG AA
  body-text contrast (≥4.5:1) is preserved — `--cetus-ink #eaf6ff` on `#04060a`
  is far above threshold.
- HUD brackets, the power bar, and the organism shapes are all decorative
  (`aria-hidden`, already set on `Organism.astro`). There are only 6 reusable
  shapes across 14 games, so organisms are **never** an accessible identifier —
  semantic meaning comes solely from the visible game name + depth text and the
  link's accessible name.
- Semantic info stays in the existing `aria-label`s and link text.
- Touch targets unchanged (cards and nav links already meet ≥44px via existing
  `min-h-[24px] py-1` patterns on links).
- Color is never the sole indicator: difficulty is shown by both filled-segment
  count **and** the `DIFF·{n}` text label.

## Files affected

| File | Change |
|---|---|
| `src/styles/global.css` | Brighten 2 tokens, add `--cetus-accent-3`, scanline overlay, grid-horizon keyframes, blink + sweep keyframes, reduced-motion coverage, vessel default-glow override under abyssal |
| `src/components/ui/SpecimenCard.astro` | Additive HUD markup (corner brackets, power bar, bracketed tag) + scoped styles; anchor + `data-testid` unchanged |
| `src/pages/index.astro` | Hero kicker + cursor, scan-line, wordmark glow class, score-strip header markup, magenta particles |
| `src/components/ui/Navigation.astro` | Logo corner brackets, sweeping underline, gradient hairline edge |
| `src/components/ui/Footer.astro` | Gradient top divider, mono system-status labels |

## Test impact

- `data-testid="specimen-card"` anchor and its core structure are unchanged →
  behavioral tests querying by test-id / role stay green.
- Any test asserting the **3 difficulty dots** DOM specifically will need
  updating to the segmented power bar (same `role="img"` +
  `aria-label="difficulty {level}"`, so role/label-based assertions are safe).
- E2E tests scoped to the homepage nav/footer may need updated text/structure
  selectors if they assert the old kicker text exactly (`CETUS · DEEP CATALOG`
  → `▸ CETUS · DEEP CATALOG_`). Will verify against the test suite during
  implementation.
- Non-abyssal (default theme) pages: zero regressions by design — all token and
  component changes are scoped to `.theme-abyssal`.

## Non-goals (out of scope)

- Reverting to or reintroducing the default neon-cyberpunk theme on the homepage.
- Changing the game data model, organism shapes, or depth-zone assignments.
- Redesigning game pages, profile, leaderboard, or auth pages.
- New fonts, new JS frameworks, or build-config changes.
- Performance-affecting heavy animation (everything is lightweight CSS).
