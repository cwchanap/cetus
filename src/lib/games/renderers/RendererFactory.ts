import { BaseRenderer } from '../core/BaseRenderer'
import { PixiJSRenderer, type PixiJSRendererConfig } from './PixiJSRenderer'
import { DOMRenderer, type DOMRendererConfig } from './DOMRenderer'
import type { RendererConfig, RendererType } from '../core/types'

export class RendererFactory {
    /**
     * Create a renderer based on type and configuration
     */
    static create(type: RendererType, config: RendererConfig): BaseRenderer {
        switch (type) {
            case 'canvas':
                return new PixiJSRenderer(config as PixiJSRendererConfig)
            case 'dom':
                return new DOMRenderer(config as DOMRendererConfig)
            default:
                throw new Error(`Unknown renderer type: ${type}`)
        }
    }

    /**
     * Create a PixiJS renderer with default canvas configuration
     */
    static createCanvas(
        container: string,
        config: Partial<PixiJSRendererConfig> = {}
    ): PixiJSRenderer {
        const defaultConfig: PixiJSRendererConfig = {
            type: 'canvas',
            container,
            width: 800,
            height: 600,
            responsive: true,
            backgroundColor: 0x000000,
            antialias: true,
            transparent: false,
            resolution: window.devicePixelRatio || 1,
            ...config,
        }

        return new PixiJSRenderer(defaultConfig)
    }

    /**
     * Create a DOM renderer with default configuration
     */
    static createDOM(
        container: string,
        config: Partial<DOMRendererConfig> = {}
    ): DOMRenderer {
        const defaultConfig: DOMRendererConfig = {
            type: 'dom',
            container,
            responsive: true,
            cleanOnRender: true,
            ...config,
        }

        return new DOMRenderer(defaultConfig)
    }
}

// Convenience exports
export { BaseRenderer, PixiJSRenderer, DOMRenderer }
export type { PixiJSRendererConfig, DOMRendererConfig }
