import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import { QuickMathFrameworkGame } from '@cetus/games/quick-math/game'

jest.mock('../src/lib/api', () => ({
  api: {
    submitScore: jest.fn(),
  },
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    canGoBack: jest.fn(),
  }),
}))

import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES } from '../src/games/registry'
const submitScore = jest.mocked(api.submitScore)

const createdGames: QuickMathFrameworkGame[] = []
const originalEntry = NATIVE_GAMES[GameID.QUICK_MATH]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Quick Math registry port missing')
  }
  // Production port (view, projector); only the created instance is
  // captured so tests can read and spy on the live model.
  NATIVE_GAMES[GameID.QUICK_MATH] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = originalPort.createGame(deps) as QuickMathFrameworkGame
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.QUICK_MATH] = originalEntry
})

const trees: Array<TestRenderer.ReactTestRenderer> = []

const settle = async () => {
  // Let the model's async end()/score-save microtasks finish.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
  })
}

const render = async (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(element)
  })
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  trees.push(tree)
  return tree
}

const press = async (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const button = tree.root.findByProps({ accessibilityLabel: label })
  await act(async () => {
    button.props.onPress()
  })
}

/** Type a digit string on the keypad, one key per character. */
const typeDigits = async (
  tree: TestRenderer.ReactTestRenderer,
  digits: string
) => {
  for (const digit of digits) {
    await press(tree, `Type ${digit}`)
  }
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

const testText = (
  tree: TestRenderer.ReactTestRenderer,
  testID: string
): string =>
  scalarText(
    tree.root.findByProps({ testID }).props.children as React.ReactNode
  )

/** First host-tag element carrying the accessibility label (jest-expo
 *  mocks render a React wrapper AND a host element with identical
 *  props — query host-tag elements only). */
const hostByLabel = (
  tree: TestRenderer.ReactTestRenderer,
  label: string
): TestRenderer.ReactTestInstance =>
  tree.root.findAll(
    node =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label
  )[0]

/** Answer the live model's current question correctly through the
 *  keypad (the digits come from the model itself — no duplicated
 *  rules), then submit. */
const answerCorrect = async (tree: TestRenderer.ReactTestRenderer) => {
  const game = createdGames[0]
  const answer = game.getCurrentQuestion()?.answer
  if (answer === undefined) {
    throw new Error('no current question to answer')
  }
  await typeDigits(tree, String(answer))
  await press(tree, 'Submit answer')
}

beforeEach(() => {
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  createdGames.length = 0
  mockPush.mockReset()
})

afterEach(async () => {
  for (const tree of trees.splice(0)) {
    await act(async () => {
      tree.unmount()
    })
  }
})

describe('Quick Math board — render', () => {
  test('renders the idle question, a disabled keypad and zeroed HUD counters', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    // Web parity: the question slot reads "Ready?" before the first run.
    expect(testText(tree, 'quick-math-question')).toBe('Ready?')
    expect(testText(tree, 'quick-math-answer')).toBe('Enter answer')
    expect(testText(tree, 'quick-math-questions')).toBe('Questions 0')
    expect(testText(tree, 'quick-math-correct')).toBe('Correct 0')
    expect(testText(tree, 'quick-math-accuracy')).toBe('Accuracy 0%')

    for (const key of ['Type 0', 'Type 5', 'Type 9', 'Backspace']) {
      expect(hostByLabel(tree, key).props.accessibilityState.disabled).toBe(
        true
      )
    }
    expect(
      hostByLabel(tree, 'Submit answer').props.accessibilityState.disabled
    ).toBe(true)
  })

  test('the keypad keeps accessible targets: three flex-1 columns of 48pt keys', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    for (let digit = 0; digit <= 9; digit++) {
      const key = hostByLabel(tree, `Type ${digit}`)
      // h-12 keeps every key at 48pt tall; flex-1 spreads the three
      // columns so nothing shrinks on narrow screens.
      expect(String(key.props.className)).toContain('h-12')
      expect(String(key.props.className)).toContain('flex-1')
    }
  })
})

describe('Quick Math board — keypad and answers', () => {
  test('digits type into the answer display and Backspace removes the last digit', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    await press(tree, 'Start game')
    expect(hostByLabel(tree, 'Type 1').props.accessibilityState.disabled).toBe(
      false
    )
    expect(testText(tree, 'quick-math-question')).not.toBe('Ready?')

    await typeDigits(tree, '12')
    expect(testText(tree, 'quick-math-answer')).toBe('12')

    await press(tree, 'Backspace')
    expect(testText(tree, 'quick-math-answer')).toBe('1')

    await press(tree, 'Backspace')
    expect(testText(tree, 'quick-math-answer')).toBe('Enter answer')

    // Backspace on an empty answer is a harmless no-op.
    await press(tree, 'Backspace')
    expect(testText(tree, 'quick-math-answer')).toBe('Enter answer')
  })

  test('a correct answer submits the typed string, scores 20 and advances the question', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)
    const game = createdGames[0]
    const submitAnswer = jest.spyOn(game, 'submitAnswer')

    await press(tree, 'Start game')
    const answered = game.getCurrentQuestion()
    if (!answered) {
      throw new Error('no question after start')
    }
    await typeDigits(tree, String(answered.answer))
    await press(tree, 'Submit answer')

    // The keypad passed exactly the typed string to the model.
    expect(submitAnswer).toHaveBeenCalledTimes(1)
    expect(submitAnswer).toHaveBeenCalledWith(String(answered.answer))

    // The visible projection reflects the model: counters, accuracy,
    // the +20 score and the next question, with the answer display
    // cleared for it.
    expect(testText(tree, 'quick-math-questions')).toBe('Questions 1')
    expect(testText(tree, 'quick-math-correct')).toBe('Correct 1')
    expect(testText(tree, 'quick-math-accuracy')).toBe('Accuracy 100%')
    expect(renderedText(tree)).toContain('Score 20')
    const next = game.getCurrentQuestion()
    expect(next?.id).not.toBe(answered.id)
    expect(testText(tree, 'quick-math-question')).toBe(next?.question)
    expect(testText(tree, 'quick-math-answer')).toBe('Enter answer')
  })

  test('a wrong answer also advances the question and drops accuracy', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)
    const game = createdGames[0]
    const submitAnswer = jest.spyOn(game, 'submitAnswer')

    await press(tree, 'Start game')
    const answered = game.getCurrentQuestion()
    if (!answered) {
      throw new Error('no question after start')
    }
    // A parseably-different wrong answer (Stage-1's wrong-answer path).
    const wrong = String(answered.answer + 1)
    await typeDigits(tree, wrong)
    await press(tree, 'Submit answer')

    expect(submitAnswer).toHaveBeenCalledWith(wrong)
    expect(testText(tree, 'quick-math-questions')).toBe('Questions 1')
    expect(testText(tree, 'quick-math-correct')).toBe('Correct 0')
    expect(testText(tree, 'quick-math-accuracy')).toBe('Accuracy 0%')
    expect(renderedText(tree)).toContain('Score 0')

    // The wrong answer still moves the quiz on: the model's Stage-1
    // state-change fix surfaces the fresh question in the projection.
    const next = game.getCurrentQuestion()
    expect(next?.id).not.toBe(answered.id)
    expect(testText(tree, 'quick-math-question')).toBe(next?.question)
  })
})

describe('Quick Math board — finish and reset', () => {
  test('time-up finish saves once with the OS platform and run gameData, then replays fresh', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await answerCorrect(tree)
    expect(renderedText(tree)).toContain('Score 20')

    // The production end path (the 60s timer's own expiry route).
    await act(async () => {
      await game.end()
    })
    await settle()

    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.QUICK_MATH,
        platform: 'ios',
        gameData: expect.objectContaining({
          correctAnswers: 1,
          wrongAnswers: 0,
        }),
      })
    )
    expect(testText(tree, 'final-score')).toBe('20')
    expect(renderedText(tree)).toContain('Score saved')

    // Time-up locks the keypad.
    expect(hostByLabel(tree, 'Type 1').props.accessibilityState.disabled).toBe(
      true
    )
    expect(
      hostByLabel(tree, 'Submit answer').props.accessibilityState.disabled
    ).toBe(true)

    // Play again starts a fresh run: a new question, zeroed counters
    // and no second save.
    const lastQuestion = game.getCurrentQuestion()
    await press(tree, 'Play again')
    expect(game.getState().isActive).toBe(true)
    expect(game.getCurrentQuestion()?.id).not.toBe(lastQuestion?.id)
    expect(testText(tree, 'quick-math-questions')).toBe('Questions 0')
    expect(testText(tree, 'quick-math-accuracy')).toBe('Accuracy 0%')
    expect(testText(tree, 'quick-math-answer')).toBe('Enter answer')
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a mid-run reset returns to the idle question and zeroed HUD without saving', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await answerCorrect(tree)
    expect(testText(tree, 'quick-math-correct')).toBe('Correct 1')
    // Leave an unsubmitted answer behind: reset must clear it too.
    await typeDigits(tree, '7')

    await press(tree, 'Reset game')
    expect(game.getState().isActive).toBe(false)
    expect(game.getCurrentQuestion()).toBeNull()
    expect(testText(tree, 'quick-math-question')).toBe('Ready?')
    expect(testText(tree, 'quick-math-questions')).toBe('Questions 0')
    expect(testText(tree, 'quick-math-correct')).toBe('Correct 0')
    expect(testText(tree, 'quick-math-accuracy')).toBe('Accuracy 0%')
    expect(testText(tree, 'quick-math-answer')).toBe('Enter answer')
    expect(renderedText(tree)).not.toContain('Run complete')
    expect(submitScore).not.toHaveBeenCalled()

    // The reset board plays normally.
    await press(tree, 'Start game')
    expect(game.getCurrentQuestion()).not.toBeNull()
    await answerCorrect(tree)
    expect(testText(tree, 'quick-math-correct')).toBe('Correct 1')
    expect(renderedText(tree)).toContain('Score 20')
    expect(submitScore).not.toHaveBeenCalled()
  })
})
