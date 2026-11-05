import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseRemoteDataResult<T> {
    data: T | undefined
    loading: boolean
    error: Error | null
    refresh: () => void
}

interface FetchState<T> {
    key: readonly unknown[]
    enabled: boolean
    data: T | undefined
    error: Error | null
    pending: boolean
}

function shallowKeyEqual(
    a: readonly unknown[],
    b: readonly unknown[]
): boolean {
    if (a === b) {
        return true
    }
    if (a.length !== b.length) {
        return false
    }
    for (let index = 0; index < a.length; index++) {
        if (!Object.is(a[index], b[index])) {
            return false
        }
    }
    return true
}

function toError(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error(String(reason))
}

export function useRemoteData<T>(
    load: (signal: AbortSignal) => Promise<T>,
    key: readonly unknown[],
    enabled: boolean = true
): UseRemoteDataResult<T> {
    const loadRef = useRef(load)
    const generationRef = useRef(0)
    const [refreshCount, setRefreshCount] = useState(0)
    const [keySnapshot, setKeySnapshot] = useState<readonly unknown[]>(() => [
        ...key,
    ])
    const [result, setResult] = useState<FetchState<T>>({
        key: keySnapshot,
        enabled,
        data: undefined,
        error: null,
        pending: enabled,
    })

    if (!shallowKeyEqual(keySnapshot, key)) {
        setKeySnapshot([...key])
    }

    useEffect(() => {
        loadRef.current = load
    })

    useEffect(() => {
        if (!enabled) {
            setResult(current =>
                current.key === keySnapshot &&
                current.enabled === false &&
                current.data === undefined &&
                current.error === null &&
                current.pending === false
                    ? current
                    : {
                          key: keySnapshot,
                          enabled: false,
                          data: undefined,
                          error: null,
                          pending: false,
                      }
            )
            return
        }
        const controller = new AbortController()
        const generation = ++generationRef.current
        setResult(current =>
            current.key === keySnapshot && current.enabled === true
                ? current.pending && current.error === null
                    ? current
                    : { ...current, pending: true, error: null }
                : {
                      key: keySnapshot,
                      enabled: true,
                      data: undefined,
                      error: null,
                      pending: true,
                  }
        )
        let request: Promise<T>
        try {
            request = Promise.resolve(loadRef.current(controller.signal))
        } catch (reason) {
            request = Promise.reject(reason)
        }
        request.then(
            value => {
                if (
                    generation === generationRef.current &&
                    !controller.signal.aborted
                ) {
                    setResult({
                        key: keySnapshot,
                        enabled: true,
                        data: value,
                        error: null,
                        pending: false,
                    })
                }
            },
            reason => {
                if (
                    generation === generationRef.current &&
                    !controller.signal.aborted
                ) {
                    // Keep the last good value when a refetch fails: only an
                    // initial-load failure (no data for this key yet) clears
                    // the result. Key-matched failures surface the error
                    // alongside the stale data instead of blanking the view.
                    setResult(current =>
                        current.key === keySnapshot && current.enabled === true
                            ? {
                                  ...current,
                                  error: toError(reason),
                                  pending: false,
                              }
                            : {
                                  key: keySnapshot,
                                  enabled: true,
                                  data: undefined,
                                  error: toError(reason),
                                  pending: false,
                              }
                    )
                }
            }
        )
        return () => {
            controller.abort()
            if (generationRef.current === generation) {
                generationRef.current++
            }
        }
    }, [keySnapshot, enabled, refreshCount])

    const refresh = useCallback(() => {
        setRefreshCount(count => count + 1)
    }, [])

    const current =
        enabled &&
        result.enabled === enabled &&
        shallowKeyEqual(result.key, key)
    return {
        data: current ? result.data : undefined,
        loading: enabled && (!current || result.pending),
        error: current ? result.error : null,
        refresh,
    }
}
