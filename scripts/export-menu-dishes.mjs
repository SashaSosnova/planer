/**
 * One-shot: dump dishes from sibling ../menu into src/data/menuDishes.seed.json
 * Run: npx tsx scripts/export-menu-dishes.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dishes } from '../../menu/src/data/dishes.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = join(__dirname, '../src/data/menuDishes.seed.json')

function buildNotes(recipe) {
  if (!recipe) return undefined
  const parts = []
  if (recipe.servings?.trim()) parts.push(`Порции: ${recipe.servings.trim()}`)
  if (recipe.steps?.trim()) parts.push(`Как готовить: ${recipe.steps.trim()}`)
  if (recipe.storage?.trim()) parts.push(`Хранение: ${recipe.storage.trim()}`)
  return parts.length ? parts.join('\n') : undefined
}

const seenNames = new Set()
const seed = Object.values(dishes)
  .filter((d) => d?.name?.trim() && d.recipe)
  .filter((d) => d.macros && Number(d.macros.kcal) > 0)
  // Skip leftover placeholders («Остатки …») — no own КБЖУ
  .filter((d) => !/^остатки\b/i.test(d.name.trim()))
  .map((d) => ({
    menuId: d.id,
    name: d.name.trim(),
    per100g: {
      kcal: Number(d.macros.kcal),
      protein: Number(d.macros.protein) || 0,
      fat: Number(d.macros.fat) || 0,
      carbs: Number(d.macros.carbs) || 0,
    },
    ingredients: (d.recipe.ingredients ?? [])
      .map((line) => String(line).trim())
      .filter(Boolean),
    notes: buildNotes(d.recipe),
  }))
  .filter((d) => {
    const key = d.name.toLowerCase().replace(/ё/g, 'е')
    if (seenNames.has(key)) return false
    seenNames.add(key)
    return true
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

writeFileSync(outPath, JSON.stringify(seed, null, 2), 'utf8')
console.log(`Wrote ${seed.length} dishes → ${outPath}`)
console.log(`With macros: ${seed.filter((d) => d.per100g).length}`)
