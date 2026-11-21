import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import { GameID } from '@cetus/shared/games'
import type { ScoreSubmissionResult } from '@cetus/shared/scores'
import {
  AchievementRarity,
  type AchievementNotification,
} from '@cetus/shared/achievements'
import { SatelliteSyncGame } from '@cetus/games/satellite-sync/game'
import { polarToWorld, ringRadius } from '@cetus/games/satellite-sync/geometry'
import { SATELLITE_SYNC_LEVELS } from '@cetus/games/satellite-sync/levels'

jest.mock('../src/lib/api', () => mockApiModule)

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    canGoBack: jest.fn(),
  }),
}))

jest.mock('@shopify/react-native-skia', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react')
  const { View: MockView } =
    jest.requireActual<typeof import('react-native')>('react-native')
  const shape = (name: string) => (props: Record<string, unknown>) =>
    mockReact.createElement(
      MockView,
      { ...props, testID: `skia-${name}` },
      props.children as React.ReactNode
    )
  return {
    Canvas: (props: { children?: React.ReactNode; style?: unknown }) =>
      mockReact.createElement(
        MockView,
        { testID: 'skia-Canvas' },
        props.children
      ),
    Group: shape('Group'),
    Rect: shape('Rect'),
    Circle: shape('Circle'),
    Path: shape('Path'),
  }
})

import * as mockApiModule from '../src/test/mockApiModule'
import { api, createScoreSubmitter } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { SatelliteSyncBoard } from '../src/games/boards/SatelliteSyncBoard'
import type { SatelliteSyncController } from '../src/games/satellite-sync/controller'

const submitScore = jest.mocked(api.submitScore)
const mockCreateScoreSubmitter = jest.mocked(createScoreSubmitter)

const ACHIEVEMENT: AchievementNotification = {
  id: 'ach-satellite',
  name: 'Orbit Master',
  description: 'Lock every target',
  icon: '🛰️',
  rarity: AchievementRarity.RARE,
}

// Same scene fit as the board: 360px logical, widest authored ring set.
const SCENE_SIZE = 360
const CENTER = SCENE_SIZE / 2
const SCENE_RINGS = Math.max(...SATELLITE_SYNC_LEVELS.map(level => level.rings))
const SCENE_SCALE = (SCENE_SIZE * 0.42) / ringRadius(SCENE_RINGS - 1)
const LEVEL_COUNT = SATELLITE_SYNC_LEVELS.length

const scenePoint = (ring: number, angle: number) => {
  const world = polarToWorld(ring, angle)
  return {
    x: CENTER + world.x * SCENE_SCALE,
    y: CENTER + world.y * SCENE_SCALE,
  }
}

let rafQueue: Array<{ id: number; cb: (time: number) => void }> = []
let nextRafId = 1

const fireFrame = (time: number) => {
  const entry = rafQueue.shift()
  if (!entry) {
    throw new Error('no frame scheduled')
  }
  act(() => {
    entry.cb(time)
  })
}

const trees: Array<TestRenderer.ReactTestRenderer> = []

const drain = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 25))
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
  trees.push(tree)
  return tree
}

const unmount = async (tree: TestRenderer.ReactTestRenderer) => {
  const index = trees.indexOf(tree)
  if (index >= 0) {
    trees.splice(index, 1)
  }
  await act(async () => {
    tree.unmount()
  })
}

const press = async (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const button = tree.root.findByProps({ accessibilityLabel: label })
  await act(async () => {
    button.props.onPress()
  })
  await drain()
}

/** Press the first control whose accessibility label matches a prefix. */
const pressMatching = async (
  tree: TestRenderer.ReactTestRenderer,
  pattern: RegExp
) => {
  const button = tree.root.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      pattern.test(node.props.accessibilityLabel)
  )[0]
  if (!button) {
    throw new Error(`no control matching ${pattern}`)
  }
  await act(async () => {
    button.props.onPress()
  })
  await drain()
}

const fireLayout = (tree: TestRenderer.ReactTestRenderer) => {
  const layoutHost = tree.root
    .findAll(node => typeof node.type === 'string')
    .find(node => typeof node.props.onLayout === 'function')
  if (!layoutHost) {
    throw new Error('no onLayout host found')
  }
  act(() => {
    layoutHost.props.onLayout({
      nativeEvent: {
        layout: { x: 0, y: 0, width: SCENE_SIZE, height: SCENE_SIZE },
      },
    })
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
): string => {
  const nodes = tree.root.findAllByProps({ testID })
  const node = nodes[nodes.length - 1]
  return scalarText(node.props.children as React.ReactNode)
}

const controllerOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findByType(SatelliteSyncBoard).props
    .binding as SatelliteSyncController

type PanEvent = { x?: number; y?: number }
type PanHandler = (event: PanEvent, success?: boolean) => void

const panHandlers = (tree: TestRenderer.ReactTestRenderer) => {
  const detector = tree.root.findByType(GestureDetector)
  return detector.props.gesture.handlers as Record<string, PanHandler>
}

const firePan = (
  tree: TestRenderer.ReactTestRenderer,
  handler: 'onBegin' | 'onStart' | 'onUpdate' | 'onFinalize',
  point?: PanEvent,
  success?: boolean
) => {
  const handlers = panHandlers(tree)
  const callback = handlers[handler]
  if (typeof callback !== 'function') {
    throw new Error(`pan gesture is missing ${handler}`)
  }
  act(() => {
    // RNGH passes the terminal success flag to onFinalize (true = END,
    // false = FAILED/CANCELLED); the other callbacks ignore it.
    callback(point ?? {}, success)
  })
}

/** A real RNGH pan lifecycle: begin (read-only) → activate → aim → finish. */
const dragSatelliteToTarget = (
  tree: TestRenderer.ReactTestRenderer,
  satelliteId: string,
  targetId: string,
  success = true
) => {
  const game = controllerOf(tree).getGame()
  if (!game) {
    throw new Error('no live Satellite Sync model')
  }
  const state = game.getState()
  const satellite = state.satellites.find(entry => entry.id === satelliteId)
  const target = state.targets.find(entry => entry.id === targetId)
  if (!satellite || !target) {
    throw new Error(`missing satellite ${satelliteId} or target ${targetId}`)
  }
  firePan(tree, 'onBegin', scenePoint(satellite.ring, satellite.angle))
  firePan(tree, 'onStart')
  firePan(tree, 'onUpdate', scenePoint(target.ring, target.currentAngle))
  firePan(tree, 'onFinalize', undefined, success)
}

/** Same level solve the portable model suite uses: try free satellites. */
const solveCurrentLevel = (game: SatelliteSyncGame) => {
  game.update(0)
  const isLocked = (targetId: string): boolean =>
    game
      .getState()
      .targets.some(target => target.id === targetId && target.locked)
  const targetIds = game.getState().targets.map(target => target.id)
  for (const targetId of targetIds) {
    if (isLocked(targetId)) {
      continue
    }
    for (const satellite of game.getState().satellites) {
      if (satellite.lockedTargetId) {
        continue
      }
      game.beginAim(satellite.id)
      game.aimAtTarget(satellite.id, targetId)
      game.endAim(satellite.id)
      if (isLocked(targetId)) {
        break
      }
    }
  }
}

const solveRun = (controller: SatelliteSyncController) => {
  const game = controller.getGame()
  if (!game) {
    throw new Error('no live Satellite Sync model')
  }
  for (let level = 0; level < LEVEL_COUNT; level++) {
    solveCurrentLevel(game)
  }
}

beforeEach(() => {
  rafQueue = []
  nextRafId = 1
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(cb => {
    const id = nextRafId++
    rafQueue.push({ id, cb })
    return id
  })
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => {
    rafQueue = rafQueue.filter(entry => entry.id !== id)
  })
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  mockCreateScoreSubmitter.mockReset()
  mockCreateScoreSubmitter.mockResolvedValue(async data =>
    api.submitScore(data)
  )
  mockPush.mockReset()
})

afterEach(async () => {
  for (const tree of trees.splice(0)) {
    await act(async () => {
      tree.unmount()
    })
  }
  jest.restoreAllMocks()
})

describe('Satellite Sync pilot — idle, start and frame loop', () => {
  test('idle waits for Start with no Pause/Stop and saves nothing', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)

    expect(controllerOf(tree).getGame()).toBeNull()
    expect(controllerOf(tree).getScene()).toBeNull()
    expect(testText(tree, 'ss-level')).toBe(`Level 1 / ${LEVEL_COUNT}`)
    expect(testText(tree, 'ss-targets')).toBe('Targets –')
    expect(testText(tree, 'ss-combo')).toBe('Combo ×1')
    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(
      tree.root
        .findAllByProps({ testID: 'satellite-board' })
        .some(
          node =>
            node.props.accessibilityLabel ===
            'Satellite Sync board: waiting to start'
        )
    ).toBe(true)
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Pause game' })
    ).toHaveLength(0)
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Stop run' })
    ).toHaveLength(0)

    // The mount loop queued one inert frame; it sleeps after rendering.
    expect(rafQueue).toHaveLength(1)
    fireFrame(100)
    expect(rafQueue).toHaveLength(0)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('Start builds the model, renders level 1 and keeps exactly one loop', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')

    const controller = controllerOf(tree)
    const game = controller.getGame() as SatelliteSyncGame
    const state = game.getState()
    expect(state.status).toBe('playing')
    expect(state.levelIndex).toBe(0)
    expect(state.targets).toHaveLength(3)
    expect(controller.getScene()?.targets).toHaveLength(3)
    expect(testText(tree, 'ss-level')).toBe(`Level 1 / ${LEVEL_COUNT}`)
    // The board copies the scene on the first loop frame after Start.
    expect(rafQueue).toHaveLength(1)
    fireFrame(100)
    expect(testText(tree, 'ss-targets')).toBe('Targets 0 / 3')
    expect(rafQueue).toHaveLength(1)
    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Stop run' })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Pause game' })
    ).toHaveLength(0)

    fireFrame(116)
    expect(rafQueue).toHaveLength(1)
    expect(submitScore).not.toHaveBeenCalled()
  })
})

describe('Satellite Sync pilot — aiming', () => {
  test('pan grab → aim → release locks a matching target and scores', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireLayout(tree)
    fireFrame(100)

    const scroll = tree.root.findByProps({
      handlerType: 'NativeViewGestureHandler',
    })
    const detector = tree.root.findByType(GestureDetector)
    expect(detector.props.gesture.config.blocksHandlers).toContain(
      scroll.props.handlerTag
    )

    const controller = controllerOf(tree)
    const game = controller.getGame() as SatelliteSyncGame
    const getStateSpy = jest.spyOn(game, 'getState')
    expect(controller.getStatus()).toBe('playing')
    expect(controller.isRunning()).toBe(true)
    expect(getStateSpy).not.toHaveBeenCalled()
    getStateSpy.mockRestore()
    const satellite = game.getState().satellites[0]
    const target = game.getState().targets[0]

    firePan(tree, 'onBegin', scenePoint(satellite.ring, satellite.angle))
    firePan(tree, 'onStart')
    firePan(tree, 'onUpdate', scenePoint(target.ring, target.currentAngle))
    expect(game.getState().satellites[0].snapCandidateId).toBe(target.id)
    firePan(tree, 'onFinalize', undefined, true)

    expect(game.getState().targets[0].locked).toBe(true)
    expect(game.getState().score).toBe(100)
    expect(renderedText(tree)).toContain('Score 100')
    expect(testText(tree, 'ss-targets')).toBe('Targets 1 / 3')
    expect(testText(tree, 'ss-combo')).toBe('Combo ×1')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a grab that misses every satellite does nothing', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireLayout(tree)
    fireFrame(100)

    const game = controllerOf(tree).getGame() as SatelliteSyncGame
    firePan(tree, 'onBegin', { x: 2, y: 2 })
    firePan(tree, 'onStart')
    firePan(tree, 'onUpdate', scenePoint(1, 60))
    firePan(tree, 'onFinalize', undefined, true)

    expect(game.getState().targets[0].locked).toBe(false)
    expect(game.getState().score).toBe(0)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a pan that never activates is read-only and preserves an existing lock and score', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireLayout(tree)
    fireFrame(100)

    const game = controllerOf(tree).getGame() as SatelliteSyncGame
    dragSatelliteToTarget(tree, 'sat-0', 'target-0')
    expect(game.getState().targets[0].locked).toBe(true)
    const scoreBefore = game.getState().score

    // Touch down on the locked satellite, then the pan fails to activate
    // (e.g. the surrounding ScrollView takes the gesture).
    const satellite = game.getState().satellites[0]
    firePan(tree, 'onBegin', scenePoint(satellite.ring, satellite.angle))
    firePan(tree, 'onFinalize', undefined, false)

    const after = game.getState()
    expect(after.targets[0].locked).toBe(true)
    expect(after.satellites[0].lockedTargetId).toBe('target-0')
    expect(after.score).toBe(scoreBefore)
    expect(submitScore).not.toHaveBeenCalled()

    // The cleared drag reference does not block the next successful drag.
    dragSatelliteToTarget(tree, 'sat-1', 'target-1')
    expect(game.getState().targets[1].locked).toBe(true)
    expect(game.getState().score).toBeGreaterThan(scoreBefore)
  })

  test('a cancelled active drag restores the previous lock, aim and score', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireLayout(tree)
    fireFrame(100)

    const game = controllerOf(tree).getGame() as SatelliteSyncGame
    dragSatelliteToTarget(tree, 'sat-0', 'target-0')
    const before = game.getState()
    expect(before.targets[0].locked).toBe(true)

    const satellite = before.satellites[0]
    const nextTarget = before.targets[1]
    firePan(tree, 'onBegin', scenePoint(satellite.ring, satellite.angle))
    firePan(tree, 'onStart')
    firePan(
      tree,
      'onUpdate',
      scenePoint(nextTarget.ring, nextTarget.currentAngle)
    )
    // Once active, the drag re-aims (and thus unlocks) the satellite …
    expect(game.getState().satellites[0].snapCandidateId).toBe(nextTarget.id)
    expect(game.getState().targets[0].locked).toBe(false)

    // … but a cancelled gesture restores the pre-drag state without scoring.
    firePan(tree, 'onFinalize', undefined, false)

    const after = game.getState()
    expect(after.targets[0].locked).toBe(true)
    expect(after.targets[0].lockedBySatId).toBe('sat-0')
    expect(after.targets[1].locked).toBe(false)
    expect(after.satellites[0].lockedTargetId).toBe('target-0')
    expect(after.satellites[0].snapCandidateId).toBeNull()
    expect(after.satellites[0].aimAngle).toBeCloseTo(
      before.satellites[0].aimAngle,
      6
    )
    expect(after.score).toBe(before.score)
    expect(after.combo).toBe(before.combo)
    expect(after.multiplier).toBe(before.multiplier)
    expect(submitScore).not.toHaveBeenCalled()

    // A later successful drag still re-aims and scores once.
    dragSatelliteToTarget(tree, 'sat-0', 'target-1')
    const reaimed = game.getState()
    expect(reaimed.targets[0].locked).toBe(false)
    expect(reaimed.targets[1].locked).toBe(true)
    expect(reaimed.score).toBeGreaterThan(before.score)
  })

  test('a stale cancelled drag cannot roll back a fresh run after Stop and Replay', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireLayout(tree)
    fireFrame(100)

    const controller = controllerOf(tree)
    const firstGame = controller.getGame() as SatelliteSyncGame
    dragSatelliteToTarget(tree, 'sat-0', 'target-0')
    expect(firstGame.getState().targets[0].locked).toBe(true)

    // Leave an active drag open on the now-locked satellite: its snapshot
    // expects the old run's target-0 lock to be restored.
    const satellite = firstGame.getState().satellites[0]
    const nextTarget = firstGame.getState().targets[1]
    firePan(tree, 'onBegin', scenePoint(satellite.ring, satellite.angle))
    firePan(tree, 'onStart')
    firePan(
      tree,
      'onUpdate',
      scenePoint(nextTarget.ring, nextTarget.currentAngle)
    )
    expect(firstGame.getState().targets[0].locked).toBe(false)

    await press(tree, 'Stop run')
    expect(controller.getGame()).toBeNull()
    await press(tree, 'Start game')
    const secondGame = controller.getGame() as SatelliteSyncGame
    expect(secondGame).not.toBe(firstGame)

    // The outstanding RNGH finalize arrives after the lifecycle change.
    firePan(tree, 'onFinalize', undefined, false)

    const state = secondGame.getState()
    expect(state.status).toBe('playing')
    expect(state.targets.every(target => !target.locked)).toBe(true)
    expect(
      state.satellites.every(satellite => satellite.lockedTargetId === null)
    ).toBe(true)
    expect(state.score).toBe(0)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a stale cancelled drag cannot inject a lock into the next level', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireLayout(tree)
    fireFrame(100)

    const controller = controllerOf(tree)
    const game = controller.getGame() as SatelliteSyncGame
    dragSatelliteToTarget(tree, 'sat-0', 'target-0')
    expect(game.getState().targets[0].locked).toBe(true)

    // Open a drag on the locked satellite: beginAim unlocks target-0 and
    // the snapshot now expects to restore that lock.
    const satellite = game.getState().satellites[0]
    const nextTarget = game.getState().targets[1]
    firePan(tree, 'onBegin', scenePoint(satellite.ring, satellite.angle))
    firePan(tree, 'onStart')
    firePan(
      tree,
      'onUpdate',
      scenePoint(nextTarget.ring, nextTarget.currentAngle)
    )
    expect(game.getState().targets[0].locked).toBe(false)

    // Clear level 1, then flush the deferred entity swap before the board
    // resyncs, so the drag refs are still armed when the cancel arrives.
    act(() => {
      solveCurrentLevel(game)
    })
    await drain()
    act(() => {
      controller.update(0)
    })
    const replaced = game.getState()
    expect(replaced.levelIndex).toBe(1)
    const scoreBefore = replaced.score

    firePan(tree, 'onFinalize', undefined, false)

    const after = game.getState()
    expect(after.targets.every(target => !target.locked)).toBe(true)
    expect(
      after.satellites.every(satellite => satellite.lockedTargetId === null)
    ).toBe(true)
    expect(after.score).toBe(scoreBefore)
    expect(testText(tree, 'ss-level')).toBe(`Level 2 / ${LEVEL_COUNT}`)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a stale drag update after a level swap cannot aim or lock replacement entities', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireLayout(tree)
    fireFrame(100)

    const controller = controllerOf(tree)
    const game = controller.getGame() as SatelliteSyncGame
    dragSatelliteToTarget(tree, 'sat-0', 'target-0')

    const satellite = game.getState().satellites[0]
    const nextTarget = game.getState().targets[1]
    firePan(tree, 'onBegin', scenePoint(satellite.ring, satellite.angle))
    firePan(tree, 'onStart')
    firePan(
      tree,
      'onUpdate',
      scenePoint(nextTarget.ring, nextTarget.currentAngle)
    )

    // Clear level 1 and flush the deferred swap before the board resyncs.
    act(() => {
      solveCurrentLevel(game)
    })
    await drain()
    act(() => {
      controller.update(0)
    })
    const replaced = game.getState()
    expect(replaced.levelIndex).toBe(1)
    const scoreBefore = replaced.score
    const aimBefore = replaced.satellites[0].aimAngle
    const levelTwoTarget = replaced.targets[0]
    expect(levelTwoTarget.color).toBe('cyan')

    // Stale RNGH events arrive before the board's next sync; neither may
    // touch the replacement entities even though they complete "successfully".
    firePan(
      tree,
      'onUpdate',
      scenePoint(levelTwoTarget.ring, levelTwoTarget.currentAngle)
    )
    firePan(tree, 'onFinalize', undefined, true)

    const after = game.getState()
    expect(after.satellites[0].aimAngle).toBe(aimBefore)
    expect(after.satellites[0].snapCandidateId).toBeNull()
    expect(after.targets.every(target => !target.locked)).toBe(true)
    expect(after.score).toBe(scoreBefore)

    fireFrame(132)
    expect(testText(tree, 'ss-level')).toBe(`Level 2 / ${LEVEL_COUNT}`)
    expect(testText(tree, 'ss-targets')).toBe('Targets 0 / 3')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a target claimed by another satellite during a drag is never double-owned on cancel', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireLayout(tree)
    fireFrame(100)

    const game = controllerOf(tree).getGame() as SatelliteSyncGame
    dragSatelliteToTarget(tree, 'sat-0', 'target-0')
    expect(game.getState().targets[0].lockedBySatId).toBe('sat-0')

    // Arm the accessible flow with satellite 2 (also cyan on level 1).
    await pressMatching(tree, /^Select satellite 2: cyan$/)

    // Open a drag on satellite 1, which temporarily unlocks target 1.
    const satellite = game.getState().satellites[0]
    const nextTarget = game.getState().targets[1]
    firePan(tree, 'onBegin', scenePoint(satellite.ring, satellite.angle))
    firePan(tree, 'onStart')
    firePan(
      tree,
      'onUpdate',
      scenePoint(nextTarget.ring, nextTarget.currentAngle)
    )
    expect(game.getState().targets[0].locked).toBe(false)

    // The accessible action claims target 1 while the drag is still open.
    await pressMatching(tree, /^Lock target 1: cyan, unlocked$/)
    expect(game.getState().targets[0].lockedBySatId).toBe('sat-1')
    const scoreBefore = game.getState().score

    // Further drag movement is cut off early, clearing the snap candidate
    // and restoring the abandoned beam angle; a subsequent cancel stays a
    // no-op instead of stealing target 1 back.
    firePan(
      tree,
      'onUpdate',
      scenePoint(nextTarget.ring, nextTarget.currentAngle)
    )
    firePan(tree, 'onFinalize', undefined, false)

    const after = game.getState()
    expect(after.targets[0].lockedBySatId).toBe('sat-1')
    expect(after.satellites[0].lockedTargetId).toBeNull()
    expect(after.satellites[0].snapCandidateId).toBeNull()
    expect(after.satellites[1].lockedTargetId).toBe('target-0')
    expect(
      after.satellites.filter(
        satellite => satellite.lockedTargetId === 'target-0'
      )
    ).toHaveLength(1)
    expect(after.score).toBe(scoreBefore)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a drag cut off early by a new begin restores the previous lock, combo, beam angle and snap ring', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireLayout(tree)
    fireFrame(100)

    const game = controllerOf(tree).getGame() as SatelliteSyncGame
    dragSatelliteToTarget(tree, 'sat-0', 'target-0')
    const before = game.getState()
    expect(before.targets[0].locked).toBe(true)
    expect(before.combo).toBe(1)

    const satellite = before.satellites[0]
    const nextTarget = before.targets[1]
    firePan(tree, 'onBegin', scenePoint(satellite.ring, satellite.angle))
    firePan(tree, 'onStart')
    firePan(
      tree,
      'onUpdate',
      scenePoint(nextTarget.ring, nextTarget.currentAngle)
    )
    expect(game.getState().satellites[0].snapCandidateId).toBe(nextTarget.id)
    expect(game.getState().targets[0].locked).toBe(false)

    // Cut the drag off early without a matching finalize.
    firePan(tree, 'onBegin', { x: 2, y: 2 })

    const after = game.getState()
    expect(after.targets[0].locked).toBe(true)
    expect(after.targets[0].lockedBySatId).toBe('sat-0')
    expect(after.satellites[0].lockedTargetId).toBe('target-0')
    expect(after.satellites[0].snapCandidateId).toBeNull()
    expect(after.satellites[0].aimAngle).toBeCloseTo(
      before.satellites[0].aimAngle,
      6
    )
    expect(after.combo).toBe(before.combo)
    expect(after.multiplier).toBe(before.multiplier)
  })
})

describe('Satellite Sync pilot — level progression', () => {
  test('a clear publishes the next level but swaps entities only on the next frame', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireFrame(100)

    const controller = controllerOf(tree)
    const game = controller.getGame() as SatelliteSyncGame
    act(() => {
      solveCurrentLevel(game)
    })
    await drain()

    expect(game.getState().levelIndex).toBe(1)
    expect(testText(tree, 'ss-level')).toBe(`Level 2 / ${LEVEL_COUNT}`)
    // The deferred pending-level swap: metadata advanced, entities did not.
    expect(controller.getScene()?.targets.map(target => target.color)).toEqual([
      'cyan',
      'cyan',
      'cyan',
    ])

    fireFrame(116)
    expect(game.getState().targets.map(target => target.color)).toEqual([
      'cyan',
      'magenta',
      'yellow',
    ])
    expect(testText(tree, 'ss-targets')).toBe('Targets 0 / 3')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a 16 ms frame advances a moving target by 0.288° and a long frame caps at 0.1 s', async () => {
    const updateSpy = jest.spyOn(SatelliteSyncGame.prototype, 'update')
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireFrame(100)

    const controller = controllerOf(tree)
    const game = controller.getGame() as SatelliteSyncGame
    act(() => {
      // Clear levels 1–4 so level 5 (Orbit Drift) with moving targets is live.
      for (let level = 0; level < 4; level++) {
        solveCurrentLevel(game)
      }
    })
    await drain()
    expect(game.getState().levelIndex).toBe(4)

    // This frame flushes the deferred level-5 entity swap and steps 16 ms.
    fireFrame(116)
    expect(updateSpy.mock.calls.at(-1)?.[0]).toBeCloseTo(16, 6)
    const afterFirst = game.getState().targets[0].currentAngle
    expect(afterFirst).toBeCloseTo(18 * 0.016, 6)
    expect(testText(tree, 'ss-level')).toBe(`Level 5 / ${LEVEL_COUNT}`)

    fireFrame(132)
    const afterSecond = game.getState().targets[0].currentAngle
    expect(afterSecond - afterFirst).toBeCloseTo(18 * 0.016, 6)

    // A 1.9 s wall gap steps no more than the 0.1 s cap.
    fireFrame(2000)
    const afterCapped = game.getState().targets[0].currentAngle
    expect(afterCapped - afterSecond).toBeCloseTo(18 * 0.1, 6)

    fireFrame(2160)
    const scene = controller.getScene()
    expect(scene?.targets[0].currentAngle).toBeCloseTo(
      afterCapped + 18 * 0.1,
      6
    )
    expect(submitScore).not.toHaveBeenCalled()
  })
})

describe('Satellite Sync pilot — score contract', () => {
  test('a timer loss saves once with getGameData and labels Time’s up', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(
      <NativeGameHost gameId={GameID.SATELLITE_SYNC} settledUserId="user-1" />
    )
    expect(mockCreateScoreSubmitter).toHaveBeenCalledWith('user-1')
    await press(tree, 'Start game')

    const game = controllerOf(tree).getGame() as SatelliteSyncGame
    act(() => {
      const timeout = game as unknown as { handleTimeout: () => void }
      timeout.handleTimeout()
    })
    await drain()

    const data = game.getGameData()
    expect(data).toEqual({
      levelsCleared: 0,
      maxCombo: 0,
      totalLocks: 0,
      solved: false,
      // This test calls the model's timeout handler directly, so no 1s tick
      // has lowered timeRemaining yet; the real countdown is covered by the
      // portable model suite.
      minTimeRemainingRatio: 1,
    })
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith({
      gameId: GameID.SATELLITE_SYNC,
      score: 0,
      platform: 'ios',
      gameData: data,
    })
    expect(testText(tree, 'result-save-status')).toBe('Saving score…')
    expect(testText(tree, 'result-outcome')).toBe("Time's up")

    await act(async () => {
      releaseSave?.({ success: true, newAchievements: [ACHIEVEMENT] })
    })
    await drain()

    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(testText(tree, 'result-outcome')).toBe("Time's up")
    expect(renderedText(tree).match(/Orbit Master/g)).toHaveLength(1)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a full win saves once with the solved game data and labels Mission complete', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    const controller = controllerOf(tree)
    const game = controller.getGame() as SatelliteSyncGame

    act(() => {
      solveRun(controller)
    })
    await drain()

    const data = game.getGameData()
    expect(data).toEqual({
      levelsCleared: LEVEL_COUNT,
      maxCombo: expect.any(Number),
      totalLocks: expect.any(Number),
      solved: true,
      minTimeRemainingRatio: expect.any(Number),
    })
    expect(data.maxCombo).toBeGreaterThan(1)
    expect(data.totalLocks).toBeGreaterThan(0)
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith({
      gameId: GameID.SATELLITE_SYNC,
      score: game.getState().score,
      platform: 'ios',
      gameData: data,
    })
    expect(testText(tree, 'result-outcome')).toBe('Mission complete')

    await act(async () => {
      releaseSave?.({ success: true })
    })
    await drain()
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})

describe('Satellite Sync pilot — accessible aiming', () => {
  test('satellite controls describe every satellite and target actions stay disabled until one is selected', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireFrame(100)

    for (let index = 0; index < 3; index++) {
      const satellite = tree.root.findByProps({
        accessibilityLabel: `Select satellite ${index + 1}: cyan`,
      })
      expect(satellite.props.accessibilityState?.disabled).toBe(false)
      expect(satellite.props.accessibilityState?.selected).toBe(false)
    }
    for (let index = 0; index < 3; index++) {
      const target = tree.root.findByProps({
        accessibilityLabel: `Lock target ${index + 1}: cyan, unlocked`,
      })
      expect(target.props.disabled).toBe(true)
      expect(target.props.accessibilityState?.disabled).toBe(true)
      expect(target.props.accessibilityHint).toBe('Select a satellite first')
    }

    await pressMatching(tree, /^Select satellite 1: cyan$/)

    for (let index = 0; index < 3; index++) {
      const target = tree.root.findByProps({
        accessibilityLabel: `Lock target ${index + 1}: cyan, unlocked`,
      })
      expect(target.props.disabled).toBe(false)
      expect(target.props.accessibilityState?.disabled).toBe(false)
    }
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Select satellite 1: cyan' })
        .props.accessibilityState?.selected
    ).toBe(true)
  })

  test('a same-level Replay clears the previous run’s selection', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireLayout(tree)
    fireFrame(100)
    await pressMatching(tree, /^Select satellite 1: cyan$/)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Select satellite 1: cyan' })
        .props.accessibilityState?.selected
    ).toBe(true)

    // A level-1 timeout ends the run with the level index unchanged, so a
    // Replay starts a new model on the same level.
    act(() => {
      const timeout = controllerOf(tree).getGame() as unknown as {
        handleTimeout: () => void
      }
      timeout.handleTimeout()
    })
    await drain()
    await press(tree, 'Play again')
    fireFrame(200)

    expect(
      tree.root.findByProps({ accessibilityLabel: 'Select satellite 1: cyan' })
        .props.accessibilityState?.selected
    ).toBe(false)
    const target = tree.root.findByProps({
      accessibilityLabel: 'Lock target 1: cyan, unlocked',
    })
    expect(target.props.disabled).toBe(true)
    expect(target.props.accessibilityHint).toBe('Select a satellite first')
    expect(tree.root.findAllByProps({ testID: 'ss-aim-status' })).toHaveLength(
      0
    )
  })

  test('the lock that clears a level does not leave stale lock copy behind', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireLayout(tree)
    fireFrame(100)
    const controller = controllerOf(tree)
    const game = controller.getGame() as SatelliteSyncGame

    // Clear level 1 through the board's screen-reader controls: two locks
    // set the status copy, and the third lock completes the level.
    for (const index of [1, 2, 3]) {
      await pressMatching(tree, new RegExp(`^Select satellite ${index}: cyan$`))
      await pressMatching(
        tree,
        new RegExp(`^Lock target ${index}: cyan, unlocked$`)
      )
    }
    await drain()

    expect(game.getState().levelIndex).toBe(1)
    expect(testText(tree, 'ss-level')).toBe(`Level 2 / ${LEVEL_COUNT}`)
    // The cleared level's "Target N locked" copy must not describe the new
    // level's untouched targets.
    expect(tree.root.findAllByProps({ testID: 'ss-aim-status' })).toHaveLength(
      0
    )

    // Flush the deferred entity swap; the cleared copy stays gone.
    act(() => {
      controller.update(0)
    })
    await drain()
    expect(game.getState().levelIndex).toBe(1)
    expect(tree.root.findAllByProps({ testID: 'ss-aim-status' })).toHaveLength(
      0
    )
  })

  test('selecting a satellite then a target locks it through the model and announces the result', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireFrame(100)

    await pressMatching(tree, /^Select satellite 1: cyan$/)
    await pressMatching(tree, /^Lock target 1: cyan, unlocked$/)

    const game = controllerOf(tree).getGame() as SatelliteSyncGame
    expect(game.getState().targets[0].locked).toBe(true)
    expect(game.getState().score).toBe(100)
    expect(testText(tree, 'ss-aim-status')).toBe(
      'Target 1 locked by satellite 1.'
    )

    const lockedTarget = tree.root
      .findAll(
        node =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith('Lock target 1: cyan')
      )
      .at(-1)
    expect(lockedTarget?.props.accessibilityLabel).toBe(
      'Lock target 1: cyan, locked by satellite 1'
    )
    expect(lockedTarget?.props.accessibilityState?.disabled).toBe(true)
    const satelliteAfterLock = tree.root
      .findAll(
        node =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith('Select satellite 1: cyan')
      )
      .at(-1)
    expect(satelliteAfterLock?.props.accessibilityLabel).toBe(
      'Select satellite 1: cyan, locked to target 1'
    )
    expect(satelliteAfterLock?.props.accessibilityState?.selected).toBe(false)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a failed accessible lock attempt keeps the previous lock and score', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireFrame(100)

    await pressMatching(tree, /^Select satellite 1: cyan$/)
    await pressMatching(tree, /^Lock target 1: cyan, unlocked$/)
    const game = controllerOf(tree).getGame() as SatelliteSyncGame
    expect(game.getState().targets[0].locked).toBe(true)
    const scoreBefore = game.getState().score

    jest
      .spyOn(SatelliteSyncGame.prototype, 'aimAtTarget')
      .mockReturnValueOnce(false)
    await pressMatching(tree, /^Select satellite 1: cyan, locked to target 1$/)
    await pressMatching(tree, /^Lock target 2: cyan, unlocked$/)

    const after = game.getState()
    expect(after.targets[0].locked).toBe(true)
    expect(after.satellites[0].lockedTargetId).toBe('target-0')
    expect(after.targets[1].locked).toBe(false)
    expect(after.score).toBe(scoreBefore)
    expect(testText(tree, 'ss-aim-status')).toContain('could not be locked')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('only matching-colour, unlocked targets enable and the hint names the required colour', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireFrame(100)

    const game = controllerOf(tree).getGame() as SatelliteSyncGame
    act(() => {
      solveCurrentLevel(game)
    })
    await drain()
    fireFrame(116)
    expect(game.getState().levelIndex).toBe(1)

    await pressMatching(tree, /^Select satellite 1: cyan$/)
    const magenta = tree.root.findByProps({
      accessibilityLabel: 'Lock target 2: magenta, unlocked',
    })
    expect(magenta.props.disabled).toBe(true)
    expect(magenta.props.accessibilityHint).toBe(
      'Select a magenta satellite to aim this target'
    )
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Lock target 1: cyan, unlocked',
      }).props.disabled
    ).toBe(false)

    await pressMatching(tree, /^Select satellite 2: magenta$/)
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Lock target 2: magenta, unlocked',
      }).props.disabled
    ).toBe(false)
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Lock target 1: cyan, unlocked',
      }).props.disabled
    ).toBe(true)
  })

  test('a real asteroid-blocked target reports failure, stays unlocked and keeps the satellite selected', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireFrame(100)

    const controller = controllerOf(tree)
    const game = controller.getGame() as SatelliteSyncGame
    act(() => {
      // Clear levels 1–5 so level 6 (Shifting Debris) is live.
      for (let level = 0; level < 5; level++) {
        solveCurrentLevel(game)
      }
    })
    await drain()
    fireFrame(116)
    // 6 s of level-6 drift puts the moving asteroid on satellite 2's beam
    // to moving target 2; the frame just resyncs the board scene.
    act(() => {
      controller.update(6000)
    })
    fireFrame(132)

    expect(game.getState().levelIndex).toBe(5)
    await pressMatching(tree, /^Select satellite 2: magenta$/)
    await pressMatching(tree, /^Lock target 2: magenta, moving, unlocked$/)

    expect(game.getState().targets[1].locked).toBe(false)
    expect(game.getState().score).toBeGreaterThan(0)
    expect(testText(tree, 'ss-aim-status')).toContain('could not be locked')
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Select satellite 2: magenta',
      }).props.accessibilityState?.selected
    ).toBe(true)
    expect(submitScore).not.toHaveBeenCalled()
  })
})

describe('Satellite Sync pilot — stop and teardown', () => {
  test('Stop returns to idle, resets the HUD and leaves no loop running or POST', async () => {
    const updateSpy = jest.spyOn(SatelliteSyncGame.prototype, 'update')
    const tree = await render(<NativeGameHost gameId={GameID.SATELLITE_SYNC} />)
    await press(tree, 'Start game')
    fireFrame(100)
    const game = controllerOf(tree).getGame() as SatelliteSyncGame
    act(() => {
      solveCurrentLevel(game)
    })
    fireFrame(116)
    expect(renderedText(tree)).not.toContain('Score 0')
    expect(rafQueue).toHaveLength(1)

    const updatesBeforeStop = updateSpy.mock.calls.length
    await press(tree, 'Stop run')

    expect(controllerOf(tree).getGame()).toBeNull()
    expect(controllerOf(tree).getScene()).toBeNull()
    expect(renderedText(tree)).toContain('Score 0')
    expect(renderedText(tree)).toContain('idle')
    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(testText(tree, 'ss-level')).toBe(`Level 1 / ${LEVEL_COUNT}`)
    expect(testText(tree, 'ss-targets')).toBe('Targets –')
    expect(testText(tree, 'ss-combo')).toBe('Combo ×1')
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Stop run' })
    ).toHaveLength(0)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    expect(submitScore).not.toHaveBeenCalled()

    // The Stop wake queues exactly one final idle render; it never steps the
    // model and never reschedules.
    expect(rafQueue).toHaveLength(1)
    fireFrame(132)
    expect(rafQueue).toHaveLength(0)
    expect(updateSpy.mock.calls).toHaveLength(updatesBeforeStop)

    // Replay builds a fresh model and resumes exactly one loop.
    await press(tree, 'Start game')
    const next = controllerOf(tree).getGame() as SatelliteSyncGame
    expect(next).not.toBe(game)
    expect(next.getState().status).toBe('playing')
    expect(next.getState().score).toBe(0)
    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(rafQueue).toHaveLength(1)
    fireFrame(200)
    expect(rafQueue).toHaveLength(1)
  })

  test('a stale save after Replay is discarded while its award still forwards once', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(
      <NativeGameHost gameId={GameID.SATELLITE_SYNC} settledUserId="user-1" />
    )
    await press(tree, 'Start game')
    const controller = controllerOf(tree)
    act(() => {
      solveRun(controller)
    })
    await drain()
    expect(testText(tree, 'result-save-status')).toBe('Saving score…')

    await press(tree, 'Play again')
    expect(renderedText(tree)).not.toContain('Run complete')
    expect(renderedText(tree)).toContain('Score 0')

    await act(async () => {
      releaseSave?.({ success: true, newAchievements: [ACHIEVEMENT] })
    })
    await drain()

    expect(tree.root.findAllByProps({ testID: 'result-outcome' })).toHaveLength(
      0
    )
    expect(tree.root.findAllByProps({ testID: 'final-score' })).toHaveLength(0)
    expect(renderedText(tree).match(/Orbit Master/g)).toHaveLength(1)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('unmount stops the model timer/loop and a late save reaches no new host', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const cleanup = jest.spyOn(SatelliteSyncGame.prototype, 'cleanup')
    const treeA = await render(
      <NativeGameHost gameId={GameID.SATELLITE_SYNC} settledUserId="user-a" />
    )
    await press(treeA, 'Start game')
    const controller = controllerOf(treeA)
    act(() => {
      solveRun(controller)
    })
    await drain()
    expect(testText(treeA, 'result-save-status')).toBe('Saving score…')

    await unmount(treeA)
    expect(cleanup).toHaveBeenCalled()
    expect(rafQueue).toHaveLength(0)

    const treeB = await render(
      <NativeGameHost gameId={GameID.SATELLITE_SYNC} settledUserId="user-b" />
    )
    await act(async () => {
      releaseSave?.({ success: true, newAchievements: [ACHIEVEMENT] })
    })
    await drain()

    expect(renderedText(treeB)).not.toContain('Orbit Master')
    expect(
      treeB.root.findAllByProps({ testID: 'result-outcome' })
    ).toHaveLength(0)
    expect(
      treeB.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })
})
