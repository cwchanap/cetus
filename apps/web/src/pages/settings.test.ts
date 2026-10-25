import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { appRoot } from '@/test/app-root'

const settingsMarkup = readFileSync(
    resolve(appRoot, 'src/pages/settings.astro'),
    'utf-8'
)
const islandSource = readFileSync(
    resolve(appRoot, 'src/components/islands/SettingsPreferences.tsx'),
    'utf-8'
)

describe('Settings password controls', () => {
    it('does not include password change markup or client behavior', () => {
        // Positive assertions: verify expected settings UI is present — page
        // controls live in the hydrated SettingsPreferences island (HPA-379).
        expect(settingsMarkup).toContain('id="delete-account-btn"')
        expect(islandSource).toContain('id="sound-enabled"')
        expect(islandSource).toContain('id="master-volume"')
        expect(islandSource).toContain('id="email-notifications"')

        // Negative assertions: password controls must not be present
        expect(settingsMarkup).not.toContain('id="change-password-btn"')
        expect(settingsMarkup).not.toContain('id="password-change-form"')
        expect(settingsMarkup).not.toContain('id="current-password"')
        expect(settingsMarkup).not.toContain('id="new-password"')
        expect(settingsMarkup).not.toContain('id="confirm-password"')
        expect(settingsMarkup).not.toContain('id="password-error"')
        expect(settingsMarkup).not.toContain('authClient.changePassword')
        expect(settingsMarkup).not.toContain('setupPasswordChangeListeners')
        expect(settingsMarkup).not.toContain('data-toggle-password')
        expect(islandSource).not.toContain('id="change-password-btn"')
        expect(islandSource).not.toContain('authClient.changePassword')
    })

    it('keeps authentication and server DB fetching in the page, not the island', () => {
        expect(settingsMarkup).toContain('Astro.redirect')
        expect(settingsMarkup).toContain('getUserPreferences')
        expect(settingsMarkup).toContain('client:load')
        expect(islandSource).not.toContain('Astro.redirect')
    })
})
