import { Play } from 'lucide-react'
import { Link } from 'react-router'

export function VideoThumb({ posterUrl, href, company }: { posterUrl: string | null; href: string; company: string }) {
  if (posterUrl === null) {
    return (
      <span className="grid h-12 w-20 shrink-0 place-items-center rounded-md border border-dashed bg-muted text-[11px] text-muted-foreground">
        No video
      </span>
    )
  }
  return (
    <Link
      to={href}
      aria-label={`Open the video of ${company}`}
      className="group/thumb relative block h-12 w-20 shrink-0 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img src={posterUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow-sm transition-transform group-hover/thumb:scale-110 motion-reduce:transition-none"
      >
        <Play className="size-3 translate-x-px fill-current" />
      </span>
    </Link>
  )
}
