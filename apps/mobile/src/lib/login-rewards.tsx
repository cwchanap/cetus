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
import { isUnauthorizedError, toError, useRefetchOnFocus } from './refetch'
import {
  useOperationEpoch,
  useSessionGuard,
  useUnauthorizedReconcile,
} from './session'

type ClaimPhase = 'idle' | 'claiming' | 'success' | 'error'

const AUTO_OPEN_DELAY_MS = 500
const AUTO_CLOSE_MS = 3000

let modalLease: object | null = null
const leaseReleaseSubscribers = new Set<() => void>()
// Identifies the concrete reward a claim retired: `sessionKey` scopes the
// broadcast to the session that claimed (a claim resolving after an account
// switch must not dismiss the next account's offer), and `cycleDay`
// distinguishes the claimed offer from newer same-day truth (e.g. a
// rollover to the next cycle day), which must still be allowed to open the
// modal.
type ClaimedWindow = {
  sessionKey: string | null
  rewardDate: string
  cycleDay: number | null
}
const claimSubscribers = new Set<
  (claimedBy: object, claimed: ClaimedWindow) => void
>()
let mountedHostCount = 0
let dismissedReward: {
  sessionKey: string | null
  rewardDate: string
  cycleDay: number | null
} | null = null

// A successful claim changes XP/level server-side; sibling surfaces on the
// same screen (the profile's dive stats) and sibling hosts on other tabs
// subscribe to refetch since closing the modal is not a navigation focus
// change. The claiming host passes its lease token as `claimedBy` plus the
// claimed reward's identity so other hosts can refetch and dismiss the
// retired offer without the claimer double-fetching. Returns an unsubscribe.
export function onLoginRewardClaimed(
  listener: (claimedBy: object, claimed: ClaimedWindow) => void
): () => void {
  claimSubscribers.add(listener)
  return () => {
    claimSubscribers.delete(listener)
  }
}

export function LoginRewardHost() {
  const { isPending, userId, sessionKey, authExpired, reconcileSession } =
    useSessionGuard()
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
  useUnauthorizedReconcile([error], reconcileSession)

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
  const { latest: latestRef, isStale } = useOperationEpoch(sessionKey, eligible)
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
    cycleDay: number | null
  } | null>(null)

  // Sibling hosts on the same session refetch immediately when a claim
  // lands elsewhere. Anything they currently offer is pre-claim truth, so
  // disarm it and mark the claimed reward dismissed: a stale response
  // landing after this broadcast (one that read the server before the
  // claim committed) cannot reopen the modal for the retired reward. A
  // claim broadcast from another session (e.g. a stale in-flight claim
  // resolving after sign-out) is not this account's truth — ignore it.
  useEffect(
    () =>
      onLoginRewardClaimed((claimedBy, claimed) => {
        if (
          claimedBy === tokenRef.current ||
          claimed.sessionKey !== sessionKey
        ) {
          return
        }
        armedRef.current = false
        dismissedReward = {
          sessionKey,
          rewardDate: claimed.rewardDate,
          cycleDay: claimed.cycleDay,
        }
        refresh()
      }),
    [refresh, sessionKey]
  )

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
    isStale(operation.epoch) || openSeqRef.current !== operation.openSeq

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
      dismissedReward.rewardDate === claimableWindow.rewardDate &&
      dismissedReward.cycleDay === claimableWindow.cycleDay
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
        cycleDay: claimableWindow.cycleDay,
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
  const claimableCycleDay = canClaimNow
    ? (status?.todayReward?.day ?? null)
    : null
  claimableWindowRef.current =
    claimableDate !== null
      ? {
          sessionKey,
          rewardDate: claimableDate,
          cycleDay: claimableCycleDay,
        }
      : null
  useEffect(() => {
    if (claimableDate === null) {
      prevWindowRef.current = null
      armedRef.current = false
      return
    }
    // Re-arm only when the offered reward changes identity: refetches
    // returning the same claimable day must not reopen a dismissed or
    // suppressed window, but genuinely newer truth (next cycle day) must.
    const windowKey = `${claimableDate}:${claimableCycleDay}`
    if (prevWindowRef.current !== windowKey) {
      prevWindowRef.current = windowKey
      armedRef.current = true
    }
    if (!armedRef.current || open || !focused) {
      return
    }
    const timer = setTimeout(presentIfAllowed, AUTO_OPEN_DELAY_MS)
    return () => clearTimeout(timer)
  }, [claimableDate, claimableCycleDay, focused, open, presentIfAllowed])

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
      sessionKey,
      cycleDay: status?.todayReward?.day ?? null,
    }
    setClaimPhase('claiming')
    setClaimError(null)
    try {
      const result = await api.claimLoginReward()
      if (result.success) {
        // The reward is claimed server-side regardless of this host's visual
        // state: mark it dismissed so this host and siblings still holding a
        // stale canClaim status cannot reopen the modal for it.
        dismissedReward = {
          sessionKey: operation.sessionKey,
          rewardDate: operation.requestDate,
          cycleDay: operation.cycleDay,
        }
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
          subscriber(tokenRef.current, {
            sessionKey: operation.sessionKey,
            rewardDate: operation.requestDate,
            cycleDay: operation.cycleDay,
          })
        }
        return
      }
      if (!isStale(operation.epoch)) {
        refresh()
      }
      if (isStaleClaim(operation)) {
        return
      }
      setClaimError(result.error || 'Failed to claim reward')
      setClaimPhase('error')
    } catch (reason) {
      const sameSession = !isStale(operation.epoch)
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
