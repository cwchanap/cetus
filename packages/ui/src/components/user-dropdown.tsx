import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'

/**
 * Navigation user dropdown (HPA-379 Stage 4). Pure presentation: open/close,
 * outside-click and Escape behavior live here; the logout action is owned by
 * the apps/web island via `onLogout`.
 */
export interface UserDropdownProps {
  user: {
    name?: string
    email?: string
    image?: string | null
  }
  onLogout: () => Promise<void>
  className?: string
}

const menuItemClass =
  'block px-4 py-2 text-sm text-cetus-ink hover:bg-cetus-accent/10 hover:text-cetus-accent transition-colors duration-200'

export function UserDropdown({ user, onLogout, className }: UserDropdownProps) {
  const userName = user.name || user.email?.split('@')[0] || 'User'
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const closeDropdown = () => setOpen(false)

  // Close when clicking outside the dropdown.
  useEffect(() => {
    if (!open) {
      return
    }
    const onDocClick = (event: globalThis.MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        closeDropdown()
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) {
      return
    }
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown()
      }
    }
    document.addEventListener('keydown', onKeydown)
    return () => document.removeEventListener('keydown', onKeydown)
  }, [open])

  const handleLinkClick = () => {
    // Close shortly after a link click so navigation can begin first
    // (parity with the previous controller).
    setTimeout(closeDropdown, 100)
  }

  const handleLogout = async () => {
    setPending(true)
    try {
      await onLogout()
    } catch {
      // The island owns auth error reporting; restore the button so the
      // user can retry (parity with the previous controller).
      setPending(false)
    }
  }

  return (
    // relative + z-index restore the ported .astro twin's positioning
    // context — without it the menu's absolute right-0 anchors to a distant
    // positioned ancestor and the dropdown drifts away from the trigger.
    <div
      className={cn('relative z-[10000]', className)}
      id="user-dropdown"
      ref={containerRef}
    >
      {/* Dropdown trigger button */}
      <button
        id="user-menu-button"
        className="inline-flex items-center justify-center h-11 rounded-md px-4 bg-cetus-surface/50 border border-cetus-hairline text-cetus-accent hover:border-cetus-accent/50 hover:text-cetus-accent font-medium transition-all duration-300 text-sm backdrop-blur-sm"
        aria-expanded={open}
        aria-haspopup="true"
        type="button"
        onClick={() => setOpen(value => !value)}
      >
        <span className="flex items-center">
          <span className="mr-2">👤</span>
          Welcome, {userName}
          <svg
            className={`ml-2 h-4 w-4 transition-transform duration-200${open ? ' rotate-180' : ''}`}
            id="dropdown-arrow"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </span>
      </button>

      {/* Dropdown menu */}
      <div
        id="user-menu"
        className={`absolute right-0 mt-2 w-56 rounded-lg bg-cetus-surface backdrop-blur-md border border-cetus-hairline shadow-lg shadow-cetus-accent/10 z-[9999] transition-all duration-200 origin-top-right ${
          open
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <div className="py-2">
          {/* User info section */}
          <div className="px-4 py-3 border-b border-cetus-hairline">
            <p className="text-sm text-cetus-accent font-medium">{userName}</p>
            <p className="text-xs text-cetus-ink-muted truncate">
              {user.email}
            </p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <a
              href="/profile"
              className={menuItemClass}
              onClick={handleLinkClick}
            >
              <span className="flex items-center">
                <span className="mr-3">⚙️</span>
                Profile Settings
              </span>
            </a>

            <a
              href="/dashboard"
              className={menuItemClass}
              onClick={handleLinkClick}
            >
              <span className="flex items-center">
                <span className="mr-3">📊</span>
                Dashboard
              </span>
            </a>

            <a
              href="/achievements"
              className={menuItemClass}
              onClick={handleLinkClick}
            >
              <span className="flex items-center">
                <span className="mr-3">🏆</span>
                Achievements
              </span>
            </a>

            <a
              href="/settings"
              className={menuItemClass}
              onClick={handleLinkClick}
            >
              <span className="flex items-center">
                <span className="mr-3">🎛️</span>
                Settings
              </span>
            </a>

            <div className="border-t border-cetus-hairline my-1"></div>

            <button
              id="dropdown-logout-btn"
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors duration-200"
              type="button"
              disabled={pending}
              onClick={() => {
                void handleLogout()
              }}
            >
              {pending ? (
                'Logging out...'
              ) : (
                <span className="flex items-center">
                  <span className="mr-3">🚪</span>
                  Logout
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
