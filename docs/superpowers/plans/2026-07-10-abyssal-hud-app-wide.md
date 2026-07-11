# Abyssal HUD App-Wide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Abyssal HUD aesthetic from the homepage to the entire app — all 23 other pages, 9 shared components, 6 game wrappers, and 3 global overlays.

**Architecture:** Layer-by-layer (L1→L5), foundation-first. Each layer unblocks the next. Shared component retints (L2) ripple to ~80% of the app's look with minimal edits. Game pages (L3) are refactored from inline-duplicated markup to use the existing wrapper components.

**Tech Stack:** Astro 5, Tailwind CSS 4, Vitest (jsdom + AstroContainer), Playwright, Bun.

## Global Constraints

- Package manager: **Bun** (`bun@1.3.1`)
- Run tests: `bun run test:run`
- Run lint: `bun run lint`
- Run single test: `bun run test <path>`
- Dev server: `bun run web:dev` (localhost:4325)
- E2e: `bun run test:e2e`
- **Never touch game canvas internals** (PixiJS/DOM game logic) — only outer chrome changes
- All color changes use `cetus-*` tokens (defined in `src/styles/global.css`), never hardcoded hex/rgb
- Font swaps: `font-orbitron` → Fraunces (`var(--cetus-display-font)`) or Inter; `text-holographic` → `.cetus-wordmark` or `.cetus-wordmark--glow`
- `cetus-*` token values are defined in `global.css` — always check source for ground truth, never edit from the spec's token reference table
- Each task ends with: run full test suite + lint + commit

**Spec:** `docs/superpowers/specs/2026-07-10-abyssal-hud-app-wide-design.md`

---

## File Structure

| File | Responsibility | Task |
|------|---------------|------|
| `src/layouts/AppLayout.astro` | Shell: theme default, font loading, bg/particles, script | T1 |
| `src/styles/global.css` | Token definitions + `.hud-bracket` rules (moved from SpecimenCard) | T1 |
| `src/components/ui/SpecimenCard.astro` | Drop scoped `.hud-bracket` CSS (moved to global.css) | T1 |
| `src/pages/dashboard/index.astro` | Delete duplicate bg block | T1 |
| `src/pages/profile/index.astro` | Delete duplicate bg block | T1 |
| `src/pages/profile/[username]/index.astro` | Delete duplicate bg block | T1 |
| `src/pages/achievements/index.astro` | Delete duplicate bg block | T1 |
| `src/pages/settings.astro` | Delete duplicate bg block | T1 |
| `src/pages/leaderboard/index.astro` | Delete local `.holographic-text` style | T1 |
| `src/components/ui/Heading.astro` | Orbitron→Fraunces, add `kicker` prop | T2 |
| `src/components/ui/Card.astro` | glass/sci-fi→cetus tokens, add `brackets` prop, remove border-neon comment | T2 |
| `src/components/ui/Badge.astro` | Add `font-mono tracking-wide`, retint colors | T2 |
| `src/components/ui/Avatar.astro` | Hardcoded gradients→cetus tokens | T2 |
| `src/components/ui/Select.astro` | Drop Orbitron, glass→cetus tokens | T2 |
| `src/components/ui/Toggle.astro` | cyan-purple→cetus-accent | T2 |
| `src/components/ui/Slider.astro` | fill→cetus-accent | T2 |
| `src/components/ui/Pagination.astro` | cetus-hairline borders, cetus-accent active | T2 |
| `src/components/games/GamePage.astro` | Add `controls` slot + `overlayTitle`/`overlayButtonText` props | T3 |
| `src/components/games/GameTitle.astro` | Fraunces + cetus-wordmark | T3 |
| `src/components/games/GameBreadcrumb.astro` | Mono kicker + cetus-hairline | T3 |
| `src/components/games/GameStats.astro` | cetus-hairline + font-mono badges | T3 |
| `src/components/games/GameControls.astro` | cetus-surface Card | T3 |
| `src/components/GameOverlay.astro` | Fraunces + font-mono score | T3 |
| `src/pages/tetris/index.astro` | Refactor to GamePage wrapper | T4 |
| `src/pages/<13 other games>/index.astro` | Refactor to GamePage wrapper | T4 |
| `src/pages/login/index.astro` | HUD treatment | T5 |
| `src/pages/signup/index.astro` | HUD treatment | T5 |
| `src/pages/dashboard/index.astro` | HUD treatment | T6 |
| `src/components/DailyMissionsPanel.astro` | HUD retint | T6 |
| `src/components/LoginRewardModal.astro` | HUD retint | T6 |
| `src/pages/profile/index.astro` | HUD treatment (1396 lines) | T7 |
| `src/pages/profile/[username]/index.astro` | HUD treatment | T7 |
| `src/pages/leaderboard/index.astro` | HUD treatment | T8 |
| `src/pages/achievements/index.astro` | HUD treatment | T8 |
| `src/pages/challenges/index.astro` | HUD treatment | T8 |
| `src/pages/settings.astro` | HUD treatment + retire dark mode toggle | T9 |
| `src/components/AchievementAward.astro` | HUD retint | T10 |
| `src/components/ChallengeComplete.astro` | HUD retint | T10 |
| `src/components/UserDropdown.astro` | HUD retint | T10 |

---

### Task 1: L1 Shell Foundation

**Files:**
- Modify: `src/layouts/AppLayout.astro`
- Modify: `src/styles/global.css`
- Modify: `src/components/ui/SpecimenCard.astro`
- Modify: `src/pages/dashboard/index.astro`
- Modify: `src/pages/profile/index.astro`
- Modify: `src/pages/profile/[username]/index.astro`
- Modify: `src/pages/achievements/index.astro`
- Modify: `src/pages/settings.astro`
- Modify: `src/pages/leaderboard/index.astro`
- Test: `src/layouts/AppLayout.test.ts`
- Test: `src/styles/global.test.ts`

**Interfaces:**
- Produces: AppLayout defaults to `theme="abyssal"`. All pages render in abyssal mode without passing the prop. `.hud-bracket` CSS available globally in `global.css`.

**Ordering constraint:** Steps 2-4 (AppLayout default flip) and Step 5 (delete 5 duplicate bg blocks) MUST be committed together. If the default flips before the blocks are removed, those pages render abyssal bg AND legacy blobs stacked — visible breakage.

- [ ] **Step 1: Write tests for abyssal-as-default and hud-bracket in global.css**

Add to `src/layouts/AppLayout.test.ts`:

```typescript
it('defaults to abyssal theme when no theme prop is passed', async () => {
    const html = await container.renderToString(AppLayout, {
        props: { title: 'Test' },
    })
    expect(html).toContain('theme-abyssal')
    expect(html).not.toContain('bg-gradient-radial from-cyan-400/30')
    expect(html).not.toContain('animate-bounce')
})
```

Add to `src/styles/global.test.ts`:

```typescript
it('defines .hud-bracket rules in global scope (not just SpecimenCard)', () => {
    expect(globalCss).toContain('.hud-bracket {')
    expect(globalCss).toContain('.hud-bracket--tl {')
    expect(globalCss).toContain('.hud-bracket--tr {')
    expect(globalCss).toContain('.hud-bracket--bl {')
    expect(globalCss).toContain('.hud-bracket--br {')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/layouts/AppLayout.test.ts src/styles/global.test.ts`
Expected: FAIL — AppLayout still defaults to `'default'`; `.hud-bracket` not in global.css.

- [ ] **Step 3: Move `.hud-bracket` CSS from SpecimenCard to global.css**

Read the `.hud-bracket` rules from `src/components/ui/SpecimenCard.astro` scoped `<style>` (approximately lines 214-256, including the `.vessel:hover .hud-bracket` hover rules and the reduced-motion override). 

Add these rules to `src/styles/global.css` under the `/* ---------- HUD chrome classes (abyssal) ---------- */` section, adapting the hover selector from `.vessel:hover .hud-bracket` to a more general `.hud-bracket-host:hover .hud-bracket` pattern. Add `.hud-bracket-host` class guidance in a comment: "Add `hud-bracket-host` to any element that should reveal brackets on hover."

In `SpecimenCard.astro`: change the `.vessel` class to include `hud-bracket-host` (e.g., `class="vessel hud-bracket-host ..."`) so the hover rules still apply. Remove the `.hud-bracket` CSS blocks from the scoped `<style>`. Keep all other scoped styles (organism, vessel__body, power-bar, etc.).

- [ ] **Step 4: Flip AppLayout theme default to abyssal + delete legacy bg/particles + prune script**

In `src/layouts/AppLayout.astro`:
1. Change `theme = 'default'` to `theme = 'abyssal'` (line 22).
2. Delete the animated-blob background block (the `{ theme !== 'abyssal' && (...) }` block with `bg-gradient-radial`, approximately lines 84-98).
3. Delete the floating-particles block (the `{ theme !== 'abyssal' && (...) }` block with `animate-bounce`, approximately lines 101-118).
4. In the inline `<script>`, delete the particle-float block that targets `.animate-bounce` elements (approximately lines 155-160). Keep the `.glow-cyan`-on-`.group` hover block and the `redirect=games` scroll logic.

- [ ] **Step 5: Delete 5 duplicate background blocks (atomic with Step 4)**

In each of these 5 files, find and delete the duplicate animated background div (the block containing `bg-gradient-radial` and/or `animate-bounce` particle elements that duplicates AppLayout's deleted background):

- `src/pages/dashboard/index.astro` — search for `bg-gradient-radial` and delete the wrapping `<div>` and its children
- `src/pages/profile/index.astro` — same
- `src/pages/profile/[username]/index.astro` — same
- `src/pages/achievements/index.astro` — same
- `src/pages/settings.astro` — same (2-blob variant, no particles)

- [ ] **Step 6: Delete leaderboard local holographic style**

In `src/pages/leaderboard/index.astro`, find the `<style>` block and delete the `.holographic-text` class definition and the `@keyframes holographic` definition. These are local duplicates of the global `text-holographic` utility. The Fraunces + `.cetus-wordmark--glow` treatment replaces them.

- [ ] **Step 7: Run full test suite**

Run: `bun run test:run`
Expected: All tests pass. Some existing tests that assert `theme !== 'abyssal'` background elements may need updating — if any test checks for `bg-gradient-radial` in AppLayout output, update it to assert the elements are absent.

- [ ] **Step 8: Lint changed files**

Run: `bun run lint`
Fix any issues in changed files.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(L1): abyssal shell foundation — default theme, remove legacy bg, move hud-bracket to global

- AppLayout defaults to theme='abyssal'
- Delete legacy animated-blob bg + floating particles
- Prune dead particle-float script code
- Delete 5 duplicate background blocks (dashboard, profile×2, achievements, settings)
- Delete leaderboard local .holographic-text style
- Move .hud-bracket CSS from SpecimenCard scoped style to global.css"
```

---

### Task 2: L2 Shared Component Retint

**Files:**
- Modify: `src/components/ui/Heading.astro`
- Modify: `src/components/ui/Card.astro`
- Modify: `src/components/ui/Badge.astro`
- Modify: `src/components/ui/Avatar.astro`
- Modify: `src/components/ui/Select.astro`
- Modify: `src/components/ui/Toggle.astro`
- Modify: `src/components/ui/Slider.astro`
- Modify: `src/components/ui/Pagination.astro`
- Verify: `src/components/ui/Button.astro` (no changes expected)
- Test: `src/components/ui/shell-tokens.test.ts`
- Test: `src/components/ui/Select.test.ts`
- Test: `src/components/ui/Toggle.test.ts`
- Test: `src/components/ui/Slider.test.ts`

**Interfaces:**
- Consumes: `cetus-*` tokens from `global.css` (Task 1)
- Produces: All shared components use `cetus-*` tokens. `Heading` accepts optional `kicker` prop. `Card` accepts optional `brackets` prop.

- [ ] **Step 1: Write tests for retinted components**

Add to `src/components/ui/shell-tokens.test.ts`:

```typescript
it('Heading hero uses Fraunces token font, not Orbitron', async () => {
    const html = await container.renderToString(Heading, {
        props: { variant: 'hero' },
        slots: { default: 'Title' },
    })
    expect(html).not.toMatch(/font-orbitron/)
    expect(html).not.toMatch(/text-holographic/)
})

it('Heading renders a mono kicker when kicker prop is provided', async () => {
    const html = await container.renderToString(Heading, {
        props: { variant: 'section', kicker: 'COMMAND' },
        slots: { default: 'Dashboard' },
    })
    expect(html).toContain('▸ COMMAND')
    expect(html).toMatch(/font-mono/)
})

it('Card glass variant uses cetus tokens, not border-neon', async () => {
    const html = await container.renderToString(Card, {
        props: { variant: 'glass' },
        slots: { default: 'Content' },
    })
    expect(html).toContain('bg-cetus-surface')
    expect(html).toContain('border-cetus-hairline')
    expect(html).not.toContain('border-neon')
    expect(html).not.toContain('bg-glass-strong')
})

it('Card brackets prop renders hud-bracket elements', async () => {
    const html = await container.renderToString(Card, {
        props: { variant: 'glass', brackets: true },
        slots: { default: 'Content' },
    })
    expect(html).toContain('hud-bracket')
})

it('Badge has font-mono tracking for HUD readout feel', async () => {
    const html = await container.renderToString(Badge, {
        props: { variant: 'outline' },
        slots: { default: 'Score' },
    })
    expect(html).toMatch(/font-mono/)
    expect(html).toMatch(/tracking/)
})
```

Update the existing Card sci-fi test in `shell-tokens.test.ts` — change the assertion from `border-neon` to `cetus-hairline`:

```typescript
it('Card sci-fi variant uses cetus surface + hairline border', async () => {
    const html = await container.renderToString(Card, {
        props: { variant: 'sci-fi' },
        slots: { default: 'Content' },
    })
    expect(html).toContain('bg-cetus-surface')
    expect(html).toContain('border-cetus-hairline')
    expect(html).not.toContain('border-neon')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/components/ui/shell-tokens.test.ts`
Expected: FAIL — components still use `font-orbitron`, `text-holographic`, `border-neon`.

- [ ] **Step 3: Retint Heading.astro**

In `src/components/ui/Heading.astro`:
1. Add `kicker?: string` to the Props interface.
2. Destructure `kicker` from `Astro.props`.
3. Replace all `font-orbitron` class references: `hero` and `section` variants → use `style="font-family: var(--cetus-display-font); font-weight: var(--cetus-display-weight); font-style: var(--cetus-display-style);"` (the token-driven approach that resolves to Fraunces under abyssal). Add `cetus-wordmark--glow` class to `hero` variant. `subsection` variant → `font-semibold` (Inter). `default` → `font-semibold`.
4. Remove all `text-holographic` class references.
5. If `kicker` prop is provided, render `<p class="font-mono text-xs tracking-widest text-cetus-ink-muted uppercase mb-2">▸ {kicker}</p>` before the heading element.

- [ ] **Step 4: Retint Card.astro**

In `src/components/ui/Card.astro`:
1. Add `brackets?: boolean` to the Props interface. Destructure it.
2. Replace `glass` variant: `bg-glass-strong rounded-3xl border-neon` → `bg-cetus-surface rounded-2xl border border-cetus-hairline`.
3. Replace `sci-fi` variant: merge with `glass` — same `bg-cetus-surface rounded-2xl border border-cetus-hairline` + keep `hover:border-cetus-accent`.
4. Remove the comment about border-neon being intentional for legacy surfaces (lines 15-20 approximately).
5. If `brackets` prop is true, render 4 `<span class="hud-bracket hud-bracket--{tl,tr,bl,br}" aria-hidden="true"></span>` elements inside the card root. Add `hud-bracket-host` class to the card root so hover rules apply.
6. Import `Heading` is NOT needed — Card is a presentational wrapper.

- [ ] **Step 5: Retint Badge.astro**

In `src/components/ui/Badge.astro`:
1. Add `font-mono tracking-wide text-xs` to the base classes string for all variants.
2. Replace `success` variant color: `bg-green-500/20 text-green-400 border-green-500/30` → `bg-cetus-accent/10 text-cetus-accent border-cetus-accent/30`.
3. Replace `warning` variant color: use `cetus-accent-2` (amber) tokens.
4. Replace `error`/`destructive` variant color: use `cetus-accent-3` (magenta) tokens.
5. Replace `outline` variant: `border-cetus-hairline` instead of hardcoded border color.

- [ ] **Step 6: Retint Avatar.astro**

In `src/components/ui/Avatar.astro`:
1. Replace hardcoded gradient variants: `from-cyan-500 to-purple-600 shadow-glow-cyan` → `bg-cetus-accent/20 ring-1 ring-cetus-accent/40`.
2. Replace `purple-pink` and `pink-cyan` variants similarly with `cetus-accent-2` and `cetus-accent-3` ring colors.
3. Replace `font-orbitron` on fallback initials → use `style="font-family: var(--cetus-display-font);"` token approach.

- [ ] **Step 7: Retint Select.astro**

In `src/components/ui/Select.astro`:
1. In `sciFiClasses`, remove `font-orbitron`. Replace with Inter (just remove the font override — Tailwind default body font is Inter via AppLayout).
2. Replace `glass` variant: `bg-glass ... backdrop-blur-md` → `bg-cetus-surface border border-cetus-hairline backdrop-blur-md`.
3. Replace dropdown options `bg-gray-800/95` → `bg-cetus-surface`.
4. Replace shadow `shadow-cyan-400/10` → `shadow-cetus-accent/10`.

- [ ] **Step 8: Retint Toggle.astro**

In `src/components/ui/Toggle.astro`:
1. In `sci-fi` variant checked state: replace `from-cyan-500 to-purple-600` → `bg-cetus-accent`.
2. Replace `data-[checked]:border-cyan-400/50` → `data-[checked]:border-cetus-accent/50`.
3. Replace unchecked track `bg-gray-800/60` → `bg-cetus-surface`.

- [ ] **Step 9: Retint Slider.astro**

In `src/components/ui/Slider.astro`:
1. Replace fill color: any `bg-cyan-*` or hardcoded fill → `bg-cetus-accent`.
2. Replace track: `bg-gray-*` → `bg-cetus-surface`.
3. Replace thumb glow/shadow: hardcoded → token-based `shadow-cetus-accent/30`.

- [ ] **Step 10: Retint Pagination.astro**

In `src/components/ui/Pagination.astro`:
1. Replace page-number button borders: hardcoded → `border-cetus-hairline`.
2. Replace active state: `bg-cyan-*` or hardcoded → `bg-cetus-accent text-cetus-surface`.
3. Replace hover: `hover:text-cyan-400` → `hover:text-cetus-accent`.

- [ ] **Step 11: Run full test suite**

Run: `bun run test:run`
Expected: All tests pass. Update any existing tests that asserted `font-orbitron`, `border-neon`, or hardcoded colors on these components.

- [ ] **Step 12: Lint changed files**

Run: `bun run lint`

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(L2): retint shared components to cetus tokens

- Heading: Orbitron→Fraunces token, add kicker prop
- Card: glass/sci-fi→cetus-surface/hairline, add brackets prop
- Badge: add font-mono, retint to cetus palette
- Avatar: hardcoded gradients→cetus token ring
- Select: drop Orbitron, glass→cetus tokens
- Toggle: cyan-purple→cetus-accent
- Slider: fill→cetus-accent
- Pagination: cetus-hairline borders, cetus-accent active"
```

---

### Task 3: L3a Game Wrapper Enhancements + Restyle

**Files:**
- Modify: `src/components/games/GamePage.astro`
- Modify: `src/components/games/GameTitle.astro`
- Modify: `src/components/games/GameBreadcrumb.astro`
- Modify: `src/components/games/GameStats.astro`
- Modify: `src/components/games/GameControls.astro`
- Modify: `src/components/GameOverlay.astro`
- Create: `src/components/games/wrappers.test.ts`

**Interfaces:**
- Consumes: `cetus-*` tokens, `cetus-wordmark--glow` class, `hud-bracket` CSS (from T1/T2)
- Produces: `GamePage` with `controls` slot + `overlayTitle`/`overlayButtonText` props. All wrappers use Fraunces/mono/cetus tokens.

- [ ] **Step 1: Write tests for wrapper restyle and new GamePage API**

Create `src/components/games/wrappers.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import GamePage from './GamePage.astro'
import GameTitle from './GameTitle.astro'
import GameBreadcrumb from './GameBreadcrumb.astro'
import GameOverlay from '@/components/GameOverlay.astro'

const gamePageSource = readFileSync(
    resolve(process.cwd(), 'src/components/games/GamePage.astro'),
    'utf-8'
)

describe('Game wrapper restyle', () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>

    beforeAll(async () => {
        container = await AstroContainer.create()
    })

    it('GamePage source has a controls slot override', () => {
        expect(gamePageSource).toContain("name='controls'")
        expect(gamePageSource).toMatch(/Astro\.slots\.has\(['"]controls['"]\)/)
    })

    it('GamePage source has overlayTitle and overlayButtonText props', () => {
        expect(gamePageSource).toContain('overlayTitle')
        expect(gamePageSource).toContain('overlayButtonText')
    })

    it('GameTitle uses Fraunces token, not Orbitron', async () => {
        const html = await container.renderToString(GameTitle, {
            props: { title: 'Tetris', description: 'Stack blocks' },
        })
        expect(html).not.toMatch(/font-orbitron/)
        expect(html).not.toMatch(/text-holographic/)
        expect(html).toMatch(/cetus-wordmark/)
    })

    it('GameBreadcrumb uses mono kicker + cetus hairline', async () => {
        const html = await container.renderToString(GameBreadcrumb, {
            props: { icon: '🟦', title: 'Tetris' },
        })
        expect(html).toMatch(/font-mono/)
        expect(html).toContain('border-cetus-hairline')
        expect(html).not.toMatch(/text-cyan-400/)
    })

    it('GameOverlay uses Fraunces + mono score, not Orbitron', async () => {
        const html = await container.renderToString(GameOverlay, {
            slots: { default: 'Score: 100' },
        })
        expect(html).not.toMatch(/font-orbitron/)
        expect(html).not.toMatch(/text-cyan-400/)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/components/games/wrappers.test.ts`
Expected: FAIL — wrappers still use `font-orbitron`/`text-holographic`/`text-cyan-400`; GamePage has no `controls` slot or overlay props.

- [ ] **Step 3: Enhance GamePage.astro — add controls slot + overlay props**

In `src/components/games/GamePage.astro`:

1. Add to Props interface: `overlayTitle?: string`, `overlayButtonText?: string`.
2. Destructure: `overlayTitle = 'Game Over'`, `overlayButtonText = 'Play Again'`.
3. Replace the hardcoded `<GameControls gameId={gameId} />` (line 62) with a conditional:

```astro
{Astro.slots.has('controls') ? (
  <slot name="controls" />
) : (
  <GameControls gameId={gameId} />
)}
```

4. Wrap the slot in a named slot tag. Astro slot syntax for conditional rendering requires a `<slot name="controls" />` element.

5. Replace the hardcoded `<GameOverlay>` (lines 74-76) to forward the new props:

```astro
<GameOverlay defaultTitle={overlayTitle} buttonText={overlayButtonText}>
  <slot name="final-stats" />
</GameOverlay>
```

6. Verify GameOverlay accepts `defaultTitle` and `buttonText` props — read `src/components/GameOverlay.astro` to confirm the prop names match. If they differ, adjust the prop names in GamePage to match GameOverlay's actual interface.

- [ ] **Step 4: Restyle GameTitle.astro**

In `src/components/games/GameTitle.astro`:
1. Replace `text-5xl font-orbitron font-bold text-holographic` on the `<h2>` → `text-4xl md:text-5xl cetus-wordmark cetus-wordmark--glow` with inline `style="font-family: var(--cetus-display-font); font-weight: var(--cetus-display-weight); font-style: var(--cetus-display-style);"`.
2. Replace description `text-gray-400` → `text-cetus-ink-muted`.

- [ ] **Step 5: Restyle GameBreadcrumb.astro**

In `src/components/games/GameBreadcrumb.astro`:
1. Replace `text-cyan-400 text-sm` → `font-mono text-xs tracking-wide text-cetus-accent`.
2. Replace `border-slate-700/50` → `border-cetus-hairline`.
3. Prefix the title with `▸ ` for the HUD kicker style.

- [ ] **Step 6: Restyle GameStats.astro**

In `src/components/games/GameStats.astro`:
1. Ensure Card uses `cetus-surface`/`cetus-hairline` (inherits from T2 Card retint).
2. Replace stat badges: add `font-mono` + `text-cetus-accent` to Score/Time/Level readouts. Replace `text-cyan-400` → `text-cetus-accent`.

- [ ] **Step 7: Restyle GameControls.astro**

In `src/components/games/GameControls.astro`:
1. Card variant inherits T2 retint. No structural change.
2. Replace `text-cyan-400` → `text-cetus-accent` if present.

- [ ] **Step 8: Restyle GameOverlay.astro**

In `src/components/GameOverlay.astro`:
1. Replace title `text-4xl font-orbitron font-bold text-cyan-400` → `text-3xl cetus-wordmark cetus-wordmark--glow` with inline `style="font-family: var(--cetus-display-font); font-weight: var(--cetus-display-weight); font-style: var(--cetus-display-style);"`.
2. Replace final score `text-holographic font-bold` → `font-mono text-2xl text-cetus-accent`.
3. Replace any remaining `text-cyan-400` → `text-cetus-accent`.
4. Keep backdrop `bg-black/90`.

- [ ] **Step 9: Run full test suite**

Run: `bun run test:run`
Expected: All tests pass.

- [ ] **Step 10: Lint changed files**

Run: `bun run lint`

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(L3a): game wrapper enhancements + abyssal restyle

- GamePage: add controls override slot + overlayTitle/overlayButtonText props
- GameTitle: Fraunces + cetus-wordmark--glow
- GameBreadcrumb: mono kicker + cetus-hairline
- GameStats: font-mono badges + cetus-accent
- GameControls: inherits Card retint
- GameOverlay: Fraunces + font-mono score"
```

---

### Task 4: L3b Game Page Refactors (14 pages)

**Files:**
- Modify: `src/pages/tetris/index.astro` (proof-of-concept, refactor first)
- Modify: `src/pages/bubble-shooter/index.astro`
- Modify: `src/pages/memory-matrix/index.astro`
- Modify: `src/pages/quick-math/index.astro`
- Modify: `src/pages/word-scramble/index.astro`
- Modify: `src/pages/reflex/index.astro`
- Modify: `src/pages/sudoku/index.astro`
- Modify: `src/pages/bejeweled/index.astro`
- Modify: `src/pages/path-navigator/index.astro`
- Modify: `src/pages/evader/index.astro`
- Modify: `src/pages/2048/index.astro`
- Modify: `src/pages/snake/index.astro`
- Modify: `src/pages/circuit-hacker/index.astro` (uses controls override slot)
- Modify: `src/pages/satellite-sync/index.astro`
- Test: `src/pages/game-board-markup.test.ts`

**Interfaces:**
- Consumes: Enhanced `GamePage` from T3 (gameId/icon/title/description props, game-board/additional-stats/game-info/bottom-info/final-stats/game-script/controls slots, overlayTitle/overlayButtonText props)
- Produces: 14 game pages using `GamePage` wrapper instead of inline-duplicated AppLayout + breadcrumb + title + sidebar markup.

- [ ] **Step 1: Write test asserting GamePage adoption**

Update `src/pages/game-board-markup.test.ts` — add tests verifying pages import GamePage:

```typescript
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const games = [
    'tetris', 'bubble-shooter', 'memory-matrix', 'quick-math',
    'word-scramble', 'reflex', 'sudoku', 'bejeweled',
    'path-navigator', 'evader', '2048', 'snake',
    'circuit-hacker', 'satellite-sync',
]

describe('Game pages use GamePage wrapper', () => {
    for (const game of games) {
        it(`${game} imports and uses GamePage`, () => {
            const src = readFileSync(
                resolve(process.cwd(), `src/pages/${game}/index.astro`),
                'utf-8'
            )
            expect(src).toContain("GamePage")
            expect(src).toContain('slot="game-board"')
            // Should NOT import AppLayout directly anymore
            expect(src).not.toMatch(/import AppLayout/)
        })
    }
})
```

Keep the existing assertions about Reflex/Evader game-status visibility and Circuit Hacker canvas/difficulty-select.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/pages/game-board-markup.test.ts`
Expected: FAIL — game pages still import AppLayout directly.

- [ ] **Step 3: Refactor tetris as proof-of-concept**

Read `src/pages/tetris/index.astro` (205 lines). Identify the inline-duplicated chrome: AppLayout import + opening tag, breadcrumb bar, title block, two-column flex wrapper, sidebar Card sections, GameOverlay. Replace ALL of this with:

```astro
---
import GamePage from '@/components/games/GamePage.astro'
import Card from '@/components/ui/Card.astro'
// Keep ONLY game-specific imports (game init, any unique UI)
---

<GamePage
  gameId="tetris"
  title="Tetris Challenge"
  description="Stack falling blocks and clear lines in this timeless puzzle."
  icon="🟦"
>
  <!-- Board mount point -->
  <div slot="game-board"
       id="game-board"
       class="border-2 border-cetus-hairline bg-black/50 rounded-lg"
       style="width:300px;height:600px;">
  </div>

  <!-- Sidebar: how-to-play -->
  <div slot="game-info">
    <Card variant="glass" class="p-6">
      <h3 class="font-mono text-sm tracking-wide text-cetus-accent mb-3">▸ HOW TO PLAY</h3>
      <!-- ... keep existing how-to-play content, retint text-gray-400 → text-cetus-ink-muted ... -->
    </Card>
  </div>

  <!-- Init script -->
  <script slot="game-script">
    // ... keep existing init code verbatim ...
  </script>
</GamePage>
```

**Key rules for EVERY game refactor:**
1. Replace `import AppLayout` with `import GamePage` (+ Card if sidebar cards are kept).
2. Move the board `<div id="game-board">` into `slot="game-board"`.
3. Move sidebar cards (How to Play, Controls, Scoring, etc.) into `slot="game-info"`.
4. Move the init `<script>` into `slot="game-script"`.
5. Keep ALL game-specific IDs, classes on the board container, and init logic **verbatim** — only the wrapping chrome changes.
6. Retint any remaining `text-cyan-400` → `text-cetus-accent`, `text-gray-400` → `text-cetus-ink-muted`, `border-cyan-400/50` → `border-cetus-hairline`, `shadow-glow-cyan` → remove (abyssal provides atmosphere).

- [ ] **Step 4: Verify tetris works — run full suite + browser check**

Run: `bun run test:run`
Then start dev server if not running and navigate to `localhost:4325/tetris`. Verify:
- Game board renders
- Start button works
- `window.tetrisGame` debug access still works (check browser console)

If broken, fix before proceeding.

- [ ] **Step 5: Commit tetris proof-of-concept**

```bash
git add -A
git commit -m "refactor(L3b): tetris page uses GamePage wrapper (proof-of-concept)"
```

- [ ] **Step 6: Refactor remaining 13 game pages**

Apply the same pattern from Step 3 to each game. Key per-game differences:

| Game | Special handling |
|------|-----------------|
| **bubble-shooter** | Standard refactor. Board size 480×640. |
| **memory-matrix** | DOM-based game (not canvas). Board container is a grid div. Standard refactor. |
| **quick-math** | Text-based game. Board area is a display div. Standard refactor. |
| **word-scramble** | Standard refactor. Board area is a text display. |
| **reflex** | PixiJS canvas. Standard refactor. Keep `game-status` hidden div. |
| **sudoku** | DOM-based grid (450×450). Has number pad UI — put in `game-info` slot. |
| **bejeweled** | PixiJS canvas. Standard refactor. |
| **path-navigator** | PixiJS canvas. Standard refactor. |
| **evader** | PixiJS canvas. Standard refactor. Keep `game-status` hidden div. |
| **2048** | DOM-based tile grid. Standard refactor. |
| **snake** | PixiJS canvas. Standard refactor. |
| **circuit-hacker** | **Uses controls override slot.** Has `stop-btn` instead of `end-btn`, difficulty `<select>`, custom overlay stats. Use `<div slot="controls">` for custom buttons, `<div slot="final-stats">` for custom overlay. Pass `overlayTitle="CIRCUIT POWERED!"`. |
| **satellite-sync** | PixiJS canvas. Standard refactor. |

For each page: read the current file, identify the inline chrome, replace with GamePage wrapper, keep game-specific markup/logic, retint remaining hardcoded colors.

- [ ] **Step 7: Run full test suite + game-board-markup tests**

Run: `bun run test:run`
Expected: All tests pass, including the new GamePage adoption tests.

- [ ] **Step 8: Lint changed files**

Run: `bun run lint`

- [ ] **Step 9: Browser sanity check — spot-check 3-4 games**

Navigate to tetris, circuit-hacker, sudoku, and one canvas game (e.g., bejeweled) in the browser. Verify:
- Game board renders
- Start/End buttons work
- No console errors
- HUD chrome (breadcrumb kicker, Fraunces title) visible

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(L3b): 13 remaining game pages use GamePage wrapper

All 14 game pages now use the GamePage wrapper instead of inline-duplicated
AppLayout + breadcrumb + title + sidebar markup. Circuit Hacker uses the
controls override slot for its custom stop-btn."
```

---

### Task 5: L4a Auth Pages (Login + Signup)

**Files:**
- Modify: `src/pages/login/index.astro`
- Modify: `src/pages/signup/index.astro`
- Test: `src/pages/auth-pages.test.ts`

**Interfaces:**
- Consumes: Heading with `kicker` prop, Card with `brackets` prop (from T2)

- [ ] **Step 1: Write tests for auth page HUD treatment**

Add to `src/pages/auth-pages.test.ts`:

```typescript
it('login page uses cetus tokens, not Orbitron/holographic', () => {
    expect(loginMarkup).not.toMatch(/font-orbitron/)
    expect(loginMarkup).not.toMatch(/text-holographic/)
    expect(loginMarkup).not.toMatch(/from-cyan-500/)
    expect(loginMarkup).not.toMatch(/to-purple-600/)
})

it('signup page uses cetus tokens, not Orbitron/holographic', () => {
    expect(signupMarkup).not.toMatch(/font-orbitron/)
    expect(signupMarkup).not.toMatch(/text-holographic/)
    expect(signupMarkup).not.toMatch(/from-cyan-500/)
    expect(signupMarkup).not.toMatch(/to-purple-600/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/pages/auth-pages.test.ts`
Expected: FAIL — pages still have `from-cyan-500 to-purple-600` and `font-orbitron`.

- [ ] **Step 3: Retint login page**

In `src/pages/login/index.astro`:
1. Add `theme="abyssal"` is now default (no need to pass it).
2. Replace Heading: use `kicker="AUTH · LOGIN"` prop if Heading supports it (from T2), or add a `<p class="font-mono text-xs tracking-widest text-cetus-ink-muted uppercase mb-2">▸ AUTH · LOGIN</p>` before the heading.
3. Replace Google button inline gradient: `bg-gradient-to-r from-cyan-500 to-purple-600 ... shadow-lg shadow-purple-500/25 hover:from-cyan-400 hover:to-purple-500 ... transform hover:scale-105` → use `Button variant="primary"` component or `bg-cetus-accent text-cetus-surface hover:bg-cetus-accent/90` classes.
4. Replace error box: `bg-red-500/20 border border-red-400/30 rounded-lg text-red-400` → `bg-cetus-accent-3/10 border border-cetus-accent-3/30 rounded-lg text-cetus-accent-3`.
5. Replace `text-gray-400` → `text-cetus-ink-muted`.
6. Replace `text-cyan-400 hover:text-cyan-300` → `text-cetus-accent hover:text-cetus-accent/80`.
7. Replace `border-t border-slate-600` → `border-t border-cetus-hairline`.
8. Remove the 🌐 emoji from the Google button — use a plain text "Continue with Google" (the auth test checks for this exact text).

- [ ] **Step 4: Retint signup page**

Apply the exact same class swaps as Step 3 to `src/pages/signup/index.astro`. The two files are near-identical — same pattern, different label text ("CREATE ACCOUNT" / "Create account with Google").

- [ ] **Step 5: Run full test suite**

Run: `bun run test:run`
Expected: All tests pass.

- [ ] **Step 6: Lint + commit**

```bash
bun run lint
git add -A
git commit -m "feat(L4a): auth pages HUD treatment — cetus tokens, mono kickers"
```

---

### Task 6: L4b Dashboard + Sub-components

**Files:**
- Modify: `src/pages/dashboard/index.astro`
- Modify: `src/components/DailyMissionsPanel.astro`
- Modify: `src/components/LoginRewardModal.astro`

**Interfaces:**
- Consumes: Retinted Heading, Card, Badge, Button (from T2)

- [ ] **Step 1: Retint dashboard page**

In `src/pages/dashboard/index.astro`:
1. Duplicate bg block already deleted in T1.
2. Replace Heading variant="hero": use `kicker="COMMAND CENTER"` prop.
3. Replace quick-nav buttons: `text-cyan-400` → `text-cetus-accent`.
4. Replace game history rows: `bg-gray-800/30 rounded-lg border border-gray-700/50 hover:border-cyan-400/30` → `bg-cetus-surface rounded-lg border border-cetus-hairline hover:border-cetus-accent/30`.
5. Replace icon tiles: `bg-gradient-to-r from-cyan-400 to-purple-500 rounded-lg` → `bg-cetus-accent/20 rounded-lg`.
6. Replace scores: `text-cyan-400` → `font-mono text-cetus-accent`.
7. Replace pagination: `bg-cyan-500/20 border border-cyan-400/50` → `bg-cetus-accent/10 border border-cetus-accent/30`.
8. Replace `text-gray-400/500` → `text-cetus-ink-muted`.
9. Replace emoji game icons if present in history rows — keep them (emoji in data context is acceptable per spec decision).

- [ ] **Step 2: Retint DailyMissionsPanel.astro**

In `src/components/DailyMissionsPanel.astro`:
1. Replace header: `text-lg font-orbitron font-bold text-cyan-400` → Fraunces inline style + `text-cetus-accent`.
2. Replace XP bar: `from-cyan-500 to-purple-600` → `bg-cetus-accent`.
3. Replace challenge rows: `bg-gray-800/30 border-gray-700/50` → `bg-cetus-surface border border-cetus-hairline`.
4. Replace difficulty colors: green/yellow/red → `text-cetus-accent` / `text-cetus-accent-2` / `text-cetus-accent-3`.
5. Replace 🔥 streak emoji — keep it (interactive context).
6. Replace refresh toast: `bg-gray-900/95 border-cyan-500/30` → `bg-cetus-surface border-cetus-hairline`.

- [ ] **Step 3: Retint LoginRewardModal.astro**

In `src/components/LoginRewardModal.astro`:
1. Replace card body: `from-gray-900/95 to-gray-800/95` → `bg-cetus-surface border border-cetus-hairline`.
2. Replace title: `font-orbitron` → Fraunces inline style. Add mono kicker `▸ DAILY REWARD`.
3. Replace 7-day calendar day-state CSS vars: claimed days → `cetus-accent` glow, current day → `cetus-accent-2` (amber) pulse ring.
4. Replace claim button: `from-cyan-500 to-purple-600` → `bg-cetus-accent`.
5. Replace all hardcoded `rgba(168,85,247,...)` (purple) → `var(--cetus-accent-3)` or `var(--cetus-accent)`.

- [ ] **Step 4: Run full test suite + lint + commit**

```bash
bun run test:run
bun run lint
git add -A
git commit -m "feat(L4b): dashboard HUD treatment + DailyMissionsPanel + LoginRewardModal retint"
```

---

### Task 7: L4c Profile Pages

**Files:**
- Modify: `src/pages/profile/index.astro` (1396 lines)
- Modify: `src/pages/profile/[username]/index.astro`

**Interfaces:**
- Consumes: Retinted Heading, Card, Badge, Avatar, Button (from T2)

- [ ] **Step 1: Retint profile/index.astro**

This is the largest single migration. The 1396-line file has inline forms, a Cropper.js modal, and a ~700-line script. **Only class strings change — no logic changes.**

In `src/pages/profile/index.astro`:
1. Duplicate bg block already deleted in T1.
2. Replace Heading variant="hero": use `kicker="OPERATOR PROFILE"`.
3. Replace avatar ring: `bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full shadow-lg shadow-cyan-400/25` → `bg-cetus-accent/20 rounded-full ring-2 ring-cetus-accent/40`.
4. Replace display name: `font-orbitron font-bold text-holographic` → Fraunces inline style + `cetus-wordmark--glow`.
5. Replace edit input: `font-orbitron font-bold text-xl` → `text-xl font-semibold` (Inter).
6. Replace Badge variant="success" text "Space Explorer 🚀" — keep emoji, Badge inherits T2 retint.
7. **Activity heatmap intensity scale**: replace `bg-cyan-500/10`, `bg-cyan-500/30`, `bg-cyan-400/60`, `bg-cyan-300` → `bg-cetus-accent/10`, `bg-cetus-accent/30`, `bg-cetus-accent/60`, `bg-cetus-accent` (teal family).
8. Replace heatmap container: `bg-gray-800/60` → `bg-cetus-surface`.
9. Replace year nav: `border border-gray-600/50` → `border border-cetus-hairline`.
10. Replace quick stats numbers: `text-2xl font-bold text-white` → `text-2xl font-mono font-bold text-cetus-accent`.
11. Replace `text-gray-400` everywhere → `text-cetus-ink-muted`.
12. Replace `text-gray-300` → `text-cetus-ink`.
13. **Crop modal**: `bg-gray-900 rounded-lg border border-cyan-400/30` → `bg-cetus-surface rounded-lg border border-cetus-hairline`. Title `font-orbitron ... text-holographic` → Fraunces inline style. Apply/cancel buttons → `cetus-accent` tokens.
14. Hover upload overlay: `bg-black/50` stays (it's a darkening overlay).

- [ ] **Step 2: Retint profile/[username]/index.astro**

Apply the same class swaps. This page is simpler (492 lines, no forms/crop modal):
1. Replace Heading: `kicker="OPERATOR PROFILE"`.
2. Replace avatar, stats, recent activity rows using same patterns as Step 1.
3. Replace `bg-gray-800/30 ... border-gray-700/50` rows → `bg-cetus-surface border border-cetus-hairline`.

- [ ] **Step 3: Run full test suite + lint + commit**

```bash
bun run test:run
bun run lint
git add -A
git commit -m "feat(L4c): profile pages HUD treatment — heatmap retint, avatar tokens, crop modal"
```

---

### Task 8: L4d Leaderboard + Achievements + Challenges

**Files:**
- Modify: `src/pages/leaderboard/index.astro`
- Modify: `src/pages/achievements/index.astro`
- Modify: `src/pages/challenges/index.astro`

**Interfaces:**
- Consumes: Retinted Heading, Card, Badge, Select, Pagination, Avatar (from T2)

- [ ] **Step 1: Retint leaderboard page**

In `src/pages/leaderboard/index.astro`:
1. Local `.holographic-text` style already deleted in T1. Replace the `<span class="holographic-text">` with Fraunces heading + `cetus-wordmark--glow`. Use `kicker="RANKINGS"` on Heading.
2. Replace trophy tile: `bg-gradient-to-r from-cyan-400 to-purple-500` → `bg-cetus-accent/20`.
3. Replace category gradients: `from-purple-500 to-pink-500` → `text-cetus-accent-3`; `from-red-500 to-orange-500` → `text-cetus-accent-2`; `from-green-500 to-teal-500` → `text-cetus-accent`; `from-blue-500 to-cyan-500` → `text-cetus-accent`.
4. Replace rank medals: keep gold/silver/bronze colors (semantic). Restyle circles with `font-mono` rank numbers.
5. Replace entry rows: `bg-gray-800/50 rounded-lg border border-gray-700/50` → `bg-cetus-surface rounded-lg border border-cetus-hairline`.
6. Replace scores: `text-cyan-400` → `font-mono text-cetus-accent`.

- [ ] **Step 2: Retint achievements page**

In `src/pages/achievements/index.astro`:
1. Duplicate bg block already deleted in T1.
2. Replace Heading: use `kicker="ACHIEVEMENT LOG"`.
3. Replace 3-stat summary: `text-cyan-400` → `text-cetus-accent`; `text-purple-400` → `text-cetus-accent-3`; `text-pink-400` → `text-cetus-accent-3`.
4. Replace quick-nav buttons: `text-cyan-400` → `text-cetus-accent`.
5. Replace filter bar: `bg-gray-900/30 ... border-cyan-400/20 backdrop-blur-md` → `bg-cetus-surface border border-cetus-hairline backdrop-blur-md`.
6. Replace achievement card headers: `font-orbitron font-bold` → Fraunces inline style.
7. Replace rarity glow colors: legendary=yellow → `text-cetus-accent-2`; epic=purple → `text-cetus-accent-3`; rare=blue → `text-cetus-accent`; common=gray → `text-cetus-ink-muted`. Map via the existing `getRarityGlow()` / `getRarityColor()` helper functions in `src/lib/achievements` — update the color maps there, not inline.
8. Replace dynamic Tailwind classes `from-${color}-500/10` — these constructed strings may not be in Tailwind's content scan. Replace with static conditional classes mapped to cetus tokens. If the current approach uses a safelist, verify the safelist includes the new token classes.
9. Remove `console.log` debug statements (lines 57-58 approximately).

- [ ] **Step 3: Retint challenges page**

In `src/pages/challenges/index.astro`:
1. Replace Heading: use `kicker="DAILY MISSIONS"`.
2. Replace 4 stat card numbers: `text-cyan-400` / `text-purple-400` / `text-orange-400` / `text-green-400` → `text-cetus-accent` / `text-cetus-accent-3` / `text-cetus-accent-2` / `text-cetus-accent`.
3. Replace level progress bar: `bg-gray-800/50 rounded-full h-4` + `bg-gradient-to-r from-cyan-500 to-purple-600` → `bg-cetus-surface rounded-full h-4` + `bg-cetus-accent`.
4. Replace challenge card borders: `bg-gray-800/30 ... border-gray-700/50` → `bg-cetus-surface border border-cetus-hairline`.
5. Replace progress bars: `bg-gray-700/50` → `bg-cetus-surface`; `bg-cyan-500` → `bg-cetus-accent`; `bg-green-500` → `bg-cetus-accent`.
6. Replace completed card: `border-green-500/30 bg-green-500/5` → `border-cetus-accent/30 bg-cetus-accent/5`.
7. Replace XP/level numbers: add `font-mono`.

- [ ] **Step 4: Run full test suite + lint + commit**

```bash
bun run test:run
bun run lint
git add -A
git commit -m "feat(L4d): leaderboard + achievements + challenges HUD treatment"
```

---

### Task 9: L4e Settings

**Files:**
- Modify: `src/pages/settings.astro`
- Modify: `src/layouts/AppLayout.astro` (themeInitScript update)

**Interfaces:**
- Consumes: Retinted Heading, Card, Toggle, Slider (from T2)

- [ ] **Step 1: Retint settings page + retire dark mode toggle**

In `src/pages/settings.astro`:
1. Duplicate bg block already deleted in T1.
2. Replace Heading: use `kicker="SYSTEM CONFIG"`.
3. Replace section headers: `text-lg font-orbitron font-bold text-cyan-400` → Fraunces inline style + bracket notation. Change "🔊 Sound" → `[ SOUND ]`, "🎨 Display" → `[ DISPLAY ]`, "🔔 Notifications" → `[ NOTIFICATIONS ]`, "👤 Account" → `[ ACCOUNT ]`. (Remove emoji from headers — bracket notation replaces them.)
4. **Remove the Dark Mode toggle** (lines 135-143 approximately). The `.theme-abyssal` scope unconditionally sets dark values — the toggle is vestigial. Keep the Reduced Motion toggle.
5. Replace destructive Button (delete account) — inherits T2 retint.
6. Replace toast: `bg-green-500` → `bg-cetus-accent`; `bg-red-500` → `bg-cetus-accent-3`. These are built in the inline JS — update the class strings there.
7. Replace `text-gray-400` → `text-cetus-ink-muted`.

- [ ] **Step 2: Update AppLayout themeInitScript**

In `src/layouts/AppLayout.astro`, the `themeInitScript` (lines 26-54) reads `display.theme` from localStorage and toggles `.dark`. Since dark mode is now always-on:
1. Simplify the script to always add `.dark` to `document.documentElement` (or remove the theme-reading logic entirely).
2. Keep the try/catch structure for safety.

```javascript
const themeInitScript = `
  (function () {
    try {
      document.documentElement.classList.add('dark')
    } catch (e) {}
  })()
`
```

- [ ] **Step 3: Run full test suite + lint + commit**

```bash
bun run test:run
bun run lint
git add -A
git commit -m "feat(L4e): settings HUD treatment + retire dark mode toggle

- Remove vestigial Dark Mode toggle (abyssal is always dark)
- Simplify themeInitScript to always add .dark
- Section headers use bracket notation [ SOUND ] etc."
```

---

### Task 10: L5 Global Overlays

**Files:**
- Modify: `src/components/AchievementAward.astro`
- Modify: `src/components/ChallengeComplete.astro`
- Modify: `src/components/UserDropdown.astro`
- Test: `src/components/AchievementAward.test.ts`

**Interfaces:**
- Consumes: `cetus-*` tokens (from T1)

- [ ] **Step 1: Write test for AchievementAward retint**

Update `src/components/AchievementAward.test.ts` — add:

```typescript
it('uses cetus tokens, not Orbitron or hardcoded cyan', () => {
    // Read source and assert no legacy patterns
    const source = readFileSync(
        resolve(process.cwd(), 'src/components/AchievementAward.astro'),
        'utf-8'
    )
    expect(source).not.toMatch(/font-orbitron/)
    expect(source).not.toMatch(/text-cyan-400/)
    expect(source).not.toMatch(/bg-glass-strong/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/components/AchievementAward.test.ts`
Expected: FAIL — AchievementAward still uses legacy patterns.

- [ ] **Step 3: Retint AchievementAward.astro**

In `src/components/AchievementAward.astro`:
1. Replace title: `font-orbitron text-cyan-400` → Fraunces inline style + `text-cetus-accent`. Change "🏆 ACHIEVEMENT UNLOCKED!" → `▸ ACHIEVEMENT UNLOCKED` (mono kicker style).
2. Replace card template: `bg-glass-strong rounded-2xl border-2` → `bg-cetus-surface rounded-2xl border border-cetus-hairline`.
3. Update rarity color CSS variables in the `<style>` block: legendary=yellow → `var(--cetus-accent-2)`; epic=purple → `var(--cetus-accent-3)`; rare=blue → `var(--cetus-accent)`; common=gray → `var(--cetus-ink-muted)`.
4. Update particle JS colors to match rarity tokens.

- [ ] **Step 4: Retint ChallengeComplete.astro**

In `src/components/ChallengeComplete.astro`:
1. Replace card body: `from-gray-900/95 to-gray-800/95` → `bg-cetus-surface border border-cetus-hairline`.
2. Replace title: `font-orbitron` → Fraunces inline style.
3. Replace XP: `text-cyan-400` → `font-mono text-cetus-accent`.
4. Replace level-up badge: `from-purple-600 to-pink-600` → `bg-cetus-accent-3`.
5. Replace continue button: `bg-cyan-500` → `bg-cetus-accent`.
6. Replace border: `border-cyan-500/30` → `border-cetus-hairline`.

- [ ] **Step 5: Retint UserDropdown.astro**

In `src/components/UserDropdown.astro`:
1. Replace trigger: `from-cyan-500/20 to-purple-600/20 border-cyan-400/30 text-cyan-400 backdrop-blur-sm` → `bg-cetus-surface/50 border border-cetus-hairline text-cetus-accent backdrop-blur-sm`.
2. Replace menu: `bg-slate-900/95 border-cyan-400/30 shadow-cyan-500/25` → `bg-cetus-surface border border-cetus-hairline shadow-cetus-accent/10`.
3. Replace items hover: `hover:bg-cyan-500/10 hover:text-cyan-400` → `hover:bg-cetus-accent/10 hover:text-cetus-accent`.
4. Keep emoji menu icons (👤 ⚙️ 📊 🏆 🎛️ 🚪) — interactive affordance, not structural chrome.

- [ ] **Step 6: Run full test suite + lint + commit**

```bash
bun run test:run
bun run lint
git add -A
git commit -m "feat(L5): global overlays HUD retint — AchievementAward, ChallengeComplete, UserDropdown"
```

---

## Final Verification

After all 10 tasks:

- [ ] **Run full test suite:** `bun run test:run` — all tests pass
- [ ] **Run e2e suite:** `bun run test:e2e` — all e2e pass
- [ ] **Run lint:** `bun run lint` — no new lint errors
- [ ] **Browser sanity — visit every page type:**
  - Homepage (unchanged, verify no regression)
  - Login / Signup
  - Dashboard
  - Profile (self + public)
  - Leaderboard
  - Achievements
  - Challenges
  - Settings
  - 3-4 representative game pages (tetris, circuit-hacker, sudoku, bejeweled)
- [ ] **Verify no `font-orbitron` remains** in any `.astro` file:
  Run: `grep -r 'font-orbitron' src/ --include='*.astro'` — expect 0 matches (or only in the AppLayout font-link fallback branch)
- [ ] **Verify no `text-holographic` remains** in any `.astro` file:
  Run: `grep -r 'text-holographic' src/ --include='*.astro'` — expect 0 matches
- [ ] **Verify no `border-neon` remains** in component/page files:
  Run: `grep -r 'border-neon' src/components/ src/pages/ --include='*.astro'` — expect 0 matches
