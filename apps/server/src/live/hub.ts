import type { LiveEvent } from '@mergero/shared'
import { log } from '../log.ts'

type Listener = (event: LiveEvent | null) => void

export class LiveHub {
  readonly #listeners = new Set<Listener>()
  readonly #joinListeners = new Set<() => void>()

  get size(): number {
    return this.#listeners.size
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener)
    for (const join of this.#joinListeners) join()
    return () => {
      this.#listeners.delete(listener)
    }
  }

  onJoin(listener: () => void): void {
    this.#joinListeners.add(listener)
  }

  publish(event: LiveEvent): void {
    this.#send(event)
  }

  close(): void {
    this.#send(null)
    this.#listeners.clear()
  }

  #send(event: LiveEvent | null): void {
    for (const listener of this.#listeners) {
      try {
        listener(event)
      } catch (error) {
        log.warn('a live event listener failed', { error })
      }
    }
  }
}
