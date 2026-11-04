import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text, View } from 'react-native'

import * as Ui from '@cetus/ui'
import { Button as DeepButton } from '@cetus/ui/components/ui/button'
import { Card as DeepCard } from '@cetus/ui/components/ui/card'

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

const pressableOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.find(
    node =>
      typeof node.props.onPress === 'function' &&
      typeof node.props.className === 'string'
  )

test('root Button renders a native host tree with default variant/size classes', async () => {
  const tree = await render(<Ui.Button>Launch</Ui.Button>)
  const json = tree.toJSON() as { type: string; props: { className?: string } }
  expect(json.type).toBe('View')
  expect(json.props.className).toContain('bg-cetus-surface')
  expect(json.props.className).toContain('border-cetus-hairline')
  expect(json.props.className).toContain('h-10')
})

test('Button fires its semantic onPress handler', async () => {
  const onPress = jest.fn()
  const tree = await render(<Ui.Button onPress={onPress}>Launch</Ui.Button>)
  expect(pressableOf(tree).props.onPress).toBe(onPress)
  await act(async () => {
    pressableOf(tree).props.onPress()
  })
  expect(onPress).toHaveBeenCalledTimes(1)
})

test('Button maps shared variant/size names to native classes', async () => {
  const tree = await render(
    <Ui.Button variant="primary" size="lg">
      Launch
    </Ui.Button>
  )
  const json = tree.toJSON() as { props: { className?: string } }
  expect(json.props.className).toContain('bg-cetus-accent')
  expect(json.props.className).toContain('h-11')
})

test('Button wraps string children in Text with the variant text classes', async () => {
  const tree = await render(<Ui.Button variant="primary">Launch</Ui.Button>)
  const text = tree.root.findByType(Text)
  expect(text.props.children).toBe('Launch')
  expect(text.props.className).toContain('text-slate-900')
})

test('root Card renders a native View with variant classes', async () => {
  const tree = await render(
    <Ui.Card variant="sci-fi">
      <Text>inner</Text>
    </Ui.Card>
  )
  const view = tree.root.findByType(View)
  expect(view.props.className).toContain('rounded-2xl')
  expect(view.props.className).toContain('bg-cetus-surface')
  expect(view.props.className).toContain('border-cetus-hairline')
  expect(view.props.children).toBeTruthy()
})

test('Card renders the four HUD bracket corners when brackets is set', async () => {
  const tree = await render(
    <Ui.Card brackets>
      <Text>inner</Text>
    </Ui.Card>
  )
  const brackets = tree.root
    .findAllByType(View)
    .filter(node =>
      (node.props.className as string | undefined)?.includes('absolute')
    )
  expect(brackets).toHaveLength(4)
})

test('deep imports resolve the same native implementations as the root', () => {
  expect(DeepButton).toBe(Ui.Button)
  expect(DeepCard).toBe(Ui.Card)
})

test('unported deep imports fail rather than fall through to web', async () => {
  for (const specifier of [
    '@cetus/ui/components/ui/badge',
    '@cetus/ui/components/game-title',
  ]) {
    await expect(import(specifier)).rejects.toThrow()
  }
})

test('root export exposes only implemented native components', () => {
  const root = Ui as unknown as Record<string, unknown>
  expect(root.Button).toBeDefined()
  expect(root.Card).toBeDefined()
  for (const key of [
    'Badge',
    'Heading',
    'Avatar',
    'Container',
    'Section',
    'Pagination',
    'Select',
    'Toggle',
    'GameOverlay',
    'GameTitle',
    'GameBreadcrumb',
    'GameStats',
    'GameControls',
    'DailyMissionsPanel',
    'UserDropdown',
    'displayFontStyle',
  ]) {
    expect(root[key]).toBeUndefined()
  }
})
