import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DOMRenderer } from './DOMRenderer'

// Concrete subclass to test DOMRenderer
class TestDOMRenderer extends DOMRenderer {
    renderGameCalled = false
    lastRenderedState: unknown = null

    protected override renderGame(state: unknown): void {
        this.renderGameCalled = true
        this.lastRenderedState = state
    }
}

describe('DOMRenderer', () => {
    let container: HTMLElement
    let renderer: TestDOMRenderer

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'dom-test-container'
        document.body.appendChild(container)
    })

    afterEach(() => {
        renderer?.destroy()
        if (container.parentNode) {
            document.body.removeChild(container)
        }
    })

    describe('setup', () => {
        it('should throw in setup() when called directly with null container', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            // Call setup() directly before initialize() — container is null
            await expect(renderer.setup()).rejects.toThrow(
                'Container not found'
            )
        })

        it('should set up without containerClass', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            expect(renderer.isReady()).toBe(true)
        })

        it('should apply containerClass when specified', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
                containerClass: 'extra-class',
            })
            await renderer.initialize()
            expect(container.className).toContain('extra-class')
        })

        it('should set up responsive listener when responsive is true', async () => {
            const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
                responsive: true,
            })
            await renderer.initialize()
            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'resize',
                expect.any(Function)
            )
            addEventListenerSpy.mockRestore()
        })

        it('should throw if container is missing', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#nonexistent-container',
            })
            await expect(renderer.initialize()).rejects.toThrow()
        })
    })

    describe('render', () => {
        it('should call renderGame with state', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            const state = { score: 100 }
            renderer.render(state)
            expect(renderer.renderGameCalled).toBe(true)
            expect(renderer.lastRenderedState).toBe(state)
        })

        it('should clear container before renderGame when cleanOnRender is true', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
                cleanOnRender: true,
            })
            await renderer.initialize()
            // Add a child to the container
            const child = document.createElement('span')
            container.appendChild(child)
            expect(container.children.length).toBe(1)

            renderer.render({})
            // After render, container should be cleared
            expect(container.children.length).toBe(0)
        })

        it('should NOT clear container when cleanOnRender is false', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
                cleanOnRender: false,
            })
            await renderer.initialize()
            const child = document.createElement('span')
            container.appendChild(child)
            expect(container.children.length).toBe(1)

            renderer.render({})
            expect(container.children.length).toBe(1)
        })

        it('should not throw when container is null', () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            // Not initialized — container is null
            expect(() => renderer.render({})).not.toThrow()
        })
    })

    describe('resize', () => {
        it('should set container dimensions', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            renderer.resize(400, 300)
            expect(container.style.width).toBe('400px')
            expect(container.style.height).toBe('300px')
        })

        it('should not throw when container is null', () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            expect(() => renderer.resize(400, 300)).not.toThrow()
        })
    })

    describe('createElement', () => {
        it('should create element with tag only', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            const el = renderer.createElement('div')
            expect(el.tagName).toBe('DIV')
        })

        it('should create element with className', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            const el = renderer.createElement('span', 'my-class')
            expect(el.className).toBe('my-class')
        })

        it('should create element with attributes', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            const el = renderer.createElement('input', undefined, {
                type: 'text',
                placeholder: 'test',
            })
            expect(el.getAttribute('type')).toBe('text')
            expect(el.getAttribute('placeholder')).toBe('test')
        })
    })

    describe('addToContainer / removeFromContainer', () => {
        it('should add element to container', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            const child = document.createElement('p')
            renderer.addToContainer(child)
            expect(container.contains(child)).toBe(true)
        })

        it('should remove element from container', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            const child = document.createElement('p')
            container.appendChild(child)
            renderer.removeFromContainer(child)
            expect(container.contains(child)).toBe(false)
        })

        it('should not throw when removing element not in container', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            const child = document.createElement('p')
            expect(() => renderer.removeFromContainer(child)).not.toThrow()
        })
    })

    describe('clearContainer', () => {
        it('should remove all children', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            container.appendChild(document.createElement('div'))
            container.appendChild(document.createElement('span'))
            expect(container.children.length).toBe(2)
            renderer.clearContainer()
            expect(container.children.length).toBe(0)
        })

        it('should not throw when container is null', () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            expect(() => renderer.clearContainer()).not.toThrow()
        })
    })

    describe('findElement / findElements', () => {
        it('should find element by selector', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            const child = document.createElement('span')
            child.className = 'target'
            container.appendChild(child)
            const found = renderer.findElement<HTMLSpanElement>('.target')
            expect(found).toBe(child)
        })

        it('should return null when element not found', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            expect(renderer.findElement('.nonexistent')).toBeNull()
        })

        it('should return null from findElement when container is null', () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            expect(renderer.findElement('.anything')).toBeNull()
        })

        it('should find all matching elements', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            container.appendChild(document.createElement('li'))
            container.appendChild(document.createElement('li'))
            const found = renderer.findElements('li')
            expect(found.length).toBe(2)
        })

        it('should return empty NodeList from findElements when container is null', () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            const found = renderer.findElements('li')
            expect(found.length).toBe(0)
        })
    })

    describe('setContent / appendContent', () => {
        it('should set innerHTML', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            renderer.setContent('<span>Hello</span>')
            expect(container.innerHTML).toBe('<span>Hello</span>')
        })

        it('should not throw from setContent when container is null', () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            expect(() => renderer.setContent('<p>test</p>')).not.toThrow()
        })

        it('should append HTML content to container', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            renderer.appendContent('<em>First</em>')
            renderer.appendContent('<strong>Second</strong>')
            expect(container.querySelector('em')).not.toBeNull()
            expect(container.querySelector('strong')).not.toBeNull()
        })

        it('should not throw from appendContent when container is null', () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            expect(() => renderer.appendContent('<p>test</p>')).not.toThrow()
        })
    })

    describe('addEventListener / removeEventListener', () => {
        it('should attach and fire event listener on container', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            const handler = vi.fn()
            renderer.addEventListener('click', handler)
            container.click()
            expect(handler).toHaveBeenCalled()
        })

        it('should remove event listener', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            const handler = vi.fn()
            renderer.addEventListener('click', handler)
            renderer.removeEventListener('click', handler)
            container.click()
            expect(handler).not.toHaveBeenCalled()
        })

        it('should not throw from addEventListener when container is null', () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            expect(() =>
                renderer.addEventListener('click', vi.fn())
            ).not.toThrow()
        })

        it('should not throw from removeEventListener when container is null', () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            expect(() =>
                renderer.removeEventListener('click', vi.fn())
            ).not.toThrow()
        })
    })

    describe('onConfigUpdate', () => {
        it('should resize container when width and height are set', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            renderer.updateConfig({ width: 500, height: 400 })
            expect(container.style.width).toBe('500px')
            expect(container.style.height).toBe('400px')
        })

        it('should not throw when container is null in onConfigUpdate', () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            expect(() => renderer.updateConfig({ width: 500 })).not.toThrow()
        })

        it('should early-return in onConfigUpdate when container is null after init', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            // Nullify container while keeping isInitialized=true to trigger guard
            // @ts-expect-error - accessing protected property for test coverage
            renderer.container = null
            expect(() =>
                renderer.updateConfig({ width: 500, height: 400 })
            ).not.toThrow()
        })
    })

    describe('cleanup', () => {
        it('should clear container children on cleanup', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
            })
            await renderer.initialize()
            container.appendChild(document.createElement('div'))
            renderer.destroy()
            expect(container.children.length).toBe(0)
        })

        it('should remove containerClass on cleanup', async () => {
            renderer = new TestDOMRenderer({
                type: 'dom',
                container: '#dom-test-container',
                containerClass: 'added-class',
            })
            await renderer.initialize()
            expect(container.classList.contains('added-class')).toBe(true)
            renderer.destroy()
            expect(container.classList.contains('added-class')).toBe(false)
        })
    })
})
