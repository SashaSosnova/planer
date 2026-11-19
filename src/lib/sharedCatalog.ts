import type { FoodItem } from '../types'

const MIGRATED_PREFIX = 'planer-shared-catalog-migrated:'

export function catalogMigratedKey(uid: string): string {
  return `${MIGRATED_PREFIX}${uid}`
}

export function isCatalogMigrated(uid: string): boolean {
  try {
    return localStorage.getItem(catalogMigratedKey(uid)) === '1'
  } catch {
    return false
  }
}

export function markCatalogMigrated(uid: string): void {
  try {
    localStorage.setItem(catalogMigratedKey(uid), '1')
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Personal or on-device foods that are not in the shared catalog yet.
 * Shared ids win — a later delete in the shared catalog is not copied back
 * after this list has been uploaded once.
 */
export function foodsToCopyIntoShared(
  shared: FoodItem[],
  personal: FoodItem[],
  local: FoodItem[],
  suppressed: ReadonlySet<string>,
): FoodItem[] {
  const sharedIds = new Set(shared.map((f) => f.id))
  const seen = new Set<string>()
  const out: FoodItem[] = []
  for (const food of [...personal, ...local]) {
    if (!food.id || seen.has(food.id) || sharedIds.has(food.id) || suppressed.has(food.id)) {
      continue
    }
    seen.add(food.id)
    out.push(food)
  }
  return out
}
