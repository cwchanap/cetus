import { useEffect, useRef } from 'react'

/**
 * 2048 field-plate host island (HPA-393 Stage 4). Static markup byte-equal
 * to the route's `.plate-width.field-plate` body; the extracted controller
 * (lib/games/2048/controller.ts) exclusively owns all descendant DOM — no
 * React state renders or re-renders any node inside the host. `signedIn`
 * flows into `data-signed-in` for the controller. The ascent ladder is the
 * same [64…4096] constant the route frontmatter rendered pre-migration.
 */
const ladder = [64, 128, 256, 512, 1024, 2048, 4096]

export default function Game2048Screen({ signedIn }: { signedIn: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | void>(undefined)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let disposed = false
    const controller = new AbortController()
    controllerRef.current = controller
    void (async () => {
      const { mount } = await import('@/lib/games/2048/controller')
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
            Pl. XII — Mid-water · 200–1 000 m
          </p>
          <h1>2048</h1>
        </div>
        <div className="tools">
          <button
            className="icon-button"
            data-sheet="commission"
            aria-label="Today's commission"
            title="Today's commission"
          >
            ⭐
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
          <span className="micro">Score</span>
          <strong id="score-display">0</strong>
        </div>
        <div className="best-stat">
          <span className="micro">Best</span>
          <strong data-best>—</strong>
        </div>
        <div className="ascent">
          <div className="record-line">
            <span className="micro">Ascent</span>
            <span id="next-target" className="micro accent">
              Next · 64
            </span>
          </div>
          <div className="ladder" aria-label="Highest tile milestones">
            {ladder.map(value => (
              <span
                key={value}
                data-milestone={value}
                title={String(value)}
                aria-label={String(value)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="play-area">
        <div className="board-frame">
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          <div id="game-2048-container"></div>
          <div id="merge-feedback" className="mono" aria-hidden="true"></div>
        </div>
        <div className="board-footer">
          <p id="board-warning" className="micro amber"></p>
          <button
            id="undo-btn"
            className="undo-button"
            title="Step back one move (U)"
            disabled
          >
            ↶ Undo · <span id="undos-left">1</span>
          </button>
        </div>
        <p
          id="game-status"
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        ></p>
      </div>
    </div>
  )
}
