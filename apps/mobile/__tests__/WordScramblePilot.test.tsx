import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import { WordScrambleGame } from '@cetus/games/word-scramble/WordScrambleGame'

jest.mock('../src/lib/api', () => mockApiModule)

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    canGoBack: jest.fn(),
  }),
}))

import * as mockApiModule from '../src/test/mockApiModule'
import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES } from '../src/games/registry'
import { WordScrambleBoard } from '../src/games/boards/WordScrambleBoard'
const submitScore = jest.mocked(api.submitScore)

const createdGames: WordScrambleGame[] = []
const originalEntry = NATIVE_GAMES[GameID.WORD_SCRAMBLE]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Word Scramble registry port missing')
  }
  // Production port (view, projector); only the created instance is
  // captured so tests can read and spy on the live model.
  NATIVE_GAMES[GameID.WORD_SCRAMBLE] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = originalPort.createGame(deps) as WordScrambleGame
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.WORD_SCRAMBLE] = originalEntry
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

/** Screen-reader output for the answer slot: like Quick Math, the label
 *  must carry the assembled letters (or the placeholder), not a static
 *  "Answer". */
const answerA11yLabel = (tree: TestRenderer.ReactTestRenderer): string =>
  tree.root.findByProps({ testID: 'word-scramble-answer' }).props
    .accessibilityLabel as string

/** Host-tag tile elements carrying the letter label (jest-expo mocks
 *  keep className/accessibilityState here, onPress on the composite). */
const tileHosts = (
  tree: TestRenderer.ReactTestRenderer,
  label: string
): Array<TestRenderer.ReactTestInstance> =>
  tree.root.findAll(
    node =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label
  )

/** Pressable tile elements carrying the letter label and the handler. */
const tilePressables = (
  tree: TestRenderer.ReactTestRenderer,
  label: string
): Array<TestRenderer.ReactTestInstance> =>
  tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function'
  )

/** Press the first still-free tile showing this letter — repeated
 *  letters are independent tiles, so a used one must be skipped. */
const pressLetter = async (
  tree: TestRenderer.ReactTestRenderer,
  letter: string
) => {
  const label = `Letter ${letter.toUpperCase()}`
  const tile = tilePressables(tree, label).find(
    tile => tile.props.accessibilityState?.disabled !== true
  )
  if (!tile) {
    throw new Error(`no free tile for ${label}`)
  }
  await act(async () => {
    tile.props.onPress()
  })
}

const freeTileCount = (tree: TestRenderer.ReactTestRenderer, letter: string) =>
  tilePressables(tree, `Letter ${letter.toUpperCase()}`).filter(
    tile => tile.props.accessibilityState?.disabled !== true
  ).length

/** Assemble a word on the tray, one letter per free tile, in order. */
const pressWord = async (
  tree: TestRenderer.ReactTestRenderer,
  word: string
) => {
  for (const letter of word) {
    await pressLetter(tree, letter)
  }
}

/** Two different letters of the live challenge's scrambled word, in
 *  tray order — typing-order coverage without depending on a word. */
const twoDistinctLetters = (): [string, string] => {
  const scrambled = createdGames[0].getCurrentChallenge()?.scrambledWord ?? ''
  const second = [...scrambled].find(letter => letter !== scrambled[0])
  if (scrambled.length < 2 || !second) {
    throw new Error(`scrambled word without two distinct letters: ${scrambled}`)
  }
  return [scrambled[0], second]
}

/** Answer the live model's current challenge correctly through the
 *  letter tray (the letters come from the model's own scrambled word —
 *  no duplicated rules), then submit. */
const answerCorrect = async (tree: TestRenderer.ReactTestRenderer) => {
  const game = createdGames[0]
  const word = game.getCurrentChallenge()?.originalWord
  if (!word) {
    throw new Error('no current challenge to answer')
  }
  await pressWord(tree, word)
  await press(tree, 'Submit answer')
  return word
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

/** The fast-answer bonus keys off wall-clock `Date.now` (timeToAnswer
 *  < 3s against the challenge start): CI jitter between steps can drop
 *  the bonus and flip the expected score. Freezing the clock for the
 *  whole test makes every answer instant, so the bonus is deterministic.
 *  Real timers (setTimeout) still run — only Date.now is stubbed. */
const withFrozenClock =
  (run: () => Promise<void>): (() => Promise<void>) =>
  async () => {
    const base = Date.now()
    const clock = jest.spyOn(Date, 'now').mockReturnValue(base)
    try {
      await run()
    } finally {
      clock.mockRestore()
    }
  }

describe('Word Scramble board — render', () => {
  test('renders the idle word, no tiles, a locked control row and zeroed counters', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.WORD_SCRAMBLE} />)

    // Web parity: the word slot reads "READY?" before the first run.
    expect(testText(tree, 'word-scramble-word')).toBe('READY?')
    expect(testText(tree, 'word-scramble-answer')).toBe('Your answer')
    expect(testText(tree, 'word-scramble-words')).toBe('Words 0')
    expect(testText(tree, 'word-scramble-correct')).toBe('Correct 0')

    // No letter tray while idle.
    expect(tilePressables(tree, 'Letter A')).toHaveLength(0)

    for (const label of [
      'Submit answer',
      'Skip word',
      'Undo letter',
      'Clear answer',
    ]) {
      const host = tree.root.findAll(
        node =>
          typeof node.type === 'string' &&
          node.props.accessibilityLabel === label
      )[0]
      expect(host.props.accessibilityState.disabled).toBe(true)
    }
  })

  test('the letter tiles keep accessible 48pt targets and wrap on narrow screens', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.WORD_SCRAMBLE} />)

    await press(tree, 'Start game')
    const scrambled = createdGames[0].getCurrentChallenge()?.scrambledWord
    if (!scrambled) {
      throw new Error('no challenge after start')
    }

    for (const letter of scrambled) {
      const hosts = tileHosts(tree, `Letter ${letter.toUpperCase()}`)
      // Every occurrence of the letter renders its own tile.
      expect(hosts.length).toBe(scrambled.split(letter).length - 1)
      for (const tile of hosts) {
        // h-12 keeps every tile at 48pt tall; min-w-12 keeps it 48pt
        // wide however narrow the letter, and the wrapping tray means
        // long words never squeeze tiles below that.
        expect(String(tile.props.className)).toContain('h-12')
        expect(String(tile.props.className)).toContain('min-w-12')
      }
    }
    const tray = tree.root.findByProps({
      accessibilityLabel: 'Word Scramble letters',
    })
    expect(String(tray.props.className)).toContain('flex-wrap')
  })
})

describe('Word Scramble board — tiles and controls', () => {
  test('tiles type the answer in order, Undo frees the last tile and Clear empties the tray', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.WORD_SCRAMBLE} />)

    await press(tree, 'Start game')
    const [first, second] = twoDistinctLetters()

    await pressLetter(tree, first)
    await pressLetter(tree, second)
    expect(testText(tree, 'word-scramble-answer')).toBe(`${first}${second}`)
    expect(answerA11yLabel(tree)).toBe(`Answer, ${first}${second}`)

    // Undo removes the last letter and frees its tile for reuse.
    await press(tree, 'Undo letter')
    expect(testText(tree, 'word-scramble-answer')).toBe(first)
    await pressLetter(tree, second)
    expect(testText(tree, 'word-scramble-answer')).toBe(`${first}${second}`)

    // Undo down to (and past) empty is a harmless no-op.
    await press(tree, 'Undo letter')
    await press(tree, 'Undo letter')
    await press(tree, 'Undo letter')
    expect(testText(tree, 'word-scramble-answer')).toBe('Your answer')
    expect(answerA11yLabel(tree)).toBe('Answer, Your answer')

    await pressLetter(tree, first)
    await press(tree, 'Clear answer')
    expect(testText(tree, 'word-scramble-answer')).toBe('Your answer')
    expect(freeTileCount(tree, first)).toBeGreaterThan(0)
  })

  test('repeated letters are independent tiles (component-level check)', async () => {
    // The random draw can't be steered toward a repeated-letter word,
    // so the tray itself is rendered with one: "rtetel" (from "letter")
    // carries two T tiles and two E tiles.
    const game = {
      submitAnswer: jest.fn().mockReturnValue(true),
      skipCurrentChallenge: jest.fn(),
    } as unknown as WordScrambleGame
    const tree = await render(
      <WordScrambleBoard
        projected={{
          challengeId: 'challenge-letter',
          scrambledWord: 'rtetel',
          difficulty: 'easy',
          wordsUnscrambled: 0,
          correctAnswers: 0,
          canAnswer: true,
        }}
        game={game}
      />
    )

    // Both T tiles and both E tiles contribute independently.
    await pressLetter(tree, 't')
    await pressLetter(tree, 't')
    await pressLetter(tree, 'e')
    await pressLetter(tree, 'e')
    expect(testText(tree, 'word-scramble-answer')).toBe('ttee')

    // Undo frees exactly one E tile; it can be pressed again.
    await press(tree, 'Undo letter')
    expect(testText(tree, 'word-scramble-answer')).toBe('tte')
    expect(freeTileCount(tree, 'e')).toBe(1)
    await pressLetter(tree, 'e')
    expect(testText(tree, 'word-scramble-answer')).toBe('ttee')
    expect(freeTileCount(tree, 't')).toBe(0)
    expect(freeTileCount(tree, 'e')).toBe(0)
  })
})

describe('Word Scramble board — answers and skip', () => {
  test(
    'a correct answer submits the assembled word, scores 20 and advances the challenge',
    withFrozenClock(async () => {
      const tree = await render(
        <NativeGameHost gameId={GameID.WORD_SCRAMBLE} />
      )
      const game = createdGames[0]
      const submitAnswer = jest.spyOn(game, 'submitAnswer')

      await press(tree, 'Start game')
      const answered = game.getCurrentChallenge()
      if (!answered) {
        throw new Error('no challenge after start')
      }
      await pressWord(tree, answered.originalWord)
      await press(tree, 'Submit answer')

      // The tray passed exactly the assembled string to the model.
      expect(submitAnswer).toHaveBeenCalledTimes(1)
      expect(submitAnswer).toHaveBeenCalledWith(answered.originalWord)

      // The visible projection reflects the model: counters, the easy
      // word's 10 points + fast-answer bonus, and the next challenge
      // with a fresh tray.
      expect(testText(tree, 'word-scramble-words')).toBe('Words 1')
      expect(testText(tree, 'word-scramble-correct')).toBe('Correct 1')
      expect(renderedText(tree)).toContain('Score 20')
      const next = game.getCurrentChallenge()
      expect(next?.id).not.toBe(answered.id)
      expect(testText(tree, 'word-scramble-word')).toBe(
        next?.scrambledWord.toUpperCase()
      )
      expect(testText(tree, 'word-scramble-answer')).toBe('Your answer')
      // The tray is fresh: every tile of the new challenge is free.
      const nextFirst = next?.scrambledWord[0]
      if (!nextFirst) {
        throw new Error('no letters in the next challenge')
      }
      expect(freeTileCount(tree, nextFirst)).toBeGreaterThan(0)
    })
  )

  test('a wrong answer keeps Correct 0 but still advances the challenge', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.WORD_SCRAMBLE} />)
    const game = createdGames[0]
    const submitAnswer = jest.spyOn(game, 'submitAnswer')

    await press(tree, 'Start game')
    const answered = game.getCurrentChallenge()
    if (!answered) {
      throw new Error('no challenge after start')
    }
    // The reversed word: always a different arrangement (no easy word
    // is a palindrome), so always wrong — through the real tiles.
    const wrong = answered.originalWord.split('').reverse().join('')
    await pressWord(tree, wrong)
    await press(tree, 'Submit answer')

    expect(submitAnswer).toHaveBeenCalledWith(wrong)
    expect(testText(tree, 'word-scramble-words')).toBe('Words 1')
    expect(testText(tree, 'word-scramble-correct')).toBe('Correct 0')
    expect(renderedText(tree)).toContain('Score 0')

    // The wrong answer still moves the quiz on: the model's Stage-1
    // state-change fix surfaces the fresh challenge in the projection.
    const next = game.getCurrentChallenge()
    expect(next?.id).not.toBe(answered.id)
    expect(testText(tree, 'word-scramble-word')).toBe(
      next?.scrambledWord.toUpperCase()
    )
    expect(testText(tree, 'word-scramble-answer')).toBe('Your answer')
  })

  test('skip advances without scoring and clears the tray', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.WORD_SCRAMBLE} />)
    const game = createdGames[0]
    const skipCurrentChallenge = jest.spyOn(game, 'skipCurrentChallenge')

    await press(tree, 'Start game')
    const answered = game.getCurrentChallenge()
    if (!answered) {
      throw new Error('no challenge after start')
    }
    // Leave letters on the tray: the skip must clear them too.
    await pressLetter(tree, answered.originalWord[0])

    await press(tree, 'Skip word')

    expect(skipCurrentChallenge).toHaveBeenCalledTimes(1)
    expect(testText(tree, 'word-scramble-words')).toBe('Words 1')
    expect(testText(tree, 'word-scramble-correct')).toBe('Correct 0')
    expect(renderedText(tree)).toContain('Score 0')
    const next = game.getCurrentChallenge()
    expect(next?.id).not.toBe(answered.id)
    expect(testText(tree, 'word-scramble-word')).toBe(
      next?.scrambledWord.toUpperCase()
    )
    expect(testText(tree, 'word-scramble-answer')).toBe('Your answer')
  })
})

describe('Word Scramble board — finish and reset', () => {
  test(
    'time-up finish saves once with the OS platform and run gameData, then replays fresh',
    withFrozenClock(async () => {
      const tree = await render(
        <NativeGameHost gameId={GameID.WORD_SCRAMBLE} />
      )
      const game = createdGames[0]

      await press(tree, 'Start game')
      const word = await answerCorrect(tree)
      expect(renderedText(tree)).toContain('Score 20')

      // The production end path (the 60s timer's own expiry route).
      await act(async () => {
        await game.end()
      })
      await settle()

      expect(submitScore).toHaveBeenCalledTimes(1)
      expect(submitScore).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: GameID.WORD_SCRAMBLE,
          platform: 'ios',
          gameData: expect.objectContaining({
            correctWords: [word],
            totalWordsScrambled: 1,
          }),
        })
      )
      expect(testText(tree, 'final-score')).toBe('20')
      expect(renderedText(tree)).toContain('Score saved')

      // Time-up locks the controls.
      expect(
        tree.root.findAll(
          node =>
            typeof node.type === 'string' &&
            node.props.accessibilityLabel === 'Submit answer'
        )[0].props.accessibilityState.disabled
      ).toBe(true)
      expect(
        tree.root.findAll(
          node =>
            typeof node.type === 'string' &&
            node.props.accessibilityLabel === 'Skip word'
        )[0].props.accessibilityState.disabled
      ).toBe(true)

      // Play again starts a fresh run: a new challenge, zeroed counters
      // and no second save.
      const lastChallenge = game.getCurrentChallenge()
      await press(tree, 'Play again')
      expect(game.getState().isActive).toBe(true)
      expect(game.getCurrentChallenge()?.id).not.toBe(lastChallenge?.id)
      expect(testText(tree, 'word-scramble-words')).toBe('Words 0')
      expect(testText(tree, 'word-scramble-correct')).toBe('Correct 0')
      expect(testText(tree, 'word-scramble-answer')).toBe('Your answer')
      expect(submitScore).toHaveBeenCalledTimes(1)
    })
  )

  test(
    'a mid-run reset returns to READY? and zeroed counters without saving',
    withFrozenClock(async () => {
      const tree = await render(
        <NativeGameHost gameId={GameID.WORD_SCRAMBLE} />
      )
      const game = createdGames[0]

      await press(tree, 'Start game')
      await answerCorrect(tree)
      expect(testText(tree, 'word-scramble-correct')).toBe('Correct 1')
      // Leave letters on the tray: reset must clear them too.
      await pressLetter(tree, game.getCurrentChallenge()?.originalWord[0] ?? '')

      await press(tree, 'Reset game')
      expect(game.getState().isActive).toBe(false)
      expect(game.getCurrentChallenge()).toBeNull()
      expect(testText(tree, 'word-scramble-word')).toBe('READY?')
      expect(testText(tree, 'word-scramble-words')).toBe('Words 0')
      expect(testText(tree, 'word-scramble-correct')).toBe('Correct 0')
      expect(testText(tree, 'word-scramble-answer')).toBe('Your answer')
      expect(renderedText(tree)).not.toContain('Run complete')
      expect(submitScore).not.toHaveBeenCalled()

      // The reset board plays normally.
      await press(tree, 'Start game')
      expect(game.getCurrentChallenge()).not.toBeNull()
      await answerCorrect(tree)
      expect(testText(tree, 'word-scramble-correct')).toBe('Correct 1')
      expect(renderedText(tree)).toContain('Score 20')
      expect(submitScore).not.toHaveBeenCalled()
    })
  )
})
