import { useCallback, useEffect, useRef, useState } from 'react'

import { authClient } from './auth-client'
import { isUnauthorizedError } from './refetch'

export interface SessionLike {
    user: { id: string }
    session?: {
        id: string
        updatedAt?: string | Date | null
        expiresAt?: string | Date | null
    } | null
}

// Stable session identity: changes only when the signed-in user or the
// session row itself changes. Drafts, fetch keys, mutation epochs, and the
// dismissed-reward marker key on this — a routine session renewal only bumps
// updatedAt/expiresAt and must not read as a new session (it would wipe
// Profile drafts, discard in-flight saves, close the reward modal mid-claim,
// and resurface dismissed rewards).
export function sessionKeyFor(
    session: SessionLike | null | undefined
): string | null {
    const userId = session?.user.id ?? null
    const record = session?.session
    if (!record) {
        return userId
    }
    return [userId ?? '', record.id].join(':')
}

// Renewal-sensitive identity for the expired-session gate ONLY: after a 401
// latches the gate, a refetched session the server renewed (new
// updatedAt/expiresAt) produces a different key and unlatches the screen,
// while an identical record stays suppressed instead of looping 401 →
// refetch. Never use this for drafts/epochs/fetch keys — use sessionKeyFor.
export function sessionGateKeyFor(
    session: SessionLike | null | undefined
): string | null {
    const userId = session?.user.id ?? null
    const record = session?.session
    if (!record) {
        return userId
    }
    return [
        record.id,
        String(record.updatedAt ?? ''),
        String(record.expiresAt ?? ''),
    ].join(':')
}

export function useExpiredSessionGate(sessionKey: string | null): {
    authExpired: boolean
    markSessionExpired: () => void
} {
    const [expiredSessionKeys, setExpiredSessionKeys] = useState<
        readonly string[]
    >([])
    const authExpired =
        sessionKey !== null && expiredSessionKeys.includes(sessionKey)
    const markSessionExpired = useCallback(() => {
        if (sessionKey === null) {
            return
        }
        setExpiredSessionKeys(current =>
            current.includes(sessionKey) ? current : [...current, sessionKey]
        )
    }, [sessionKey])
    return { authExpired, markSessionExpired }
}

type AuthSessionData = ReturnType<typeof authClient.useSession>['data']

export interface SessionGuard {
    session: AuthSessionData
    isPending: boolean
    userId: string | null
    sessionKey: string | null
    gateKey: string | null
    authExpired: boolean
    reconcileSession: () => void
}

// Shared session plumbing for the signed-in screens. sessionKey is the
// stable identity for drafts/epochs/fetch keys; gateKey feeds the
// expired-session latch. reconcileSession() marks the current gate key
// expired and refetches the session once per key — call it directly for
// imperative 401s (mutations) or via useUnauthorizedReconcile for read
// errors surfaced through useRemoteData.
export function useSessionGuard(): SessionGuard {
    const {
        data: session,
        isPending,
        refetch: refetchSession,
    } = authClient.useSession()
    const userId = session?.user.id ?? null
    const sessionKey = sessionKeyFor(session)
    const gateKey = sessionGateKeyFor(session)
    const { authExpired, markSessionExpired } = useExpiredSessionGate(gateKey)

    const reconciledForRef = useRef<string | null>(null)
    const reconcileSession = useCallback(() => {
        if (gateKey === null) {
            return
        }
        markSessionExpired()
        if (reconciledForRef.current !== gateKey) {
            reconciledForRef.current = gateKey
            void Promise.resolve(refetchSession?.()).catch(() => undefined)
        }
    }, [gateKey, markSessionExpired, refetchSession])

    return {
        session,
        isPending,
        userId,
        sessionKey,
        gateKey,
        authExpired,
        reconcileSession,
    }
}

// Reconciles the session once per gate key whenever any watched error is a
// 401. The boolean summary keeps the effect stable across re-renders where
// unrelated error objects churn.
export function useUnauthorizedReconcile(
    errors: readonly (Error | null | undefined)[],
    reconcileSession: () => void
): void {
    const unauthorized = errors.some(isUnauthorizedError)
    useEffect(() => {
        if (unauthorized) {
            reconcileSession()
        }
    }, [unauthorized, reconcileSession])
}

export interface OperationEpoch {
    key: string | null
    eligible: boolean
    epoch: number
}

// Epoch machinery for async mutations: the epoch bumps whenever the session
// key or eligibility flips, so an operation started under one session can
// detect it went stale mid-flight and discard its result. Async ops read
// latest.current (never the render-time value).
export function useOperationEpoch(
    key: string | null,
    eligible: boolean
): {
    latest: { current: OperationEpoch }
    isStale: (operationEpoch: number) => boolean
} {
    const mountedRef = useRef(true)
    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])
    const epochRef = useRef(0)
    const latestRef = useRef<OperationEpoch>({ key, eligible, epoch: 0 })
    if (
        latestRef.current.key !== key ||
        latestRef.current.eligible !== eligible
    ) {
        epochRef.current += 1
    }
    latestRef.current = { key, eligible, epoch: epochRef.current }
    const isStale = useCallback(
        (operationEpoch: number) =>
            !mountedRef.current || latestRef.current.epoch !== operationEpoch,
        []
    )
    return { latest: latestRef, isStale }
}
