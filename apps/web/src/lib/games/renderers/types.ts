// Renderer configuration types — web host boundary (HPA-447 Stage 2).
// Renderer selection is a presentation concern; game logic never sees it.

export type RendererType = 'canvas' | 'dom'

export interface RendererConfig {
    type: RendererType
    container: string // DOM selector
    width?: number
    height?: number
    responsive?: boolean
}
