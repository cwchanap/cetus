import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/dom'
import {
    createPotionSorterRendererConfig,
    PotionSorterRenderer,
} from './PotionSorterRenderer'
import { POTION_SORTER_PRESETS } from './levels'
import type { PotionSorterState } from './types'

function setupDOM(): void {
    // Mirrors the static skeleton rendered by src/pages/potion-sorter/index.astro.
    const skeleton = Array.from({ length: 9 }, (_, index) =>
        [
            `<button type="button" class="potion-tube" data-tube-index="${index}" hidden>`,
            '<span class="potion-layer" aria-hidden="true"></span>'.repeat(4),
            '</button>',
        ].join('')
    ).join('')
    document.body.innerHTML = `
        <div id="potion-sorter-board" class="potion-sorter-board" aria-label="Potion tubes">${skeleton}</div>
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

    it('shows five of the nine static tube buttons for the Easy preset', () => {
        renderer.render(makeState())

        const buttons = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
                `${boardSelector} button[data-tube-index]`
            )
        )
        expect(buttons).toHaveLength(9)
        expect(buttons.map(button => button.dataset.tubeIndex)).toEqual([
            '0',
            '1',
            '2',
            '3',
            '4',
            '5',
            '6',
            '7',
            '8',
        ])
        expect(
            buttons
                .filter(button => !button.hidden)
                .map(button => button.dataset.tubeIndex)
        ).toEqual(['0', '1', '2', '3', '4'])
        // Empty tube 4: all placeholder layers hidden, no liquid data.
        const emptyLayers = document.querySelectorAll(
            `${boardSelector} button[data-tube-index="4"] .potion-layer[hidden]`
        )
        expect(emptyLayers).toHaveLength(4)
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
        expect(tube0.getAttribute('aria-pressed')).toBe('false')
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

    it('keeps focus on the focused tube across rerenders', () => {
        renderer.render(makeState())
        const tube2 = document.querySelector<HTMLButtonElement>(
            `${boardSelector} button[data-tube-index="2"]`
        )!
        tube2.focus()

        renderer.render(makeState({ selectedTubeIndex: 2 }))

        expect(document.activeElement).toBe(tube2)
    })

    it('destroy removes the click listener and keeps the static board', () => {
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
        expect(board.querySelectorAll('button[data-tube-index]')).toHaveLength(
            9
        )
    })
})
