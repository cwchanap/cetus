import { formatNumber, formatTime } from '../shared/utils'
import { parseIceSlideDailyRunKey } from './run'

export interface DailyLeaderboardEntry {
    rank: number
    name: string
    score: number
    elapsedSeconds: number | null
    totalMoves: number | null
    isCurrentUser: boolean
}

export interface DailyLeaderboardResponse {
    viewerAuthenticated: boolean
    leaderboard: DailyLeaderboardEntry[]
}

export type DailyLeaderboardPanelState =
    | 'loading'
    | 'empty'
    | 'unavailable'
    | 'rows'

export interface DailyLeaderboardElements {
    panel: HTMLElement
    date: HTMLElement
    signedOut: HTMLElement
    loading: HTMLElement
    empty: HTMLElement
    unavailable: HTMLElement
    rows: HTMLElement
}

/**
 * Build the exact scoped `/api/leaderboard` URL for an Ice Slide Daily
 * competition key. The key is URL-encoded so its colons survive transport.
 */
export function buildIceSlideDailyLeaderboardUrl(
    competitionKey: string
): string {
    const params = new URLSearchParams({
        gameId: 'ice_slide',
        mode: 'daily',
        competitionKey,
        limit: '10',
    })
    return `/api/leaderboard?${params.toString()}`
}

/**
 * Format an elapsed-seconds value for the Daily leaderboard. `null` (missing
 * metric) renders as an em dash; otherwise the shared H:MM:SS / M:SS formatter
 * is reused. The existing in-run Ice Slide HUD formatter is intentionally left
 * untouched.
 */
export function formatDailyLeaderboardElapsed(seconds: number | null): string {
    return seconds === null ? '—' : formatTime(seconds)
}

/**
 * Create one leaderboard row using the DOM API only (no innerHTML). The viewer
 * row gets a literal `YOU` badge plus a distinct class so identity is not
 * communicated by color alone.
 */
export function createDailyLeaderboardRowElement(
    entry: DailyLeaderboardEntry,
    document: Document
): HTMLElement {
    const row = document.createElement('div')
    row.className =
        'flex items-center justify-between gap-2 rounded-md border border-cetus-hairline/50 bg-cetus-surface/60 px-3 py-2 text-sm'

    const left = document.createElement('div')
    left.className = 'flex items-center gap-2'

    const rank = document.createElement('span')
    rank.className = 'font-mono text-cetus-ink-muted'
    rank.textContent = `#${entry.rank}`

    const name = document.createElement('span')
    name.className = 'text-cetus-ink'
    name.textContent = entry.name

    left.append(rank, name)

    if (entry.isCurrentUser) {
        row.classList.add('border-cetus-accent/70', 'bg-cetus-accent/10')
        const badge = document.createElement('span')
        badge.className =
            'rounded border border-cetus-accent px-1 text-xs font-bold text-cetus-accent'
        badge.textContent = 'YOU'
        left.appendChild(badge)
    }

    const right = document.createElement('div')
    right.className =
        'flex items-center gap-3 font-mono text-xs text-cetus-ink-muted'

    const score = document.createElement('span')
    score.textContent = formatNumber(entry.score)

    const elapsed = document.createElement('span')
    elapsed.textContent = formatDailyLeaderboardElapsed(entry.elapsedSeconds)

    const moves = document.createElement('span')
    moves.textContent = entry.totalMoves === null ? '—' : `${entry.totalMoves}`

    right.append(score, elapsed, moves)
    row.append(left, right)
    return row
}

/**
 * Toggle the four mutually-exclusive panel sub-states. The panel container's
 * own visibility is managed by the controller (`load` shows it, `hide` hides
 * it); this only selects which sub-message / row list is visible.
 */
export function setDailyLeaderboardPanelState(
    elements: DailyLeaderboardElements,
    state: DailyLeaderboardPanelState
): void {
    elements.loading.classList.toggle('hidden', state !== 'loading')
    elements.empty.classList.toggle('hidden', state !== 'empty')
    elements.unavailable.classList.toggle('hidden', state !== 'unavailable')
    elements.rows.classList.toggle('hidden', state !== 'rows')
}

function clearRows(rows: HTMLElement): void {
    while (rows.firstChild) {
        rows.removeChild(rows.firstChild)
    }
}

/**
 * Create a small closure-based controller for the Ice Slide Daily leaderboard
 * panel. One monotonically-increasing request token invalidates stale fetches
 * and hides; no AbortController, store, or event bus.
 */
export function createDailyLeaderboardController(
    elements: DailyLeaderboardElements,
    fetcher: typeof fetch = fetch
): {
    load: (competitionKey: string) => Promise<void>
    hide: () => void
} {
    let token = 0

    const render = (data: DailyLeaderboardResponse): void => {
        clearRows(elements.rows)
        elements.signedOut.classList.toggle('hidden', data.viewerAuthenticated)
        if (data.leaderboard.length === 0) {
            setDailyLeaderboardPanelState(elements, 'empty')
            return
        }
        for (const entry of data.leaderboard) {
            elements.rows.appendChild(
                createDailyLeaderboardRowElement(entry, document)
            )
        }
        setDailyLeaderboardPanelState(elements, 'rows')
    }

    const showUnavailable = (): void => {
        setDailyLeaderboardPanelState(elements, 'unavailable')
    }

    const load = async (competitionKey: string): Promise<void> => {
        const current = ++token

        const identity = parseIceSlideDailyRunKey(competitionKey)
        if (!identity) {
            elements.panel.classList.remove('hidden')
            showUnavailable()
            return
        }

        elements.panel.classList.remove('hidden')
        elements.date.textContent = identity.dateKey
        setDailyLeaderboardPanelState(elements, 'loading')

        let response: Response
        try {
            response = await fetcher(
                buildIceSlideDailyLeaderboardUrl(competitionKey)
            )
        } catch {
            if (current === token) {
                showUnavailable()
            }
            return
        }
        if (current !== token) {
            return
        }
        if (!response.ok) {
            showUnavailable()
            return
        }

        let data: DailyLeaderboardResponse
        try {
            data = (await response.json()) as DailyLeaderboardResponse
        } catch {
            if (current === token) {
                showUnavailable()
            }
            return
        }
        if (current !== token) {
            return
        }

        render(data)
    }

    const hide = (): void => {
        token++
        elements.panel.classList.add('hidden')
    }

    return { load, hide }
}
