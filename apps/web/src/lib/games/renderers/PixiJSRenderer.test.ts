import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock pixi.js before imports
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = { alpha: 1, x: 0, y: 0 }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
            'roundRect',
        ]) {
            g[m] = vi.fn(() => g)
        }
        g['destroy'] = vi.fn()
        return g
    }

    const makeRenderer = () => ({ resize: vi.fn() })

    const makeStage = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
    })

    const makeApp = () => {
        const canvas = document.createElement('canvas')
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: makeStage(),
            renderer: makeRenderer(),
            destroy: vi.fn(),
        }
    }

    const MockApplication = vi.fn(makeApp)
    const MockGraphics = vi.fn(makeGraphics)
    const MockContainer = vi.fn(() => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
        destroy: vi.fn(),
    }))
    const MockSprite = vi.fn(() => ({ destroy: vi.fn(), texture: null }))
    const MockText = vi.fn(() => ({ text: '', destroy: vi.fn() }))
    const MockAssets = { load: vi.fn().mockResolvedValue({ source: 'mock' }) }

    return {
        Application: MockApplication,
        Graphics: MockGraphics,
        Container: MockContainer,
        Sprite: MockSprite,
        Text: MockText,
        Assets: MockAssets,
    }
})

import { PixiJSRenderer } from './PixiJSRenderer'
import { Application, Graphics, Container } from 'pixi.js'

// Concrete subclass for testing
class TestPixiJSRenderer extends PixiJSRenderer {
    renderGameCalled = false
    lastState: unknown = null

    protected override renderGame(state: unknown): void {
        this.renderGameCalled = true
        this.lastState = state
    }
}

describe('PixiJSRenderer', () => {
    let container: HTMLElement
    let renderer: TestPixiJSRenderer

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'pixi-test-container'
        document.body.appendChild(container)
        vi.clearAllMocks()
    })

    afterEach(() => {
        try {
            renderer?.destroy()
        } catch {
            /* ignore */
        }
        document.body.removeChild(container)
    })

    describe('initialize and setup', () => {
        it('should initialize successfully with a valid container', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()
            expect(renderer.isReady()).toBe(true)
        })

        it('should throw when container does not exist', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#nonexistent',
            })
            await expect(renderer.initialize()).rejects.toThrow()
        })

        it('should use resolution 1 when both pixiConfig.resolution and devicePixelRatio are falsy (line 43 || 1 branch)', async () => {
            vi.stubGlobal('devicePixelRatio', 0)
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
                // resolution omitted → undefined (falsy)
            })
            await renderer.initialize()
            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.init).toHaveBeenCalledWith(
                expect.objectContaining({ resolution: 1 })
            )
        })

        it('should call app.init with correct dimensions', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
                width: 640,
                height: 480,
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.init).toHaveBeenCalledWith(
                expect.objectContaining({ width: 640, height: 480 })
            )
        })

        it('should use container dimensions when width/height not set', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.init).toHaveBeenCalled()
        })

        it('should append canvas to container DOM', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()
            expect(container.children.length).toBeGreaterThan(0)
        })

        it('should set up resize listener when responsive is true', async () => {
            const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
                responsive: true,
            })
            await renderer.initialize()
            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'resize',
                expect.any(Function)
            )
            addEventListenerSpy.mockRestore()
        })

        it('should not re-initialize if already initialized', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()
            await renderer.initialize() // second call should no-op

            const MockApp = vi.mocked(Application)
            // Application constructor called only once
            expect(MockApp).toHaveBeenCalledTimes(1)
        })

        it('should use custom backgroundColor', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
                backgroundColor: 0xff0000,
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.init).toHaveBeenCalledWith(
                expect.objectContaining({ backgroundColor: 0xff0000 })
            )
        })

        it('should use transparent background when transparent is true', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
                transparent: true,
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.init).toHaveBeenCalledWith(
                expect.objectContaining({ backgroundAlpha: 0 })
            )
        })
    })

    describe('render', () => {
        it('should call renderGame when app is ready', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            renderer.render({ score: 42 })
            expect(renderer.renderGameCalled).toBe(true)
            expect(renderer.lastState).toEqual({ score: 42 })
        })

        it('should not throw when app is null (not initialized)', () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            expect(() => renderer.render({})).not.toThrow()
            expect(renderer.renderGameCalled).toBe(false)
        })
    })

    describe('resize', () => {
        it('should call app.renderer.resize with correct dimensions', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            renderer.resize(800, 600)

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.renderer.resize).toHaveBeenCalledWith(800, 600)
        })

        it('should not throw when app is null', () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            expect(() => renderer.resize(800, 600)).not.toThrow()
        })
    })

    describe('getApp and getStage', () => {
        it('should return null before initialization', () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            expect(renderer.getApp()).toBeNull()
            expect(renderer.getStage()).toBeNull()
        })

        it('should return app and stage after initialization', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()
            expect(renderer.getApp()).not.toBeNull()
            expect(renderer.getStage()).not.toBeNull()
        })
    })

    describe('createGraphics / createContainer / createText', () => {
        it('should create a Graphics instance', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            const beforeCount = vi.mocked(Graphics).mock.results.length
            const gfx = renderer.createGraphics()
            expect(vi.mocked(Graphics).mock.results.length).toBe(
                beforeCount + 1
            )
            expect(gfx).toBeDefined()
        })

        it('should create a Container instance', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            const beforeCount = vi.mocked(Container).mock.results.length
            const cont = renderer.createContainer()
            expect(vi.mocked(Container).mock.results.length).toBe(
                beforeCount + 1
            )
            expect(cont).toBeDefined()
        })

        it('should create a Text instance', async () => {
            const { Text } = await import('pixi.js')
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            const text = renderer.createText('hello')
            expect(text).toBeDefined()
        })
    })

    describe('addToStage / removeFromStage / clearStage', () => {
        it('should add child to stage', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value

            const cont = renderer.createContainer()
            renderer.addToStage(
                cont as unknown as Parameters<typeof renderer.addToStage>[0]
            )
            expect(appInst.stage.addChild).toHaveBeenCalled()
        })

        it('should not throw addToStage when app is null', () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            const mockContainer = {} as Parameters<
                typeof renderer.addToStage
            >[0]
            expect(() => renderer.addToStage(mockContainer)).not.toThrow()
        })

        it('should remove child from stage', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value

            const cont = renderer.createContainer()
            renderer.removeFromStage(
                cont as unknown as Parameters<
                    typeof renderer.removeFromStage
                >[0]
            )
            expect(appInst.stage.removeChild).toHaveBeenCalled()
        })

        it('should not throw removeFromStage when app is null', () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            expect(() =>
                renderer.removeFromStage(
                    {} as Parameters<typeof renderer.removeFromStage>[0]
                )
            ).not.toThrow()
        })

        it('should clear stage', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value

            renderer.clearStage()
            expect(appInst.stage.removeChildren).toHaveBeenCalled()
        })

        it('should not throw clearStage when app is null', () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            expect(() => renderer.clearStage()).not.toThrow()
        })
    })

    describe('updateConfig / onConfigUpdate', () => {
        it('should resize on config update when width and height provided', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value

            renderer.updateConfig({ width: 1280, height: 720 })
            expect(appInst.renderer.resize).toHaveBeenCalledWith(1280, 720)
        })

        it('should not throw onConfigUpdate before initialization', () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            // updateConfig without initializing should not trigger onConfigUpdate
            expect(() => renderer.updateConfig({ width: 800 })).not.toThrow()
        })
    })

    describe('cleanup and destroy', () => {
        it('should remove canvas from container on cleanup', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()
            expect(container.children.length).toBeGreaterThan(0)

            renderer.cleanup()
            expect(container.children.length).toBe(0)
        })

        it('should destroy the PixiJS app on cleanup', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value

            renderer.cleanup()
            expect(appInst.destroy).toHaveBeenCalled()
        })

        it('should set app to null after cleanup', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()
            renderer.cleanup()
            expect(renderer.getApp()).toBeNull()
        })

        it('should not throw on cleanup when app is null', () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            expect(() => renderer.cleanup()).not.toThrow()
        })

        it('should remove responsive resize listener on cleanup', async () => {
            const removeEventListenerSpy = vi.spyOn(
                window,
                'removeEventListener'
            )
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
                responsive: true,
            })
            await renderer.initialize()
            renderer.cleanup()
            expect(removeEventListenerSpy).toHaveBeenCalledWith(
                'resize',
                expect.any(Function)
            )
            removeEventListenerSpy.mockRestore()
        })

        it('should mark renderer as not ready after destroy', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()
            expect(renderer.isReady()).toBe(true)
            renderer.destroy()
            expect(renderer.isReady()).toBe(false)
        })
    })

    describe('loadTexture', () => {
        it('should load texture via PIXI.Assets.load', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()

            const { Assets } = await import('pixi.js')
            const texture = await renderer.loadTexture('mock-url.png')
            expect(vi.mocked(Assets).load).toHaveBeenCalledWith('mock-url.png')
            expect(texture).toBeDefined()
        })
    })

    describe('setup with null container', () => {
        it('should throw when container is null during setup()', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            // Manually set container to null to bypass initialize's check
            ;(renderer as any).container = null
            await expect(renderer.setup()).rejects.toThrow(
                'Container not found'
            )
        })
    })

    describe('createSprite', () => {
        it('should create a Sprite instance', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()
            const sprite = renderer.createSprite()
            expect(sprite).toBeDefined()
        })
    })

    describe('onConfigUpdate after cleanup', () => {
        it('should return early from onConfigUpdate when app is null', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()
            // cleanup sets this.app = null, but isInitialized remains true
            renderer.cleanup()
            // updateConfig calls onConfigUpdate when isInitialized=true
            // onConfigUpdate returns early because this.app is null
            expect(() =>
                renderer.updateConfig({ width: 800, height: 600 })
            ).not.toThrow()
        })
    })

    describe('base class renderGame (no-op)', () => {
        it('should call the base renderGame empty implementation without throwing', async () => {
            const baseRenderer = new PixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await baseRenderer.initialize()
            expect(() => baseRenderer.render({})).not.toThrow()
        })
    })

    describe('resolution config branch', () => {
        it('should use pixiConfig.resolution when provided (line 43 first || branch)', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
                resolution: 2,
            })
            await renderer.initialize()
            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.init).toHaveBeenCalledWith(
                expect.objectContaining({ resolution: 2 })
            )
        })
    })

    describe('onConfigUpdate width-only branch', () => {
        it('should not resize when only width is set (line 174 && FALSE branch)', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()
            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            // width set but no height → config.width && config.height is false → resize not called
            renderer.updateConfig({ width: 800 })
            expect(appInst.renderer.resize).not.toHaveBeenCalled()
        })
    })

    describe('responsive resize handler invocation', () => {
        it('should invoke the resizeHandler when a resize event fires (line 52 function body)', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
                responsive: true,
            })
            await renderer.initialize()
            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            vi.clearAllMocks()
            // Firing the resize event calls the stored handler → handleResize()
            window.dispatchEvent(new Event('resize'))
            // handleResize calls app.renderer.resize so we know the handler ran
            expect(appInst.renderer.resize).toHaveBeenCalled()
        })
    })

    describe('container clientWidth/clientHeight as dimension source', () => {
        it('should use clientWidth/clientHeight when config has no width/height (line 30-31 middle || branch)', async () => {
            // Give the container real clientWidth/clientHeight via mock
            Object.defineProperty(container, 'clientWidth', {
                get: () => 320,
                configurable: true,
            })
            Object.defineProperty(container, 'clientHeight', {
                get: () => 240,
                configurable: true,
            })
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
                // no width/height → falls back to clientWidth/clientHeight
            })
            await renderer.initialize()
            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.init).toHaveBeenCalledWith(
                expect.objectContaining({ width: 320, height: 240 })
            )
        })
    })

    describe('cleanup with canvas not in container', () => {
        it('should not throw when canvas parentNode differs from container (line 185 && FALSE)', async () => {
            renderer = new TestPixiJSRenderer({
                type: 'canvas',
                container: '#pixi-test-container',
            })
            await renderer.initialize()
            // Move canvas to a different element so parentNode !== container
            const otherDiv = document.createElement('div')
            document.body.appendChild(otherDiv)
            otherDiv.appendChild(renderer.getApp()!.canvas)
            expect(() => renderer.cleanup()).not.toThrow()
            document.body.removeChild(otherDiv)
        })
    })
})
