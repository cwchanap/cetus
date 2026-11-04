import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockCanGoBack = jest.fn()
const mockLoginRewardHost = jest.fn((_props: object) => null)
const mockParams: { gameId?: string | string[] } = {}

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
}))

jest.mock('../src/lib/login-rewards', () => ({
  LoginRewardHost: (props: object) => mockLoginRewardHost(props),
}))

import GamesScreen from '../app/(tabs)/index'
import GameDetailScreen from '../app/games/[gameId]'
import { GAMES } from '@cetus/shared/games'

const render = async (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(element)
  })
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  return tree
}

const scalarText = (children: React.ReactNode): string => {
  if (Array.isArray(children)) {
    return children.map(scalarText).join('')
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }
  return ''
}

const renderedText = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(node => scalarText(node.props.children))
    .join('\n')

const ACTIVE_GAMES = GAMES.filter(game => game.isActive)

beforeEach(() => {
  mockPush.mockClear()
  mockReplace.mockClear()
  mockCanGoBack.mockReset().mockReturnValue(true)
  mockLoginRewardHost.mockClear()
  mockParams.gameId = undefined
})

describe('games catalog', () => {
  test('renders the search field, category filters and every active game anonymously', async () => {
    const tree = await render(<GamesScreen />)

    expect(
      tree.root.findByProps({ accessibilityLabel: 'Search games' })
    ).toBeTruthy()
    for (const label of ['All', 'Puzzle', 'Action', 'Strategy']) {
      expect(
        tree.root.findByProps({ accessibilityLabel: `Filter: ${label}` })
      ).toBeTruthy()
    }

    const rendered = renderedText(tree)
    expect(ACTIVE_GAMES.length).toBe(23)
    for (const game of ACTIVE_GAMES) {
      expect(rendered).toContain(game.name)
    }
  })

  test('filters the catalog by search text', async () => {
    const tree = await render(<GamesScreen />)
    const input = tree.root.findByProps({ accessibilityLabel: 'Search games' })

    await act(async () => {
      input.props.onChangeText('tetris')
    })

    const rendered = renderedText(tree)
    expect(rendered).toContain('Tetris Challenge')
    expect(rendered).not.toContain('Snake')
    expect(rendered).not.toContain('Sudoku')
  })

  test('filters the catalog by category and exposes the selected state', async () => {
    const tree = await render(<GamesScreen />)

    const chip = () =>
      tree.root.findByProps({ accessibilityLabel: 'Filter: Action' })
    await act(async () => {
      chip().props.onPress()
    })

    const rendered = renderedText(tree)
    expect(rendered).toContain('Snake')
    expect(rendered).toContain('Gravity Flip')
    expect(rendered).not.toContain('Sudoku')
    expect(rendered).not.toContain('Chromatic Tide')
    expect(chip().props.accessibilityState?.selected).toBe(true)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Filter: All' }).props
        .accessibilityState?.selected
    ).toBe(false)
  })

  test('shows an empty state when nothing matches', async () => {
    const tree = await render(<GamesScreen />)
    const input = tree.root.findByProps({ accessibilityLabel: 'Search games' })

    await act(async () => {
      input.props.onChangeText('zzz-no-such-game')
    })

    expect(tree.root.findByProps({ testID: 'games-empty' })).toBeTruthy()
  })

  test('navigates to the game detail route when a card is pressed', async () => {
    const tree = await render(<GamesScreen />)

    const card = tree.root.findByProps({
      accessibilityLabel: 'Tetris Challenge',
    })
    await act(async () => {
      card.props.onPress()
    })

    expect(mockPush).toHaveBeenCalledWith('/games/tetris')
  })

  test('links to the daily missions stack route', async () => {
    const tree = await render(<GamesScreen />)

    const entry = tree.root.findByProps({
      accessibilityLabel: 'Daily missions',
    })
    expect(entry.props.accessibilityRole).toBe('button')
    await act(async () => {
      entry.props.onPress()
    })

    expect(mockPush).toHaveBeenCalledWith('/challenges')
  })

  test('mounts the login reward host on the hub', async () => {
    await render(<GamesScreen />)

    expect(mockLoginRewardHost).toHaveBeenCalled()
  })
})

describe('game detail', () => {
  test('renders registry metadata for a valid game id', async () => {
    mockParams.gameId = 'tetris'
    const tree = await render(<GameDetailScreen />)

    const header = tree.root.find(
      node =>
        node.props.accessibilityRole === 'header' &&
        node.props.children === 'Tetris Challenge'
    )
    expect(header).toBeTruthy()

    const rendered = renderedText(tree)
    expect(rendered).toContain('Classic block-stacking puzzle game')
    expect(rendered).toContain('puzzle')
    expect(rendered).toContain('medium')
    expect(rendered).toContain('5-15 minutes')
  })

  test('honestly disables the play CTA for every registry game', async () => {
    for (const game of ACTIVE_GAMES) {
      mockParams.gameId = game.id
      const tree = await render(<GameDetailScreen />)

      const cta = tree.root.findByProps({
        accessibilityLabel: `Play ${game.name}`,
      })
      expect(cta.props.disabled).toBe(true)
      await act(async () => {
        cta.props.onPress?.()
      })

      const rendered = renderedText(tree)
      expect(rendered).toContain('Not playable on mobile yet')
    }
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  test('renders a not-found state for an unknown game id', async () => {
    mockParams.gameId = 'definitely-not-a-game'
    const tree = await render(<GameDetailScreen />)

    const rendered = renderedText(tree)
    expect(rendered).toContain('not found')
    expect(rendered).toContain('definitely-not-a-game')

    const back = tree.root.findByProps({ accessibilityLabel: 'Back to games' })
    await act(async () => {
      back.props.onPress()
    })
    expect(mockReplace).toHaveBeenCalledWith('/')
  })
})

describe('cold-link recovery', () => {
  test('valid details offer a Back to games fallback when the stack cannot go back', async () => {
    mockParams.gameId = 'tetris'
    mockCanGoBack.mockReturnValue(false)
    const tree = await render(<GameDetailScreen />)

    const back = tree.root.findByProps({ accessibilityLabel: 'Back to games' })
    await act(async () => {
      back.props.onPress()
    })
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  test('valid details hide the fallback while ordinary stack back is available', async () => {
    mockParams.gameId = 'tetris'
    mockCanGoBack.mockReturnValue(true)
    const tree = await render(<GameDetailScreen />)

    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Back to games' })
    ).toHaveLength(0)
  })

  test('the root layout anchors (tabs) beneath cold deep links', () => {
    const fs = jest.requireActual('node:fs') as {
      readFileSync: (filePath: string, encoding: 'utf-8') => string
    }
    const nodePath = jest.requireActual('node:path') as {
      resolve: (...segments: string[]) => string
    }
    const proc = jest.requireActual('node:process') as { cwd: () => string }
    const source = fs.readFileSync(
      nodePath.resolve(proc.cwd(), 'app/_layout.tsx'),
      'utf-8'
    )
    expect(source).toContain('unstable_settings')
    expect(source).toContain("initialRouteName: '(tabs)'")
  })
})
