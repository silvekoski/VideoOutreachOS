import { AnimatedBrand } from './animated-brand'
import animationData from '@/assets/mergero-logo.json'
import artwork from '../../../../config/mergero-logo-dark.svg?raw'
import { cn } from '@/lib/utils'

// Remove document metadata and the SVG's global .st0 rule before inlining it.
const logo = artwork
  .replace(/<\?xml[^>]*\?>/, '')
  .replace(/<style[\s\S]*?<\/style>/, '')
  .replace(/\sclass="st0"/g, '')
  .replace(/\sid="Livello_1"/, '')

export function MergeroLogo({ className, replayKey }: { className?: string; replayKey?: string }) {
  return (
    <AnimatedBrand
      artwork={logo}
      label="Mergero"
      animationData={animationData}
      replayKey={replayKey}
      className={cn('text-[#161922] dark:text-white', className)}
    />
  )
}
