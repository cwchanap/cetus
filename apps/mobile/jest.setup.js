/* eslint-disable no-undef -- test-only Node script */
// Test env for the mobile Jest project: the mobile lib modules throw at
// import time without a backend origin, so give them a deterministic one.
process.env.EXPO_PUBLIC_API_BASE_URL ??= 'https://cetus-test.example'

import 'react-native-gesture-handler/jestSetup'

jest.mock('@shopify/react-native-skia', () => {
  const mockReact = jest.requireActual('react')
  const stubCache = new Map()
  const makeStub = name => {
    const Stub = props =>
      mockReact.createElement(mockReact.Fragment, null, props && props.children)
    Stub.displayName = `SkiaStub(${String(name)})`
    return Stub
  }
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === '__esModule') {
          return true
        }
        if (!stubCache.has(prop)) {
          stubCache.set(prop, makeStub(prop))
        }
        return stubCache.get(prop)
      },
    }
  )
})

// The real module installs the worklets native runtime at import time; the
// boards only need the JS-side hooks, so the mock evaluates animated styles
// eagerly (with* return their target value) over a plain View.
jest.mock('react-native-reanimated', () => {
  const mockReact = jest.requireActual('react')
  const { View: MockView } = jest.requireActual('react-native')
  const AnimatedView = props =>
    mockReact.createElement(MockView, props, props && props.children)
  const entering = { duration: () => ({}) }
  return {
    __esModule: true,
    default: {
      View: AnimatedView,
      createAnimatedComponent: component => component,
    },
    useSharedValue: initial => ({ value: initial }),
    useAnimatedStyle: updater => updater(),
    // GestureDetector's reanimatedWrapper hooks; the JS-side handlers are
    // driven straight through gesture.handlers in tests.
    useEvent: () => () => {},
    useHandler: () => ({}),
    useAnimatedReaction: () => {},
    setGestureState: () => {},
    withTiming: value => value,
    withSequence: (...values) => values[values.length - 1],
    withDelay: (_delay, value) => value,
    cancelAnimation: () => {},
    FadeIn: { ...entering },
    ZoomIn: { ...entering },
    Easing: { linear: value => value, ease: value => value },
  }
})
