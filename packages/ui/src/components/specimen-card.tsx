import type { HTMLAttributes } from 'react'
import { getGameUrl, type Game } from '@cetus/shared/games'
import { DEPTH_LABELS } from '@cetus/shared/organisms'
import { Organism } from './organism'
import { cn } from '../lib/utils'
import './specimen-card.css'

export interface SpecimenCardProps extends HTMLAttributes<HTMLAnchorElement> {
  game: Game
  catalogNumber: number
}

export function SpecimenCard({
  game,
  catalogNumber,
  className,
  ...rest
}: SpecimenCardProps) {
  const available = game.isActive
  const depth = game.depth ? DEPTH_LABELS[game.depth] : null
  const n = String(catalogNumber).padStart(2, '0')
  const difficultyFill =
    game.difficulty === 'easy' ? 2 : game.difficulty === 'medium' ? 3 : 5

  return (
    <a
      href={available ? getGameUrl(game.id) : undefined}
      aria-disabled={available ? undefined : 'true'}
      data-testid="specimen-card"
      className={cn(
        'cetus-specimen vessel hud-bracket-host group relative block rounded-2xl p-5 text-center',
        !available && 'opacity-50 pointer-events-none',
        className
      )}
      {...rest}
    >
      <span className="hud-bracket hud-bracket--tl" aria-hidden="true" />
      <span className="hud-bracket hud-bracket--tr" aria-hidden="true" />
      <span className="hud-bracket hud-bracket--bl" aria-hidden="true" />
      <span className="hud-bracket hud-bracket--br" aria-hidden="true" />
      <div className="vessel__lid" />
      <div className="vessel__neck" />
      <div className="vessel__body">
        {available && game.organism ? (
          <Organism identity={game.organism} />
        ) : (
          <span className="vessel__empty" aria-hidden="true" />
        )}
      </div>

      <div className="vessel__meta">
        <div className="vessel__no">[ N°·{n} ]</div>
        <div className="vessel__name">{game.name}</div>
        {depth && (
          <div className="vessel__depth">
            {depth.reading} · {depth.label.toUpperCase()}
          </div>
        )}
        {available ? (
          <div
            className="power-bar"
            role="img"
            aria-label={`difficulty ${game.difficulty}`}
          >
            <span className={cn({ on: difficultyFill >= 1 })} />
            <span className={cn({ on: difficultyFill >= 2 })} />
            <span className={cn({ on: difficultyFill >= 3 })} />
            <span className={cn({ on: difficultyFill >= 4 })} />
            <span className={cn({ on: difficultyFill >= 5 })} />
            <span className="power-bar__label">DIFF·{difficultyFill}</span>
          </div>
        ) : (
          <div className="power-bar power-bar--soon" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span className="power-bar__label">SOON</span>
          </div>
        )}
      </div>
    </a>
  )
}
