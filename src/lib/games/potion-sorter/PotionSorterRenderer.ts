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

        const buttons = boardElement.querySelectorAll<HTMLButtonElement>(
            'button[data-tube-index]'
        )
        buttons.forEach((button, index) => {
            const tube = rawState.tubes[index]
            if (tube) {
                this.updateTubeButton(button, tube, index, rawState)
            } else {
                button.hidden = true
            }
        })
    }

    cleanup(): void {
        // Tubes are static Astro markup; DOMRenderer.cleanup would wipe them.
        this.removeEventListener('click', this.clickHandler)
    }

    private isPotionSorterState(value: unknown): value is PotionSorterState {
        return Boolean(
            value &&
                typeof value === 'object' &&
                Array.isArray((value as PotionSorterState).tubes)
        )
    }

    private updateTubeButton(
        button: HTMLButtonElement,
        tube: PotionTube,
        index: number,
        state: PotionSorterState
    ): void {
        button.hidden = false
        const selected = state.selectedTubeIndex === index
        button.dataset.tubeIndex = String(index)
        button.dataset.selected = String(selected)
        button.dataset.complete = String(
            tube.length === POTION_TUBE_CAPACITY && new Set(tube).size === 1
        )
        button.setAttribute('aria-pressed', String(selected))
        button.setAttribute('aria-label', this.getTubeLabel(index, tube))

        const layers = button.querySelectorAll<HTMLSpanElement>('.potion-layer')
        layers.forEach((layer, layerIndex) => {
            const color = tube[layerIndex]
            if (color) {
                layer.hidden = false
                if (layer.dataset.liquid !== color) {
                    layer.dataset.liquid = color
                    layer.textContent = LIQUID_VISUALS[color].glyph
                }
            } else {
                layer.hidden = true
                delete layer.dataset.liquid
                layer.textContent = ''
            }
        })
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
