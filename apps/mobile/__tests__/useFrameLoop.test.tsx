import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'

import {
  useFrameLoop,
  type FrameLoopOptions,
} from '../src/games/canvas/useFrameLoop'

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

interface LoopState {
  running: boolean
  key: string
}

const makeLoop = (state: LoopState) => {
  const probe = {
    steps: [] as number[],
    frames: 0,
    subscribes: 0,
    unsubscribes: 0,
    wake: null as (() => void) | null,
    reset: null as (() => void) | null,
  }
  const build = (): FrameLoopOptions => ({
    isRunning: () => state.running,
    step: deltaSeconds => probe.steps.push(deltaSeconds),
    subscribe: (wake, reset) => {
      probe.subscribes += 1
      probe.wake = wake
      probe.reset = reset
      return () => {
        probe.unsubscribes += 1
      }
    },
    onFrame: () => {
      probe.frames += 1
    },
    lifecycleKey: () => state.key,
  })
  return { probe, build }
}

const Harness = ({
  options,
  owner,
}: {
  options: FrameLoopOptions
  owner: string
}) => {
  useFrameLoop(options, owner)
  return <Text testID="owner">{owner}</Text>
}

const render = (options: FrameLoopOptions, owner = 'a') => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  act(() => {
    tree = TestRenderer.create(<Harness options={options} owner={owner} />)
  })
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  return tree
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
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('useFrameLoop', () => {
  test('renders once at mount, runs one inert frame, then sleeps while idle', () => {
    const state: LoopState = { running: false, key: 'idle' }
    const { probe, build } = makeLoop(state)
    render(build())

    expect(probe.frames).toBe(1)
    expect(rafQueue).toHaveLength(1)

    fireFrame(16)

    expect(probe.steps).toEqual([])
    expect(probe.frames).toBe(1)
    expect(rafQueue).toHaveLength(0)
  })

  test('steps zero on the first running frame, then the wall delta capped at 0.1s', () => {
    const state: LoopState = { running: false, key: 'idle' }
    const { probe, build } = makeLoop(state)
    render(build())

    state.running = true
    state.key = 'run'
    fireFrame(100)
    fireFrame(180)
    fireFrame(500)
    fireFrame(490)

    expect(probe.steps).toEqual([0, 0.08, 0.1, 0])
    expect(probe.frames).toBe(5)
    expect(rafQueue).toHaveLength(1)
  })

  test('callback replacements reach the next frame without restarting the loop', () => {
    const state: LoopState = { running: true, key: 'run' }
    const { probe } = makeLoop(state)
    const options: FrameLoopOptions = {
      isRunning: () => state.running,
      step: deltaSeconds => probe.steps.push(deltaSeconds),
      subscribe: (wake, reset) => {
        probe.subscribes += 1
        probe.wake = wake
        probe.reset = reset
        return () => {
          probe.unsubscribes += 1
        }
      },
      onFrame: () => {
        probe.frames += 1
      },
      lifecycleKey: () => state.key,
    }
    const tree = render(options)
    fireFrame(100)
    expect(probe.frames).toBe(2)

    const later: number[] = []
    let laterFrames = 0
    act(() => {
      tree.update(
        <Harness
          owner="a"
          options={{
            ...options,
            step: deltaSeconds => later.push(deltaSeconds),
            onFrame: () => {
              laterFrames += 1
            },
          }}
        />
      )
    })

    expect(probe.subscribes).toBe(1)
    expect(rafQueue).toHaveLength(1)
    fireFrame(116)

    expect(later).toEqual([0.016])
    expect(probe.steps).toEqual([0])
    expect(laterFrames).toBe(1)
  })

  test('wakes dedupe onto one queued frame and unmount cancels it', () => {
    const state: LoopState = { running: true, key: 'run' }
    const { probe, build } = makeLoop(state)
    const tree = render(build())
    fireFrame(100)
    expect(rafQueue).toHaveLength(1)

    act(() => {
      probe.wake?.()
      probe.wake?.()
    })
    expect(rafQueue).toHaveLength(1)

    act(() => {
      tree.unmount()
    })
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(rafQueue).toHaveLength(0)
    expect(probe.unsubscribes).toBe(1)
  })

  test('an idle wake renders the changed lifecycle once and sleeps', () => {
    const state: LoopState = { running: true, key: 'run' }
    const { probe, build } = makeLoop(state)
    render(build())
    fireFrame(100)
    expect(probe.steps).toEqual([0])
    expect(probe.frames).toBe(2)

    state.running = false
    state.key = 'finished'
    act(() => {
      probe.wake?.()
    })
    expect(rafQueue).toHaveLength(1)

    fireFrame(116)
    expect(probe.frames).toBe(3)
    expect(probe.steps).toEqual([0])
    expect(rafQueue).toHaveLength(0)
  })

  test('a subscribed timestamp reset makes the next running frame a zero delta', () => {
    const state: LoopState = { running: true, key: 'run' }
    const { probe, build } = makeLoop(state)
    render(build())
    fireFrame(100)
    fireFrame(116)
    expect(probe.steps).toEqual([0, 0.016])

    act(() => {
      probe.reset?.()
    })
    fireFrame(200)

    expect(probe.steps).toEqual([0, 0.016, 0])
  })

  test('an owner change unsubscribes, renders the new owner and starts fresh timing', () => {
    const state: LoopState = { running: false, key: 'idle' }
    const { probe, build } = makeLoop(state)
    const tree = render(build(), 'a')
    expect(probe.frames).toBe(1)

    act(() => {
      tree.update(<Harness options={build()} owner="b" />)
    })
    expect(probe.unsubscribes).toBe(1)
    expect(probe.frames).toBe(2)
    expect(rafQueue).toHaveLength(1)

    state.running = true
    state.key = 'run'
    fireFrame(5000)
    expect(probe.steps).toEqual([0])
  })
})
