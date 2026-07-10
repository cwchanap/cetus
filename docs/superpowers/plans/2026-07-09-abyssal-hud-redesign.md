# Abyssal HUD Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlay a sci-fi game HUD onto the existing abyssal "deep-sea specimen catalog" homepage (and shared nav/footer shell), producing a balanced ~50/50 "museum meets arcade" treatment without discarding the current concept.

**Architecture:** Token-driven layering. All visual changes are scoped to the existing `.theme-abyssal` token system in `global.css` (so non-abyssal pages are byte-identical), plus small additive markup in `SpecimenCard.astro`, `index.astro`, `Navigation.astro`, and `Footer.astro`. No new dependencies, no JS frameworks, no game-data changes. A new third accent token `--cetus-accent-3` (electric magenta under abyssal, purple-500 under default) carries the HUD chrome.

**Tech Stack:** Astro 5 (SSR), Tailwind CSS 4 (`@theme inline` tokens), Vitest + `astro/container` (AstroContainer) for behavioral markup tests, CSS-source string assertions for token/animation tests.

**Spec:** `docs/superpowers/specs/2026-07-09-abyssal-hud-redesign-design.md`

## Global Constraints

- **Token discipline:** `:root` token values are parity-locked by `src/styles/global.test.ts` (`:root cetus token values match the exact Tailwind v4 colors they replace`). NEVER change a `:root` value that is in that parity list. All accent brightening happens under `.theme-abyssal` only.
- **`--cetus-accent-3` MUST be defined in `:root`, `@theme inline`, AND `.theme-abyssal`** (Navigation/Footer are shared across all pages; an undefined token on a default-theme page yields invisible chrome). Root value = `oklch(0.627 0.265 303.9)` (purple-500, collapses into the existing neon palette on non-abyssal pages — no regression). Abyssal value = `#ff3d8a` (electric magenta).
- **No `.theme-abyssal .nav-links` / `.theme-abyssal footer` / `.theme-abyssal .border-neon` / `.theme-abyssal .bg-glass` / `.theme-abyssal .bg-gradient-to-r` selectors in `global.css`** — forbidden by `src/styles/abyssal-shell.test.ts`. Nav/Footer chrome lives in each component's scoped `<style>` block or as Tailwind utility classes (which retint via tokens).
- **All new animation MUST be covered by the existing `@media (prefers-reduced-motion: reduce)` block** in `global.css` (add new selectors to that block — do not create a second one; `global.test.ts` asserts the first block contains `animation: none`, `transition: none`, `transform: none`).
- **Accessibility:** decorative chrome (brackets, power-bar segments, organisms) is `aria-hidden`. Semantic meaning stays in visible game name + depth text + the link's accessible name + the existing `aria-label="difficulty {level}"`. Difficulty is conveyed by BOTH filled-segment count AND a `DIFF·{n}` text label (color is never the sole indicator).
- **Package manager:** `bun`. Test runner: `bun run test:run`. Lint: `bun run lint`. Typecheck: `bun run astro check` (or `bun run lint` covers it — run `bun run test:run` after each task).
- **Test pattern:** this codebase uses behavioral tests via `experimental_AstroContainer` (render component → assert HTML substring) and `readFileSync` CSS-source assertions (read `global.css` → assert on source string). Follow these patterns exactly. Do NOT introduce jsdom DOM queries for these Astro components.
- **Commit style:** match repo (`feat:`, `fix:`, `refactor:`, `style:`, `test:` prefixes). One commit per task.

---

## File Structure

| File | Responsibility | Touched by |
|---|---|---|
| `src/styles/global.css` | Tokens (`--cetus-accent-3` in root/theme/abyssal), brighten abyssal accents, scanline overlay, all new keyframes + animated classes, wordmark glow, reduced-motion additions | Task 1 |
| `src/components/ui/SpecimenCard.astro` | HUD corner brackets, default vessel glow, difficulty power-bar (replaces dots), bracketed catalog tag, inactive `SOON` degradation | Task 2 |
| `src/components/ui/SpecimenCard.test.ts` | Update difficulty assertion (dots→bar), add chrome assertions | Task 2 |
| `src/pages/index.astro` | Hero kicker+cursor, wordmark glow class, scan-line, magenta particles, mobile featured carousel, score-strip catalog headers | Task 3, Task 4 |
| `src/pages/index-markup.test.ts` | Add hero-HUD + score-strip + carousel assertions | Task 3, Task 4 |
| `src/components/ui/Navigation.astro` | Logo corner brackets, sweeping nav underline, gradient hairline bottom edge (scoped styles) | Task 5 |
| `src/components/ui/Footer.astro` | Gradient top divider, mono system-status label (scoped styles) | Task 6 |

**Ordering rationale:** Task 1 (tokens/atmosphere) is the foundation every other task consumes. Task 2 (SpecimenCard) depends on Task 1's `--cetus-accent-3`. Tasks 3–4 (index.astro) depend on Tasks 1–2. Tasks 5–6 (shell) depend only on Task 1 and are independent of each other.

---

## Task 1: Tokens, accent-3, and atmosphere (global.css)

**Files:**
- Modify: `src/styles/global.css` (multiple regions)
- Test: `src/styles/global.test.ts` (extend), `src/styles/abyssal-shell.test.ts` (no regressions)

**Interfaces:**
- Consumes: nothing (foundation)
- Produces: `--cetus-accent-3` token (root=`oklch(0.627 0.265 303.9)`, abyssal=`#ff3d8a`), Tailwind utility `cetus-accent-3` (via `@theme inline`), global classes: `.cetus-scanlines`, `.cetus-grid-horizon`, `.cetus-wordmark--glow`, `.cetus-cursor`, `.cetus-scanline`, `.cetus-strip__line`, keyframes `cetus-grid-drift` / `cetus-blink` / `cetus-scan-sweep` / `cetus-divider-sweep`. Brightened abyssal `--cetus-accent` (`#22f5d0`) and `--cetus-accent-2` (`#ffc24a`).

- [ ] **Step 1: Write failing tests for the new token + accent brightening**

Append to the `describe('abyssal theme tokens (behavioral)')` block in `src/styles/global.test.ts`, inside the existing block (after the `defines every cetus token in the .theme-abyssal scope` test):

```typescript
    it('defines --cetus-accent-3 in :root (purple-500 default; shared shell safety)', () => {
        const val = tokenValue(rootBlock, 'cetus-accent-3')
        expect(val).toBe('oklch(0.627 0.265 303.9)')
    })

    it('overrides --cetus-accent-3 to electric magenta under .theme-abyssal', () => {
        const val = tokenValue(abyssalBlock, 'cetus-accent-3')
        expect(val).toBe('#ff3d8a')
    })

    it('brightens abyssal --cetus-accent and --cetus-accent-2', () => {
        expect(tokenValue(abyssalBlock, 'cetus-accent')).toBe('#22f5d0')
        expect(tokenValue(abyssalBlock, 'cetus-accent-2')).toBe('#ffc24a')
    })

    it('maps --cetus-accent-3 into the Tailwind @theme inline block', () => {
        expect(css).toContain(
            '--color-cetus-accent-3: var(--cetus-accent-3)'
        )
    })

    it('adds the scanline overlay under .theme-abyssal', () => {
        expect(css).toMatch(/\.theme-abyssal::after\s*\{/)
        expect(css).toContain('repeating-linear-gradient')
    })

    it('covers new HUD animations in the reduced-motion media query', () => {
        const mqIndex = css.indexOf(
            '@media (prefers-reduced-motion: reduce)'
        )
        const afterMq = css.slice(mqIndex)
        const blockMatch = afterMq.match(/\{([\s\S]*)\}/)
        const block = blockMatch ? blockMatch[1] : ''
        // New animated selectors must appear inside the reduced-motion block.
        expect(block).toMatch(/cetus-grid-horizon/)
        expect(block).toMatch(/cetus-cursor/)
        expect(block).toMatch(/cetus-strip__line/)
        expect(block).toMatch(/cetus-scanline/)
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run src/styles/global.test.ts`
Expected: FAIL — `--cetus-accent-3` is `null`, brightened values don't match, scanline/animation assertions not found.

- [ ] **Step 3: Add `--cetus-accent-3` to `:root` and `@theme inline`**

In `src/styles/global.css`, inside the `@theme inline { ... }` block, after the line `--color-cetus-accent-2: var(--cetus-accent-2);` (around line 43), add:

```css
  --color-cetus-accent-3: var(--cetus-accent-3);
```

Then inside the `:root { ... }` block, after the `--cetus-accent-2: oklch(0.627 0.265 303.9); /* purple-500 */` line (around line 87), add:

```css
  --cetus-accent-3: oklch(0.627 0.265 303.9); /* purple-500 default; abyssal swaps to magenta */
```

- [ ] **Step 4: Brighten abyssal accents and add `--cetus-accent-3` under `.theme-abyssal`**

In the `.theme-abyssal { ... }` block, replace the first two accent lines and add the third. The block currently starts:

```css
.theme-abyssal {
  --cetus-accent: #1fe3c0; /* teal */
  --cetus-accent-2: #f2b33d; /* amber */
```

Change to:

```css
.theme-abyssal {
  --cetus-accent: #22f5d0; /* brighter teal (HUD energy) */
  --cetus-accent-2: #ffc24a; /* brighter amber */
  --cetus-accent-3: #ff3d8a; /* electric magenta — HUD chrome/hover/sweeps */
```

- [ ] **Step 5: Add the scanline overlay**

In `src/styles/global.css`, immediately after the closing of the `.theme-abyssal .bg-sci-fi-dark` override block (after the line `}` that follows `.theme-abyssal .bg-sci-fi-dark { background: var(--cetus-page-bg); }`), add:

```css
/* ---------- HUD atmosphere (abyssal scanlines) ---------- */
.theme-abyssal::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    rgba(255, 255, 255, 0.04) 0 1px,
    transparent 1px 3px
  );
  z-index: 1; /* above bg paint, below main content (z-10) and nav (z-10001) */
}
```

- [ ] **Step 6: Add wordmark glow, grid horizon, and the new keyframes + classes**

Append the following block before the `/* ---------- Drift + reduced motion ---------- */` comment section:

```css
/* ---------- HUD chrome classes (abyssal) ---------- */

/* Wordmark glow: Fraunces italic keeps its museum form, gains a neon halo. */
.theme-abyssal .cetus-wordmark--glow {
  text-shadow:
    0 0 18px color-mix(in srgb, var(--cetus-accent) 45%, transparent),
    0 0 40px color-mix(in srgb, var(--cetus-accent) 25%, transparent),
    0 0 2px color-mix(in srgb, var(--cetus-accent-3) 35%, transparent);
}

/* Hero perspective grid horizon. */
.cetus-grid-horizon {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 60%;
  pointer-events: none;
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--cetus-accent) 8%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--cetus-accent) 8%, transparent) 1px, transparent 1px);
  background-size: 44px 44px;
  transform: perspective(420px) rotateX(62deg);
  transform-origin: center bottom;
  -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent 75%);
  mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent 75%);
  animation: cetus-grid-drift 18s linear infinite;
}
@keyframes cetus-grid-drift {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 0 44px;
  }
}

/* Blinking terminal cursor for the hero kicker. */
.cetus-cursor {
  display: inline-block;
  animation: cetus-blink 1.1s steps(2, start) infinite;
}
@keyframes cetus-blink {
  50% {
    opacity: 0;
  }
}

/* One-shot scan-line that sweeps the hero tagline on load. */
.cetus-scanline {
  display: block;
  height: 1px;
  margin: 14px auto 0;
  width: min(280px, 60%);
  background: linear-gradient(
    90deg,
    transparent,
    var(--cetus-accent),
    transparent
  );
  opacity: 0;
  animation: cetus-scan-sweep 2.4s ease-out 0.3s 1 forwards;
}
@keyframes cetus-scan-sweep {
  0% {
    opacity: 0;
    transform: scaleX(0.2);
  }
  30% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: scaleX(1);
  }
}

/* Score-strip divider with a traveling magenta sweep. */
.cetus-strip__line {
  flex: 1;
  height: 1px;
  min-width: 24px;
  position: relative;
  overflow: hidden;
  background: var(--cetus-hairline);
}
.cetus-strip__line::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    var(--cetus-accent-3),
    transparent
  );
  transform: translateX(-100%);
  animation: cetus-divider-sweep 6s ease-in-out infinite;
}
@keyframes cetus-divider-sweep {
  0% {
    transform: translateX(-100%);
  }
  55%,
  100% {
    transform: translateX(100%);
  }
}
```

- [ ] **Step 7: Extend the reduced-motion block to cover new animations**

Find the existing block (near the end of the file):

```css
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

Replace with (adds the new animated selectors; keeps all existing declarations so `global.test.ts` still passes):

```css
@media (prefers-reduced-motion: reduce) {
  .cetus-particle,
  .cetus-drift-host,
  .cetus-specimen,
  .cetus-grid-horizon,
  .cetus-cursor,
  .cetus-scanline,
  .cetus-strip__line,
  .cetus-strip__line::after {
    animation: none !important;
    transition: none !important;
  }
  .cetus-specimen:hover {
    transform: none !important;
  }
  .cetus-grid-horizon {
    transform: none !important;
  }
  .cetus-cursor {
    opacity: 1 !important;
  }
  .cetus-scanline {
    opacity: 0 !important;
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun run test:run src/styles/global.test.ts src/styles/abyssal-shell.test.ts`
Expected: PASS (all new token/atmosphere tests green; abyssal-shell regressions none — no forbidden selectors introduced).

- [ ] **Step 9: Commit**

```bash
git add src/styles/global.css src/styles/global.test.ts
git commit -m "feat(homepage): add accent-3 token, brighten abyssal accents, HUD atmosphere"
```

---

## Task 2: SpecimenCard HUD chrome

**Files:**
- Modify: `src/components/ui/SpecimenCard.astro` (markup + scoped `<style>`)
- Test: `src/components/ui/SpecimenCard.test.ts`

**Interfaces:**
- Consumes: `--cetus-accent`, `--cetus-accent-2`, `--cetus-accent-3`, `--cetus-hairline`, `--cetus-ink`, `--cetus-ink-muted` (Task 1)
- Produces: SpecimenCard now renders `hud-bracket` corner elements, a `power-bar` (5 segments) replacing `difficulty-dots`, a bracketed `[ N°·{n} ]` tag, and a `SOON` state for inactive games. The `<a data-testid="specimen-card">` anchor, its `aria-disabled`/`href` gating, and the `vessel__lid/neck/body` structure are unchanged.

- [ ] **Step 1: Update the difficulty test and add chrome assertions (failing first)**

In `src/components/ui/SpecimenCard.test.ts`, replace the test `renders catalog number, name, depth reading, and difficulty dots` (around line 67) with:

```typescript
    it('renders catalog number, name, depth reading, and a difficulty power-bar', async () => {
        const html = await container.renderToString(SpecimenCard, {
            props: { game: activeGame, catalogNumber: 3 },
        })
        expect(html).toContain('[ N°·03 ]')
        expect(html).toContain('Tetris Challenge')
        expect(html).toContain('power-bar')
        expect(html).toContain('aria-label="difficulty medium"')
        expect(html).toContain('DIFF·3')
    })

    it('renders four HUD corner brackets and the vessel body', async () => {
        const html = await container.renderToString(SpecimenCard, {
            props: { game: activeGame, catalogNumber: 1 },
        })
        expect(html).toContain('hud-bracket--tl')
        expect(html).toContain('hud-bracket--tr')
        expect(html).toContain('hud-bracket--bl')
        expect(html).toContain('hud-bracket--br')
    })

    it('renders SOON state (no DIFF label) for inactive games', async () => {
        const html = await container.renderToString(SpecimenCard, {
            props: { game: inactiveGame, catalogNumber: 14 },
        })
        expect(html).toContain('SOON')
        expect(html).not.toContain('DIFF·')
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run src/components/ui/SpecimenCard.test.ts`
Expected: FAIL — `power-bar`, `hud-bracket--*`, `[ N°·03 ]`, `SOON` not found.

- [ ] **Step 3: Add the difficulty-fill helper and update the meta + bracket markup**

In `src/components/ui/SpecimenCard.astro` frontmatter, after the `const n = ...` line, add the fill-count helper:

```typescript
const difficultyFill =
  game.difficulty === 'easy' ? 2 : game.difficulty === 'medium' ? 3 : 5
```

Then, inside the `<a ...>` anchor, immediately after the opening anchor tag (before `<div class="vessel__lid"></div>`), add the four corner brackets:

```astro
    <span class="hud-bracket hud-bracket--tl" aria-hidden="true"></span>
    <span class="hud-bracket hud-bracket--tr" aria-hidden="true"></span>
    <span class="hud-bracket hud-bracket--bl" aria-hidden="true"></span>
    <span class="hud-bracket hud-bracket--br" aria-hidden="true"></span>
```

Then replace the `<div class="vessel__no">N°·{n}</div>` line with the bracketed tag:

```astro
    <div class="vessel__no">[ N°·{n} ]</div>
```

Then replace the entire `<div class="difficulty-dots" ...>...</div>` block with the power-bar (active vs inactive):

```astro
    {
      available ? (
        <div
          class="power-bar"
          role="img"
          aria-label={`difficulty ${game.difficulty}`}
        >
          <span class:list={[{ on: difficultyFill >= 1 }]} />
          <span class:list={[{ on: difficultyFill >= 2 }]} />
          <span class:list={[{ on: difficultyFill >= 3 }]} />
          <span class:list={[{ on: difficultyFill >= 4 }]} />
          <span class:list={[{ on: difficultyFill >= 5 }]} />
          <span class="power-bar__label">DIFF·{difficultyFill}</span>
        </div>
      ) : (
        <div class="power-bar power-bar--soon" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span class="power-bar__label">SOON</span>
        </div>
      )
    }
```

- [ ] **Step 4: Replace the `.difficulty-dots` CSS with power-bar + bracket CSS, and add default glow**

In the scoped `<style>` block of `SpecimenCard.astro`:

(a) In the `.vessel__body { ... }` rule, bump the resting inner-gow from `8%` to `12%`. Find:

```css
    box-shadow: inset 0 0 30px
      color-mix(in srgb, var(--cetus-accent) 8%, transparent);
```

Replace with:

```css
    box-shadow: inset 0 0 30px
      color-mix(in srgb, var(--cetus-accent) 12%, transparent);
```

(b) In the `.vessel:hover .vessel__body { ... }` rule, add a magenta targeting ring. Find:

```css
  .vessel:hover .vessel__body {
    box-shadow:
      inset 0 0 34px color-mix(in srgb, var(--cetus-accent) 18%, transparent),
      0 0 24px color-mix(in srgb, var(--cetus-accent) 25%, transparent);
  }
```

Replace with:

```css
  .vessel:hover .vessel__body,
  .vessel:focus-visible .vessel__body {
    box-shadow:
      inset 0 0 34px color-mix(in srgb, var(--cetus-accent) 20%, transparent),
      0 0 0 1px var(--cetus-accent-3),
      0 0 24px color-mix(in srgb, var(--cetus-accent-3) 40%, transparent);
  }
```

(c) Replace the entire `.difficulty-dots { ... }` through `.difficulty-dots span.on { ... }` rules with the power-bar + bracket CSS. Find:

```css
  .difficulty-dots {
    display: flex;
    gap: 4px;
    justify-content: center;
    margin-top: 9px;
  }
  .difficulty-dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--cetus-ink) 20%, transparent);
  }
  .difficulty-dots span.on {
    background: var(--cetus-accent);
    box-shadow: 0 0 6px var(--cetus-accent);
  }
```

Replace with:

```css
  .power-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    margin-top: 9px;
  }
  .power-bar span {
    width: 9px;
    height: 5px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--cetus-ink) 14%, transparent);
  }
  .power-bar span.on {
    background: var(--cetus-accent-2);
    box-shadow: 0 0 6px color-mix(in srgb, var(--cetus-accent-2) 70%, transparent);
  }
  .power-bar__label {
    width: auto !important;
    height: auto !important;
    background: none !important;
    box-shadow: none !important;
    margin-left: 5px;
    font: 500 9px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.14em;
    color: var(--cetus-ink-muted);
  }
  .power-bar--soon .power-bar__label {
    color: var(--cetus-accent-3);
    opacity: 0.8;
  }

  /* HUD corner brackets (teal default → magenta on hover/focus). */
  .hud-bracket {
    position: absolute;
    width: 13px;
    height: 13px;
    border: 1.5px solid var(--cetus-accent);
    pointer-events: none;
    transition: border-color 0.2s ease;
  }
  .hud-bracket--tl {
    top: 7px;
    left: 7px;
    border-right: 0;
    border-bottom: 0;
  }
  .hud-bracket--tr {
    top: 7px;
    right: 7px;
    border-left: 0;
    border-bottom: 0;
  }
  .hud-bracket--bl {
    bottom: 7px;
    left: 7px;
    border-right: 0;
    border-top: 0;
  }
  .hud-bracket--br {
    bottom: 7px;
    right: 7px;
    border-left: 0;
    border-top: 0;
  }
  .vessel:hover .hud-bracket,
  .vessel:focus-visible .hud-bracket {
    border-color: var(--cetus-accent-3);
  }
```

(d) In the scoped reduced-motion block, also neutralize the bracket color transition. Find:

```css
  @media (prefers-reduced-motion: reduce) {
    .vessel:hover,
    .vessel:focus-visible {
      transform: none;
    }
  }
```

Replace with:

```css
  @media (prefers-reduced-motion: reduce) {
    .vessel:hover,
    .vessel:focus-visible {
      transform: none;
    }
    .hud-bracket {
      transition: none;
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test:run src/components/ui/SpecimenCard.test.ts`
Expected: PASS — power-bar, brackets, `[ N°·03 ]`, `SOON` all present; `aria-label="difficulty medium"` retained; inactive `aria-disabled`/`opacity-50`/`pointer-events-none` tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/SpecimenCard.astro src/components/ui/SpecimenCard.test.ts
git commit -m "feat(homepage): SpecimenCard HUD brackets, power-bar, default glow"
```

---

## Task 3: Hero HUD (kicker, wordmark glow, scan-line, particles, mobile carousel)

**Files:**
- Modify: `src/pages/index.astro` (hero `#hero-vitrine` section only, lines ~32–82)
- Test: `src/pages/index-markup.test.ts`

**Interfaces:**
- Consumes: global classes from Task 1 (`.cetus-wordmark--glow`, `.cetus-grid-horizon`, `.cetus-cursor`, `.cetus-scanline`); `SpecimenCard` from Task 2.
- Produces: hero renders `▸ CETUS · DEEP CATALOG_` kicker with a blinking cursor, a glowing wordmark, a one-shot scan-line, a grid-horizon backdrop, 3-color particles (accent/accent-2/accent-3), and a mobile horizontal-snap featured carousel.

- [ ] **Step 1: Write failing tests for the hero HUD**

Append to the `describe('homepage abyssal composition (behavioral)')` block in `src/pages/index-markup.test.ts`:

```typescript
    it('renders the HUD hero kicker with a blinking cursor', () => {
        expect(html).toContain('▸ CETUS · DEEP CATALOG')
        expect(html).toContain('cetus-cursor')
    })

    it('applies the wordmark glow class to the hero heading', () => {
        expect(html).toContain('cetus-wordmark--glow')
    })

    it('renders the hero scan-line and grid horizon', () => {
        expect(html).toContain('cetus-scanline')
        expect(html).toContain('cetus-grid-horizon')
    })

    it('uses the third accent token for some hero particles', () => {
        expect(html).toContain('var(--cetus-accent-3)')
    })

    it('renders the featured vitrine as a mobile snap-scroll carousel', () => {
        // Mobile: flex overflow-x-auto snap; sm+: grid. The featured list must
        // carry the carousel classes and snap-center children.
        expect(html).toContain('featured-vitrine')
        expect(html).toContain('snap-x')
        expect(html).toContain('snap-center')
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run src/pages/index-markup.test.ts`
Expected: FAIL — kicker/cursor/glow/scanline/grid/carousel strings not present.

- [ ] **Step 3: Add the grid horizon + scan-line elements and update the kicker, wordmark, particles, and featured list**

In `src/pages/index.astro`, inside the `<!-- HERO VITRINE -->` section:

(a) Inside the `.cetus-drift-host` particle map, change the particle background token to cycle three colors. Find:

```astro
            style={`left:${10 + i * 11}%; top:${15 + ((i * 37) % 70)}%; width:3px; height:3px; background:var(--cetus-accent${i % 2 ? '' : '-2'}); animation-delay:${i * 0.8}s;`}
```

Replace with:

```astro
            style={`left:${10 + i * 11}%; top:${15 + ((i * 37) % 70)}%; width:3px; height:3px; background:var(--cetus-accent${['', '-2', '-3'][i % 3]}); animation-delay:${i * 0.8}s;`}
```

(b) Immediately after the closing `</div>` of `.cetus-drift-host`, add the grid horizon:

```astro
    <div class="cetus-grid-horizon" aria-hidden="true"></div>
```

(c) Update the kicker paragraph to add the `▸` prefix and blinking cursor. Find:

```astro
      <p class="font-mono text-xs tracking-[0.34em] text-cetus-accent">
        CETUS · DEEP CATALOG
      </p>
```

Replace with:

```astro
      <p class="font-mono text-xs tracking-[0.34em] text-cetus-accent">
        ▸ CETUS · DEEP CATALOG<span class="cetus-cursor" aria-hidden="true">_</span>
      </p>
```

(d) Add the wordmark glow class to the hero heading. Find:

```astro
      <h2 class="cetus-wordmark mt-5 text-6xl md:text-8xl leading-[0.95]">
        Cetus
      </h2>
```

Replace with:

```astro
      <h2 class="cetus-wordmark cetus-wordmark--glow mt-5 text-6xl md:text-8xl leading-[0.95]">
        Cetus
      </h2>
```

(e) Add the scan-line immediately after the tagline paragraph (after the `<p class="mx-auto mt-6 max-w-xl ...">...</p>` closing tag), before the `<nav aria-label="Featured games">`:

```astro
      <span class="cetus-scanline" aria-hidden="true"></span>
```

(f) Convert the featured list to a mobile carousel. Find the featured `<ul>`:

```astro
        <ul class="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {
            featured.map(g => (
              <li>
                <SpecimenCard
                  game={g}
                  catalogNumber={catalogIndex.get(g.id) ?? 0}
                />
              </li>
            ))
          }
        </ul>
```

Replace with:

```astro
        <ul class="featured-vitrine flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:pb-0 lg:grid-cols-5">
          {
            featured.map(g => (
              <li class="min-w-[78%] snap-center sm:min-w-0">
                <SpecimenCard
                  game={g}
                  catalogNumber={catalogIndex.get(g.id) ?? 0}
                />
              </li>
            ))
          }
        </ul>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:run src/pages/index-markup.test.ts`
Expected: PASS — all hero HUD assertions green; existing assertions (theme-abyssal, wordmark `text-6xl`, single h1, `#games` anchor, no hardcoded hex in particles, depth zones) still green.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro src/pages/index-markup.test.ts
git commit -m "feat(homepage): HUD hero kicker, glowing wordmark, scan-line, mobile carousel"
```

---

## Task 4: Catalog score-strip headers

**Files:**
- Modify: `src/pages/index.astro` (the `#catalog` zone header, lines ~95–105)
- Test: `src/pages/index-markup.test.ts`

**Interfaces:**
- Consumes: `.cetus-strip__line` class + `cetus-divider-sweep` keyframe (Task 1); `text-cetus-accent-2` Tailwind utility (Task 1 `@theme inline` mapping).
- Produces: each depth-zone header is a mission-briefing strip: `▸ {LABEL}` (teal mono), `· {reading}` (amber mono), a neon hairline with a magenta sweep, then the note.

- [ ] **Step 1: Write failing tests for the score-strip**

Append to the `describe(...)` block in `src/pages/index-markup.test.ts`:

```typescript
    it('renders catalog depth zones as score-strips with sweep dividers', () => {
        expect(html).toContain('cetus-strip__line')
        // Each zone header keeps its label text as an h2 heading.
        expect(html).toContain('▸ SHALLOW')
        expect(html).toContain('▸ ABYSSAL')
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:run src/pages/index-markup.test.ts`
Expected: FAIL — `cetus-strip__line` and `▸ SHALLOW` not present.

- [ ] **Step 3: Replace the zone header markup with the score-strip**

In `src/pages/index.astro`, inside the `zones.map(...)` block, find the header:

```astro
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
```

Replace with:

```astro
              <header class="cetus-strip mb-6 flex items-center gap-3 pb-3">
                <h2 class="font-mono text-xs font-medium tracking-[0.18em] text-cetus-accent">
                  ▸ {meta.label.toUpperCase()}
                </h2>
                <span class="font-mono text-xs text-cetus-accent-2">
                  · {meta.reading}
                </span>
                <span class="cetus-strip__line" aria-hidden="true"></span>
                <span class="ml-auto hidden font-mono text-xs text-cetus-ink-muted sm:block">
                  {meta.note}
                </span>
              </header>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:run src/pages/index-markup.test.ts`
Expected: PASS — `cetus-strip__line`, `▸ SHALLOW`, `▸ ABYSSAL` present; the three-depth-zone test (which asserts `SHALLOW`/`MID`/`ABYSSAL` as substrings) still green.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro src/pages/index-markup.test.ts
git commit -m "feat(homepage): mission score-strip headers with sweep dividers"
```

---

## Task 5: Navigation HUD chrome

**Files:**
- Modify: `src/components/ui/Navigation.astro` (scoped `<style>` + small markup/classes)
- Test: none new required (visual chrome), but verify `src/components/ui/shell-tokens.test.ts` and `src/styles/abyssal-shell.test.ts` stay green.

**Interfaces:**
- Consumes: `--cetus-accent`, `--cetus-accent-3`, `--cetus-hairline` (Task 1).
- Constraint: NO `.theme-abyssal .nav-links` selector anywhere. Chrome lives in Navigation's scoped `<style>` (generates hashed `.astro-xxxx` selectors) so it applies on all pages and retints via tokens.

- [ ] **Step 1: Add the gradient hairline edge and sweeping underline via scoped styles + classes**

In `src/components/ui/Navigation.astro`, add a `<style>` block at the end of the file (after the closing `</header>` / `</nav>`), and add `nav-underline` link wrapper classes. Concretely:

(a) Wrap each nav link's classes. Find:

```astro
          <a
            href={item.href}
            class="text-cetus-ink-muted hover:text-cetus-accent transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
          >
            {item.label}
          </a>
```

Replace with (adds the `nav-underline` class for the sweep):

```astro
          <a
            href={item.href}
            class="nav-underline text-cetus-ink-muted hover:text-cetus-accent transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
          >
            {item.label}
          </a>
```

(b) Add the bottom hairline to the header by appending a `cetus-nav-edge` class to the header. Find:

```astro
<header class={classes} {...props}>
```

The `classes` variable already includes `relative z-[10001] px-6 py-8`. Instead of editing the `cn(...)` call, append the edge as a dedicated element right after the closing `</nav>` and before `</header>`:

```astro
    <span class="cetus-nav-edge" aria-hidden="true"></span>
  </nav>
</header>

<style>
  /* Gradient hairline along the bottom of the header (teal → magenta). */
  .cetus-nav-edge {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--cetus-accent),
      var(--cetus-accent-3),
      transparent
    );
    opacity: 0.5;
  }

  /* Sweeping underline on nav links. */
  .nav-underline {
    position: relative;
  }
  .nav-underline::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: -4px;
    height: 1px;
    width: 100%;
    background: var(--cetus-accent-3);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.25s ease;
  }
  .nav-underline:hover::after,
  .nav-underline:focus-visible::after {
    transform: scaleX(1);
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-underline::after {
      transition: none;
    }
  }
</style>
```

Note: the existing `<header class={classes} {...props}>` line already wraps the nav + a closing `</header>`. The implementer should place the `.cetus-nav-edge` span as the last child inside `<nav>` (or just inside `</nav>`), keeping the existing structure intact. The exact insertion point: directly before the existing `</nav>` closing tag. (The logo-tile brackets in the next step go on the logo `<div>`.)

(c) Add corner brackets to the logo tile. Find the logo tile div:

```astro
      <div
        class="w-10 h-10 bg-gradient-to-r from-cetus-accent to-cetus-accent-2 rounded-lg flex items-center justify-center shadow-lg shadow-cetus-accent/25"
      >
```

Append a `nav-logo` class to it (so the scoped brackets attach), and add four bracket spans inside:

```astro
      <div
        class="nav-logo w-10 h-10 bg-gradient-to-r from-cetus-accent to-cetus-accent-2 rounded-lg flex items-center justify-center shadow-lg shadow-cetus-accent/25"
      >
        <span class="nav-bracket nav-bracket--tl" aria-hidden="true"></span>
        <span class="nav-bracket nav-bracket--tr" aria-hidden="true"></span>
        <span class="nav-bracket nav-bracket--bl" aria-hidden="true"></span>
        <span class="nav-bracket nav-bracket--br" aria-hidden="true"></span>
        <span class="text-xl font-bold text-white">{logo}</span>
      </div>
```

And add to the same scoped `<style>` block (before the reduced-motion rule):

```css
  /* Logo tile corner brackets. */
  .nav-logo {
    position: relative;
  }
  .nav-bracket {
    position: absolute;
    width: 7px;
    height: 7px;
    border: 1.5px solid var(--cetus-accent);
    pointer-events: none;
  }
  .nav-bracket--tl {
    top: -3px;
    left: -3px;
    border-right: 0;
    border-bottom: 0;
  }
  .nav-bracket--tr {
    top: -3px;
    right: -3px;
    border-left: 0;
    border-bottom: 0;
  }
  .nav-bracket--bl {
    bottom: -3px;
    left: -3px;
    border-right: 0;
    border-top: 0;
  }
  .nav-bracket--br {
    bottom: -3px;
    right: -3px;
    border-left: 0;
    border-top: 0;
  }
```

- [ ] **Step 2: Run shell tests to confirm no regressions**

Run: `bun run test:run src/components/ui/shell-tokens.test.ts src/styles/abyssal-shell.test.ts`
Expected: PASS — `Navigation logo + links use cetus tokens` still green (`from-cetus-accent`, `to-cetus-accent-2`, `shadow-cetus-accent/25`, `text-cetus-ink-muted`, no `from-cyan-400`); the abyssal-shell "does NOT override ... .nav-links" assertion still green (scoped styles are hashed, not `.theme-abyssal .nav-links`).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Navigation.astro
git commit -m "feat(shell): Navigation HUD brackets, sweeping underline, gradient edge"
```

---

## Task 6: Footer HUD chrome

**Files:**
- Modify: `src/components/ui/Footer.astro` (scoped `<style>` + markup)
- Test: verify `src/components/ui/shell-tokens.test.ts` and `src/styles/abyssal-shell.test.ts` stay green.

**Interfaces:**
- Consumes: `--cetus-accent`, `--cetus-accent-3`, `--cetus-hairline`, `--cetus-footer-ink` (Task 1).
- Constraint: keep `border-cetus-hairline` and `text-cetus-footer-ink` tokens present (asserted by tests). The gradient divider is ADDITIVE, not a replacement of the token border.

- [ ] **Step 1: Add the gradient top divider and a mono system-status label**

In `src/components/ui/Footer.astro`:

(a) Add a `system` line above the copyright and a gradient divider element. Replace the `<footer>...</footer>` inner content. The current footer body is:

```astro
<footer class={classes} {...props}>
  <div class="max-w-7xl mx-auto text-center">
    <p class="text-cetus-footer-ink">
      {copyright}
    </p>
  </div>
</footer>
```

Replace with:

```astro
<footer class={classes} {...props}>
  <span class="cetus-footer-edge" aria-hidden="true"></span>
  <div class="max-w-7xl mx-auto text-center">
    <p class="font-mono text-[10px] tracking-[0.28em] uppercase text-cetus-footer-ink">
      SYSTEM · CETUS NODE · v1.0
    </p>
    <p class="text-cetus-footer-ink mt-1">
      {copyright}
    </p>
  </div>
</footer>

<style>
  /* Gradient top divider (teal → magenta), mirroring the nav edge. */
  .cetus-footer-edge {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--cetus-accent),
      var(--cetus-accent-3),
      transparent
    );
    opacity: 0.5;
  }
</style>
```

The footer `classes` still includes `border-t border-cetus-hairline` (unchanged) and `text-cetus-footer-ink` is still present on the paragraphs, so both token assertions stay green. The footer must be `position: relative` for the absolute edge — the existing `relative` class in `classes` (`relative z-10 px-6 py-8 border-t ...`) already provides it.

- [ ] **Step 2: Run shell tests to confirm no regressions**

Run: `bun run test:run src/components/ui/shell-tokens.test.ts src/styles/abyssal-shell.test.ts`
Expected: PASS — `Footer uses cetus hairline + footer-ink` still green; abyssal-shell footer token assertions green.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Footer.astro
git commit -m "feat(shell): Footer gradient divider and mono system-status label"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire unit test suite**

Run: `bun run test:run`
Expected: PASS — all suites green, including `global.test.ts`, `abyssal-shell.test.ts`, `shell-tokens.test.ts`, `SpecimenCard.test.ts`, `index-markup.test.ts`, `AppLayout.test.ts`.

- [ ] **Step 2: Lint and typecheck**

Run: `bun run lint && bun run astro check`
Expected: no errors. (If `astro check` is not wired, `bun run lint` covers ESLint + Prettier; confirm with the user only if it errors.)

- [ ] **Step 3: Manual visual verification (run dev server)**

Run: `bun run web:dev` (and `bun run db:dev` if auth-dependent pages are checked), open `http://localhost:4325`, and confirm:
- Hero: kicker has `▸` + blinking `_`; "Cetus" wordmark has a teal/magenta glow; a scan-line sweeps once; a faint perspective grid sits behind the hero; particles include magenta ones.
- Featured cards on mobile (<640px): horizontal snap-scroll carousel; on desktop: 5-col grid. Each card has 4 corner brackets (teal → magenta on hover), vessel glows by default, difficulty shows a segmented amber bar + `DIFF·n`.
- Catalog: each depth-zone header is a score-strip (`▸ LABEL · reading` + a line with a slow magenta sweep).
- Nav: logo tile has corner brackets; links have a sweeping underline; a faint gradient hairline runs under the header.
- Footer: gradient top divider; `SYSTEM · CETUS NODE · v1.0` mono label.
- Global: subtle scanline texture; reduced-motion (OS setting) disables all animation.
- Non-abyssal pages (e.g. `/login`): no scanlines; nav/footer chrome renders in purple (default accent-3), no layout breakage.

- [ ] **Step 4: Run the homepage e2e test**

Run: `bun run test:e2e -- e2e/homepage.spec.ts`
Expected: PASS — heading `Cetus`, `SHALLOW`, `ABYSSAL` still resolve (substring accessible-name match); single h1; wordmark font-size > 30px.

- [ ] **Step 5: Commit any test-fix churn (if e2e selectors needed updates)**

If an e2e/unit selector broke (e.g. an exact-text match on the old kicker), update the assertion to a substring match and commit:

```bash
git add e2e/ src/
git commit -m "test: update selectors for abyssal HUD homepage"
```

---

## Self-Review Notes

**Spec coverage:** Every section of the spec maps to a task — tokens/atmosphere (T1), SpecimenCard chrome incl. inactive `SOON` (T2), hero incl. mobile carousel (T3), score-strips (T4), Navigation (T5), Footer (T6), a11y via `aria-hidden` + dual difficulty encoding (T2) + reduced-motion (T1). Verified no spec requirement is un-tasked.

**Test-constraint compliance:** `:root` parity guard untouched (accent-3 is new, not in the parity list); no forbidden `.theme-abyssal .nav-links`/`footer`/`border-neon`/`bg-glass`/`bg-gradient-to-r` selectors (nav/footer chrome is component-scoped); reduced-motion global block covers every new animated class; `data-testid="specimen-card"` anchor + `aria-disabled`/`href` gating unchanged.

**Type/name consistency:** `difficultyFill` (T2) used consistently; power-bar class `power-bar`/`power-bar__label`/`power-bar--soon` consistent across markup + CSS + tests; `hud-bracket--tl/tr/bl/br` and `nav-bracket--*` consistent; `--cetus-accent-3` value `#ff3d8a` matches the existing `Organism.astro` magenta.
