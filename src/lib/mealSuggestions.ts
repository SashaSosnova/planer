import type { TastePrefs } from './settings'

export type MealSuggestion = {
  id: string
  title: string
  kcal: number
  protein: number
  fat: number
  carbs: number
  /** Short portion / ingredients line */
  ingredients: string
  /** How to cook — a few short steps */
  recipe: string
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

type Slot = MealSlot

const BY_SLOT: Record<Slot, MealSuggestion[]> = {
  breakfast: [
    {
      id: 'b_oats',
      title: 'Овсянка с ягодами',
      kcal: 320,
      protein: 12,
      fat: 8,
      carbs: 50,
      ingredients: '40 г овсянки, 150 мл молока, горсть ягод, чайная ложка мёда',
      recipe: 'Залей хлопья горячим молоком, подожди 5–7 минут. Добавь ягоды и мёд.',
    },
    {
      id: 'b_eggs',
      title: 'Яйца с овощами',
      kcal: 280,
      protein: 20,
      fat: 18,
      carbs: 6,
      ingredients: '2 яйца, помидор, огурец или зелень, соль',
      recipe: 'Пожарь или отвари яйца. Рядом нарежь овощи — без заморочек.',
    },
    {
      id: 'b_cottage',
      title: 'Творог с фруктом',
      kcal: 260,
      protein: 28,
      fat: 8,
      carbs: 20,
      ingredients: '150–180 г творога 5%, яблоко или банан',
      recipe: 'Смешай творог с нарезанным фруктом. По желанию — корица.',
    },
    {
      id: 'b_yogurt',
      title: 'Йогурт с гранолой',
      kcal: 300,
      protein: 14,
      fat: 10,
      carbs: 40,
      ingredients: '200 г йогурта, 30 г гранолы, ягоды',
      recipe: 'Выложи йогурт, сверху гранола и ягоды. Не мешай заранее — хруст сохраняется.',
    },
    {
      id: 'b_toast',
      title: 'Тост с яйцом',
      kcal: 310,
      protein: 16,
      fat: 14,
      carbs: 28,
      ingredients: '1–2 ломтика хлеба, 1 яйцо, чуть масла или авокадо',
      recipe: 'Поджарь хлеб, сверху яйцо всмятку или глазунья.',
    },
    {
      id: 'b_syriki',
      title: 'Сырники',
      kcal: 380,
      protein: 22,
      fat: 14,
      carbs: 40,
      ingredients: '200 г творога, 1 яйцо, 2 ст. л. муки, немного сахара',
      recipe: 'Смешай, сформируй лепёшки, обжарь на среднем огне по 3–4 мин с каждой стороны.',
    },
    {
      id: 'b_bliny',
      title: 'Блины',
      kcal: 360,
      protein: 12,
      fat: 12,
      carbs: 50,
      ingredients: '2–3 блина, сметана или творог / ягоды',
      recipe: 'Разогрей блины на сковороде. Сметана, творог или ягоды — что есть.',
    },
    {
      id: 'b_omelet',
      title: 'Омлет',
      kcal: 290,
      protein: 20,
      fat: 20,
      carbs: 4,
      ingredients: '2 яйца, чуть молока, соль',
      recipe: 'Взбей яйца, вылей на сковороду, накрой на 4–5 минут.',
    },
  ],
  lunch: [
    {
      id: 'l_chicken',
      title: 'Курица + гречка + салат',
      kcal: 520,
      protein: 42,
      fat: 14,
      carbs: 48,
      ingredients: '150 г курицы, 60 г сухой гречки, огурец/помидор',
      recipe: 'Отвари гречку. Курицу запеки или обжарь. Овощи нарежь рядом.',
    },
    {
      id: 'l_soup',
      title: 'Суп и хлеб',
      kcal: 400,
      protein: 18,
      fat: 12,
      carbs: 50,
      ingredients: 'тарелка супа (~400 мл), 1–2 ломтика хлеба',
      recipe: 'Разогрей суп. Хлеб — по желанию с сыром.',
    },
    {
      id: 'l_fish',
      title: 'Рыба + овощи',
      kcal: 420,
      protein: 36,
      fat: 18,
      carbs: 20,
      ingredients: '150 г рыбы, гарнир овощей или 100 г картофеля',
      recipe: 'Запеки рыбу 15–20 мин. Овощи — на пару или сковороде.',
    },
    {
      id: 'l_pasta',
      title: 'Паста с курицей',
      kcal: 560,
      protein: 38,
      fat: 16,
      carbs: 62,
      ingredients: '80 г сухой пасты, 120 г курицы, чуть соуса',
      recipe: 'Отвари пасту. Курицу обжарь кусочками, смешай с пастой и соусом.',
    },
    {
      id: 'l_bowl',
      title: 'Боул с киноа и овощами',
      kcal: 480,
      protein: 24,
      fat: 16,
      carbs: 58,
      ingredients: '60 г киноа, овощи, 80 г курицы или нута',
      recipe: 'Отвари киноа. Сложи в миску с овощами и белком, заправь маслом.',
    },
    {
      id: 'l_rice',
      title: 'Рис + индейка + овощи',
      kcal: 500,
      protein: 40,
      fat: 12,
      carbs: 55,
      ingredients: '60 г сухого риса, 150 г индейки, овощи',
      recipe: 'Рис отвари. Индейку запеки/обжарь. Овощи — свежие или тушёные.',
    },
  ],
  dinner: [
    {
      id: 'd_omelet',
      title: 'Омлет с овощами',
      kcal: 300,
      protein: 22,
      fat: 20,
      carbs: 8,
      ingredients: '2 яйца, помидор, немного сыра или молока, соль',
      recipe: 'Взбей яйца, вылей на сковороду, добавь нарезанный помидор и сыр. Накрой — 4–5 мин.',
    },
    {
      id: 'd_cottage',
      title: 'Творог / йогурт + фрукты',
      kcal: 280,
      protein: 24,
      fat: 8,
      carbs: 28,
      ingredients: '150 г творога или 200 г йогурта, фрукт',
      recipe: 'Смешай с фруктом. Быстрый ужин без плиты.',
    },
    {
      id: 'd_fish',
      title: 'Рыба или курица + салат',
      kcal: 380,
      protein: 35,
      fat: 16,
      carbs: 12,
      ingredients: '120–150 г рыбы/курицы, лист салата, огурец',
      recipe: 'Белок запеки или разогрей. Салат заправь маслом и лимоном.',
    },
    {
      id: 'd_veg',
      title: 'Запечённые овощи + сыр',
      kcal: 340,
      protein: 16,
      fat: 18,
      carbs: 24,
      ingredients: 'кабачок/перец/помидор, 40–50 г сыра',
      recipe: 'Овощи запеки 15–20 мин, сверху сыр до расплавления.',
    },
    {
      id: 'd_salad',
      title: 'Большой салат с белком',
      kcal: 360,
      protein: 28,
      fat: 18,
      carbs: 16,
      ingredients: 'зелень, огурец, помидор, 100 г курицы/тунца/сыра',
      recipe: 'Нарежь всё в миску, заправь маслом. Белок сверху.',
    },
    {
      id: 'd_soup',
      title: 'Лёгкий суп',
      kcal: 280,
      protein: 14,
      fat: 8,
      carbs: 32,
      ingredients: 'тарелка супа (~350–400 мл)',
      recipe: 'Разогрей суп. Если жидковат — добавь яйцо всмятку или хлеб.',
    },
  ],
  snack: [
    {
      id: 's_chocolate',
      title: 'Шоколадка с чаем',
      kcal: 220,
      protein: 3,
      fat: 12,
      carbs: 24,
      ingredients: '20–30 г шоколада, чай',
      recipe: 'Завари чай, отломи пару долек. Без спешки.',
    },
    {
      id: 's_cookies',
      title: 'Печенье к чаю',
      kcal: 200,
      protein: 3,
      fat: 8,
      carbs: 28,
      ingredients: '2–3 печенья, чай или кофе',
      recipe: 'К чаю/кофе. Если хочется мягче — чуть подогрей печенье.',
    },
    {
      id: 's_yogurt',
      title: 'Йогурт или творожок',
      kcal: 150,
      protein: 10,
      fat: 4,
      carbs: 18,
      ingredients: '1 баночка йогурта / творожка (~150 г)',
      recipe: 'Открой и ешь. По желанию — ягоды или ложка варенья.',
    },
    {
      id: 's_banana',
      title: 'Банан',
      kcal: 105,
      protein: 1,
      fat: 0,
      carbs: 27,
      ingredients: '1 средний банан',
      recipe: 'Просто банан. Можно с чаем.',
    },
    {
      id: 's_ice',
      title: 'Мороженое',
      kcal: 220,
      protein: 4,
      fat: 10,
      carbs: 28,
      ingredients: '1 порция мороженого (~70–100 г)',
      recipe: 'Из морозилки. Без оправданий — это перекус.',
    },
    {
      id: 's_sandwich',
      title: 'Бутерброд с сыром',
      kcal: 250,
      protein: 12,
      fat: 12,
      carbs: 22,
      ingredients: 'ломтик хлеба, 20–30 г сыра',
      recipe: 'Хлеб + сыр. Можно в микроволновке 20 сек.',
    },
    {
      id: 's_nuts',
      title: 'Горсть орехов',
      kcal: 180,
      protein: 5,
      fat: 16,
      carbs: 6,
      ingredients: '20–25 г орехов',
      recipe: 'Отсыпь небольшую горсть — не из пакета «до конца».',
    },
  ],
}

export function mealSlotForHour(hour: number): MealSlot {
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

export function normMealTitle(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Dedupe key: «Бефстроганов с пюре» ≈ «бефстроганов + пюре».
 * Combo parts are sorted so order does not matter.
 */
export function canonicalMealKey(s: string): string {
  let t = s
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'„“.,!?;:()]/g, ' ')
  t = t.replace(/\s*[+/,&]\s*/g, ' + ')
  t = t.replace(/\s+с\s+/g, ' + ')
  t = t.replace(/\s+и\s+/g, ' + ')
  t = t.replace(/\s+/g, ' ').trim()
  if (t.includes(' + ')) {
    const parts = t
      .split(' + ')
      .map((p) => p.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'ru'))
    return parts.join(' + ')
  }
  return t
}

function slotForHour(hour: number): Slot {
  return mealSlotForHour(hour)
}

function norm(s: string): string {
  return canonicalMealKey(s)
}

export function formatIdeaMacros(s: Pick<MealSuggestion, 'kcal' | 'protein' | 'fat' | 'carbs'>): string {
  return `≈ ${Math.round(s.kcal)} ккал · Б ${Math.round(s.protein)} · Ж ${Math.round(s.fat)} · У ${Math.round(s.carbs)}`
}

export type SlotKcalBudget = {
  /** kcal left for the day after what's already logged */
  remaining: number
  /** hard ceiling for one idea in this slot (leaves room for the rest of the day) */
  maxKcal: number
  /** preferred size ~85% of max */
  targetKcal: number
}

/** How much of remaining day budget one meal may take (lunch ≠ dump everything). */
const USE_OF_REMAINING: Record<MealSlot, number> = {
  breakfast: 0.4,
  lunch: 0.45,
  dinner: 0.8,
  snack: 0.28,
}

/** Cap vs daily goal so a full-day leftover doesn't make lunch huge. */
const CAP_OF_GOAL: Record<MealSlot, number> = {
  breakfast: 0.32,
  lunch: 0.38,
  dinner: 0.42,
  snack: 0.18,
}

/**
 * Budget for one suggested meal. Example: ~1000 kcal left at lunch → max ~450,
 * not an 800 kcal steak that empties the day.
 */
export function slotKcalBudget(
  dailyGoal: number | undefined,
  eatenToday: number,
  slot: MealSlot,
): SlotKcalBudget | null {
  if (!(dailyGoal != null && dailyGoal > 0)) return null
  const remaining = Math.max(0, Math.round(dailyGoal - Math.max(0, eatenToday)))
  if (remaining <= 0) {
    return { remaining: 0, maxKcal: 0, targetKcal: 0 }
  }
  const fromRemaining = Math.round(remaining * USE_OF_REMAINING[slot])
  const fromGoal = Math.round(dailyGoal * CAP_OF_GOAL[slot])
  let maxKcal = Math.min(fromRemaining, fromGoal, remaining)
  if (maxKcal < 120) maxKcal = Math.min(remaining, 160)
  const targetKcal = Math.max(80, Math.round(maxKcal * 0.85))
  return { remaining, maxKcal, targetKcal }
}

/** Keep ideas within budget; unknown/zero kcal pass through for later enrich. */
export function filterIdeasByBudget(
  ideas: MealSuggestion[],
  maxKcal: number | null | undefined,
  tolerance = 0.05,
): MealSuggestion[] {
  if (maxKcal == null || !(maxKcal >= 0)) return ideas
  if (maxKcal <= 0) return []
  const ceiling = maxKcal * (1 + tolerance)
  return ideas.filter((s) => !(s.kcal > 0) || s.kcal <= ceiling)
}

/** Drop dislikes, prefer likes, dedupe by canonical title. */
export function rankMealIdeas(
  ideas: MealSuggestion[],
  prefs: TastePrefs,
  limit = 3,
): MealSuggestion[] {
  const disliked = new Set(prefs.dislikes.map(norm))
  const liked = new Set(prefs.likes.map(norm))
  const seen = new Set<string>()
  const available: MealSuggestion[] = []
  for (const s of ideas) {
    const n = norm(s.title)
    if (!n || disliked.has(n) || seen.has(n)) continue
    seen.add(n)
    available.push(s)
  }
  available.sort((a, b) => {
    const al = liked.has(norm(a.title)) ? 0 : 1
    const bl = liked.has(norm(b.title)) ? 0 : 1
    return al - bl
  })
  return available.slice(0, limit)
}

/**
 * Mix journal favourites with new ideas so the list is not 100% habitual.
 * Default: at most one familiar plate, the rest from novel/local/LLM.
 */
export function mixMealIdeas(
  habitual: MealSuggestion[],
  novel: MealSuggestion[],
  prefs: TastePrefs,
  limit = 3,
  maxHabitual = 1,
): MealSuggestion[] {
  const habCap = Math.min(maxHabitual, Math.max(0, limit - 1))
  const hab = rankMealIdeas(habitual, prefs, habCap)
  const taken = new Set(hab.map((h) => norm(h.title)))
  const novelFresh = novel.filter((n) => {
    const k = norm(n.title)
    return k && !taken.has(k)
  })
  let rest = rankMealIdeas(novelFresh, prefs, Math.max(0, limit - hab.length))
  if (hab.length + rest.length < limit) {
    const fill = rankMealIdeas(habitual, prefs, limit).filter((h) => !taken.has(norm(h.title)))
    for (const h of fill) {
      const k = norm(h.title)
      if (taken.has(k)) continue
      if (rest.some((r) => norm(r.title) === k)) continue
      rest = [...rest, h]
      taken.add(k)
      if (hab.length + rest.length >= limit) break
    }
  }
  return [...hab, ...rest].slice(0, limit)
}

export function applyTasteFeedback(
  prefs: TastePrefs,
  title: string,
  vote: 'like' | 'dislike',
): TastePrefs {
  const key = title.trim()
  if (!key) return prefs
  const n = norm(key)
  const likes = prefs.likes.filter((x) => norm(x) !== n)
  const dislikes = prefs.dislikes.filter((x) => norm(x) !== n)
  if (vote === 'like') likes.push(key)
  else dislikes.push(key)
  return { ...prefs, likes, dislikes, canCook: [...prefs.canCook] }
}

/** Local fallback ideas for a meal slot (respects optional kcal ceiling). */
export function mealSuggestions(
  now = new Date(),
  prefs: TastePrefs = { likes: [], dislikes: [], canCook: [] },
  limit = 3,
  slot?: MealSlot,
  maxKcal?: number | null,
): MealSuggestion[] {
  const s = slot ?? slotForHour(now.getHours())
  return rankMealIdeas(filterIdeasByBudget(BY_SLOT[s], maxKcal), prefs, limit)
}

export function localPoolForSlot(slot: MealSlot): MealSuggestion[] {
  return BY_SLOT[slot]
}
