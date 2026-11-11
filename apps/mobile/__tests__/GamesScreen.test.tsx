import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text, TextInput } from 'react-native'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('../src/lib/login-rewards', () => ({
  LoginRewardHost: () => null,
}))

import GamesScreen from '../app/(tabs)/index'
import { GAMES } from '@cetus/shared/games'

// VirtualizedList leaves a 50ms window-fill timer pending after the last
// test; unmounting here clears it so nothing logs after tests are done
// (which would fail the suite despite all tests passing).
const mountedTrees: TestRenderer.ReactTestRenderer[] = []
afterEach(async () => {
  while (mountedTrees.length > 0) {
    const tree = mountedTrees.pop()
    await act(async () => {
      tree?.unmount()
    })
  }
})

// The catalog must render every active registry game (23 today). The screen
// sets initialNumToRender to the registry size, so no row is virtualized away.
// FlatList fills its window asynchronously, so the initial render is flushed
// with act() before asserting on the mounted rows.
test('games screen renders every active registry game', async () => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(<GamesScreen />)
  })
  if (tree) {
    mountedTrees.push(tree)
  }

  expect(tree).toBeDefined()
  const rendered =
    tree?.root
      .findAllByType(Text)
      .map(node => JSON.stringify(node.props.children))
      .join('\n') ?? ''
  const active = GAMES.filter(game => game.isActive)
  expect(active).toHaveLength(23)
  for (const game of active) {
    expect(rendered).toContain(game.name)
  }
})

// Mobile keyboards commonly append a trailing space; the search term must be
// trimmed before matching, not just when deciding whether to search.
test('search matches a game despite surrounding whitespace', async () => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(<GamesScreen />)
  })
  if (tree) {
    mountedTrees.push(tree)
  }

  const input = tree?.root.findByType(TextInput)
  await act(async () => {
    input?.props.onChangeText(' snake ')
  })

  const rendered =
    tree?.root
      .findAllByType(Text)
      .map(node => JSON.stringify(node.props.children))
      .join('\n') ?? ''
  expect(rendered).toContain('Snake')
  expect(rendered).not.toContain('No games match your search.')
})
