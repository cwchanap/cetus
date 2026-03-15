import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RendererFactory } from './RendererFactory'
import { DOMRenderer } from './DOMRenderer'
import { PixiJSRenderer } from './PixiJSRenderer'

// Mock PixiJSRenderer to avoid needing WebGL
vi.mock('./PixiJSRenderer', () => {
    const MockPixiJSRenderer = vi
        .fn()
        .mockImplementation((config: unknown) => ({
            config,
            initialize: vi.fn().mockResolvedValue(undefined),
            isReady: vi.fn().mockReturnValue(false),
            destroy: vi.fn(),
        }))
    return { PixiJSRenderer: MockPixiJSRenderer }
})

describe('RendererFactory', () => {
    let container: HTMLElement

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'factory-test-container'
        document.body.appendChild(container)
    })

    afterEach(() => {
        if (container.parentNode) {
            document.body.removeChild(container)
        }
        vi.clearAllMocks()
        vi.unstubAllGlobals()
    })

    describe('create', () => {
        it('should create a DOMRenderer for type "dom"', () => {
            const renderer = RendererFactory.create('dom', {
                type: 'dom',
                container: '#factory-test-container',
            })
            expect(renderer).toBeInstanceOf(DOMRenderer)
        })

        it('should create a PixiJSRenderer for type "canvas"', () => {
            RendererFactory.create('canvas', {
                type: 'canvas',
                container: '#factory-test-container',
            })
            expect(PixiJSRenderer).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'canvas' })
            )
        })

        it('should throw for unknown renderer type', () => {
            expect(() =>
                RendererFactory.create('unknown' as 'dom', {
                    type: 'dom',
                    container: '#factory-test-container',
                })
            ).toThrow('Unknown renderer type: unknown')
        })
    })

    describe('createCanvas', () => {
        it('should create a PixiJSRenderer with default config', () => {
            // Stub devicePixelRatio
            vi.stubGlobal('devicePixelRatio', 2)
            RendererFactory.createCanvas('#factory-test-container')
            expect(PixiJSRenderer).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'canvas',
                    container: '#factory-test-container',
                    width: 800,
                    height: 600,
                    responsive: true,
                    backgroundColor: 0x000000,
                    antialias: true,
                    transparent: false,
                    resolution: 2,
                })
            )
        })

        it('should merge custom config overrides', () => {
            RendererFactory.createCanvas('#factory-test-container', {
                width: 1024,
                height: 768,
                backgroundColor: 0xffffff,
            })
            expect(PixiJSRenderer).toHaveBeenCalledWith(
                expect.objectContaining({
                    width: 1024,
                    height: 768,
                    backgroundColor: 0xffffff,
                })
            )
        })
    })

    describe('createDOM', () => {
        it('should create a DOMRenderer with default config', () => {
            const renderer = RendererFactory.createDOM(
                '#factory-test-container'
            )
            expect(renderer).toBeInstanceOf(DOMRenderer)
        })

        it('should apply default responsive and cleanOnRender settings', () => {
            // Access config via the internal config getter
            const renderer = RendererFactory.createDOM(
                '#factory-test-container'
            )
            const config = renderer.getConfig()
            expect(config.responsive).toBe(true)
            // cleanOnRender is part of DOMRendererConfig but exposed via getConfig
            expect((config as { cleanOnRender?: boolean }).cleanOnRender).toBe(
                true
            )
        })

        it('should merge custom config overrides', () => {
            const renderer = RendererFactory.createDOM(
                '#factory-test-container',
                { responsive: false, cleanOnRender: false }
            )
            const config = renderer.getConfig()
            expect(config.responsive).toBe(false)
        })
    })
})
