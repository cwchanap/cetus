import { Page, Locator } from '@playwright/test'

export class HomePage {
    readonly page: Page
    readonly navigation: Locator
    readonly logo: Locator
    readonly gamesSection: Locator
    readonly loginButton: Locator

    constructor(page: Page) {
        this.page = page
        this.navigation = page.locator('nav')
        this.logo = page.locator('text=CETUS')
        this.gamesSection = page.locator('text=SELECT YOUR GAME')
        this.loginButton = page.getByRole('button', { name: 'Login' })
    }

    async goto() {
        await this.page.goto('/')
    }

    async clickGamePlayNow(gameName: string) {
        const gameCard = this.page
            .locator(`text="${gameName}"`)
            .locator('..')
            .locator('..')
        const playNowLink = gameCard.locator('text="Play Now"')
        await playNowLink.click()
    }

    async clickNavLink(linkText: string) {
        const navLink = this.navigation.locator(`text="${linkText}"`)
        await navLink.click()
    }

    async clickStartPlaying() {
        await this.page.getByRole('link', { name: 'Start Playing' }).click()
    }

    async clickLogin() {
        await this.loginButton.click()
    }

    // Game navigation methods
    async goToTetris() {
        await this.clickGamePlayNow('Tetris Challenge')
    }

    async goToQuickDraw() {
        await this.clickGamePlayNow('Quick Draw')
    }

    async goToBubbleShooter() {
        await this.clickGamePlayNow('Bubble Shooter')
    }

    async goToQuickMath() {
        await this.clickGamePlayNow('Quick Math')
    }

    async goToMemoryMatrix() {
        await this.clickGamePlayNow('Memory Matrix')
    }

    async goToWordScramble() {
        await this.clickGamePlayNow('Word Scramble')
    }
}
