import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text, View } from 'react-native'

import * as Ui from '@cetus/ui'
import type { ChallengeProgressResponse } from '@cetus/shared/api-dto'
import { ChallengeType } from '@cetus/shared/challenges'
import { Button as DeepButton } from '@cetus/ui/components/ui/button'
import { Card as DeepCard } from '@cetus/ui/components/ui/card'
import { Badge as DeepBadge } from '@cetus/ui/components/ui/badge'
import { Heading as DeepHeading } from '@cetus/ui/components/ui/heading'
import { Select as DeepSelect } from '@cetus/ui/components/ui/select'
import { Toggle as DeepToggle } from '@cetus/ui/components/ui/toggle'

const mountedTrees: TestRenderer.ReactTestRenderer[] = []

const render = async (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(element)
  })
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  mountedTrees.push(tree)
  return tree
}

afterEach(async () => {
  while (mountedTrees.length > 0) {
    const tree = mountedTrees.pop()
    await act(async () => {
      tree?.unmount()
    })
  }
})

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

test('Button wraps interpolated scalar children in a single styled Text', async () => {
  const score = 42
  const tree = await render(
    <Ui.Button variant="primary" onPress={() => {}}>
      Score: {score}
    </Ui.Button>
  )
  const rawScalars = pressableOf(tree).children.filter(
    child => typeof child === 'string'
  )
  expect(rawScalars).toEqual([])
  const text = tree.root.findByType(Text)
  expect(text.props.children).toEqual(['Score: ', 42])
  expect(text.props.className).toContain('text-slate-900')
})

test('Button keeps element children beside wrapped text nodes', async () => {
  const tree = await render(
    <Ui.Button onPress={() => {}}>
      <View testID="icon" />
      Play
    </Ui.Button>
  )
  expect(tree.root.findByProps({ testID: 'icon' })).toBeTruthy()
  const rawScalars = pressableOf(tree).children.filter(
    child => typeof child === 'string'
  )
  expect(rawScalars).toEqual([])
  const texts = tree.root.findAllByType(Text)
  expect(texts).toHaveLength(1)
  expect(texts[0].props.children).toBe('Play')
  expect(texts[0].props.className).toContain('text-cetus-ink')
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

test('root Badge renders a native tree with variant classes', async () => {
  const tree = await render(<Ui.Badge variant="success">New</Ui.Badge>)
  const view = tree.root.findByType(View)
  expect(view.props.className).toContain('rounded-full')
  expect(view.props.className).toContain('border-cetus-accent')
  const text = tree.root.findByType(Text)
  expect(text.props.children).toBe('New')
  expect(text.props.className).toContain('text-cetus-accent')
})

test('root Heading renders a header-role Text with level and variant classes', async () => {
  const tree = await render(
    <Ui.Heading level={3} variant="section">
      Catalog
    </Ui.Heading>
  )
  const header = tree.root.findByProps({ accessibilityRole: 'header' })
  expect(header.props.children).toBe('Catalog')
  expect(header.props.className).toContain('text-3xl')
  expect(header.props.className).toContain('font-display')
})

test('Heading renders its kicker line above the title', async () => {
  const tree = await render(
    <Ui.Heading level={4} kicker="GAME FILE">
      Tetris Challenge
    </Ui.Heading>
  )
  const texts = tree.root.findAllByType(Text)
  expect(texts[0].props.children).toEqual(['▸ ', 'GAME FILE'])
  expect(texts[0].props.className).toContain('uppercase')
})

test('deep imports resolve the same native implementations as the root', () => {
  expect(DeepButton).toBe(Ui.Button)
  expect(DeepCard).toBe(Ui.Card)
  expect(DeepBadge).toBe(Ui.Badge)
  expect(DeepHeading).toBe(Ui.Heading)
  expect(DeepSelect).toBe(Ui.Select)
  expect(DeepToggle).toBe(Ui.Toggle)
})

test('unported deep imports fail rather than fall through to web', () => {
  for (const specifier of [
    '@cetus/ui/components/ui/avatar',
    '@cetus/ui/components/game-title',
  ]) {
    expect(() => jest.requireActual(specifier)).toThrow()
  }
})

test('catch-all file subpaths cannot reach web modules on native', () => {
  for (const specifier of [
    '@cetus/ui/index.ts',
    '@cetus/ui/index',
    '@cetus/ui/lib/styles',
    '@cetus/ui/lib/utils.ts',
    '@cetus/ui/variants.ts',
  ]) {
    expect(() => jest.requireActual(specifier)).toThrow()
  }
})

test('declared platform-neutral subpaths still resolve on native', () => {
  const utils = jest.requireActual('@cetus/ui/lib/utils') as {
    cn: unknown
  }
  expect(typeof utils.cn).toBe('function')
})

const SELECT_OPTIONS = [
  { value: 'all', label: 'All games' },
  { value: 'tetris', label: 'Tetris Challenge' },
  { value: 'snake', label: 'Snake' },
]

const comboboxOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findByProps({ accessibilityRole: 'combobox' })

const menuItemsOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll(
    node =>
      node.props.accessibilityRole === 'menuitem' &&
      typeof node.props.onPress === 'function'
  )

test('Select renders a combobox-role trigger with the selected label', async () => {
  const tree = await render(
    <Ui.Select
      options={SELECT_OPTIONS}
      value="snake"
      onValueChange={() => {}}
    />
  )
  const trigger = comboboxOf(tree)
  expect(trigger.props.accessibilityState?.expanded).toBe(false)
  const label = tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .join('')
  expect(label).toContain('Snake')
})

test('Select shows the placeholder when the value matches no option', async () => {
  const tree = await render(
    <Ui.Select
      options={SELECT_OPTIONS}
      value={undefined}
      placeholder="Pick a game"
    />
  )
  const label = tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .join('')
  expect(label).toContain('Pick a game')
})

test('Select opens menuitem options marking the current selection', async () => {
  const tree = await render(
    <Ui.Select
      options={SELECT_OPTIONS}
      value="tetris"
      onValueChange={() => {}}
    />
  )
  await act(async () => {
    comboboxOf(tree).props.onPress()
  })

  expect(comboboxOf(tree).props.accessibilityState?.expanded).toBe(true)
  const items = menuItemsOf(tree)
  expect(items).toHaveLength(3)
  const tetris = items.find(
    node => node.props.accessibilityLabel === 'Tetris Challenge'
  )
  expect(tetris?.props.accessibilityState?.selected).toBe(true)
  const all = items.find(node => node.props.accessibilityLabel === 'All games')
  expect(all?.props.accessibilityState?.selected).toBe(false)
})

test('Select reports the chosen value and closes the options', async () => {
  const onValueChange = jest.fn()
  const tree = await render(
    <Ui.Select
      options={SELECT_OPTIONS}
      value="all"
      onValueChange={onValueChange}
    />
  )
  await act(async () => {
    comboboxOf(tree).props.onPress()
  })
  const snake = tree.root.findByProps({
    accessibilityRole: 'menuitem',
    accessibilityLabel: 'Snake',
  })
  await act(async () => {
    snake.props.onPress()
  })

  expect(onValueChange).toHaveBeenCalledWith('snake')
  expect(menuItemsOf(tree)).toHaveLength(0)
  expect(comboboxOf(tree).props.accessibilityState?.expanded).toBe(false)
})

test('Select dismisses via the labeled backdrop without selecting', async () => {
  const onValueChange = jest.fn()
  const tree = await render(
    <Ui.Select
      options={SELECT_OPTIONS}
      value="all"
      onValueChange={onValueChange}
    />
  )
  await act(async () => {
    comboboxOf(tree).props.onPress()
  })
  const dismiss = tree.root.findByProps({ accessibilityLabel: 'Dismiss' })
  await act(async () => {
    dismiss.props.onPress()
  })

  expect(onValueChange).not.toHaveBeenCalled()
  expect(menuItemsOf(tree)).toHaveLength(0)
})

test('Select dismisses via the platform request-close path', async () => {
  const tree = await render(
    <Ui.Select options={SELECT_OPTIONS} value="all" onValueChange={() => {}} />
  )
  await act(async () => {
    comboboxOf(tree).props.onPress()
  })
  const modal = tree.root.find(node => node.props.onRequestClose)
  await act(async () => {
    modal.props.onRequestClose()
  })

  expect(menuItemsOf(tree)).toHaveLength(0)
})

test('Select exposes disabled state and does not open when disabled', async () => {
  const onValueChange = jest.fn()
  const tree = await render(
    <Ui.Select
      options={SELECT_OPTIONS}
      value="all"
      disabled
      onValueChange={onValueChange}
    />
  )
  const trigger = comboboxOf(tree)
  expect(trigger.props.accessibilityState?.disabled).toBe(true)
  await act(async () => {
    trigger.props.onPress?.()
  })
  expect(menuItemsOf(tree)).toHaveLength(0)
})

test('Select tracks its own selection when uncontrolled', async () => {
  const tree = await render(
    <Ui.Select options={SELECT_OPTIONS} defaultValue="all" />
  )
  await act(async () => {
    comboboxOf(tree).props.onPress()
  })
  const snake = tree.root.findByProps({
    accessibilityRole: 'menuitem',
    accessibilityLabel: 'Snake',
  })
  await act(async () => {
    snake.props.onPress()
  })

  const label = tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .join('')
  expect(label).toContain('Snake')
})

test('Select maps shared variant and size names onto the trigger', async () => {
  const tree = await render(
    <Ui.Select
      options={SELECT_OPTIONS}
      value="all"
      variant="outline"
      size="lg"
    />
  )
  const trigger = comboboxOf(tree)
  expect(trigger.props.className).toContain('border-cetus-accent/50')
  expect(trigger.props.className).toContain('h-12')
})

test('Select styles muted text and the sheet with generated theme colors', async () => {
  const tree = await render(
    <Ui.Select
      options={SELECT_OPTIONS}
      placeholder="Pick a game"
      onValueChange={() => {}}
    />
  )
  const classNames = () =>
    tree.root
      .findAll(node => typeof node.props.className === 'string')
      .map(node => node.props.className as string)

  expect(classNames().some(name => name.includes('text-cetus-ink-muted'))).toBe(
    true
  )

  await act(async () => {
    comboboxOf(tree).props.onPress()
  })

  const sheet = tree.root
    .findAllByType(View)
    .find(node => node.props.className?.includes('rounded-t-2xl'))
  expect(sheet).toBeTruthy()
  expect(sheet?.props.className).toContain('bg-cetus-canvas')
  expect(
    classNames().every(name => !/cetus-(bg|muted)(?![\w-])/.test(name))
  ).toBe(true)
})

const switchOf = (
  tree: TestRenderer.ReactTestRenderer,
  accessibilityLabel: string
) => tree.root.findByProps({ accessibilityRole: 'switch', accessibilityLabel })

const flipSwitch = async (
  tree: TestRenderer.ReactTestRenderer,
  accessibilityLabel: string,
  value: boolean
) => {
  const node = switchOf(tree, accessibilityLabel)
  await act(async () => {
    node.props.onChange({ nativeEvent: { value } })
  })
}

test('Toggle renders a switch-role node with its label and description', async () => {
  const tree = await render(
    <Ui.Toggle
      label="Push Notifications"
      description="Receive push notifications"
      checked
      onCheckedChange={() => {}}
    />
  )
  const node = switchOf(tree, 'Push Notifications')
  expect(node.props.accessibilityState.checked).toBe(true)
  const text = renderedText(tree)
  expect(text).toContain('Push Notifications')
  expect(text).toContain('Receive push notifications')
})

test('Toggle reports the next value through onCheckedChange', async () => {
  const onCheckedChange = jest.fn()
  const tree = await render(
    <Ui.Toggle
      label="Push Notifications"
      checked={false}
      onCheckedChange={onCheckedChange}
    />
  )
  await flipSwitch(tree, 'Push Notifications', true)
  expect(onCheckedChange).toHaveBeenCalledWith(true)
  expect(onCheckedChange).toHaveBeenCalledTimes(1)
})

test('Toggle stays controlled to its checked prop', async () => {
  const onCheckedChange = jest.fn()
  const tree = await render(
    <Ui.Toggle
      label="Push Notifications"
      checked={false}
      onCheckedChange={onCheckedChange}
    />
  )
  await flipSwitch(tree, 'Push Notifications', true)
  expect(
    switchOf(tree, 'Push Notifications').props.accessibilityState.checked
  ).toBe(false)
})

test('Toggle tracks its own state when uncontrolled', async () => {
  const onCheckedChange = jest.fn()
  const tree = await render(
    <Ui.Toggle
      label="Push Notifications"
      defaultChecked
      onCheckedChange={onCheckedChange}
    />
  )
  expect(
    switchOf(tree, 'Push Notifications').props.accessibilityState.checked
  ).toBe(true)
  await flipSwitch(tree, 'Push Notifications', false)
  expect(onCheckedChange).toHaveBeenCalledWith(false)
  expect(
    switchOf(tree, 'Push Notifications').props.accessibilityState.checked
  ).toBe(false)
})

test('Toggle exposes disabled state and swallows changes while disabled', async () => {
  const onCheckedChange = jest.fn()
  const tree = await render(
    <Ui.Toggle
      label="Push Notifications"
      checked={false}
      disabled
      onCheckedChange={onCheckedChange}
    />
  )
  const node = switchOf(tree, 'Push Notifications')
  expect(node.props.accessibilityState.disabled).toBe(true)
  await act(async () => {
    node.props.onChange({ nativeEvent: { value: true } })
  })
  expect(onCheckedChange).not.toHaveBeenCalled()
  expect(
    switchOf(tree, 'Push Notifications').props.accessibilityState.checked
  ).toBe(false)
})

test('Toggle falls back to accessibilityLabel when no label is given', async () => {
  const tree = await render(
    <Ui.Toggle
      accessibilityLabel="Reminders"
      checked
      onCheckedChange={() => {}}
    />
  )
  expect(switchOf(tree, 'Reminders')).toBeTruthy()
})

test('root export exposes only implemented native components', () => {
  const root = Ui as unknown as Record<string, unknown>
  expect(root.Button).toBeDefined()
  expect(root.Card).toBeDefined()
  expect(root.Badge).toBeDefined()
  expect(root.Heading).toBeDefined()
  expect(root.Select).toBeDefined()
  expect(root.Toggle).toBeDefined()
  expect(root.DailyMissionsPanel).toBeDefined()
  for (const key of [
    'Avatar',
    'Container',
    'Section',
    'Pagination',
    'GameOverlay',
    'GameTitle',
    'GameBreadcrumb',
    'GameStats',
    'GameControls',
    'UserDropdown',
    'displayFontStyle',
  ]) {
    expect(root[key]).toBeUndefined()
  }
})

const MISSION: ChallengeProgressResponse = {
  challengeId: 'play_2_games',
  name: 'Warm Up',
  description: 'Play 2 games today',
  icon: '🎮',
  type: ChallengeType.PLAY_GAMES,
  targetValue: 2,
  currentValue: 1,
  xpReward: 30,
  difficulty: 'easy',
  completed: false,
  completedAt: null,
}

const PANEL_PROPS = {
  challenges: [MISSION],
  xp: 120,
  level: 3,
  xpProgress: 40,
  xpToNextLevel: 130,
  streak: 4,
  resetIn: 5415,
  responseStamp: {},
}

test('deep import resolves the same native DailyMissionsPanel as the root', () => {
  const deep = jest.requireActual('@cetus/ui/components/daily-missions-panel')
    .DailyMissionsPanel as unknown
  expect(deep).toBe(Ui.DailyMissionsPanel)
})

test('DailyMissionsPanel renders missions, XP progress, streak and the UTC reset countdown', async () => {
  const tree = await render(<Ui.DailyMissionsPanel {...PANEL_PROPS} />)

  const text = renderedText(tree)
  expect(text).toContain('DAILY MISSIONS')
  expect(text).toContain('Warm Up')
  expect(text).toContain('Play 2 games today')
  expect(text).toContain('Level 3')
  expect(text).toContain('120 XP')
  expect(text).toContain('130 XP to Level 4')
  expect(text).toContain('Resets in 01:30:15')
  expect(text).toContain('4 days')
  expect(
    tree.root.findByProps({
      accessibilityLabel:
        'Warm Up, easy mission, Play 2 games today, 1 of 2 complete, 30 XP reward, in progress',
    })
  ).toBeTruthy()
})

test('DailyMissionsPanel swaps the countdown for a refresh control once the reset passes', async () => {
  const onResetRefresh = jest.fn()
  const tree = await render(
    <Ui.DailyMissionsPanel
      {...PANEL_PROPS}
      resetIn={0}
      onResetRefresh={onResetRefresh}
    />
  )

  const text = renderedText(tree)
  expect(text).toContain('Daily missions reset')
  expect(text).not.toContain('Resets in')

  const refresh = tree.root.findByProps({
    accessibilityLabel: 'Refresh daily missions',
  })
  expect(refresh.props.accessibilityRole).toBe('button')
  await act(async () => {
    refresh.props.onPress()
  })
  expect(onResetRefresh).toHaveBeenCalledTimes(1)
})

test('DailyMissionsPanel ticks through zero into the reset state', async () => {
  const tree = await render(
    <Ui.DailyMissionsPanel {...PANEL_PROPS} resetIn={1} />
  )
  expect(renderedText(tree)).toContain('Resets in 00:00:01')

  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 1300))
  })

  const text = renderedText(tree)
  expect(text).toContain('Daily missions reset')
  expect(text).not.toContain('Resets in')
})

test('DailyMissionsPanel re-anchors the countdown when a new response changes resetIn', async () => {
  const tree = await render(
    <Ui.DailyMissionsPanel {...PANEL_PROPS} resetIn={0} />
  )
  expect(renderedText(tree)).toContain('Daily missions reset')

  await act(async () => {
    tree.update(<Ui.DailyMissionsPanel {...PANEL_PROPS} resetIn={86400} />)
  })

  const text = renderedText(tree)
  expect(text).toContain('Resets in 24:00:00')
  expect(text).not.toContain('Daily missions reset')
})

test('DailyMissionsPanel retains its deadline across ordinary rerenders', async () => {
  const tree = await render(
    <Ui.DailyMissionsPanel {...PANEL_PROPS} resetIn={1} />
  )
  await act(async () => {
    tree.update(
      <Ui.DailyMissionsPanel
        {...PANEL_PROPS}
        resetIn={1}
        responseStamp={PANEL_PROPS.responseStamp}
      />
    )
  })

  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 1300))
  })

  const text = renderedText(tree)
  expect(text).toContain('Daily missions reset')
})

test('DailyMissionsPanel re-anchors when a new response repeats resetIn', async () => {
  const tree = await render(
    <Ui.DailyMissionsPanel
      {...PANEL_PROPS}
      resetIn={1}
      responseStamp={{ date: '2026-11-02' }}
    />
  )
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 1300))
  })
  expect(renderedText(tree)).toContain('Daily missions reset')

  await act(async () => {
    tree.update(
      <Ui.DailyMissionsPanel
        {...PANEL_PROPS}
        resetIn={1}
        responseStamp={{ date: '2026-11-03' }}
      />
    )
  })

  const text = renderedText(tree)
  expect(text).toContain('Resets in 00:00:01')
  expect(text).not.toContain('Daily missions reset')
})

test('DailyMissionsPanel expires on wall time while ticks are suspended', async () => {
  const nowSpy = jest.spyOn(Date, 'now')
  const t0 = 1_700_000_000_000
  try {
    nowSpy.mockReturnValue(t0)
    const tree = await render(
      <Ui.DailyMissionsPanel {...PANEL_PROPS} resetIn={3600} />
    )
    expect(renderedText(tree)).toContain('Resets in 01:00:00')

    nowSpy.mockReturnValue(t0 + 3_605_000)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1300))
    })

    const text = renderedText(tree)
    expect(text).toContain('Daily missions reset')
    expect(text).not.toContain('Resets in')
  } finally {
    nowSpy.mockRestore()
  }
})

test('DailyMissionsPanel countdown stops cleanly on unmount', async () => {
  const tree = await render(
    <Ui.DailyMissionsPanel {...PANEL_PROPS} resetIn={2} />
  )
  await act(async () => {
    tree.unmount()
  })
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 1200))
  })
  expect(tree.toJSON()).toBeNull()
})

test('DailyMissionsPanel stacks level and reset metadata below the title for narrow screens', async () => {
  const tree = await render(<Ui.DailyMissionsPanel {...PANEL_PROPS} />)

  const title = tree.root.findByProps({ accessibilityRole: 'header' })
  expect(title.props.children).toBe('DAILY MISSIONS')
  expect(title.props.numberOfLines).toBe(2)
  expect(title.props.className).toContain('flex-1')

  let titleRow: TestRenderer.ReactTestInstance | null = title.parent
  while (titleRow && titleRow.type !== View) {
    titleRow = titleRow.parent
  }
  if (titleRow === null) {
    throw new Error('Expected a View row containing the panel title')
  }
  const titleRowText = titleRow
    .findAllByType(Text)
    .map(node => scalarText(node.props.children))
    .join('\n')
  expect(titleRowText).not.toContain('Level 3')
  expect(titleRowText).not.toContain('Resets in')

  const metadataRow = tree.root.findAllByType(View).find(node => {
    const className = node.props.className as string | undefined
    if (!className?.includes('justify-between')) {
      return false
    }
    const texts = node
      .findAllByType(Text)
      .map(child => scalarText(child.props.children))
      .join('\n')
    return texts.includes('Level 3') && texts.includes('Resets in')
  })
  expect(metadataRow).toBeTruthy()
  expect(metadataRow).not.toBe(titleRow)
})

test('DailyMissionsPanel constrains the expired countdown within the metadata row', async () => {
  const tree = await render(
    <Ui.DailyMissionsPanel
      {...PANEL_PROPS}
      resetIn={0}
      onResetRefresh={() => {}}
    />
  )

  const resetLabel = tree.root
    .findAllByType(Text)
    .find(node => scalarText(node.props.children) === 'Daily missions reset')
  if (!resetLabel) {
    throw new Error('Expected the expired reset label')
  }
  expect(resetLabel.props.className).toContain('shrink')
  expect(resetLabel.props.numberOfLines).toBe(2)

  let expiredRow: TestRenderer.ReactTestInstance | null = resetLabel.parent
  while (expiredRow && expiredRow.type !== View) {
    expiredRow = expiredRow.parent
  }
  if (expiredRow === null) {
    throw new Error('Expected a View row containing the reset label')
  }
  expect(expiredRow.props.className).toContain('flex-wrap')
  expect(expiredRow.props.className).toContain('shrink')

  const metadataRow = tree.root.findAllByType(View).find(node => {
    const className = node.props.className as string | undefined
    if (!className?.includes('justify-between')) {
      return false
    }
    const texts = node
      .findAllByType(Text)
      .map(child => scalarText(child.props.children))
      .join('\n')
    return texts.includes('Level 3') && texts.includes('Daily missions reset')
  })
  expect(metadataRow).toBeTruthy()
})
