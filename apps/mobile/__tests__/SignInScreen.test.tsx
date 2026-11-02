import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}))

jest.mock('../src/lib/auth-client', () => ({
  authClient: { signIn: { social: jest.fn() } },
}))

import SignInScreen from '../app/sign-in'
import { authClient } from '../src/lib/auth-client'

const signInSocial = jest.mocked(authClient.signIn.social)

const press = async (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const button = tree.root.findByProps({ accessibilityLabel: label })
  await act(async () => {
    await button.props.onPress()
  })
}

afterEach(() => {
  signInSocial.mockReset()
})

// Rejected and canceled browser logins must surface a visible error — never
// navigate, never crash. (Real provider flows are manual/device gates.)
test('shows a visible error when the provider rejects the sign-in', async () => {
  signInSocial.mockResolvedValueOnce({
    data: null,
    error: { message: 'Access denied' },
  })

  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(<SignInScreen />)
  })
  await press(tree!, 'Continue with Google')

  const error = tree!.root.findByProps({ testID: 'sign-in-error' })
  expect(error.props.children).toContain('rejected')
  expect(error.props.children).toContain('Access denied')
})

test('shows a visible error when the browser flow is canceled', async () => {
  signInSocial.mockRejectedValueOnce(new Error('User canceled the auth flow'))

  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(<SignInScreen />)
  })
  await press(tree!, 'Continue with Apple')

  const error = tree!.root.findByProps({ testID: 'sign-in-error' })
  expect(error.props.children).toContain('canceled')
})

test('requests the expected provider via the auth client', async () => {
  signInSocial.mockResolvedValueOnce({ data: {}, error: null })

  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(<SignInScreen />)
  })
  await press(tree!, 'Continue with Google')

  expect(signInSocial).toHaveBeenCalledWith({
    provider: 'google',
    callbackURL: '/profile',
  })
})
