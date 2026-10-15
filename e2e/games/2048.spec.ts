import { test, expect, type Page } from '@playwright/test'
import type { Game2048InitResult } from '../../src/lib/games/2048/initFramework'
import type { Game2048State } from '../../src/lib/games/2048/frameworkTypes'

const readState = (page: Page) =>
    page.evaluate(() =>
        (
            window as unknown as { game2048: Game2048InitResult }
        ).game2048.getState()
    )

// Arrange deterministic positions, then exercise the real inputs and lifecycle.
const setBoard = (page: Page, values: number[][]) =>
    page.evaluate(values => {
        const handle = (window as unknown as { game2048: Game2048InitResult })
            .game2048
        const state = (handle.game as unknown as { state: Game2048State }).state
        state.board = values.map((row, r) =>
            row.map((value, col) =>
                value
                    ? {
                          id: `fixture-${r}-${col}`,
                          value,
                          position: { row: r, col },
                      }
                    : null
            )
        )
        state.maxTile = Math.max(...values.flat())
        handle.renderer.render(handle.getState())
    }, values)

const pair = [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
]
const finalMove = [
    [2, 2, 8, 16],
    [8, 16, 32, 64],
    [16, 32, 64, 128],
    [32, 64, 128, 256],
]

test.describe('2048 field plate', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/2048', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('#start-btn')).toBeEnabled({ timeout: 15000 })
    })

    test('intro, merge, immediate undo, pause, results, and replay', async ({
        page,
    }, testInfo) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        await expect(page).toHaveTitle('2048 — Cetus')
        await expect(page.locator('#intro-title')).toBeFocused()
        await page.screenshot({ path: testInfo.outputPath('2048-intro.png') })
        await page.getByRole('button', { name: '? Method' }).click()
        await expect(
            page.getByRole('button', { name: 'Close help' })
        ).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.locator('#intro-title')).toBeFocused()
        await page.locator('#start-btn').click()
        const canvas = page.locator('#game-2048-container canvas')
        await expect(canvas).toBeFocused()
        await setBoard(page, pair)
        const before = await readState(page)
        await canvas.press('ArrowLeft')
        await expect(page.locator('#score-display')).toHaveText('4')
        await canvas.press('u')
        expect((await readState(page)).board).toEqual(before.board)
        await expect(page.locator('#score-display')).toHaveText('0')
        await expect(page.locator('#undo-btn')).toBeDisabled()
        await expect(page.locator('#game-status')).toHaveText(
            'Move undone. 0 undos left.'
        )
        await canvas.press('ArrowLeft')
        await expect(page.locator('#score-display')).toHaveText('4')
        await page.getByRole('button', { name: 'How it plays' }).click()
        const held = await readState(page)
        expect(held.isPaused).toBe(true)
        await page.keyboard.press('ArrowDown')
        expect((await readState(page)).moveCount).toBe(held.moveCount)
        await page.getByRole('button', { name: 'Close help' }).click()
        await expect(canvas).toBeFocused()
        expect((await readState(page)).isPaused).toBe(false)
        await page.locator('#pause-btn').click()
        await page.keyboard.press('p')
        await expect(page.locator('#field-sheet')).not.toBeVisible()
        await page.locator('#pause-btn').click()
        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).toBeVisible()
        await expect(page.locator('#custom-final-score')).toHaveText('4')
        await expect(page.locator('#final-moves')).toHaveText('1')
        await expect(page.locator('#final-merges')).toHaveText('1')
        await expect(page.locator('#final-undos')).toHaveText('1')
        await expect(page.locator('#personal-best')).toBeVisible()
        await page.screenshot({ path: testInfo.outputPath('2048-results.png') })
        await page
            .locator('#game-over-overlay')
            .getByRole('button', { name: 'Field log' })
            .click()
        await expect(page.locator('#recent-dives')).toContainText('1 undo')
        await page.keyboard.press('Escape')
        await expect(page.locator('#results-title')).toBeFocused()
        await page.locator('#restart-btn').click()
        await expect(canvas).toBeFocused()
        expect(
            (await readState(page)).board.flat().filter(Boolean)
        ).toHaveLength(2)
        expect((await readState(page)).undosUsed).toBe(0)
        await expect(page.locator('#score-display')).toHaveText('0')
    })

    test('settings apply next dive and selected preferences survive restart', async ({
        page,
    }) => {
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.locator('#start-btn').click()
        await page.locator('#pause-btn').click()
        await page.locator('[data-undos="3"]').click()
        expect((await readState(page)).undosLeft).toBe(1)
        await page.locator('#sound-btn').click()
        await page.locator('#motion-btn').click()
        await expect(page.locator('#sound-btn')).toHaveAttribute(
            'aria-pressed',
            'false'
        )
        await expect(page.locator('#motion-btn')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        await page
            .locator('#pause-panel')
            .getByRole('button', { name: 'Field log' })
            .click()
        await page.keyboard.press('Escape')
        await expect(page.locator('#pause-panel')).toBeVisible()
        await page.locator('#reset-btn').click()
        expect((await readState(page)).undosLeft).toBe(3)
        await page.locator('#pause-btn').click()
        await page.locator('[data-undos="0"]').click()
        await page.locator('#reset-btn').click()
        await expect(page.locator('#undo-btn')).not.toBeVisible()
        expect((await readState(page)).undosLeft).toBe(0)
        expect(errors).toEqual([])
    })

    test('winning pauses once and allows continuing beyond 2048', async ({
        page,
    }, testInfo) => {
        await page.locator('#start-btn').click()
        await setBoard(page, [[1024, 1024, 0, 0], ...pair.slice(1)])
        const canvas = page.locator('#game-2048-container canvas')
        await canvas.press('ArrowLeft')
        await expect(page.locator('#win-title')).toBeVisible()
        expect((await readState(page)).isPaused).toBe(true)
        await expect(page.locator('#win-line')).toHaveText(
            '2048 points · 1 move'
        )
        await page.screenshot({ path: testInfo.outputPath('2048-win.png') })
        await page.locator('#keep-playing-btn').click()
        await expect(canvas).toBeFocused()
        await canvas.press('ArrowDown')
        await expect.poll(async () => (await readState(page)).moveCount).toBe(2)
        await expect(page.locator('#field-sheet')).not.toBeVisible()
        await expect(page.locator('[data-milestone="2048"]')).toHaveAttribute(
            'aria-label',
            '2048, reached'
        )
        await expect(page.locator('#next-target')).toHaveText('Next · 4096')
    })

    test('a full board offers undo, then ends after that allowance is spent', async ({
        page,
    }) => {
        await page.locator('#start-btn').click()
        await setBoard(page, finalMove)
        const canvas = page.locator('#game-2048-container canvas')
        const before = await readState(page)
        await canvas.press('ArrowLeft')
        await expect(page.locator('#stuck-title')).toBeVisible()
        expect((await readState(page)).isGameOver).toBe(false)
        await page.locator('#undo-stuck-btn').click()
        await expect(canvas).toBeFocused()
        expect((await readState(page)).board).toEqual(before.board)
        await expect(page.locator('#game-status')).toHaveText(
            'Move undone. 0 undos left.'
        )
        await canvas.press('ArrowLeft')
        await expect(page.locator('#game-over-overlay')).toBeVisible()
        expect((await readState(page)).isGameOver).toBe(true)
    })

    test('a winning final move is shown before a dive with no undos ends', async ({
        page,
    }) => {
        await page.locator('#start-btn').click()
        await page.locator('#pause-btn').click()
        await page.locator('[data-undos="0"]').click()
        await page.locator('#reset-btn').click()
        await setBoard(page, [[1024, 1024, 8, 16], ...finalMove.slice(1)])
        await page.locator('#game-2048-container canvas').press('ArrowLeft')
        await expect(page.locator('#win-title')).toBeVisible()
        expect((await readState(page)).stuck).toBe(true)
        await page.locator('#keep-playing-btn').click()
        await expect(page.locator('#game-over-overlay')).toBeVisible()
        await expect(page.locator('#custom-final-score')).toHaveText('2048')
    })

    test('results and replay remain available while saving the finished dive', async ({
        page,
    }, testInfo) => {
        let releaseSave!: () => void
        const pendingSave = new Promise<void>(
            resolve => (releaseSave = resolve)
        )
        await page.route('**/api/scores', async route => {
            await pendingSave
            await route.fulfill({
                json: { success: true, newAchievements: [] },
            })
        })
        await page.locator('#start-btn').click()
        await page.locator('#pause-btn').click()
        await page.locator('[data-undos="0"]').click()
        await page.locator('#reset-btn').click()
        await setBoard(page, finalMove)
        const submitted = page.waitForRequest('**/api/scores')
        await page.locator('#game-2048-container canvas').press('ArrowLeft')
        await submitted
        await expect(page.locator('#results-title')).toBeFocused()
        await expect(page.locator('#custom-final-score')).toHaveText('4')
        await expect(page.locator('#final-moves')).toHaveText('1')
        await page.screenshot({
            path: testInfo.outputPath('2048-results-pending-save.png'),
        })
        await page.locator('#restart-btn').click()
        const response = page.waitForResponse('**/api/scores')
        releaseSave()
        await (await response).finished()
        await expect(page.locator('#field-sheet')).not.toBeVisible()
        await expect(page.locator('#score-display')).toHaveText('0')
        expect((await readState(page)).isActive).toBe(true)
    })

    for (const reward of ['achievement', 'challenge'] as const) {
        test(`reduced motion stops ${reward} reward animations`, async ({
            page,
        }, testInfo) => {
            await page.clock.install()
            await page.reload({ waitUntil: 'domcontentloaded' })
            await page.setViewportSize({ width: 320, height: 844 })
            await page.route('**/api/scores', route =>
                route.fulfill({
                    json: {
                        success: true,
                        newAchievements:
                            reward === 'achievement'
                                ? [
                                      {
                                          id: 'tile_2048',
                                          name: 'Tile Master',
                                          description: 'Reach 2048',
                                          icon: '🏆',
                                          rarity: 'epic',
                                      },
                                  ]
                                : [],
                        challengeUpdates:
                            reward === 'challenge'
                                ? {
                                      completedChallenges: [
                                          {
                                              id: 'first_dive',
                                              name: 'First Dive',
                                              description: 'Finish a dive',
                                              icon: '🏆',
                                              xpReward: 50,
                                          },
                                      ],
                                      xpEarned: 50,
                                      levelUp: true,
                                      newLevel: 2,
                                  }
                                : undefined,
                    },
                })
            )
            await page.locator('#start-btn').click()
            await page.locator('#pause-btn').click()
            await page.locator('#motion-btn').click()
            await expect(page.locator('#motion-btn')).toHaveAttribute(
                'aria-pressed',
                'true'
            )
            await page.clock.pauseAt(
                await page.evaluate(() => Date.now() + 1000)
            )
            await page.locator('#end-btn').click()
            const overlay = page.locator(
                reward === 'achievement'
                    ? '#achievement-award-overlay'
                    : '#challenge-complete-overlay'
            )
            const dismiss = overlay.getByRole('button', {
                name:
                    reward === 'achievement'
                        ? 'Dismiss achievement'
                        : 'Continue',
                exact: true,
            })
            await expect(dismiss).toBeVisible()
            // The first action must work before the 700 ms entrance delay ends.
            await page.clock.runFor(50)
            expect(
                await overlay.evaluate(
                    el => el.getAnimations({ subtree: true }).length
                )
            ).toBe(0)
            expect(
                await overlay.evaluate(el =>
                    [...el.querySelectorAll('*')].every(
                        child =>
                            getComputedStyle(child).transitionDuration === '0s'
                    )
                )
            ).toBe(true)
            await page.screenshot({
                path: testInfo.outputPath(`2048-${reward}-reduced-motion.png`),
            })
            await dismiss.click()
            await page.clock.runFor(1300)
            await expect(overlay).not.toBeVisible()
            await expect(page.locator('#results-title')).toBeFocused()
            await page.locator('#restart-btn').click()
            await expect(
                page.locator('#game-2048-container canvas')
            ).toBeFocused()
        })
    }

    test('touch swipes move the board and focused toolbar keys leave it unchanged', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.locator('#start-btn').click()
        await setBoard(page, pair)
        await page.locator('#pause-btn').focus()
        await page.keyboard.press('ArrowLeft')
        expect((await readState(page)).moveCount).toBe(0)
        const box = await page
            .locator('#game-2048-container canvas')
            .boundingBox()
        if (!box) {
            throw new Error('Board is missing')
        }
        const session = await page.context().newCDPSession(page)
        await session.send('Emulation.setTouchEmulationEnabled', {
            enabled: true,
            maxTouchPoints: 1,
        })
        const point = { x: box.x + box.width * 0.8, y: box.y + box.height / 2 }
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [point],
        })
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ ...point, x: box.x + box.width * 0.2 }],
        })
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
        })
        await expect(page.locator('#score-display')).toHaveText('4')
        expect((await readState(page)).moveCount).toBe(1)
        await session.detach()
    })

    for (const width of [320, 390, 1280]) {
        test(`board fits and drag input works at ${width}px`, async ({
            page,
        }, testInfo) => {
            await page.setViewportSize({ width, height: 900 })
            await page.emulateMedia({ reducedMotion: 'reduce' })
            await page.reload({ waitUntil: 'domcontentloaded' })
            await expect(page.locator('#start-btn')).toBeEnabled()
            await page.screenshot({
                path: testInfo.outputPath('2048-responsive-intro.png'),
            })
            await page.locator('#start-btn').click()
            await setBoard(page, [
                [2, 4, 8, 16],
                [32, 64, 128, 256],
                [512, 1024, 2048, 0],
                [0, 0, 0, 2],
            ])
            const canvas = page.locator('#game-2048-container canvas')
            const box = (await canvas.boundingBox())!
            expect(Math.abs(box.width - box.height)).toBeLessThan(1)
            expect(
                await page.evaluate(() => document.documentElement.scrollWidth)
            ).toBe(width)
            await page.screenshot({
                path: testInfo.outputPath('2048-board.png'),
            })
            await setBoard(page, pair)
            await page.mouse.move(
                box.x + box.width * 0.8,
                box.y + box.height / 2
            )
            await page.mouse.down()
            await page.mouse.move(
                box.x + box.width * 0.2,
                box.y + box.height / 2,
                { steps: 5 }
            )
            await page.mouse.up()
            await expect(page.locator('#score-display')).toHaveText('4')
            await page.locator('#pause-btn').click()
            await expect(page.locator('#motion-btn')).toHaveAttribute(
                'aria-pressed',
                'true'
            )
            await expect(page.locator('#pause-title')).toBeFocused()
        })
    }
})
