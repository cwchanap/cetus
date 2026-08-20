import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/dom'
import { initMineGridGameFramework } from './initFramework'
import type { MineGridStats } from './types'

function setupDOM(): void {
    document.body.innerHTML = `
        <div id="mine-grid-container">
            <div id="mine-grid-board"></div>
        </div>
        <button id="start-btn" style="display: inline-flex">Start Game</button>
        <button id="reset-btn">Reset</button>
        <button id="play-again-btn">Play Again</button>
        <button id="easy-btn">Easy</button>
        <button id="medium-btn">Medium</button>
        <button id="hard-btn">Hard</button>
        <button id="reveal-mode-btn" aria-pressed="true">Reveal</button>
        <button id="flag-mode-btn" aria-pressed="false">Flag</button>
        <span id="score">0</span>
        <span id="time-remaining">300</span>
        <span id="difficulty">Medium</span>
        <span id="flags">0</span>
        <span id="safe-progress">0 / 85</span>
        <div id="game-over-overlay" class="hidden">
            <h3 id="game-over-title">GAME OVER!</h3>
            <span id="final-score">0</span>
            <span id="final-outcome"></span>
            <span id="final-difficulty">Medium</span>
            <span id="final-time">00:00</span>
            <span id="final-incorrect-flags">0</span>
        </div>
    `
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

    it('fails cleanly when #mine-grid-container is missing', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        document.getElementById('mine-grid-container')?.remove()

        expect(await initMineGridGameFramework()).toBeUndefined()
        expect(consoleError).toHaveBeenCalled()
    })

    it('initializes Medium without starting a run', async () => {
        handle = await initMineGridGameFramework()

        expect(handle).toBeDefined()
        expect(handle!.game.getState()).toMatchObject({
            difficulty: 'medium',
            isActive: false,
            gameStarted: false,
        })
        expect(document.getElementById('difficulty')).toHaveTextContent(
            'Medium'
        )
        expect(
            document.querySelectorAll('#mine-grid-board .mine-grid-cell')
        ).toHaveLength(100)
    })

    it('starts through #start-btn, hides Start, and disables difficulty controls', async () => {
        handle = await initMineGridGameFramework()

        document.getElementById('start-btn')!.click()

        expect(handle!.game.getState().isActive).toBe(true)
        expect(document.getElementById('start-btn')).toHaveStyle({
            display: 'none',
        })
        expect(
            ['easy-btn', 'medium-btn', 'hard-btn'].every(
                id =>
                    (document.getElementById(id) as HTMLButtonElement).disabled
            )
        ).toBe(true)
    })

    it('shows Start again after clear/mine/timeout/reset', async () => {
        handle = await initMineGridGameFramework()
        await finishClear(handle!)
        expect(document.getElementById('start-btn')).toHaveStyle({
            display: 'inline-flex',
        })

        handle!.restart()
        await finishMine(handle!)
        expect(document.getElementById('start-btn')).toHaveStyle({
            display: 'inline-flex',
        })

        handle!.restart()
        vi.useFakeTimers()
        handle!.game.start()
        await vi.advanceTimersByTimeAsync(300_000)
        await settleEnd()
        expect(document.getElementById('start-btn')).toHaveStyle({
            display: 'inline-flex',
        })

        document.getElementById('start-btn')!.click()
        document.getElementById('reset-btn')!.click()
        expect(document.getElementById('start-btn')).toHaveStyle({
            display: 'inline-flex',
        })
    })

    it('changes idle difficulty on the same game instance', async () => {
        handle = await initMineGridGameFramework()
        const game = handle!.game

        document.getElementById('easy-btn')!.click()

        expect(handle!.game).toBe(game)
        expect(game.getState().difficulty).toBe('easy')
        expect(document.getElementById('difficulty')).toHaveTextContent('Easy')
        expect(
            document.querySelectorAll('#mine-grid-board .mine-grid-cell')
        ).toHaveLength(64)
    })

    it('does not change difficulty while active', async () => {
        handle = await initMineGridGameFramework()
        document.getElementById('start-btn')!.click()
        document.getElementById('easy-btn')!.click()

        expect(handle!.game.getState().difficulty).toBe('medium')
        expect(
            (document.getElementById('easy-btn') as HTMLButtonElement).disabled
        ).toBe(true)
    })

    it('routes primary actions to revealCell in Reveal mode', async () => {
        handle = await initMineGridGameFramework()
        const revealCell = vi
            .spyOn(handle!.game, 'revealCell')
            .mockReturnValue(true)
        document.getElementById('start-btn')!.click()

        const cell = document.querySelector<HTMLButtonElement>(
            '#mine-grid-board .mine-grid-cell'
        )!
        fireEvent.click(cell)

        expect(revealCell).toHaveBeenCalledWith(0, 0)
    })

    it('routes primary actions to toggleFlag in Flag mode', async () => {
        handle = await initMineGridGameFramework()
        const toggleFlag = vi
            .spyOn(handle!.game, 'toggleFlag')
            .mockReturnValue(true)
        document.getElementById('flag-mode-btn')!.click()
        document.getElementById('start-btn')!.click()

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
        handle = await initMineGridGameFramework()
        const toggleFlag = vi
            .spyOn(handle!.game, 'toggleFlag')
            .mockReturnValue(true)
        document.getElementById('start-btn')!.click()

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

    it('reset and Play Again restore Reveal mode', async () => {
        handle = await initMineGridGameFramework()
        document.getElementById('flag-mode-btn')!.click()
        document.getElementById('reset-btn')!.click()

        expect(document.getElementById('reveal-mode-btn')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        expect(document.getElementById('flag-mode-btn')).toHaveAttribute(
            'aria-pressed',
            'false'
        )

        document.getElementById('flag-mode-btn')!.click()
        document.getElementById('play-again-btn')!.click()
        expect(document.getElementById('reveal-mode-btn')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        expect(handle!.game.getState().isActive).toBe(false)
        expect(document.getElementById('start-btn')).toHaveStyle({
            display: 'inline-flex',
        })
    })

    it('renders final clear/mine/timeout overlay data', async () => {
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
            handle = await initMineGridGameFramework()
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

            expect(document.getElementById('final-score')).toHaveTextContent(
                String(testCase.score)
            )
            expect(document.getElementById('final-outcome')).toHaveTextContent(
                new RegExp(testCase.result, 'i')
            )
            expect(
                document.getElementById('final-difficulty')
            ).toHaveTextContent(new RegExp(testCase.difficulty, 'i'))
            expect(document.getElementById('final-time')).toHaveTextContent(
                `${Math.floor(testCase.timeElapsed / 60)
                    .toString()
                    .padStart(2, '0')}:${(testCase.timeElapsed % 60)
                    .toString()
                    .padStart(2, '0')}`
            )
            expect(
                document.getElementById('final-incorrect-flags')
            ).toHaveTextContent(String(testCase.incorrectFlagActions))
            expect(
                document.getElementById('game-over-overlay')
            ).not.toHaveClass('hidden')
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

        handle = await initMineGridGameFramework()
        handle!.game.start()
        await handle!.game.end()

        expect(showAchievementAward).toHaveBeenCalledWith(['mine_grid_welcome'])
        expect(showChallengeComplete).toHaveBeenCalledWith({
            completedChallenges: [{ id: 'scan' }],
        })
    })

    it('cleans up DOM listeners, renderer, and game once', async () => {
        handle = await initMineGridGameFramework()
        const rendererDestroy = vi.spyOn(handle!.renderer, 'destroy')
        const gameDestroy = vi.spyOn(handle!.game, 'destroy')

        handle!.cleanup()
        handle!.cleanup()
        document.getElementById('start-btn')!.click()

        expect(rendererDestroy).toHaveBeenCalledTimes(1)
        expect(gameDestroy).toHaveBeenCalledTimes(1)
        expect(handle!.game.getState().gameStarted).toBe(false)
    })
})
