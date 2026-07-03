// initMemoryMatrixGameFramework integration tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initMemoryMatrixGameFramework } from './initFramework'

function setupDOM(): void {
    document.body.innerHTML = `
        <div id="memory-matrix-container">
            <div id="memory-board"></div>
        </div>
        <span id="game-score">0</span>
        <span id="game-time">1:00</span>
        <span id="game-pairs">0/24</span>
        <span id="game-accuracy">0%</span>
        <span id="pairs-found">0</span>
        <span id="total-attempts">0</span>
        <span id="time-remaining">60s</span>
        <div id="game-over-overlay" class="hidden"></div>
        <h2 id="game-over-title">Game Over</h2>
        <span id="final-score">0</span>
        <span id="final-pairs">0/24</span>
        <span id="final-accuracy">0%</span>
        <span id="final-time">0s</span>
        <span id="final-attempts">0</span>
        <button id="start-btn" style="display:inline-flex">Start Game</button>
        <button id="end-btn" style="display:none">End Game</button>
        <button id="reset-btn">Reset</button>
        <button id="play-again-btn">Play Again</button>
    `
}

describe('initMemoryMatrixGameFramework', () => {
    let result: Awaited<ReturnType<typeof initMemoryMatrixGameFramework>>

    beforeEach(() => {
        setupDOM()
        vi.clearAllMocks()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
    })

    afterEach(() => {
        if (result) {
            try {
                result.cleanup()
            } catch {
                // ignore
            }
        }
        result = undefined
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
    })

    describe('initialization', () => {
        it('returns undefined when the container is missing', async () => {
            document.getElementById('memory-matrix-container')!.remove()
            expect(await initMemoryMatrixGameFramework()).toBeUndefined()
        })

        it('returns a game instance with the expected API', async () => {
            result = await initMemoryMatrixGameFramework()
            expect(result).toBeDefined()
            expect(result!.game).toBeDefined()
            expect(result!.renderer).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
            expect(typeof result!.restart).toBe('function')
            expect(typeof result!.getState).toBe('function')
            expect(typeof result!.endGame).toBe('function')
        })

        it('initializes with default state', async () => {
            result = await initMemoryMatrixGameFramework()
            const state = result!.getState()
            expect(state.score).toBe(0)
            expect(state.gameStarted).toBe(false)
            expect(state.isGameOver).toBe(false)
        })

        it('renders the initial board into the memory-board element', async () => {
            result = await initMemoryMatrixGameFramework()
            const board = document.getElementById('memory-board')!
            expect(board.children.length).toBeGreaterThan(0)
        })
    })

    describe('start wiring', () => {
        it('starts the game and swaps buttons via the start button', async () => {
            result = await initMemoryMatrixGameFramework()
            const startBtn = document.getElementById('start-btn')!
            const endBtn = document.getElementById('end-btn')!

            startBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(result!.game.getState().gameStarted).toBe(true)
            expect(startBtn.style.display).toBe('none')
            expect(endBtn.style.display).toBe('inline-flex')
        })

        it('hides the game-over overlay on start', async () => {
            result = await initMemoryMatrixGameFramework()
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            document
                .getElementById('start-btn')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(overlay.classList.contains('hidden')).toBe(true)
        })
    })

    describe('card clicks', () => {
        it('flips a card when clicked after the game starts', async () => {
            result = await initMemoryMatrixGameFramework()
            result!.game.start()

            const board = document.getElementById('memory-board')!
            const firstCard = board.querySelector('div') as HTMLElement
            const flipSpy = vi.spyOn(result!.game, 'flipCard')

            firstCard.dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(flipSpy).toHaveBeenCalled()
        })
    })

    describe('end game', () => {
        it('shows the overlay and submits the score', async () => {
            result = await initMemoryMatrixGameFramework()
            result!.game.start()

            await result!.endGame()
            await Promise.resolve()
            await Promise.resolve()

            const overlay = document.getElementById('game-over-overlay')!
            expect(overlay.classList.contains('hidden')).toBe(false)
            expect(fetch).toHaveBeenCalledWith(
                '/api/scores',
                expect.objectContaining({ method: 'POST' })
            )
        })

        it('updates final stats in the overlay on end', async () => {
            result = await initMemoryMatrixGameFramework()
            result!.game.start()

            await result!.endGame()
            await Promise.resolve()
            await Promise.resolve()

            expect(document.getElementById('final-score')!.textContent).toBe(
                '0'
            )
            expect(document.getElementById('final-pairs')!.textContent).toBe(
                '0/24'
            )
            // No time bonus on a non-win (manual/time-up end)
            expect(result!.game.getState().score).toBe(0)
        })
    })

    describe('restart', () => {
        it('resets the game and hides the overlay', async () => {
            result = await initMemoryMatrixGameFramework()
            result!.game.start()
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            result!.restart()

            const state = result!.game.getState()
            expect(state.gameStarted).toBe(false)
            expect(state.score).toBe(0)
            expect(overlay.classList.contains('hidden')).toBe(true)
        })
    })

    describe('reset button', () => {
        it('resets the game when reset is clicked', async () => {
            result = await initMemoryMatrixGameFramework()
            result!.game.start()

            document
                .getElementById('reset-btn')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }))

            const state = result!.game.getState()
            expect(state.gameStarted).toBe(false)
        })
    })
})
