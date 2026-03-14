import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BaseRenderer } from './BaseRenderer'
import type { RendererConfig } from './types'

// Concrete implementation for testing
class TestRenderer extends BaseRenderer {
    setupCalled = false
    renderCalled = false
    resizeCalled = false
    cleanupCalled = false
    lastRenderState: unknown = null
    lastResizeArgs: { width: number; height: number } | null = null

    async setup(): Promise<void> {
        this.setupCalled = true
    }

    render(state: unknown): void {
        this.renderCalled = true
        this.lastRenderState = state
    }

    resize(width: number, height: number): void {
        this.resizeCalled = true
        this.lastResizeArgs = { width, height }
    }

    cleanup(): void {
        this.cleanupCalled = true
    }

    // Expose protected methods for testing
    testHandleResize(): void {
        this.handleResize()
    }

    testOnConfigUpdate(): void {
        this.onConfigUpdate()
    }
}

describe('BaseRenderer', () => {
    let renderer: TestRenderer
    let container: HTMLElement
    const defaultConfig: RendererConfig = {
        type: 'dom',
        container: '#game-container',
    }

    beforeEach(() => {
        // Set up a DOM container
        container = document.createElement('div')
        container.id = 'game-container'
        document.body.appendChild(container)

        renderer = new TestRenderer(defaultConfig)
    })

    afterEach(() => {
        document.body.removeChild(container)
    })

    describe('initialize', () => {
        it('should initialize and call setup', async () => {
            await renderer.initialize()
            expect(renderer.setupCalled).toBe(true)
            expect(renderer.isReady()).toBe(true)
        })

        it('should not call setup twice if already initialized', async () => {
            await renderer.initialize()
            renderer.setupCalled = false
            await renderer.initialize()
            expect(renderer.setupCalled).toBe(false)
        })

        it('should throw if container element not found', async () => {
            const badRenderer = new TestRenderer({
                type: 'dom',
                container: '#nonexistent',
            })
            await expect(badRenderer.initialize()).rejects.toThrow(
                'Container element not found: #nonexistent'
            )
        })
    })

    describe('isReady', () => {
        it('should return false before initialization', () => {
            expect(renderer.isReady()).toBe(false)
        })

        it('should return true after initialization', async () => {
            await renderer.initialize()
            expect(renderer.isReady()).toBe(true)
        })
    })

    describe('getContainer', () => {
        it('should return null before initialization', () => {
            expect(renderer.getContainer()).toBeNull()
        })

        it('should return container element after initialization', async () => {
            await renderer.initialize()
            expect(renderer.getContainer()).toBe(container)
        })
    })

    describe('getConfig', () => {
        it('should return a copy of the config', () => {
            const config = renderer.getConfig()
            expect(config).toEqual(defaultConfig)
            // Ensure it's a copy, not the same reference
            config.container = '#modified'
            expect(renderer.getConfig().container).toBe('#game-container')
        })
    })

    describe('updateConfig', () => {
        it('should update the config', () => {
            renderer.updateConfig({ width: 800 })
            expect(renderer.getConfig().width).toBe(800)
        })

        it('should call onConfigUpdate when initialized', async () => {
            await renderer.initialize()

            const spy = vi.spyOn(renderer as any, 'onConfigUpdate')
            renderer.updateConfig({ width: 800 })
            expect(spy).toHaveBeenCalled()
            expect(renderer.getConfig().width).toBe(800)
        })

        it('should not call onConfigUpdate when not initialized', () => {
            // Not initialized, so onConfigUpdate should not throw
            expect(() => renderer.updateConfig({ width: 800 })).not.toThrow()
        })
    })

    describe('destroy', () => {
        it('should call cleanup and reset state', async () => {
            await renderer.initialize()
            renderer.destroy()
            expect(renderer.cleanupCalled).toBe(true)
            expect(renderer.isReady()).toBe(false)
            expect(renderer.getContainer()).toBeNull()
        })
    })

    describe('handleResize (protected)', () => {
        it('should do nothing if responsive is not set', async () => {
            await renderer.initialize()
            renderer.testHandleResize()
            expect(renderer.resizeCalled).toBe(false)
        })

        it('should call resize with container dimensions when responsive is true', async () => {
            const responsiveRenderer = new TestRenderer({
                type: 'dom',
                container: '#game-container',
                responsive: true,
            })
            await responsiveRenderer.initialize()
            // Mock getBoundingClientRect
            vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
                width: 640,
                height: 480,
                top: 0,
                left: 0,
                bottom: 480,
                right: 640,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            })
            responsiveRenderer.testHandleResize()
            expect(responsiveRenderer.resizeCalled).toBe(true)
            expect(responsiveRenderer.lastResizeArgs).toEqual({
                width: 640,
                height: 480,
            })
            responsiveRenderer.destroy()
        })

        it('should do nothing if container is null', () => {
            const responsiveRenderer = new TestRenderer({
                type: 'dom',
                container: '#game-container',
                responsive: true,
            })
            // Not initialized — container is null
            responsiveRenderer.testHandleResize()
            expect(responsiveRenderer.resizeCalled).toBe(false)
        })
    })

    describe('render and resize', () => {
        it('should call render with state', async () => {
            await renderer.initialize()
            const state = { score: 42 }
            renderer.render(state)
            expect(renderer.renderCalled).toBe(true)
            expect(renderer.lastRenderState).toBe(state)
        })

        it('should call resize with dimensions', async () => {
            await renderer.initialize()
            renderer.resize(1024, 768)
            expect(renderer.resizeCalled).toBe(true)
            expect(renderer.lastResizeArgs).toEqual({
                width: 1024,
                height: 768,
            })
        })
    })
})
