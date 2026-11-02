import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

import GamesScreen from '../app/(tabs)/index'
import { GAMES } from '@cetus/shared/games'

// The catalog must render every active registry game (23 today). The screen
// sets initialNumToRender to the registry size, so no row is virtualized away.
// FlatList fills its window asynchronously, so the initial render is flushed
// with act() before asserting on the mounted rows.
test('games screen renders every active registry game', async () => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(<GamesScreen />)
  })

  expect(tree).toBeDefined()
  const rendered = JSON.stringify(tree?.toJSON())
  const active = GAMES.filter(game => game.isActive)
  expect(active).toHaveLength(23)
  for (const game of active) {
    expect(rendered).toContain(game.name)
  }
})
