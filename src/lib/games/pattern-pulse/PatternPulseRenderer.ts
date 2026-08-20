import { DOMRenderer } from '@/lib/games/renderers/DOMRenderer'
import type { PatternPad, PatternPulseState } from './types'

export class PatternPulseRenderer extends DOMRenderer {
    private onPadPress?: (pad: PatternPad) => void
    private acceptingInput = false
    private padButtons: HTMLButtonElement[] = []

    constructor() {
        super({
            type: 'dom',
            container: '#pattern-pulse-board',
            cleanOnRender: false,
        })
    }

    private readonly clickHandler = (event: Event): void => {
        if (!this.acceptingInput || !this.container) {
            return
        }
        const target = event.target
        if (!(target instanceof Element)) {
            return
        }
        const button = target.closest<HTMLButtonElement>(
            'button[data-pattern-pad]'
        )
        if (!button || !this.container.contains(button)) {
            return
        }
        const value = Number(button.dataset.patternPad)
        if (value !== 0 && value !== 1 && value !== 2 && value !== 3) {
            return
        }
        this.onPadPress?.(value)
    }

    async setup(): Promise<void> {
        await super.setup()
        if (!this.container) {
            throw new Error('Pattern Pulse board not found')
        }
        this.padButtons = Array.from(
            this.container.querySelectorAll<HTMLButtonElement>(
                'button[data-pattern-pad]'
            )
        )
        if (this.padButtons.length !== 4) {
            throw new Error('Pattern Pulse requires exactly four pad buttons')
        }
        this.addEventListener('click', this.clickHandler)
    }

    setPadPressCallback(callback: (pad: PatternPad) => void): void {
        this.onPadPress = callback
    }

    protected override renderGame(rawState: unknown): void {
        if (!this.isPatternPulseState(rawState)) {
            return
        }
        this.acceptingInput = rawState.isActive && rawState.phase === 'input'

        for (const button of this.padButtons) {
            const pad = Number(button.dataset.patternPad) as PatternPad
            const active = rawState.activePad === pad
            button.setAttribute('aria-disabled', String(!this.acceptingInput))
            button.dataset.active = String(active)
            button.dataset.feedback =
                active && rawState.feedback === 'wrong' ? 'wrong' : 'none'
        }
    }

    cleanup(): void {
        this.removeEventListener('click', this.clickHandler)
        for (const button of this.padButtons) {
            button.removeAttribute('aria-disabled')
            delete button.dataset.active
            delete button.dataset.feedback
        }
        this.padButtons = []
        this.acceptingInput = false
        // No super.cleanup(): DOMRenderer.cleanup() would clear Astro-owned pads.
    }

    private isPatternPulseState(value: unknown): value is PatternPulseState {
        return Boolean(
            value &&
                typeof value === 'object' &&
                Array.isArray((value as PatternPulseState).sequence) &&
                typeof (value as PatternPulseState).phase === 'string'
        )
    }
}
