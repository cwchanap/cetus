// Local ambient declaration for `jsdom`. jsdom does not ship bundled types and
// `@types/jsdom` is not installed; declare only the surface used by tests so
// the `import { JSDOM } from 'jsdom'` import type-checks without suppression.
// If bundled types or `@types/jsdom` are added later, remove this file.
declare module 'jsdom' {
    export interface JSDOMOptions {
        url?: string
        pretendToBeVisual?: boolean
        resources?: 'usable' | string
        runScripts?: 'dangerously' | 'outside-only' | undefined
    }

    export interface JSDOMWindow extends Window {
        document: Document
    }

    export class JSDOM {
        constructor(html?: string, options?: JSDOMOptions)
        readonly window: JSDOMWindow & typeof globalThis
        serialize(): string
    }
}
