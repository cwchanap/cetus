import { UserDropdown as UserDropdownView } from '@cetus/ui'

/**
 * Web-owned navigation user dropdown island (HPA-379 Stage 4). Astro passes
 * only serializable user fields; the Better Auth sign-out flow and its
 * confirm-before-reload error handling live here.
 */
export interface UserDropdownProps {
  user: {
    name?: string
    email?: string
    image?: string | null
  }
}

export function UserDropdown({ user }: UserDropdownProps) {
  const handleLogout = async () => {
    // auth-client is not SSR-safe (browser-only bootstrap), so it is imported
    // lazily here — this handler only ever runs in the browser.
    const { authClient } = await import('@/lib/auth-client').catch(error => {
      // A failed chunk load (e.g. stale page after a redeploy) bypasses the
      // signOut error reporting below — log it here, then rethrow so the
      // dropdown's catch still restores the button.
      console.error('[logout] auth-client failed to load:', error)
      throw error
    })
    try {
      // auth-client is created without fetchOptions.throw, so a failed
      // sign-out resolves with `{ data: null, error }` instead of
      // throwing — surface it through the same failure path as a throw.
      const signOutResult = await authClient.signOut()
      const signOutError = signOutResult?.error
      if (signOutError) {
        throw new Error(
          signOutError.message ?? `signOut failed (${signOutError.status})`
        )
      }
      window.location.reload()
    } catch (error) {
      // signOut can throw spuriously (e.g. response-parsing errors) even
      // when the session was destroyed. Reload ONLY after confirming the
      // session is actually gone; otherwise surface the failure instead
      // of silently indicating success.
      try {
        const { data: session, error: sessionError } =
          await authClient.getSession()
        // Only reload if we positively confirmed the session is gone.
        // A null `data` with an `error` means the check itself failed
        // (e.g. 5xx / network error), not that the session was destroyed.
        if (!session && !sessionError) {
          window.location.reload()
          return
        }
      } catch {
        // session check also failed — fall through to reset button state
      }

      console.error('[logout] signOut failed:', error)
      throw error
    }
  }

  return <UserDropdownView user={user} onLogout={handleLogout} />
}

export default UserDropdown
