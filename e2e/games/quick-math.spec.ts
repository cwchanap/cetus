import { test, expect } from '@playwright/test'

test.describe('Quick Math', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/quick-math')
    })

    test('plays: solves a problem, increments score, ends game', async ({
        page,
    }) => {
        // Initial state: input disabled
        const answerInput = page.getByRole('textbox', { name: 'Enter answer' })
        await expect(answerInput).toBeDisabled()
        await expect(page.locator('#score')).toHaveText('0')

        // Start the game → input enabled, problem shown
        await page.getByRole('button', { name: 'Start Game' }).click()
        await expect(answerInput).toBeEnabled()
        const problem = page.locator('#question')
        await expect(problem).toContainText(/\d+\s*[+-]\s*\d+/)

        // Compute and submit the correct answer
        const problemText = (await problem.textContent()) ?? ''
        const op = problemText.includes('+') ? '+' : '-'
        const [a, b] = problemText.split(op).map(n => parseInt(n.trim(), 10))
        const answer = op === '+' ? a + b : a - b

        await answerInput.fill(answer.toString())
        await answerInput.press('Enter')

        // Score increments by 20 per correct answer
        await expect(page.locator('#score')).toHaveText('20')
        await expect(page.locator('#current-correct')).toContainText('1')

        // End game → input disabled, start button back
        await page.getByRole('button', { name: 'End Game' }).click()
        await expect(
            page.getByRole('button', { name: 'Start Game' })
        ).toBeVisible()
        await expect(answerInput).toBeDisabled()
    })

    test('rejects wrong answer without incrementing score', async ({
        page,
    }) => {
        await page.getByRole('button', { name: 'Start Game' }).click()
        const answerInput = page.getByRole('textbox', { name: 'Enter answer' })
        await expect(page.locator('#question')).toBeVisible()

        await answerInput.fill('99999')
        await answerInput.press('Enter')

        await expect(page.locator('#score')).toHaveText('0')
        await expect(page.locator('#current-questions')).toHaveText('1')
        await expect(page.locator('#current-correct')).toContainText('0')
    })
})
