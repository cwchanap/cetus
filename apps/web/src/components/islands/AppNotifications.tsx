import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import type { AchievementNotification } from '@cetus/shared/achievements'
import type { ChallengeUpdatesPayload } from '@cetus/shared/api-dto'
import { cn } from '@cetus/ui'
// Deep paths: these components ship a stylesheet, so importing them
// through the barrel would attach that CSS to every barrel consumer.
import { AchievementAwardCard } from '@cetus/ui/components/achievement-award'
import { ChallengeCompleteCard } from '@cetus/ui/components/challenge-complete'

/**
 * Web-owned notification island (HPA-379 Stage 4). One mount per page,
 * either in AppLayout's default notifications slot or a game page's
 * `slot="notifications"` fragment. Owns the achievement and
 * challenge-complete queues and registers the `window.showAchievementAward`
 * / `window.showChallengeComplete` bridge consumed by the score service and
 * game initializers; the globals are removed again on unmount.
 */
interface ChallengeView {
  challenge: ChallengeUpdatesPayload['completedChallenges'][number]
  levelUp: boolean
  newLevel?: number
}

export function AppNotifications() {
  // --- Achievement award queue (port of the AchievementAward controller) ---
  const [achievement, setAchievement] =
    useState<AchievementNotification | null>(null)
  const achievementQueueRef = useRef<AchievementNotification[]>([])
  const achievementBusyRef = useRef(false)
  const dismissAchievementRef = useRef<(() => void) | null>(null)
  const awardOverlayRef = useRef<HTMLDivElement | null>(null)
  const awardBackdropRef = useRef<HTMLDivElement | null>(null)
  const awardContainerRef = useRef<HTMLDivElement | null>(null)

  const processAchievementQueue = useCallback(() => {
    const next = achievementQueueRef.current.shift()
    if (!next) {
      achievementBusyRef.current = false
      return
    }

    achievementBusyRef.current = true
    setAchievement(next)
  }, [])

  const enqueueAchievements = useCallback(
    (achievements: AchievementNotification[]) => {
      if (!achievements || achievements.length === 0) {
        return
      }
      achievementQueueRef.current.push(...achievements)
      if (!achievementBusyRef.current) {
        processAchievementQueue()
      }
    },
    [processAchievementQueue]
  )

  // Single-achievement lifecycle: animate in, wait for dismissal (click,
  // Enter/Space or the 5s auto-dismiss), animate out, pace the queue.
  useEffect(() => {
    if (!achievement) {
      return
    }
    const overlay = awardOverlayRef.current
    const backdrop = awardBackdropRef.current
    const container = awardContainerRef.current
    if (!overlay || !backdrop || !container) {
      return
    }

    let cancelled = false
    let autoDismissTimer: number | undefined
    overlay.style.display = 'flex'

    // Start listening for dismissal before the entrance animation so clicks
    // during the entrance are accepted (parity with the previous controller).
    const dismissed = new Promise<void>(resolve => {
      let resolved = false
      const resolveOnce = () => {
        if (!resolved) {
          resolved = true
          resolve()
        }
      }
      autoDismissTimer = window.setTimeout(resolveOnce, 5000)
      dismissAchievementRef.current = () => {
        window.clearTimeout(autoDismissTimer)
        resolveOnce()
      }
    })

    const run = async () => {
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          backdrop.style.opacity = '1'
          container.style.transform = 'scale(1)'
          container.style.opacity = '1'
          setTimeout(resolve, 700)
        })
      })
      await dismissed
      if (cancelled) {
        return
      }
      backdrop.style.opacity = '0'
      container.style.transform = 'scale(0.9)'
      container.style.opacity = '0'
      await new Promise(resolve => setTimeout(resolve, 500))
      if (cancelled) {
        return
      }
      overlay.style.display = 'none'
      setAchievement(null)
      setTimeout(() => {
        processAchievementQueue()
      }, 1000)
    }

    void run()

    return () => {
      cancelled = true
      dismissAchievementRef.current = null
      if (autoDismissTimer !== undefined) {
        window.clearTimeout(autoDismissTimer)
      }
    }
  }, [achievement, processAchievementQueue])

  const dismissCurrentAchievement = useCallback(() => {
    dismissAchievementRef.current?.()
  }, [])

  // --- Challenge complete queue (port of the ChallengeComplete controller) ---
  const [challengeView, setChallengeView] = useState<ChallengeView | null>(null)
  const challengeQueueRef = useRef<ChallengeUpdatesPayload[]>([])
  const challengeBusyRef = useRef(false)
  const challengeCardRef = useRef<HTMLDivElement | null>(null)
  const resolveChallengeDismissRef = useRef<(() => void) | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const dismissChallenge = useCallback(() => {
    setChallengeView(null)
    const resolver = resolveChallengeDismissRef.current
    resolveChallengeDismissRef.current = null
    resolver?.()
  }, [])

  const processChallengeQueue = useCallback(async () => {
    while (challengeQueueRef.current.length > 0) {
      const data = challengeQueueRef.current[0]
      const completedChallenges = Array.isArray(data.completedChallenges)
        ? data.completedChallenges
        : []
      if (!completedChallenges.length) {
        challengeQueueRef.current.shift()
        continue
      }

      challengeBusyRef.current = true
      for (let i = 0; i < completedChallenges.length; i++) {
        const challenge = completedChallenges[i]
        const isLast = i === completedChallenges.length - 1
        setChallengeView({
          challenge,
          levelUp: isLast ? data.levelUp : false,
          newLevel: isLast ? data.newLevel : undefined,
        })
        await new Promise<void>(resolve => {
          resolveChallengeDismissRef.current = resolve
        })
      }

      challengeQueueRef.current.shift()
      setChallengeView(null)
    }
    challengeBusyRef.current = false
  }, [])

  const enqueueChallenge = useCallback(
    (challengeUpdates: ChallengeUpdatesPayload) => {
      // Parity with the AppLayout stub: a nullish payload would sit at the
      // queue head and throw in processChallengeQueue, never shifted off.
      if (!challengeUpdates) {
        return
      }
      challengeQueueRef.current.push(challengeUpdates)
      if (!challengeBusyRef.current) {
        void processChallengeQueue()
      }
    },
    [processChallengeQueue]
  )

  // Focus management, focus trap and keyboard dismissal while a challenge
  // card is showing.
  useEffect(() => {
    if (!challengeView) {
      return
    }

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismissChallenge()
        return
      }
      if (event.key !== 'Tab') {
        return
      }

      const card = challengeCardRef.current
      const focusable = card
        ? Array.from(
            card.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
          ).filter(
            el =>
              !el.hasAttribute('disabled') &&
              el.getAttribute('aria-hidden') !== 'true' &&
              el.offsetParent !== null
          )
        : []
      if (focusable.length === 0) {
        event.preventDefault()
        card?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || !card?.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !card?.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeydown)
    const frame = requestAnimationFrame(() => {
      const target =
        challengeCardRef.current?.querySelector<HTMLElement>(
          '#challenge-continue'
        ) ?? challengeCardRef.current
      target?.focus()
    })

    return () => {
      document.removeEventListener('keydown', handleKeydown)
      cancelAnimationFrame(frame)
      const previous = previouslyFocusedRef.current
      previouslyFocusedRef.current = null
      if (
        previous &&
        document.contains(previous) &&
        typeof previous.focus === 'function'
      ) {
        previous.focus()
      }
    }
  }, [challengeView, dismissChallenge])

  // Auto-dismiss the challenge card after 5 seconds.
  useEffect(() => {
    if (!challengeView) {
      return
    }
    const timer = window.setTimeout(() => dismissChallenge(), 5000)
    return () => window.clearTimeout(timer)
  }, [challengeView, dismissChallenge])

  const handleChallengeOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    // Dismiss whenever the click lands outside the card (overlay, backdrop,
    // or the centering wrapper). Clicks inside the card are preserved.
    if (
      challengeCardRef.current &&
      !challengeCardRef.current.contains(event.target as Node)
    ) {
      dismissChallenge()
    }
  }

  // Window bridge: take over from the AppLayout inline stubs, replay any
  // calls that arrived before hydration (the backlog the stubs fill), and
  // clean up on unmount so there is never a second owner of these globals.
  useEffect(() => {
    const backlog = window.__cetusNotificationBacklog
    window.showAchievementAward = enqueueAchievements
    window.showChallengeComplete = enqueueChallenge
    if (backlog) {
      delete window.__cetusNotificationBacklog
      if (backlog.achievements.length > 0) {
        enqueueAchievements(backlog.achievements)
      }
      backlog.challenges.forEach(enqueueChallenge)
    }
    return () => {
      delete window.showAchievementAward
      delete window.showChallengeComplete
    }
  }, [enqueueAchievements, enqueueChallenge])

  return (
    <>
      {/* Achievement Award Overlay */}
      <div
        ref={awardOverlayRef}
        id="achievement-award-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        style={{ display: 'none' }}
      >
        {/* Backdrop */}
        <div
          ref={awardBackdropRef}
          id="achievement-award-backdrop"
          className="absolute inset-0 bg-black/70 backdrop-blur-sm opacity-0 transition-opacity duration-500 pointer-events-none"
        />

        {/* Achievement Award Container */}
        <div
          ref={awardContainerRef}
          id="achievement-award-container"
          className="relative mx-4 transform scale-75 opacity-0 transition-all duration-700 ease-out pointer-events-auto flex items-center justify-center"
        >
          {achievement && (
            <AchievementAwardCard
              achievement={achievement}
              onDismiss={dismissCurrentAchievement}
            />
          )}
        </div>
      </div>

      {/* Challenge Complete Overlay */}
      <div
        id="challenge-complete-overlay"
        className={cn('fixed inset-0 z-50', !challengeView && 'hidden')}
        aria-hidden={!challengeView}
        onClick={handleChallengeOverlayClick}
      >
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          data-overlay-backdrop="true"
        />
        <div className="relative flex items-center justify-center min-h-screen p-4">
          {challengeView && (
            <div
              id="challenge-complete-card"
              ref={challengeCardRef}
              className="relative max-w-md w-full"
              role="dialog"
              aria-modal="true"
              aria-labelledby="challenge-name"
              tabIndex={-1}
            >
              <ChallengeCompleteCard
                challenge={challengeView.challenge}
                levelUp={challengeView.levelUp}
                newLevel={challengeView.newLevel}
                onContinue={dismissChallenge}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default AppNotifications
