import { type Page, type Locator } from '@playwright/test'

export class HomePage {
    readonly page: Page
    readonly navigation: Locator
    readonly logo: Locator
    readonly catalogSection: Locator
    readonly loginButton: Locator

    constructor(page: Page) {
        this.page = page
        // Scope to the shell header nav — the abyssal homepage also renders a
        // <nav aria-label="Featured games"> around the hero specimen grid, so a
        // bare `page.locator('nav')` is ambiguous here.
        this.navigation = page.locator('header nav')
        this.logo = page.getByRole('link', { name: 'C CETUS' })
        // The depth-zoned catalog section (replaces the old "SELECT YOUR GAME"
        // gamesSection locator; #games is a legacy deep-link anchor, #catalog
        // is the actual specimen grid).
        this.catalogSection = page.locator('#catalog')
        this.loginButton = page.getByRole('button', { name: 'Login' })
    }

    async goto() {
        await this.page.goto('/')
    }

    // A specimen is an <a data-testid="specimen-card"> whose accessible name
    // embeds the game name (there is no separate "Play Now" link — the whole
    // vessel is the link). Featured games render twice (hero vitrine + their
    // depth zone), so always click the first match; both link to the same URL.
    async clickGameCard(gameName: string) {
        const card = this.page
            .getByTestId('specimen-card')
            .filter({ hasText: gameName })
            .first()
        await card.click()
    }

    async clickNavLink(linkText: string) {
        const navLink = this.navigation.getByRole('link', { name: linkText })
        await navLink.click()
    }

    async clickLogin() {
        await this.loginButton.first().click()
    }

    // Game navigation methods
    async goToTetris() {
        await this.clickGameCard('Tetris Challenge')
    }

    async goToBubbleShooter() {
        await this.clickGameCard('Bubble Shooter')
    }

    async goToQuickMath() {
        await this.clickGameCard('Quick Math')
    }

    async goToMemoryMatrix() {
        await this.clickGameCard('Memory Matrix')
    }

    async goToWordScramble() {
        await this.clickGameCard('Word Scramble')
    }
}
