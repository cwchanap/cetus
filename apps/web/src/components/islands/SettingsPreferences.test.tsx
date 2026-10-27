import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import type { ClientPreferences } from '@cetus/shared/preferences'

const { updateSettingsMock, saveClientPreferencesMock } = vi.hoisted(() => ({
  updateSettingsMock: vi.fn(),
  saveClientPreferencesMock: vi.fn(),
}))

vi.mock('@cetus/api-client/api-client', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@cetus/api-client/api-client')>()
  return {
    ...actual,
    createApiClient: vi.fn(() => ({ updateSettings: updateSettingsMock })),
  }
})

vi.mock('@/lib/preferences', () => ({
  getClientPreferences: vi.fn(() => storedPrefs),
  saveClientPreferences: saveClientPreferencesMock,
}))

import { ApiClientError } from '@cetus/api-client/api-client'
import { SettingsPreferences } from './SettingsPreferences'

let storedPrefs: ClientPreferences

beforeEach(() => {
  vi.clearAllMocks()
  storedPrefs = {
    sound: {
      masterVolume: 25,
      sfxVolume: 45,
      musicVolume: 65,
      soundEnabled: false,
    },
    display: { reducedMotion: true },
  }
  document.documentElement.classList.remove('reduce-motion')
})

describe('SettingsPreferences', () => {
  it('mirrors stored client preferences into the controls after mount', async () => {
    const { getByRole } = render(
      <SettingsPreferences
        emailNotifications
        pushNotifications={false}
        challengeReminders
      />
    )

    await waitFor(() => {
      expect(getByRole('switch', { name: 'Sound Enabled' })).toHaveAttribute(
        'aria-checked',
        'false'
      )
    })
    expect(getByRole('slider', { name: 'Master Volume' })).toHaveValue('25')
    expect(getByRole('slider', { name: 'Sound Effects' })).toHaveValue('45')
    expect(getByRole('slider', { name: 'Music' })).toHaveValue('65')
    expect(getByRole('switch', { name: 'Reduced Motion' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(
      true
    )
  })

  it('persists client preference changes through saveClientPreferences', async () => {
    const { getByRole } = render(
      <SettingsPreferences
        emailNotifications
        pushNotifications={false}
        challengeReminders
      />
    )
    await waitFor(() => {
      expect(getByRole('slider', { name: 'Master Volume' })).toHaveValue('25')
    })

    fireEvent.click(getByRole('switch', { name: 'Sound Enabled' }))

    expect(saveClientPreferencesMock).toHaveBeenCalledTimes(1)
    expect(saveClientPreferencesMock.mock.calls[0][0].sound.soundEnabled).toBe(
      true
    )
    expect(getByRole('switch', { name: 'Sound Enabled' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  it('shows the saved confirmation after a successful server save', async () => {
    updateSettingsMock.mockResolvedValue({
      success: true,
      preferences: {},
    })
    const { getByRole, findByText } = render(
      <SettingsPreferences
        emailNotifications
        pushNotifications={false}
        challengeReminders
      />
    )
    await waitFor(() => {
      expect(
        getByRole('switch', { name: 'Push Notifications' })
      ).toBeInTheDocument()
    })

    fireEvent.click(getByRole('switch', { name: 'Push Notifications' }))

    expect(await findByText('Saved!')).toBeInTheDocument()
    expect(updateSettingsMock).toHaveBeenCalledWith({
      push_notifications: true,
    })
    expect(getByRole('switch', { name: 'Push Notifications' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  it('reverts the switch via React state when the server save fails', async () => {
    updateSettingsMock.mockRejectedValue(
      new ApiClientError('boom', 500, 'http')
    )
    const { getByRole, findByText } = render(
      <SettingsPreferences
        emailNotifications
        pushNotifications={false}
        challengeReminders
      />
    )
    await waitFor(() => {
      expect(
        getByRole('switch', { name: 'Email Notifications' })
      ).toBeInTheDocument()
    })

    fireEvent.click(getByRole('switch', { name: 'Email Notifications' }))
    expect(
      getByRole('switch', { name: 'Email Notifications' })
    ).toHaveAttribute('aria-checked', 'false') // optimistic

    expect(await findByText('Failed to save (500)')).toBeInTheDocument()
    await waitFor(() => {
      expect(
        getByRole('switch', { name: 'Email Notifications' })
      ).toHaveAttribute('aria-checked', 'true') // reverted
    })
    // The revert is a state update, not a simulated click: exactly one
    // save attempt happened for one user toggle.
    expect(updateSettingsMock).toHaveBeenCalledTimes(1)
  })

  it('serializes saves per key so the last selected value persists last', async () => {
    let resolveFirst!: (value: {
      success: boolean
      preferences: Record<string, never>
    }) => void
    updateSettingsMock
      .mockImplementationOnce(
        () => new Promise(resolve => (resolveFirst = resolve))
      )
      .mockResolvedValue({ success: true, preferences: {} })
    const { getByRole } = render(
      <SettingsPreferences
        emailNotifications
        pushNotifications={false}
        challengeReminders
      />
    )
    await waitFor(() => {
      expect(
        getByRole('switch', { name: 'Email Notifications' })
      ).toBeInTheDocument()
    })

    const toggle = getByRole('switch', { name: 'Email Notifications' })
    fireEvent.click(toggle) // optimistic off, save A in flight
    fireEvent.click(toggle) // optimistic on, queued behind A

    // The second click must not race a parallel request: only A is sent.
    await waitFor(() => {
      expect(updateSettingsMock).toHaveBeenCalledTimes(1)
    })
    expect(updateSettingsMock).toHaveBeenNthCalledWith(1, {
      email_notifications: false,
    })

    resolveFirst({ success: true, preferences: {} })

    // After A settles, the drain pursues the latest intent — the last
    // selected value is the final persisted one.
    await waitFor(() => {
      expect(updateSettingsMock).toHaveBeenCalledTimes(2)
    })
    expect(updateSettingsMock).toHaveBeenNthCalledWith(2, {
      email_notifications: true,
    })
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('coalesces rapid re-toggles into a single save when intent settles back', async () => {
    let resolveFirst!: (value: {
      success: boolean
      preferences: Record<string, never>
    }) => void
    updateSettingsMock.mockImplementationOnce(
      () => new Promise(resolve => (resolveFirst = resolve))
    )
    const { getByRole } = render(
      <SettingsPreferences
        emailNotifications
        pushNotifications={false}
        challengeReminders
      />
    )
    await waitFor(() => {
      expect(
        getByRole('switch', { name: 'Email Notifications' })
      ).toBeInTheDocument()
    })

    const toggle = getByRole('switch', { name: 'Email Notifications' })
    fireEvent.click(toggle) // off — save in flight
    fireEvent.click(toggle) // on
    fireEvent.click(toggle) // off — final intent equals the in-flight save

    resolveFirst({ success: true, preferences: {} })

    // The in-flight save already persisted the final intent: no follow-up
    // request is needed and the switch stays at the last selected value.
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'false')
    })
    expect(updateSettingsMock).toHaveBeenCalledTimes(1)
    expect(updateSettingsMock).toHaveBeenNthCalledWith(1, {
      email_notifications: false,
    })
  })
})
