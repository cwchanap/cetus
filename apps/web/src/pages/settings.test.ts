import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const settingsMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/settings.astro'),
    'utf-8'
)

describe('Settings password controls', () => {
    it('does not include password change markup or client behavior', () => {
        // Positive assertions: verify expected settings UI is present
        expect(settingsMarkup).toContain('id="delete-account-btn"')
        expect(settingsMarkup).toContain('id="sound-enabled"')
        expect(settingsMarkup).toContain('id="master-volume"')
        expect(settingsMarkup).toContain('id="email-notifications"')

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
    })
})
