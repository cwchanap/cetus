import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    buildIceSlideDailyLeaderboardUrl,
    createDailyLeaderboardController,
    createDailyLeaderboardRowElement,
    formatDailyLeaderboardElapsed,
    setDailyLeaderboardPanelState,
    type DailyLeaderboardElements,
    type DailyLeaderboardEntry,
} from './daily-leaderboard'

function mountElements(): DailyLeaderboardElements {
    const make = (id: string) => {
        const el = document.createElement('div')
        el.id = id
        el.classList.add('hidden')
        document.body.appendChild(el)
        return el
    }
    return {
        panel: make('daily-leaderboard'),
        date: make('daily-leaderboard-date'),
        signedOut: make('daily-leaderboard-signed-out'),
        loading: make('daily-leaderboard-loading'),
        empty: make('daily-leaderboard-empty'),
        unavailable: make('daily-leaderboard-unavailable'),
        rows: make('daily-leaderboard-rows'),
    }
}

function makeResponse(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: async () => body,
    } as unknown as Response
}

const baseEntry = (
    overrides: Partial<DailyLeaderboardEntry> = {}
): DailyLeaderboardEntry => ({
    rank: 1,
    name: 'Pilot',
    score: 4321,
    elapsedSeconds: 87,
    totalMoves: 31,
    isCurrentUser: true,
    ...overrides,
})

describe('Ice Slide Daily leaderboard helpers', () => {
    it('builds the scoped Daily leaderboard URL with an encoded key', () => {
        expect(
            buildIceSlideDailyLeaderboardUrl('ice-slide:daily:2026-08-12:g1:r1')
        ).toBe(
            '/api/leaderboard?gameId=ice_slide&mode=daily&competitionKey=' +
                'ice-slide%3Adaily%3A2026-08-12%3Ag1%3Ar1&limit=10'
        )
    })

    it('formats elapsed seconds for the leaderboard', () => {
        expect(formatDailyLeaderboardElapsed(null)).toBe('—')
        expect(formatDailyLeaderboardElapsed(87)).toBe('1:27')
        expect(formatDailyLeaderboardElapsed(3665)).toBe('1:01:05')
    })

    it('renders a ranked leaderboard row without innerHTML', () => {
        const row = createDailyLeaderboardRowElement(baseEntry(), document)

        const text = row.textContent ?? ''
        expect(text).toContain('1')
        expect(text).toContain('Pilot')
        expect(text).toContain('4,321')
        expect(text).toContain('1:27')
        expect(text).toContain('31')
        expect(text).toContain('YOU')
    })

    it('omits the YOU badge for other users', () => {
        const row = createDailyLeaderboardRowElement(
            baseEntry({ rank: 2, name: 'Rival', isCurrentUser: false }),
            document
        )
        expect(row.textContent ?? '').not.toContain('YOU')
    })

    it('toggles the four panel states', () => {
        const elements = mountElements()

        setDailyLeaderboardPanelState(elements, 'loading')
        expect(elements.loading.classList.contains('hidden')).toBe(false)
        expect(elements.empty.classList.contains('hidden')).toBe(true)
        expect(elements.unavailable.classList.contains('hidden')).toBe(true)
        expect(elements.rows.classList.contains('hidden')).toBe(true)

        setDailyLeaderboardPanelState(elements, 'empty')
        expect(elements.empty.classList.contains('hidden')).toBe(false)
        expect(elements.loading.classList.contains('hidden')).toBe(true)

        setDailyLeaderboardPanelState(elements, 'unavailable')
        expect(elements.unavailable.classList.contains('hidden')).toBe(false)

        setDailyLeaderboardPanelState(elements, 'rows')
        expect(elements.rows.classList.contains('hidden')).toBe(false)
    })
})

describe('Ice Slide Daily leaderboard controller', () => {
    let elements: DailyLeaderboardElements
    let resolvers: ((response: Response) => void)[]
    let deferredFetcher: ReturnType<typeof vi.fn>

    beforeEach(() => {
        document.body.innerHTML = ''
        elements = mountElements()
        resolvers = []
        deferredFetcher = vi.fn(
            () =>
                new Promise<Response>(resolve => {
                    resolvers.push(resolve)
                })
        )
    })

    const okFetcher = (body: unknown) => () =>
        Promise.resolve(makeResponse(body))

    it('renders a successful load and replaces rows across refreshes', async () => {
        const controller = createDailyLeaderboardController(
            elements,
            okFetcher({
                viewerAuthenticated: true,
                leaderboard: [baseEntry()],
            })
        )

        await controller.load('ice-slide:daily:2026-08-12:g1:r1')

        expect(elements.panel.classList.contains('hidden')).toBe(false)
        expect(elements.date.textContent).toBe('2026-08-12')
        expect(elements.signedOut.classList.contains('hidden')).toBe(true)
        expect(elements.rows.classList.contains('hidden')).toBe(false)
        expect(elements.rows.children).toHaveLength(1)

        await controller.load('ice-slide:daily:2026-08-12:g1:r1')
        expect(elements.rows.children).toHaveLength(1)
    })

    it('shows the signed-out note when the viewer is unauthenticated', async () => {
        const controller = createDailyLeaderboardController(
            elements,
            okFetcher({
                viewerAuthenticated: false,
                leaderboard: [baseEntry()],
            })
        )

        await controller.load('ice-slide:daily:2026-08-12:g1:r1')

        expect(elements.signedOut.classList.contains('hidden')).toBe(false)
    })

    it('shows the empty state when the leaderboard has no rows', async () => {
        const controller = createDailyLeaderboardController(
            elements,
            okFetcher({ viewerAuthenticated: false, leaderboard: [] })
        )

        await controller.load('ice-slide:daily:2026-08-12:g1:r1')

        expect(elements.empty.classList.contains('hidden')).toBe(false)
        expect(elements.rows.classList.contains('hidden')).toBe(true)
        expect(elements.rows.children).toHaveLength(0)
    })

    it('shows unavailable for an invalid Daily key and hides rows', async () => {
        const controller = createDailyLeaderboardController(
            elements,
            deferredFetcher
        )

        await controller.load('not-a-daily-key')

        expect(elements.panel.classList.contains('hidden')).toBe(false)
        expect(elements.unavailable.classList.contains('hidden')).toBe(false)
        expect(elements.rows.classList.contains('hidden')).toBe(true)
        expect(deferredFetcher).not.toHaveBeenCalled()
    })

    it('suppresses a stale response in favor of a newer Daily key', async () => {
        const controller = createDailyLeaderboardController(
            elements,
            deferredFetcher
        )

        const oldPromise = controller.load('ice-slide:daily:2026-08-11:g1:r1')
        const newPromise = controller.load('ice-slide:daily:2026-08-12:g1:r1')

        resolvers[1](
            makeResponse({
                viewerAuthenticated: true,
                leaderboard: [baseEntry({ name: 'New Pilot' })],
            })
        )
        resolvers[0](
            makeResponse({
                viewerAuthenticated: true,
                leaderboard: [baseEntry({ name: 'Old Pilot' })],
            })
        )
        await Promise.all([oldPromise, newPromise])

        expect(elements.rows.textContent).toContain('New Pilot')
        expect(elements.rows.textContent).not.toContain('Old Pilot')
    })

    it('does not reveal the panel after hide() while a request is pending', async () => {
        const controller = createDailyLeaderboardController(
            elements,
            deferredFetcher
        )

        const pending = controller.load('ice-slide:daily:2026-08-12:g1:r1')
        controller.hide()

        expect(elements.panel.classList.contains('hidden')).toBe(true)

        resolvers[0](
            makeResponse({
                viewerAuthenticated: true,
                leaderboard: [baseEntry({ name: 'Late Pilot' })],
            })
        )
        await pending

        expect(elements.panel.classList.contains('hidden')).toBe(true)
        expect(elements.rows.children).toHaveLength(0)
    })

    it('shows unavailable when the leaderboard fetch rejects', async () => {
        const controller = createDailyLeaderboardController(elements, () =>
            Promise.reject(new Error('network error'))
        )

        await controller.load('ice-slide:daily:2026-08-12:g1:r1')

        expect(elements.unavailable.classList.contains('hidden')).toBe(false)
        expect(elements.rows.classList.contains('hidden')).toBe(true)
    })

    it('shows unavailable when the leaderboard response is not ok', async () => {
        const controller = createDailyLeaderboardController(elements, () =>
            Promise.resolve({
                ok: false,
                status: 503,
                json: async () => ({}),
            } as unknown as Response)
        )

        await controller.load('ice-slide:daily:2026-08-12:g1:r1')

        expect(elements.unavailable.classList.contains('hidden')).toBe(false)
    })

    it('shows unavailable when the leaderboard body fails to parse', async () => {
        const controller = createDailyLeaderboardController(elements, () =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: async () => {
                    throw new Error('bad json')
                },
            } as unknown as Response)
        )

        await controller.load('ice-slide:daily:2026-08-12:g1:r1')

        expect(elements.unavailable.classList.contains('hidden')).toBe(false)
    })
})
