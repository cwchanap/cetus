# HPA-179 — Expo app foundation and mobile OAuth: single-PR implementation plan

**Status:** Planning-only; no runtime implementation or native build has been performed (2026-10-31).
**Issue:** [HPA-179](https://linear.app/cwchanap/issue/HPA-179/scaffold-the-expo-app-with-google-and-apple-sign-in)
**Design:** [Expo shell + mobile auth design](../specs/2026-10-31-hpa-179-expo-app-design.md)
**Base:** Cetus `main`, SHA `5619dad54d5b69f8b71fdbfc49a2ea66b8d892b3`, after HPA-393 PR #99 merged.

## Delivery rule

**Use ONE PR for this entire Linear ticket.** This initial draft contains the design and plan only. Add the implementation as sequential commits to the **same draft PR**, validate each checkpoint there, then mark that PR ready. Do not create scaffold/auth/EAS follow-up PRs for HPA-179, nor split tickets for its phases. The separate HPA-182, HPA-425, and HPA-533 issues already own native UI, native games, and Skia. No new art or SFX is required for HPA-179.

## Scope boundaries and verified prerequisites

Already merged: HPA-444 platform neutrality, HPA-446 Bun workspaces, HPA-447 portable packages, HPA-379 React UI and HPA-393 app-core/GameScreens. Existing `apps/web` remains authoritative for the API, user database, and Better Auth server. Existing `@cetus/shared/games` owns the 23-game registry. Existing `createApiClient({ baseUrl, getHeaders })` transports authenticated app requests. No `apps/mobile` exists. Do not reopen completed migrations.

**Key correction to issue text:** `/api/user/profile` is a **POST update**, not a GET read. Read identity with Better Auth `getSession/useSession`. Verify that an auth cookie crosses into application APIs via existing protected **GET `/api/settings`**. Avoid adding a new profile GET merely for a smoke test.

Acceptance requires working Google **and** Apple browser-based OAuth on **iOS and Android**, with real credentials and redirect setup; web Google-only sign-in must continue working. Third-party developer credentials and signing privileges are a human prerequisite, not something to fabricate or silently bypass.

## Implementation checkpoints (commits in the same PR)

### Stage 0 — Baseline, compatibility and external setup checklist

- [ ] Reconfirm the head of `main`, installed Expo/Better Auth/NativeWind versions and current mobile compatibility *at implementation time*. Use Expo's supported installation matrix rather than hardcoding guessed dependency versions. Expo SDK 57 + NativeWind v5 RC/Tailwind 4 is the design candidate; pin exact compatible versions after a two-platform smoke.
- [ ] Record baseline `bun run lint`, `bun run format:check`, `bun run test:coverage`, `bun run typecheck`, `bun run turbo run typecheck` and `bun run build`. Note pre-existing failures; do not fix unrelated regressions in this PR.
- [ ] Confirm `GET /api/settings` really returns 401 when anonymous and succeeds with a valid Better Auth session; confirm Google web login tests; inventory `packages/shared` and API client export paths to verify native imports.
- [ ] Capture required human environment actions: Apple Developer membership; iOS App ID, Services ID, Team ID, Key ID, private `.p8`, HTTPS Apple return URL; Google OAuth redirect URI(s); EAS owner/project link and iOS/Android signing access. Identify a reachable HTTPS web/API backend for devices. No secrets in the PR.
- [ ] Define an acceptance worksheet for iOS and Android simulator/emulator plus EAS preview builds. Document what cannot be verified until external credentials are available.

**Human review checkpoint:** agree on the single Expo/NativeWind compatibility set and on the intended Apple/Google browser redirects before making invasive web-auth changes.

### Stage 1 — Native workspace and Expo Router shell

**Create** (exact Expo template-generated names may vary):

~~~text
apps/mobile/
  package.json
  app.json (or app.config.ts)
  tsconfig.json
  app/_layout.tsx
  app/(tabs)/_layout.tsx
  app/(tabs)/index.tsx
  app/(tabs)/leaderboard.tsx
  app/(tabs)/achievements.tsx
  app/(tabs)/profile.tsx
  app/sign-in.tsx
  src/lib/              # small, host-only adapters
~~~

- [ ] Scaffold using official Expo template and `expo install` with Expo Router, React and React Native versions matching the SDK. Use `@cetus/mobile` as workspace package name, and declare only needed `@cetus/shared` and `@cetus/api-client` dependencies at first; import `@cetus/app-core`/`@cetus/games` only when a real native consumer exists. Keep native-only primitives inside `apps/mobile`, not `@cetus/ui`.
- [ ] Install from repo root using Bun, update the **single root** `bun.lock`, and keep Metro on `expo/metro-config` defaults. Do not copy old monorepo `watchFolders`/`nodeModulesPaths`/`extraNodeModules` recipes. Add only NativeWind's documented Metro wrapper when styling is introduced.
- [ ] Verify one React instance and inspect whether Expo's React pin conflicts with web `react@^19.3.1`. If needed, align compatible React versions within this PR and rerun web tests. Avoid aliases that mask duplicate React.
- [ ] Configure scheme `cetus`, human-confirmed bundle IDs and app display name. Do not invent EAS `projectId` or commit private credentials.
- [ ] Add four real Expo Router tabs. Games tab reads active items from `@cetus/shared/games` and lists name, category and difficulty. A game tile clearly says "Coming to mobile" or is non-interactive until its port ticket lands. Leaderboard/Achievements are explicit placeholders. Profile displays anonymous/signed-in states with appropriate navigation.
- [ ] Include a small splash/loading state and an accessible default native layout. No fake leaderboard, static duplicated game list, global state store or navigation framework beyond Expo Router.
- [ ] Confirm Metro resolves `@cetus/shared/games` and `@cetus/api-client/api-client` from the app without aliases. Probe portable game/app-core **subpath** imports only as a compatibility smoke; do not import an unexported package root or pull in Pixi/Astro.
- [ ] Ensure `bun run dev` remains the existing database+web command; add an explicit `mobile:dev` root script or `bun run --cwd apps/mobile start` rather than changing the web default.

**Gate:** iOS and Android dev-bundle builds launch, tab switching works, all 23 registry entries are visible and the web still runs.

### Stage 2 — Minimal native styling and tests

- [ ] Install the compatible pinned NativeWind **v5 RC**/Tailwind 4 set using official configuration; add native `global.css` and a Metro wrapper only as required. Import semantic `@cetus/tokens/theme.css` *only for values supported by native CSS interop*. Do not turn web CSS pseudo-elements, keyframes or gradients into a shared generator.
- [ ] Establish a small mobile-only fallback for any semantic variable that cannot compile. Document which tokens remain visually approximate. No full native card/button redesign: HPA-182 owns `.native.tsx` equivalents and richer effects.
- [ ] Add Orbitron and Inter through the supported `expo-font` workflow. Test successful loading and a sensible failure fallback without leaving the splash permanently visible.
- [ ] Add `jest-expo` and small tests for registry iteration, tab navigation, disabled/unavailable game affordances and font-loading fallback. **Do not add mobile Jest to root Vitest `test.projects`** or pollute the root V8 coverage denominator with untested template/native code.
- [ ] Add scripts `lint`, `typecheck`, `test` and `dev` in `apps/mobile/package.json` and minimal Turbo integration. Keep the existing web `build` entrypoint unchanged; do not make web build depend on producing a mobile APK/IPA.

**Gate:** native styling renders on both platforms with no unsupported CSS crash; mobile tests pass; root lint/format/typecheck still pass.

### Stage 3 — Extend existing Better Auth server, preserve web

**Modify:** `apps/web/src/lib/auth.ts`, `apps/web/src/lib/auth.test.ts` (and necessary env typing/documentation). Leave `apps/web/src/lib/auth-client.ts` and Google-only login UI behavior unchanged.

- [ ] Add `@better-auth/expo` server `expo()` plugin and precise mobile scheme/trusted origins alongside the current web base URL; evaluate any development-only `exp://` requirement explicitly. Avoid wildcard trust of arbitrary schemes/hosts.
- [ ] Configure Apple as an additional **server** social provider only when the complete Apple environment is supplied. Apple Services ID/Team/Key ID + server-only `.p8` signing key yield a JWT client secret via the documented `jose`/provider integration; validate chosen library API at coding time. Do not place an Apple signing key or OAuth client secret in Expo public vars.
- [ ] Retain the existing mandatory Google credential validation, 7-day session and web cookie options. Web login stays Google-only; Apple is offered in mobile.
- [ ] Document backend HTTPS callback registration `/api/auth/callback/apple` and Google OAuth callback(s), together with Vercel environment values and preview backend caveats. Apple sign-in cannot be accepted on localhost alone.
- [ ] Extend targeted unit tests for `expo()` plugin, conditional Apple configuration, trusted origins, missing credential behavior, Google-only web login and `auth.api.getSession` middleware contract. Prefer modest test changes over restructuring the Better Auth server.

**Gate:** existing web Google sign-in remains intact; server starts with just Google credentials; with complete Apple credentials the provider routes are enabled; malformed/partial Apple config yields clear errors and never exposes secrets.

### Stage 4 — Native auth, session persistence and existing API

**Create:** `apps/mobile/src/lib/auth-client.ts` and `apps/mobile/src/lib/api.ts`, plus the minimal native sign-in and Profile UI.

- [ ] Initialize `createAuthClient` with a validated absolute backend `EXPO_PUBLIC_API_BASE_URL` and the Better Auth `expoClient({scheme:'cetus', storagePrefix:'cetus', storage: SecureStore})` plugin. Use `expo-secure-store` only through the plugin; do not implement parallel credential/cookie persistence, manual state hydration or a new auth backend.
- [ ] Wire Google and Apple buttons to `authClient.signIn.social({ provider: 'google' | 'apple', callbackURL: ... })`. Verify the final callback/deep-link parameter shape against the actual installed SDK; test browser redirect, cancel/error handling and explicit in-app navigation to signed-in Profile or Games. A single lightweight auth state consumer via `useSession` is enough.
- [ ] Profile shows logged-in name/email from `useSession`/`getSession`, exposes sign-out and updates promptly on logout. Restore session after a full app restart with SecureStore.
- [ ] Construct **one** `createApiClient` mobile instance, with injected absolute `baseUrl` and `getHeaders` calling `authClient.getCookie()`. Only send `Cookie` if present. Do not add response middleware, bearer token support or alter the existing web client. If Android/iOS fetch automatically sends conflicting credentials, fix it in the injected native fetch adapter after reproducing it; no general transport redesign.
- [ ] On signed-in Profile, call existing `api.getSettings()` as the minimal protected API verification. Confirm it succeeds with the same user session; after sign-out, confirm a 401. Use Better Auth `getSession` for identity. **No GET `/api/user/profile`**; the only current profile endpoint is a POST update.
- [ ] Tests: mobile auth client mocks for successful/canceled/error social login, session persistence integration seam, sign-out, correct cookie header on all shared API operations (verify at least GET/settings and POST), anonymous case and 401 behavior; backend auth tests. Favor mocked tests over a second auth test framework.

**Gate:** manually authenticate Google and Apple on **iOS and Android**, check a protected API, restart and sign out, and verify continued web Google login. If Apple credentials are unavailable, document the exact outstanding verification and keep PR draft.

### Stage 5 — EAS, native preview builds and device acceptance

- [ ] Add `apps/mobile/eas.json` with development (dev client), preview (internal distribution) and production profiles. Run real `eas init` for a genuine project ID; do not hardcode a fictional UUID. Register human-verified iOS/Android identifiers.
- [ ] Set only public HTTPS API backend URL in `EXPO_PUBLIC_API_BASE_URL`; store private OAuth and Better Auth secrets on the web backend. Document local simulator/emulator URL behavior, production vs staging backend, redirect/callback setup and platform-specific signing/Apple prerequisites.
- [ ] Build/test iOS and Android development clients in simulator/emulator, then trigger **both** EAS preview builds. Use actual result links in PR discussion only after the provider returns success. Do not claim build completion from config file presence.
- [ ] Manual matrix: 4 tabs, active 23-game catalog, no fake playable games, font/surface smoke, Google successful/failed/canceled sign-in, Apple successful/failed/canceled sign-in on each platform, persisted session after restart, `GET /api/settings` authorized, sign-out then 401, app deep links, and web Google unchanged.
- [ ] Test at least one physical device if possible, especially provider redirect and universal deep-link return. Clearly separate "simulator pass" from "physical device pass." No App Store/Google Play release here; that is HPA-199.
- [ ] Share a concise verification log as a PR comment, including blocked credential/setup rows rather than vague "works on my machine."

**Human review checkpoint:** inspect the redirect/cookie behavior, EAS results and iOS/Android recording/screens before marking PR ready.

### Stage 6 — CI, docs and final review in same PR

- [ ] Add one lightweight mobile `jest-expo` test command to the existing CI test job and typecheck to the existing quality pipeline; do **not** launch EAS build for every PR. Keep existing draft skip semantics, web build on Vercel and root web/package Vitest aggregation.
- [ ] Update repository guidance (`README.md`/`AGENTS.md` or current primary equivalent) with `apps/mobile` setup, `bun` commands, OAuth/Apple/EAS requirements and native-vs-web boundaries. Keep actual secrets out of examples.
- [ ] Run `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run turbo run typecheck`, `bun run test:coverage`, `bun run test:run`, `bun run build` and representative existing web auth/Playwright E2E. Enforce existing >=90% web/package coverage gate; do not weaken it to admit Expo template code. Run `expo-doctor` and native `jest-expo`/bundling checks separately.
- [ ] Review `git diff`/changed files for unintended web auth behavior, duplicate React versions, uncommitted secrets, over-engineering, fake app credentials or external project IDs, unused dependencies and unnecessary native/CI abstractions.
- [ ] Reconcile external acceptance checklist and link actual EAS builds. **Only then** mark this PR ready for review. Link the same PR in Linear and move HPA-179 through normal workflow; HPA-182 and HPA-533 remain blocked until this implementation is demonstrably complete.

## Planned files and ownership

| Area | Files expected | Purpose |
| --- | --- | --- |
| Expo app | `apps/mobile/app/**`, `apps/mobile/src/lib/**`, `apps/mobile/package.json`, `app config`, `eas.json`, `tsconfig.json` | Four-tab native shell, login/session, API adapter |
| Native style | `apps/mobile/global.css`, `apps/mobile/metro.config.js` if required, fonts config | Narrow Tailwind 4/NativeWind setup and fonts |
| Backend auth | `apps/web/src/lib/auth.ts` and auth tests, env documentation | Better Auth Expo plugin, Apple provider, precise origins |
| Workspace/CI | root `package.json`/`bun.lock`, `turbo.json` if needed, existing CI | Bun scripts, mobile tests; preserve web commands |
| Docs | this design + plan, README/developer guidance | Setup and external credentials handoff |

Do **not** add `packages/ui/src/**/*.native.tsx`, Skia/graphics, 23 game routes, new server APIs, auth DB tables or new image/SFX files in HPA-179.

## Test and sign-off ledger (fill with actual evidence)

| Validation | Pass criteria | Current status |
| --- | --- | --- |
| Source spec/plan | Both documents reviewed, implementation contained in this PR | Proposed; documentation only |
| Expo shell | iOS + Android builds boot, 23 registry entries and four tabs | Not run |
| Fonts/NativeWind | Compiles and displays on both platforms without crash | Not run |
| Web auth | Existing Google-only sign-in and session tests unchanged | Not run |
| Native Google auth | iOS + Android login, restart, logout | Not run — external credentials |
| Native Apple auth | iOS + Android login, restart, logout with HTTPS callback | Not run — Apple Developer credentials |
| API cookie | Authenticated `GET /api/settings` succeeds; signed-out 401 | Not run |
| EAS preview | Both iOS and Android preview build results confirmed | Not run — EAS access |
| Coverage/quality | Existing root gates, web build, mobile Jest/typecheck all pass | Not run |

Any missing OAuth/EAS access is a *verification blocker*, not a reason to mark the task complete. Do not introduce an auth shortcut or change the acceptance goal to merely "can compile."

## Implementation references

- Expo monorepos / Metro: https://docs.expo.dev/guides/monorepos/
- Better Auth Expo integration: https://better-auth.com/docs/integrations/expo
- Better Auth Apple provider: https://better-auth.com/docs/authentication/apple
- NativeWind v5 + Tailwind 4: https://www.nativewind.dev/v5/getting-started/installation
