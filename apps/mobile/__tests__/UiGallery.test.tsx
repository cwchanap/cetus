import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text, View } from 'react-native'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockCanGoBack = jest.fn()
const mockLoginRewardHost = jest.fn((_props: object) => null)

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

jest.mock('../src/lib/login-rewards', () => ({
  LoginRewardHost: (props: object) => mockLoginRewardHost(props),
}))

import UiGalleryScreen from '../app/dev/ui-gallery'
import GamesScreen from '../app/(tabs)/index'

const setDevMode = (value: boolean) => {
  Object.defineProperty(globalThis, '__DEV__', {
    configurable: true,
    writable: true,
    value,
  })
}

const mountedTrees: TestRenderer.ReactTestRenderer[] = []

const drain = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 75))
  })
}

const render = async (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(element)
  })
  await drain()
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  mountedTrees.push(tree)
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

const press = async (
  tree: TestRenderer.ReactTestRenderer,
  accessibilityLabel: string
) => {
  const node = tree.root.findByProps({ accessibilityLabel })
  await act(async () => {
    node.props.onPress()
  })
  await drain()
}

beforeEach(() => {
  mockPush.mockClear()
  mockReplace.mockClear()
  mockCanGoBack.mockReset().mockReturnValue(true)
  mockLoginRewardHost.mockClear()
  setDevMode(true)
})

afterEach(async () => {
  setDevMode(true)
  while (mountedTrees.length > 0) {
    const tree = mountedTrees.pop()
    await act(async () => {
      tree?.unmount()
    })
  }
})

describe('dev UI gallery', () => {
  test('renders a specimen section for every HPA-182 native component', async () => {
    const tree = await render(<UiGalleryScreen />)

    const headers = tree.root
      .findAllByProps({ accessibilityRole: 'header' })
      .map(node => scalarText(node.props.children))

    for (const section of [
      'Heading',
      'Button',
      'Badge',
      'Card',
      'Select',
      'Toggle',
      'Daily missions panel',
      'Login reward modal',
    ]) {
      expect(headers).toContain(section)
    }
    expect(renderedText(tree)).toContain('UI gallery')
  })

  test('button specimens render every shared variant', async () => {
    const tree = await render(<UiGalleryScreen />)

    for (const variant of [
      'default',
      'destructive',
      'outline',
      'secondary',
      'ghost',
      'link',
      'primary',
    ]) {
      expect(
        tree.root.findByProps({
          accessibilityLabel: `Button variant ${variant}`,
        })
      ).toBeTruthy()
    }
  })

  test('interactive button specimen counts presses and disabled specimen stays inert', async () => {
    const tree = await render(<UiGalleryScreen />)

    const counter = tree.root.findByProps({ testID: 'button-press-count' })
    expect(scalarText(counter.props.children)).toBe('Pressed 0 times')

    await press(tree, 'Count presses')
    await press(tree, 'Count presses')

    expect(scalarText(counter.props.children)).toBe('Pressed 2 times')

    const disabled = tree.root.findByProps({
      accessibilityLabel: 'Disabled button',
    })
    expect(disabled.props.disabled).toBe(true)
  })

  test('card specimens render every shared variant plus HUD brackets', async () => {
    const tree = await render(<UiGalleryScreen />)

    for (const variant of ['default', 'sci-fi', 'glass', 'elevated']) {
      expect(tree.root.findByProps({ testID: `card-${variant}` })).toBeTruthy()
    }

    const bracketed = tree.root.findByProps({ testID: 'card-brackets' })
    const brackets = bracketed
      .findAllByType(View)
      .filter(node =>
        (node.props.className as string | undefined)?.includes('absolute')
      )
    expect(brackets).toHaveLength(4)
  })

  test('badge specimens render every shared variant', async () => {
    const tree = await render(<UiGalleryScreen />)

    const rendered = renderedText(tree)
    for (const variant of [
      'default',
      'secondary',
      'destructive',
      'outline',
      'success',
      'warning',
      'error',
    ]) {
      expect(rendered).toContain(variant)
      expect(tree.root.findByProps({ testID: `badge-${variant}` })).toBeTruthy()
    }
  })

  test('heading specimens cover each shared variant', async () => {
    const tree = await render(<UiGalleryScreen />)

    const rendered = renderedText(tree)
    expect(rendered).toContain('Hero heading')
    expect(rendered).toContain('Section heading')
    expect(rendered).toContain('Subsection heading')
    expect(rendered).toContain('Default heading')
  })

  test('select specimens open options and track the selection locally', async () => {
    const tree = await render(<UiGalleryScreen />)

    const trigger = tree.root.findByProps({
      accessibilityRole: 'combobox',
      accessibilityLabel: 'Select variant default',
    })
    await act(async () => {
      trigger.props.onPress()
    })
    await drain()

    await act(async () => {
      tree.root
        .findByProps({
          accessibilityRole: 'menuitem',
          accessibilityLabel: 'Snake',
        })
        .props.onPress()
    })
    await drain()

    expect(
      scalarText(
        tree.root.findByProps({ testID: 'select-value' }).props.children
      )
    ).toBe('Selected: snake')
  })

  test('select exposes a disabled specimen that will not open', async () => {
    const tree = await render(<UiGalleryScreen />)

    const disabled = tree.root.findByProps({
      accessibilityRole: 'combobox',
      accessibilityLabel: 'Select disabled',
    })
    expect(disabled.props.accessibilityState?.disabled).toBe(true)
    await act(async () => {
      disabled.props.onPress?.()
    })
    await drain()
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'menuitem' })
    ).toHaveLength(0)
  })

  test('toggle specimens flip locally and the disabled specimen stays inert', async () => {
    const tree = await render(<UiGalleryScreen />)

    const sciFi = () =>
      tree.root.findByProps({
        accessibilityRole: 'switch',
        accessibilityLabel: 'Sci-fi toggle',
      })
    expect(sciFi().props.accessibilityState.checked).toBe(true)
    await act(async () => {
      sciFi().props.onChange({ nativeEvent: { value: false } })
    })
    await drain()
    expect(sciFi().props.accessibilityState.checked).toBe(false)

    const locked = tree.root.findByProps({
      accessibilityRole: 'switch',
      accessibilityLabel: 'Disabled toggle',
    })
    expect(locked.props.accessibilityState.disabled).toBe(true)
    await act(async () => {
      locked.props.onChange({ nativeEvent: { value: true } })
    })
    await drain()
    expect(
      tree.root.findByProps({
        accessibilityRole: 'switch',
        accessibilityLabel: 'Disabled toggle',
      }).props.accessibilityState.checked
    ).toBe(false)
  })

  test('daily missions panel renders deterministic example data', async () => {
    const tree = await render(<UiGalleryScreen />)

    const rendered = renderedText(tree)
    expect(rendered).toContain('DAILY MISSIONS')
    expect(rendered).toContain('Warm Up')
    expect(rendered).toContain('Tetris Starter')
    expect(rendered).toContain('Level 3')
    expect(rendered).toContain('120 XP')
    expect(rendered).toContain('Resets in 01:30:15')
    expect(rendered).toContain('4 days')
  })

  test('reward preview opens the modal, claims locally and closes', async () => {
    const tree = await render(<UiGalleryScreen />)

    expect(renderedText(tree)).not.toContain('Daily Login Reward')

    await press(tree, 'Preview reward: claimable')

    expect(renderedText(tree)).toContain('Daily Login Reward')
    expect(renderedText(tree)).toContain('+30 XP')
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Claim daily login reward',
      })
    ).toBeTruthy()

    await press(tree, 'Claim daily login reward')

    const rendered = renderedText(tree)
    expect(rendered).toContain('LEVEL UP! Level 4')
    expect(rendered).toContain('Monthly Master')
    expect(rendered).toContain('Claimed Today')

    await press(tree, 'Close daily login reward')
    expect(renderedText(tree)).not.toContain('Daily Login Reward')
  })

  test('reward preview covers the already-claimed and error states', async () => {
    const tree = await render(<UiGalleryScreen />)

    await press(tree, 'Preview reward: claimed')
    expect(renderedText(tree)).toContain('Claimed Today')
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Claim daily login reward',
      })
    ).toHaveLength(0)
    await press(tree, 'Dismiss daily login reward')

    await press(tree, 'Preview reward: error')
    const alert = tree.root.findByProps({ accessibilityRole: 'alert' })
    expect(scalarText(alert.props.children)).toContain('failed')
    expect(renderedText(tree)).toContain('Try again')
    await press(tree, 'Dismiss daily login reward')

    await press(tree, 'Preview reward: claiming')
    const claiming = tree.root.findByProps({
      accessibilityLabel: 'Claim daily login reward',
    })
    expect(claiming.props.accessibilityState?.disabled).toBe(true)
    expect(claiming.props.accessibilityState?.busy).toBe(true)
    expect(renderedText(tree)).toContain('Claiming')
    await press(tree, 'Dismiss daily login reward')
  })

  test('shows an inert production state with no specimens when __DEV__ is false', async () => {
    setDevMode(false)
    const tree = await render(<UiGalleryScreen />)

    const rendered = renderedText(tree)
    expect(rendered).toContain('Not available')
    expect(rendered).not.toContain('DAILY MISSIONS')
    expect(rendered).not.toContain('Count presses')
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Button variant primary',
      })
    ).toHaveLength(0)
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'combobox' })
    ).toHaveLength(0)

    await press(tree, 'Back to games')
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  test('offers a back fallback when the stack cannot go back', async () => {
    mockCanGoBack.mockReturnValue(false)
    const tree = await render(<UiGalleryScreen />)

    await press(tree, 'Back to games')
    expect(mockReplace).toHaveBeenCalledWith('/')
  })
})

describe('gallery entry point', () => {
  test('games hub links to the gallery in development builds', async () => {
    const tree = await render(<GamesScreen />)

    const entry = tree.root.findByProps({ accessibilityLabel: 'UI gallery' })
    expect(entry.props.accessibilityRole).toBe('button')
    await act(async () => {
      entry.props.onPress()
    })
    expect(mockPush).toHaveBeenCalledWith('/dev/ui-gallery')
  })

  test('production navigation hides the gallery entry', async () => {
    setDevMode(false)
    const tree = await render(<GamesScreen />)

    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'UI gallery' })
    ).toHaveLength(0)
    expect(renderedText(tree)).toContain('Tetris Challenge')
  })
})
