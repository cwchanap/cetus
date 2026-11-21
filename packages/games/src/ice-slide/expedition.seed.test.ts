import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    createIceSlideExpeditionRunDefinition,
    createIceSlideExpeditionSeed,
} from './expedition'

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('createIceSlideExpeditionSeed', () => {
    it('formats the four injected 32-bit words as 32 lowercase hex characters', () => {
        const received: Uint32Array[] = []
        const seed = createIceSlideExpeditionSeed(words => {
            received.push(words)
            words.set([0x11111111, 0x22222222, 0x33333333, 0x44444444])
        })
        expect(seed).toBe('11111111222222223333333344444444')
        expect(seed).toMatch(/^[0-9a-f]{32}$/)
        expect(received).toHaveLength(1)
        expect(received[0]).toHaveLength(4)
        // The web e2e pins only the marked draw.
        expect(
            (received[0] as unknown as { __iceSlideExpeditionSeed?: boolean })
                .__iceSlideExpeditionSeed
        ).toBe(true)
    })

    it('validates as an Expedition run seed and keys a run', () => {
        const seed = createIceSlideExpeditionSeed(words => {
            words.set([0, 1, 0xffffffff, 0x80000000])
        })
        expect(seed).toBe('0000000000000001ffffffff80000000')
        const run = createIceSlideExpeditionRunDefinition(seed)
        expect(run.seed).toBe(seed)
        expect(run.stages).toHaveLength(6)
    })

    it('draws from crypto.getRandomValues when the host provides it', () => {
        const getRandomValues = vi.fn((words: Uint32Array) => {
            words.set([1, 2, 3, 4])
            return words
        })
        vi.stubGlobal('crypto', { getRandomValues })
        const mathRandom = vi.spyOn(Math, 'random')
        expect(createIceSlideExpeditionSeed()).toBe(
            '00000001000000020000000300000004'
        )
        expect(getRandomValues).toHaveBeenCalledTimes(1)
        expect(mathRandom).not.toHaveBeenCalled()
    })

    it('falls back to Math.random where the host has no crypto', () => {
        vi.stubGlobal('crypto', undefined)
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        expect(createIceSlideExpeditionSeed()).toBe(
            '80000000800000008000000080000000'
        )
    })
})
