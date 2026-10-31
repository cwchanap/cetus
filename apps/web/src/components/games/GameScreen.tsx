import type { ReactNode } from 'react'
import {
  GameBreadcrumb,
  GameControls,
  GameOverlay,
  GameStats,
  GameTitle,
  type GameControlsProps,
  type GameOverlayProps,
  type GameStatsProps,
} from '@cetus/ui'

/**
 * Shared React chrome for migrated game routes (HPA-393). Mirrors the
 * GamePage.astro shell — breadcrumb, title, two-column board/sidebar,
 * stats, controls, overlay — as a presentational, SSR-importable component:
 * no dynamic imports, no loader registry, no game-id switching. Each game
 * island composes its board, sidebar cards and final stats; run state is
 * driven through the controlled stats/controls/overlay prop pass-throughs.
 */
export interface GameScreenProps {
  /** Game identifier for downstream wiring (stats, achievements). */
  gameId: string
  title: string
  description: string
  icon: string
  /** Imperatively owned board markup; the island mounts its renderer here. */
  board: ReactNode
  /** Sidebar cards below the controls card. */
  sidebarExtras?: ReactNode
  /** Final-stats slot inside the game-over overlay. */
  finalStats?: ReactNode
  /** Pass-through for GameStats (may carry children for extra stat badges). */
  statsProps?: GameStatsProps
  /** Pass-through for GameControls. */
  controlsProps?: GameControlsProps
  /** Custom control markup rendered instead of GameControls (mirrors
   *  GamePage.astro's `controls` slot, same position between stats and
   *  game-info — e.g. Reflex's start/stop pair). */
  controls?: ReactNode
  /** Pass-through for GameOverlay. */
  overlayProps?: GameOverlayProps
}

export function GameScreen({
  title,
  description,
  icon,
  board,
  sidebarExtras,
  finalStats,
  statsProps,
  controlsProps,
  controls,
  overlayProps,
}: GameScreenProps) {
  return (
    <>
      {/* Game Breadcrumb */}
      <GameBreadcrumb icon={icon} title={title} />

      <div className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Game Title */}
          <GameTitle title={title} description={description} />

          {/* Game Container */}
          <div className="flex flex-col lg:flex-row gap-8 items-start justify-center">
            {/* Main Game Board */}
            <div className="flex-shrink-0">{board}</div>

            {/* Game Sidebar */}
            <div className="flex flex-col space-y-6">
              {/* Game Stats */}
              <GameStats {...statsProps} />

              {/* Game Controls (or a page-provided custom control card) */}
              {controls ?? <GameControls {...controlsProps} />}

              {/* Game Information */}
              {sidebarExtras}
            </div>
          </div>
        </div>

        {/* Game Over Overlay */}
        <GameOverlay {...overlayProps}>{finalStats}</GameOverlay>
      </div>
    </>
  )
}
