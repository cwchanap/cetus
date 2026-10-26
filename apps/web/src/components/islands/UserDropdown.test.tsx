import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, act, waitFor } from '@testing-library/react'

const { signOutMock, getSessionMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  getSessionMock: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signOut: signOutMock,
    getSession: getSessionMock,
  },
}))

import { UserDropdown } from './UserDropdown'

const user = {
  name: 'Commander Vale',
  email: 'vale@cetus.dev',
  image: null,
}

// jsdom's location.reload is non-configurable; replace the whole location
// value to observe reload calls.
const replaceLocation = () => {
  const reload = vi.fn()
  const originalLocation = window.location
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, reload },
    writable: true,
    configurable: true,
  })
  return {
    reload,
    restore: () => {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    },
  }
}

const openMenu = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Welcome,/ }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('UserDropdown island toggle behavior', () => {
  it('renders the user greeting and toggles the menu with aria state', async () => {
    render(<UserDropdown user={user} />)

    const trigger = screen.getByRole('button', {
      name: /Welcome, Commander Vale/,
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('user-menu')).toHaveClass('opacity-0')

    await openMenu()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('user-menu')).toHaveClass('opacity-100')
    expect(screen.getByText('vale@cetus.dev')).toBeInTheDocument()

    // Escape closes.
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('user-menu')).toHaveClass('opacity-0')

    await openMenu()
    // Outside click closes.
    await act(async () => {
      fireEvent.click(document.body)
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('UserDropdown island logout', () => {
  it('signs out and reloads on success', async () => {
    const { reload, restore } = replaceLocation()
    signOutMock.mockResolvedValue(undefined)

    render(<UserDropdown user={user} />)
    await openMenu()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Logout/ }))
    })

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(getSessionMock).not.toHaveBeenCalled()
    restore()
  })

  it('shows the pending label while signing out', async () => {
    const { reload, restore } = replaceLocation()
    let resolveSignOut: (() => void) | undefined
    signOutMock.mockReturnValue(
      new Promise<void>(resolve => {
        resolveSignOut = resolve
      })
    )

    render(<UserDropdown user={user} />)
    await openMenu()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Logout/ }))
    })

    expect(
      screen.getByRole('button', { name: 'Logging out...' })
    ).toBeDisabled()

    await act(async () => {
      resolveSignOut?.()
    })
    await waitFor(() => expect(reload).toHaveBeenCalled())
    restore()
  })

  it('does not reload when the session survives a spurious signOut failure, and resets the button', async () => {
    const { reload, restore } = replaceLocation()
    signOutMock.mockRejectedValue(new Error('parse boom'))
    getSessionMock.mockResolvedValue({
      data: { session: { id: 's1' } },
      error: null,
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<UserDropdown user={user} />)
    await openMenu()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Logout/ }))
    })

    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(reload).not.toHaveBeenCalled()
    expect(getSessionMock).toHaveBeenCalledTimes(1)
    // Button reset so the user can retry.
    expect(screen.getByRole('button', { name: /Logout/ })).toBeEnabled()
    restore()
  })

  it('reloads when signOut failed but the session is confirmed gone', async () => {
    const { reload, restore } = replaceLocation()
    signOutMock.mockRejectedValue(new Error('parse boom'))
    getSessionMock.mockResolvedValue({ data: null, error: null })

    render(<UserDropdown user={user} />)
    await openMenu()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Logout/ }))
    })

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    restore()
  })

  it('does not reload when the session re-check itself fails', async () => {
    const { reload, restore } = replaceLocation()
    signOutMock.mockRejectedValue(new Error('network down'))
    getSessionMock.mockRejectedValue(new Error('check failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<UserDropdown user={user} />)
    await openMenu()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Logout/ }))
    })

    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(reload).not.toHaveBeenCalled()
    restore()
  })
})
