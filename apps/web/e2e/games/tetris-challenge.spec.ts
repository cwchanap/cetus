import { test, expect, type Page } from '@playwright/test'
import type { TetrisInitResult } from '../../src/lib/games/tetris/initFramework'

const readState = (page: Page) =>
    page.evaluate(() =>
        (
            window as unknown as Window & { tetrisGame: TetrisInitResult }
        ).tetrisGame.getState()
    )

test.describe('Tetris Challenge', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tetris')
        await expect(page.locator('#start-btn')).toBeEnabled({ timeout: 10000 })
    })

    test('keyboard play, hold, results, and replay use the live game', async ({
        page,
    }, testInfo) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        await expect(page).toHaveTitle('Tetris Challenge — Cetus')
        await expect(page.locator('#intro-title')).toBeFocused()
        await page.screenshot({ path: testInfo.outputPath('tetris-intro.png') })
        await page.getByRole('button', { name: '? Method' }).click()
        await expect(
            page.getByRole('button', { name: 'Close help' })
        ).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.locator('#intro-title')).toBeFocused()
        await page.locator('#start-btn').click()
        const canvas = page.locator('#tetris-container canvas')
        await expect(canvas).toBeFocused()
        const initial = await readState(page)
        expect(initial.queue).toHaveLength(3)
        expect(initial.stats.pieces).toBe(0)
        await canvas.press('ArrowLeft')
        expect((await readState(page)).currentPiece?.x).toBe(
            (initial.currentPiece?.x ?? 0) - 1
        )
        await canvas.press('c')
        const held = await readState(page)
        expect(held.heldPiece?.type).toBe(initial.currentPiece?.type)
        expect(held.currentPiece?.type).toBe(initial.queue[0].type)
        await expect(page.locator('#hold-btn')).toBeDisabled()
        await canvas.press('c')
        expect((await readState(page)).queue).toEqual(held.queue)
        await canvas.press('Space')
        await expect
            .poll(async () => (await readState(page)).stats.pieces)
            .toBe(1)
        await expect(page.locator('#hold-btn')).toBeEnabled()
        await page.locator('#hold-btn').click()
        expect((await readState(page)).currentPiece?.type).toBe(
            initial.currentPiece?.type
        )
        await expect(canvas).toBeFocused()
        await page.screenshot({ path: testInfo.outputPath('tetris-board.png') })
        await page.getByRole('button', { name: 'How it plays' }).click()
        expect((await readState(page)).isPaused).toBe(true)
        await page.getByRole('button', { name: 'Close help' }).click()
        expect((await readState(page)).isPaused).toBe(false)
        await expect(canvas).toBeFocused()
        await page.locator('#pause-btn').click()
        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).toBeVisible()
        await expect(page.locator('#final-pieces')).toHaveText('1')
        await expect(page.locator('#personal-best')).toBeVisible()
        await page.screenshot({
            path: testInfo.outputPath('tetris-results.png'),
        })
        await page.locator('#play-again-btn').click()
        await expect(canvas).toBeFocused()
        await expect(page.locator('#score')).toHaveText('0')
        expect((await readState(page)).heldPiece).toBeNull()
        expect((await readState(page)).stats.pieces).toBe(0)
    })

    test('P resumes once, settings apply, and restart uses the selected starting level', async ({
        page,
    }) => {
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => {
            // Headless Chromium reports driver readback stalls during screenshots.
            if (
                /GL Driver Message.*GPU stall due to ReadPixels/.test(
                    message.text()
                )
            ) {
                return
            }
            if (message.type() === 'warning' || message.type() === 'error') {
                errors.push(message.text())
            }
        })
        await page.locator('#start-btn').click()
        const canvas = page.locator('#tetris-container canvas')
        await canvas.press('p')
        await expect(page.locator('#pause-panel')).toBeVisible()
        await page.locator('[data-level="5"]').click()
        await expect(page.locator('#level')).toHaveText('1')
        await page.locator('#glyphs-btn').click()
        await page.locator('#ghost-btn').click()
        await page.locator('#sound-btn').click()
        await page.locator('#motion-btn').click()
        await expect(page.locator('#glyphs-btn')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        await expect(page.locator('#ghost-btn')).toHaveAttribute(
            'aria-pressed',
            'false'
        )
        await expect(page.locator('.field-plate')).toHaveClass(/reduced-motion/)
        await page.keyboard.press('p')
        await expect(page.locator('#field-sheet')).not.toBeVisible()
        await expect(canvas).toBeFocused()
        expect((await readState(page)).isPaused).toBe(false)
        await page.locator('#pause-btn').click()
        await page.locator('#reset-btn').click()
        await expect(page.locator('#field-sheet')).not.toBeVisible()
        await expect(page.locator('#level')).toHaveText('5')
        await expect(page.locator('#drop-rate')).toHaveText('0.80 s')
        await canvas.press('Space')
        await expect
            .poll(async () => (await readState(page)).stats.pieces)
            .toBe(1)
        expect(errors).toEqual([])
    })

    for (const reducedMotion of [false, true]) {
        test(`a four-row clear updates feedback, longest streak, and result breakdown (reduced motion: ${reducedMotion})`, async ({
            page,
        }, testInfo) => {
            if (reducedMotion) {
                await page.emulateMedia({ reducedMotion: 'reduce' })
                await page.reload()
                await expect(page.locator('#start-btn')).toBeEnabled()
            }
            await page.locator('#start-btn').click()
            // Arrange a vertical I over a four-row well, then use the real drop input.
            await page.evaluate(() => {
                const game = (
                    window as unknown as Window & {
                        tetrisGame: TetrisInitResult
                    }
                ).tetrisGame.game
                const state = game.getState()
                for (let row = 16; row < 20; row++) {
                    state.board[row] = Array.from({ length: 10 }, (_, col) =>
                        col === 9 ? null : 0x00ffff
                    )
                }
                Object.assign(state.currentPiece!, {
                    type: 'I',
                    shape: [[1], [1], [1], [1]],
                    x: 9,
                    y: 0,
                    color: 0x00ffff,
                })
            })
            await page.locator('#tetris-container canvas').press('Space')
            await expect(page.locator('#lines')).toHaveText('4')
            const feedback = page.locator('#line-feedback')
            await expect(feedback).toHaveText('Tetris +1200')
            await expect(page.locator('#clear-flash .flash')).toHaveCount(
                reducedMotion ? 0 : 4
            )
            if (reducedMotion) {
                await expect(feedback).toHaveCSS('opacity', '1')
                expect(
                    await feedback.evaluate(
                        el =>
                            new DOMMatrixReadOnly(
                                getComputedStyle(el).transform
                            ).m42
                    )
                ).toBe(0)
                await page.screenshot({
                    path: testInfo.outputPath('tetris-reduced-motion.png'),
                })
            }
            await expect(feedback).toHaveCSS('opacity', '0')
            await expect(page.locator('#clear-streak')).toHaveText('×1')
            // A blank placement resets the current streak, preserving the best one.
            await page.locator('#tetris-container canvas').press('Space')
            await expect(page.locator('#clear-streak')).toHaveText('×0')
            await page.locator('#pause-btn').click()
            await page.locator('#end-btn').click()
            await expect(page.locator('#final-lines')).toHaveText('4')
            await expect(page.locator('#final-pieces')).toHaveText('2')
            await expect(page.locator('#final-streak')).toHaveText('×1')
            await expect(page.locator('[data-clear-count="3"]')).toHaveText('1')
            await expect(page.locator('#results-title')).toHaveText(
                'A clean four'
            )
        })
    }

    test('sideways drift and short drags do not drop or rotate a form', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.locator('#start-btn').click()
        // A T makes unintended rotation observable, unlike a square form.
        const shape = [
            [0, 1, 0],
            [1, 1, 1],
        ]
        await page.evaluate(shape => {
            const game = (
                window as unknown as Window & { tetrisGame: TetrisInitResult }
            ).tetrisGame
            Object.assign(game.getState().currentPiece!, {
                type: 'T',
                shape,
                color: 0x800080,
                x: 3,
                y: 0,
            })
        }, shape)
        const canvas = page.locator('#tetris-container canvas')
        await canvas.scrollIntoViewIfNeeded()
        const box = await canvas.boundingBox()
        if (!box) {
            throw new Error('Tetris canvas is missing')
        }
        const x = box.x + box.width / 2,
            y = box.y + box.height / 2

        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + 80, y + 40, { steps: 8 })
        await page.mouse.up()
        const diagonal = await readState(page)
        expect(diagonal.stats.pieces).toBe(0)
        expect(diagonal.currentPiece?.x).toBe(
            3 + Math.round(80 / (box.width / 10))
        )
        expect(diagonal.currentPiece?.shape).toEqual(shape)

        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x - 20, y, { steps: 4 })
        await page.mouse.up()
        const short = await readState(page)
        expect(short.currentPiece?.x).toBe(diagonal.currentPiece!.x - 1)
        expect(short.currentPiece?.shape).toEqual(shape)
        expect(short.stats.pieces).toBe(0)

        // A drag returning to its origin is still not a tap.
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + 20, y)
        await page.mouse.move(x, y)
        await page.mouse.up()
        expect((await readState(page)).currentPiece?.shape).toEqual(shape)
        expect((await readState(page)).currentPiece?.x).toBe(
            short.currentPiece!.x
        )

        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + 5, y + 3)
        await page.mouse.up()
        expect((await readState(page)).currentPiece?.shape).toEqual([
            [1, 0],
            [1, 1],
            [1, 0],
        ])

        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + 20, y + 80, { steps: 8 })
        await page.mouse.up()
        const dropped = await readState(page)
        expect(dropped.stats.pieces).toBe(1)
        const occupiedColumns = dropped.board.flatMap(row =>
            row.flatMap((cell, col) => (cell === null ? [] : [col]))
        )
        expect(Math.min(...occupiedColumns)).toBe(short.currentPiece!.x)
    })

    for (const width of [320, 390]) {
        test(`mobile ${width}px keeps square cells and supports swipe, hold, and empty results`, async ({
            page,
        }, testInfo) => {
            await page.setViewportSize({ width, height: 844 })
            await expect(page.locator('#intro-title')).toBeInViewport()
            await page.locator('#start-btn').click()
            const canvas = page.locator('#tetris-container canvas')
            const box = await canvas.boundingBox()
            expect(box).not.toBeNull()
            expect((box?.height ?? 0) / (box?.width ?? 1)).toBeCloseTo(2, 2)
            expect(
                await page.evaluate(() => document.documentElement.scrollWidth)
            ).toBe(width)
            await page.locator('#pause-btn').click()
            await page.locator('#end-btn').click()
            await expect(page.locator('#final-pieces')).toHaveText('0')
            await expect(page.locator('#per-form')).toHaveText('—')
            await expect(page.locator('#personal-best')).toBeHidden()
            await page.locator('#play-again-btn').click()
            await canvas.scrollIntoViewIfNeeded()
            const visibleBox = await canvas.boundingBox()
            const x = visibleBox!.x + visibleBox!.width / 2
            const y = visibleBox!.y + visibleBox!.height / 2
            const beforeSwipe = await readState(page)
            await page.mouse.move(x, y)
            await page.mouse.down()
            await page.mouse.move(x + visibleBox!.width * 0.22, y, { steps: 4 })
            await page.mouse.up()
            expect((await readState(page)).currentPiece?.x).toBe(
                (beforeSwipe.currentPiece?.x ?? 0) + 2
            )
            const shape = (await readState(page)).currentPiece!.shape
            await page.mouse.click(x, y)
            expect((await readState(page)).currentPiece?.shape).toEqual(
                shape[0].map((_, col) => shape.map(row => row[col]).reverse())
            )
            await page.mouse.move(x, y)
            await page.mouse.down()
            await page.mouse.move(x, y + 80, { steps: 4 })
            await page.mouse.up()
            await expect
                .poll(async () => (await readState(page)).stats.pieces)
                .toBe(1)
            await page.locator('#hold-btn').click()
            await expect(page.locator('#hold-btn')).toBeDisabled()
            await page.screenshot({
                path: testInfo.outputPath(`tetris-mobile-${width}.png`),
                fullPage: true,
            })
        })
    }
})
