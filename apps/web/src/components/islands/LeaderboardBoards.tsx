import { useState } from 'react'
import { Avatar, Select } from '@cetus/ui'

/**
 * Leaderboard page island (HPA-379): owns the game selector AND the displayed
 * board markup in one React tree. The server fetches every game's leaderboard
 * and passes pre-formatted, serializable board data (score/date strings are
 * formatted in leaderboard/index.astro so SSR and hydration agree); the
 * selection callback lives here. No React Select toggles `hidden` on
 * Astro-owned nodes — only the selected board is rendered at all.
 */

export interface LeaderboardEntryView {
  name: string
  username: string | null
  scoreLabel: string
  dateLabel: string
  image: string | null
}

export interface LeaderboardBoardView {
  id: string
  name: string
  category: string
  icon: string
  entries: LeaderboardEntryView[]
  highestScoreLabel: string | null
}

export interface LeaderboardBoardsProps {
  boards: LeaderboardBoardView[]
  defaultGameId: string
}

// Category color utility — text-color tokens so the abyssal theme can retint.
const CATEGORY_COLORS: Record<string, string> = {
  puzzle: 'text-cetus-accent-3',
  action: 'text-cetus-accent-2',
  strategy: 'text-cetus-accent',
  trivia: 'text-cetus-accent',
}

const getCategoryColor = (category: string) =>
  CATEGORY_COLORS[category] ?? 'text-cetus-ink-muted'

const RANK_BADGE_CLASSES = [
  'bg-yellow-500 text-black',
  'bg-gray-400 text-black',
  'bg-orange-600 text-white',
]

export function LeaderboardBoards({
  boards,
  defaultGameId,
}: LeaderboardBoardsProps) {
  const [selectedGameId, setSelectedGameId] = useState(defaultGameId)
  const selected =
    boards.find(board => board.id === selectedGameId) ?? boards[0]

  if (!selected) {
    return null
  }

  const categoryColor = getCategoryColor(selected.category)
  const entries = selected.entries

  return (
    <div className="relative">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-transparent via-cetus-accent/5 to-transparent" />

      {/* Game Selector Dropdown */}
      <div className="mb-8 flex justify-end">
        <Select
          id="game-selector"
          name="game-selector"
          className="w-96"
          value={selectedGameId}
          options={boards.map(board => ({
            value: board.id,
            label: `${board.icon} ${board.name}`,
          }))}
          onValueChange={setSelectedGameId}
        />
      </div>

      {/* Selected Game Leaderboard */}
      <div data-game-leaderboard={selected.id} data-game-id={selected.id}>
        <div className="mx-auto w-full max-w-4xl">
          {/* Game Header */}
          <div className="mb-8 flex items-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-cetus-hairline bg-cetus-surface">
              <span className={`text-2xl ${categoryColor}`}>
                {selected.icon}
              </span>
            </div>
            <div className="flex-1">
              <h3 className="mb-2 text-2xl font-bold text-white">
                {selected.name} Leaderboard
              </h3>
              <div className="flex items-center gap-4 text-sm">
                <span
                  className={`rounded-full border border-cetus-hairline bg-cetus-surface px-2 py-1 ${categoryColor}`}
                >
                  {selected.category}
                </span>
                <span className="text-cetus-ink-muted">
                  {entries.length} entries
                </span>
                {selected.highestScoreLabel && (
                  <span className="font-mono font-bold text-cetus-accent">
                    {selected.highestScoreLabel} highest score
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Leaderboard Content */}
          <div className="space-y-4">
            {entries.length > 0 ? (
              entries.map((entry, index) => {
                const normalizedUsername =
                  entry.username?.trim().toLowerCase() || null
                const profileUrl = normalizedUsername
                  ? `/profile/${encodeURIComponent(normalizedUsername)}`
                  : null
                const rankBadgeClass =
                  RANK_BADGE_CLASSES[index] ??
                  'bg-cetus-surface border border-cetus-hairline text-white'

                return (
                  <div
                    key={`${entry.username ?? entry.name}-${entry.scoreLabel}-${index}`}
                    className="flex items-center justify-between gap-4 rounded-lg border border-cetus-hairline bg-cetus-surface p-4 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-mono font-bold ${rankBadgeClass}`}
                      >
                        {index + 1}
                      </div>
                      <Avatar
                        size="sm"
                        variant="cyan-purple"
                        src={entry.image || undefined}
                        alt={`${entry.name || 'Anonymous'} avatar`}
                        fallback={(entry.name?.[0] || 'A').toUpperCase()}
                      />
                      <div>
                        {profileUrl ? (
                          <a
                            href={profileUrl}
                            className="rounded font-semibold text-white no-underline transition-colors hover:underline focus:outline-none focus:ring-2 focus:ring-cetus-accent focus:ring-offset-1 focus:ring-offset-gray-900"
                            aria-label={`Profile of ${normalizedUsername}`}
                          >
                            {entry.name || normalizedUsername}
                          </a>
                        ) : (
                          <div className="font-semibold text-white">
                            {entry.name || 'Anonymous'}
                          </div>
                        )}
                        <div className="text-sm text-cetus-ink-muted">
                          {entry.dateLabel}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xl font-bold text-cetus-accent">
                        {entry.scoreLabel}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="py-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-cetus-hairline bg-cetus-surface">
                  <span className="text-2xl">🎯</span>
                </div>
                <p className="mb-4 text-cetus-ink-muted">No scores yet!</p>
                <p className="mb-6 text-sm text-cetus-ink-muted">
                  Be the first to play and set a record.
                </p>
                <a
                  href={`/${selected.id}`}
                  className="inline-flex items-center rounded-lg bg-cetus-accent px-4 py-2 text-white transition-colors hover:bg-cetus-accent/90"
                >
                  Play {selected.name} 🎮
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LeaderboardBoards
