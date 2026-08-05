import type { FoodItem } from '../types'

export type MenuDishDupeGroup = {
  /** menuId or normalized dish name */
  key: string
  keepId: string
  keepName: string
  removeIds: string[]
  labels: string[]
}

function normName(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

/** Prefer linked menu recipe, then fuller recipe, then newest. */
export function scoreMenuDishKeep(f: FoodItem): number {
  let score = 0
  if (f.menuId?.trim()) score += 1_000
  const ingCount = f.recipe?.ingredients.length ?? 0
  if (ingCount > 0) score += 100 + ingCount
  if (f.recipe?.sourceText?.trim()) score += 10
  return score
}

function sortByKeepScore(list: FoodItem[]): FoodItem[] {
  return [...list].sort((a, b) => {
    const ds = scoreMenuDishKeep(b) - scoreMenuDishKeep(a)
    if (ds !== 0) return ds
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  })
}

export function findMenuDishDuplicates(foods: FoodItem[]): MenuDishDupeGroup[] {
  const dishes = foods.filter((f) => f.kind === 'dish')
  const toRemove = new Set<string>()
  const groups: MenuDishDupeGroup[] = []

  const byMenuId = new Map<string, FoodItem[]>()
  for (const d of dishes) {
    const mid = d.menuId?.trim()
    if (!mid) continue
    const list = byMenuId.get(mid) ?? []
    list.push(d)
    byMenuId.set(mid, list)
  }

  for (const [menuId, list] of byMenuId) {
    if (list.length <= 1) continue
    const sorted = sortByKeepScore(list)
    const keep = sorted[0]!
    const remove = sorted.slice(1)
    for (const d of remove) toRemove.add(d.id)
    groups.push({
      key: menuId,
      keepId: keep.id,
      keepName: keep.name,
      removeIds: remove.map((d) => d.id),
      labels: list.map((d) => `${d.name}${d.menuId ? '' : ' (без menuId)'}`),
    })
  }

  const remaining = dishes.filter((d) => !toRemove.has(d.id))
  const byName = new Map<string, FoodItem[]>()
  for (const d of remaining) {
    const key = normName(d.name)
    const list = byName.get(key) ?? []
    list.push(d)
    byName.set(key, list)
  }

  for (const [nameKey, list] of byName) {
    if (list.length <= 1) continue
    const sorted = sortByKeepScore(list)
    const keep = sorted[0]!
    const remove = sorted.slice(1)
    for (const d of remove) toRemove.add(d.id)
    groups.push({
      key: nameKey,
      keepId: keep.id,
      keepName: keep.name,
      removeIds: remove.map((d) => d.id),
      labels: list.map((d) => `${d.name}${d.menuId ? ` · ${d.menuId}` : ''}`),
    })
  }

  return groups.sort((a, b) => a.keepName.localeCompare(b.keepName, 'ru'))
}

export function dedupeMenuDishes(foods: FoodItem[]): {
  foods: FoodItem[]
  removedIds: string[]
  groups: MenuDishDupeGroup[]
} {
  const groups = findMenuDishDuplicates(foods)
  const removedIds = groups.flatMap((g) => g.removeIds)
  const remove = new Set(removedIds)
  return {
    foods: foods.filter((f) => !remove.has(f.id)),
    removedIds,
    groups,
  }
}

export function findExistingMenuDish(
  foods: FoodItem[],
  menuId: string,
  dishName: string,
): FoodItem | undefined {
  const mid = menuId.trim()
  const byId = foods.find((f) => f.kind === 'dish' && f.menuId?.trim() === mid)
  if (byId) return byId
  const target = normName(dishName)
  const byName = foods.filter((f) => f.kind === 'dish' && normName(f.name) === target)
  return sortByKeepScore(byName)[0]
}
