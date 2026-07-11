# Abyssal HUD App-Wide Redesign

**Date:** 2026-07-10
**Status:** Approved
**Predecessor:** `2026-07-09-abyssal-hud-redesign-design.md` (homepage redesign)

## Problem

The homepage was redesigned with an "Abyssal HUD" aesthetic (museum-meets-arcade: Fraunces + JetBrains Mono fonts, neon teal/amber/magenta accents, HUD brackets, scanlines, dark abyssal background). All 22 other pages still use the legacy Orbitron / animated-blob / cyan-purple aesthetic. The app feels inconsistent — users step from a polished HUD homepage into a dated sci-fi shell.

## Decision

Extend the Abyssal HUD to the entire app. Make `theme="abyssal"` the default in `AppLayout`, retint all shared components to `cetus-*` tokens, refactor the 14 game pages to use existing wrapper components, and apply full HUD treatment (kickers, brackets, score-strip dividers, mono readouts) to every page.

## Scope

**In scope:**
- L1: AppLayout shell (abyssal default, remove legacy backgrounds)
- L2: 9 shared UI components (Heading, Card, Badge, Avatar, Select, Toggle, Slider, Pagination, Button)
- L3: 6 game wrapper components + 14 game page refactors
- L4: 8 app pages (auth, dashboard, profile x2, leaderboard, achievements, settings, challenges)
- L5: 5 global overlays/modals (LoginRewardModal, AchievementAward, ChallengeComplete, UserDropdown, DailyMissionsPanel)

**Out of scope:**
- Game canvas internals (PixiJS/DOM game logic — only outer chrome changes)
- `main.astro` layout (bare shell, unused by surveyed pages)
- `tailwind.config.js` legacy plugin (stays for backward compat; pages just stop using legacy classes)
- The homepage itself (already redesigned in the predecessor spec)
- `organisms/Organism.astro` (already abyssal-native)
- `FeatureCard.astro`, `Tabs.astro`, `TabsTrigger.astro`, `TabsContent.astro` (dead code — 0 page usages found)
- `Section.astro` `cta`/`features` gradient variants (0 page usages found)

## Execution Strategy: Layer-by-Layer (Foundation-First)

Each layer unblocks the next. Verification checkpoint (Vitest + Playwright + browser sanity) after each layer.

---

## L1: AppLayout Shell

### `AppLayout.astro`

1. Change `theme` prop default from `'default'` to `'abyssal'`.
2. Swap font `<link>`: Fraunces + JetBrains Mono becomes the default branch. Orbitron moves to the `theme !== 'abyssal'` branch (dead code, but kept for safety).
3. Delete the legacy animated-blob background div (lines 84-98) and the 30 floating-particles div (lines 101-118). These are already gated behind `theme !== 'abyssal'`, but since abyssal is now default, they are dead code.
4. The `themeInitScript` dark-mode logic stays unchanged (toggles `.dark` on `<html>`, orthogonal to abyssal).

### Delete Duplicate Background Blocks

Five pages re-declare their own animated radial-gradient background + particles on top of AppLayout's. These must be removed:

| File | What to delete |
|------|----------------|
| `pages/dashboard/index.astro` | Own radial-gradient blob layer + 20 particles |
| `pages/profile/index.astro` | Same pattern |
| `pages/profile/[username]/index.astro` | Same pattern |
| `pages/achievements/index.astro` | Same pattern |
| `pages/settings.astro` | Own 2-blob background (no particles) |

### Leaderboard Local Style Cleanup

Delete the local `.holographic-text` CSS class and `@keyframes holographic` definition in `pages/leaderboard/index.astro` `<style>` block. The Fraunces + `.cetus-wordmark--glow` treatment replaces it.

---

## L2: Shared Component Retint

Principle: components use `cetus-*` tokens (already defined in `global.css`), which resolve to the abyssal palette under `.theme-abyssal`. No page passes `theme` anymore.

### `Heading.astro`

| Variant | Current | Target |
|---------|---------|--------|
| `hero` | `font-orbitron font-black text-holographic` | Fraunces display (extralight, large), optional `.cetus-wordmark--glow` |
| `section` | `font-orbitron font-bold text-holographic` | Fraunces semibold + optional JetBrains Mono kicker label (`▸ SECTION`) |
| `subsection` | `font-orbitron font-bold text-white` | Fraunces medium |
| `default` | `font-orbitron text-white` | Inter semibold |

Add optional `kicker` prop (string) that renders a `<p class="font-mono ...">▸ {kicker}</p>` above the heading.

### `Card.astro`

| Variant | Current | Target |
|---------|---------|--------|
| `glass` | `bg-glass-strong rounded-3xl border-neon` | `bg-cetus-surface rounded-2xl border border-cetus-hairline` |
| `sci-fi` | `bg-cetus-surface border-neon hover-glow-cyan` | Merged with `glass` — same `cetus-surface`/`cetus-hairline`, token-based hover glow |
| `default` | shadcn-style `bg-card text-card-foreground` | Unchanged |

Add optional `brackets` boolean prop that renders 4 `.hud-bracket` corner elements (same pattern as `SpecimenCard`).

### `Badge.astro`

- Add `font-mono tracking-wide text-xs` to all variants for HUD readout feel.
- Color variants retint: `success` → teal, `warning` → amber, `error` → magenta (`cetus-accent-3`), all via tokens.
- `outline` variant border → `border-cetus-hairline`.

### `Avatar.astro`

- Hardcoded gradient variants (`cyan-purple`, `purple-pink`, `pink-cyan`) → `bg-cetus-accent` ring + token shadow.
- Fallback initials stay `font-orbitron` → Fraunces.

### `Select.astro`

- `sciFiClasses`: drop `font-orbitron`, use Inter.
- `glass` variant: `bg-glass` → `bg-cetus-surface border-cetus-hairline`.
- Dropdown options: `bg-gray-800/95` → `bg-cetus-surface`.

### `Toggle.astro`

- `sci-fi` variant checked state: `from-cyan-500 to-purple-600` → `bg-cetus-accent`.
- Unchecked track: `bg-gray-800/60` → `bg-cetus-surface`.
- Knob shadow → token-based.

### `Button.astro`

- Already token-driven for `primary`/`outline` variants.
- Verify `hover-glow-cyan` retints correctly under `.theme-abyssal` (it should — the homepage already added `.theme-abyssal .glow-cyan` retint in `global.css`).
- No structural change expected.

### `Slider.astro`

- Used in settings (3 volume sliders). Track and fill need `cetus-*` token retint (fill → `cetus-accent`, track → `cetus-surface`).
- Thumb/handle glow → token-based.

### `Pagination.astro`

- Used in achievements. Page-number buttons and prev/next arrows need `cetus-hairline` borders and `cetus-accent` active state.

---

## L3: Game Framework & 14-Page Refactor

### Wrapper Component Restyle (6 files)

**`GamePage.astro`** — explicitly passes `theme="abyssal"` to AppLayout (redundant once default, but self-documenting). Composes all sub-components via named slots as it already does.

**`GameTitle.astro`** — `font-orbitron text-holographic` → Fraunces display with `.cetus-wordmark--glow`. Description text → `text-cetus-ink-muted`.

**`GameBreadcrumb.astro`** — `text-cyan-400 text-sm` → JetBrains Mono kicker (`▸ GAME · Tetris`), `border-cetus-hairline` bottom divider.

**`GameStats.astro`** — Retint Card border to `cetus-hairline`. Score/Time/Level badges: `font-mono` + `text-cetus-accent`.

**`GameControls.astro`** — Ensure Card wrapper uses `cetus-surface`. Buttons inherit Button token styling.

**`GameOverlay.astro`** — Title: `font-orbitron text-cyan-400` → Fraunces with glow. Final score: `font-mono text-cetus-accent`. Backdrop stays `bg-black/90`. Buttons inherit tokens.

### 14 Game Page Refactor

Each game page currently inlines ~100+ lines of identical markup (breadcrumb, title, two-column flex, sidebar cards, GameOverlay). Refactor to use wrappers:

```
<GamePage title="..." description="..." navigation={[...]}>
  <GameTitle slot="title" ... />
  <!-- Game-specific board container -->
  <div id="game-board" class="...">...</div>
  <!-- Sidebar -->
  <GameStats slot="stats" ... />
  <GameControls slot="controls" ... />
  <GameOverlay slot="overlay" ... />
</GamePage>
```

**What stays page-specific per game:**
- The `<div id="game-board">` mount point with its game-specific inline `width`/`height`
- The `<script>` init call
- Game-unique UI elements (e.g., circuit-hacker difficulty `<select>`, sudoku number pad)

**Refactor sequence:** tetris first as proof-of-concept, verify, then batch remaining 13.

**Games to refactor:** tetris, bubble-shooter, memory-matrix, quick-math, word-scramble, reflex, sudoku, bejeweled, path-navigator, evader, 2048, snake, circuit-hacker, satellite-sync.

**Expected result:** each page shrinks from ~200-280 lines to ~60-100 lines.

---

## L4: App Pages

The shared component retint (L2) already handles ~60% of the visual change. This layer adds page-specific HUD polish.

### Auth (login + signup)

- Centered HUD card with corner brackets, `cetus-hairline` border
- Kicker: `▸ AUTH · LOGIN` / `▸ AUTH · NEW OPERATOR`
- Google sign-in button: retint cyan→purple gradient to `cetus-accent` token
- Error box: `border-cetus-accent-3` (magenta)
- Link styling: `text-cetus-accent`

### Dashboard

- Hero: Fraunces welcome heading, mono kicker `▸ COMMAND CENTER`
- Quick-nav buttons: mono labels, `cetus-accent` outline
- Game history rows: `border-cetus-hairline`, icon tiles `bg-cetus-surface` with teal accent, scores `font-mono text-cetus-accent`
- Pagination: token retint

### Profile (`index.astro` + `[username]/index.astro`)

- Hero: Fraunces, mono kicker `▸ OPERATOR PROFILE`
- Avatar ring: `cetus-accent` token gradient
- Edit forms: drop `font-orbitron`, use Inter for inputs
- Activity heatmap: intensity scale retints from cyan family to teal family (`cetus-accent` with varying opacity)
- Quick stats: `font-mono` numbers in `text-cetus-accent`
- Crop modal: `cetus-surface` background, Fraunces title, token buttons
- Public profile: same treatment, recent-activity rows get `cetus-hairline` borders

### Leaderboard

- Hero: Fraunces + mono kicker `▸ RANKINGS`
- Trophy tile: `cetus-accent` gradient
- Rank medals: keep gold/silver/bronze semantics, restyle as HUD pips with mono rank numbers
- Entry rows: `cetus-hairline` borders, `font-mono` scores
- Category badges: puzzle=magenta, action=amber, strategy=teal, trivia=ice-blue
- Select dropdown: inherits L2 retint

### Achievements

- Hero: Fraunces + mono kicker `▸ ACHIEVEMENT LOG`
- 3-stat summary: `font-mono` numbers, teal/amber/magenta accents
- Achievement cards: HUD corner brackets, `cetus-hairline` borders
- Rarity glow: legendary=amber, epic=magenta, rare=teal, common=muted — all via `cetus-*` tokens
- Filter bar: `bg-cetus-surface border-cetus-hairline`

### Settings

- Hero: Fraunces + mono kicker `▸ SYSTEM CONFIG`
- Section headers: Fraunces with bracket notation `[ SOUND ]`, `[ DISPLAY ]`, etc.
- Toggles/Sliders: inherit L2 retint
- Toast: `bg-cetus-accent` success / `bg-cetus-accent-3` error

### Challenges

- Hero: Fraunces + mono kicker `▸ DAILY MISSIONS`
- 4 stat cards: `font-mono` numbers with tiered accents
- Level progress bar: `cetus-accent` fill
- Challenge cards: `cetus-hairline` borders, progress bars in teal, completed = `cetus-accent` glow
- XP/level numbers: `font-mono`

---

## L5: Global Overlays & Modals

These components are rendered globally by `AppLayout` or `Navigation`.

### `LoginRewardModal.astro`

- Card body: `from-gray-900/95 to-gray-800/95` → `bg-cetus-surface border-cetus-hairline`
- Title: `font-orbitron` → Fraunces + mono kicker `▸ DAILY REWARD`
- 7-day calendar: claimed days get `cetus-accent` glow, current day gets `cetus-accent-2` (amber) pulse ring
- Claim button: `cetus-accent` token

### `AchievementAward.astro`

- Title: `font-orbitron text-cyan-400` → Fraunces + mono kicker `▸ ACHIEVEMENT UNLOCKED`
- Rarity colors: legendary=amber, epic=magenta, rare=teal, common=ink-muted (via tokens)
- Card template: `bg-glass-strong` → `cetus-surface border-cetus-hairline`
- Particle effects retinted to match rarity color

### `ChallengeComplete.astro`

- Card body: `from-gray-900/95 to-gray-800/95` → `cetus-surface border-cetus-hairline`
- Title: `font-orbitron` → Fraunces
- XP awarded: `text-cyan-400` → `font-mono text-cetus-accent`
- Level-up badge: `from-purple-600 to-pink-600` → `cetus-accent-3`
- Continue button: `bg-cyan-500` → `cetus-accent`

### `UserDropdown.astro`

- Trigger: `from-cyan-500/20 to-purple-600/20` → `bg-cetus-surface/50 border-cetus-hairline`
- Menu: `bg-slate-900/95 border-cyan-400/30` → `bg-cetus-surface border-cetus-hairline`
- Items: `hover:bg-cyan-500/10 hover:text-cyan-400` → `hover:bg-cetus-accent/10 hover:text-cetus-accent`
- Emoji menu icons (👤 ⚙️ 📊 🏆 🎛️ 🚪): keep as-is. Emojis in interactive affordances (dropdown items, challenge icons) are acceptable; bracket/mono treatment is reserved for page-level HUD chrome.

### `DailyMissionsPanel.astro`

- Header: `font-orbitron text-cyan-400` → Fraunces + mono kicker
- XP bar: `from-cyan-500 to-purple-600` → `cetus-accent` fill
- Challenge rows: `bg-gray-800/30 border-gray-700/50` → `cetus-surface cetus-hairline`
- Difficulty colors: green/yellow/red → `cetus-accent` / `cetus-accent-2` / `cetus-accent-3`

---

## Testing Strategy

### After Each Layer

1. **Vitest unit tests:** run full suite (`bun run test:run`). Update component tests for retinted shared components.
2. **Playwright e2e:** run e2e suite (`bun run test:e2e`). Ensure no structural regressions.
3. **Lint:** `bun run lint` on changed files.
4. **Browser sanity:** reload each affected page in browser MCP, verify fonts/colors/structure.

### New Tests

- Update existing component tests (Heading, Card, Badge, etc.) to assert abyssal token classes instead of legacy ones.
- Add tests for game wrapper components (GameTitle, GameBreadcrumb, GameOverlay) verifying Fraunces/mono/token classes.
- Add structural markup tests for refactored game pages (verify wrapper usage, no orphaned inline chrome).

### Existing Tests

- Homepage tests (`index-markup.test.ts`, `global.test.ts`, `shell-tokens.test.ts`, `SpecimenCard.test.ts`) must remain green — the homepage is not changing.
- All 2396 existing tests must pass throughout.

---

## Token Reference

All abyssal tokens are already defined in `src/styles/global.css` (from the predecessor homepage redesign):

| Token | `:root` (legacy default) | `.theme-abyssal` |
|-------|-------------------------|------------------|
| `--cetus-accent` | `oklch(0.789 0.154 211.53)` (cyan-400) | `#22f5d0` (bright teal) |
| `--cetus-accent-2` | `oklch(0.834 0.182 78.5)` (amber-400) | `#ffc24a` (bright amber) |
| `--cetus-accent-3` | `oklch(0.627 0.265 303.9)` (purple-500) | `#ff3d8a` (magenta) |
| `--cetus-surface` | `#0f172a` | `#060e1a` |
| `--cetus-hairline` | `rgba(148, 163, 184, 0.12)` | `rgba(34, 245, 208, 0.12)` |
| `--cetus-ink` | `#e2e8f0` | `#dbeafe` |
| `--cetus-ink-muted` | `rgba(226, 232, 240, 0.55)` | `rgba(186, 230, 253, 0.45)` |

Tailwind utilities derived from these tokens: `text-cetus-accent`, `text-cetus-accent-2`, `text-cetus-accent-3`, `bg-cetus-surface`, `border-cetus-hairline`, `text-cetus-ink`, `text-cetus-ink-muted`.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Profile page is 1396 lines with inline forms + 700-line script | Migrate carefully, test incrementally. The script logic is orthogonal to styling — only class strings change. |
| 14 game page refactors could break game initialization | Proof-of-concept with tetris first. Each game's `<script>` init stays untouched — only the surrounding markup moves into wrappers. Verify `window.gameNameGame` debug access still works. |
| Dynamic Tailwind classes in achievements (`from-${color}-500/10`) | These are constructed strings. Tailwind must include them in content scan. Verify they still render after retint. If not, switch to token-based conditional classes. |
| `border-neon` / `bg-glass` utilities are defined in `tailwind.config.js` plugin | The plugin stays (needed if any legacy path remains). New abyssal pages use `cetus-*` tokens instead. No conflict — just preference. |
| Removing animated backgrounds changes visual density | Abyssal scanline `::after` + body background already provide atmosphere. Pages may feel emptier — the HUD chrome (brackets, kickers, strips) compensates. |
