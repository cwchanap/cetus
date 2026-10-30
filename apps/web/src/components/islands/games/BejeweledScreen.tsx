import { useEffect, useRef } from 'react'

/**
 * Bejeweled field-plate host island (HPA-393 Stage 4). Static markup
 * byte-equal to the route's `.plate-width.field-plate` body; the extracted
 * controller (lib/games/bejeweled/controller.ts) exclusively owns all
 * descendant DOM — no React state renders or re-renders any node inside
 * the host. `signedIn` flows into `data-signed-in` for the controller.
 */
export default function BejeweledScreen({ signedIn }: { signedIn: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | void>(undefined)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let disposed = false
    const controller = new AbortController()
    controllerRef.current = controller
    void (async () => {
      const { mount } = await import('@/lib/games/bejeweled/controller')
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
          <p className="micro accent eyebrow">Pl. III — Shallow · 0–200 m</p>
          <h1>Bejeweled</h1>
        </div>
        <div className="tools">
          <button
            className="icon-button"
            data-sheet="commission"
            aria-label="Today's commission"
            title="Today's commission"
          >
            💎
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
        <div className="time-stat">
          <div className="micro">Time left</div>
          <div id="time-remaining" className="large-stat accent">
            60
          </div>
          <progress
            id="time-fill"
            max={60}
            value={60}
            aria-label="Time remaining"
          />
        </div>
        <div className="small-stats">
          <div>
            <div className="micro">Best</div>
            <div className="stat-value" data-best>
              —
            </div>
          </div>
          <div>
            <div className="micro">Moves</div>
            <div className="stat-value" id="moves">
              0
            </div>
          </div>
        </div>
        <div className="cascade">
          <div className="cascade-label micro">
            <span>Cascade</span>
            <span id="cascade-label">Idle</span>
          </div>
          <div id="cascade-pips" aria-hidden="true">
            {Array.from({ length: 5 }, (_, pip) => (
              <span key={pip} />
            ))}
          </div>
          <div className="micro chain-note">
            Best chain this run ·{' '}
            <span id="max-combo" className="amber">
              ×0
            </span>
          </div>
        </div>
      </div>
      <div className="play-area">
        <div className="plate-frame">
          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(c => (
            <span key={c} className={`corner ${c}`} aria-hidden="true" />
          ))}
          <div id="bejeweled-container" aria-label="Bejeweled playfield"></div>
        </div>
        <div className="board-tray">
          <p className="micro" id="board-notice" role="status">
            Drag a gem onto its neighbour
          </p>
          <button
            id="hint-btn"
            className="tray-action"
            title="Show a legal swap (H)"
            disabled
          >
            ✦ Hint
          </button>
        </div>
        <p className="micro controls-hint">
          Tap to select · Drag to swap · Arrows + Enter
        </p>
      </div>
    </div>
  )
}
