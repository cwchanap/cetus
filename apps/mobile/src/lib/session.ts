import { useCallback, useState } from 'react'

export interface SessionLike {
    user: { id: string }
    session?: {
        id: string
        updatedAt?: string | Date | null
        expiresAt?: string | Date | null
    } | null
}

export function sessionKeyFor(
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
