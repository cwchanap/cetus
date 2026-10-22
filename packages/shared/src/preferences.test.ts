import { describe, it, expect } from 'vitest'
import {
    DEFAULT_CLIENT_PREFERENCES,
    DEFAULT_NOTIFICATION_PREFERENCES,
    PREFERENCES_STORAGE_KEY,
} from './preferences'

describe('Default Preferences', () => {
    it('should have valid default client preferences', () => {
        expect(DEFAULT_CLIENT_PREFERENCES.sound.masterVolume).toBe(70)
        expect(DEFAULT_CLIENT_PREFERENCES.sound.sfxVolume).toBe(80)
        expect(DEFAULT_CLIENT_PREFERENCES.sound.musicVolume).toBe(60)
        expect(DEFAULT_CLIENT_PREFERENCES.sound.soundEnabled).toBe(true)
        expect(DEFAULT_CLIENT_PREFERENCES.display.reducedMotion).toBe(false)
    })

    it('should have valid default notification preferences', () => {
        expect(DEFAULT_NOTIFICATION_PREFERENCES.emailNotifications).toBe(true)
        expect(DEFAULT_NOTIFICATION_PREFERENCES.pushNotifications).toBe(false)
        expect(DEFAULT_NOTIFICATION_PREFERENCES.challengeReminders).toBe(true)
    })

    it('should have volume values in valid range (0-100)', () => {
        expect(
            DEFAULT_CLIENT_PREFERENCES.sound.masterVolume
        ).toBeGreaterThanOrEqual(0)
        expect(
            DEFAULT_CLIENT_PREFERENCES.sound.masterVolume
        ).toBeLessThanOrEqual(100)
        expect(
            DEFAULT_CLIENT_PREFERENCES.sound.sfxVolume
        ).toBeGreaterThanOrEqual(0)
        expect(DEFAULT_CLIENT_PREFERENCES.sound.sfxVolume).toBeLessThanOrEqual(
            100
        )
        expect(
            DEFAULT_CLIENT_PREFERENCES.sound.musicVolume
        ).toBeGreaterThanOrEqual(0)
        expect(
            DEFAULT_CLIENT_PREFERENCES.sound.musicVolume
        ).toBeLessThanOrEqual(100)
    })

    it('should expose the shared localStorage key', () => {
        expect(PREFERENCES_STORAGE_KEY).toBe('cetus_preferences')
    })
})
