import { Page, Locator } from '@playwright/test'

export class GamePage {
    readonly page: Page
    readonly navigation: Locator
    readonly logo: Locator
    readonly homeLink: Locator
    readonly loginButton: Locator

    constructor(page: Page) {
        this.page = page
        this.navigation = page.locator('nav')
        this.logo = page.getByRole('link', { name: 'C CETUS' })
        this.homeLink = page.getByRole('link', { name: 'Home' })
        this.loginButton = page.getByRole('button', { name: 'Login' })
    }

    async navigateToHome() {
        await this.homeLink.click()
    }

    async navigateToHomeViaLogo() {
        await this.logo.click()
    }

    async navigateToLogin() {
        await this.loginButton.click()
    }
}

export class TetrisPage extends GamePage {
    readonly gameTitle: Locator
    readonly scoreDisplay: Locator
    readonly levelDisplay: Locator
    readonly linesDisplay: Locator
    readonly startButton: Locator
    readonly pauseButton: Locator
    readonly resumeButton: Locator
    readonly endGameButton: Locator
    readonly resetButton: Locator
    readonly controlsSection: Locator
    readonly statisticsSection: Locator
    readonly nextPieceSection: Locator

    constructor(page: Page) {
        super(page)
        this.gameTitle = page.getByRole('heading', { name: 'TETRIS CHALLENGE' })
        this.scoreDisplay = page.locator('text=Score:').locator('..')
        this.levelDisplay = page.locator('text=Level:').locator('..')
        this.linesDisplay = page.locator('text=Lines:').locator('..')
        this.startButton = page.locator('#start-btn')
        this.pauseButton = page.locator('#pause-btn')
        this.resumeButton = page.locator('#pause-btn') // Same button, changes text
        this.endGameButton = page.locator('#end-btn')
        this.resetButton = page.locator('#reset-btn')
        this.controlsSection = page.getByRole('heading', { name: 'CONTROLS' })
        this.statisticsSection = page.getByRole('heading', {
            name: 'STATISTICS',
        })
        this.nextPieceSection = page.getByRole('heading', {
            name: 'NEXT PIECE',
        })
    }

    async goto() {
        await this.page.goto('/tetris')
    }

    async startGame() {
        await this.startButton.click()
    }

    async pauseGame() {
        await this.pauseButton.click()
    }

    async resumeGame() {
        await this.resumeButton.click()
    }

    async endGame() {
        await this.endGameButton.click()
    }

    async resetGame() {
        await this.resetButton.click()
    }
}

export class QuickMathPage extends GamePage {
    readonly gameTitle: Locator
    readonly scoreDisplay: Locator
    readonly timeDisplay: Locator
    readonly answerInput: Locator
    readonly submitButton: Locator
    readonly startGameButton: Locator
    readonly endGameButton: Locator
    readonly problemDisplay: Locator
    readonly rulesSection: Locator
    readonly tipsSection: Locator
    readonly controlsSection: Locator
    readonly questionsCount: Locator
    readonly correctCount: Locator

    constructor(page: Page) {
        super(page)
        this.gameTitle = page.getByRole('heading', { name: 'QUICK MATH' })
        this.scoreDisplay = page.locator('text=Score:').locator('..')
        this.timeDisplay = page.locator('text=Time:').locator('..')
        this.answerInput = page.getByRole('textbox', { name: 'Enter answer' })
        this.submitButton = page.getByRole('button', { name: 'Submit Answer' })
        this.startGameButton = page.getByRole('button', { name: 'Start Game' })
        this.endGameButton = page.getByRole('button', { name: 'End Game' })
        this.problemDisplay = page.locator('#question')
        this.rulesSection = page.getByRole('heading', { name: 'GAME RULES' })
        this.tipsSection = page.getByRole('heading', { name: 'TIPS' })
        this.controlsSection = page.getByRole('heading', { name: 'CONTROLS' })
        this.questionsCount = page.locator('text=Questions').locator('..')
        this.correctCount = page.locator('text=Correct').locator('..')
    }

    async goto() {
        await this.page.goto('/quick-math')
    }

    async startGame() {
        await this.startGameButton.click()
    }

    async endGame() {
        await this.endGameButton.click()
    }

    async submitAnswer(answer: string) {
        await this.answerInput.fill(answer)
        await this.answerInput.press('Enter')
    }

    async getProblemText(): Promise<string | null> {
        return await this.problemDisplay.textContent()
    }

    async calculateCorrectAnswer(): Promise<number> {
        const problemText = await this.getProblemText()
        if (!problemText) {
            throw new Error('No problem text found')
        }

        if (problemText.includes('+')) {
            const [a, b] = problemText.split('+').map(n => parseInt(n.trim()))
            return a + b
        } else if (problemText.includes('-')) {
            const [a, b] = problemText.split('-').map(n => parseInt(n.trim()))
            return a - b
        } else {
            throw new Error('Invalid problem format')
        }
    }
}
