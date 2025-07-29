import type { RendererConfig } from './types'

export abstract class BaseRenderer {
    protected config: RendererConfig
    protected container: HTMLElement | null = null
    protected isInitialized: boolean = false

    constructor(config: RendererConfig) {
        this.config = config
    }

    /**
     * Initialize the renderer
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return
        }

        // Get container element
        this.container = document.querySelector(this.config.container)
        if (!this.container) {
            throw new Error(
                `Container element not found: ${this.config.container}`
            )
        }

        await this.setup()
        this.isInitialized = true
    }

    /**
     * Abstract methods that each renderer must implement
     */
    abstract setup(): Promise<void>
    abstract render(state: unknown): void
    abstract resize(width: number, height: number): void
    abstract cleanup(): void

    /**
     * Check if renderer is initialized
     */
    isReady(): boolean {
        return this.isInitialized && this.container !== null
    }

    /**
     * Get container element
     */
    getContainer(): HTMLElement | null {
        return this.container
    }

    /**
     * Get renderer configuration
     */
    getConfig(): RendererConfig {
        return { ...this.config }
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<RendererConfig>): void {
        this.config = { ...this.config, ...newConfig }

        if (this.isInitialized) {
            this.onConfigUpdate()
        }
    }

    /**
     * Handle configuration updates (override in subclasses)
     */
    protected onConfigUpdate(): void {
        // Override in subclasses if needed
    }

    /**
     * Handle window resize (if responsive is enabled)
     */
    protected handleResize(): void {
        if (!this.config.responsive || !this.container) {
            return
        }

        const containerRect = this.container.getBoundingClientRect()
        this.resize(containerRect.width, containerRect.height)
    }

    /**
     * Destroy the renderer and clean up resources
     */
    destroy(): void {
        this.cleanup()
        this.container = null
        this.isInitialized = false
    }
}
