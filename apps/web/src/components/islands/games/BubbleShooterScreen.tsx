import { useEffect, useRef } from 'react'
import { DEFAULT_BUBBLE_SHOOTER_CONFIG } from '@cetus/games/bubble-shooter/BubbleShooterGame'

const { rowAddInterval, shooterY, bubbleRadius, gameHeight } =
  DEFAULT_BUBBLE_SHOOTER_CONFIG
// Same pure derivation the route frontmatter performed (byte-equal markup).
const limitPercent = ((shooterY - bubbleRadius * 5) / gameHeight) * 100

/**
 * Bubble Shooter field-plate host island (HPA-393 Stage 4). Static markup
 * byte-equal to the route's `.plate-width.field-plate` body; the extracted
 * controller (lib/games/bubble-shooter/controller.ts) exclusively owns all
 * descendant DOM — no React state renders or re-renders any node inside
 * the host. `signedIn` flows into `data-signed-in` for the controller.
 */
export default function BubbleShooterScreen({
  signedIn,
}: {
  signedIn: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | void>(undefined)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let disposed = false
    const controller = new AbortController()
    controllerRef.current = controller
    void (async () => {
      const { mount } = await import('@/lib/games/bubble-shooter/controller')
      if (disposed || !hostRef.current) {
        controller.abort()
        return
      }
      cleanupRef.current = mount(hostRef.current, controller.signal)
    })()
    return () => {
      disposed = true
      const cleanup = cleanupRef.current
      if (typeof cleanup === 'function') {
        cleanup()
      }
      controllerRef.current?.abort()
    }
  }, [])

  return (
    <div
      ref={hostRef}
      className="plate-width field-plate"
      data-signed-in={signedIn}
    >
      <div className="title-row">
        <div>
          <p className="micro accent eyebrow">
            Pl. II — Mid-water · 200–1 000 m
          </p>
          <h1>Bubble Shooter</h1>
        </div>
        <div className="tools">
          <button
            type="button"
            className="icon-button"
            data-sheet="help"
            aria-label="How it plays"
            title="How it plays"
          >
            ?
          </button>
          <button
            type="button"
            className="icon-button"
            data-sheet="log"
            aria-label="Field log"
            title="Field log"
          >
            ▤
          </button>
          <button
            type="button"
            id="pause-btn"
            className="icon-button"
            aria-label="Pause"
            title="Pause (P)"
            disabled
          >
            Ⅱ
          </button>
        </div>
      </div>

      <div className="hud" aria-label="Dive statistics">
        <div className="score-stat">
          <div className="micro">Score</div>
          <div id="score">0</div>
        </div>
        <div className="small-stats">
          <div>
            <div className="micro">Best</div>
            <div className="stat-value" data-best>
              —
            </div>
          </div>
          <div>
            <div className="micro">Released</div>
            <div id="bubbles-popped" className="stat-value ice">
              0
            </div>
          </div>
          <div>
            <div className="micro">Chain</div>
            <div className="stat-value">
              ×<span id="largest-combo">0</span>
            </div>
          </div>
        </div>
        <div className="gauge">
          <div className="gauge-label micro">
            <span>Distance to collection limit</span>
            <span id="gauge-label" className="accent">
              Clear
            </span>
          </div>
          <div
            id="colony-gauge"
            className="gauge-track"
            role="meter"
            aria-label="Colony proximity to collection limit"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={0}
          >
            <div id="gauge-fill"></div>
          </div>
          <p className="micro growth-note">
            The colony grows a row every {rowAddInterval} shots
          </p>
        </div>
      </div>

      <div className="play-area">
        <div className="plate-frame">
          <span className="corner top-left" aria-hidden="true"></span>
          <span className="corner top-right" aria-hidden="true"></span>
          <span className="corner bottom-left" aria-hidden="true"></span>
          <span className="corner bottom-right" aria-hidden="true"></span>
          <div className="board-wrap">
            <div
              id="game-container"
              role="group"
              aria-label="Bubble Shooter playfield"
            ></div>
            <div
              className="collection-limit"
              style={{ top: `${limitPercent}%` }}
              aria-hidden="true"
            >
              <span>Collection limit</span>
            </div>
          </div>
        </div>
        <div className="bubble-tray">
          <canvas
            id="current-bubble"
            width={64}
            height={64}
            role="img"
            aria-label="Bubble in hand"
          ></canvas>
          <canvas
            id="next-bubble"
            width={48}
            height={48}
            role="img"
            aria-label="Next bubble"
          ></canvas>
          <span className="micro">In hand · Next</span>
          <button
            type="button"
            id="end-btn"
            className="tray-action"
            style={{ display: 'none' }}
          >
            End dive
          </button>
        </div>
        <p className="micro controls-hint">
          Point to aim · Click or tap to fire · P to pause
        </p>
      </div>
    </div>
  )
}
