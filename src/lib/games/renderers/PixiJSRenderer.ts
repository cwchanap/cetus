import * as PIXI from 'pixi.js'
import { BaseRenderer } from '../core/BaseRenderer'
import type { RendererConfig } from '../core/types'

export interface PixiJSRendererConfig extends RendererConfig {
    backgroundColor?: number
    antialias?: boolean
    transparent?: boolean
    resolution?: number
}

export class PixiJSRenderer extends BaseRenderer {
    protected app: PIXI.Application | null = null
    protected pixiConfig: PixiJSRendererConfig

    constructor(config: PixiJSRendererConfig) {
        super(config)
        this.pixiConfig = config
    }

    /**
     * Set up PixiJS application
     */
    async setup(): Promise<void> {
        if (!this.container) {
            throw new Error('Container not found')
        }

        const width = this.config.width || this.container.clientWidth || 800
        const height = this.config.height || this.container.clientHeight || 600

        // Create PixiJS application
        this.app = new PIXI.Application()

        await this.app.init({
            width,
            height,
            backgroundColor: this.pixiConfig.backgroundColor || 0x000000,
            antialias: this.pixiConfig.antialias !== false,
            backgroundAlpha: this.pixiConfig.transparent ? 0 : 1,
            resolution:
                this.pixiConfig.resolution || window.devicePixelRatio || 1,
            autoDensity: true,
        })

        // Add canvas to container
        this.container.appendChild(this.app.canvas)

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
        if (!this.app) {
            return
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
        if (!this.app) {
            return
        }

        this.app.renderer.resize(width, height)
    }

    /**
     * Get PixiJS application instance
     */
    getApp(): PIXI.Application | null {
        return this.app
    }

    /**
     * Get main stage
     */
    getStage(): PIXI.Container | null {
        return this.app?.stage || null
    }

    /**
     * Create a graphics object
     */
    createGraphics(): PIXI.Graphics {
        return new PIXI.Graphics()
    }

    /**
     * Create a sprite from texture
     */
    createSprite(texture?: PIXI.Texture): PIXI.Sprite {
        return new PIXI.Sprite(texture)
    }

    /**
     * Create a container
     */
    createContainer(): PIXI.Container {
        return new PIXI.Container()
    }

    /**
     * Create text object
     */
    createText(text: string, style?: Partial<PIXI.TextStyle>): PIXI.Text {
        return new PIXI.Text({ text, style })
    }

    /**
     * Load texture from URL
     */
    async loadTexture(url: string): Promise<PIXI.Texture> {
        return await PIXI.Assets.load(url)
    }

    /**
     * Add child to stage
     */
    addToStage(child: PIXI.Container): void {
        if (this.app) {
            this.app.stage.addChild(child)
        }
    }

    /**
     * Remove child from stage
     */
    removeFromStage(child: PIXI.Container): void {
        if (this.app) {
            this.app.stage.removeChild(child)
        }
    }

    /**
     * Clear the stage
     */
    clearStage(): void {
        if (this.app) {
            this.app.stage.removeChildren()
        }
    }

    /**
     * Handle configuration updates
     */
    protected onConfigUpdate(): void {
        if (!this.app) {
            return
        }

        // Update renderer properties
        if (this.config.width && this.config.height) {
            this.resize(this.config.width, this.config.height)
        }
    }

    /**
     * Clean up PixiJS resources
     */
    cleanup(): void {
        if (this.app) {
            // Remove canvas from container
            if (
                this.container &&
                this.app.canvas.parentNode === this.container
            ) {
                this.container.removeChild(this.app.canvas)
            }

            // Destroy PixiJS application
            this.app.destroy(true, { children: true, texture: true })
            this.app = null
        }

        // Remove event listeners
        if (this.config.responsive) {
            window.removeEventListener('resize', () => this.handleResize())
        }
    }
}
