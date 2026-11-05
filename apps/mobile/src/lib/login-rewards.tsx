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
import { getTodayUTC } from '@cetus/shared/challenges'

import { api } from './api'
import { authClient } from './auth-client'
import { isUnauthorizedError, useRefetchOnFocus } from './refetch'
import { sessionKeyFor, useExpiredSessionGate } from './session'

type ClaimPhase = 'idle' | 'claiming' | 'success' | 'error'

const AUTO_OPEN_DELAY_MS = 500
const AUTO_CLOSE_MS = 3000

let modalLease: object | null = null
const leaseReleaseSubscribers = new Set<() => void>()
const claimSubscribers = new Set<() => void>()
let mountedHostCount = 0
let dismissedReward: {
  sessionKey: string | null
  rewardDate: string
} | null = null

const toError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new Error(String(reason))

// A successful claim changes XP/level server-side; sibling surfaces on the
// same screen (the profile's dive stats) subscribe to refetch since closing
// the modal is not a navigation focus change. Returns an unsubscribe.
export function onLoginRewardClaimed(listener: () => void): () => void {
  claimSubscribers.add(listener)
  return () => {
    claimSubscribers.delete(listener)
  }
}

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
  const { data, error, loading, refresh } = useRemoteData<{
    seq: number
    status: LoginRewardStatusResponse
    requestDate: string
  }>(
    useCallback(() => {
      const seq = ++statusSeqRef.current
      const requestDate = getTodayUTC()
      return api
        .getLoginRewardStatus()
        .then(status => ({ seq, status, requestDate }))
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
    date: string
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
  const prevWindowRef = useRef<string | null>(null)
  const claimableWindowRef = useRef<{
    sessionKey: string | null
    rewardDate: string
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
    prevWindowRef.current = null
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
      dismissedReward.rewardDate === claimableWindow.rewardDate
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
        rewardDate: claimableWindow.rewardDate,
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

  useEffect(() => {
    if (
      claimOverlay !== null &&
      data !== undefined &&
      data.seq > claimOverlay.coversThrough
    ) {
      setClaimOverlay(null)
    }
  }, [claimOverlay, data])
  useEffect(() => {
    if (
      eligible &&
      !loading &&
      data !== undefined &&
      data.requestDate !== getTodayUTC()
    ) {
      refresh()
    }
  }, [data, eligible, loading, refresh])

  const overlayActive =
    claimOverlay !== null &&
    claimOverlay.epoch === epoch &&
    (data === undefined || data.seq <= claimOverlay.coversThrough)
  const status: LoginRewardStatusResponse | null = overlayActive
    ? claimOverlay.status
    : (data?.status ?? null)
  const statusDate = overlayActive
    ? claimOverlay.date
    : (data?.requestDate ?? null)
  const today = getTodayUTC()
  const canClaimNow =
    eligible && status?.canClaim === true && statusDate === today
  const claimableDate = canClaimNow ? today : null
  claimableWindowRef.current =
    claimableDate !== null ? { sessionKey, rewardDate: claimableDate } : null
  useEffect(() => {
    if (claimableDate === null) {
      prevWindowRef.current = null
      armedRef.current = false
      return
    }
    if (prevWindowRef.current !== claimableDate) {
      prevWindowRef.current = claimableDate
      armedRef.current = true
    }
    if (!armedRef.current || open || !focused) {
      return
    }
    const timer = setTimeout(presentIfAllowed, AUTO_OPEN_DELAY_MS)
    return () => clearTimeout(timer)
  }, [claimableDate, focused, open, presentIfAllowed])

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
    const operation = {
      epoch,
      openSeq: openSeqRef.current,
      requestDate: getTodayUTC(),
    }
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
              date: operation.requestDate,
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
        for (const subscriber of [...claimSubscribers]) {
          subscriber()
        }
        return
      }
      if (mountedRef.current && latestRef.current.epoch === operation.epoch) {
        refresh()
      }
      if (isStaleClaim(operation)) {
        return
      }
      setClaimError(result.error || 'Failed to claim reward')
      setClaimPhase('error')
    } catch (reason) {
      const sameSession =
        mountedRef.current && latestRef.current.epoch === operation.epoch
      if (!sameSession) {
        return
      }
      const caught = toError(reason)
      if (isUnauthorizedError(caught)) {
        reconcileSession()
        return
      }
      refresh()
      if (openSeqRef.current !== operation.openSeq) {
        return
      }
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
