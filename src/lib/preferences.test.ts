import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    DEFAULT_CLIENT_PREFERENCES,
    DEFAULT_NOTIFICATION_PREFERENCES,
    PREFERENCES_STORAGE_KEY,
    getClientPreferences,
    saveClientPreferences,
    updateSoundPreference,
    updateDisplayPreference,
    getEffectiveVolume,
    prefersReducedMotion,
    resolveTheme,
    onPreferencesChanged,
    type ClientPreferences,
} from './preferences'

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key]
        }),
        clear: vi.fn(() => {
            store = {}
        }),
    }
})()

// Mock window
const windowMock = {
    localStorage: localStorageMock,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    matchMedia: vi.fn(() => ({
        matches: false,
    })),
}

// Set up global mocks
vi.stubGlobal('localStorage', localStorageMock)
vi.stubGlobal('window', windowMock)

describe('Default Preferences', () => {
    it('should have valid default client preferences', () => {
        expect(DEFAULT_CLIENT_PREFERENCES.sound.masterVolume).toBe(70)
        expect(DEFAULT_CLIENT_PREFERENCES.sound.sfxVolume).toBe(80)
        expect(DEFAULT_CLIENT_PREFERENCES.sound.musicVolume).toBe(60)
        expect(DEFAULT_CLIENT_PREFERENCES.sound.soundEnabled).toBe(true)
        expect(DEFAULT_CLIENT_PREFERENCES.display.reducedMotion).toBe(false)
        expect(DEFAULT_CLIENT_PREFERENCES.display.theme).toBe('dark')
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
})

describe('getClientPreferences', () => {
    beforeEach(() => {
        localStorageMock.clear()
        vi.clearAllMocks()
    })

    it('should return defaults when localStorage is empty', () => {
        const prefs = getClientPreferences()
        expect(prefs).toEqual(DEFAULT_CLIENT_PREFERENCES)
    })

    it('should return stored preferences when available', () => {
        const customPrefs: ClientPreferences = {
            sound: {
                masterVolume: 50,
                sfxVolume: 60,
                musicVolume: 40,
                soundEnabled: false,
            },
            display: {
                reducedMotion: true,
                theme: 'dark',
            },
        }
        localStorageMock.setItem(
            PREFERENCES_STORAGE_KEY,
            JSON.stringify(customPrefs)
        )

        const prefs = getClientPreferences()
        expect(prefs.sound.masterVolume).toBe(50)
        expect(prefs.sound.soundEnabled).toBe(false)
        expect(prefs.display.reducedMotion).toBe(true)
    })

    it('should merge with defaults for partial stored preferences', () => {
        const partialPrefs = {
            sound: { masterVolume: 30 },
        }
        localStorageMock.setItem(
            PREFERENCES_STORAGE_KEY,
            JSON.stringify(partialPrefs)
        )

        const prefs = getClientPreferences()
        expect(prefs.sound.masterVolume).toBe(30)
        // Should use defaults for missing values
        expect(prefs.sound.sfxVolume).toBe(
            DEFAULT_CLIENT_PREFERENCES.sound.sfxVolume
        )
        expect(prefs.display.reducedMotion).toBe(
            DEFAULT_CLIENT_PREFERENCES.display.reducedMotion
        )
    })

    it('should return defaults on JSON parse error', () => {
        localStorageMock.setItem(PREFERENCES_STORAGE_KEY, 'invalid json')

        const prefs = getClientPreferences()
        expect(prefs).toEqual(DEFAULT_CLIENT_PREFERENCES)
    })
})

describe('saveClientPreferences', () => {
    beforeEach(() => {
        localStorageMock.clear()
        vi.clearAllMocks()
    })

    it('should save preferences to localStorage', () => {
        const prefs: ClientPreferences = {
            sound: {
                masterVolume: 80,
                sfxVolume: 90,
                musicVolume: 70,
                soundEnabled: true,
            },
            display: {
                reducedMotion: false,
                theme: 'dark',
            },
        }

        saveClientPreferences(prefs)

        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            PREFERENCES_STORAGE_KEY,
            JSON.stringify(prefs)
        )
    })

    it('should dispatch preferences-updated event', () => {
        const prefs = DEFAULT_CLIENT_PREFERENCES

        saveClientPreferences(prefs)

        expect(windowMock.dispatchEvent).toHaveBeenCalled()
    })
})

describe('updateSoundPreference', () => {
    beforeEach(() => {
        localStorageMock.clear()
        vi.clearAllMocks()
    })

    it('should update master volume', () => {
        updateSoundPreference('masterVolume', 50)

        const saved = JSON.parse(
            localStorageMock.setItem.mock.calls[0][1]
        ) as ClientPreferences
        expect(saved.sound.masterVolume).toBe(50)
    })

    it('should update soundEnabled', () => {
        updateSoundPreference('soundEnabled', false)

        const saved = JSON.parse(
            localStorageMock.setItem.mock.calls[0][1]
        ) as ClientPreferences
        expect(saved.sound.soundEnabled).toBe(false)
    })
})

describe('updateDisplayPreference', () => {
    beforeEach(() => {
        localStorageMock.clear()
        vi.clearAllMocks()
    })

    it('should update reducedMotion', () => {
        updateDisplayPreference('reducedMotion', true)

        const saved = JSON.parse(
            localStorageMock.setItem.mock.calls[0][1]
        ) as ClientPreferences
        expect(saved.display.reducedMotion).toBe(true)
    })

    it('should update theme', () => {
        updateDisplayPreference('theme', 'light')

        const saved = JSON.parse(
            localStorageMock.setItem.mock.calls[0][1]
        ) as ClientPreferences
        expect(saved.display.theme).toBe('light')
    })
})

describe('getEffectiveVolume', () => {
    it('should calculate effective SFX volume', () => {
        const prefs: ClientPreferences = {
            sound: {
                masterVolume: 50, // 0.5
                sfxVolume: 80, // 0.8
                musicVolume: 60,
                soundEnabled: true,
            },
            display: { reducedMotion: false, theme: 'dark' },
        }

        // 0.5 * 0.8 = 0.4
        expect(getEffectiveVolume('sfx', prefs)).toBeCloseTo(0.4, 2)
    })

    it('should calculate effective music volume', () => {
        const prefs: ClientPreferences = {
            sound: {
                masterVolume: 100, // 1.0
                sfxVolume: 80,
                musicVolume: 50, // 0.5
                soundEnabled: true,
            },
            display: { reducedMotion: false, theme: 'dark' },
        }

        // 1.0 * 0.5 = 0.5
        expect(getEffectiveVolume('music', prefs)).toBeCloseTo(0.5, 2)
    })

    it('should return 0 when sound is disabled', () => {
        const prefs: ClientPreferences = {
            sound: {
                masterVolume: 100,
                sfxVolume: 100,
                musicVolume: 100,
                soundEnabled: false,
            },
            display: { reducedMotion: false, theme: 'dark' },
        }

        expect(getEffectiveVolume('sfx', prefs)).toBe(0)
        expect(getEffectiveVolume('music', prefs)).toBe(0)
    })

    it('should handle zero master volume', () => {
        const prefs: ClientPreferences = {
            sound: {
                masterVolume: 0,
                sfxVolume: 100,
                musicVolume: 100,
                soundEnabled: true,
            },
            display: { reducedMotion: false, theme: 'dark' },
        }

        expect(getEffectiveVolume('sfx', prefs)).toBe(0)
        expect(getEffectiveVolume('music', prefs)).toBe(0)
    })
})

describe('prefersReducedMotion', () => {
    beforeEach(() => {
        localStorageMock.clear()
        vi.clearAllMocks()
    })

    it('should return true when user preference is set', () => {
        const prefs: ClientPreferences = {
            sound: DEFAULT_CLIENT_PREFERENCES.sound,
            display: { reducedMotion: true, theme: 'dark' },
        }
        localStorageMock.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs))

        expect(prefersReducedMotion()).toBe(true)
    })

    it('should check system preference when user preference is false', () => {
        const prefs: ClientPreferences = {
            sound: DEFAULT_CLIENT_PREFERENCES.sound,
            display: { reducedMotion: false, theme: 'dark' },
        }
        localStorageMock.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs))

        // Mock system prefers reduced motion
        windowMock.matchMedia.mockReturnValueOnce({ matches: true })

        expect(prefersReducedMotion()).toBe(true)
    })

    it('should return false when neither user nor system prefers reduced motion', () => {
        const prefs: ClientPreferences = {
            sound: DEFAULT_CLIENT_PREFERENCES.sound,
            display: { reducedMotion: false, theme: 'dark' },
        }
        localStorageMock.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs))

        windowMock.matchMedia.mockReturnValueOnce({ matches: false })

        expect(prefersReducedMotion()).toBe(false)
    })
})

describe('resolveTheme', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return explicit dark theme without checking system', () => {
        expect(resolveTheme('dark')).toBe('dark')
        expect(windowMock.matchMedia).not.toHaveBeenCalled()
    })

    it('should return explicit light theme without checking system', () => {
        expect(resolveTheme('light')).toBe('light')
        expect(windowMock.matchMedia).not.toHaveBeenCalled()
    })

    it('should resolve auto theme based on system preference', () => {
        windowMock.matchMedia.mockReturnValueOnce({ matches: true })
        expect(resolveTheme('auto')).toBe('dark')

        windowMock.matchMedia.mockReturnValueOnce({ matches: false })
        expect(resolveTheme('auto')).toBe('light')
    })
})

describe('onPreferencesChanged', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should add an event listener and call callback when preferences change', () => {
        const callback = vi.fn()
        const cleanup = onPreferencesChanged(callback)

        expect(windowMock.addEventListener).toHaveBeenCalledWith(
            'preferences-updated',
            expect.any(Function)
        )

        // Simulate event firing via the registered handler
        const handler = windowMock.addEventListener.mock.calls.find(
            (call: unknown[]) => call[0] === 'preferences-updated'
        )?.[1]
        if (handler) {
            handler(
                new CustomEvent('preferences-updated', {
                    detail: DEFAULT_CLIENT_PREFERENCES,
                })
            )
        }
        expect(callback).toHaveBeenCalledWith(DEFAULT_CLIENT_PREFERENCES)

        cleanup()
        expect(windowMock.removeEventListener).toHaveBeenCalled()
    })
})

describe('saveClientPreferences error handling', () => {
    it('should log error if localStorage.setItem throws', () => {
        const consoleErrorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        vi.mocked(localStorageMock.setItem).mockImplementationOnce(() => {
            throw new Error('storage full')
        })

        expect(() =>
            saveClientPreferences(DEFAULT_CLIENT_PREFERENCES)
        ).not.toThrow()
        expect(consoleErrorSpy).toHaveBeenCalled()

        consoleErrorSpy.mockRestore()
    })
})

describe('getClientPreferences - edge cases', () => {
    it('should return defaults when stored data has array as sound section', () => {
        localStorageMock.getItem.mockReturnValueOnce(
            JSON.stringify({ sound: [1, 2, 3], display: { theme: 'dark' } })
        )
        const prefs = getClientPreferences()
        expect(prefs).toEqual(DEFAULT_CLIENT_PREFERENCES)
    })

    it('should return defaults when stored data has array as display section', () => {
        localStorageMock.getItem.mockReturnValueOnce(
            JSON.stringify({ sound: {}, display: ['a', 'b'] })
        )
        const prefs = getClientPreferences()
        expect(prefs).toEqual(DEFAULT_CLIENT_PREFERENCES)
    })

    it('should use defaults for invalid volume values', () => {
        localStorageMock.getItem.mockReturnValueOnce(
            JSON.stringify({
                sound: {
                    masterVolume: -10,
                    sfxVolume: 999,
                    musicVolume: 'loud',
                    soundEnabled: 'yes',
                },
                display: { reducedMotion: 'yes', theme: 'ultraviolet' },
            })
        )
        const prefs = getClientPreferences()
        expect(prefs.sound.masterVolume).toBe(
            DEFAULT_CLIENT_PREFERENCES.sound.masterVolume
        )
        expect(prefs.sound.sfxVolume).toBe(
            DEFAULT_CLIENT_PREFERENCES.sound.sfxVolume
        )
        expect(prefs.sound.musicVolume).toBe(
            DEFAULT_CLIENT_PREFERENCES.sound.musicVolume
        )
        expect(prefs.sound.soundEnabled).toBe(
            DEFAULT_CLIENT_PREFERENCES.sound.soundEnabled
        )
        expect(prefs.display.reducedMotion).toBe(
            DEFAULT_CLIENT_PREFERENCES.display.reducedMotion
        )
        expect(prefs.display.theme).toBe(
            DEFAULT_CLIENT_PREFERENCES.display.theme
        )
    })
})
