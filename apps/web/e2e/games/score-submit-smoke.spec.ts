import { test, expect } from '@playwright/test'
import type { TetrisInitResult } from '@/lib/games/tetris/initFramework'
import { ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS } from '@cetus/games/ice-slide/test-fixtures'
import { signInTestUser } from '../helpers/test-auth'

/**
 * HPA-447 Stage 2 exit smoke: one authenticated score submit for a BaseGame
 * game (Tetris — injected `submitScore` config transport) and one
 * handle-based game (Ice Slide daily — explicit `saveGameScore` flow),
 * against the isolated file-based E2E DB. No /api/scores route mocks: the
 * real POST must land and the best score must be readable afterwards.
 */

const DIRECTION_TO_KEY = {
    N: 'ArrowUp',
    E: 'ArrowRight',
    S: 'ArrowDown',
    W: 'ArrowLeft',
} as const

test.describe('Authenticated score submit smoke', () => {
    test('BaseGame (Tetris) submits via the injected transport', async ({
        page,
    }) => {
        await signInTestUser(page)
        await page.goto('/tetris')
        await expect(page.locator('#start-btn')).toBeEnabled({
            timeout: 10_000,
        })

        const submitted = page.waitForResponse(
            response =>
                new URL(response.url()).pathname === '/api/scores' &&
                response.request().method() === 'POST',
            { timeout: 15_000 }
        )

        await page.evaluate(() => {
            const handle = (
                window as unknown as { tetrisGame: TetrisInitResult }
            ).tetrisGame
            handle.game.start()
            handle.game.addScore(120)
            void handle.endGame()
        })

        // Waiting for the response (not just the request) proves the save
        // completed server-side before the readback below.
        const response = await submitted
        expect(response.status()).toBe(200)
        expect(response.request().postDataJSON()).toMatchObject({
            gameId: 'tetris',
            score: 120,
        })

        // Read the persisted best back through the page (same-origin fetch,
        // session cookie included) rather than the API request context.
        const best = await page.evaluate(async () => {
            const response = await fetch('/api/scores/best?gameId=tetris')
            return (await response.json()) as { bestScore: number | null }
        })
        expect(best.bestScore).toBe(120)
    })

    test('handle-based (Ice Slide daily) submits via the explicit save flow', async ({
        page,
    }) => {
        await signInTestUser(page)
        // Pin the daily to the run captured by the deterministic fixture.
        await page.clock.setFixedTime(new Date('2026-08-12T20:00:00Z'))
        await page.goto('/ice-slide?mode=daily')

        await expect(async () => {
            await page.locator('#start-btn').click()
            await expect(page.locator('#start-btn')).toHaveCSS(
                'display',
                'none',
                { timeout: 500 }
            )
        }).toPass({ timeout: 10_000 })
        await expect(
            page.locator('#game-canvas-container canvas')
        ).toBeVisible()

        const submitted = page.waitForResponse(
            response =>
                new URL(response.url()).pathname === '/api/scores' &&
                response.request().method() === 'POST',
            { timeout: 30_000 }
        )

        for (
            let stage = 0;
            stage < ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS.length;
            stage++
        ) {
            for (const direction of ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS[
                stage
            ]) {
                await page.keyboard.press(DIRECTION_TO_KEY[direction])
            }
            if (stage < ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS.length - 1) {
                await expect(page.locator('#stage-clear-overlay')).toBeVisible()
                await page.locator('#stage-clear-continue-btn').click()
            }
        }
        await expect(page.locator('#game-over-overlay')).toBeVisible()

        const response = await submitted
        expect(response.status()).toBe(200)
        const body = response.request().postDataJSON()
        expect(body).toMatchObject({
            gameId: 'ice_slide',
            context: {
                mode: 'daily',
                competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
                rulesetVersion: 1,
            },
        })
        expect((body.gameData as { solved?: boolean }).solved).toBe(true)

        // Daily runs are scoped (mode/competitionKey set), so they are
        // intentionally excluded from the generic best-score route; the 200
        // above already proves the real route persisted the run (the payload
        // carries the achievements evaluation, which requires the save).
        const result = (await response.json()) as {
            success: boolean
            newAchievements: unknown[]
        }
        expect(result.success).toBe(true)
        expect(Array.isArray(result.newAchievements)).toBe(true)
    })
})
