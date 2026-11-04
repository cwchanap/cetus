import { useCallback, useEffect, useRef, useState } from 'react'
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
const ERROR_RESET_MS = 2000

let modalLease: object | null = null

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

  const { data, error, refresh } = useRemoteData<LoginRewardStatusResponse>(
    useCallback(() => api.getLoginRewardStatus(), []),
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
    status: LoginRewardStatusResponse
  } | null>(null)
  const [flowFor, setFlowFor] = useState<string | null>(sessionKey)
  if (flowFor !== sessionKey) {
    setFlowFor(sessionKey)
    setOpen(false)
    setClaimPhase('idle')
    setClaimError(null)
    setClaimResult(null)
    setClaimOverlay(null)
  }

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
  const tokenRef = useRef<object>({})
  const claimingRef = useRef(false)
  const isStaleClaim = (operation: { epoch: number; openSeq: number }) =>
    !mountedRef.current ||
    latestRef.current.epoch !== operation.epoch ||
    openSeqRef.current !== operation.openSeq

  const openModal = useCallback(() => {
    if (modalLease !== null && modalLease !== tokenRef.current) {
      return
    }
    modalLease = tokenRef.current
    openSeqRef.current += 1
    setOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    openSeqRef.current += 1
    setOpen(false)
    setClaimPhase('idle')
    setClaimError(null)
    setClaimResult(null)
  }, [])

  useEffect(() => {
    if (!open && modalLease === tokenRef.current) {
      modalLease = null
    }
  }, [open])
  useEffect(
    () => () => {
      if (modalLease === tokenRef.current) {
        modalLease = null
      }
    },
    []
  )
  useEffect(() => {
    if (!eligible && open) {
      openSeqRef.current += 1
      setOpen(false)
    }
  }, [eligible, open])

  const status: LoginRewardStatusResponse | null =
    claimOverlay !== null && claimOverlay.epoch === epoch
      ? claimOverlay.status
      : (data ?? null)
  const canClaimNow = eligible && status?.canClaim === true
  const prevClaimableRef = useRef(false)
  useEffect(() => {
    if (!canClaimNow) {
      prevClaimableRef.current = false
      return
    }
    if (prevClaimableRef.current) {
      return
    }
    prevClaimableRef.current = true
    const timer = setTimeout(openModal, AUTO_OPEN_DELAY_MS)
    return () => clearTimeout(timer)
  }, [canClaimNow, openModal])

  useEffect(() => {
    if (claimPhase === 'success' && open) {
      const timer = setTimeout(closeModal, AUTO_CLOSE_MS)
      return () => clearTimeout(timer)
    }
    if (claimPhase === 'error') {
      const timer = setTimeout(() => {
        setClaimPhase('idle')
        setClaimError(null)
      }, ERROR_RESET_MS)
      return () => clearTimeout(timer)
    }
  }, [claimPhase, open, closeModal])

  const handleClaim = async () => {
    if (claimingRef.current) {
      return
    }
    claimingRef.current = true
    const operation = { epoch, openSeq: openSeqRef.current }
    setClaimPhase('claiming')
    setClaimError(null)
    try {
      const result = await api.claimLoginReward()
      if (result.success) {
        refresh()
        if (isStaleClaim(operation)) {
          return
        }
        if (
          result.updatedStatus !== undefined &&
          typeof result.updatedStatus.canClaim === 'boolean'
        ) {
          setClaimOverlay({ epoch, status: result.updatedStatus })
        }
        setClaimResult(result)
        setClaimPhase('success')
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        ).catch(() => undefined)
        return
      }
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
      setClaimError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Claim failed. Please try again.'
      )
      setClaimPhase('error')
    } finally {
      claimingRef.current = false
    }
  }

  return (
    <LoginRewardModal
      status={status}
      open={open && eligible}
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
