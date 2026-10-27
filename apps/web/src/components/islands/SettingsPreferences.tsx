import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ApiClientError, createApiClient } from '@cetus/api-client/api-client'
import type { NotificationSettingsResponse } from '@cetus/shared/api-dto'
import {
  DEFAULT_CLIENT_PREFERENCES,
  type ClientPreferences,
} from '@cetus/shared/preferences'
import { Card, Slider, Toggle, cn, displayFontStyle } from '@cetus/ui'
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
  // The save toast is portaled to document.body so its z-50 is not trapped
  // in <main>'s stacking context (Footer could paint above it). Portals
  // need `document`, so only render after mount — hydration-safe.
  const [mounted, setMounted] = useState(false)

  // Mirror stored client preferences into the controls after mount
  // (hydration-safe: server and first client render use the defaults).
  useEffect(() => {
    setMounted(true)
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

  // `desired` is the latest user intent; `confirmed` is the last value the
  // server is known to hold (props initially, then each successful save —
  // every save writes the key's whole value, so it doubles as the revert
  // target). Refs because the drain below reads them after async gaps.
  const desired = useRef({
    emailNotifications,
    pushNotifications,
    challengeReminders,
  })
  const confirmed = useRef({
    emailNotifications,
    pushNotifications,
    challengeReminders,
  })
  const draining = useRef<Record<ServerPrefKey, boolean>>({
    emailNotifications: false,
    pushNotifications: false,
    challengeReminders: false,
  })

  // Per-key save serializer: while intent differs from the confirmed
  // server value, persist the latest intent. Clicks landing during an
  // in-flight save just move `desired` — the running loop picks them up
  // after its current await — so writes stay ordered and coalesce to the
  // last selected value instead of racing to the server out of order.
  const drainServerSaves = async (key: ServerPrefKey) => {
    if (draining.current[key]) {
      return
    }
    draining.current[key] = true
    try {
      while (desired.current[key] !== confirmed.current[key]) {
        const target = desired.current[key]
        const payload: Partial<NotificationSettingsResponse> = {}
        payload[WIRE_KEYS[key]] = target
        try {
          await api.updateSettings(payload)
          confirmed.current[key] = target
          showStatus('Saved!', 'success')
        } catch (error) {
          console.error('Failed to save preference:', error)
          // Abandon the failed intent only when it is still the latest —
          // a re-toggle during the failed save keeps `desired` pointing
          // at the newer value, which the loop may still pursue.
          if (desired.current[key] === target) {
            desired.current[key] = confirmed.current[key]
            setServerPrefs(prev => ({
              ...prev,
              [key]: confirmed.current[key],
            }))
          }
          showStatus(describeSaveError(error), 'error')
        }
      }
    } finally {
      draining.current[key] = false
    }
  }

  const handleServerToggle = (key: ServerPrefKey, next: boolean) => {
    if (next === desired.current[key]) {
      return
    }
    desired.current[key] = next
    // Optimistic update; revert from React state when the save fails.
    setServerPrefs(prev => ({ ...prev, [key]: next }))
    void drainServerSaves(key)
  }

  return (
    <>
      {/* Sound Settings */}
      <Card variant="glass" className="p-6 md:p-8 mb-6">
        <h3
          className="text-lg font-bold text-cetus-accent mb-6"
          style={displayFontStyle}
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
          style={displayFontStyle}
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
          style={displayFontStyle}
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

      {/* Save Status Toast — portaled to body so `fixed` escapes
          <main>'s stacking context (z-order parity with the old
          controller-owned toast) */}
      {mounted &&
        createPortal(
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
          </div>,
          document.body
        )}
    </>
  )
}

export default SettingsPreferences
