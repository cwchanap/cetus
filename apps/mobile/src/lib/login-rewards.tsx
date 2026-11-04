import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { ApiClientError } from '@cetus/api-client/api-client'
import { useRemoteData } from '@cetus/app-core'
import { LoginRewardModal } from '@cetus/ui'
import type {
  LoginRewardClaimResponse,
  LoginRewardStatusResponse,
} from '@cetus/shared/api-dto'

import { api } from './api'
import { authClient } from './auth-client'
import { isUnauthorizedError, useRefetchOnFocus } from './refetch'
import { sessionKeyFor, useExpiredSessionGate } from './session'

type ClaimPhase = 'idle' | 'claiming' | 'success' | 'error'

const AUTO_OPEN_DELAY_MS = 500
const AUTO_CLOSE_MS = 3000

let modalLease: object | null = null
const leaseReleaseSubscribers = new Set<() => void>()
let mountedHostCount = 0
let dismissedReward: {
  sessionKey: string | null
  loginStreak: number
} | null = null

const toError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new Error(String(reason))

export function LoginRewardHost() {
  const {
    data: session,
    isPending,
    refetch: refetchSession,
  } = authClient.useSession()
  const userId = session?.user.id ?? null
  const sessionKey = sessionKeyFor(session)
  const { authExpired, markSessionExpired } = useExpiredSessionGate(sessionKey)
  const eligible =
    userId !== null && sessionKey !== null && !isPending && !authExpired

  const [focused, setFocused] = useState(false)
  const focusedRef = useRef(false)
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true
      setFocused(true)
      return () => {
        focusedRef.current = false
        setFocused(false)
      }
    }, [])
  )

  const statusSeqRef = useRef(0)
  const { data, error, refresh } = useRemoteData<{
    seq: number
    status: LoginRewardStatusResponse
  }>(
    useCallback(() => {
      const seq = ++statusSeqRef.current
      return api.getLoginRewardStatus().then(status => ({ seq, status }))
    }, []),
    ['login-rewards', userId ?? 'anonymous', sessionKey ?? 'none'],
    eligible
  )
  useRefetchOnFocus(refresh)

  const reconciledForRef = useRef<string | null>(null)
  const reconcileSession = useCallback(() => {
    if (sessionKey === null) {
      return
    }
    markSessionExpired()
    if (reconciledForRef.current !== sessionKey) {
      reconciledForRef.current = sessionKey
      void Promise.resolve(refetchSession?.()).catch(() => undefined)
    }
  }, [sessionKey, markSessionExpired, refetchSession])
  useEffect(() => {
    if (isUnauthorizedError(error)) {
      reconcileSession()
    }
  }, [error, reconcileSession])

  const [open, setOpen] = useState(false)
  const [claimPhase, setClaimPhase] = useState<ClaimPhase>('idle')
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimResult, setClaimResult] =
    useState<LoginRewardClaimResponse | null>(null)
  const [claimOverlay, setClaimOverlay] = useState<{
    epoch: number
    coversThrough: number
    status: LoginRewardStatusResponse
  } | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const epochRef = useRef(0)
  const latestRef = useRef({ key: sessionKey, eligible, epoch: 0 })
  if (
    latestRef.current.key !== sessionKey ||
    latestRef.current.eligible !== eligible
  ) {
    epochRef.current += 1
  }
  latestRef.current = { key: sessionKey, eligible, epoch: epochRef.current }
  const epoch = latestRef.current.epoch
  const openSeqRef = useRef(0)
  const openRef = useRef(open)
  openRef.current = open
  const tokenRef = useRef<object>({})
  const claimBusyForRef = useRef<number | null>(null)
  const armedRef = useRef(false)
  const prevClaimableRef = useRef(false)
  const claimableWindowRef = useRef<{
    sessionKey: string | null
    loginStreak: number
  } | null>(null)

  const [flowFor, setFlowFor] = useState<string | null>(sessionKey)
  if (flowFor !== sessionKey) {
    setFlowFor(sessionKey)
    setOpen(false)
    setClaimPhase('idle')
    setClaimError(null)
    setClaimResult(null)
    setClaimOverlay(null)
    armedRef.current = false
    prevClaimableRef.current = false
  }

  const isStaleClaim = (operation: { epoch: number; openSeq: number }) =>
    !mountedRef.current ||
    latestRef.current.epoch !== operation.epoch ||
    openSeqRef.current !== operation.openSeq

  const releaseLeaseIfHeld = useCallback(() => {
    if (modalLease === tokenRef.current) {
      modalLease = null
      for (const subscriber of [...leaseReleaseSubscribers]) {
        subscriber()
      }
    }
  }, [])

  const openModal = useCallback(() => {
    if (!focusedRef.current) {
      return
    }
    if (modalLease !== null && modalLease !== tokenRef.current) {
      return
    }
    modalLease = tokenRef.current
    openSeqRef.current += 1
    setOpen(true)
  }, [])

  const resetClaimVisuals = useCallback(() => {
    setClaimPhase('idle')
    setClaimError(null)
    setClaimResult(null)
  }, [])

  const presentIfAllowed = useCallback(() => {
    if (!armedRef.current || !focusedRef.current || openRef.current) {
      return
    }
    const claimableWindow = claimableWindowRef.current
    if (
      dismissedReward !== null &&
      claimableWindow !== null &&
      dismissedReward.sessionKey === claimableWindow.sessionKey &&
      dismissedReward.loginStreak === claimableWindow.loginStreak
    ) {
      armedRef.current = false
      return
    }
    openModal()
  }, [openModal])

  const hideModal = useCallback(() => {
    openSeqRef.current += 1
    setOpen(false)
    resetClaimVisuals()
  }, [resetClaimVisuals])

  const closeModal = useCallback(() => {
    armedRef.current = false
    const claimableWindow = claimableWindowRef.current
    if (claimableWindow !== null) {
      dismissedReward = {
        sessionKey: claimableWindow.sessionKey,
        loginStreak: claimableWindow.loginStreak,
      }
    }
    hideModal()
  }, [hideModal])

  useEffect(() => {
    if (!open) {
      releaseLeaseIfHeld()
    }
  }, [open, releaseLeaseIfHeld])
  useEffect(() => {
    mountedHostCount += 1
    const onLeaseRelease = () => {
      if (modalLease === null) {
        presentIfAllowed()
      }
    }
    leaseReleaseSubscribers.add(onLeaseRelease)
    return () => {
      mountedHostCount -= 1
      if (mountedHostCount === 0) {
        dismissedReward = null
      }
      leaseReleaseSubscribers.delete(onLeaseRelease)
      releaseLeaseIfHeld()
    }
  }, [presentIfAllowed, releaseLeaseIfHeld])
  useEffect(() => {
    if ((!eligible || !focused) && open) {
      hideModal()
    }
  }, [eligible, focused, open, hideModal])

  const status: LoginRewardStatusResponse | null = (() => {
    if (
      claimOverlay !== null &&
      claimOverlay.epoch === epoch &&
      (data === undefined || data.seq <= claimOverlay.coversThrough)
    ) {
      return claimOverlay.status
    }
    return data?.status ?? null
  })()
  const canClaimNow = eligible && status?.canClaim === true
  claimableWindowRef.current =
    canClaimNow && status !== null
      ? { sessionKey, loginStreak: status.loginStreak }
      : null
  useEffect(() => {
    if (!canClaimNow) {
      prevClaimableRef.current = false
      armedRef.current = false
      return
    }
    if (!prevClaimableRef.current) {
      prevClaimableRef.current = true
      armedRef.current = true
    }
    if (!armedRef.current || open || !focused) {
      return
    }
    const timer = setTimeout(presentIfAllowed, AUTO_OPEN_DELAY_MS)
    return () => clearTimeout(timer)
  }, [canClaimNow, focused, open, presentIfAllowed])

  useEffect(() => {
    if (claimPhase === 'success' && open) {
      const timer = setTimeout(hideModal, AUTO_CLOSE_MS)
      return () => clearTimeout(timer)
    }
  }, [claimPhase, open, hideModal])

  const handleClaim = async () => {
    if (claimBusyForRef.current === epoch) {
      return
    }
    claimBusyForRef.current = epoch
    const operation = { epoch, openSeq: openSeqRef.current }
    setClaimPhase('claiming')
    setClaimError(null)
    try {
      const result = await api.claimLoginReward()
      if (result.success) {
        if (!isStaleClaim(operation)) {
          if (
            result.updatedStatus !== undefined &&
            typeof result.updatedStatus.canClaim === 'boolean'
          ) {
            setClaimOverlay({
              epoch,
              coversThrough: statusSeqRef.current,
              status: result.updatedStatus,
            })
          }
          setClaimResult(result)
          setClaimPhase('success')
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success
          ).catch(() => undefined)
        }
        refresh()
        return
      }
      refresh()
      if (isStaleClaim(operation)) {
        return
      }
      setClaimError(result.error || 'Failed to claim reward')
      setClaimPhase('error')
    } catch (reason) {
      if (isStaleClaim(operation)) {
        return
      }
      const caught = toError(reason)
      if (isUnauthorizedError(caught)) {
        reconcileSession()
        return
      }
      refresh()
      setClaimError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Claim failed. Please try again.'
      )
      setClaimPhase('error')
    } finally {
      if (claimBusyForRef.current === operation.epoch) {
        claimBusyForRef.current = null
      }
    }
  }

  return (
    <LoginRewardModal
      status={status}
      open={open && eligible && focused}
      claimPhase={claimPhase}
      claimError={claimError}
      claimResult={claimResult}
      onClaim={() => {
        void handleClaim()
      }}
      onClose={closeModal}
    />
  )
}
