export type DomainErrorStatus = 400 | 404 | 409 | 410

export class DomainError extends Error {
  readonly status: DomainErrorStatus
  readonly detail: unknown

  constructor(status: DomainErrorStatus, message: string, detail?: unknown) {
    super(message)
    this.name = 'DomainError'
    this.status = status
    this.detail = detail
  }
}
