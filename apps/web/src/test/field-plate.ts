// Shared jsdom polyfills for field-plate controller tests (HPA-393). jsdom
// ships a bare HTMLDialogElement (only the `open` attribute reflector — no
// showModal/show/close) and lacks matchMedia, the Font Loading API, Web
// Animations, 2D canvas contexts and AudioContext, all of which the plate
// controllers touch. installFieldPlateDOM() fills the gaps and returns a
// restore function for afterEach teardown.
import { vi } from 'vitest'

export function installFieldPlateDOM(): () => void {
    // <dialog> methods: open is already an attribute reflector, so the
    // methods only toggle the attribute and emit 'close' like the spec.
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.open = true
    }
    HTMLDialogElement.prototype.show = function (this: HTMLDialogElement) {
        this.open = true
    }
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        if (!this.open) {
            return
        }
        this.open = false
        this.dispatchEvent(new Event('close'))
    }

    // Web Animations API — controllers cancel/replay feedback animations.
    Object.defineProperty(Element.prototype, 'animate', {
        configurable: true,
        writable: true,
        value: vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() })),
    })
    Object.defineProperty(Element.prototype, 'getAnimations', {
        configurable: true,
        writable: true,
        value: vi.fn(() => [] as Animation[]),
    })

    // matchMedia — plates read prefers-reduced-motion at mount.
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: vi.fn((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    })

    // Font Loading API — the 2048 plate awaits fonts.load before painting
    // the rule figures.
    Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { load: vi.fn().mockResolvedValue([]) },
    })

    // 2D canvas context for the rule-figure painters.
    const context2d = {
        beginPath: vi.fn(),
        closePath: vi.fn(),
        roundRect: vi.fn(),
        rect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        measureText: vi.fn(() => ({ width: 0 })),
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        rotate: vi.fn(),
        arc: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        setLineDash: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        shadowColor: '',
        shadowBlur: 0,
        font: '',
        textAlign: '',
        textBaseline: '',
        lineWidth: 0,
        globalAlpha: 1,
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        writable: true,
        value: vi.fn(() => context2d),
    })

    // AudioContext for the score blips.
    class FakeAudioContext {
        currentTime = 0
        destination = {}
        resume = vi.fn().mockResolvedValue(undefined)
        close = vi.fn().mockResolvedValue(undefined)
        createOscillator = vi.fn(() => ({
            type: '',
            frequency: { value: 0 },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
        }))
        createGain = vi.fn(() => ({
            gain: {
                setValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
        }))
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)

    return () => {
        delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>)
            .showModal
        delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).show
        delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close
        delete (Element.prototype as Partial<Element>).animate
        delete (Element.prototype as Partial<Element>).getAnimations
        delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>)
            .getContext
        delete (window as { matchMedia?: unknown }).matchMedia
        delete (document as { fonts?: unknown }).fonts
        vi.unstubAllGlobals()
    }
}
