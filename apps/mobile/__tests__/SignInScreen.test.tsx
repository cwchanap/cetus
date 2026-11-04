import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ returnTo: undefined })),
  useRouter: () => ({ dismissTo: jest.fn() }),
}))

jest.mock('../src/lib/auth-client', () => ({
  authClient: {
    signIn: { social: jest.fn() },
    getSession: jest.fn(),
  },
}))

import { useLocalSearchParams } from 'expo-router'
import SignInScreen from '../app/sign-in'
import { authClient } from '../src/lib/auth-client'

const signInSocial = jest.mocked(authClient.signIn.social)
const getSession = jest.mocked(authClient.getSession)
const mockParams = jest.mocked(useLocalSearchParams)

const press = async (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const button = tree.root.findByProps({ accessibilityLabel: label })
  await act(async () => {
    await button.props.onPress()
  })
}

const render = async () => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(<SignInScreen />)
  })
  return tree!
}

afterEach(() => {
  signInSocial.mockReset()
  getSession.mockReset()
})

// Rejected and canceled browser logins must surface a visible error — never
// navigate, never crash. (Real provider flows are manual/device gates; no
// successful-OAuth mocks here.)
test('shows a visible error when the provider rejects the sign-in', async () => {
  signInSocial.mockResolvedValueOnce({
    data: null,
    error: { message: 'Access denied' },
  })

  const tree = await render()
  await press(tree, 'Continue with Google')

  expect(signInSocial).toHaveBeenCalledWith({
    provider: 'google',
    callbackURL: '/(tabs)/profile',
    errorCallbackURL: '/(tabs)/profile',
  })
  const error = tree.root.findByProps({ testID: 'sign-in-error' })
  expect(error.props.children).toContain('rejected')
  expect(error.props.children).toContain('Access denied')
})

test('shows a visible error when the browser session is dismissed without an error', async () => {
  // The installed expo client resolves a dismissed browser flow normally
  // (error: null, no session) — the screen must treat it as canceled.
  signInSocial.mockResolvedValueOnce({ data: null, error: null })
  getSession.mockResolvedValueOnce({ data: null, error: null })

  const tree = await render()
  await press(tree, 'Continue with Google')

  expect(signInSocial).toHaveBeenCalledWith({
    provider: 'google',
    callbackURL: '/(tabs)/profile',
    errorCallbackURL: '/(tabs)/profile',
  })
  const error = tree.root.findByProps({ testID: 'sign-in-error' })
  expect(error.props.children).toContain('canceled')
})

test('carries an allowlisted returnTo through the OAuth callback', async () => {
  mockParams.mockReturnValueOnce({ returnTo: '/' })
  signInSocial.mockResolvedValueOnce({
    data: null,
    error: { message: 'Access denied' },
  })

  const tree = await render()
  await press(tree, 'Continue with Google')

  expect(signInSocial).toHaveBeenCalledWith({
    provider: 'google',
    callbackURL: '/',
    errorCallbackURL: '/',
  })
})

test('carries the challenges returnTo through the OAuth callback', async () => {
  mockParams.mockReturnValueOnce({ returnTo: '/challenges' })
  signInSocial.mockResolvedValueOnce({
    data: null,
    error: { message: 'Access denied' },
  })

  const tree = await render()
  await press(tree, 'Continue with Google')

  expect(signInSocial).toHaveBeenCalledWith({
    provider: 'google',
    callbackURL: '/challenges',
    errorCallbackURL: '/challenges',
  })
})

test('carries the settings returnTo through the OAuth callback', async () => {
  mockParams.mockReturnValueOnce({ returnTo: '/settings' })
  signInSocial.mockResolvedValueOnce({
    data: null,
    error: { message: 'Access denied' },
  })

  const tree = await render()
  await press(tree, 'Continue with Google')

  expect(signInSocial).toHaveBeenCalledWith({
    provider: 'google',
    callbackURL: '/settings',
    errorCallbackURL: '/settings',
  })
})

test('falls back to profile for unknown returnTo values', async () => {
  mockParams.mockReturnValueOnce({ returnTo: 'evil://screen' })
  signInSocial.mockResolvedValueOnce({
    data: null,
    error: { message: 'Access denied' },
  })

  const tree = await render()
  await press(tree, 'Continue with Apple')

  expect(signInSocial).toHaveBeenCalledWith({
    provider: 'apple',
    callbackURL: '/(tabs)/profile',
    errorCallbackURL: '/(tabs)/profile',
  })
})

test('shows a visible error when the sign-in call throws', async () => {
  signInSocial.mockRejectedValueOnce(new Error('User canceled the auth flow'))

  const tree = await render()
  await press(tree, 'Continue with Apple')

  expect(signInSocial).toHaveBeenCalledWith({
    provider: 'apple',
    callbackURL: '/(tabs)/profile',
    errorCallbackURL: '/(tabs)/profile',
  })
  const error = tree.root.findByProps({ testID: 'sign-in-error' })
  expect(error.props.children).toContain('canceled')
})
