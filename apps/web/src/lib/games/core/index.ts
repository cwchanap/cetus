// Web game-framework facade — the web host owns renderers and the DOM
// initializer; portable game simulation lives in `@cetus/games`.
export { BaseRenderer } from './BaseRenderer'

// Renderer exports
export {
    RendererFactory,
    PixiJSRenderer,
    DOMRenderer,
} from '../renderers/RendererFactory'

export type {
    PixiJSRendererConfig,
    DOMRendererConfig,
} from '../renderers/RendererFactory'
export type { RendererConfig, RendererType } from '../renderers/types'
