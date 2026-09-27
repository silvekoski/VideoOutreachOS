import { useEffect, useRef } from 'react'
import lottie from 'lottie-web/build/player/lottie_light'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { cn } from '@/lib/utils'

interface LottiePlayerProps {
  animationData: unknown
  className?: string
  staticFrame?: number
}

export function LottiePlayer({ animationData, className, staticFrame }: LottiePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const animation = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: !reducedMotion,
      autoplay: !reducedMotion,
      animationData,
    })
    const freeze = () => animation.goToAndStop(staticFrame ?? Math.max(0, animation.totalFrames - 1), true)
    if (reducedMotion) animation.addEventListener('DOMLoaded', freeze)
    return () => {
      if (reducedMotion) animation.removeEventListener('DOMLoaded', freeze)
      animation.destroy()
    }
  }, [animationData, reducedMotion, staticFrame])

  return <div ref={containerRef} aria-hidden="true" className={cn('shrink-0', className)} />
}
