import { deepseekJson, isDeepseekConfigured } from './deepseek'
import { toIsoDate } from './date'
import {
  canonicalMealKey,
  filterIdeasByBudget,
  localPoolForSlot,
  mealSlotForHour,
  mealSuggestions,
  mixMealIdeas,
  normMealTitle,
  rankMealIdeas,
  slotKcalBudget,
  type MealSlot,
  type MealSuggestion,
} from './mealSuggestions'
import type { TastePrefs } from './settings'
import type { AppData, Meal, MealType } from '../types'

const CACHE_KEY = 'planer-meal-ideas-v6'

/** Almost never breakfast unless she actually logged it there. */
const OFF_SLOT_RE: Record<MealSlot, RegExp | null> = {
  breakfast:
    /паст[аыуе]|макарон|спагетт|гречк|булгур|киноа|плов|лагман|лапш[аеи]|суп\b|борщ|щи\b|стейк|отбивн|стрипс|наггетс|пельмен|вареник|пицц|бургер|шаурм|рагу|солянк|пюре/i,
  lunch: null,
  dinner: null,
  snack: /паст[аыуе]|макарон|гречк|плов|стейк|борщ|щи\b|суп\b|пельмен/i,
}

/** Typical breakfast vocabulary when we need a soft fallback. */
const BREAKFAST_ARCHETYPE =
  /сырник|яйц|омлет|творог|блин|овсян|каша|йогурт|тост|гранол|мюзли|запеканк|вафл|бутерброд|глазунь|яичниц|круассан|творож/i
const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'завтрак',
  lunch: 'обед',
  dinner: 'ужин',
  snack: 'перекус',
}

type Cached = {
  fingerprint: string
  ideas: MealSuggestion[]
}

export type MealIdeaContext = {
  data: AppData
  prefs: TastePrefs
  slot: MealSlot
  now?: Date
  kcalGoal?: number
  limit?: number
  /** Titles already shown — skip when picking replacements. */
  excludeTitles?: string[]
  /** Bypass day+slot cache (e.g. fetch one replacement after dislike). */
  skipCache?: boolean
}

/** A repeating plate from the journal (combo, not a single ingredient). */
export type HabitualMealPattern = {
  title: string
  ingredients: string
  kcal: number
  protein: number
  fat: number
  carbs: number
  count: number
  /** Where she usually logs it */
  fromSlots: MealSlot[]
}

function loadCache(): Record<string, Cached> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, Cached>
  } catch {
    return {}
  }
}

function saveCache(map: Record<string, Cached>): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(map))
}

function listLine(items: string[], empty = 'нет'): string {
  const clean = items.map((x) => x.trim()).filter(Boolean)
  return clean.length ? clean.join('; ') : empty
}

function mealLine(m: Meal): string {
  const names = m.items.map((i) => i.name.trim()).filter(Boolean)
  return names.length ? names.join(', ') : m.rawText.trim() || 'без названия'
}

function nonNeg(n: unknown, fallback = 0): number {
  const v = Number(n)
  return Number.isFinite(v) && v >= 0 ? v : fallback
}

function slotAsMealType(slot: MealSlot): MealType {
  return slot
}

/** Lunch↔dinner share plates; other slots stay self-contained. */
export function relatedSlotsForAdvice(slot: MealSlot): MealType[] {
  if (slot === 'lunch' || slot === 'dinner') return ['lunch', 'dinner']
  return [slotAsMealType(slot)]
}

function mealSignature(m: Meal): string {
  return m.items
    .map((i) => normMealTitle(i.name))
    .filter(Boolean)
    .sort()
    .join('+')
}

function titleFromItems(names: string[]): string {
  if (names.length === 0) return 'Приём'
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} + ${names[1]}`
  return `${names[0]} + ${names[1]} + …`
}

/** Recent dish names (most recent first, unique). Optionally limited to related slots. */
export function recentFoodTitles(
  data: AppData,
  today: string,
  limit = 28,
  slot?: MealSlot,
): string[] {
  const todayMs = Date.parse(`${today}T12:00:00`)
  const cutoff = todayMs - 10 * 24 * 60 * 60 * 1000
  const want = slot ? new Set(relatedSlotsForAdvice(slot)) : null
  const meals = [...data.meals]
    .filter((m) => {
      if (want && !want.has(m.mealType)) return false
      const t = Date.parse(`${m.date}T12:00:00`)
      return Number.isFinite(t) && t >= cutoff && t <= todayMs
    })
    .sort((a, b) => b.createdAt - a.createdAt || b.date.localeCompare(a.date))

  const out: string[] = []
  const seen = new Set<string>()
  for (const m of meals) {
    for (const item of m.items) {
      const title = item.name.trim()
      const key = normMealTitle(title)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(title)
      if (out.length >= limit) return out
    }
  }
  return out
}

function tokenHit(haystack: string, needle: string): boolean {
  const h = normMealTitle(haystack)
  const n = normMealTitle(needle)
  return n.length >= 3 && h.includes(n)
}

/**
 * Slot fit: breakfast must look like her breakfasts (syrniki/eggs/…) —
 * not lunch pasta pulled from the library or other meals.
 */
export function isPlausibleIdeaForSlot(
  idea: Pick<MealSuggestion, 'title' | 'ingredients'>,
  slot: MealSlot,
  allowedTitles: string[],
  allowedFoods: string[],
): boolean {
  const text = `${idea.title} ${idea.ingredients}`
  const titleN = normMealTitle(idea.title)

  if (allowedTitles.some((t) => normMealTitle(t) === titleN)) return true
  const foodHit = allowedFoods.some((f) => tokenHit(text, f))
  if (foodHit) return true

  const off = OFF_SLOT_RE[slot]
  if (off?.test(text)) return false

  if (slot === 'breakfast') {
    // With or without history: stay in breakfast-ish territory
    return BREAKFAST_ARCHETYPE.test(text)
  }

  return true
}

export function filterIdeasBySlotFit(
  ideas: MealSuggestion[],
  slot: MealSlot,
  allowedTitles: string[],
  allowedFoods: string[],
): MealSuggestion[] {
  return ideas.filter((idea) => isPlausibleIdeaForSlot(idea, slot, allowedTitles, allowedFoods))
}

/**
 * Foods she actually logs for this slot (last ~45 days), most frequent first.
 */
export function frequentFoodsForSlot(
  data: AppData,
  today: string,
  slot: MealSlot,
  limit = 14,
): string[] {
  const todayMs = Date.parse(`${today}T12:00:00`)
  const cutoff = todayMs - 45 * 24 * 60 * 60 * 1000
  const want = new Set(relatedSlotsForAdvice(slot))
  const counts = new Map<string, { title: string; n: number }>()

  for (const m of data.meals) {
    if (!want.has(m.mealType)) continue
    const t = Date.parse(`${m.date}T12:00:00`)
    if (!Number.isFinite(t) || t < cutoff || t > todayMs) continue
    for (const item of m.items) {
      const title = item.name.trim()
      const key = normMealTitle(title)
      if (!key) continue
      const prev = counts.get(key)
      if (prev) prev.n += 1
      else counts.set(key, { title, n: 1 })
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.title.localeCompare(b.title, 'ru'))
    .slice(0, limit)
    .map((x) => x.title)
}

/**
 * Repeating plates (e.g. «стрипсы + салат») from the journal.
 * For lunch/dinner advice, pulls from both lunch and dinner history.
 */
export function frequentMealPatterns(
  data: AppData,
  today: string,
  slot: MealSlot,
  limit = 8,
): HabitualMealPattern[] {
  const todayMs = Date.parse(`${today}T12:00:00`)
  const cutoff = todayMs - 45 * 24 * 60 * 60 * 1000
  const want = new Set(relatedSlotsForAdvice(slot))

  type Acc = {
    title: string
    ingredients: string
    sumKcal: number
    sumP: number
    sumF: number
    sumC: number
    count: number
    fromSlots: Set<MealSlot>
  }
  const map = new Map<string, Acc>()

  for (const m of data.meals) {
    if (!want.has(m.mealType)) continue
    const t = Date.parse(`${m.date}T12:00:00`)
    if (!Number.isFinite(t) || t < cutoff || t > todayMs) continue
    const names = m.items.map((i) => i.name.trim()).filter(Boolean)
    if (names.length === 0) continue
    const sig = mealSignature(m)
    if (!sig) continue
    const prev = map.get(sig)
    const from = m.mealType as MealSlot
    if (prev) {
      prev.count += 1
      prev.sumKcal += m.totals.kcal
      prev.sumP += m.totals.protein
      prev.sumF += m.totals.fat
      prev.sumC += m.totals.carbs
      prev.fromSlots.add(from)
    } else {
      map.set(sig, {
        title: titleFromItems(names),
        ingredients: names.join(', '),
        sumKcal: m.totals.kcal,
        sumP: m.totals.protein,
        sumF: m.totals.fat,
        sumC: m.totals.carbs,
        count: 1,
        fromSlots: new Set([from]),
      })
    }
  }

  const raw = [...map.values()]
    .filter((x) => x.count >= 2)
    .map((x) => ({
      title: x.title,
      ingredients: x.ingredients,
      kcal: Math.round(x.sumKcal / x.count),
      protein: Math.round(x.sumP / x.count),
      fat: Math.round(x.sumF / x.count),
      carbs: Math.round(x.sumC / x.count),
      count: x.count,
      fromSlots: [...x.fromSlots],
    }))

  // Merge «A с B» / «A + B» / swapped order into one pattern
  const merged = new Map<string, HabitualMealPattern>()
  for (const p of raw) {
    const key = canonicalMealKey(p.title)
    const prev = merged.get(key)
    if (!prev) {
      merged.set(key, p)
      continue
    }
    const n = prev.count + p.count
    merged.set(key, {
      title: prev.count >= p.count ? prev.title : p.title,
      ingredients: prev.ingredients.length >= p.ingredients.length ? prev.ingredients : p.ingredients,
      kcal: Math.round((prev.kcal * prev.count + p.kcal * p.count) / n),
      protein: Math.round((prev.protein * prev.count + p.protein * p.count) / n),
      fat: Math.round((prev.fat * prev.count + p.fat * p.count) / n),
      carbs: Math.round((prev.carbs * prev.count + p.carbs * p.count) / n),
      count: n,
      fromSlots: [...new Set([...prev.fromSlots, ...p.fromSlots])],
    })
  }

  return [...merged.values()]
    .sort((a, b) => b.count - a.count || b.kcal - a.kcal)
    .slice(0, limit)
}

export function habitualPatternsAsIdeas(
  patterns: HabitualMealPattern[],
  slot: MealSlot,
  maxKcal: number | null | undefined,
): MealSuggestion[] {
  const ideas: MealSuggestion[] = patterns.map((p, i) => ({
    id: `hab_${slot}_${i}_${normMealTitle(p.title).slice(0, 24)}`,
    title: p.title,
    kcal: p.kcal,
    protein: p.protein,
    fat: p.fat,
    carbs: p.carbs,
    ingredients: p.ingredients,
    recipe:
      p.count >= 2
        ? `Как обычно у тебя в журнале (уже ${p.count}×). Собери так же.`
        : 'Как в прошлый раз в журнале. Собери так же.',
  }))
  return filterIdeasByBudget(ideas, maxKcal)
}

/** Names from her food library — extra grounding as the base grows. */
export function libraryFoodNames(data: AppData, limit = 24): string[] {
  return [...data.foods]
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit)
    .map((f) => f.name.trim())
    .filter(Boolean)
}

function formatPatternLine(p: HabitualMealPattern): string {
  const where = p.fromSlots.map((s) => SLOT_LABEL[s]).join('/')
  return `${p.title} (~${p.kcal} ккал, ${p.count}×, обычно: ${where})`
}

/** Cache key parts that should trigger a fresh LLM call (likes only re-rank). */
export function buildMealIdeasFingerprint(
  slot: MealSlot,
  prefs: TastePrefs,
  todayLines: string[],
  recent: string[],
  habitual: string[],
  maxKcal: number | null,
): string {
  return [
    slot,
    prefs.dislikes.map(normMealTitle).sort().join('|'),
    prefs.canCook.map(normMealTitle).sort().join('|'),
    todayLines.map(normMealTitle).sort().join('|'),
    recent.slice(0, 12).map(normMealTitle).join('|'),
    habitual.slice(0, 12).map(normMealTitle).join('|'),
    maxKcal == null ? 'na' : String(maxKcal),
  ].join('::')
}

export function buildMealIdeasPrompt(input: {
  slot: MealSlot
  prefs: TastePrefs
  todayLines: string[]
  recentInSlot: string[]
  habitualFoods: string[]
  habitualMeals: HabitualMealPattern[]
  library: string[]
  remainingKcal?: number
  maxKcal?: number
  targetKcal?: number
  limit: number
}): string {
  const budgetHint =
    input.maxKcal != null && input.remainingKcal != null
      ? `Калории: на день осталось ~${Math.round(input.remainingKcal)} ккал. Для ЭТОГО ${SLOT_LABEL[input.slot]} потолок одной идеи: не больше ${Math.round(input.maxKcal)} ккал (лучше около ${Math.round(input.targetKcal ?? input.maxKcal * 0.85)}). Нельзя предлагать блюдо почти на весь остаток дня (например 800 при остатке 1000).`
      : input.remainingKcal != null
        ? `Ориентир по калориям до конца дня: около ${Math.max(0, Math.round(input.remainingKcal))} ккал.`
        : 'Ориентира по калориям нет.'

  const slotTone =
    input.slot === 'breakfast'
      ? `ЖЁСТКО про завтрак: предлагай только завтраковую еду в духе её журнала (сырники, яйца, омлет, блины, творог, каша, йогурт, тосты…). Нельзя предлагать обеденные блюда: пасту, макароны, гречку с мясом, супы, плов, стрипсы и т.п. — даже если они есть в базе или были на обед. Ориентир — «часто на завтрак» и «недавно на завтрак».`
      : input.slot === 'snack'
        ? 'Для перекуса ок сладкое (шоколад, печенье, мороженое); можно йогурт/фрукт/бутерброд. Без стыда и без «замени на полезное». Не предлагай полноценный обед.'
        : 'Обычная еда в РФ (дом / простое / доставка ок). Обед и ужин могут переиспользовать одни и те же комбо из журнала.'

  const mealLines = input.habitualMeals.map(formatPatternLine)

  return `Ты подруга, которая предлагает, что можно поесть. Не тренер, не диетолог.

Слот: ${SLOT_LABEL[input.slot]}
Нравится / лайкнула в советах: ${listLine(input.prefs.likes)}
Не предлагать (жёсткий бан): ${listLine(input.prefs.dislikes, 'пока пусто')}
Умею / люблю готовить: ${listLine(input.prefs.canCook, 'не указано')}
Её повторяющиеся приёмы именно для этого/похожих слотов: ${listLine(mealLines, 'мало повторов')}
Часто в этом слоте (продукты): ${listLine(input.habitualFoods, 'мало данных')}
Недавно в этом слоте: ${listLine(input.recentInSlot, 'мало данных')}
Продукты из её базы (вспомогательно, не ломай тип приёма): ${listLine(input.library, 'база пока пустая')}
Уже сегодня: ${listLine(input.todayLines, 'ещё ничего не записано')}
${budgetHint}
${slotTone}

Правила:
- ровно ${input.limit} идеи на русском строго для слота «${SLOT_LABEL[input.slot]}»;
- title — короткое название (2–6 слов); для завтрака в духе «Сырники», «Яйца с овощами», не «Паста с кабачком»;
- ingredients — порция/состав одной строки;
- recipe — 1–3 коротких шага;
- kcal/protein/fat/carbs — примерные числа на всю порцию (целые) и ОБЯЗАТЕЛЬНО kcal ≤ потолка, если он задан;
- ровно 1 идея может быть из её журнала; остальные — новые вариации в том же духе (не копии);
- не дублируй одно блюдо разными формулировками («с пюре» / «+ пюре»);
- не подтягивай обед/ужин в завтрак и наоборот;
- не копируй слово в слово то, что уже сегодня;
- ничего из списка «не предлагать»;
- без нравоучений и без «полезнее/вреднее».

Верни JSON:
{ "ideas": [ { "title": "...", "ingredients": "...", "recipe": "...", "kcal": 0, "protein": 0, "fat": 0, "carbs": 0 } ] }`
}

function coerceIdea(raw: unknown, slot: MealSlot, index: number): MealSuggestion | null {
  if (typeof raw === 'string') {
    const title = raw.trim()
    if (!title) return null
    return {
      id: `llm_${slot}_${index}_${normMealTitle(title).slice(0, 24)}`,
      title,
      kcal: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      ingredients: '',
      recipe: '',
    }
  }
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = String(o.title ?? '').trim()
  if (!title) return null
  return {
    id: `llm_${slot}_${index}_${normMealTitle(title).slice(0, 24)}`,
    title,
    kcal: nonNeg(o.kcal),
    protein: nonNeg(o.protein),
    fat: nonNeg(o.fat),
    carbs: nonNeg(o.carbs),
    ingredients: String(o.ingredients ?? '').trim(),
    recipe: String(o.recipe ?? '').trim(),
  }
}

/** Fill missing macros/recipe from a local twin with the same title, else leave as-is. */
export function enrichIdea(idea: MealSuggestion, slot: MealSlot): MealSuggestion {
  if (idea.kcal > 0 && idea.recipe && idea.ingredients) return idea
  const twin = localPoolForSlot(slot).find(
    (x) => normMealTitle(x.title) === normMealTitle(idea.title),
  )
  if (!twin) return idea
  return {
    ...idea,
    kcal: idea.kcal > 0 ? idea.kcal : twin.kcal,
    protein: idea.protein > 0 ? idea.protein : twin.protein,
    fat: idea.fat > 0 ? idea.fat : twin.fat,
    carbs: idea.carbs > 0 ? idea.carbs : twin.carbs,
    ingredients: idea.ingredients || twin.ingredients,
    recipe: idea.recipe || twin.recipe,
  }
}

export function parseMealIdeasResponse(
  parsed: { ideas?: unknown },
  slot: MealSlot,
  prefs: TastePrefs,
  limit: number,
  maxKcal?: number | null,
  seeds: MealSuggestion[] = [],
  allowedTitles: string[] = [],
  allowedFoods: string[] = [],
): MealSuggestion[] {
  const raw = Array.isArray(parsed.ideas) ? parsed.ideas : []
  const mapped: MealSuggestion[] = []
  raw.forEach((item, i) => {
    const idea = coerceIdea(item, slot, i)
    if (idea) mapped.push(enrichIdea(idea, slot))
  })
  const allowedT = [...allowedTitles, ...seeds.map((s) => s.title)]
  const novel = filterIdeasByBudget(
    filterIdeasBySlotFit([...mapped, ...localPoolForSlot(slot)], slot, allowedT, allowedFoods),
    maxKcal,
  )
  const habitual = filterIdeasByBudget(
    filterIdeasBySlotFit(seeds, slot, allowedT, allowedFoods),
    maxKcal,
  )
  return mixMealIdeas(habitual, novel, prefs, limit, 1)
}

function mergeIdeas(
  seeds: MealSuggestion[],
  rest: MealSuggestion[],
  prefs: TastePrefs,
  limit: number,
  maxKcal: number | null,
  slot: MealSlot,
  allowedFoods: string[],
): MealSuggestion[] {
  const allowedT = seeds.map((s) => s.title)
  const habitual = filterIdeasByBudget(
    filterIdeasBySlotFit(seeds, slot, allowedT, allowedFoods),
    maxKcal,
  )
  const novel = filterIdeasByBudget(
    filterIdeasBySlotFit(rest, slot, allowedT, allowedFoods),
    maxKcal,
  )
  return mixMealIdeas(habitual, novel, prefs, limit, 1)
}

/**
 * Meal ideas for an explicit slot.
 * Uses DeepSeek when configured; caches per day+slot+fingerprint; falls back locally.
 */
function applyExcludes(ideas: MealSuggestion[], excludeTitles?: string[]): MealSuggestion[] {
  if (!excludeTitles?.length) return ideas
  const ban = new Set(excludeTitles.map((t) => canonicalMealKey(t)).filter(Boolean))
  return ideas.filter((i) => !ban.has(canonicalMealKey(i.title)))
}

export async function getMealIdeas(ctx: MealIdeaContext): Promise<MealSuggestion[]> {
  const now = ctx.now ?? new Date()
  const limit = ctx.limit ?? 3
  const date = toIsoDate(now)
  const slot = ctx.slot || mealSlotForHour(now.getHours())
  const excludeTitles = ctx.excludeTitles ?? []
  /** Treat excluded titles like soft-dislikes for ranking. */
  const prefs: TastePrefs = excludeTitles.length
    ? {
        ...ctx.prefs,
        dislikes: [...ctx.prefs.dislikes, ...excludeTitles],
      }
    : ctx.prefs

  const todayMeals = ctx.data.meals.filter((m) => m.date === date)
  const eaten = todayMeals.reduce((s, m) => s + m.totals.kcal, 0)
  const budget = slotKcalBudget(ctx.kcalGoal, eaten, slot)
  const maxKcal = budget?.maxKcal ?? null

  const patterns = frequentMealPatterns(ctx.data, date, slot)
  const habitualFoods = frequentFoodsForSlot(ctx.data, date, slot)
  const habitualSeeds = habitualPatternsAsIdeas(patterns, slot, maxKcal)
  const poolLimit = Math.max(limit, 8)
  const local = applyExcludes(
    mergeIdeas(
      habitualSeeds,
      mealSuggestions(now, prefs, poolLimit, slot, maxKcal),
      prefs,
      limit,
      maxKcal,
      slot,
      habitualFoods,
    ),
    excludeTitles,
  )

  const todayLines = todayMeals.map((m) => {
    const label =
      m.mealType === 'breakfast'
        ? 'завтрак'
        : m.mealType === 'lunch'
          ? 'обед'
          : m.mealType === 'dinner'
            ? 'ужин'
            : 'перекус'
    return `${label}: ${mealLine(m)}`
  })
  const recentInSlot = recentFoodTitles(ctx.data, date, 28, slot)
  // Breakfast: keep library narrow so lunch dishes don't leak in.
  // Other slots: full library helps invent new ideas beyond the journal.
  const library =
    slot === 'breakfast' && (habitualFoods.length >= 2 || patterns.length >= 1)
      ? libraryFoodNames(ctx.data, 40).filter((name) =>
          habitualFoods.some((h) => tokenHit(name, h) || tokenHit(h, name)),
        )
      : libraryFoodNames(ctx.data)
  const habitualKey = patterns.map((p) => `${normMealTitle(p.title)}:${p.kcal}`)
  const fingerprint = buildMealIdeasFingerprint(
    slot,
    prefs,
    todayLines,
    recentInSlot,
    habitualKey,
    maxKcal,
  )
  const cacheId = `${date}|${slot}`

  if (!ctx.skipCache) {
    const cache = loadCache()
    const hit = cache[cacheId]
    if (hit?.fingerprint === fingerprint && hit.ideas?.length) {
      // Cache already mixed; only re-apply budget / taste / slot fit
      return applyExcludes(
        rankMealIdeas(
          filterIdeasByBudget(
            filterIdeasBySlotFit(
              hit.ideas,
              slot,
              hit.ideas.map((i) => i.title),
              habitualFoods,
            ),
            maxKcal,
          ),
          prefs,
          Math.max(limit, excludeTitles.length + limit),
        ),
        excludeTitles,
      ).slice(0, limit)
    }
  }

  if (!isDeepseekConfigured()) return local

  try {
    const parsed = await deepseekJson<{ ideas?: unknown }>(
      buildMealIdeasPrompt({
        slot,
        prefs,
        todayLines,
        recentInSlot,
        habitualFoods,
        habitualMeals: patterns,
        library,
        remainingKcal: budget?.remaining,
        maxKcal: budget?.maxKcal,
        targetKcal: budget?.targetKcal,
        limit: Math.max(limit, 3),
      }),
      {
        temperature: 0.55,
        system:
          'Ты мягкая подруга в трекере еды. Строго соблюдай тип приёма пищи. Отвечай только валидным JSON без markdown и без текста вне JSON.',
      },
    )
    const ideas = applyExcludes(
      parseMealIdeasResponse(
        parsed,
        slot,
        prefs,
        Math.max(limit, 3),
        maxKcal,
        habitualSeeds,
        patterns.map((p) => p.title),
        habitualFoods,
      ),
      excludeTitles,
    ).slice(0, limit)
    if (ideas.length === 0) return local
    if (!ctx.skipCache) {
      const cache = loadCache()
      cache[cacheId] = { fingerprint, ideas: ideas.length >= 3 ? ideas : [...ideas, ...local].slice(0, 3) }
      saveCache(cache)
    }
    return ideas
  } catch {
    return local
  }
}
