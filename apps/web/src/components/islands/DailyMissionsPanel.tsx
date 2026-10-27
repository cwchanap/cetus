import {
  DailyMissionsPanel as DailyMissionsPanelView,
  type DailyMissionsPanelProps,
} from '@cetus/ui'

/**
 * Dashboard daily-missions island (HPA-379). Hydration entry point lives
 * in components/islands/ like the other interactive panels; the view is a
 * pass-through to the @cetus/ui component, which owns the countdown tick.
 */
export function DailyMissionsPanel(props: DailyMissionsPanelProps) {
  return <DailyMissionsPanelView {...props} />
}

export default DailyMissionsPanel
