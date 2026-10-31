// initMemoryMatrixGameFramework integration tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initMemoryMatrixGameFramework } from './initFramework'

function setupDOM(): void {
    // React owns the HUD/buttons/overlay (HPA-393); the initializer only
    // needs the board host (and its inner grid) the island ref-passes.
    document.body.innerHTML = `
        <div id="memory-matrix-container">
            <div id="memory-board"></div>
        </div>
    `
}

function getContainer(): HTMLElement {
    return document.getElementById('memory-matrix-container') as HTMLElement
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
        it('returns a game instance with the expected API', async () => {
            result = await initMemoryMatrixGameFramework(getContainer())
            expect(result).toBeDefined()
            expect(result!.game).toBeDefined()
            expect(result!.renderer).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
            expect(typeof result!.getState).toBe('function')
            expect(typeof result!.endGame).toBe('function')
        })

        it('initializes with default state', async () => {
            result = await initMemoryMatrixGameFramework(getContainer())
            const state = result!.getState()
            expect(state.score).toBe(0)
            expect(state.gameStarted).toBe(false)
            expect(state.isGameOver).toBe(false)
        })

        it('renders the initial board into the memory-board element', async () => {
            result = await initMemoryMatrixGameFramework(getContainer())
            const board = document.getElementById('memory-board')!
            expect(board.children.length).toBeGreaterThan(0)
        })
    })

    describe('card clicks', () => {
        it('flips a card when clicked after the game starts', async () => {
            result = await initMemoryMatrixGameFramework(getContainer())
            result!.game.start()

            const board = document.getElementById('memory-board')!
            const firstCard = board.querySelector('div') as HTMLElement
            const flipSpy = vi.spyOn(result!.game, 'flipCard')

            firstCard.dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(flipSpy).toHaveBeenCalled()
        })
    })

    describe('end game', () => {
        it('submits the score through the wired submitScore on end', async () => {
            result = await initMemoryMatrixGameFramework(getContainer())
            result!.game.start()

            await result!.endGame()
            await Promise.resolve()
            await Promise.resolve()

            expect(fetch).toHaveBeenCalledWith(
                '/api/scores',
                expect.objectContaining({ method: 'POST' })
            )
        })
    })

    describe('reset', () => {
        it('resets the game and re-renders the idle board', async () => {
            result = await initMemoryMatrixGameFramework(getContainer())
            result!.game.start()

            result!.game.reset()

            const state = result!.game.getState()
            expect(state.gameStarted).toBe(false)
            expect(state.score).toBe(0)
            const board = document.getElementById('memory-board')!
            expect(board.children.length).toBeGreaterThan(0)
        })
    })

    describe('notification forwarder', () => {
        it('registers exactly one end listener (the shared forwarder)', async () => {
            result = await initMemoryMatrixGameFramework(getContainer())

            expect(result!.game.listenerCount('end')).toBe(1)
        })

        it('detaches the forwarder on cleanup', async () => {
            result = await initMemoryMatrixGameFramework(getContainer())
            const game = result!.game

            result!.cleanup()
            result = undefined

            expect(game.listenerCount('end')).toBe(0)
        })
    })

    describe('callbacks passthrough', () => {
        it('passes caller callbacks through unwrapped where React owns the path', async () => {
            const customCallbacks = { onScoreUpdate: vi.fn() }
            result = await initMemoryMatrixGameFramework(
                getContainer(),
                undefined,
                customCallbacks
            )

            const constructedCallbacks = (
                result!.game as unknown as {
                    callbacks: {
                        onScoreUpdate?: typeof customCallbacks.onScoreUpdate
                    }
                }
            ).callbacks
            expect(constructedCallbacks.onScoreUpdate).toBe(
                customCallbacks.onScoreUpdate
            )
        })
    })
})
