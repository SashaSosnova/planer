/** While true, null auth must not create a guest (email login race). */
let suppressAnonymous = false

export function isAnonymousSuppressed(): boolean {
  return suppressAnonymous
}

export function setAnonymousSuppressed(value: boolean): void {
  suppressAnonymous = value
}
