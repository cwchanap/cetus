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
        await expect(
            page.getByRole('heading', { name: 'MINIGAMES' })
        ).toBeVisible()

        // Navigate to Tetris game
        await homePage.goToTetris()
        await expect(page).toHaveURL('/tetris')
        await expect(tetrisPage.gameTitle).toBeVisible()

        // Wait for game canvas to be fully rendered (indicates PixiJS is ready)
        await expect(page.locator('#tetris-container canvas')).toBeVisible({
            timeout: 10000,
        })

        // Play Tetris briefly
        await tetrisPage.startGame()
        // Wait for game to start - start button should be hidden, end button visible
        await expect(tetrisPage.startButton).toBeHidden({ timeout: 5000 })
        await expect(tetrisPage.endGameButton).toBeVisible({ timeout: 5000 })
        await expect(page.locator('#pieces-count')).toHaveText('1', {
            timeout: 5000,
        })

        // Test pause/resume functionality
        await tetrisPage.pauseGame()
        // Wait for button text to update after pause (use trim to handle whitespace)
        await expect(tetrisPage.pauseButton).toContainText('Resume', {
            timeout: 3000,
        })
        await tetrisPage.resumeGame()
        await expect(tetrisPage.pauseButton).toContainText('Pause', {
            timeout: 3000,
        })

        // Reset Tetris game to return to initial state
        await tetrisPage.resetGame()
        await expect(tetrisPage.startButton).toBeVisible()

        // Navigate back to homepage
        await tetrisPage.navigateToHome()
        await expect(page).toHaveURL('/')
        await expect(
            page.getByRole('heading', { name: 'SELECT YOUR GAME' })
        ).toBeVisible()

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
        await expect(
            page.getByRole('heading', { name: 'MINIGAMES' })
        ).toBeVisible()
    })
})
