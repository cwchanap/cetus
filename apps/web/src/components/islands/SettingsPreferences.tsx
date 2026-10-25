import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ApiClientError, createApiClient } from '@cetus/api-client/api-client'
import type { NotificationSettingsResponse } from '@cetus/shared/api-dto'
import {
  DEFAULT_CLIENT_PREFERENCES,
  type ClientPreferences,
} from '@cetus/shared/preferences'
import { Card, Slider, Toggle, cn } from '@cetus/ui'
import { getClientPreferences, saveClientPreferences } from '@/lib/preferences'

/**
 * Settings page island (HPA-379): owns every settings control and the save
 * status toast. Server notification preferences arrive as serializable props
 * from settings.astro (which keeps auth + DB fetching); client sound/display
 * preferences are read from localStorage through the existing
 * getClientPreferences helper after mount and persisted with
 * saveClientPreferences. Server saves go through @cetus/api-client; a failed
 * save reverts via React state — no simulated clicks or re-entry flags.
 */

/** Island props are the server-rendered notification preferences only. */
export interface SettingsPreferencesProps {
  emailNotifications: boolean
  pushNotifications: boolean
  challengeReminders: boolean
}

type ServerPrefKey =
  'emailNotifications' | 'pushNotifications' | 'challengeReminders'
type VolumeKey = 'masterVolume' | 'sfxVolume' | 'musicVolume'

// The api-client DTO uses snake_case keys; map island state keys to them.
const WIRE_KEYS: Record<ServerPrefKey, keyof NotificationSettingsResponse> = {
  emailNotifications: 'email_notifications',
  pushNotifications: 'push_notifications',
  challengeReminders: 'challenge_reminders',
}

const api = createApiClient()

const frauncesStyle: CSSProperties = {
  fontFamily: 'var(--cetus-display-font)',
  fontWeight: 'var(--cetus-display-weight)',
  fontStyle: 'var(--cetus-display-style)',
}

function describeSaveError(error: unknown): string {
  if (error instanceof ApiClientError && error.kind === 'parse') {
    return 'Invalid response from server'
  }
  if (error instanceof ApiClientError && error.kind === 'http') {
    return error.serverMessage ?? `Failed to save (${error.status})`
  }
  return 'Network error'
}

export function SettingsPreferences({
  emailNotifications,
  pushNotifications,
  challengeReminders,
}: SettingsPreferencesProps) {
  const [clientPrefs, setClientPrefs] = useState<ClientPreferences>(
    DEFAULT_CLIENT_PREFERENCES
  )
  const [serverPrefs, setServerPrefs] = useState({
    emailNotifications,
    pushNotifications,
    challengeReminders,
  })
  const [status, setStatus] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)
  const statusTimer = useRef<number | undefined>(undefined)

  // Mirror stored client preferences into the controls after mount
  // (hydration-safe: server and first client render use the defaults).
  useEffect(() => {
    const stored = getClientPreferences()
    setClientPrefs(stored)
    if (stored.display.reducedMotion) {
      document.documentElement.classList.add('reduce-motion')
    }
    return () => window.clearTimeout(statusTimer.current)
  }, [])

  const showStatus = (
    message: string = 'Saved!',
    type: 'success' | 'error' = 'success'
  ) => {
    setStatus({ message, type })
    window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setStatus(null), 2000)
  }

  const persistClientPrefs = (next: ClientPreferences) => {
    setClientPrefs(next)
    saveClientPreferences(next)
  }

  const handleSoundEnabled = (soundEnabled: boolean) => {
    persistClientPrefs({
      ...clientPrefs,
      sound: { ...clientPrefs.sound, soundEnabled },
    })
    showStatus()
  }

  const handleVolume = (key: VolumeKey, value: number) => {
    persistClientPrefs({
      ...clientPrefs,
      sound: { ...clientPrefs.sound, [key]: value },
    })
    showStatus()
  }

  const handleReducedMotion = (reducedMotion: boolean) => {
    persistClientPrefs({
      ...clientPrefs,
      display: { ...clientPrefs.display, reducedMotion },
    })
    document.documentElement.classList.toggle('reduce-motion', reducedMotion)
    showStatus()
  }

  const handleServerToggle = async (key: ServerPrefKey, next: boolean) => {
    const previous = serverPrefs[key]
    if (next === previous) {
      return
    }
    // Optimistic update; revert from React state when the save fails.
    setServerPrefs(prev => ({ ...prev, [key]: next }))
    const payload: Partial<NotificationSettingsResponse> = {}
    payload[WIRE_KEYS[key]] = next
    try {
      await api.updateSettings(payload)
      showStatus('Saved!', 'success')
    } catch (error) {
      console.error('Failed to save preference:', error)
      setServerPrefs(prev => ({ ...prev, [key]: previous }))
      showStatus(describeSaveError(error), 'error')
    }
  }

  return (
    <>
      {/* Sound Settings */}
      <Card variant="glass" className="p-6 md:p-8 mb-6">
        <h3
          className="text-lg font-bold text-cetus-accent mb-6"
          style={frauncesStyle}
        >
          [ SOUND ]
        </h3>

        <div className="space-y-6">
          <Toggle
            id="sound-enabled"
            name="soundEnabled"
            label="Sound Enabled"
            description="Enable or disable all game sounds"
            checked={clientPrefs.sound.soundEnabled}
            onCheckedChange={handleSoundEnabled}
          />

          <div
            id="volume-controls"
            className={cn(
              'space-y-4 transition-opacity',
              !clientPrefs.sound.soundEnabled &&
                'pointer-events-none opacity-50'
            )}
          >
            <Slider
              id="master-volume"
              name="masterVolume"
              label="Master Volume"
              min={0}
              max={100}
              step={5}
              value={clientPrefs.sound.masterVolume}
              unit="%"
              onValueChange={value => handleVolume('masterVolume', value)}
            />

            <Slider
              id="sfx-volume"
              name="sfxVolume"
              label="Sound Effects"
              min={0}
              max={100}
              step={5}
              value={clientPrefs.sound.sfxVolume}
              unit="%"
              onValueChange={value => handleVolume('sfxVolume', value)}
            />

            <Slider
              id="music-volume"
              name="musicVolume"
              label="Music"
              min={0}
              max={100}
              step={5}
              value={clientPrefs.sound.musicVolume}
              unit="%"
              onValueChange={value => handleVolume('musicVolume', value)}
            />
          </div>
        </div>
      </Card>

      {/* Display Settings */}
      <Card variant="glass" className="p-6 md:p-8 mb-6">
        <h3
          className="text-lg font-bold text-cetus-accent mb-6"
          style={frauncesStyle}
        >
          [ DISPLAY ]
        </h3>

        <div className="space-y-4">
          <Toggle
            id="reduced-motion"
            name="reducedMotion"
            label="Reduced Motion"
            description="Minimize animations for better accessibility"
            checked={clientPrefs.display.reducedMotion}
            onCheckedChange={handleReducedMotion}
          />
        </div>
      </Card>

      {/* Notification Settings */}
      <Card variant="glass" className="p-6 md:p-8 mb-6">
        <h3
          className="text-lg font-bold text-cetus-accent mb-6"
          style={frauncesStyle}
        >
          [ NOTIFICATIONS ]
        </h3>

        <div className="space-y-4">
          <Toggle
            id="email-notifications"
            name="emailNotifications"
            label="Email Notifications"
            description="Receive updates and reminders via email"
            checked={serverPrefs.emailNotifications}
            onCheckedChange={next =>
              handleServerToggle('emailNotifications', next)
            }
          />

          <Toggle
            id="push-notifications"
            name="pushNotifications"
            label="Push Notifications"
            description="Receive browser push notifications"
            checked={serverPrefs.pushNotifications}
            onCheckedChange={next =>
              handleServerToggle('pushNotifications', next)
            }
          />

          <Toggle
            id="challenge-reminders"
            name="challengeReminders"
            label="Daily Challenge Reminders"
            description="Get reminded about incomplete daily challenges"
            checked={serverPrefs.challengeReminders}
            onCheckedChange={next =>
              handleServerToggle('challengeReminders', next)
            }
          />
        </div>
      </Card>

      {/* Save Status Toast */}
      <div
        id="save-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-hidden={status === null}
        className={cn(
          'fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg text-white font-medium transition-all transform',
          status === null
            ? 'translate-y-20 opacity-0'
            : 'translate-y-0 opacity-100',
          status?.type === 'error' ? 'bg-cetus-accent-3' : 'bg-cetus-accent'
        )}
      >
        {status === null ? 'Settings saved!' : status.message}
      </div>
    </>
  )
}

export default SettingsPreferences
