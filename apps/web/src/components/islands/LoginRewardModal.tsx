import { useEffect, useRef, useState } from 'react'
import { ApiClientError, createApiClient } from '@cetus/api-client/api-client'
import type {
  LoginRewardClaimResponse,
  LoginRewardStatusResponse,
} from '@cetus/shared/api-dto'
import { LoginRewardModal as LoginRewardModalView } from '@cetus/ui'

/**
 * Web-owned login-reward island (HPA-379 Stage 4). Astro passes only the
 * serializable server status; the claim API call, auto-show and phase
 * transitions live here. The unused `window.loginRewardModal` global from
 * the previous controller was dropped intentionally.
 */
export interface LoginRewardModalProps {
  status: LoginRewardStatusResponse | null
}

const api = createApiClient()

export function LoginRewardModal({
  status: initialStatus,
}: LoginRewardModalProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(initialStatus)
  const [claimPhase, setClaimPhase] = useState<
    'idle' | 'claiming' | 'success' | 'error'
  >('idle')
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimResult, setClaimResult] =
    useState<LoginRewardClaimResponse | null>(null)
  const claimingRef = useRef(false)

  // Auto-show when the reward is claimable (500ms render delay, like the
  // previous controller).
  useEffect(() => {
    if (initialStatus?.canClaim) {
      const timer = setTimeout(() => setOpen(true), 500)
      return () => clearTimeout(timer)
    }
  }, [initialStatus])

  // Success auto-closes after 3s; error resets the button after 2s.
  useEffect(() => {
    if (claimPhase === 'success') {
      const timer = setTimeout(() => setOpen(false), 3000)
      return () => clearTimeout(timer)
    }
    if (claimPhase === 'error') {
      const timer = setTimeout(() => {
        setClaimPhase('idle')
        setClaimError(null)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [claimPhase])

  const handleClaim = async () => {
    if (claimingRef.current) {
      return
    }
    claimingRef.current = true
    setClaimPhase('claiming')

    try {
      const result = await api.claimLoginReward()

      if (result.success) {
        if (result.updatedStatus) {
          setStatus(result.updatedStatus)
        }
        setClaimResult(result)
        setClaimPhase('success')
      } else {
        setClaimError(result.error || 'Failed to claim reward')
        setClaimPhase('error')
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.kind !== 'network') {
        console.error('Claim failed:', error.status, error.message)
        setClaimError('Claim failed. Please try again later.')
      } else {
        console.error('Failed to claim reward:', error)
        setClaimError('Network error. Please try again.')
      }
      setClaimPhase('error')
    } finally {
      claimingRef.current = false
    }
  }

  return (
    <LoginRewardModalView
      status={status}
      open={open}
      claimPhase={claimPhase}
      claimError={claimError}
      claimResult={claimResult}
      onClaim={() => {
        void handleClaim()
      }}
      onClose={() => setOpen(false)}
    />
  )
}

export default LoginRewardModal
