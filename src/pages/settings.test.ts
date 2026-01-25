import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const settingsPath = resolve(process.cwd(), 'src/pages/settings.astro')
const settingsMarkup = readFileSync(settingsPath, 'utf-8')

describe('Settings password inputs', () => {
    it('uses theme-aware tokens for current password input', () => {
        expect(settingsMarkup).toMatch(
            /id="current-password"[\s\S]*class="[^"]*bg-background[^"]*text-foreground[^"]*"/
        )
    })

    it('uses theme-aware tokens for new password input', () => {
        expect(settingsMarkup).toMatch(
            /id="new-password"[\s\S]*class="[^"]*bg-background[^"]*text-foreground[^"]*"/
        )
    })

    it('uses theme-aware tokens for confirm password input', () => {
        expect(settingsMarkup).toMatch(
            /id="confirm-password"[\s\S]*class="[^"]*bg-background[^"]*text-foreground[^"]*"/
        )
    })

    it('uses destructive color for password errors', () => {
        expect(settingsMarkup).toMatch(
            /id="password-error"[\s\S]*class="[^"]*text-destructive[^"]*"/
        )
    })
})
