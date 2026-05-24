# Google-Only Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove password sign-in, password sign-up, and password changes so Cetus accepts Google authentication only.

**Architecture:** The cutover happens at the Better Auth server config first, then at the visible auth entry pages, then at settings and E2E helpers. Page tests use source-level assertions because these Astro pages are mostly static markup plus client scripts, and the OAuth redirect itself cannot be completed in local CI without Google credentials.

**Tech Stack:** Astro 5, Better Auth, TypeScript, Vitest, Playwright, Bun.

---

## File Structure

- Modify `src/lib/auth.ts`: remove Better Auth email/password support and require Google OAuth credentials.
- Modify `src/lib/auth.test.ts`: replace email/password integration expectations with Google-only auth and source-contract coverage.
- Modify `src/lib/auth-client.test.ts`: keep auth-client tests focused on Google social sign-in, sessions, and sign-out.
- Modify `src/test/setup.ts`: remove mocked email/password and sign-up auth methods.
- Create `src/pages/auth-pages.test.ts`: assert login and signup are Google-only pages.
- Modify `src/pages/login/index.astro`: remove email/password login form and keep one Google CTA.
- Modify `src/pages/signup/index.astro`: remove email/password signup form and keep one Google CTA.
- Modify `src/pages/settings.test.ts`: assert password controls are absent.
- Modify `src/pages/settings.astro`: remove password-change UI and client code.
- Modify `e2e/pages/profile-activity.spec.ts`: stop trying password login/signup and skip authenticated-only assertions when OAuth cannot be automated.

---

### Task 1: Server Auth Config And Auth Unit Tests

**Files:**

- Modify: `src/lib/auth.ts`
- Modify: `src/lib/auth.test.ts`
- Modify: `src/lib/auth-client.test.ts`
- Modify: `src/test/setup.ts`

- [ ] **Step 1: Write the failing auth tests and update shared mocks**

Replace `src/test/setup.ts` with:

```ts
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Better Auth client
vi.mock('@/lib/auth-client', () => ({
    authClient: {
        signIn: {
            social: vi.fn(),
        },
        signOut: vi.fn(),
        getSession: vi.fn(),
    },
}))
```

Replace `src/lib/auth-client.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authClient } from '@/lib/auth-client'

vi.mock('@/lib/auth-client', () => ({
    authClient: {
        signIn: {
            social: vi.fn(),
        },
        signOut: vi.fn(),
        getSession: vi.fn(),
    },
}))

describe('Auth Client', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('Social Authentication', () => {
        it('successfully starts Google sign in', async () => {
            const mockResult = {
                data: { user: { id: '1', email: 'google@example.com' } },
            }
            vi.mocked(authClient.signIn.social).mockResolvedValue(mockResult)

            const result = await authClient.signIn.social({
                provider: 'google',
                callbackURL: '/',
            })

            expect(authClient.signIn.social).toHaveBeenCalledWith({
                provider: 'google',
                callbackURL: '/',
            })
            expect(result).toEqual(mockResult)
        })

        it('handles Google sign-in errors', async () => {
            const mockError = { error: { message: 'Social login failed' } }
            vi.mocked(authClient.signIn.social).mockResolvedValue(mockError)

            const result = await authClient.signIn.social({
                provider: 'google',
                callbackURL: '/',
            })

            expect(result.error).toBeDefined()
            expect(result.error?.message).toBe('Social login failed')
        })
    })

    describe('Session Management', () => {
        it('successfully signs out', async () => {
            const mockResult = { success: true }
            vi.mocked(authClient.signOut).mockResolvedValue(mockResult)

            const result = await authClient.signOut()

            expect(authClient.signOut).toHaveBeenCalled()
            expect(result).toEqual(mockResult)
        })

        it('gets the current session', async () => {
            const mockSession = {
                data: {
                    user: { id: '1', email: 'test@example.com' },
                    session: { id: 'session-1', expiresAt: new Date() },
                },
            }
            vi.mocked(authClient.getSession).mockResolvedValue(mockSession)

            const result = await authClient.getSession()

            expect(authClient.getSession).toHaveBeenCalled()
            expect(result).toEqual(mockSession)
        })

        it('handles session errors', async () => {
            const mockError = { error: { message: 'No active session' } }
            vi.mocked(authClient.getSession).mockResolvedValue(mockError)

            const result = await authClient.getSession()

            expect(result.error).toBeDefined()
            expect(result.error?.message).toBe('No active session')
        })
    })
})
```

Replace `src/lib/auth.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { authClient } from '@/lib/auth-client'

vi.mock('@/lib/auth-client', () => ({
    authClient: {
        signIn: {
            social: vi.fn(),
        },
        signOut: vi.fn(),
        getSession: vi.fn(),
    },
}))

const authSource = readFileSync(resolve(process.cwd(), 'src/lib/auth.ts'), 'utf-8')

describe('Auth server configuration', () => {
    it('does not enable email and password authentication', () => {
        expect(authSource).not.toContain('emailAndPassword')
    })

    it('requires Google OAuth credentials for the Google-only auth surface', () => {
        expect(authSource).toContain(
            'Google OAuth is required for Google-only authentication'
        )
        expect(authSource).toContain('socialProviders')
        expect(authSource).toContain('google')
    })
})

describe('Auth Integration Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('Google Auth Flow', () => {
        it('handles Google OAuth sign in or new-user registration', async () => {
            vi.mocked(authClient.signIn.social).mockResolvedValue({
                data: {
                    redirect: false,
                    token: 'oauth-token',
                    url: undefined,
                    user: {
                        id: 'google-user-123',
                        email: 'googleuser@gmail.com',
                        name: 'Google User',
                        image: null,
                        emailVerified: true,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    },
                },
            })

            vi.mocked(authClient.getSession).mockResolvedValue({
                data: {
                    user: { id: 'google-user-123', email: 'googleuser@gmail.com' },
                    session: { id: 'session-123', expiresAt: new Date() },
                },
            })

            vi.mocked(authClient.signOut).mockResolvedValue({
                data: { success: true },
            })

            const signInResult = await authClient.signIn.social({
                provider: 'google',
                callbackURL: '/',
            })
            expect(signInResult.data?.user?.email).toBe('googleuser@gmail.com')

            const sessionResult = await authClient.getSession()
            expect(sessionResult.data?.user.email).toBe('googleuser@gmail.com')

            const signOutResult = await authClient.signOut()
            expect(signOutResult.data?.success).toBe(true)
        })

        it('handles Google OAuth errors', async () => {
            vi.mocked(authClient.signIn.social).mockResolvedValue({
                error: { message: 'OAuth provider rejected the request' },
            })

            const result = await authClient.signIn.social({
                provider: 'google',
                callbackURL: '/',
            })

            expect(result.error?.message).toBe(
                'OAuth provider rejected the request'
            )
        })
    })

    describe('Session Persistence', () => {
        it('maintains session across requests after Google sign in', async () => {
            const mockUser = { id: 'user-123', email: 'test@example.com' }
            const mockSession = {
                id: 'session-123',
                expiresAt: new Date(Date.now() + 3600000),
            }

            vi.mocked(authClient.signIn.social).mockResolvedValue({
                data: { user: mockUser },
            })

            vi.mocked(authClient.getSession).mockResolvedValue({
                data: { user: mockUser, session: mockSession },
            })

            await authClient.signIn.social({
                provider: 'google',
                callbackURL: '/',
            })

            const session1 = await authClient.getSession()
            const session2 = await authClient.getSession()

            expect(session1.data?.user.id).toBe(session2.data?.user.id)
            expect(session1.data?.session.id).toBe(session2.data?.session.id)
        })

        it('handles expired sessions', async () => {
            vi.mocked(authClient.getSession).mockResolvedValue({
                error: { message: 'Session expired' },
            })

            const result = await authClient.getSession()

            expect(result.error?.message).toBe('Session expired')
        })
    })

    describe('Auth State Management', () => {
        it('properly clears auth state on sign out', async () => {
            vi.mocked(authClient.signOut).mockResolvedValue({
                data: { success: true },
            })

            vi.mocked(authClient.getSession).mockResolvedValue({
                error: { message: 'No active session' },
            })

            const signOutResult = await authClient.signOut()
            expect(signOutResult.data?.success).toBe(true)

            const sessionResult = await authClient.getSession()
            expect(sessionResult.error?.message).toBe('No active session')
        })
    })

    describe('Error Recovery', () => {
        it('handles Google OAuth network errors gracefully', async () => {
            vi.mocked(authClient.signIn.social).mockRejectedValue(
                new Error('Network error')
            )

            await expect(
                authClient.signIn.social({
                    provider: 'google',
                    callbackURL: '/',
                })
            ).rejects.toThrow('Network error')
        })

        it('handles malformed session responses', async () => {
            vi.mocked(authClient.getSession).mockResolvedValue({} as any)

            const result = await authClient.getSession()

            expect(result.data).toBeUndefined()
            expect(result.error).toBeUndefined()
        })
    })
})
```

- [ ] **Step 2: Run the auth tests and verify the source-contract failure**

Run:

```bash
bun run test:run src/lib/auth.test.ts src/lib/auth-client.test.ts
```

Expected: `src/lib/auth.test.ts` fails because `src/lib/auth.ts` still contains `emailAndPassword` and does not contain the new Google-only credential error string. `src/lib/auth-client.test.ts` should pass after the mock update.

- [ ] **Step 3: Remove password auth from the Better Auth config**

Replace `src/lib/auth.ts` with:

```ts
import { betterAuth } from 'better-auth'
import { dialect } from './server/db'

// Check required environment variables
const secret = import.meta.env.BETTER_AUTH_SECRET
if (!secret) {
    throw new Error(
        'BETTER_AUTH_SECRET is required. Please set it in your environment variables.'
    )
}

// Determine baseURL - use env var, fallback to localhost, or empty in production (inferred from request)
let baseURL: string
if (import.meta.env.BETTER_AUTH_URL) {
    baseURL = import.meta.env.BETTER_AUTH_URL
} else if (import.meta.env.PROD) {
    baseURL = '' // Better Auth will infer from request headers in production
} else {
    baseURL = 'http://localhost:4325'
}

const googleClientId = import.meta.env.GOOGLE_CLIENT_ID
const googleClientSecret = import.meta.env.GOOGLE_CLIENT_SECRET
const isGoogleOAuthConfigured =
    googleClientId &&
    googleClientSecret &&
    googleClientId !== 'placeholder' &&
    googleClientSecret !== 'placeholder'

if (!isGoogleOAuthConfigured) {
    throw new Error(
        'Google OAuth is required for Google-only authentication. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to real OAuth credentials.'
    )
}

export const auth = betterAuth({
    database: {
        dialect,
        type: 'sqlite',
    },
    socialProviders: {
        google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
        },
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
        cookie: {
            sameSite: 'lax',
            secure: import.meta.env.PROD,
            httpOnly: true,
        },
    },
    trustedOrigins: baseURL ? [baseURL] : [],
    secret,
    baseURL,
})

export type Session = typeof auth.$Infer.Session
```

- [ ] **Step 4: Run the auth tests and verify they pass**

Run:

```bash
bun run test:run src/lib/auth.test.ts src/lib/auth-client.test.ts
```

Expected: both test files pass.

- [ ] **Step 5: Commit the server auth slice**

Run:

```bash
git add src/lib/auth.ts src/lib/auth.test.ts src/lib/auth-client.test.ts src/test/setup.ts
git commit -m "Remove password auth configuration"
```

---

### Task 2: Google-Only Login And Signup Pages

**Files:**

- Create: `src/pages/auth-pages.test.ts`
- Modify: `src/pages/login/index.astro`
- Modify: `src/pages/signup/index.astro`

- [ ] **Step 1: Write failing page contract tests**

Create `src/pages/auth-pages.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const loginMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/login/index.astro'),
    'utf-8'
)
const signupMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/signup/index.astro'),
    'utf-8'
)

describe('Google-only auth entry pages', () => {
    it('renders login as a Google-only entry point', () => {
        expect(loginMarkup).toContain('data-social="google"')
        expect(loginMarkup).toContain('Continue with Google')
        expect(loginMarkup).toContain("provider: 'google'")
        expect(loginMarkup).toContain("callbackURL: '/?redirect=games'")

        expect(loginMarkup).not.toContain('id="login-form"')
        expect(loginMarkup).not.toContain('type="email"')
        expect(loginMarkup).not.toContain('type="password"')
        expect(loginMarkup).not.toContain('authClient.signIn.email')
        expect(loginMarkup).not.toContain('Forgot password')
        expect(loginMarkup).not.toContain('Remember me')
    })

    it('renders signup as a Google-only entry point', () => {
        expect(signupMarkup).toContain('data-social="google"')
        expect(signupMarkup).toContain('Create account with Google')
        expect(signupMarkup).toContain("provider: 'google'")
        expect(signupMarkup).toContain("callbackURL: '/'")

        expect(signupMarkup).not.toContain('id="signup-form"')
        expect(signupMarkup).not.toContain('type="email"')
        expect(signupMarkup).not.toContain('type="password"')
        expect(signupMarkup).not.toContain('authClient.signUp.email')
        expect(signupMarkup).not.toContain('id="terms"')
    })
})
```

- [ ] **Step 2: Run the page tests and verify they fail**

Run:

```bash
bun run test:run src/pages/auth-pages.test.ts
```

Expected: both tests fail because `/login` and `/signup` still render email/password form markup.

- [ ] **Step 3: Replace `/login` with a Google-only page**

In `src/pages/login/index.astro`, keep the imports and `<AppLayout>` wrapper. Replace the current `<Section>...</Section>` content and `<script>` with:

```astro
  <Section>
    <Container class="max-w-md">
      <div class="text-center mb-8">
        <Heading level={2} variant="section" align="center" class="mb-4">
          PLAYER LOGIN
        </Heading>
        <p class="text-gray-400 text-lg">
          Access your gaming account with Google
        </p>
      </div>

      <Card variant="glass" class="p-8">
        <div class="space-y-6">
          <button
            type="button"
            data-social="google"
            class="w-full inline-flex items-center justify-center h-11 rounded-md px-8 bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg shadow-purple-500/25 hover:from-cyan-400 hover:to-purple-500 font-bold transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-50 text-sm"
          >
            <span class="flex items-center justify-center">
              <span class="mr-2">🌐</span>
              Continue with Google
            </span>
          </button>

          <div
            id="error-message"
            class="hidden p-4 bg-red-500/20 border border-red-400/30 rounded-lg text-red-400 text-sm"
          >
          </div>
        </div>

        <div class="text-center mt-6 pt-6 border-t border-slate-600">
          <p class="text-gray-400">
            Don't have an account?
            <a
              href="/signup"
              class="text-cyan-400 hover:text-cyan-300 transition-colors duration-300 font-medium"
            >
              Create one with Google
            </a>
          </p>
        </div>
      </Card>
    </Container>
  </Section>

  <script>
    import { authClient } from '@/lib/auth-client'

    document.addEventListener('DOMContentLoaded', () => {
      const googleBtn = document.querySelector(
        '[data-social="google"]'
      ) as HTMLButtonElement | null
      const errorMessage = document.getElementById('error-message')

      googleBtn?.addEventListener('click', async () => {
        hideError()

        const originalText = googleBtn.innerHTML
        googleBtn.innerHTML =
          '<span class="flex items-center justify-center"><span class="mr-2">⏳</span>Connecting...</span>'
        googleBtn.disabled = true

        try {
          await authClient.signIn.social({
            provider: 'google',
            callbackURL: '/?redirect=games',
          })
        } catch (_error) {
          showError('Google login failed. Please try again.')
        } finally {
          googleBtn.innerHTML = originalText
          googleBtn.disabled = false
        }
      })

      function showError(message: string) {
        if (errorMessage) {
          errorMessage.textContent = message
          errorMessage.classList.remove('hidden')
        }
      }

      function hideError() {
        errorMessage?.classList.add('hidden')
      }
    })
  </script>
```

- [ ] **Step 4: Replace `/signup` with a Google-only page**

In `src/pages/signup/index.astro`, keep the imports and `<AppLayout>` wrapper. Replace the current `<Section>...</Section>` content and `<script>` with:

```astro
  <Section>
    <Container class="max-w-md">
      <div class="text-center mb-8">
        <Heading level={2} variant="section" align="center" class="mb-4">
          CREATE ACCOUNT
        </Heading>
        <p class="text-gray-400 text-lg">Join Cetus with your Google account</p>
      </div>

      <Card variant="glass" class="p-8">
        <div class="space-y-6">
          <button
            type="button"
            data-social="google"
            class="w-full inline-flex items-center justify-center h-11 rounded-md px-8 bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg shadow-purple-500/25 hover:from-cyan-400 hover:to-purple-500 font-bold transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-50 text-sm"
          >
            <span class="flex items-center justify-center">
              <span class="mr-2">🌐</span>
              Create account with Google
            </span>
          </button>

          <div
            id="error-message"
            class="hidden p-4 bg-red-500/20 border border-red-400/30 rounded-lg text-red-400 text-sm"
          >
          </div>
        </div>

        <div class="text-center mt-6 pt-6 border-t border-slate-600">
          <p class="text-gray-400">
            Already have an account?
            <a
              href="/login"
              class="text-cyan-400 hover:text-cyan-300 transition-colors duration-300 font-medium"
            >
              Continue with Google
            </a>
          </p>
        </div>
      </Card>
    </Container>
  </Section>

  <script>
    import { authClient } from '@/lib/auth-client'

    document.addEventListener('DOMContentLoaded', () => {
      const googleBtn = document.querySelector(
        '[data-social="google"]'
      ) as HTMLButtonElement | null
      const errorMessage = document.getElementById('error-message')

      googleBtn?.addEventListener('click', async () => {
        hideError()

        const originalText = googleBtn.innerHTML
        googleBtn.innerHTML =
          '<span class="flex items-center justify-center"><span class="mr-2">⏳</span>Connecting...</span>'
        googleBtn.disabled = true

        try {
          await authClient.signIn.social({
            provider: 'google',
            callbackURL: '/',
          })
        } catch (_error) {
          showError('Google sign up failed. Please try again.')
        } finally {
          googleBtn.innerHTML = originalText
          googleBtn.disabled = false
        }
      })

      function showError(message: string) {
        if (errorMessage) {
          errorMessage.textContent = message
          errorMessage.classList.remove('hidden')
        }
      }

      function hideError() {
        errorMessage?.classList.add('hidden')
      }
    })
  </script>
```

- [ ] **Step 5: Run the page tests and verify they pass**

Run:

```bash
bun run test:run src/pages/auth-pages.test.ts
```

Expected: the new page contract tests pass.

- [ ] **Step 6: Commit the auth page slice**

Run:

```bash
git add src/pages/auth-pages.test.ts src/pages/login/index.astro src/pages/signup/index.astro
git commit -m "Make auth pages Google-only"
```

---

### Task 3: Remove Password Change From Settings

**Files:**

- Modify: `src/pages/settings.test.ts`
- Modify: `src/pages/settings.astro`

- [ ] **Step 1: Replace settings tests with absence checks**

Replace `src/pages/settings.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const settingsPath = resolve(process.cwd(), 'src/pages/settings.astro')
const settingsMarkup = readFileSync(settingsPath, 'utf-8')

describe('Settings Google-only account controls', () => {
    it('does not render password change controls', () => {
        expect(settingsMarkup).not.toContain('id="change-password-btn"')
        expect(settingsMarkup).not.toContain('id="password-change-form"')
        expect(settingsMarkup).not.toContain('id="current-password"')
        expect(settingsMarkup).not.toContain('id="new-password"')
        expect(settingsMarkup).not.toContain('id="confirm-password"')
        expect(settingsMarkup).not.toContain('id="password-error"')
    })

    it('does not include password-change client behavior', () => {
        expect(settingsMarkup).not.toContain('authClient.changePassword')
        expect(settingsMarkup).not.toContain('setupPasswordChangeListeners')
        expect(settingsMarkup).not.toContain('data-toggle-password')
    })
})
```

- [ ] **Step 2: Run the settings test and verify it fails**

Run:

```bash
bun run test:run src/pages/settings.test.ts
```

Expected: the test fails because `src/pages/settings.astro` still contains password controls and password-change client behavior.

- [ ] **Step 3: Remove the password UI from account settings**

In `src/pages/settings.astro`, replace the Account Settings card body with this shape, preserving the surrounding `<Card>` and heading:

```astro
          <div class="space-y-4">
            <a href="/profile" class="block">
              <Button variant="outline" size="lg" class="w-full justify-center">
                <span class="flex items-center gap-2">
                  <span>✏️</span>
                  Edit Profile
                </span>
              </Button>
            </a>

            <Button
              variant="destructive"
              size="lg"
              class="w-full justify-center"
              id="delete-account-btn"
              disabled
              title="Account deletion not yet available - Please contact support"
            >
              <span class="flex items-center gap-2">
                <span>⚠️</span>
                Delete Account (Unavailable)
              </span>
            </Button>
          </div>
```

- [ ] **Step 4: Remove password client code from settings**

In `src/pages/settings.astro`, remove this import:

```ts
  import { authClient } from '@/lib/auth-client'
```

Remove this call from the DOMContentLoaded handler:

```ts
    // Set up password change listeners
    setupPasswordChangeListeners()
```

Delete the entire `setupPasswordChangeListeners()` function, from:

```ts
  function setupPasswordChangeListeners() {
```

through its closing brace before the `</script>` tag. Leave `showSaveStatus` intact.

- [ ] **Step 5: Run the settings test and verify it passes**

Run:

```bash
bun run test:run src/pages/settings.test.ts
```

Expected: the settings test passes.

- [ ] **Step 6: Commit the settings slice**

Run:

```bash
git add src/pages/settings.astro src/pages/settings.test.ts
git commit -m "Remove password settings controls"
```

---

### Task 4: Update E2E Auth Helper For OAuth-Only Login

**Files:**

- Modify: `e2e/pages/profile-activity.spec.ts`

- [ ] **Step 1: Run the profile activity E2E test to expose the stale password helper**

Run:

```bash
bun run test:e2e e2e/pages/profile-activity.spec.ts --project=chromium
```

Expected after Task 2: the test fails or times out while trying to fill `#email` or `#password`, because the login page no longer renders password-auth selectors.

- [ ] **Step 2: Replace the helper with an OAuth-aware skip path**

In `e2e/pages/profile-activity.spec.ts`, replace the current `ensureLoggedIn` function with:

```ts
async function ensureLoggedIn(page: Page): Promise<boolean> {
    await page.goto('/profile')

    if (!page.url().includes('/login')) {
        return true
    }

    await expect(page.getByText('PLAYER LOGIN')).toBeVisible()
    await expect(
        page.getByRole('button', { name: /continue with google/i })
    ).toBeVisible()

    return false
}
```

This keeps the E2E file from fabricating password accounts while still confirming that unauthenticated users land on the Google-only login page before authenticated-only assertions are skipped.

- [ ] **Step 3: Run the profile activity E2E test and verify it no longer fails on missing password fields**

Run:

```bash
bun run test:e2e e2e/pages/profile-activity.spec.ts --project=chromium
```

Expected: the test run completes without selector timeouts. In an unauthenticated local/CI browser context, both tests are skipped after confirming the Google login page. In a pre-authenticated context, the profile assertions pass.

- [ ] **Step 4: Commit the E2E helper slice**

Run:

```bash
git add e2e/pages/profile-activity.spec.ts
git commit -m "Update profile e2e auth helper for Google-only login"
```

---

### Task 5: Final Verification And Cleanup

**Files:**

- Verify: `src/lib/auth.ts`
- Verify: `src/pages/login/index.astro`
- Verify: `src/pages/signup/index.astro`
- Verify: `src/pages/settings.astro`
- Verify: auth and settings tests
- Verify: profile activity E2E helper

- [ ] **Step 1: Run targeted unit and source-contract tests**

Run:

```bash
bun run test:run src/lib/auth.test.ts src/lib/auth-client.test.ts src/pages/auth-pages.test.ts src/pages/settings.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 2: Search touched auth surfaces for removed password flows**

Run:

```bash
rg -n "signIn\\.email|signUp\\.email|changePassword|type=\"password\"|Forgot password|Remember me|emailAndPassword" src/lib/auth.ts src/test/setup.ts src/pages/login src/pages/signup src/pages/settings.astro e2e/pages/profile-activity.spec.ts
```

Expected: no matches.

- [ ] **Step 3: Run the production build**

Run:

```bash
bun run build
```

Expected: Astro build succeeds. If this fails with the new Google OAuth credential error, confirm `.env` has real `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` values because Google is now the only configured auth method.

- [ ] **Step 4: Check git state**

Run:

```bash
git status --short
```

Expected: no uncommitted changes after the task commits, or only intentional changes that still need a final commit.

- [ ] **Step 5: Commit any final formatting-only cleanup**

Only run this if Step 4 shows intentional formatting changes left behind:

```bash
git add src/lib/auth.ts src/lib/auth.test.ts src/lib/auth-client.test.ts src/test/setup.ts src/pages/auth-pages.test.ts src/pages/login/index.astro src/pages/signup/index.astro src/pages/settings.astro src/pages/settings.test.ts e2e/pages/profile-activity.spec.ts
git commit -m "Finish Google-only auth cutover"
```

Expected: there is a final commit only if previous formatting or cleanup changes were not already captured in earlier task commits.
