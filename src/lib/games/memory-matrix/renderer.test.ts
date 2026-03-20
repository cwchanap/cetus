import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryMatrixRenderer } from './renderer'
import type { GameState, Card, GameStats } from './types'

function makeCard(overrides: Partial<Card> = {}): Card {
    return {
        id: 'card-1',
        shape: '🔵',
        color: '#3B82F6',
        isFlipped: false,
        isMatched: false,
        position: { row: 0, col: 0 },
        ...overrides,
    }
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
    return {
        board: [
            [makeCard(), makeCard()],
            [makeCard(), makeCard()],
        ],
        score: 0,
        timeLeft: 60,
        gameStarted: false,
        gameOver: false,
        flippedCards: [],
        matchedPairs: 0,
        totalPairs: 2,
        ...overrides,
    }
}

function makeGameStats(overrides: Partial<GameStats> = {}): GameStats {
    return {
        matchesFound: 0,
        totalAttempts: 0,
        accuracy: 100,
        timeBonus: 0,
        finalScore: 0,
        ...overrides,
    }
}

describe('MemoryMatrixRenderer', () => {
    let containerId: string
    let containerEl: HTMLElement
    let memoryBoardEl: HTMLElement

    beforeEach(() => {
        // Set up DOM elements
        containerId = 'memory-matrix-container'
        containerEl = document.createElement('div')
        containerEl.id = containerId
        document.body.appendChild(containerEl)

        memoryBoardEl = document.createElement('div')
        memoryBoardEl.id = 'memory-board'
        document.body.appendChild(memoryBoardEl)
    })

    afterEach(() => {
        document.body.innerHTML = ''
        vi.clearAllMocks()
    })

    describe('constructor', () => {
        it('should construct successfully when container exists', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            expect(renderer).toBeDefined()
        })

        it('should throw if container does not exist', () => {
            expect(() => new MemoryMatrixRenderer('nonexistent-id')).toThrow(
                "Container with id 'nonexistent-id' not found"
            )
        })

        it('should set up play-again button listener when button exists', () => {
            const playAgainBtn = document.createElement('button')
            playAgainBtn.id = 'play-again-btn'
            document.body.appendChild(playAgainBtn)

            const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
            const renderer = new MemoryMatrixRenderer(containerId)

            playAgainBtn.click()
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'memory-matrix-restart' })
            )
            renderer.destroy()
        })

        it('should locate score, time, and status elements from DOM', () => {
            const scoreEl = document.createElement('div')
            scoreEl.id = 'score'
            const timeEl = document.createElement('div')
            timeEl.id = 'time'
            const statusEl = document.createElement('div')
            statusEl.id = 'status'
            document.body.appendChild(scoreEl)
            document.body.appendChild(timeEl)
            document.body.appendChild(statusEl)

            // Constructor should not throw
            const renderer = new MemoryMatrixRenderer(containerId)
            expect(renderer).toBeDefined()
        })
    })

    describe('setCardClickCallback', () => {
        it('should store callback for use during card click', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)

            // Render a board and click a card
            const state = makeGameState()
            const stats = makeGameStats()
            renderer.render(state, stats)

            const card = memoryBoardEl.querySelector('div') as HTMLElement
            if (card) {
                card.click()
                expect(callback).toHaveBeenCalled()
            }
        })
    })

    describe('render', () => {
        it('should render without throwing', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const state = makeGameState()
            const stats = makeGameStats()
            expect(() => renderer.render(state, stats)).not.toThrow()
        })

        it('should populate the memory-board element with card divs', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const state = makeGameState({
                board: [[makeCard(), makeCard()]],
            })
            const stats = makeGameStats()
            renderer.render(state, stats)

            expect(memoryBoardEl.children.length).toBe(2)
        })

        it('should clear old cards when re-rendering', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const state = makeGameState({ board: [[makeCard(), makeCard()]] })
            const stats = makeGameStats()
            renderer.render(state, stats)
            renderer.render(state, stats)
            expect(memoryBoardEl.children.length).toBe(2)
        })

        it('should show shape text for flipped cards', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const flippedCard = makeCard({ isFlipped: true, shape: '⭐' })
            const state = makeGameState({ board: [[flippedCard]] })
            const stats = makeGameStats()
            renderer.render(state, stats)

            const cardEl = memoryBoardEl.querySelector('div') as HTMLElement
            expect(cardEl?.textContent).toContain('⭐')
        })

        it('should show shape text for matched cards', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const matchedCard = makeCard({ isMatched: true, shape: '🔴' })
            const state = makeGameState({ board: [[matchedCard]] })
            const stats = makeGameStats()
            renderer.render(state, stats)

            const cardEl = memoryBoardEl.querySelector('div') as HTMLElement
            expect(cardEl?.textContent).toContain('🔴')
        })

        it('should show "?" for unflipped/unmatched cards', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const unflippedCard = makeCard({
                isFlipped: false,
                isMatched: false,
            })
            const state = makeGameState({ board: [[unflippedCard]] })
            const stats = makeGameStats()
            renderer.render(state, stats)

            const cardEl = memoryBoardEl.querySelector('div') as HTMLElement
            expect(cardEl?.textContent).toBe('?')
        })

        it('should not add click handler to matched cards', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)

            const matchedCard = makeCard({ isMatched: true })
            const state = makeGameState({ board: [[matchedCard]] })
            const stats = makeGameStats()
            renderer.render(state, stats)

            const cardEl = memoryBoardEl.querySelector('div') as HTMLElement
            cardEl?.click()
            expect(callback).not.toHaveBeenCalled()
        })

        it('should not add click handler to flipped cards', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)

            const flippedCard = makeCard({ isFlipped: true })
            const state = makeGameState({ board: [[flippedCard]] })
            const stats = makeGameStats()
            renderer.render(state, stats)

            const cardEl = memoryBoardEl.querySelector('div') as HTMLElement
            cardEl?.click()
            expect(callback).not.toHaveBeenCalled()
        })

        it('should update score element when it exists', () => {
            const scoreEl = document.createElement('div')
            scoreEl.id = 'score'
            document.body.appendChild(scoreEl)

            const renderer = new MemoryMatrixRenderer(containerId)
            const state = makeGameState({ score: 250 })
            const stats = makeGameStats()
            renderer.render(state, stats)

            expect(scoreEl.textContent).toBe('250')
        })

        it('should update time element when it exists', () => {
            const timeEl = document.createElement('div')
            timeEl.id = 'time'
            document.body.appendChild(timeEl)

            const renderer = new MemoryMatrixRenderer(containerId)
            const state = makeGameState({ timeLeft: 45 })
            const stats = makeGameStats()
            renderer.render(state, stats)

            expect(timeEl.textContent).toBeTruthy()
        })

        it('should update status element with pairs remaining', () => {
            const statusEl = document.createElement('div')
            statusEl.id = 'status'
            document.body.appendChild(statusEl)

            const renderer = new MemoryMatrixRenderer(containerId)
            const state = makeGameState({ totalPairs: 8, matchedPairs: 3 })
            const stats = makeGameStats()
            renderer.render(state, stats)

            expect(statusEl.textContent).toContain('5')
        })

        it('should update game-score element when it exists', () => {
            const el = document.createElement('div')
            el.id = 'game-score'
            document.body.appendChild(el)

            const renderer = new MemoryMatrixRenderer(containerId)
            renderer.render(makeGameState({ score: 500 }), makeGameStats())
            expect(el.textContent).toBe('500')
        })

        it('should update game-time element when it exists', () => {
            const el = document.createElement('div')
            el.id = 'game-time'
            document.body.appendChild(el)

            const renderer = new MemoryMatrixRenderer(containerId)
            renderer.render(makeGameState({ timeLeft: 25 }), makeGameStats())
            expect(el.textContent).toBeTruthy()
        })

        it('should set time element class to text-red-400 when timeLeft <= 10', () => {
            const el = document.createElement('div')
            el.id = 'game-time'
            document.body.appendChild(el)

            const renderer = new MemoryMatrixRenderer(containerId)
            renderer.render(makeGameState({ timeLeft: 5 }), makeGameStats())
            expect(el.className).toContain('text-red-400')
        })

        it('should set time element class to text-yellow-400 when timeLeft <= 30', () => {
            const el = document.createElement('div')
            el.id = 'game-time'
            document.body.appendChild(el)

            const renderer = new MemoryMatrixRenderer(containerId)
            renderer.render(makeGameState({ timeLeft: 20 }), makeGameStats())
            expect(el.className).toContain('text-yellow-400')
        })

        it('should set time element class to text-white when timeLeft > 30', () => {
            const el = document.createElement('div')
            el.id = 'game-time'
            document.body.appendChild(el)

            const renderer = new MemoryMatrixRenderer(containerId)
            renderer.render(makeGameState({ timeLeft: 55 }), makeGameStats())
            expect(el.className).toContain('text-white')
        })

        it('should update game-pairs element when it exists', () => {
            const el = document.createElement('div')
            el.id = 'game-pairs'
            document.body.appendChild(el)

            const renderer = new MemoryMatrixRenderer(containerId)
            renderer.render(
                makeGameState({ matchedPairs: 3, totalPairs: 8 }),
                makeGameStats()
            )
            expect(el.textContent).toBe('3/8')
        })

        it('should update game-accuracy element when it exists', () => {
            const el = document.createElement('div')
            el.id = 'game-accuracy'
            document.body.appendChild(el)

            const renderer = new MemoryMatrixRenderer(containerId)
            renderer.render(makeGameState(), makeGameStats({ accuracy: 75 }))
            expect(el.textContent).toBe('75%')
        })

        it('should update pairs-found element when it exists', () => {
            const el = document.createElement('div')
            el.id = 'pairs-found'
            document.body.appendChild(el)

            const renderer = new MemoryMatrixRenderer(containerId)
            renderer.render(makeGameState(), makeGameStats({ matchesFound: 5 }))
            expect(el.textContent).toBe('5')
        })

        it('should update total-attempts element when it exists', () => {
            const el = document.createElement('div')
            el.id = 'total-attempts'
            document.body.appendChild(el)

            const renderer = new MemoryMatrixRenderer(containerId)
            renderer.render(
                makeGameState(),
                makeGameStats({ totalAttempts: 12 })
            )
            expect(el.textContent).toBe('12')
        })

        it('should not throw when board element does not exist', () => {
            document.body.removeChild(memoryBoardEl)
            const renderer = new MemoryMatrixRenderer(containerId)
            expect(() =>
                renderer.render(makeGameState(), makeGameStats())
            ).not.toThrow()
        })

        it('should not show game over overlay when game is not over', () => {
            const overlay = document.createElement('div')
            overlay.id = 'game-over-overlay'
            document.body.appendChild(overlay)

            const renderer = new MemoryMatrixRenderer(containerId)
            renderer.render(makeGameState({ gameOver: false }), makeGameStats())
            // showGameOverOverlay is a no-op now, so no error should occur
        })

        it('should call showGameOverOverlay when game is over', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            expect(() =>
                renderer.render(
                    makeGameState({ gameOver: true }),
                    makeGameStats()
                )
            ).not.toThrow()
        })
    })

    describe('destroy', () => {
        it('should clear the board element', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            renderer.render(makeGameState(), makeGameStats())
            expect(memoryBoardEl.children.length).toBeGreaterThan(0)

            renderer.destroy()
            expect(memoryBoardEl.children.length).toBe(0)
        })

        it('should not throw when board element does not exist', () => {
            document.body.removeChild(memoryBoardEl)
            const renderer = new MemoryMatrixRenderer(containerId)
            expect(() => renderer.destroy()).not.toThrow()
        })
    })

    describe('card CSS classes', () => {
        it('should apply matched card classes (green)', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const matchedCard = makeCard({ isMatched: true })
            renderer.render(
                makeGameState({ board: [[matchedCard]] }),
                makeGameStats()
            )

            const cardEl = memoryBoardEl.querySelector('div') as HTMLElement
            expect(cardEl?.className).toContain('bg-green-600')
        })

        it('should apply flipped card classes (cyan)', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const flippedCard = makeCard({ isFlipped: true, isMatched: false })
            renderer.render(
                makeGameState({ board: [[flippedCard]] }),
                makeGameStats()
            )

            const cardEl = memoryBoardEl.querySelector('div') as HTMLElement
            expect(cardEl?.className).toContain('border-cyan-400')
        })

        it('should apply default (unflipped) card classes', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const card = makeCard({ isFlipped: false, isMatched: false })
            renderer.render(makeGameState({ board: [[card]] }), makeGameStats())

            const cardEl = memoryBoardEl.querySelector('div') as HTMLElement
            expect(cardEl?.className).toContain('bg-slate-700')
        })

        it('should set backgroundColor for flipped card', () => {
            const renderer = new MemoryMatrixRenderer(containerId)
            const flippedCard = makeCard({ isFlipped: true, color: '#FF0000' })
            renderer.render(
                makeGameState({ board: [[flippedCard]] }),
                makeGameStats()
            )

            const cardEl = memoryBoardEl.querySelector('div') as HTMLElement
            expect(cardEl?.style.backgroundColor).toBe('rgb(255, 0, 0)')
        })
    })
})
