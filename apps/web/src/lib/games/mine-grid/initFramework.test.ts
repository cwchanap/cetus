import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/dom'
import { initMineGridGameFramework } from './initFramework'
import type { MineGridStats } from '@cetus/games/mine-grid/types'

function setupDOM(): void {
    // React owns the HUD/shared buttons/overlay (HPA-393); the initializer
    // keeps only the bespoke difficulty/mode selectors next to the board
    // host the island ref-passes.
    document.body.innerHTML = `
        <div id="mine-grid-container">
            <div id="mine-grid-board"></div>
        </div>
        <button id="easy-btn">Easy</button>
        <button id="medium-btn">Medium</button>
        <button id="hard-btn">Hard</button>
        <button id="reveal-mode-btn" aria-pressed="true">Reveal</button>
        <button id="flag-mode-btn" aria-pressed="false">Flag</button>
    `
}

function getContainer(): HTMLElement {
    return document.getElementById('mine-grid-container') as HTMLElement
}

function difficultyButtonsEnabled(): boolean {
    return ['easy-btn', 'medium-btn', 'hard-btn'].every(
        id => !(document.getElementById(id) as HTMLButtonElement).disabled
    )
}

async function settleEnd(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
}

async function finishClear(
    handle: NonNullable<Awaited<ReturnType<typeof initMineGridGameFramework>>>
): Promise<void> {
    handle.game.start()
    handle.game.revealCell(0, 0)

    for (const [row, cells] of handle.game.getState().board.entries()) {
        for (const [col, cell] of cells.entries()) {
            if (!cell.hasMine && !cell.revealed && !cell.flagged) {
                handle.game.revealCell(row, col)
            }
        }
    }

    await settleEnd()
}

async function finishMine(
    handle: NonNullable<Awaited<ReturnType<typeof initMineGridGameFramework>>>
): Promise<void> {
    handle.game.start()
    handle.game.revealCell(0, 0)
    const mine = handle.game
        .getState()
        .board.flatMap((row, rowIndex) =>
            row.map((cell, colIndex) => ({
                cell,
                row: rowIndex,
                col: colIndex,
            }))
        )
        .find(({ cell }) => cell.hasMine)

    expect(mine).toBeDefined()
    handle.game.revealCell(mine!.row, mine!.col)
    await settleEnd()
}

describe('initMineGridGameFramework', () => {
    let handle: Awaited<ReturnType<typeof initMineGridGameFramework>>

    beforeEach(() => {
        setupDOM()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
    })

    afterEach(() => {
        handle?.cleanup()
        handle = undefined
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        document.body.replaceChildren()
    })

    it('fails cleanly when the renderer board is missing', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        document.getElementById('mine-grid-board')?.remove()

        expect(await initMineGridGameFramework(getContainer())).toBeUndefined()
        expect(consoleError).toHaveBeenCalled()
    })

    it('initializes Medium without starting a run', async () => {
        handle = await initMineGridGameFramework(getContainer())

        expect(handle).toBeDefined()
        expect(handle!.game.getState()).toMatchObject({
            difficulty: 'medium',
            isActive: false,
            gameStarted: false,
        })
        expect(
            document.querySelectorAll('#mine-grid-board .mine-grid-cell')
        ).toHaveLength(100)
    })

    it('starts the game and disables the difficulty controls while active', async () => {
        handle = await initMineGridGameFramework(getContainer())

        handle!.game.start()

        expect(handle!.game.getState().isActive).toBe(true)
        expect(difficultyButtonsEnabled()).toBe(false)
    })

    it('re-enables the difficulty controls after clear/mine/timeout/reset', async () => {
        handle = await initMineGridGameFramework(getContainer())
        await finishClear(handle!)
        expect(difficultyButtonsEnabled()).toBe(true)

        handle!.game.reset()
        await finishMine(handle!)
        expect(difficultyButtonsEnabled()).toBe(true)

        handle!.game.reset()
        vi.useFakeTimers()
        handle!.game.start()
        await vi.advanceTimersByTimeAsync(300_000)
        await settleEnd()
        expect(difficultyButtonsEnabled()).toBe(true)

        handle!.game.reset()
        expect(difficultyButtonsEnabled()).toBe(true)
    })

    it('changes idle difficulty on the same game instance', async () => {
        handle = await initMineGridGameFramework(getContainer())
        const game = handle!.game

        document.getElementById('easy-btn')!.click()

        expect(handle!.game).toBe(game)
        expect(game.getState().difficulty).toBe('easy')
        expect(
            document.querySelectorAll('#mine-grid-board .mine-grid-cell')
        ).toHaveLength(64)
    })

    it('announces a difficulty swap through state-change for the React session', async () => {
        handle = await initMineGridGameFramework(getContainer())
        const stateChangeListener = vi.fn()
        handle!.game.on('state-change', stateChangeListener)

        document.getElementById('hard-btn')!.click()

        expect(stateChangeListener).toHaveBeenCalled()
        expect(handle!.game.getState().difficulty).toBe('hard')
    })

    it('does not change difficulty while active', async () => {
        handle = await initMineGridGameFramework(getContainer())
        handle!.game.start()
        document.getElementById('easy-btn')!.click()

        expect(handle!.game.getState().difficulty).toBe('medium')
        expect(
            (document.getElementById('easy-btn') as HTMLButtonElement).disabled
        ).toBe(true)
    })

    it('routes primary actions to revealCell in Reveal mode', async () => {
        handle = await initMineGridGameFramework(getContainer())
        const revealCell = vi
            .spyOn(handle!.game, 'revealCell')
            .mockReturnValue(true)
        handle!.game.start()

        const cell = document.querySelector<HTMLButtonElement>(
            '#mine-grid-board .mine-grid-cell'
        )!
        fireEvent.click(cell)

        expect(revealCell).toHaveBeenCalledWith(0, 0)
    })

    it('routes primary actions to toggleFlag in Flag mode', async () => {
        handle = await initMineGridGameFramework(getContainer())
        const toggleFlag = vi
            .spyOn(handle!.game, 'toggleFlag')
            .mockReturnValue(true)
        document.getElementById('flag-mode-btn')!.click()
        handle!.game.start()

        fireEvent.click(
            document.querySelector<HTMLButtonElement>(
                '#mine-grid-board .mine-grid-cell'
            )!
        )

        expect(toggleFlag).toHaveBeenCalledWith(0, 0)
        expect(document.getElementById('flag-mode-btn')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        expect(document.getElementById('reveal-mode-btn')).toHaveAttribute(
            'aria-pressed',
            'false'
        )
    })

    it('routes delegated contextmenu flag independent of mode', async () => {
        handle = await initMineGridGameFramework(getContainer())
        const toggleFlag = vi
            .spyOn(handle!.game, 'toggleFlag')
            .mockReturnValue(true)
        handle!.game.start()

        const cell = document.querySelector<HTMLButtonElement>(
            '#mine-grid-board .mine-grid-cell'
        )!
        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        })
        cell.dispatchEvent(event)

        expect(event.defaultPrevented).toBe(true)
        expect(toggleFlag).toHaveBeenCalledWith(0, 0)
    })

    it('reset restores Reveal mode and the idle state', async () => {
        handle = await initMineGridGameFramework(getContainer())
        document.getElementById('flag-mode-btn')!.click()
        handle!.game.reset()

        expect(document.getElementById('reveal-mode-btn')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        expect(document.getElementById('flag-mode-btn')).toHaveAttribute(
            'aria-pressed',
            'false'
        )
        expect(handle!.game.getState().isActive).toBe(false)
        expect(difficultyButtonsEnabled()).toBe(true)
    })

    it('keeps the difficulty selection in sync with the preset', async () => {
        handle = await initMineGridGameFramework(getContainer())

        document.getElementById('hard-btn')!.click()

        expect(document.getElementById('hard-btn')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        expect(document.getElementById('medium-btn')).toHaveAttribute(
            'aria-pressed',
            'false'
        )
    })

    it('finishes runs with the game state reporting the result', async () => {
        const cases: Array<{
            result: 'cleared' | 'mine' | 'timeout'
            score: number
            difficulty: 'easy' | 'medium' | 'hard'
            timeElapsed: number
            incorrectFlagActions: number
        }> = [
            {
                result: 'cleared',
                score: 123,
                difficulty: 'medium',
                timeElapsed: 12,
                incorrectFlagActions: 0,
            },
            {
                result: 'mine',
                score: 0,
                difficulty: 'medium',
                timeElapsed: 8,
                incorrectFlagActions: 1,
            },
            {
                result: 'timeout',
                score: 0,
                difficulty: 'hard',
                timeElapsed: 600,
                incorrectFlagActions: 2,
            },
        ]

        for (const testCase of cases) {
            handle?.cleanup()
            handle = await initMineGridGameFramework(getContainer())
            handle!.game.newGame(testCase.difficulty)
            handle!.game.start()
            if (testCase.score > 0) {
                handle!.game.addScore(testCase.score)
            }
            ;(
                handle!.game as unknown as {
                    state: { result: typeof testCase.result }
                }
            ).state.result = testCase.result
            vi.spyOn(handle!.game, 'getGameStats').mockReturnValue({
                finalScore: testCase.score,
                timeElapsed: testCase.timeElapsed,
                gameCompleted: testCase.result === 'cleared',
                difficulty: testCase.difficulty,
                cleared: testCase.result === 'cleared',
                result: testCase.result,
                revealedSafeCells: 1,
                totalSafeCells: 85,
                flagsPlaced: 0,
                incorrectFlagActions: testCase.incorrectFlagActions,
            } satisfies MineGridStats)

            await handle!.game.end()
            await settleEnd()

            expect(handle!.game.getState().isGameOver).toBe(true)
            // The bespoke controls unlock again once the run is over; the
            // overlay stats themselves are React-owned (island test).
            expect(difficultyButtonsEnabled()).toBe(true)
        }
    })

    it('forwards achievement and challenge notifications from end events', async () => {
        const showAchievementAward = vi.fn()
        const showChallengeComplete = vi.fn()
        vi.stubGlobal('showAchievementAward', showAchievementAward)
        vi.stubGlobal('showChallengeComplete', showChallengeComplete)
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                newAchievements: ['mine_grid_welcome'],
                challengeUpdates: {
                    completedChallenges: [{ id: 'scan' }],
                },
            }),
        } as Response)

        handle = await initMineGridGameFramework(getContainer())
        handle!.game.start()
        await handle!.game.end()

        expect(showAchievementAward).toHaveBeenCalledWith(['mine_grid_welcome'])
        expect(showChallengeComplete).toHaveBeenCalledWith({
            completedChallenges: [{ id: 'scan' }],
        })
    })

    it('cleans up DOM listeners, renderer, and game once', async () => {
        handle = await initMineGridGameFramework(getContainer())
        const rendererDestroy = vi.spyOn(handle!.renderer, 'destroy')
        const gameDestroy = vi.spyOn(handle!.game, 'destroy')

        handle!.cleanup()
        handle!.cleanup()
        document.getElementById('easy-btn')!.click()

        expect(rendererDestroy).toHaveBeenCalledTimes(1)
        expect(gameDestroy).toHaveBeenCalledTimes(1)
        expect(handle!.game.getState().gameStarted).toBe(false)
    })
})
