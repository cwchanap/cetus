import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text, View, type StyleProp, type ViewStyle } from 'react-native'

const mockGroupProps: Array<Record<string, unknown>> = []
jest.mock('@shopify/react-native-skia', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react')
  const { View: MockView } =
    jest.requireActual<typeof import('react-native')>('react-native')
  return {
    Canvas: (props: {
      children?: React.ReactNode
      style?: StyleProp<ViewStyle>
    }) =>
      mockReact.createElement(
        MockView,
        { testID: 'skia-canvas', style: props.style },
        props.children
      ),
    Group: (props: Record<string, unknown>) => {
      mockGroupProps.push(props)
      return mockReact.createElement(
        MockView,
        { testID: 'skia-group' },
        props.children as React.ReactNode
      )
    },
  }
})

import { GameCanvas, toGamePoint } from '../src/games/canvas/GameCanvas'
import { swipeDirection } from '../src/games/canvas/swipeDirection'

beforeEach(() => {
  mockGroupProps.length = 0
})

const render = (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  act(() => {
    tree = TestRenderer.create(element)
  })
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  return tree
}

const fireLayout = (
  tree: TestRenderer.ReactTestRenderer,
  width: number,
  height: number
) => {
  const layoutHost = tree.root
    .findAllByType(View)
    .find(node => typeof node.props.onLayout === 'function')
  if (!layoutHost) {
    throw new Error('no onLayout host found')
  }
  act(() => {
    layoutHost.props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    })
  })
}

describe('GameCanvas', () => {
  test('renders children inside a letterboxed Skia group only after measuring', () => {
    const tree = render(
      <GameCanvas logicalWidth={500} logicalHeight={500}>
        <Text testID="scene-shape">shape</Text>
      </GameCanvas>
    )

    expect(tree.root.findAllByProps({ testID: 'skia-group' })).toHaveLength(0)
    expect(tree.root.findAllByProps({ testID: 'scene-shape' })).toHaveLength(0)

    fireLayout(tree, 400, 800)

    const group = tree.root.findByProps({ testID: 'skia-group' })
    expect(group).toBeTruthy()
    expect(mockGroupProps).toHaveLength(1)
    expect(mockGroupProps[0].transform).toEqual([
      { translateX: 0 },
      { translateY: 200 },
      { scale: 0.8 },
    ])
    expect(tree.root.findByProps({ testID: 'scene-shape' })).toBeTruthy()
  })

  test('re-letterboxes when the measured size changes aspect', () => {
    const tree = render(
      <GameCanvas logicalWidth={500} logicalHeight={500}>
        <Text testID="scene-shape">shape</Text>
      </GameCanvas>
    )

    fireLayout(tree, 400, 800)
    fireLayout(tree, 400, 800)
    expect(mockGroupProps).toHaveLength(1)

    fireLayout(tree, 800, 400)
    expect(mockGroupProps).toHaveLength(2)
    expect(mockGroupProps[1].transform).toEqual([
      { translateX: 200 },
      { translateY: 0 },
      { scale: 0.8 },
    ])
  })

  test('publishes the measured geometry through geometryRef for gesture hit-testing', () => {
    const geometryRef = { current: null }
    const tree = render(
      <GameCanvas
        logicalWidth={500}
        logicalHeight={500}
        geometryRef={geometryRef}
      >
        <Text testID="scene-shape">shape</Text>
      </GameCanvas>
    )

    expect(geometryRef.current).toBeNull()

    fireLayout(tree, 400, 800)
    expect(geometryRef.current).toEqual({
      logicalWidth: 500,
      logicalHeight: 500,
      viewWidth: 400,
      viewHeight: 800,
    })
    // The published geometry resolves touches to the same mapping drawn by
    // the letterboxed group above (scale 0.8, 200px top margin).
    expect(toGamePoint(200, 600, geometryRef.current as never)).toEqual({
      x: 250,
      y: 500,
    })

    fireLayout(tree, 800, 400)
    expect(geometryRef.current).toEqual({
      logicalWidth: 500,
      logicalHeight: 500,
      viewWidth: 800,
      viewHeight: 400,
    })
  })
})

describe('toGamePoint', () => {
  const portrait = {
    logicalWidth: 500,
    logicalHeight: 500,
    viewWidth: 400,
    viewHeight: 800,
  }

  test('converts view-local touches through the letterbox into logical units', () => {
    expect(toGamePoint(0, 200, portrait)).toEqual({ x: 0, y: 0 })
    expect(toGamePoint(200, 200, portrait)).toEqual({ x: 250, y: 0 })
    expect(toGamePoint(200, 600, portrait)).toEqual({ x: 250, y: 500 })
    expect(toGamePoint(400, 600, portrait)).toEqual({ x: 500, y: 500 })
  })

  test('rejects touches inside the top and bottom margins', () => {
    expect(toGamePoint(200, 199, portrait)).toBeNull()
    expect(toGamePoint(200, 0, portrait)).toBeNull()
    expect(toGamePoint(200, 601, portrait)).toBeNull()
    expect(toGamePoint(200, 799, portrait)).toBeNull()
  })

  test('rejects touches inside the side margins of a landscape letterbox', () => {
    const landscape = {
      logicalWidth: 500,
      logicalHeight: 500,
      viewWidth: 800,
      viewHeight: 400,
    }
    expect(toGamePoint(199, 200, landscape)).toBeNull()
    expect(toGamePoint(601, 200, landscape)).toBeNull()
    expect(toGamePoint(200, 200, landscape)).toEqual({ x: 0, y: 250 })
    expect(toGamePoint(600, 200, landscape)).toEqual({ x: 500, y: 250 })
  })

  test('returns null for an unmeasured or zero-size view', () => {
    expect(toGamePoint(10, 10, { ...portrait, viewWidth: 0 })).toBeNull()
    expect(toGamePoint(10, 10, { ...portrait, viewHeight: 0 })).toBeNull()
    expect(toGamePoint(10, 10, { ...portrait, logicalWidth: 0 })).toBeNull()
  })
})

describe('swipeDirection', () => {
  test('returns the dominant axis direction past the dp threshold', () => {
    expect(swipeDirection(30, 0)).toBe('right')
    expect(swipeDirection(-40, 10)).toBe('left')
    expect(swipeDirection(10, 40)).toBe('down')
    expect(swipeDirection(-10, -40)).toBe('up')
    expect(swipeDirection(35, 20)).toBe('right')
    expect(swipeDirection(20, -35)).toBe('up')
    expect(swipeDirection(30, 30)).toBe('down')
    expect(swipeDirection(-30, -30)).toBe('up')
  })

  test('ignores translations shorter than the threshold on every axis', () => {
    expect(swipeDirection(0, 0)).toBeNull()
    expect(swipeDirection(29, 0)).toBeNull()
    expect(swipeDirection(0, -29)).toBeNull()
    expect(swipeDirection(29, 29)).toBeNull()
    expect(swipeDirection(-30, 0)).toBe('left')
  })
})
