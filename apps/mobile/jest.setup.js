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
