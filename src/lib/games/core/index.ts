// Core game framework exports
export { BaseGame } from './BaseGame'
export { BaseRenderer } from './BaseRenderer'
export { GameEventEmitter } from './EventEmitter'
export { GameTimer } from './GameTimer'
export { ScoreManager } from './ScoreManager'
export { GameInitializer } from './GameInitializer'

// Renderer exports
export {
    RendererFactory,
    PixiJSRenderer,
    DOMRenderer,
} from '../renderers/RendererFactory'

// Type exports
export type {
    BaseGameState,
    BaseGameConfig,
    BaseGameCallbacks,
    BaseGameStats,
    ScoringConfig,
    GameEventType,
    GameEvent,
    RendererType,
    RendererConfig,
} from './types'

export type {
    PixiJSRendererConfig,
    DOMRendererConfig,
} from '../renderers/RendererFactory'
export type { GameInitializerConfig } from './GameInitializer'
