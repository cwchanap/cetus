/**
 * User Preferences System
 * Client-side preferences stored in localStorage for instant access
 * Server-side notification preferences synced with database
 */

/**
 * Sound settings (stored client-side in localStorage)
 */
export interface SoundSettings {
    masterVolume: number // 0-100
    sfxVolume: number // 0-100
    musicVolume: number // 0-100
    soundEnabled: boolean
}

/**
 * Display settings (stored client-side in localStorage)
 */
export interface DisplaySettings {
    reducedMotion: boolean
    theme: 'dark' | 'light' | 'auto'
}

/**
 * Notification settings (stored server-side in database)
 */
export interface NotificationSettings {
    emailNotifications: boolean
    pushNotifications: boolean
    challengeReminders: boolean
}

/**
 * Complete client-side preferences
 */
export interface ClientPreferences {
    sound: SoundSettings
    display: DisplaySettings
}

/**
 * Default client preferences
 */
export const DEFAULT_CLIENT_PREFERENCES: ClientPreferences = {
    sound: {
        masterVolume: 70,
        sfxVolume: 80,
        musicVolume: 60,
        soundEnabled: true,
    },
    display: {
        reducedMotion: false,
        theme: 'dark',
    },
}

/**
 * Default notification preferences
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationSettings = {
    emailNotifications: true,
    pushNotifications: false,
    challengeReminders: true,
}

export const PREFERENCES_STORAGE_KEY = 'cetus_preferences'

/**
 * Resolve the effective theme, handling auto mode with system preference.
 */
export function resolveTheme(
    theme: DisplaySettings['theme']
): 'dark' | 'light' {
    if (theme === 'auto') {
        if (typeof window === 'undefined') {
            return 'dark'
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
    }
    return theme
}

/**
 * Get client preferences from localStorage
 */
export function getClientPreferences(): ClientPreferences {
    if (typeof window === 'undefined') {
        return DEFAULT_CLIENT_PREFERENCES
    }

    try {
        const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY)
        if (!stored) {
            return DEFAULT_CLIENT_PREFERENCES
        }

        const parsed = JSON.parse(stored)

        // Validate structure - allow partial objects, validate section-level type if present
        const isValid =
            typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            (parsed.sound === undefined ||
                (typeof parsed.sound === 'object' &&
                    parsed.sound !== null &&
                    !Array.isArray(parsed.sound))) &&
            (parsed.display === undefined ||
                (typeof parsed.display === 'object' &&
                    parsed.display !== null &&
                    !Array.isArray(parsed.display)))

        if (!isValid) {
            console.warn('Invalid preferences format, using defaults')
            return DEFAULT_CLIENT_PREFERENCES
        }

        // Get sound section or use defaults
        const soundData = parsed.sound || {}
        // Get display section or use defaults
        const displayData = parsed.display || {}

        // Validate and sanitize sound settings
        const validateVolume = (val: unknown, defaultVal: number): number => {
            return typeof val === 'number' && val >= 0 && val <= 100
                ? val
                : defaultVal
        }

        const soundBool = (val: unknown): boolean => {
            return typeof val === 'boolean'
                ? val
                : DEFAULT_CLIENT_PREFERENCES.sound.soundEnabled
        }

        // Validate and sanitize display settings
        const displayBool = (val: unknown): boolean => {
            return typeof val === 'boolean'
                ? val
                : DEFAULT_CLIENT_PREFERENCES.display.reducedMotion
        }

        const displayTheme = (val: unknown): 'dark' | 'light' | 'auto' => {
            return val === 'dark' || val === 'light' || val === 'auto'
                ? val
                : DEFAULT_CLIENT_PREFERENCES.display.theme
        }

        // Build sanitized preferences with validation
        return {
            sound: {
                masterVolume: validateVolume(
                    soundData.masterVolume,
                    DEFAULT_CLIENT_PREFERENCES.sound.masterVolume
                ),
                sfxVolume: validateVolume(
                    soundData.sfxVolume,
                    DEFAULT_CLIENT_PREFERENCES.sound.sfxVolume
                ),
                musicVolume: validateVolume(
                    soundData.musicVolume,
                    DEFAULT_CLIENT_PREFERENCES.sound.musicVolume
                ),
                soundEnabled: soundBool(soundData.soundEnabled),
            },
            display: {
                reducedMotion: displayBool(displayData.reducedMotion),
                theme: displayTheme(displayData.theme),
            },
        }
    } catch (error) {
        console.error('Failed to load preferences:', error)
        return DEFAULT_CLIENT_PREFERENCES
    }
}

/**
 * Save client preferences to localStorage
 */
export function saveClientPreferences(preferences: ClientPreferences): void {
    if (typeof window === 'undefined') {
        return
    }

    try {
        localStorage.setItem(
            PREFERENCES_STORAGE_KEY,
            JSON.stringify(preferences)
        )

        // Dispatch custom event for other components to react
        window.dispatchEvent(
            new CustomEvent('preferences-updated', {
                detail: preferences,
            })
        )
    } catch (error) {
        console.error('Failed to save preferences:', error)
    }
}

/**
 * Update a specific sound preference
 */
export function updateSoundPreference<K extends keyof SoundSettings>(
    key: K,
    value: SoundSettings[K]
): void {
    const current = getClientPreferences()
    current.sound[key] = value
    saveClientPreferences(current)
}

/**
 * Update a specific display preference
 */
export function updateDisplayPreference<K extends keyof DisplaySettings>(
    key: K,
    value: DisplaySettings[K]
): void {
    const current = getClientPreferences()
    current.display[key] = value
    saveClientPreferences(current)
}

/**
 * Get the effective volume (master * category)
 */
export function getEffectiveVolume(
    category: 'sfx' | 'music',
    preferences?: ClientPreferences
): number {
    const prefs = preferences || getClientPreferences()

    if (!prefs.sound.soundEnabled) {
        return 0
    }

    const masterVolume = prefs.sound.masterVolume / 100
    const categoryVolume =
        category === 'sfx'
            ? prefs.sound.sfxVolume / 100
            : prefs.sound.musicVolume / 100

    return masterVolume * categoryVolume
}

/**
 * Check if reduced motion is preferred
 */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') {
        return false
    }

    const prefs = getClientPreferences()

    // Check user's explicit preference first
    if (prefs.display.reducedMotion) {
        return true
    }

    // Fall back to system preference
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Listen for preference changes
 */
export function onPreferencesChanged(
    callback: (preferences: ClientPreferences) => void
): () => void {
    if (typeof window === 'undefined') {
        return () => {}
    }

    const handler = (event: Event) => {
        const customEvent = event as CustomEvent<ClientPreferences>
        callback(customEvent.detail)
    }

    window.addEventListener('preferences-updated', handler)

    return () => {
        window.removeEventListener('preferences-updated', handler)
    }
}
