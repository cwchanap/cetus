# Abyssal HUD App-Wide Redesign

**Date:** 2026-07-10
**Status:** Approved
**Predecessor:** `2026-07-09-abyssal-hud-redesign-design.md` (homepage redesign)

## Problem

The homepage was redesigned with an "Abyssal HUD" aesthetic (museum-meets-arcade: Fraunces + JetBrains Mono fonts, neon teal/amber/magenta accents, HUD brackets, scanlines, dark abyssal background). All 23 other pages (14 games + 9 app pages) still use the legacy Orbitron / animated-blob / cyan-purple aesthetic. The app feels inconsistent — users step from a polished HUD homepage into a dated sci-fi shell.

## Decision

Extend the Abyssal HUD to the entire app. Make `theme="abyssal"` the default in `AppLayout`, retint all shared components to `cetus-*` tokens, refactor the 14 game pages to use existing wrapper components, and apply full HUD treatment (kickers, brackets, score-strip dividers, mono readouts) to every page.

## Scope

**In scope:**
- L1: AppLayout shell (abyssal default, remove legacy backgrounds)
- L2: 9 shared UI components (Heading, Card, Badge, Avatar, Select, Toggle, Slider, Pagination, Button)
- L3: 6 game wrapper components + 14 game page refactors
- L4: 9 app pages (auth [login + signup], dashboard, profile x2, leaderboard, achievements, settings, challenges)
- L5: 3 global overlays (AchievementAward, ChallengeComplete, UserDropdown)

**Out of scope:**
- Game canvas internals (PixiJS/DOM game logic — only outer chrome changes)
- `main.astro` layout (bare shell, used only by `markdown-page.md` — demo content)
- `markdown-page.md` (Astro scaffold demo page at `/markdown-page` — 16 lines of `bg-purple-500` Tailwind example. Not a real app page. Out of scope; can be deleted separately if desired.)
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
2. The font `<link>` ternary (lines 69-74) already handles abyssal vs. non-abyssal fonts correctly. No edit needed — once `theme` defaults to `'abyssal'`, the Fraunces + JetBrains Mono branch loads by default.
3. Delete the legacy animated-blob background div (lines 84-98) and the 30 floating-particles div (lines 101-118). These are already gated behind `theme !== 'abyssal'`, but since abyssal is now default, they are dead code.
4. Prune dead code in the inline `<script>` (lines 137-173): the particle-float block (lines 155-160, targets `.animate-bounce` elements that L1 step 3 deletes) becomes dead code — remove it. The `.glow-cyan`-on-`.group` hover block (lines 141-152) still works (retinted via `.theme-abyssal .glow-cyan`) — keep it. The `redirect=games` scroll logic (lines 163-172) — keep it.
5. The `themeInitScript` dark-mode logic stays unchanged (toggles `.dark` on `<html>`, orthogonal to abyssal). However, note that once abyssal is the default with fixed dark token values, the light/dark toggle in Settings becomes vestigial — see L4 Settings decision below.

### Delete Duplicate Background Blocks

Five pages re-declare their own animated radial-gradient background + particles on top of AppLayout's. These must be removed:

| File | What to delete |
|------|----------------|
| `pages/dashboard/index.astro` | Own radial-gradient blob layer + 20 particles |
| `pages/profile/index.astro` | Same pattern |
| `pages/profile/[username]/index.astro` | Same pattern |
| `pages/achievements/index.astro` | Same pattern |
| `pages/settings.astro` | Own 2-blob background (no particles) |

**Ordering constraint:** The `theme` default flip (step 1) and all five background-block deletions must land in one atomic changeset. If the default flips before the blocks are removed, those pages render the abyssal background AND legacy blobs/particles stacked — visible breakage. Commit them together.

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

**CSS ownership:** The `.hud-bracket` rules currently live in `SpecimenCard.astro`'s scoped `<style>` (lines 214-256). Move them to `global.css` under the `.theme-abyssal` section so any component (Card, SpecimenCard, future HUD containers) inherits them. SpecimenCard's scoped `<style>` drops the bracket rules but keeps its other scoped styles.

**Note:** `Card.astro` currently has a comment (lines 15-20) documenting that `sci-fi`/`glass` keep `border-neon` intentionally for login/signup legacy surfaces. This decision is now superseded — all pages go abyssal, so `border-neon` is replaced by `cetus-hairline` everywhere. Remove the comment.

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

**This is the heaviest layer.** All 14 game pages currently import `AppLayout` directly and inline their own chrome — 0 of 14 use the existing `GamePage` wrapper. This layer is 14 real page rewrites + wrapper component edits, not just class swaps. The "tetris first as proof-of-concept" sequence mitigates risk.

### Wrapper Component Restyle (6 files)

Five wrappers live in `src/components/games/`: `GamePage.astro`, `GameTitle.astro`, `GameBreadcrumb.astro`, `GameStats.astro`, `GameControls.astro`. The sixth, `GameOverlay.astro`, lives in `src/components/` (shared, not game-specific).

**`GamePage.astro`** — explicitly passes `theme="abyssal"` to AppLayout (redundant once default, but self-documenting). Composes all sub-components via named slots as it already does.

**`GameTitle.astro`** — `font-orbitron text-holographic` → Fraunces display with `.cetus-wordmark--glow`. Description text → `text-cetus-ink-muted`.

**`GameBreadcrumb.astro`** — `text-cyan-400 text-sm` → JetBrains Mono kicker (`▸ GAME · Tetris`), `border-cetus-hairline` bottom divider.

**`GameStats.astro`** — Retint Card border to `cetus-hairline`. Score/Time/Level badges: `font-mono` + `text-cetus-accent`.

**`GameControls.astro`** — Ensure Card wrapper uses `cetus-surface`. Buttons inherit Button token styling.

**`GameOverlay.astro`** — Title: `font-orbitron text-cyan-400` → Fraunces with glow. Final score: `font-mono text-cetus-accent`. Backdrop stays `bg-black/90`. Buttons inherit tokens.

### 14 Game Page Refactor

Each game page currently inlines ~100+ lines of identical markup (breadcrumb, title, two-column flex, sidebar cards, GameOverlay) and imports `AppLayout` directly — 0 of 14 use the existing `GamePage` wrapper. The refactor consolidates this into `GamePage`, which already renders `GameBreadcrumb`, `GameTitle`, `GameStats`, `GameControls`, and `GameOverlay` internally.

#### Existing GamePage API (verbatim from source)

**Props:** `gameId` (required), `title` (required), `description` (required), `icon` (required), `navigation?`, `includeFooter?`, `class?`

**Slots:** `game-board` (board container), `additional-stats` (extra stat badges inside GameStats), `game-info` (sidebar cards below controls), `bottom-info` (full-width content below the board), `final-stats` (content inside GameOverlay), `game-script` (init `<script>`)

#### Required GamePage enhancements (before refactor)

The existing wrapper handles the common case but two gaps prevent adoption by outlier games:

1. **Controls override** — `GameControls` is rendered internally with hardcoded `start-btn`/`end-btn`/`pause-btn`/`reset-btn`. Games like Circuit Hacker use `stop-btn` instead of `end-btn` and omit pause/reset. **Add an optional `controls` slot to GamePage:** if provided (`Astro.slots.has('controls')`), render the slot instead of the default `<GameControls>`. Standard games get the default; outliers provide custom controls.

2. **Overlay props** — `GameOverlay` accepts `defaultTitle` and `buttonText` props, but `GamePage` doesn't forward them. **Add optional `overlayTitle` and `overlayButtonText` props to GamePage** and pass through to the internal `<GameOverlay>`.

#### Refactored page example (correct API)

```astro
---
import GamePage from '@/components/games/GamePage.astro'
import Button from '@/components/ui/Button.astro'
import Card from '@/components/ui/Card.astro'
// ... game-specific imports
---
<GamePage
  gameId="tetris"
  title="Tetris"
  description="Stack and clear lines in the classic block puzzle."
  icon="🟦"
  navigation={[{ href: '/', label: 'Home' }, { href: '/tetris', label: 'Tetris' }]}
>
  <!-- Board mount point -->
  <div slot="game-board" id="game-board"
       class="border-2 border-cetus-hairline bg-black/50 rounded-lg"
       style="width:300px;height:600px;">
  </div>

  <!-- Sidebar: how-to-play card -->
  <div slot="game-info">
    <Card variant="glass" class="p-6">
      <h3 class="font-mono text-cetus-accent mb-3">▸ HOW TO PLAY</h3>
      <!-- ... -->
    </Card>
  </div>

  <!-- Init script -->
  <script slot="game-script">
    // import and init game...
  </script>
</GamePage>
```

**Circuit Hacker example (controls override):**

```astro
<GamePage gameId="circuit-hacker" title="Circuit Hacker" ... overlayTitle="CIRCUIT POWERED!">
  <div slot="game-board" id="game-board" ...></div>

  <!-- Custom controls replacing default GameControls -->
  <div slot="controls" class="flex space-x-3">
    <Button id="start-btn" variant="primary">Start Game</Button>
    <Button id="stop-btn" variant="outline" style="display:none;">End Game</Button>
  </div>

  <!-- Custom overlay stats -->
  <div slot="final-stats">
    <div class="text-cetus-ink-muted">Time Left: <span id="final-time" class="font-mono text-cetus-accent">0s</span></div>
    <div class="text-cetus-ink-muted">Rotations: <span id="final-rotations" class="font-mono text-cetus-accent">0</span></div>
  </div>
</GamePage>
```

**What stays page-specific per game:**
- The `<div slot="game-board">` mount point with its game-specific inline `width`/`height`
- The `<script slot="game-script">` init call
- Game-unique UI (circuit-hacker difficulty `<select>`, sudoku number pad) via `game-info` or `bottom-info` slots
- Games with non-standard controls use the `controls` slot

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
- **`DailyMissionsPanel.astro`** (dashboard-only component): Header `font-orbitron text-cyan-400` → Fraunces + mono kicker. XP bar `from-cyan-500 to-purple-600` → `cetus-accent` fill. Challenge rows `bg-gray-800/30 border-gray-700/50` → `cetus-surface cetus-hairline`. Difficulty colors green/yellow/red → `cetus-accent` / `cetus-accent-2` / `cetus-accent-3`.
- **`LoginRewardModal.astro`** (dashboard-only component): Card body `from-gray-900/95 to-gray-800/95` → `bg-cetus-surface border-cetus-hairline`. Title `font-orbitron` → Fraunces + mono kicker `▸ DAILY REWARD`. 7-day calendar: claimed days get `cetus-accent` glow, current day gets `cetus-accent-2` (amber) pulse ring. Claim button → `cetus-accent` token.

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
- **Retire the Dark Mode toggle:** `.theme-abyssal` unconditionally sets dark background/surface/ink values in `global.css`. Once all components use `cetus-*` tokens, selecting light mode has no visible effect. Remove the toggle from the Display section. Keep the Reduced Motion toggle (that still works — it gates CSS animations). Update `themeInitScript` in AppLayout to stop reading `display.theme` from localStorage and always add `.dark` (or remove the `.dark` logic entirely if no shadcn-default components remain).

### Challenges

- Hero: Fraunces + mono kicker `▸ DAILY MISSIONS`
- 4 stat cards: `font-mono` numbers with tiered accents
- Level progress bar: `cetus-accent` fill
- Challenge cards: `cetus-hairline` borders, progress bars in teal, completed = `cetus-accent` glow
- XP/level numbers: `font-mono`

---

## L5: Global Overlays

These components are rendered globally — `AchievementAward` and `ChallengeComplete` by `AppLayout` (lines 132/135), `UserDropdown` by `Navigation`. (DailyMissionsPanel and LoginRewardModal are dashboard-only and have been moved to L4.)

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
- All existing tests must remain green throughout. (Baseline the count at implementation start.)

---

## Token Reference

All abyssal tokens are already defined in `src/styles/global.css` (from the predecessor homepage redesign). Values below are transcribed verbatim from source — do not edit from this table; always check `global.css` for ground truth.

| Token | `:root` (legacy default) | `.theme-abyssal` |
|-------|-------------------------|------------------|
| `--cetus-accent` | `oklch(0.789 0.154 211.53)` (cyan-400) | `#22f5d0` (bright teal) |
| `--cetus-accent-2` | `oklch(0.627 0.265 303.9)` (purple-500) | `#ffc24a` (bright amber) |
| `--cetus-accent-3` | `oklch(0.627 0.265 303.9)` (purple-500) | `#ff3d8a` (magenta) |
| `--cetus-surface` | `oklch(0 0 0 / 0.05)` (`rgba(255,255,255,0.05)` under `.dark`) | `#06090f` |
| `--cetus-hairline` | `oklch(0.372 0.028 257.286 / 0.5)` (slate-700/50) | `rgba(234, 246, 255, 0.1)` |
| `--cetus-ink` | `var(--foreground)` | `#eaf6ff` |
| `--cetus-ink-muted` | `oklch(0.872 0.01 258.338)` (gray-300) | `#8a98a6` |

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
