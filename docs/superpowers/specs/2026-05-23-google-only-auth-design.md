# Google-Only Authentication Design

## Goal

Make Cetus accept Google sign-in and sign-up only. Password-based account creation, password login, password recovery prompts, and password changes should no longer be available through the UI or Better Auth server configuration.

## Context

Cetus currently enables Better Auth email/password authentication in `src/lib/auth.ts` and also configures Google OAuth when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present. The login and signup pages render email/password forms plus Google buttons. The settings page exposes a Change Password section that calls `authClient.changePassword`.

The production database only contains test password accounts, so there is no user migration or password-to-Google account linking requirement. Purging those test accounts is an operational database task outside this code change unless a safe existing repo-local process is identified and explicitly approved.

## Approach

Use a full Google-only cutover:

- Remove the Better Auth `emailAndPassword` block in `src/lib/auth.ts`; if the current Better Auth types require the key, set `enabled: false`.
- Require valid Google OAuth credentials because there is no password fallback.
- Remove email/password form UI and client handlers from `/login` and `/signup`.
- Keep `/login` and `/signup` as separate entry pages, but make both initiate `authClient.signIn.social({ provider: 'google' })`.
- Remove password-change UI and related client code from `/settings`.
- Update tests so password auth is not represented as a supported path.

This approach closes both the visible UI and the server-side password authentication path.

## User Experience

`/login` should present a single primary Google action with copy such as "Continue with Google". It should not show email fields, password fields, remember-me controls, forgot-password links, or an email/password submit button.

`/signup` should present a single Google account creation action with copy such as "Create account with Google". Since Better Auth social sign-in handles new user registration, this page should call the same Google social auth method as login, with signup-oriented copy only.

`/settings` should retain existing sound, display, notification, profile, and delete-account controls. It should no longer show "Change Password" or any password inputs.

## Data Flow

Unauthenticated users navigate to `/login` or `/signup`, click the Google CTA, and the client calls `authClient.signIn.social` with provider `google`. The login page should keep its current post-auth callback intent of `/?redirect=games`; the signup page should keep `/`. Better Auth redirects to Google, handles the OAuth callback under `/api/auth`, creates or finds the user account, and restores the Cetus session as it does today.

Email/password auth methods should not be reachable through configured Better Auth endpoints after the cutover.

## Error Handling

If Google OAuth credentials are missing or placeholder values, app startup should fail with a clear error explaining that Google OAuth is required for Google-only auth. Client-side social auth failures should still render the existing page-level error message.

## Testing

Update unit tests and page tests to match the new contract:

- Remove email/password sign-in and sign-up expectations from auth client tests.
- Keep and strengthen Google social auth success and error tests.
- Replace settings password-input tests with absence checks for password controls.
- Adjust E2E helpers that currently try password login/signup so authenticated-only page assertions skip when OAuth cannot be automated in local or CI runs.

Verification should include targeted auth/settings tests and `bun run build`.

## Out of Scope

- Account-linking or migration for password-only accounts.
- Password reset or password recovery flows.
- Destructive production database purge commands.
- Adding another social provider.
