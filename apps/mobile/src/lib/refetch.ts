import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { AppState } from 'react-native'
import { ApiClientError } from '@cetus/api-client/api-client'

export function isServiceUnavailable(error: Error | null): boolean {
    return error instanceof ApiClientError && error.status === 503
}

export function isNetworkError(error: Error | null): boolean {
    return error instanceof ApiClientError && error.kind === 'network'
}

export function isUnauthorizedError(error: Error | null): boolean {
    return error instanceof ApiClientError && error.status === 401
}

export function useRefetchOnFocus(refetch: () => void): void {
    const skipInitialFocus = useRef(true)
    useFocusEffect(
        useCallback(() => {
            const subscription = AppState.addEventListener('change', state => {
                if (state === 'active') {
                    refetch()
                }
            })
            if (skipInitialFocus.current) {
                skipInitialFocus.current = false
            } else {
                refetch()
            }
            return () => subscription.remove()
        }, [refetch])
    )
}
