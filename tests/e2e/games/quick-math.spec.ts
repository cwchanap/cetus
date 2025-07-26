import { test, expect } from '@playwright/test'

test.describe('Quick Math Game', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/quick-math')
    })

    test('should display quick math game page with correct layout', async ({
        page,
    }) => {
        // Check page title and heading
        await expect(page).toHaveTitle('Quick Math - Cetus Minigames')
        await expect(
            page.getByRole('heading', { name: 'QUICK MATH' })
        ).toBeVisible()

        // Check game description
        await expect(
            page.getByText(
                'Solve as many math problems as you can in 60 seconds!'
            )
        ).toBeVisible()

        // Check navigation breadcrumb
        await expect(
            page.getByRole('link', { name: 'Quick Math' })
        ).toBeVisible()
        await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
    })

    test('should show initial game state correctly', async ({ page }) => {
        // Check initial score and timer using correct IDs
        await expect(page.locator('#score')).toHaveText('0')
        await expect(page.locator('#time-remaining')).toHaveText('60')

        // Check initial statistics using correct IDs
        await expect(page.locator('#current-questions')).toHaveText('0')
        await expect(page.locator('#current-correct')).toContainText('0')
        await expect(page.locator('#current-score')).toHaveText('0')

        // Check initial state messages
        await expect(page.getByText('Ready?')).toBeVisible()
        await expect(page.getByText("What's the answer?")).toBeVisible()
    })

    test('should display game rules and tips', async ({ page }) => {
        // Check game rules section
        await expect(
            page.getByRole('heading', { name: 'GAME RULES' })
        ).toBeVisible()
        await expect(
            page.getByText('Solve math problems as fast as you can')
        ).toBeVisible()
        await expect(
            page.getByText('60 seconds to get the highest score')
        ).toBeVisible()
        await expect(
            page.getByText('Each correct answer = 20 points')
        ).toBeVisible()
        await expect(
            page.getByText('Numbers range from 1 to 999')
        ).toBeVisible()
        await expect(
            page.getByText('Addition and subtraction only')
        ).toBeVisible()

        // Check tips section
        await expect(page.getByRole('heading', { name: 'TIPS' })).toBeVisible()
        await expect(
            page.getByText('Use mental math techniques for speed')
        ).toBeVisible()
        await expect(
            page.getByText('Press Enter to submit your answer quickly')
        ).toBeVisible()
        await expect(
            page.getByText("Don't worry about mistakes - speed matters!")
        ).toBeVisible()
        await expect(
            page.getByText('All subtraction results are positive')
        ).toBeVisible()
    })

    test('should display controls information', async ({ page }) => {
        // Check controls section
        await expect(
            page.getByRole('heading', { name: 'CONTROLS' })
        ).toBeVisible()
        await expect(page.getByText('Submit Answer:')).toBeVisible()
        await expect(page.getByText('Enter', { exact: true })).toBeVisible()
        await expect(page.getByText('Numbers Only:')).toBeVisible()
        await expect(page.getByText('0-9', { exact: true })).toBeVisible()
        await expect(
            page.getByText(
                'Type your answer and press Enter for fastest gameplay'
            )
        ).toBeVisible()
    })

    test('should have correct initial button states', async ({ page }) => {
        // Answer input should be disabled initially
        await expect(
            page.getByRole('textbox', { name: 'Enter answer' })
        ).toBeDisabled()

        // Submit button should be disabled initially
        await expect(
            page.getByRole('button', { name: 'Submit Answer' })
        ).toBeDisabled()

        // Start Game button should be enabled
        await expect(
            page.getByRole('button', { name: 'Start Game' })
        ).toBeEnabled()
    })

    test('should start game correctly', async ({ page }) => {
        // Start the game
        await page.getByRole('button', { name: 'Start Game' }).click()

        // Button should change to "End Game"
        await expect(
            page.getByRole('button', { name: 'End Game' })
        ).toBeVisible()

        // Answer input should be enabled
        await expect(
            page.getByRole('textbox', { name: 'Enter answer' })
        ).toBeEnabled()

        // Submit button should be enabled
        await expect(
            page.getByRole('button', { name: 'Submit Answer' })
        ).toBeEnabled()

        // Timer should be counting down from 60
        await expect(page.locator('#time-remaining')).not.toHaveText('60')

        // A math problem should be displayed using the question ID
        const problemText = page.locator('#question')
        await expect(problemText).toBeVisible()
        await expect(problemText).toContainText(/\d+\s*[+-]\s*\d+/)
    })

    test('should handle correct answer submission', async ({ page }) => {
        // Start the game
        await page.getByRole('button', { name: 'Start Game' }).click()

        // Wait for a math problem to appear and extract it
        const problemElement = page.locator('#question')
        await expect(problemElement).toBeVisible()

        // Get the problem text and calculate the answer
        const problemText = await problemElement.textContent()
        let answer: number

        if (problemText?.includes('+')) {
            const [a, b] = problemText.split('+').map(n => parseInt(n.trim()))
            answer = a + b
        } else if (problemText?.includes('-')) {
            const [a, b] = problemText.split('-').map(n => parseInt(n.trim()))
            answer = a - b
        } else {
            throw new Error('Invalid problem format')
        }

        // Enter the correct answer
        await page
            .getByRole('textbox', { name: 'Enter answer' })
            .fill(answer.toString())
        await page.getByRole('textbox', { name: 'Enter answer' }).press('Enter')

        // Verify score increased
        await expect(page.locator('#score')).toHaveText('20')

        // Verify statistics updated
        await expect(page.locator('#current-questions')).toHaveText('1')
        await expect(page.locator('#current-correct')).toContainText('1')

        // A new problem should appear
        const newProblemElement = page.locator('#question')
        await expect(newProblemElement).toBeVisible()
    })

    test('should handle incorrect answer submission', async ({ page }) => {
        // Start the game
        await page.getByRole('button', { name: 'Start Game' }).click()

        // Wait for a problem to appear
        await expect(page.locator('#question')).toBeVisible()

        // Enter an obviously wrong answer
        await page.getByRole('textbox', { name: 'Enter answer' }).fill('99999')
        await page.getByRole('textbox', { name: 'Enter answer' }).press('Enter')

        // Score should remain 0
        await expect(page.locator('#score')).toHaveText('0')

        // Questions should still increment
        await expect(page.locator('#current-questions')).toHaveText('1')

        // Correct should remain 0
        await expect(page.locator('#current-correct')).toContainText('0')

        // A new problem should still appear
        await expect(page.locator('#question')).toBeVisible()
    })

    test('should end game manually', async ({ page }) => {
        // Start the game
        await page.getByRole('button', { name: 'Start Game' }).click()

        // End the game
        await page.getByRole('button', { name: 'End Game' }).click()

        // Game should return to initial state
        await expect(
            page.getByRole('button', { name: 'Start Game' })
        ).toBeVisible()
        await expect(
            page.getByRole('textbox', { name: 'Enter answer' })
        ).toBeDisabled()
        await expect(
            page.getByRole('button', { name: 'Submit Answer' })
        ).toBeDisabled()
    })

    test('should navigate back to home page', async ({ page }) => {
        await page.getByRole('link', { name: 'Home' }).click()
        await expect(page).toHaveURL('/')
        await expect(
            page.getByRole('heading', { name: 'MINIGAMES' })
        ).toBeVisible()
    })

    test('should have working logo navigation', async ({ page }) => {
        await page.getByRole('link', { name: 'C CETUS' }).click()
        await expect(page).toHaveURL('/')
    })
})
