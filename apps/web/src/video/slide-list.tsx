import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { SlideNumber } from '@mergero/shared'
import type { PageStrings } from '@mergero/shared/i18n/base'
import { ChevronUp, ListVideo } from 'lucide-react'
import { formatClock } from './timeline.ts'
import type { SlideTime } from './timeline.ts'

interface SlideListProps {
  slides: readonly SlideTime[]
  current: SlideNumber | null
  strings: PageStrings
  onJump: (slide: SlideTime) => void
}

export function SlideList({ slides, current, strings, onJump }: SlideListProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const currentName = current === null ? null : strings.slideNames[current]

  useEffect(() => {
    if (!open) return
    const list = listRef.current
    ;(list?.querySelector<HTMLButtonElement>('[aria-current="true"]') ?? list?.querySelector<HTMLButtonElement>('button'))?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close() {
    setOpen(false)
    buttonRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      event.key === 'Escape' ? null
      : event.key === 'ArrowDown' ? items[(index + 1) % items.length]
      : event.key === 'ArrowUp' ? items[(index - 1 + items.length) % items.length]
      : event.key === 'Home' ? items[0]
      : event.key === 'End' ? items.at(-1)
      : undefined
    if (next === undefined) return
    event.preventDefault()
    event.stopPropagation()
    if (next === null) close()
    else next.focus()
  }

  return (
    <div ref={rootRef} className="ml-1 min-w-0 sm:relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={currentName === null ? strings.slideList : `${strings.slideList}: ${currentName}`}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        title={strings.slideList}
        data-track="slide-list"
        onClick={() => setOpen(!open)}
        className="inline-flex h-10 min-w-10 max-w-full items-center justify-center gap-1.5 rounded-md px-2 text-sm text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-white"
      >
        <ListVideo className="size-5 shrink-0" aria-hidden="true" />
        {currentName !== null && <span className="hidden truncate sm:inline">{currentName}</span>}
        <ChevronUp
          className={`hidden size-4 shrink-0 transition-transform motion-reduce:transition-none sm:block ${open ? '' : 'rotate-180'}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          aria-label={strings.slideList}
          onKeyDown={onKeyDown}
          className="absolute inset-x-3 bottom-full z-20 mb-2 max-h-40 overflow-y-auto sm:inset-x-auto sm:left-0 sm:max-h-80 sm:w-72 rounded-lg bg-ink p-1 shadow-xl ring-1 ring-white/15"
        >
          {slides.map((slide) => {
            const active = slide.slide === current
            return (
              <li key={slide.slide}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  data-track={`slide-list-${slide.slide}`}
                  onClick={() => {
                    close()
                    onJump(slide)
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-white/10 focus-visible:outline-white ${active ? 'bg-white/10 font-medium text-white' : 'text-white/80'}`}
                >
                  <span className="w-4 shrink-0 text-right tabular-nums text-white/50">{slide.slide}</span>
                  <span className="min-w-0 flex-1 truncate">{strings.slideNames[slide.slide]}</span>
                  <span className="shrink-0 tabular-nums text-white/50">{formatClock(slide.startS)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
