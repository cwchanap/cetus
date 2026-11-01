# HPA-179 — Expo app foundation and mobile OAuth: single-PR implementation plan

**Status:** Documentation-only; implementation and native verification have not started (updated 2026-10-31 after [PR #100 design review](https://github.com/cwchanap/cetus/pull/100#issuecomment-6552609545)).
**Issue:** [HPA-179](https://linear.app/cwchanap/issue/HPA-179/scaffold-the-expo-app-with-google-and-apple-sign-in)
**Design:** [Expo shell and native authentication design](../specs/2026-10-31-hpa-179-expo-app-design.md)
**Baseline:** `main` at `5619dad54d5b69f8b71fdbfc49a2ea66b8d892b3`, after merged HPA-393/#99. Reconfirm main HEAD before implementing.

## Delivery rule and scope

**One Linear ticket, ONE PR:** [#100](https://github.com/cwchanap/cetus/pull/100). Keep all implementation and review corrections as commits to **this draft PR**; do not make separate scaffold/auth/EAS PRs. Only mark ready after real acceptance. HPA-182, HPA-425 and HPA-533 separately own native UI/screens, view games and Skia games. No new image art or SFX work.

Already completed: HPA-444 platform-neutral logic, HPA-446 Bun workspaces, HPA-447 shared packages, HPA-379 React UI and HPA-393 app-core/GameScreens. There is no `apps/mobile` yet. **Do not** refactor those packages, introduce a second auth server, add a state store or create new profile endpoints in this ticket.

**Corrected contract:** `POST /api/user/profile` is for updates, not session reads. For user identity use Better Auth `getSession/useSession`; prove API authorization using existing `GET /api/settings` (200 logged in, 401 logged out). Native Google/Apple **browser OAuth** is one path on iOS and Android; native Google client IDs and native Apple `idToken` are deferred unless genuinely necessary.

## Stage 0 — Lock the fixed HTTPS origin, provider setup and compatibility

This is the **critical path**; perform these checks *before* backend auth changes.

- [ ] Choose and provision **one named HTTPS Cloudflare Tunnel with an owned, stable subdomain**, forwarding to local `bun run dev` Astro backend (`localhost:4325`) and the local development DB. This is the selected test backend for the full PR; **no staging deployment exists**. The exact hostname is a human-provided infrastructure value, not an invented URL. Keep the tunnel running for device tests and EAS preview validation; Apple `form_post` callbacks must reach it without Cloudflare Access/Vercel authentication screens.
- [ ] Call that origin `H=https://<fixed-owned-subdomain>`. Set `BETTER_AUTH_URL=H` on the dev backend; register Google redirect `H/api/auth/callback/google` and Apple Services ID/verified return URL `H/api/auth/callback/apple`; set `EXPO_PUBLIC_API_BASE_URL=H` on both mobile platforms and preview builds. Confirm exact origin/paths and reachable HTTPS before writing new auth code. **Never use a rotating Vercel preview deployment URL** or rely on a paid deployment-protection exception for provider callbacks.
- [ ] Start external Apple Developer enrollment / App ID, Services ID, verified domain, Team ID, Key ID, `.p8` setup and EAS project/signing access **now**. Record missing external access in the sign-off ledger at the bottom; secrets stay on the server. Do not manufacture client IDs, signing keys or an EAS project UUID.
- [ ] Verify current *stable* Expo SDK version and choose the documented Expo SDK 57 / NativeWind v5 RC / react-native-css compatible set, including React/React Native. NativeWind RC docs require **`lightningcss@1.30.1`** but root `package.json` currently forces **`1.32.0`**; pin **one root override version proven compatible with both the Expo RC and existing web build**, rather than assuming the current override works. Install with `expo install` and one root `bun.lock`.
- [ ] Record baseline `bun run lint`, `bun run format:check`, `bun run test:coverage`, `bun run turbo run typecheck` and `bun run build` plus representative web auth tests. Note pre-existing failures; do not expand this ticket to unrelated repairs.

**Checkpoint:** fixed HTTPS callback origin reachable, provider registrations/ownership underway and exact compatible dependency versions selected. If external access is absent, keep PR draft and record the blocker in the single ledger.

## Stage 1 — Expo Router workspace and 23-game catalog

Expected app layout (generated Expo template conventions may vary):

~~~text
apps/mobile/
  app/_layout.tsx
  app/(tabs)/_layout.tsx
  app/(tabs)/index.tsx        # Games (shared registry)
  app/(tabs)/leaderboard.tsx  # Placeholder
  app/(tabs)/achievements.tsx # Placeholder
  app/(tabs)/profile.tsx      # Auth state
  app/sign-in.tsx
  src/lib/auth-client.ts
  src/lib/api.ts
  package.json
  app.json (or app.config.ts)
  eas.json
  global.css
  metro.config.js            # Only nativewind/metro wrapper
  eslint.config.js
  tsconfig.json
~~~

- [ ] Scaffold official Expo template using Bun workspaces; keep root `bun.lock`. Add `@cetus/mobile`, Expo Router and the SDK-selected native dependencies. Import **only actual consumers** of `@cetus/shared/games` and `@cetus/api-client/api-client`. Do **not** add speculative `@cetus/games` / `@cetus/app-core` probe imports (`app-core` exports only `.`); HPA-182/HPA-533 verify those when used.
- [ ] Use default `expo/metro-config` for Bun monorepos, with only NativeWind's documented wrapper. No `watchFolders`/`nodeModulesPaths`/`extraNodeModules` or package aliases. Resolve any duplicate React version by choosing compatible workspace React dependencies, not by hiding another copy.
- [ ] Use `cetus://` scheme; confirm bundle IDs with the project owner before registration. **Development builds only; no Expo Go or `exp://` auth origin**. Include four tabs. Games tab lists `GAMES.filter(g => g.isActive)` with real names, categories and difficulty; label unported games honestly and do not make them playable. Other tabs are straightforward placeholders. Profile shows signed-in/anonymous state.
- [ ] Add app scripts `dev`, `typecheck`, `lint`, `test` and a root `mobile:dev` convenience entry, without altering the existing root web/dev/build commands.
- [ ] Add `apps/mobile/eslint.config.js` inheriting workspace rules; ignore generated `.expo/`, `ios/` and `android/` directories. Root `eslint .` must lint mobile source.

**Gate:** development builds boot on iOS simulator and Android emulator, tabs work, all 23 registry entries display, and imports resolve. No game renderer or native UI kit in this ticket.

## Stage 2 — NativeWind/Tailwind 4, dark tokens and minimal tests

- [ ] Pin the tested NativeWind **v5 RC** and `react-native-css` pair, use Tailwind 4, Expo-compatible Metro/PostCSS setup. Reconfirm the root `lightningcss` pin from Stage 0 on **both** native CSS compilation and the web Tailwind build.
- [ ] Mobile deliberately uses the **dark non-abyssal game-page theme**, i.e. shared `:root` plus `.dark`; Orbitron/Inter, not the abyssal Fraunces/JetBrains Mono override. Apply dark appearance through the supported NativeWind/Expo mechanism and inspect actual colors/contrast on iOS and Android.
- [ ] Make `packages/tokens/theme.css` self-contained: move existing `--foreground` light/dark values **unchanged** out of `apps/web/src/styles/global.css` into matching `:root`/`.dark` shared token scopes; `--cetus-ink` must resolve in both web and native. Add **one Vitest source assertion** that every `var(--name)` referenced in `theme.css` is defined in that file (skip CSS comments when parsing). Preserve web light/dark appearance. **No mobile fallback token duplicates**: unsupported CSS-only effects are simply not used on mobile; fix shared color tokens at their source if needed.
- [ ] Load Orbitron and Inter with `expo-font`; hide splash when loaded or failed and fall back to system font on failure. Test manually instead of mocking a trivial font conditional.
- [ ] Add `jest-expo`. Keep **one focused catalog test** asserting all 23 registry games render; defer sign-in error and API adapter tests to Stage 4. **Do not** test Expo Router's own tab semantics or fake SecureStore persistence.
- [ ] Keep native Jest outside root Vitest `test.projects`. Root web/package V8 coverage already excludes `apps/mobile`.

**Gate:** both native builds visibly show the selected theme/fonts and catalog, a real web build has no token regression, and mobile catalog Jest passes.

## Stage 3 — Better Auth server Expo + conditional Apple

**Touch:** `apps/web/src/lib/auth.ts`, small pure `apps/web/src/lib/auth-config.ts` (or equivalent), relevant web auth tests and backend env documentation.

- [ ] Add Better Auth `expo()` server plugin and preserve the current Google provider, mandatory Google credentials, seven-day session and web Google-only login UI. Test browser Google login remains unchanged.
- [ ] Extract only the **pure environment decision** for enabled providers/trusted origins to a small helper accepting explicit env inputs. Keep `betterAuth(...)` a thin singleton call. Test Google-required, Apple none/complete/partial, exact trusted origins and existing web sign-in behavior **without relying on fragile source-string "Google-only" checks**. Do not introduce a general auth configuration framework.
- [ ] Add Apple provider conditionally with Services ID, Team/Key IDs and backend-only `.p8`. Add `jose` as direct dependency. Use the documented **async Apple provider factory** (`apple: async () => ({clientId, clientSecret: await generateAppleClientSecret(...)})`) for fresh ES256 JWTs using the server key; **no top-level await for once-at-startup signing, no static six-month secret**. Omitted Apple credentials keep Google-only web usable; partial credentials fail with actionable validation.
- [ ] Add trusted origins for web origin H, `cetus://` and `https://appleid.apple.com` only; no wildcard/`exp://` branch. For Stage 0's test backend, `BETTER_AUTH_URL=H` must yield Apple and Google callbacks on that same H. Do not modify app API routes or DB tables.

**Gate:** backend boots in Google-only and fully configured Apple mode, tests pass, and registered HTTPS callback paths are reachable; no secret leaves the server.

## Stage 4 — Native browser OAuth and the existing cookie API

- [ ] Create mobile `createAuthClient` from Better Auth React with `expoClient({ scheme:'cetus', storagePrefix:'cetus', storage: SecureStore })`, pointing to the same HTTPS H as the backend. Let the plugin handle secure cookies and deep links.
- [ ] Google and Apple buttons invoke `signIn.social` (browser flow on **both** platforms) and route to Profile/Games; surface rejected/canceled login with a visible error. Identity comes from `getSession/useSession`; `signOut` clears the session. No native provider SDKs, custom redirect parser, other auth backend or new state store.
- [ ] Create **one** mobile `createApiClient({ baseUrl:H, getHeaders, fetchImpl })` instance. `getHeaders` reads `authClient.getCookie()` and adds `Cookie` only when present. **Always use `fetchImpl: (input, init) => fetch(input, { ...init, credentials: 'omit' })`**, following Better Auth's Expo guidance, so the native cookie jar cannot compete with the explicit cookie header. Do not alter shared web API transport.
- [ ] Profile confirms session identity via `getSession` and checks authenticated **`api.getSettings()`**; after sign-out the same protected GET returns 401. `/api/user/profile` stays **POST-only**, with editing left to HPA-182.
- [ ] Add **two focused mobile Jest tests**: sign-in rejection/cancel error presentation, and adapter cookie present/absent + `credentials: 'omit'`. Existing `packages/api-client` tests already cover shared header merging for requests; do not retest every endpoint, mock successful OAuth, or fake SecureStore persistence.
- [ ] Manually exercise real Google **and** Apple OAuth on iOS and Android development builds against H, including restart, rejected/canceled login, API access and sign-out. Record actual evidence in the ledger.

**Gate:** successful real provider login on both platforms, persistent session after restart, protected API GET success, sign-out then 401 and web login regression clear. Missing Apple credentials or tunnel blocks completion.

## Stage 5 — EAS previews and the manual acceptance matrix

- [ ] Configure `eas.json` development, preview and production profiles, and link an **actual** EAS project via `eas init`; verify iOS/Android IDs and signing access. Preview builds use `EXPO_PUBLIC_API_BASE_URL=H` (fixed accessible HTTPS tunnel) and require the tunnel running during tests. This is not the final App Store/Play production backend setup.
- [ ] Build iOS and Android development clients and **both** EAS preview builds. Link real build results only when they exist; don't treat committed `eas.json` as proof.
- [ ] Manual matrix: iOS and Android four-tab navigation, full 23-game catalog, dark colors/fonts, both providers' success/reject/cancel paths, deep-link return, session after restart, authenticated `GET /api/settings` 200 and sign-out 401, and unchanged web Google sign-in. Try one physical device if available.
- [ ] Fill **only the sign-off ledger below** with outcomes/URLs/blockers. Do not create a second worksheet or separate verification-log comment. If posting a PR update, summarize this same ledger rather than starting another tracker.

**Human review:** inspect evidence for fixed-host redirect, manually set cookie and EAS results before moving out of draft.

## Stage 6 — CI, docs, final review

- [ ] Existing `.github/workflows/ci.yml` has **no typecheck step**. Add exactly one `bun run turbo run typecheck` step to the **existing test job**, which covers web/packages and mobile package `typecheck`; add the mobile `jest-expo` command there. Do not add EAS CI, new jobs or duplicate per-package typecheck steps. Existing root `eslint .` will include native sources through the new nested config.
- [ ] Update `README.md` and current developer guide with `apps/mobile` commands, known fixed-tunnel/Google/Apple/EAS setup and the native-versus-web package boundaries. Never commit real keys, test account details or fabricated app identities.
- [ ] Run `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`, `bun run turbo run typecheck`, `bun run test:run`, `bun run test:coverage`, `bun run build`, relevant web auth/Playwright tests, `expo-doctor`, mobile Jest, native bundle smoke and real EAS checks. Preserve existing >=90% web/package coverage.
- [ ] Review changes for web cookie/Google regression, React duplicates, CSS-var resolution, misplaced secrets, unused packages, hardcoded preview hosts and unnecessary abstractions.
- [ ] Once the **single ledger** is populated and external acceptance is real, mark **the same PR #100** ready; keep HPA-179 in its proper Linear state until complete. HPA-182/HPA-533 remain downstream.

## Planned file ownership

| Area | Planned files | Notes |
| --- | --- | --- |
| Expo app | `apps/mobile/app/**`, `src/lib/{auth-client,api}.ts`, app config, `eas.json`, `package.json`, `tsconfig.json` | Native host, catalog, OAuth/session |
| Style and lint | `apps/mobile/global.css`, `metro.config.js` (NativeWind wrapper), `eslint.config.js`, fonts | No duplicated token values |
| Shared/web styling | `packages/tokens/theme.css`, `apps/web/src/styles/global.css`, focused Vitest token-source assertion | Move exactly existing `--foreground` values to shared token source |
| Server auth | `apps/web/src/lib/auth.ts`, small `auth-config.ts`, auth tests, backend dependencies/env docs | One Better Auth server, async Apple config |
| Workspace/CI | root `package.json`, `bun.lock`, `turbo.json` only if needed, `.github/workflows/ci.yml` | Add typecheck and mobile Jest to existing test job |
| Docs | this design + plan, README/guide | Human provider setup and sign-off |

**Excluded:** `@cetus/ui/*.native.tsx`, Skia, 23 game renders, score/retry queue, avatar changes, new API endpoints, database schema, token generator, art/SFX and store publication.

## Single acceptance and sign-off ledger

Record actual commands/device/build links, not a planned pass. A blocked external integration is **not a pass**.

| Evidence | Pass criterion | Status at planning |
| --- | --- | --- |
| HTTPS callback host | Owned fixed tunnel H reachable publicly, Apple/Google callbacks registered | Not provisioned/verified |
| Expo compatibility | Pinned Expo + NativeWind RC + lightningcss; iOS/Android CSS smoke and web build | Not run |
| App shell | 23 shared registry names, all four tabs, no fake playable games | Not run |
| Theme/fonts | Shared `--foreground` resolves; dark palette, Orbitron/Inter on both platforms | Not run |
| Web auth | Google-only browser login and server regression tests pass | Not run |
| Mobile Google | Real iOS+Android login/error/cancel, restart and sign-out | Not run — credentials needed |
| Mobile Apple | Real iOS+Android login/error/cancel on HTTPS H | Not run — Apple developer setup needed |
| Protected API | `GET /api/settings` 200 signed in and 401 signed out, no stale cookie | Not run |
| EAS preview | iOS and Android preview builds successful, real build links | Not run — EAS access needed |
| Test/quality | Mobile 3 focused Jest tests, root tests/coverage, Turbo typecheck, ESLint, web build | Not run |

Provider credentials, signing, fixed DNS/tunnel and device availability are explicit prerequisites, not reasons to claim HPA-179 done early.

## References

- [Expo Bun workspaces](https://docs.expo.dev/guides/monorepos/)
- [NativeWind v5 RC with Expo 57 / lightningcss pin](https://www.nativewind.dev/v5/getting-started/installation)
- [Better Auth Expo cookie `credentials: 'omit'`](https://better-auth.com/docs/integrations/expo)
- [Better Auth Apple async provider and JWT](https://better-auth.com/docs/authentication/apple)
