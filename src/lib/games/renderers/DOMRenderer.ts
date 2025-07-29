import { BaseRenderer } from '../core/BaseRenderer'
import type { RendererConfig } from '../core/types'

export interface DOMRendererConfig extends RendererConfig {
    containerClass?: string
    cleanOnRender?: boolean
}

export class DOMRenderer extends BaseRenderer {
    protected domConfig: DOMRendererConfig

    constructor(config: DOMRendererConfig) {
        super(config)
        this.domConfig = config
    }

    /**
     * Set up DOM renderer
     */
    async setup(): Promise<void> {
        if (!this.container) {
            throw new Error('Container not found')
        }

        // Apply container class if specified
        if (this.domConfig.containerClass) {
            this.container.className += ` ${this.domConfig.containerClass}`
        }

        // Set up responsive handling
        if (this.config.responsive) {
            window.addEventListener('resize', () => this.handleResize())
            // Initial resize
            this.handleResize()
        }
    }

    /**
     * Render the current state
     */
    render(state: unknown): void {
        if (!this.container) {
            return
        }

        // Clear container if cleanOnRender is enabled
        if (this.domConfig.cleanOnRender) {
            this.clearContainer()
        }

        // This is overridden by specific game renderers
        this.renderGame(state)
    }

    /**
     * Abstract method for game-specific rendering
     */
    protected renderGame(_state: unknown): void {
        // Override in game-specific renderers
    }

    /**
     * Resize the renderer
     */
    resize(width: number, height: number): void {
        if (!this.container) {
            return
        }

        this.container.style.width = `${width}px`
        this.container.style.height = `${height}px`
    }

    /**
     * Create a DOM element
     */
    createElement<K extends keyof HTMLElementTagNameMap>(
        tagName: K,
        className?: string,
        attributes?: Record<string, string>
    ): HTMLElementTagNameMap[K] {
        const element = document.createElement(tagName)

        if (className) {
            element.className = className
        }

        if (attributes) {
            Object.entries(attributes).forEach(([key, value]) => {
                element.setAttribute(key, value)
            })
        }

        return element
    }

    /**
     * Add element to container
     */
    addToContainer(element: HTMLElement): void {
        if (this.container) {
            this.container.appendChild(element)
        }
    }

    /**
     * Remove element from container
     */
    removeFromContainer(element: HTMLElement): void {
        if (this.container && this.container.contains(element)) {
            this.container.removeChild(element)
        }
    }

    /**
     * Clear all children from container
     */
    clearContainer(): void {
        if (this.container) {
            while (this.container.firstChild) {
                this.container.removeChild(this.container.firstChild)
            }
        }
    }

    /**
     * Find element by selector within container
     */
    findElement<T extends HTMLElement = HTMLElement>(
        selector: string
    ): T | null {
        if (!this.container) {
            return null
        }
        return this.container.querySelector<T>(selector)
    }

    /**
     * Find all elements by selector within container
     */
    findElements<T extends HTMLElement = HTMLElement>(
        selector: string
    ): NodeListOf<T> {
        if (!this.container) {
            return document.querySelectorAll<T>('')
        }
        return this.container.querySelectorAll<T>(selector)
    }

    /**
     * Set innerHTML of container
     */
    setContent(html: string): void {
        if (this.container) {
            this.container.innerHTML = html
        }
    }

    /**
     * Append HTML content to container
     */
    appendContent(html: string): void {
        if (this.container) {
            const tempDiv = document.createElement('div')
            tempDiv.innerHTML = html

            while (tempDiv.firstChild) {
                this.container.appendChild(tempDiv.firstChild)
            }
        }
    }

    /**
     * Add event listener to container
     */
    addEventListener<K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
        options?: boolean | AddEventListenerOptions
    ): void {
        if (this.container) {
            this.container.addEventListener(type, listener, options)
        }
    }

    /**
     * Remove event listener from container
     */
    removeEventListener<K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
        options?: boolean | EventListenerOptions
    ): void {
        if (this.container) {
            this.container.removeEventListener(type, listener, options)
        }
    }

    /**
     * Handle configuration updates
     */
    protected onConfigUpdate(): void {
        if (!this.container) {
            return
        }

        // Update container size if specified
        if (this.config.width && this.config.height) {
            this.resize(this.config.width, this.config.height)
        }
    }

    /**
     * Clean up DOM resources
     */
    cleanup(): void {
        // Clear container
        this.clearContainer()

        // Remove container class if it was added
        if (this.container && this.domConfig.containerClass) {
            this.container.classList.remove(this.domConfig.containerClass)
        }

        // Remove event listeners
        if (this.config.responsive) {
            window.removeEventListener('resize', () => this.handleResize())
        }
    }
}
