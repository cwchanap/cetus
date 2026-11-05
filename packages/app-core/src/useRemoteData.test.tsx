import { act, render, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRemoteData } from './useRemoteData'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function settle<T>(d: Deferred<T>, value: T): Promise<void> {
  await act(async () => {
    d.resolve(value)
    await d.promise
  })
}

async function settleRejection<T>(
  d: Deferred<T>,
  reason: unknown
): Promise<void> {
  await act(async () => {
    d.reject(reason)
    await d.promise.catch(() => undefined)
  })
}

function deferredLoader<T>(runs: Deferred<T>[]) {
  return vi.fn((_signal: AbortSignal) => {
    const d = deferred<T>()
    runs.push(d)
    return d.promise
  })
}

describe('useRemoteData', () => {
  it('starts loading and resolves with data', async () => {
    const d = deferred<string>()
    const load = vi.fn((_signal: AbortSignal) => d.promise)
    const { result } = renderHook(() => useRemoteData(load, ['profile', 'u1']))

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
    expect(load.mock.calls[0][0]).toBeInstanceOf(AbortSignal)

    await settle(d, 'profile-u1')

    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBe('profile-u1')
    expect(result.current.error).toBeNull()
  })

  it('exposes a rejection as error', async () => {
    const d = deferred<string>()
    const load = vi.fn((_signal: AbortSignal) => d.promise)
    const { result } = renderHook(() => useRemoteData(load, ['k']))
    const failure = new Error('boom')

    await settleRejection(d, failure)

    expect(result.current.error).toBe(failure)
    expect(result.current.data).toBeUndefined()
    expect(result.current.loading).toBe(false)
  })

  it('normalizes non-Error rejections to Error', async () => {
    const d = deferred<string>()
    const { result } = renderHook(() => useRemoteData(() => d.promise, ['k']))

    await settleRejection(d, 'plain-failure')

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('plain-failure')
  })

  it('stays idle while disabled and loads once enabled', async () => {
    const d = deferred<string>()
    const load = vi.fn((_signal: AbortSignal) => d.promise)
    const { result, rerender } = renderHook(
      ({ enabled }) => useRemoteData(load, ['profile', 'u1'], enabled),
      { initialProps: { enabled: false } }
    )

    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBeNull()

    rerender({ enabled: false })
    expect(load).not.toHaveBeenCalled()

    rerender({ enabled: true })
    expect(result.current.loading).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)

    await settle(d, 'u1-data')
    expect(result.current.data).toBe('u1-data')
  })

  it('hides data immediately when disabled and refetches on re-enable', async () => {
    const runs: Deferred<string>[] = []
    const load = deferredLoader(runs)
    const { result, rerender } = renderHook(
      ({ enabled }) => useRemoteData(load, ['profile', 'u1'], enabled),
      { initialProps: { enabled: true } }
    )
    await settle(runs[0], 'u1-data')
    expect(result.current.data).toBe('u1-data')

    rerender({ enabled: false })
    expect(result.current.data).toBeUndefined()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()

    rerender({ enabled: true })
    expect(result.current.data).toBeUndefined()
    expect(result.current.loading).toBe(true)
    expect(load).toHaveBeenCalledTimes(2)

    await settle(runs[1], 'u1-fresh')
    expect(result.current.data).toBe('u1-fresh')
  })

  it('ignores refresh while disabled', () => {
    const load = vi.fn((_signal: AbortSignal) => new Promise<string>(() => {}))
    const { result } = renderHook(() => useRemoteData(load, ['k'], false))

    act(() => result.current.refresh())

    expect(load).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeUndefined()
  })

  it('never renders the previous key data after a key change', async () => {
    const pending = new Map<string, Deferred<string>>()
    const loadFor = (k: string) => {
      if (!pending.has(k)) {
        pending.set(k, deferred<string>())
      }
      return (_signal: AbortSignal) => {
        const d = pending.get(k)
        if (!d) {
          throw new Error('missing deferred')
        }
        return d.promise
      }
    }
    const seen: { k: string; data: string | undefined; loading: boolean }[] = []
    function Probe({ k }: { k: string }) {
      const remote = useRemoteData(loadFor(k), ['account', k])
      seen.push({ k, data: remote.data, loading: remote.loading })
      return null
    }

    const { rerender } = render(<Probe k="alice" />)
    const alice = pending.get('alice')
    expect(alice).toBeDefined()
    await settle(alice as Deferred<string>, 'alice-data')
    seen.length = 0

    rerender(<Probe k="bob" />)

    const bobEntries = seen.filter(e => e.k === 'bob')
    expect(bobEntries.length).toBeGreaterThan(0)
    expect(bobEntries.every(e => e.data === undefined)).toBe(true)
    const last = bobEntries[bobEntries.length - 1]
    expect(last?.loading).toBe(true)
  })

  it('suppresses stale results across rapid out-of-order key changes', async () => {
    const runs = new Map<string, Deferred<string>>()
    const loadFor = (k: string) => {
      if (!runs.has(k)) {
        runs.set(k, deferred<string>())
      }
      return (_signal: AbortSignal) => {
        const d = runs.get(k)
        if (!d) {
          throw new Error('missing deferred')
        }
        return d.promise
      }
    }
    const { result, rerender } = renderHook(
      ({ k }) => useRemoteData(loadFor(k), ['lb', k]),
      { initialProps: { k: 'a' } }
    )

    rerender({ k: 'b' })
    rerender({ k: 'c' })

    const b = runs.get('b')
    const a = runs.get('a')
    const c = runs.get('c')
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(c).toBeDefined()

    await settle(b as Deferred<string>, 'b-data')
    expect(result.current.data).toBeUndefined()
    expect(result.current.loading).toBe(true)

    await settle(a as Deferred<string>, 'a-data')
    expect(result.current.data).toBeUndefined()
    expect(result.current.loading).toBe(true)

    await settle(c as Deferred<string>, 'c-data')
    expect(result.current.data).toBe('c-data')
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('suppresses a stale rejection from a superseded key', async () => {
    const runs = new Map<string, Deferred<string>>()
    const loadFor = (k: string) => {
      if (!runs.has(k)) {
        runs.set(k, deferred<string>())
      }
      return (_signal: AbortSignal) => {
        const d = runs.get(k)
        if (!d) {
          throw new Error('missing deferred')
        }
        return d.promise
      }
    }
    const { result, rerender } = renderHook(
      ({ k }) => useRemoteData(loadFor(k), ['lb', k]),
      { initialProps: { k: 'a' } }
    )
    rerender({ k: 'b' })

    const a = runs.get('a')
    expect(a).toBeDefined()
    await settleRejection(a as Deferred<string>, new Error('stale-error'))
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(true)

    const b = runs.get('b')
    expect(b).toBeDefined()
    await settle(b as Deferred<string>, 'b-data')
    expect(result.current.data).toBe('b-data')
    expect(result.current.error).toBeNull()
  })

  it('aborts the in-flight signal on key change and on unmount', () => {
    const signals: AbortSignal[] = []
    const load = vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<string>(() => {})
    })
    const { rerender, unmount } = renderHook(
      ({ k }) => useRemoteData(load, ['k', k]),
      { initialProps: { k: 'a' } }
    )

    expect(signals).toHaveLength(1)
    rerender({ k: 'b' })
    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)

    unmount()
    expect(signals[1].aborted).toBe(true)
  })

  it('ignores a late resolution from an aborted request', async () => {
    const runs: Deferred<string>[] = []
    const load = deferredLoader(runs)
    const { result, rerender } = renderHook(
      ({ k }) => useRemoteData(load, ['k', k]),
      { initialProps: { k: 'a' } }
    )

    rerender({ k: 'b' })

    await settle(runs[0], 'stale-a')
    expect(result.current.data).toBeUndefined()
    expect(result.current.loading).toBe(true)

    await settle(runs[1], 'fresh-b')
    expect(result.current.data).toBe('fresh-b')
  })

  it('does not publish a result after unmount', async () => {
    const d = deferred<string>()
    const signals: AbortSignal[] = []
    const load = vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return d.promise
    })
    const { unmount } = renderHook(() => useRemoteData(load, ['k']))

    unmount()
    expect(signals[0].aborted).toBe(true)

    await settle(d, 'late')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('refresh re-runs the loader while keeping last data visible', async () => {
    const runs: Deferred<string>[] = []
    const load = deferredLoader(runs)
    const { result } = renderHook(() => useRemoteData(load, ['k']))
    await settle(runs[0], 'first')
    expect(result.current.data).toBe('first')

    act(() => result.current.refresh())
    expect(load).toHaveBeenCalledTimes(2)
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBe('first')

    await settle(runs[1], 'second')
    expect(result.current.data).toBe('second')
    expect(result.current.loading).toBe(false)
  })

  it('keeps the last good data when a refetch fails', async () => {
    const runs: Deferred<string>[] = []
    const load = deferredLoader(runs)
    const { result } = renderHook(() => useRemoteData(load, ['k']))
    await settle(runs[0], 'first')
    expect(result.current.data).toBe('first')

    act(() => result.current.refresh())
    expect(load).toHaveBeenCalledTimes(2)

    const failure = new Error('refetch-boom')
    await settleRejection(runs[1], failure)
    expect(result.current.error).toBe(failure)
    expect(result.current.data).toBe('first')
    expect(result.current.loading).toBe(false)

    act(() => result.current.refresh())
    await settle(runs[2], 'recovered')
    expect(result.current.data).toBe('recovered')
    expect(result.current.error).toBeNull()
  })

  it('clears data and surfaces the error when the first load fails', async () => {
    const runs: Deferred<string>[] = []
    const load = deferredLoader(runs)
    const { result } = renderHook(() => useRemoteData(load, ['k']))

    await settleRejection(runs[0], new Error('initial-boom'))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).not.toBeNull()
  })

  it('does not leak the previous key data across a failed load', async () => {
    const runs: Deferred<string>[] = []
    const load = deferredLoader(runs)
    const { result, rerender } = renderHook(
      ({ k }) => useRemoteData(load, ['k', k]),
      { initialProps: { k: 'a' } }
    )
    await settle(runs[0], 'a-data')

    rerender({ k: 'b' })
    expect(result.current.data).toBeUndefined()

    await settleRejection(runs[1], new Error('b-boom'))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error?.message).toBe('b-boom')
  })

  it('does not refetch for fresh inline callbacks or equal key arrays', async () => {
    const d = deferred<string>()
    const load = vi.fn((_signal: AbortSignal) => d.promise)
    type Props = {
      fn: (signal: AbortSignal) => Promise<string>
      keys: readonly string[]
    }
    const { result, rerender } = renderHook(
      ({ fn, keys }: Props) => useRemoteData(fn, keys),
      {
        initialProps: {
          fn: (s: AbortSignal) => load(s),
          keys: ['lb', 'snake'],
        },
      }
    )
    await settle(d, 'board')
    expect(result.current.data).toBe('board')
    const refresh = result.current.refresh

    rerender({ fn: (s: AbortSignal) => load(s), keys: ['lb', 'snake'] })
    rerender({ fn: (s: AbortSignal) => load(s), keys: ['lb', 'snake'] })

    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.data).toBe('board')
    expect(result.current.refresh).toBe(refresh)
  })

  it('hands off cleanly between distinct object key identities', async () => {
    const runs: Deferred<string>[] = []
    const load = deferredLoader(runs)
    const aliceKey = new Map([['user', 'alice']])
    const bobKey = new Map([['user', 'bob']])
    const seen: {
      owner: string
      data: string | undefined
      loading: boolean
    }[] = []
    function Probe({ k }: { k: Map<string, string> }) {
      const remote = useRemoteData(load, ['account', k])
      seen.push({
        owner: k.get('user') ?? '',
        data: remote.data,
        loading: remote.loading,
      })
      return null
    }

    const { rerender } = render(<Probe k={aliceKey} />)
    await settle(runs[0], 'alice-private')
    seen.length = 0

    rerender(<Probe k={bobKey} />)

    expect(load).toHaveBeenCalledTimes(2)
    const bobEntries = seen.filter(e => e.owner === 'bob')
    expect(bobEntries.length).toBeGreaterThan(0)
    expect(bobEntries.every(e => e.data === undefined)).toBe(true)
    const lastBob = bobEntries[bobEntries.length - 1]
    expect(lastBob?.loading).toBe(true)

    await settle(runs[1], 'bob-private')
    const last = seen[seen.length - 1]
    expect(last?.owner).toBe('bob')
    expect(last?.data).toBe('bob-private')
  })

  it('distinguishes undefined from null key entries', async () => {
    const runs: Deferred<string>[] = []
    const load = deferredLoader(runs)
    const { result, rerender } = renderHook(
      ({ v }: { v: unknown }) => useRemoteData(load, ['k', v]),
      { initialProps: { v: undefined as unknown } }
    )
    await settle(runs[0], 'for-undefined')

    rerender({ v: null })
    expect(load).toHaveBeenCalledTimes(2)
    expect(result.current.data).toBeUndefined()

    await settle(runs[1], 'for-null')
    expect(result.current.data).toBe('for-null')
  })

  it('distinguishes symbol key entries by identity', async () => {
    const runs: Deferred<string>[] = []
    const load = deferredLoader(runs)
    const first = Symbol('entry')
    const second = Symbol('entry')
    const { result, rerender } = renderHook(
      ({ k }: { k: symbol }) => useRemoteData(load, ['k', k]),
      { initialProps: { k: first } }
    )
    await settle(runs[0], 'sym-one')

    rerender({ k: second })
    expect(load).toHaveBeenCalledTimes(2)
    expect(result.current.data).toBeUndefined()

    await settle(runs[1], 'sym-two')
    expect(result.current.data).toBe('sym-two')

    rerender({ k: second })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('treats bigint key entries as values without throwing', async () => {
    const runs: Deferred<string>[] = []
    const load = deferredLoader(runs)
    const { result, rerender } = renderHook(
      ({ k }: { k: bigint }) => useRemoteData(load, ['k', k]),
      { initialProps: { k: BigInt(1) } }
    )
    await settle(runs[0], 'one')
    expect(result.current.data).toBe('one')

    rerender({ k: BigInt(1) })
    expect(load).toHaveBeenCalledTimes(1)

    rerender({ k: BigInt(2) })
    expect(load).toHaveBeenCalledTimes(2)
    await settle(runs[1], 'two')
    expect(result.current.data).toBe('two')
  })

  it('accepts bigint and cyclic keys while disabled without throwing', () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    const load = vi.fn((_signal: AbortSignal) => new Promise<string>(() => {}))
    const { result, rerender } = renderHook(
      ({ k }: { k: readonly unknown[] }) => useRemoteData(load, k, false),
      { initialProps: { k: ['k', BigInt(7)] as readonly unknown[] } }
    )

    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeUndefined()

    rerender({ k: ['k', cyclic] })
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(load).not.toHaveBeenCalled()
  })

  it('does not retain the caller-owned key array as the snapshot', async () => {
    const runs: Deferred<string>[] = []
    const load = deferredLoader(runs)
    const keys = ['account', 'alice']
    const { result, rerender } = renderHook(
      ({ k }: { k: readonly string[] }) => useRemoteData(load, k),
      { initialProps: { k: keys } }
    )
    await settle(runs[0], 'alice-data')
    expect(result.current.data).toBe('alice-data')

    keys[1] = 'bob'
    rerender({ k: keys })
    expect(load).toHaveBeenCalledTimes(2)
    expect(result.current.data).toBeUndefined()
    expect(result.current.loading).toBe(true)

    await settle(runs[1], 'bob-data')
    expect(result.current.data).toBe('bob-data')
  })
})
