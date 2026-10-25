import type { HTMLAttributes } from 'react'
import type { OrganismIdentity } from '@cetus/shared/organisms'
import { cn } from '../lib/utils'
import './organism.css'

export interface OrganismProps extends HTMLAttributes<HTMLDivElement> {
  identity: OrganismIdentity
}

export function Organism({ identity, className, ...rest }: OrganismProps) {
  const { shape, color, orb } = identity

  return (
    <div
      className={cn('cetus-org', `cetus-org--${shape}`, className)}
      data-color={color}
      data-orb={orb ? 'true' : undefined}
      aria-hidden="true"
      {...rest}
    >
      {shape === 'orb' && <div className="cetus-org__orb" />}
      {shape === 'chain' && (
        <div className="cetus-org__chain">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      {shape === 'spiral' && (
        <svg
          className="cetus-org__spiral"
          viewBox="0 0 60 60"
          aria-hidden="true"
        >
          <path
            d="M30 30 m0 0 a12 12 0 1 1 12 12 a20 20 0 1 1 -20 -20 a28 28 0 1 1 28 28"
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            pathLength={100}
          />
        </svg>
      )}
      {shape === 'frond' && (
        <div className="cetus-org__frond">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      {shape === 'cluster' && (
        <div className="cetus-org__cluster">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      {shape === 'lattice' && (
        <div className="cetus-org__lattice">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      {orb && <span className="cetus-org__orbit" aria-hidden="true" />}
    </div>
  )
}
