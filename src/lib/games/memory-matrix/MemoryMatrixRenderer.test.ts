import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { within, fireEvent } from '@testing-library/dom'
import {
    MemoryMatrixRenderer,
    createMemoryMatrixRendererConfig,
} from './MemoryMatrixRenderer'
import type { MemoryMatrixState } from './frameworkTypes'
import type { Card } from './types'

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

function makeState(
    overrides: Partial<MemoryMatrixState> = {}
): MemoryMatrixState {
    return {
        board: [
            [makeCard(), makeCard()],
            [makeCard(), makeCard()],
        ],
        flippedCards: [],
        matchedPairs: 0,
        totalPairs: 2,
        isProcessing: false,
        gameWon: false,
        needsRedraw: true,
        totalAttempts: 0,
        matchesFound: 0,
        accuracy: 100,
        score: 0,
        timeRemaining: 60,
        isActive: false,
        isPaused: false,
        isGameOver: false,
        gameStarted: false,
        ...overrides,
    }
}

async function createRenderer(): Promise<MemoryMatrixRenderer> {
    const renderer = new MemoryMatrixRenderer({
        type: 'dom',
        container: '#memory-board',
        cleanOnRender: false,
    })
    await renderer.initialize()
    return renderer
}

describe('MemoryMatrixRenderer', () => {
    let boardEl: HTMLElement

    beforeEach(() => {
        boardEl = document.createElement('div')
        boardEl.id = 'memory-board'
        document.body.appendChild(boardEl)
    })

    afterEach(() => {
        document.body.innerHTML = ''
        vi.clearAllMocks()
    })

    describe('initialize', () => {
        it('should initialize successfully when board container exists', async () => {
            const renderer = await createRenderer()
            expect(renderer).toBeDefined()
            renderer.destroy()
        })

        it('should throw when board container does not exist', async () => {
            document.body.removeChild(boardEl)
            const renderer = new MemoryMatrixRenderer({
                type: 'dom',
                container: '#memory-board',
                cleanOnRender: false,
            })
            await expect(renderer.initialize()).rejects.toThrow()
        })
    })

    describe('render', () => {
        it('should populate the board element with card divs', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({
                    board: [[makeCard(), makeCard()]],
                })
            )

            expect(boardEl.children.length).toBe(2)
            renderer.destroy()
        })

        it('should clear old cards when re-rendering', async () => {
            const renderer = await createRenderer()
            const state = makeState({ board: [[makeCard(), makeCard()]] })
            renderer.render(state)
            renderer.render(state)

            expect(boardEl.children.length).toBe(2)
            renderer.destroy()
        })

        it('should show shape text for flipped cards', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({
                    board: [[makeCard({ isFlipped: true, shape: '⭐' })]],
                })
            )

            const cardEl = boardEl.querySelector('div') as HTMLElement
            expect(cardEl?.textContent).toContain('⭐')
            renderer.destroy()
        })

        it('should show shape text for matched cards', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({
                    board: [[makeCard({ isMatched: true, shape: '🔴' })]],
                })
            )

            const cardEl = boardEl.querySelector('div') as HTMLElement
            expect(cardEl?.textContent).toContain('🔴')
            renderer.destroy()
        })

        it('should show "?" for unflipped cards', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({
                    board: [[makeCard({ isFlipped: false, isMatched: false })]],
                })
            )

            const cardEl = boardEl.querySelector('div') as HTMLElement
            expect(cardEl?.textContent).toBe('?')
            renderer.destroy()
        })
    })

    describe('card click callback', () => {
        it('should invoke the card click callback for interactive cards', async () => {
            const renderer = await createRenderer()
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)
            renderer.render(makeState())

            const card = boardEl.querySelector('div') as HTMLElement
            card?.click()
            expect(callback).toHaveBeenCalled()
            renderer.destroy()
        })

        it('should not add click handler to matched cards', async () => {
            const renderer = await createRenderer()
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)
            renderer.render(
                makeState({ board: [[makeCard({ isMatched: true })]] })
            )

            const cardEl = boardEl.querySelector('div') as HTMLElement
            cardEl?.click()
            expect(callback).not.toHaveBeenCalled()
            renderer.destroy()
        })

        it('should not add click handler to flipped cards', async () => {
            const renderer = await createRenderer()
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)
            renderer.render(
                makeState({ board: [[makeCard({ isFlipped: true })]] })
            )

            const cardEl = boardEl.querySelector('div') as HTMLElement
            cardEl?.click()
            expect(callback).not.toHaveBeenCalled()
            renderer.destroy()
        })
    })

    describe('keyboard accessibility', () => {
        it('should make interactive cards focusable with role and aria-label', async () => {
            const renderer = await createRenderer()
            renderer.render(makeState({ board: [[makeCard()]] }))

            const cardEl = within(boardEl).getByRole('button', {
                name: /face down/i,
            })
            expect(cardEl).toHaveAttribute('tabindex', '0')
            expect(cardEl.getAttribute('aria-label')).toMatch(/face down/i)
            renderer.destroy()
        })

        it('should make flipped cards programmatically focusable but not tab-focusable', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({ board: [[makeCard({ isFlipped: true })]] })
            )

            const cardEl = within(boardEl).getByRole('img', {
                name: /face up/i,
            })
            // tabindex="-1" keeps flipped cards out of tab order but allows
            // programmatic focus restoration after a re-render.
            expect(cardEl).toHaveAttribute('tabindex', '-1')
            renderer.destroy()
        })

        it('should make matched cards programmatically focusable but not tab-focusable', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({ board: [[makeCard({ isMatched: true })]] })
            )

            const cardEl = within(boardEl).getByRole('img', {
                name: /matched/i,
            })
            expect(cardEl).toHaveAttribute('tabindex', '-1')
            renderer.destroy()
        })

        it('should invoke callback on Enter key', async () => {
            const renderer = await createRenderer()
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)
            renderer.render(makeState({ board: [[makeCard()]] }))

            const cardEl = within(boardEl).getByRole('button', {
                name: /face down/i,
            })
            fireEvent.keyDown(cardEl, { key: 'Enter' })
            expect(callback).toHaveBeenCalled()
            renderer.destroy()
        })

        it('should invoke callback on Space key', async () => {
            const renderer = await createRenderer()
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)
            renderer.render(makeState({ board: [[makeCard()]] }))

            const cardEl = within(boardEl).getByRole('button', {
                name: /face down/i,
            })
            fireEvent.keyDown(cardEl, { key: ' ' })
            expect(callback).toHaveBeenCalled()
            renderer.destroy()
        })

        it('should not invoke callback on other keys', async () => {
            const renderer = await createRenderer()
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)
            renderer.render(makeState({ board: [[makeCard()]] }))

            const cardEl = within(boardEl).getByRole('button', {
                name: /face down/i,
            })
            fireEvent.keyDown(cardEl, { key: 'Tab' })
            expect(callback).not.toHaveBeenCalled()
            renderer.destroy()
        })

        it('should not invoke callback when modifier keys are held', async () => {
            const renderer = await createRenderer()
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)
            renderer.render(makeState({ board: [[makeCard()]] }))

            const cardEl = within(boardEl).getByRole('button', {
                name: /face down/i,
            })
            fireEvent.keyDown(cardEl, { key: 'Enter', ctrlKey: true })
            expect(callback).not.toHaveBeenCalled()
            renderer.destroy()
        })

        it('should set aria-label with face up status for flipped cards', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({
                    board: [[makeCard({ isFlipped: true, shape: '⭐' })]],
                })
            )

            const cardEl = within(boardEl).getByRole('img', {
                name: /face up.*⭐/i,
            })
            expect(cardEl).toBeInTheDocument()
            renderer.destroy()
        })

        it('should set aria-label with matched status for matched cards', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({
                    board: [[makeCard({ isMatched: true, shape: '🔴' })]],
                })
            )

            const cardEl = within(boardEl).getByRole('img', {
                name: /matched.*🔴/i,
            })
            expect(cardEl).toBeInTheDocument()
            renderer.destroy()
        })
    })

    describe('focus restoration on re-render', () => {
        it('should restore focus to the card at the same position after rebuild', async () => {
            const renderer = await createRenderer()
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)
            const state = makeState({
                board: [
                    [makeCard({ id: 'c-0-0' }), makeCard({ id: 'c-0-1' })],
                    [makeCard({ id: 'c-1-0' }), makeCard({ id: 'c-1-1' })],
                ],
            })
            renderer.render(state)

            // Focus the card at row 2, col 2 (last of four face-down cards)
            const cards = within(boardEl).getAllByRole('button')
            const targetCard = cards[3]
            targetCard.focus()
            expect(document.activeElement).toBe(targetCard)

            // Simulate a re-render after activation (e.g. card flip)
            renderer.render(state)

            // Focus should be restored to the card at the same position,
            // not dropped to <body>
            const refocusedCard = within(boardEl).getAllByRole('button')[3]
            expect(document.activeElement).toBe(refocusedCard)
            renderer.destroy()
        })

        it('should not restore focus when no card was focused', async () => {
            const renderer = await createRenderer()
            const state = makeState()
            renderer.render(state)

            // No card is focused before re-render
            expect(
                within(boardEl)
                    .getAllByRole('button')
                    .some(card => card === document.activeElement)
            ).toBe(false)

            renderer.render(state)
            // Focus stays outside the board; structure is intact
            expect(boardEl.children.length).toBe(4)
            expect(
                within(boardEl)
                    .getAllByRole('button')
                    .some(card => card === document.activeElement)
            ).toBe(false)
            renderer.destroy()
        })

        it('should restore focus to a card that flips between renders', async () => {
            const renderer = await createRenderer()
            const callback = vi.fn()
            renderer.setCardClickCallback(callback)

            const card = makeCard({ id: 'c-0-0', isFlipped: false })
            const state = makeState({ board: [[card]] })
            renderer.render(state)

            // Focus the face-down card (tabindex="0")
            const cardEl = within(boardEl).getByRole('button', {
                name: /face down/i,
            })
            cardEl.focus()
            expect(document.activeElement).toBe(cardEl)

            // Simulate the card flipping after keyboard activation
            card.isFlipped = true
            renderer.render(state)

            // Focus should be restored to the now-flipped card (tabindex="-1"),
            // not dropped to <body>
            const flippedCardEl = within(boardEl).getByRole('img', {
                name: /face up/i,
            })
            expect(flippedCardEl).toHaveAttribute('tabindex', '-1')
            expect(document.activeElement).toBe(flippedCardEl)
            renderer.destroy()
        })
    })

    describe('card CSS classes', () => {
        it('should apply matched card classes (green)', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({ board: [[makeCard({ isMatched: true })]] })
            )

            const cardEl = boardEl.querySelector('div') as HTMLElement
            expect(cardEl?.className).toContain('bg-green-600')
            renderer.destroy()
        })

        it('should apply flipped card classes (cyan)', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({
                    board: [[makeCard({ isFlipped: true, isMatched: false })]],
                })
            )

            const cardEl = boardEl.querySelector('div') as HTMLElement
            expect(cardEl?.className).toContain('border-cyan-400')
            renderer.destroy()
        })

        it('should apply default (unflipped) card classes', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({
                    board: [[makeCard({ isFlipped: false, isMatched: false })]],
                })
            )

            const cardEl = boardEl.querySelector('div') as HTMLElement
            expect(cardEl?.className).toContain('bg-slate-700')
            renderer.destroy()
        })

        it('should apply flipped card classes (no inline style override)', async () => {
            const renderer = await createRenderer()
            renderer.render(
                makeState({
                    board: [[makeCard({ isFlipped: true, color: '#FF0000' })]],
                })
            )

            const cardEl = boardEl.querySelector('div') as HTMLElement
            // Styling is driven by Tailwind classes, not inline styles.
            expect(cardEl?.style.backgroundColor).toBe('')
            expect(cardEl?.className).toContain('bg-slate-600')
            renderer.destroy()
        })
    })

    describe('UI element updates', () => {
        it('should update game-score element', async () => {
            const renderer = await createRenderer()
            const el = document.createElement('div')
            el.id = 'game-score'
            document.body.appendChild(el)

            renderer.render(makeState({ score: 500 }))
            expect(el.textContent).toBe('500')
            renderer.destroy()
        })

        it('should update game-pairs element', async () => {
            const renderer = await createRenderer()
            const el = document.createElement('div')
            el.id = 'game-pairs'
            document.body.appendChild(el)

            renderer.render(makeState({ matchedPairs: 3, totalPairs: 8 }))
            expect(el.textContent).toBe('3/8')
            renderer.destroy()
        })

        it('should update game-time element with color when low', async () => {
            const renderer = await createRenderer()
            const el = document.createElement('div')
            el.id = 'game-time'
            document.body.appendChild(el)

            renderer.render(makeState({ timeRemaining: 5 }))
            expect(el.textContent).toBeTruthy()
            expect(el.className).toContain('text-red-400')
            renderer.destroy()
        })

        it('should update game-accuracy element', async () => {
            const renderer = await createRenderer()
            const el = document.createElement('div')
            el.id = 'game-accuracy'
            document.body.appendChild(el)

            renderer.render(makeState({ accuracy: 75 }))
            expect(el.textContent).toBe('75%')
            renderer.destroy()
        })
    })

    describe('cleanup', () => {
        it('should clear the board element', async () => {
            const renderer = await createRenderer()
            renderer.render(makeState())
            expect(boardEl.children.length).toBeGreaterThan(0)

            renderer.destroy()
            expect(boardEl.children.length).toBe(0)
        })
    })

    describe('render guards', () => {
        it('should not render when state is null', async () => {
            const renderer = await createRenderer()
            renderer.render(null as unknown)
            expect(boardEl.children.length).toBe(0)
            renderer.destroy()
        })

        it('should not render when state is a non-object primitive', async () => {
            const renderer = await createRenderer()
            renderer.render('not-a-state' as unknown)
            expect(boardEl.children.length).toBe(0)
            renderer.destroy()
        })

        it('should not render when state object is missing board', async () => {
            const renderer = await createRenderer()
            renderer.render({ needsRedraw: true } as unknown)
            expect(boardEl.children.length).toBe(0)
            renderer.destroy()
        })

        it('should not render when state object is missing needsRedraw', async () => {
            const renderer = await createRenderer()
            renderer.render({ board: [] } as unknown)
            expect(boardEl.children.length).toBe(0)
            renderer.destroy()
        })

        it('should not render board when boardElement is null', async () => {
            const renderer = await createRenderer()
            ;(
                renderer as unknown as { boardElement: HTMLElement | null }
            ).boardElement = null
            renderer.render(makeState())
            expect(boardEl.children.length).toBe(0)
            renderer.destroy()
        })
    })

    describe('game-time element color tiers', () => {
        it('should apply yellow class when timeRemaining is between 11 and 30', async () => {
            const renderer = await createRenderer()
            const el = document.createElement('div')
            el.id = 'game-time'
            document.body.appendChild(el)

            renderer.render(makeState({ timeRemaining: 20 }))
            expect(el.className).toContain('text-yellow-400')
            renderer.destroy()
        })

        it('should apply white class when timeRemaining is above 30', async () => {
            const renderer = await createRenderer()
            const el = document.createElement('div')
            el.id = 'game-time'
            document.body.appendChild(el)

            renderer.render(makeState({ timeRemaining: 45 }))
            expect(el.className).toContain('text-white')
            renderer.destroy()
        })

        it('should update time-remaining element with seconds', async () => {
            const renderer = await createRenderer()
            const el = document.createElement('div')
            el.id = 'time-remaining'
            document.body.appendChild(el)

            renderer.render(makeState({ timeRemaining: 37 }))
            expect(el.textContent).toBe('37s')
            renderer.destroy()
        })
    })

    describe('createMemoryMatrixRendererConfig', () => {
        it('should return a dom renderer config for the memory board', () => {
            const config = createMemoryMatrixRendererConfig()
            expect(config).toEqual({
                type: 'dom',
                container: '#memory-board',
                cleanOnRender: false,
            })
        })
    })
})
