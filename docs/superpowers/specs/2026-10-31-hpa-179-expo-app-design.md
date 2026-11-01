# HPA-179 — Expo mobile foundation and Google/Apple sign-in: design

**Status:** Proposed; documentation-only draft (2026-10-31). No runtime implementation in this commit.
**Linear:** https://linear.app/cwchanap/issue/HPA-179/scaffold-the-expo-app-with-google-and-apple-sign-in
**Baseline:** `main` at `5619dad54d5b69f8b71fdbfc49a2ea66b8d892b3` (after merged HPA-393/#99).
**Delivery:** One PR for HPA-179. Add implementation as reviewed commits **to this same PR**, never a second PR for this ticket.
**Plan:** [Single-PR implementation plan](../plans/2026-10-31-hpa-179-expo-app-plan.md)

## Problem and outcome

Cetus has an Astro web app and portable game/domain/API packages but no native host. HPA-179 creates the minimal iOS/Android Expo host for later native UI and game-port work: four navigable tabs, a readable registry of 23 games, a working sign-in/sign-out path against **the existing web Better Auth server**, and a proven authenticated API request. It does **not** implement mobile game rendering, complete tab content or native versions of `@cetus/ui`.

The sequence matters: HPA-447 and HPA-393 are Done; HPA-182 (native UI/screens) and HPA-533 (Skia pilot) are blocked by HPA-179. There is no existing `apps/mobile` directory and no other active HPA-179 PR.

## Verified repository contracts (2026-10-31)

- Root Bun 1.3.14 workspace globs `apps/*` and `packages/*`; `apps/web` is the only app. `turbo.json` already defines `build`, `lint`, `typecheck` and `test` (plus web-specific tasks); root `bun.lock` and the hoisted linker are the single dependency baseline.
- `@cetus/shared/games` exports the actual `GAMES` array and `GameID` enum. `@cetus/api-client/api-client` exports `createApiClient({ baseUrl, getHeaders, fetchImpl? })` and typed methods. `@cetus/app-core` exports `useGameSession` and session adapters, but it is not needed for a non-playable catalog.
- `@cetus/ui` presently exports React **web** components, with `react-dom` as a peer. Its native `.native.tsx` counterparts belong to HPA-182; do not import web UI elements in the Expo app merely to assert that all workspace imports resolve.
- `@cetus/tokens/theme.css` is the CSS-only semantic token source; `apps/web/src/styles/global.css` imports it. Its `--cetus-ink` currently references `--foreground` defined **only in web global.css**, so it is not yet self-contained. HPA-179 must make that reference portable without changing current web colors. No token generator.
- `apps/web/src/lib/auth.ts` configures Better Auth with Google, a Turso-backed SQLite dialect and 7-day sessions. It currently sets `trustedOrigins` only to the web base URL and has no Expo plugin or Apple provider. `apps/web/src/lib/auth-client.ts` remains the separate browser client.
- `apps/web/src/middleware.ts` calls `auth.api.getSession({headers: request.headers})` and sets `locals.user`. All protected API routes use that session. `GET /api/settings` requires a user and returns data, making it a safe auth verification endpoint.
- **Important correction to Linear acceptance text:** `/api/user/profile` implements **POST only** and returns a success message, not the signed-in user. Session identity is read using Better Auth's `getSession/useSession`, and the existing `GET /api/settings` proves the native cookie also reaches protected app APIs. Do not add a speculative `GET /api/user/profile`.
- Root Vitest enumerates the web and package test projects; Jest/`jest-expo` mobile tests stay separate. Existing CI gates lint, format, web/package Vitest coverage and web build, **but has no typecheck step**; add one `bun run turbo run typecheck` step in HPA-179. Draft PR jobs currently skip validation.

## Decision record

### 1. A thin Expo host, not a second backend

Add `apps/mobile` with Expo Router and four tabs: Games, Leaderboard, Achievements and Profile. The Games tab lists `GAMES.filter(game => game.isActive)`, showing the real game name/category/difficulty; tapping an unported game does not pretend it is playable. The other tabs are honest, accessible placeholders; Profile exposes sign-in/out state and the name/email from `useSession`.

A small `sign-in` route or sheet offers Google and Apple; navigation preserves return-to-Profile/Games, loading and error states. Anonymous users can browse the games registry; no network call is required to render that catalog. HPA-182 owns fully functional leaderboard, achievements, profile/editor and other screens; HPA-425/HPA-533 own game views. No global store, extra navigation abstraction, duplicate DTOs or mock server.

Proposed layout (adjust filenames to Expo Router's generated template conventions, not framework internals):

~~~text
apps/mobile/
  app/
    _layout.tsx
    sign-in.tsx
    (tabs)/
      _layout.tsx
      index.tsx          # Games catalog (shared registry)
      leaderboard.tsx    # Placeholder
      achievements.tsx   # Placeholder
      profile.tsx        # Auth/session proof
  src/
    lib/
      auth-client.ts     # Better Auth Expo client
      api.ts             # Existing API client bound to cookie + origin
    components/          # Only tiny native shell-specific components
  assets/fonts/          # Only if font packages cannot bundle fonts directly
  app.json or app.config.ts
  eas.json
  global.css
  package.json
  tsconfig.json
~~~

Use the current **stable Expo SDK supported by the chosen native dependencies**, with Expo Router and React/React Native versions selected by `expo install`. As of this plan, Expo SDK 57 is the published target tested by NativeWind's Tailwind 4 release candidate. Keep a single compatible React instance across the Bun workspace; if Expo's pinned React minor conflicts with web's `react@^19.3.1`, align versions in this same PR and run web regressions, rather than hiding duplicate React installations.

### 2. Metro and cross-workspace resolution: minimum configuration

Expo SDK 52+ automatically handles Bun workspaces using `expo/metro-config`. Start with Expo's standard Metro config and **do not** add legacy `watchFolders`, `nodeModulesPaths`, `extraNodeModules` or disable package exports. Wrap Metro only for the NativeWind v5 integration. Test the **real shell imports** (`@cetus/shared/games` and `@cetus/api-client/api-client`), not contrived imports of `@cetus/games` or `@cetus/app-core` without a runtime consumer. The latter are verified when HPA-182/HPA-533 actually use them (note that `@cetus/app-core` exports only `.`). `@cetus/ui` is web React and its native variants are HPA-182's responsibility. Verify a single React instance across hoisted workspaces. No duplicate package code.
### 3. Styling, tokens and fonts: one self-contained dark theme

The web already uses Tailwind 4. NativeWind **v4 stable** uses Tailwind 3, while **v5 RC** supports Tailwind 4. Use a pinned, mutually compatible Expo SDK 57 + NativeWind v5 RC + react-native-css set after smoke-testing both platforms. This is an explicit pre-release compromise for a hobby app, not a reason to maintain two styling systems. **Compatibility gate:** root `package.json` currently overrides `lightningcss` to `1.32.0`, while NativeWind v5 RC documentation calls for `1.30.1`. Resolve to one tested root version and confirm **both** Expo styles and the existing web Tailwind build before coding screens; do not leave a silently incompatible global override.

The native shell uses the **dark non-abyssal game-page palette**, from shared `:root` plus `.dark` variables, consistently with **Orbitron and Inter**. Do **not** apply `.theme-abyssal`: its Fraunces/JetBrains Mono typography and rich effects are not the mobile shell target. Import the shared `@cetus/tokens/theme.css` from the minimal NativeWind v5/ Tailwind 4 `apps/mobile/global.css` and apply dark appearance through the installed NativeWind-supported app/appearance mechanism. Verify contrast and actual variable resolution on iOS and Android.

Make `theme.css` standalone in the implementation: move the **light and dark** `--foreground` declarations from `apps/web/src/styles/global.css` into the corresponding `:root`/`.dark` blocks in `packages/tokens/theme.css`, preserving their exact values and web cascade. This fixes `--cetus-ink: var(--foreground)` without copied mobile fallback values. Add **one** Vitest source assertion that each `var(--x)` referenced in `theme.css` is also declared in that file; keep the web token tests and a screenshot/visual check of web light/dark behavior. If the NativeWind compiler cannot support a specific *web-only* value such as a gradient, simply do not use that token in the native shell; if a supported shared semantic color fails, fix the shared token or mark it web-only, **never add a shadow token copy under apps/mobile**. Avoid generators, universal CSS polyfills and native imitations of pseudo-elements.

Use `expo-font` to load Orbitron and Inter, with a straightforward splash timeout/failure fallback to system fonts; verify on device, no mocked font-fallback test. HPA-182 owns complete native components and visual parity.
### 4. One Better Auth server; two clients, one fixed HTTPS callback host

**Critical-path environment choice:** use a **named HTTPS Cloudflare Tunnel on an owned, fixed subdomain** forwarding to the existing local Astro + database development environment (`bun run dev` / port 4325). Provision/verify that hostname **in Stage 0**, before writing the backend OAuth integration; the exact name is an external setup input, **not provisioned by this plan**. Use the **same origin H** for:

- `BETTER_AUTH_URL=H` (the auth server callback base);
- `EXPO_PUBLIC_API_BASE_URL=H` (both native platforms and EAS preview testing);
- Google OAuth redirect `H/api/auth/callback/google`;
- Apple Services ID registered return URL `H/api/auth/callback/apple` (including the matching verified domain).

Keep the tunnel running during OAuth/EAS preview checks, ensure provider callbacks reach the backend without an interactive access login, and use the **local dev database**, not production data. **No separate staging deployment exists**, and rotating per-commit Vercel preview URLs or Deployment Protection are unsuitable as default callback endpoints. A production/long-lived backend will be configured separately before the store release ticket; this fixed test tunnel is for HPA-179 acceptance.

Extend `apps/web/src/lib/auth.ts` with Better Auth `expo()` server plugin. Keep current Google credentials and seven-day sessions, and keep web login **Google-only**. Extract only the env-to-configuration decision into a small **server-only, pure helper module** (e.g. `apps/web/src/lib/auth-config.ts`) taking explicit env values to choose `socialProviders` and `trustedOrigins`. This is testable without importing/initializing the module-level `betterAuth(...)` singleton and does not create a general auth framework. Remove source-string tests that require the literal "Google-only authentication" message; instead verify Google remains required and the web UI behavior does not change. Apple none/complete/partial env cases and trusted origins are straightforward helper tests.

Enable Apple only with a complete Services ID, Team ID, Key ID and private `.p8` signing key; fail early and clearly for partial config while allowing Google-only local/web environments. Add `jose` as a direct server dependency. **Use Better Auth's documented asynchronous provider factory** (`apple: async () => ({clientId, clientSecret: await generateAppleClientSecret(...)})`), which creates an Apple client-secret JWT on demand using the server-side key. **Do not generate a static six-month token** or use top-level await to sign only once at server startup. Apple rejects long-lived non-HTTPS callbacks. Trust exactly the web auth origin, `cetus://` and Apple's required `https://appleid.apple.com`; no wildcard origins. **Use Expo development builds with `cetus://` only; no Expo Go or `exp://` trusted-origin support** in this ticket.

Create a separate mobile `createAuthClient` (Better Auth React client + `expoClient({scheme:'cetus', storagePrefix:'cetus', storage: SecureStore})`) using that fixed HTTPS H. Google and Apple use `signIn.social({provider, callbackURL})` in the browser on iOS **and** Android, and `useSession`/`getSession` for identity plus `signOut`. Let the plugin handle SecureStore cookies and the deep link; no custom token manager or OAuth callback parser. Native Google SDK/client IDs are deferred unless a browser OAuth test proves necessary. Apple's native ID-token path and bundle-ID audience variation are also deferred. No Supabase Auth, second backend, new session model or extra profile read API.

**Human prerequisite:** Apple Developer enrollment, Services/App IDs, HTTPS domain verification, .p8 Key/Team IDs, and Google redirect registration can require lead time. Start them in Stage 0. Secrets remain on the Astro backend, never in `EXPO_PUBLIC_*` or the app bundle.
### 5. Reuse the existing API client and cookie contract

Create one mobile API client instance from existing `createApiClient`. The Expo guide explicitly recommends avoiding native implicit cookies when setting `Cookie` manually:

~~~ts
import { createApiClient } from '@cetus/api-client/api-client'

// authClient is the mobile Better Auth client with expoClient/SecureStore.
export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  getHeaders: async () => {
    const cookie = await authClient.getCookie()
    return cookie ? { Cookie: cookie } : {}
  },
  fetchImpl: (input, init) => fetch(input, { ...init, credentials: 'omit' }),
})
~~~

The shared client already merges `getHeaders` for both its common request helper **and the score path**. Keep this wrapper mobile-only; no web transport edits, extra interceptors, bearer tokens, retries or a made-up profile endpoint. **One adapter test** checks cookie present/absent and `credentials: 'omit'`. Existing `packages/api-client` tests cover its request header behavior. After sign-in, Better Auth `getSession` confirms user identity and existing `api.getSettings()` proves a protected request succeeds; after sign-out, `api.getSettings()` must return 401 even if a native cookie jar previously held a session. Profile editing remains in HPA-182 via existing POST `api.updateProfile()`.
### 6. App identity, environments and EAS

- Set deep-link scheme `cetus`; propose `com.hapadona.cetus` as iOS bundle ID and Android package ID only after a human confirms ownership/availability. Never invent an EAS project UUID.
- Add `eas.json` with `development` (development client), `preview` (internal distribution) and `production` profiles; link real EAS project with `eas init`. For **HPA-179 preview acceptance**, the API base URL must resolve to the **fixed, reachable HTTPS tunnel origin H** above; it must remain running during tests. No real release/publishing yet.
- Only the origin `EXPO_PUBLIC_API_BASE_URL` is public. Apple keys, Google secret and `BETTER_AUTH_SECRET` stay server-only. Document DNS/Tunnel and Apple/Google registration as **manual prerequisites**, rather than inventing a staging deployment or bypassing a protected Vercel preview.
- Manual EAS preview builds and provider flows are acceptance checkpoints. Do not add recurring paid builds, push notifications, purchases, store listing automation or unrelated signing infrastructure.
### 7. Test and acceptance strategy

Automated: **about three small mobile `jest-expo` tests**—the Games catalog renders all 23 registry names, rejected/canceled sign-in produces a visible error, and a mobile API adapter test checks `Cookie` present/absent plus `credentials: 'omit'`. Do **not** mock Expo Router's own tab behavior, pretend a mocked SecureStore proves restart persistence, test a trivial font loading conditional, or simulate successful provider login (real OAuth acceptance covers it). Keep Jest outside root Vitest; existing root coverage already excludes `apps/mobile`.

Add a native `apps/mobile/eslint.config.js` extending the existing workspace config, ignoring generated `.expo/`, `ios/` and `android/`, so root `eslint .` includes actual app source. CI currently has **no typecheck step**: add **one** `bun run turbo run typecheck` step to the existing CI test job (covering web, packages and mobile), plus the mobile Jest command in that job. Keep the web Vercel build and no EAS-on-PR behavior.

Use the **single sign-off ledger in the implementation plan** for all acceptance evidence (not separate worksheets/logs). Manual on iOS simulator and Android emulator: boot development builds (not Expo Go), confirm four tabs, registry, fonts and dark contrast, successful/failed/canceled Google and Apple OAuth, session after restart, API 200 authenticated and 401 signed out, and deep-link callback on the **fixed H**. Complete both EAS preview builds. Do a physical device smoke if available and verify web Google login is unchanged. OAuth providers, EAS and credentials are real external checks, not mock-only gates.

**Done means:** a tested native shell, authentication on both platforms, protected API parity and two EAS previews; if developer credentials, a stable hostname or signing access are missing, record the blocker in the ledger and **keep the PR draft** rather than claiming completion.
## Non-goals and risks

**Not in this ticket:** `@cetus/ui/*.native.tsx`, full Leaderboard/Achievements/Profile screens, score submission, retries, game rendering/Skia, Reanimated game loops, native avatar uploads, new API endpoints or DB schema, design-system generator, art/SFX or production store submission.

Main risks: NativeWind v5 RC / Tailwind 4 / root `lightningcss` compatibility (explicit version gate and two-platform smoke), duplicate React under hoisting (align versions), external Apple/DNS/Tunnel prerequisites (fixed H selected in Stage 0), and web auth/style regressions (existing tests). No fallback CSS copy, general auth adapter framework or speculative infrastructure.

## Reference documentation (verified 2026-10-31)

- [Expo Bun-workspaces/Metro defaults](https://docs.expo.dev/guides/monorepos/)
- [Better Auth Expo integration, deep links, SecureStore and getCookie](https://better-auth.com/docs/integrations/expo)
- [Better Auth Apple provider, Services ID, HTTPS and signing key](https://better-auth.com/docs/authentication/apple)
- [NativeWind v5 RC and Tailwind CSS 4 installation](https://www.nativewind.dev/v5/getting-started/installation)
