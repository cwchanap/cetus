import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, act, waitFor } from '@testing-library/react'

// Simulate a failed dynamic import of auth-client (e.g. a stale page loading
// a chunk that no longer exists after a redeploy). The island must log the
// failure and still reject so the dropdown restores its button.
vi.mock('@/lib/auth-client', () => {
  throw new Error('chunk load failed')
})

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

describe('UserDropdown island logout import failure', () => {
  it('logs the failure and restores the button so the user can retry', async () => {
    const { reload, restore } = replaceLocation()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<UserDropdown user={user} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Welcome,/ }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Logout/ }))
    })

    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Logout/ })).toBeEnabled()
    restore()
  })
})
