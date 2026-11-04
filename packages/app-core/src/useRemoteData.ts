import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseRemoteDataResult<T> {
    data: T | undefined
    loading: boolean
    error: Error | null
    refresh: () => void
}

interface FetchState<T> {
    key: string
    enabled: boolean
    data: T | undefined
    error: Error | null
    pending: boolean
}

function toError(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error(String(reason))
}

export function useRemoteData<T>(
    load: (signal: AbortSignal) => Promise<T>,
    key: readonly unknown[],
    enabled: boolean = true
): UseRemoteDataResult<T> {
    const keyString = JSON.stringify(key)
    const loadRef = useRef(load)
    const generationRef = useRef(0)
    const [refreshCount, setRefreshCount] = useState(0)
    const [result, setResult] = useState<FetchState<T>>({
        key: keyString,
        enabled,
        data: undefined,
        error: null,
        pending: enabled,
    })

    useEffect(() => {
        loadRef.current = load
    })

    useEffect(() => {
        if (!enabled) {
            setResult(current =>
                current.key === keyString &&
                current.enabled === false &&
                current.data === undefined &&
                current.error === null &&
                current.pending === false
                    ? current
                    : {
                          key: keyString,
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
            current.key === keyString && current.enabled === true
                ? current.pending && current.error === null
                    ? current
                    : { ...current, pending: true, error: null }
                : {
                      key: keyString,
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
                        key: keyString,
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
                    setResult({
                        key: keyString,
                        enabled: true,
                        data: undefined,
                        error: toError(reason),
                        pending: false,
                    })
                }
            }
        )
        return () => {
            controller.abort()
            if (generationRef.current === generation) {
                generationRef.current++
            }
        }
    }, [keyString, enabled, refreshCount])

    const refresh = useCallback(() => {
        setRefreshCount(count => count + 1)
    }, [])

    const current =
        enabled && result.key === keyString && result.enabled === enabled
    return {
        data: current ? result.data : undefined,
        loading: enabled && (!current || result.pending),
        error: current ? result.error : null,
        refresh,
    }
}
