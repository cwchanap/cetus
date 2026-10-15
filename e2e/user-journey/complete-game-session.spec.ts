import { test, expect } from '@playwright/test'
import { HomePage } from '../pages/HomePage'
import { TetrisPage, QuickMathPage } from '../pages/GamePage'

test.describe('Complete Game Session User Journey', () => {
    test('should complete a full gaming session from homepage to multiple games', async ({
        page,
    }) => {
        const homePage = new HomePage(page)
        const tetrisPage = new TetrisPage(page)
        const quickMathPage = new QuickMathPage(page)

        // Start from homepage
        await homePage.goto()
        await expect(homePage.catalogSection).toBeVisible()

        // Navigate to Tetris game
        await homePage.goToTetris()
        await expect(page).toHaveURL('/tetris')
        await expect(tetrisPage.gameTitle).toBeVisible()

        // Wait for game canvas to be fully rendered (indicates PixiJS is ready)
        await expect(page.locator('#tetris-container canvas')).toBeVisible({
            timeout: 10000,
        })

        // Play Tetris briefly. The field plate gates the dive behind the
        // intro sheet; starting closes the sheet and enables header pause.
        await expect(tetrisPage.startButton).toBeEnabled({ timeout: 10000 })
        await tetrisPage.startGame()
        await expect(tetrisPage.fieldSheet).not.toBeVisible()
        await expect(tetrisPage.pauseButton).toBeEnabled()

        // Test pause/resume functionality
        await tetrisPage.pauseGame()
        await expect(tetrisPage.pausePanel).toBeVisible()
        await tetrisPage.resumeGame()
        await expect(tetrisPage.fieldSheet).not.toBeVisible()

        // Reset Tetris game to return to a fresh run
        await tetrisPage.pauseGame()
        await tetrisPage.resetGame()
        await expect(tetrisPage.fieldSheet).not.toBeVisible()

        // Navigate back to homepage (field plate headers link to the
        // catalogue anchor)
        await tetrisPage.navigateToHome()
        await expect(page).toHaveURL('/#games')
        await expect(homePage.catalogSection).toBeVisible()

        // Navigate to Quick Math game
        await homePage.goToQuickMath()
        await expect(page).toHaveURL('/quick-math')
        await expect(quickMathPage.gameTitle).toBeVisible()

        // Play Quick Math game
        await quickMathPage.startGame()
        await expect(quickMathPage.endGameButton).toBeVisible()
        await expect(quickMathPage.answerInput).toBeEnabled()
        await expect(quickMathPage.problemDisplay).toContainText(
            /\d+\s*[+-]\s*\d+/
        )

        // Solve one math problem
        const correctAnswer = await quickMathPage.calculateCorrectAnswer()
        await quickMathPage.submitAnswer(correctAnswer.toString())

        // Verify score increased
        await expect(page.locator('#score')).toHaveText('20')

        // End Quick Math game
        await quickMathPage.endGame()
        await expect(quickMathPage.startGameButton).toBeVisible()

        await quickMathPage.navigateToHomeViaLogo()
        await expect(page).toHaveURL('/')
        await expect(homePage.catalogSection).toBeVisible()
    })
})
