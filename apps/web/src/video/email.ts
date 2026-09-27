const EMAIL = /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/u
const MAX_EMAIL = 254

export function isEmail(value: string): boolean {
  return value.length <= MAX_EMAIL && EMAIL.test(value)
}
