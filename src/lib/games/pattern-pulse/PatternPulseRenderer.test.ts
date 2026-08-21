import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternPulseRenderer } from './PatternPulseRenderer'
import type { PatternPad, PatternPulseState } from './types'

function inputState(
    overrides: Partial<PatternPulseState> = {}
): PatternPulseState {
    return {
        score: 0,
        timeRemaining: 60,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        phase: 'input',
        outcome: 'playing',
        sequence: [0, 1, 2],
        inputIndex: 0,
        activePad: null,
        feedback: null,
        completedRounds: 0,
        mistakes: 0,
        streak: 0,
        maxStreak: 0,
        longestSequence: 0,
        ...overrides,
    }
}

function watchState(activePad: PatternPad): PatternPulseState {
    return inputState({ phase: 'watch', activePad })
}

describe('PatternPulseRenderer', () => {
    let board: HTMLElement
    let renderer: PatternPulseRenderer | undefined

    beforeEach(() => {
        board = document.createElement('div')
        board.id = 'pattern-pulse-board'

        for (const pad of [0, 1, 2, 3]) {
            const button = document.createElement('button')
            button.type = 'button'
            button.dataset.patternPad = String(pad)
            board.appendChild(button)
        }

        document.body.appendChild(board)
    })

    afterEach(() => {
        renderer?.destroy()
        board.remove()
        vi.restoreAllMocks()
    })

    it('keeps a focused pad focusable while watch gates activation', async () => {
        renderer = new PatternPulseRenderer()
        const onPad = vi.fn()
        renderer.setPadPressCallback(onPad)
        await renderer.initialize()

        renderer.render(inputState())
        const pad = document.querySelector<HTMLButtonElement>(
            '[data-pattern-pad="1"]'
        )!
        pad.focus()
        expect(document.activeElement).toBe(pad)

        renderer.render(watchState(1))
        expect(pad.disabled).toBe(false)
        expect(pad).toHaveAttribute('aria-disabled', 'true')
        expect(document.activeElement).toBe(pad)
        pad.click()
        expect(onPad).not.toHaveBeenCalled()

        renderer.render(inputState())
        expect(pad).toHaveAttribute('aria-disabled', 'false')
        expect(document.activeElement).toBe(pad)
        pad.click()
        expect(onPad).toHaveBeenCalledWith(1)
    })

    it('renders active and wrong feedback attributes on static pads', async () => {
        renderer = new PatternPulseRenderer()
        await renderer.initialize()

        renderer.render(inputState({ activePad: 2, feedback: 'wrong' }))

        const activePad = board.querySelector<HTMLButtonElement>(
            '[data-pattern-pad="2"]'
        )!
        const otherPad = board.querySelector<HTMLButtonElement>(
            '[data-pattern-pad="1"]'
        )!
        expect(activePad).toHaveAttribute('data-active', 'true')
        expect(activePad).toHaveAttribute('data-feedback', 'wrong')
        expect(otherPad).toHaveAttribute('data-active', 'false')
        expect(otherPad).toHaveAttribute('data-feedback', 'none')

        renderer.render(inputState({ activePad: 2, feedback: 'correct' }))
        expect(activePad).toHaveAttribute('data-active', 'true')
        expect(activePad).toHaveAttribute('data-feedback', 'none')
    })

    it('destroy preserves pads and allows re-initialization', async () => {
        renderer = new PatternPulseRenderer()
        await renderer.initialize()
        renderer.render(inputState())
        renderer.destroy()

        expect(
            document.querySelectorAll('button[data-pattern-pad]')
        ).toHaveLength(4)
        expect(board.querySelector('[aria-disabled]')).toBeNull()
        expect(board.querySelector('[data-active]')).toBeNull()
        expect(board.querySelector('[data-feedback]')).toBeNull()

        await renderer.initialize()
        renderer.render(inputState())
        expect(
            document.querySelectorAll('button[data-pattern-pad]')
        ).toHaveLength(4)
    })

    it('rejects initialization when the board is missing', async () => {
        board.remove()
        renderer = new PatternPulseRenderer()
        await expect(renderer.initialize()).rejects.toThrow(
            /pattern-pulse-board/
        )
    })

    it('rejects initialization when pad count is not four', async () => {
        board.querySelector('[data-pattern-pad="3"]')?.remove()
        renderer = new PatternPulseRenderer()
        await expect(renderer.initialize()).rejects.toThrow(
            /exactly four pad buttons/
        )
    })

    it('ignores clicks on non-Element targets, non-pad elements, and invalid pad values', async () => {
        renderer = new PatternPulseRenderer()
        const onPad = vi.fn()
        renderer.setPadPressCallback(onPad)
        await renderer.initialize()
        renderer.render(inputState())

        // Non-Element target (Text node)
        const text = document.createTextNode('hello')
        board.appendChild(text)
        text.dispatchEvent(new Event('click', { bubbles: true }))
        expect(onPad).not.toHaveBeenCalled()

        // Non-pad element inside the board
        const div = document.createElement('div')
        board.appendChild(div)
        div.click()
        expect(onPad).not.toHaveBeenCalled()

        // Button with invalid pad value
        const invalidButton = document.createElement('button')
        invalidButton.dataset.patternPad = '5'
        board.appendChild(invalidButton)
        invalidButton.click()
        expect(onPad).not.toHaveBeenCalled()
    })

    it('ignores render calls with non-PatternPulseState objects', async () => {
        renderer = new PatternPulseRenderer()
        await renderer.initialize()
        renderer.render(inputState())

        // Render with invalid state — should not crash or change pads
        renderer.render({} as PatternPulseState)
        renderer.render(null as unknown as PatternPulseState)

        const pad = board.querySelector<HTMLButtonElement>(
            '[data-pattern-pad="0"]'
        )!
        // Previous render's attributes remain unchanged
        expect(pad).toHaveAttribute('aria-disabled', 'false')
    })
})
