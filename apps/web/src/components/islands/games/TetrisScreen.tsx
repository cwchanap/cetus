import { useEffect, useRef } from 'react'

/**
 * Tetris Challenge field-plate host island (HPA-393 Stage 4). Static markup
 * byte-equal to the route's `.plate-width.field-plate` body; the extracted
 * controller (lib/games/tetris/controller.ts) exclusively owns all
 * descendant DOM — no React state renders or re-renders any node inside
 * the host. `signedIn` flows into `data-signed-in` for the controller.
 */
export default function TetrisScreen({ signedIn }: { signedIn: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | void>(undefined)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let disposed = false
    const controller = new AbortController()
    controllerRef.current = controller
    void (async () => {
      const { mount } = await import('@/lib/games/tetris/controller')
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
            Pl. I — Mid-water · 200–1 000 m
          </p>
          <h1>Tetris Challenge</h1>
        </div>
        <div className="tools">
          <button
            className="icon-button"
            data-sheet="commission"
            aria-label="Today's commission"
            title="Today's commission"
          >
            🎮
          </button>
          <button
            className="icon-button"
            data-sheet="help"
            aria-label="How it plays"
            title="How it plays"
          >
            ?
          </button>
          <button
            className="icon-button"
            data-sheet="log"
            aria-label="Field log"
            title="Field log"
          >
            ▤
          </button>
          <button
            className="icon-button"
            id="pause-btn"
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
          <div id="score" className="large-stat">
            0
          </div>
        </div>
        <div className="small-stats">
          <div>
            <div className="micro">Lines</div>
            <div className="stat-value" id="lines">
              0
            </div>
          </div>
          <div>
            <div className="micro">Best</div>
            <div className="stat-value" data-best>
              —
            </div>
          </div>
          <div>
            <div className="micro">Streak</div>
            <div className="stat-value amber" id="clear-streak">
              ×0
            </div>
          </div>
        </div>
        <div className="descent">
          <div className="descent-label micro">
            <span>
              Descent rate · Level <span id="level">1</span>
            </span>
            <span id="drop-rate" className="accent">
              1.00 s
            </span>
          </div>
          <progress
            id="rate-fill"
            max={100}
            value={4}
            aria-label="Descent rate"
          />
          <div id="next-level" className="micro chain-note">
            10 lines to level 2
          </div>
        </div>
      </div>

      <div className="play-area">
        <div className="plate-frame">
          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(c => (
            <span key={c} className={`corner ${c}`} aria-hidden="true" />
          ))}
          <div id="tetris-container" aria-label="Tetris playfield"></div>
          <div id="clear-flash" aria-hidden="true">
            {Array.from({ length: 20 }, (_, row) => (
              <span key={row} />
            ))}
          </div>
          <div id="line-feedback" className="mono" role="status"></div>
        </div>
        <aside className="piece-trays" aria-label="Upcoming and held forms">
          <div className="piece-tray">
            <p className="micro">Next</p>
            <canvas
              id="next-canvas"
              width={240}
              height={300}
              aria-label="Next three forms"
            />
          </div>
          <button
            id="hold-btn"
            className="piece-tray"
            title="Tap to hold (C)"
            aria-label="Hold piece"
            disabled
          >
            <span className="descent-label micro">
              <span>Hold</span>
              <span id="hold-state" className="accent">
                Ready
              </span>
            </span>
            <canvas
              id="hold-canvas"
              width={240}
              height={140}
              aria-label="Held form"
            />
          </button>
        </aside>
      </div>
      <p className="micro controls-hint">
        Swipe the plate · ← → move · ↑ rotate · ↓ soft · Space drop · C hold
      </p>
    </div>
  )
}
