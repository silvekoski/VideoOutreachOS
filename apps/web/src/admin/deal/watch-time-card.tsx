import type { DealAnalytics, SlideNumber } from '@mergero/shared'
import { formatDurationS } from '@mergero/shared'
import { SlideWatchChart } from '../components/slide-watch-chart'
import { DealCard } from './deal-card'

interface WatchTimeCardProps {
  analytics: DealAnalytics
  slideNames: Record<SlideNumber, string>
}

export function WatchTimeCard({ analytics, slideNames }: WatchTimeCardProps) {
  const slideName = (slide: SlideNumber) => `${slide}. ${slideNames[slide] ?? `Slide ${slide}`}`
  const facts: [string, string][] = [
    ['Total watch time', formatDurationS(analytics.totalWatchS)],
    ['Stop slide', analytics.stopSlide ? slideName(analytics.stopSlide) : 'None'],
    ['Replays', String(analytics.replays)],
    ['Opens', String(analytics.opens)],
    ['Watched to the end', analytics.completed ? 'Yes' : 'No'],
  ]
  return (
    <DealCard id="watch-time" title="Watch time">
      <div className="grid gap-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {facts.map(([term, value]) => (
            <div key={term}>
              <dt className="text-xs text-muted-foreground">{term}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <SlideWatchChart
          perSlide={analytics.perSlide}
          stopSlide={analytics.stopSlide}
          slideName={slideName}
          labels={{ watch: 'Watch time per slide', stop: 'Stop', slide: 'Slide', replays: 'Replays' }}
        />
      </div>
    </DealCard>
  )
}
