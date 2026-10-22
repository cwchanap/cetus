/**
 * User Preferences System — portable types and defaults
 *
 * Client-side preferences stored in localStorage for instant access;
 * server-side notification preferences synced with database. The types and
 * defaults are shared across hosts; the `window`/storage/event utilities
 * that materialize them remain web-side (`apps/web/src/lib/preferences.ts`).
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
