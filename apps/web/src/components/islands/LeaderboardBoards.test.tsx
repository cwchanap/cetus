import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  LeaderboardBoards,
  type LeaderboardBoardView,
  type LeaderboardEntryView,
} from './LeaderboardBoards'

const entry = (
  overrides: Partial<LeaderboardEntryView> = {}
): LeaderboardEntryView => ({
  name: 'Astra',
  username: 'Astra_Pilot',
  scoreLabel: '12,345',
  dateLabel: 'Oct 1, 2026',
  image: null,
  ...overrides,
})

const board = (
  overrides: Partial<LeaderboardBoardView> = {}
): LeaderboardBoardView => ({
  id: 'snake',
  name: 'Snake',
  category: 'action',
  icon: '🐍',
  entries: [],
  highestScoreLabel: null,
  ...overrides,
})

const boards: LeaderboardBoardView[] = [
  board({
    id: 'snake',
    name: 'Snake',
    category: 'action',
    icon: '🐍',
    highestScoreLabel: '12,345',
    entries: [
      entry(),
      entry({
        name: 'Blip',
        username: 'blip',
        scoreLabel: '9,999',
        dateLabel: 'Oct 2, 2026',
        image: 'https://img.cetus.dev/blip.png',
      }),
      entry({
        name: '',
        username: null,
        scoreLabel: '8,000',
        dateLabel: 'Oct 3, 2026',
      }),
      entry({
        name: 'Dee',
        username: 'dee',
        scoreLabel: '7,000',
        dateLabel: 'Oct 4, 2026',
      }),
      // Linked entry whose display name is empty falls back to the
      // normalized username as link text.
      entry({
        name: '',
        username: 'ghost',
        scoreLabel: '6,000',
        dateLabel: 'Oct 5, 2026',
      }),
    ],
  }),
  board({
    id: 'tetris',
    name: 'Tetris Challenge',
    category: 'puzzle',
    icon: '🧱',
    entries: [
      entry({
        name: 'Stack',
        username: 'stack',
        scoreLabel: '50,000',
        dateLabel: 'Oct 5, 2026',
      }),
    ],
  }),
]

describe('LeaderboardBoards island', () => {
  it('renders the default board with entries, badges and profile links', () => {
    render(<LeaderboardBoards boards={boards} defaultGameId="snake" />)

    expect(screen.getByText('Snake Leaderboard')).toBeInTheDocument()
    expect(screen.getByText('action')).toBeInTheDocument()
    expect(screen.getByText('5 entries')).toBeInTheDocument()
    expect(screen.getByText('12,345 highest score')).toBeInTheDocument()

    // Usernames normalize to lowercase profile links.
    const link = screen.getByRole('link', { name: 'Profile of astra_pilot' })
    expect(link).toHaveAttribute('href', '/profile/astra_pilot')
    expect(link).toHaveTextContent('Astra')

    // A linked entry with an empty display name uses the normalized
    // username as its link text.
    const ghost = screen.getByRole('link', { name: 'Profile of ghost' })
    expect(ghost).toHaveAttribute('href', '/profile/ghost')
    expect(ghost).toHaveTextContent('ghost')

    // Entries without a username render a plain name, falling back to
    // 'Anonymous' when the display name is empty.
    const anon = screen.getByText('Anonymous')
    expect(anon.closest('a')).toBeNull()

    // Image entries render the image; text entries get the fallback glyph
    // ('Astra' -> 'A', the empty display name -> 'A' via 'Anonymous').
    expect(screen.getByAltText('Blip avatar')).toHaveAttribute(
      'src',
      'https://img.cetus.dev/blip.png'
    )
    expect(
      screen.getAllByText('A', { selector: 'span' }).length
    ).toBeGreaterThanOrEqual(2)

    // Rank badges: top three get medal colors, later ranks the default.
    expect(screen.getByText('1')).toHaveClass('bg-yellow-500')
    expect(screen.getByText('3')).toHaveClass('bg-orange-600')
    expect(screen.getByText('4')).toHaveClass('bg-cetus-surface')
  })

  it('falls back to the muted color for unknown categories', () => {
    render(
      <LeaderboardBoards
        boards={[board({ id: 'evader', name: 'Evader', category: 'arcade' })]}
        defaultGameId="evader"
      />
    )
    expect(screen.getByText('arcade')).toHaveClass('text-cetus-ink-muted')
  })

  it('switches the displayed board when the selector changes', () => {
    render(<LeaderboardBoards boards={boards} defaultGameId="snake" />)

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'tetris' },
    })

    expect(screen.getByText('Tetris Challenge Leaderboard')).toBeInTheDocument()
    expect(screen.getByText('puzzle')).toBeInTheDocument()
    expect(screen.getByText('1 entries')).toBeInTheDocument()
    expect(screen.getByText('Stack')).toBeInTheDocument()
    expect(screen.queryByText('12,345 highest score')).not.toBeInTheDocument()
  })

  it('falls back to the first board when defaultGameId matches none', () => {
    render(<LeaderboardBoards boards={boards} defaultGameId="missing" />)
    expect(screen.getByText('Snake Leaderboard')).toBeInTheDocument()
  })

  it('renders nothing when there are no boards', () => {
    const { container } = render(
      <LeaderboardBoards boards={[]} defaultGameId="snake" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the empty state and play link when the board has no entries', () => {
    render(
      <LeaderboardBoards
        boards={[board({ id: 'evader', name: 'Evader' })]}
        defaultGameId="evader"
      />
    )

    expect(screen.getByText('No scores yet!')).toBeInTheDocument()
    expect(screen.getByText('0 entries')).toBeInTheDocument()
    const play = screen.getByRole('link', { name: /Play Evader/ })
    expect(play).toHaveAttribute('href', '/evader')
  })
})
