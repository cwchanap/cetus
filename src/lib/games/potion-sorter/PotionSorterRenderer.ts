import { DOMRenderer } from '@/lib/games/renderers/DOMRenderer'
import {
    POTION_TUBE_CAPACITY,
    type PotionColor,
    type PotionSorterState,
    type PotionTube,
} from './types'

const LIQUID_VISUALS: Record<PotionColor, { label: string; glyph: string }> = {
    cyan: { label: 'Cyan', glyph: '▲' },
    magenta: { label: 'Magenta', glyph: '●' },
    amber: { label: 'Amber', glyph: '◆' },
    lime: { label: 'Lime', glyph: '✦' },
    violet: { label: 'Violet', glyph: '⬢' },
    coral: { label: 'Coral', glyph: '■' },
    azure: { label: 'Azure', glyph: '✚' },
}

export class PotionSorterRenderer extends DOMRenderer {
    private onTubeAction?: (index: number) => void

    private readonly clickHandler = (event: Event): void => {
        this.dispatchTubeEvent(event)
    }

    async setup(): Promise<void> {
        await super.setup()
        this.addEventListener('click', this.clickHandler)
    }

    setTubeActionCallback(callback: (index: number) => void): void {
        this.onTubeAction = callback
    }

    protected override renderGame(rawState: unknown): void {
        if (!this.isPotionSorterState(rawState)) {
            return
        }
        const boardElement = this.container
        if (!boardElement) {
            return
        }

        const focusIndex = this.captureFocusIndex(boardElement)

        while (boardElement.firstChild) {
            boardElement.removeChild(boardElement.firstChild)
        }

        rawState.tubes.forEach((tube, index) => {
            boardElement.appendChild(
                this.createTubeButton(tube, index, rawState)
            )
        })

        this.restoreFocus(boardElement, focusIndex)
    }

    cleanup(): void {
        this.removeEventListener('click', this.clickHandler)
        super.cleanup()
    }

    private isPotionSorterState(value: unknown): value is PotionSorterState {
        return Boolean(
            value &&
                typeof value === 'object' &&
                Array.isArray((value as PotionSorterState).tubes)
        )
    }

    private captureFocusIndex(boardElement: HTMLElement): number | null {
        const activeElement = document.activeElement
        if (!(activeElement instanceof Element)) {
            return null
        }
        if (!boardElement.contains(activeElement)) {
            return null
        }
        const focusedButton = activeElement.closest<HTMLButtonElement>(
            'button[data-tube-index]'
        )
        if (!focusedButton) {
            return null
        }
        const index = Number(focusedButton.dataset.tubeIndex)
        return Number.isInteger(index) ? index : null
    }

    private restoreFocus(
        boardElement: HTMLElement,
        focusIndex: number | null
    ): void {
        if (focusIndex === null) {
            return
        }
        const buttonToFocus = boardElement.querySelector<HTMLButtonElement>(
            `button[data-tube-index="${focusIndex}"]`
        )
        buttonToFocus?.focus()
    }

    private createTubeButton(
        tube: PotionTube,
        index: number,
        state: PotionSorterState
    ): HTMLButtonElement {
        const selected = state.selectedTubeIndex === index
        const button = document.createElement('button')
        button.type = 'button'
        button.classList.add('potion-tube')
        button.dataset.tubeIndex = String(index)
        button.dataset.selected = String(selected)
        button.dataset.complete = String(
            tube.length === POTION_TUBE_CAPACITY && new Set(tube).size === 1
        )
        if (selected) {
            button.setAttribute('aria-pressed', 'true')
        }
        button.setAttribute('aria-label', this.getTubeLabel(index, tube))

        for (const color of tube) {
            button.appendChild(this.createLayerSpan(color))
        }
        return button
    }

    private createLayerSpan(color: PotionColor): HTMLSpanElement {
        const layer = document.createElement('span')
        layer.className = 'potion-layer'
        layer.dataset.liquid = color
        layer.textContent = LIQUID_VISUALS[color].glyph
        layer.setAttribute('aria-hidden', 'true')
        return layer
    }

    private getTubeLabel(index: number, tube: PotionTube): string {
        if (tube.length === 0) {
            return `Tube ${index + 1}: empty`
        }
        const contents = tube
            .map(color => LIQUID_VISUALS[color].label)
            .join(', ')
        return `Tube ${index + 1}: ${contents}`
    }

    private dispatchTubeEvent(event: Event): void {
        const target = event.target
        if (!(target instanceof Element) || !this.container) {
            return
        }
        const button = target.closest<HTMLButtonElement>(
            'button[data-tube-index]'
        )
        if (!button || !this.container.contains(button)) {
            return
        }
        const index = Number(button.dataset.tubeIndex)
        if (!Number.isInteger(index)) {
            return
        }
        this.onTubeAction?.(index)
    }
}

export function createPotionSorterRendererConfig() {
    return {
        type: 'dom' as const,
        container: '#potion-sorter-board',
        cleanOnRender: false,
    }
}
