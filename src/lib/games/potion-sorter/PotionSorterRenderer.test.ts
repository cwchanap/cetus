import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/dom'
import {
    createPotionSorterRendererConfig,
    PotionSorterRenderer,
} from './PotionSorterRenderer'
import { POTION_SORTER_PRESETS } from './levels'
import type { PotionSorterState } from './types'

function setupDOM(): void {
    document.body.innerHTML = `
        <div id="potion-sorter-board" class="potion-sorter-board" aria-label="Potion tubes"></div>
    `
}

function makeState(
    overrides: Partial<PotionSorterState> = {}
): PotionSorterState {
    return {
        score: 0,
        timeRemaining: 180,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        difficulty: 'easy',
        tubes: POTION_SORTER_PRESETS.easy.initialTubes.map(tube => [...tube]),
        selectedTubeIndex: null,
        movesMade: 0,
        undosUsed: 0,
        result: 'playing',
        ...overrides,
    }
}

const boardSelector = '#potion-sorter-board'

describe('PotionSorterRenderer', () => {
    let renderer: PotionSorterRenderer

    beforeEach(async () => {
        setupDOM()
        renderer = new PotionSorterRenderer(createPotionSorterRendererConfig())
        await renderer.initialize()
    })

    afterEach(() => {
        renderer.destroy()
        document.body.replaceChildren()
    })

    it('renders five tube buttons for the Easy preset', () => {
        renderer.render(makeState())

        const buttons = document.querySelectorAll<HTMLButtonElement>(
            `${boardSelector} button[data-tube-index]`
        )
        expect(buttons).toHaveLength(5)
        expect(
            Array.from(buttons).map(button => button.dataset.tubeIndex)
        ).toEqual(['0', '1', '2', '3', '4'])
    })

    it('renders four potion layers on tube 0 in bottom-to-top order', () => {
        renderer.render(makeState())

        const tube0 = document.querySelector<HTMLButtonElement>(
            `${boardSelector} button[data-tube-index="0"]`
        )!
        const layers = tube0.querySelectorAll('.potion-layer')
        expect(layers).toHaveLength(4)
        expect(
            Array.from(layers).map(layer => layer.getAttribute('data-liquid'))
        ).toEqual(['cyan', 'magenta', 'amber', 'cyan'])
    })

    it('labels each layer with its glyph and hides it from assistive tech', () => {
        renderer.render(makeState())

        const tube0 = document.querySelector<HTMLButtonElement>(
            `${boardSelector} button[data-tube-index="0"]`
        )!
        const layers = Array.from(tube0.querySelectorAll('.potion-layer'))
        expect(layers.map(layer => layer.textContent)).toEqual([
            '▲',
            '●',
            '◆',
            '▲',
        ])
        for (const layer of layers) {
            expect(layer.getAttribute('aria-hidden')).toBe('true')
        }
    })

    it('describes each tube with a human-readable aria-label', () => {
        renderer.render(makeState())

        expect(
            document
                .querySelector<HTMLButtonElement>(
                    `${boardSelector} button[data-tube-index="0"]`
                )!
                .getAttribute('aria-label')
        ).toBe('Tube 1: Cyan, Magenta, Amber, Cyan')
        expect(
            document
                .querySelector<HTMLButtonElement>(
                    `${boardSelector} button[data-tube-index="4"]`
                )!
                .getAttribute('aria-label')
        ).toBe('Tube 5: empty')
    })

    it('marks only the selected tube with aria-pressed', () => {
        renderer.render(makeState({ selectedTubeIndex: 1 }))

        const tube1 = document.querySelector<HTMLButtonElement>(
            `${boardSelector} button[data-tube-index="1"]`
        )!
        const tube0 = document.querySelector<HTMLButtonElement>(
            `${boardSelector} button[data-tube-index="0"]`
        )!
        expect(tube1.getAttribute('aria-pressed')).toBe('true')
        expect(tube1.dataset.selected).toBe('true')
        expect(tube0.hasAttribute('aria-pressed')).toBe(false)
        expect(tube0.dataset.selected).toBe('false')
    })

    it('marks a uniform full tube as complete', () => {
        renderer.render(
            makeState({
                tubes: [
                    ['cyan', 'cyan', 'cyan', 'cyan'],
                    ['magenta'],
                    [],
                    [],
                    [],
                ],
            })
        )

        expect(
            document.querySelector<HTMLButtonElement>(
                `${boardSelector} button[data-tube-index="0"]`
            )!.dataset.complete
        ).toBe('true')
        expect(
            document.querySelector<HTMLButtonElement>(
                `${boardSelector} button[data-tube-index="1"]`
            )!.dataset.complete
        ).toBe('false')
    })

    it('delegates a click on a nested layer to that tube index', () => {
        const onTubeAction = vi.fn()
        renderer.setTubeActionCallback(onTubeAction)
        renderer.render(makeState())

        const layer = document.querySelector<HTMLElement>(
            `${boardSelector} button[data-tube-index="0"] .potion-layer`
        )!
        fireEvent.click(layer)

        expect(onTubeAction).toHaveBeenCalledTimes(1)
        expect(onTubeAction).toHaveBeenCalledWith(0)
    })

    it('restores focus to the same tube index after a rerender', () => {
        renderer.render(makeState())
        const originalTube2 = document.querySelector<HTMLButtonElement>(
            `${boardSelector} button[data-tube-index="2"]`
        )!
        originalTube2.focus()

        renderer.render(makeState({ selectedTubeIndex: 2 }))

        const newTube2 = document.querySelector<HTMLButtonElement>(
            `${boardSelector} button[data-tube-index="2"]`
        )!
        expect(newTube2).not.toBe(originalTube2)
        expect(document.activeElement).toBe(newTube2)
    })

    it('destroy removes the click listener and clears dynamic board children', () => {
        const onTubeAction = vi.fn()
        renderer.setTubeActionCallback(onTubeAction)
        renderer.render(makeState())
        const board = document.getElementById('potion-sorter-board')!
        const tube0 = document.querySelector<HTMLButtonElement>(
            `${boardSelector} button[data-tube-index="0"]`
        )!

        renderer.destroy()

        fireEvent.click(tube0)
        expect(onTubeAction).not.toHaveBeenCalled()
        expect(board.children).toHaveLength(0)
    })
})
