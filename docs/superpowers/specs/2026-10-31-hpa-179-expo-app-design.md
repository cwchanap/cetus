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
- `@cetus/tokens/theme.css` is the CSS-only semantic token source; `apps/web/src/styles/global.css` imports it. Do not add a token generator or modify global web themes to serve the native shell.
- `apps/web/src/lib/auth.ts` configures Better Auth with Google, a Turso-backed SQLite dialect and 7-day sessions. It currently sets `trustedOrigins` only to the web base URL and has no Expo plugin or Apple provider. `apps/web/src/lib/auth-client.ts` remains the separate browser client.
- `apps/web/src/middleware.ts` calls `auth.api.getSession({headers: request.headers})` and sets `locals.user`. All protected API routes use that session. `GET /api/settings` requires a user and returns data, making it a safe auth verification endpoint.
- **Important correction to Linear acceptance text:** `/api/user/profile` implements **POST only** and returns a success message, not the signed-in user. Session identity is read using Better Auth's `getSession/useSession`, and the existing `GET /api/settings` proves the native cookie also reaches protected app APIs. Do not add a speculative `GET /api/user/profile`.
- Root Vitest enumerates the web and package test projects; Jest/`jest-expo` mobile tests should stay separate. The CI workflow gates lint, format, web/package Vitest coverage and web build; it skips these on draft PRs.

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

Expo SDK 52+ auto-detects Bun workspaces through `expo/metro-config`, and modern Metro supports package exports. Start with the generated Metro configuration; do **not** add legacy `watchFolders`, `nodeModulesPaths`, `extraNodeModules` or disable package exports. Customize `metro.config.js` only as required by NativeWind's documented wrapper; test the actual portable exports `@cetus/shared/games`, `@cetus/api-client/api-client`, `@cetus/games` and `@cetus/app-core` in a native bundle. The `@cetus/ui` React web exports are deliberately not a native compatibility target until HPA-182. No shared package code duplication.

### 3. Styling, tokens and fonts: a small preview of the eventual native UI

The web already uses Tailwind 4. NativeWind **v4 stable** uses Tailwind 3 while **v5 RC** supports Tailwind 4; choose the **pinned NativeWind v5 RC + compatible react-native-css release** with Expo SDK 57, smoke-tested on both platforms. This is a conscious pre-release risk for a pre-launch hobby app, not permission to add an abstraction to support both v4/v5.

Create a small `apps/mobile/global.css` following the v5 Tailwind 4 + NativeWind documented imports, then import `@cetus/tokens/theme.css` where its supported semantic variables work. Exercise only simple colors/surfaces/text in HPA-179; rich web gradients, pseudo-elements and backdrop effects are **not** valid native fidelity requirements. If NativeWind cannot compile a specific web CSS variable, keep a minimal mobile-only compatible fallback declared in that stylesheet (documenting the counterpart token); do not rewrite the CSS-only token package or create generated token pipelines. Use `expo-font` with Orbitron and Inter packages/assets, and hold the splash screen until loaded or use system-font fallback on loading failure.

HPA-182 will own the detailed native components/effects and visual parity.

### 4. One Better Auth server; two clients

Extend **`apps/web/src/lib/auth.ts`** with `@better-auth/expo` server `expo()` plugin. Preserve current Google provider, credentials validation, 7-day session and web cookie behavior. Add Apple to `socialProviders` using an Apple Services ID, Team ID, Key ID and server-only `.p8` signing key; generate the client-secret JWT via `jose` per Better Auth's Apple guide. Enable Apple only when complete credentials are provided; incomplete configuration yields an actionable backend configuration error, but a web-only environment without Apple credentials must remain functional. Add narrow `trustedOrigins` for the existing web origin, `cetus://` and Apple's required `https://appleid.apple.com`. Any `exp://` development-only origin must be tightly scoped to dev; no broad production wildcard.

Create a separate mobile `createAuthClient` from `better-auth/react` with the `expoClient({ scheme: 'cetus', storagePrefix: 'cetus', storage: SecureStore })` plugin and an absolute configured HTTPS backend URL. Use `signIn.social({ provider: 'google'|'apple', callbackURL: '/...' })` browser-based OAuth on **both iOS and Android**, then reconcile `getSession` and navigate. Use `useSession` for identity and `signOut` for logout. The Expo plugin owns SecureStore session/cookie persistence and deep-link handling: do not introduce token storage, custom OAuth redirect parsers, a parallel Supabase auth integration or a second account model.

Start with the existing server-side Google OAuth application for the browser-based flow; native Google client IDs or native provider SDKs are **not needed unless a concrete redirect-flow test shows they are required**. Apple's Android sign-in uses the Apple hosted browser/Services ID flow; it is not an Android-native Apple API. Both providers must be manually verified on both platforms before completion. An optional native Apple ID-token path would require separate bundle-ID audience validation; do not build it without evidence.

Apple **does not accept localhost/non-HTTPS callback URLs**. Provider testing must use a real HTTPS backend or tunnel with an Apple Developer-configured callback at `https://<host>/api/auth/callback/apple`; a simulator hitting local HTTP is insufficient for Apple acceptance. Provider secrets stay on the Astro/Vercel backend, never in `EXPO_PUBLIC_*` or EAS public configuration.

Web UI continues to display **Google-only** even though the backend gains Apple support for mobile. Add focused tests that the web login flow, required Google credentials and middleware sessions do not change.

### 5. Reuse the existing API client and cookie contract

Create one mobile API client instance:

~~~ts
import { createApiClient } from '@cetus/api-client/api-client'

export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  getHeaders: async () => {
    const cookie = await authClient.getCookie()
    return cookie ? { Cookie: cookie } : {}
  },
})
~~~

`expoClient`/`expo-secure-store` owns cookie retrieval. The shared API client already merges `getHeaders` on every request; avoid extra interceptors, auth middleware, bearer tokens or a new profile endpoint. On device, use the documented manual `Cookie` header flow. If a native fetch implementation also sends a conflicting cookie automatically, adjust the **mobile** injected `fetchImpl` minimally to suppress automatic credentials; do not change web behavior. After login, call `api.getSettings()` (protected GET) and check session identity with `authClient.getSession()`. Signed-out `getSettings()` should return 401. Future profile editing uses existing `api.updateProfile()` (POST) in HPA-182.

### 6. App identity, environments and EAS

- Set the custom deep-link scheme to `cetus`; propose `com.hapadona.cetus` for both iOS bundle ID and Android package ID, but **verify ownership/availability before registering**. Avoid fake EAS project UUIDs.
- Use `eas.json` with `development` (development client), `preview` (internal distribution) and `production` profiles. Link the real EAS project through `eas init` during implementation. Include normal SDK settings and only necessary native capabilities.
- `EXPO_PUBLIC_API_BASE_URL` holds the public absolute backend origin (never secret); simulator/emulator/device hosts must resolve it, and preview builds use HTTPS. Backend Apple/Google credentials and `BETTER_AUTH_SECRET` stay in Vercel/server environment.
- Document Apple Developer membership, App/Services IDs and HTTPS callback registration plus Google OAuth redirect URI configuration as **human setup requirements**; do not claim external account provisioning is automated by the PR.
- EAS preview builds and provider flows are human acceptance checkpoints. Do not add recurring paid build jobs, push notifications, in-app purchases, app-store listings or release automation to HPA-179.

### 7. Test and acceptance strategy

Automated: `jest-expo` tests for tab navigation/registry rendering, sign-in button success/error/navigation, session sign-out and cookie-header attachment; app `typecheck` and `lint`; root web/package Vitest and >=90% existing coverage gate; web auth tests; both Metro bundles (smoke). Keep the Jest tests **outside** root Vitest projects. Add a mobile Jest command to the existing CI test job (not an EAS matrix) once code exists.

Manual on iOS simulator and Android emulator: launch native development builds, verify Games tab shows all 23 real registry names, switch all four tabs, confirm Orbitron/Inter load, successful and failed/canceled Google and Apple sign-in, persistence after restart, sign-out and authorized `GET /api/settings`. Confirm both EAS preview builds complete and web Google sign-in remains functional. For Apple, use registered HTTPS callbacks and genuine provider credentials; for on-device behavior also check one physical device if available.

**Done means:** an actual tested mobile shell, authenticated API parity and two-platform previews — not merely an Expo template that compiles. Missing third-party credentials/build signing are explicitly reported as blocked verification, not silently marked done.

## Non-goals and risks

**Not in this ticket:** `@cetus/ui/*.native.tsx`, full Leaderboard/Achievements/Profile screens, score submission, retries, game rendering/Skia, Reanimated game loops, native avatar uploads, new API endpoints or DB schema, design-system generator, art/SFX or production store submission.

Main risks with smallest mitigation: pinned NativeWind v5 RC/Tailwind 4/Expo version interaction (two-platform smoke early), duplicate React instances under hoisting (one compatible React version), Apple external HTTPS/credential prerequisites (document and test on staging), and existing web auth regression (focused auth + web suite). No speculative fallback architecture.

## Reference documentation (verified 2026-10-31)

- [Expo Bun-workspaces/Metro defaults](https://docs.expo.dev/guides/monorepos/)
- [Better Auth Expo integration, deep links, SecureStore and getCookie](https://better-auth.com/docs/integrations/expo)
- [Better Auth Apple provider, Services ID, HTTPS and signing key](https://better-auth.com/docs/authentication/apple)
- [NativeWind v5 RC and Tailwind CSS 4 installation](https://www.nativewind.dev/v5/getting-started/installation)
