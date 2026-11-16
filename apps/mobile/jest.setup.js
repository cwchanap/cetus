/* eslint-disable no-undef, @typescript-eslint/no-require-imports -- test-only Node script */
// Test env for the mobile Jest project: the mobile lib modules throw at
// import time without a backend origin, so give them a deterministic one.
process.env.EXPO_PUBLIC_API_BASE_URL ??= 'https://cetus-test.example'

// The game registry transitively reaches the Skia/gesture boards in every
// suite, but both native entry points throw at import time under Jest.
// The defaults below only guarantee import safety — suites that assert on
// shapes or gestures install their own per-file jest.mock factories.
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

require('react-native-gesture-handler/jestSetup')
