export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type MacroSet = {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

export type FoodKind = 'ingredient' | 'dish'

/** Snapshot of one ingredient in a saved / draft recipe */
export type RecipeIngredientLine = {
  name: string
  gramsRaw: number
  foodId?: string
  per100g: MacroSet
  source: 'library' | 'estimate'
  /** cooked grams / raw grams (pasta ~2.3, chicken ~0.75) */
  yieldFactor: number
  yieldNote?: string
}

export type RecipeSnapshot = {
  ingredients: RecipeIngredientLine[]
  totalRawGrams: number
  totalCookedGrams: number
  totalMacros: MacroSet
  notes?: string
  /** Original free-text for the recipe editor (name + ingredient lines) */
  sourceText?: string
}

export type RecipeDraft = {
  name: string
  ingredients: RecipeIngredientLine[]
  totalRawGrams: number
  totalCookedGrams: number
  estimatedCookedGrams: number
  totalMacros: MacroSet
  per100g: MacroSet
  notes?: string
}

export type FoodItem = {
  id: string
  name: string
  aliases: string[]
  per100g: MacroSet
  updatedAt: number
  kind?: FoodKind
  recipe?: RecipeSnapshot
  /** Марка / кафе / магазин / сеть (поиск по справочнику) */
  brand?: string
  /**
   * Типичная порция в граммах. В справочнике КБЖУ хранятся на 100 г.
   * Для блюд с режимом «на порцию» = вес готового; подставляется в приём.
   * Иначе при добавлении — 100 г.
   */
  portionGrams?: number
}

export type MealItemSource = 'library' | 'estimate'

export type MealItem = {
  name: string
  grams: number
  foodId?: string
  kcal: number
  protein: number
  fat: number
  carbs: number
  source: MealItemSource
}

export type Meal = {
  id: string
  date: string
  mealType: MealType
  rawText: string
  items: MealItem[]
  totals: MacroSet
  isApproximate: boolean
  /** Away-from-home / restaurant-style approximate meal */
  eatingOut: boolean
  createdAt: number
}

export type WeightEntry = {
  id: string
  date: string
  kg: number
  createdAt: number
}

export type MeasurementEntry = {
  id: string
  date: string
  chest?: number
  waist?: number
  belly?: number
  hips?: number
  thigh?: number
  bicep?: number
  createdAt: number
}

export type StepsEntry = {
  id: string
  date: string
  count: number
  createdAt: number
}

/** Soft day mood anchor (optional, not from the 6‑minute book). */
export type DayMood = 'hard' | 'meh' | 'ok' | 'good' | 'easy'

/**
 * Six-minute diary entry for one calendar day.
 * `text` is a legacy/preview snapshot built from the structured fields.
 */
export type DayNote = {
  id: string
  date: string
  /** Preview / search snapshot (always set when the note exists). */
  text: string
  /** @deprecated Old rotating prompt — kept for stored data only */
  question?: string
  mood?: DayMood
  /** Morning: «Я благодарю за то, что…» (list) */
  grateful?: string[]
  /** Morning: what will make today great */
  greatDay?: string
  /** Morning: positive affirmation */
  affirmation?: string
  /** Evening: wonderful things that happened (list) */
  highlights?: string[]
  /** Evening: something good done for others */
  kindness?: string
  /** Evening: what to do better tomorrow */
  betterTomorrow?: string
  createdAt: number
  updatedAt: number
}

/** First day of a menstrual period */
export type PeriodStart = {
  id: string
  date: string
  createdAt: number
}

/** Daily supplement check-ins (iron once, magnesium with main meals) */
export type MedDayEntry = {
  id: string
  date: string
  /** ISO datetime when taken; omit = not taken */
  ironAt?: string
  mgBreakfastAt?: string
  mgLunchAt?: string
  mgDinnerAt?: string
  createdAt: number
  updatedAt: number
}

export type CareWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type CareSlot = 'morning' | 'evening'

/** Daily skin delta vs yesterday: better / same / worse */
export type CareSkinDelta = '+' | '0' | '-'

export type CareSkinTags = {
  /** Жирность Т-зоны: менее жирная? */
  tzoneOil?: CareSkinDelta
  /** Сухость щёк: меньше стянутости? */
  cheekDry?: CareSkinDelta
  /** Купероз / краснота: светлее? */
  redness?: CareSkinDelta
  /** Рельеф Т-зоны: глаже / меньше комедонов? */
  tzoneTexture?: CareSkinDelta
}

/** User-editable skincare product in the routine */
export type CareProduct = {
  id: string
  name: string
  slots: CareSlot[]
  /** Which weekdays the product is scheduled; `every` = all days */
  days: CareWeekday[] | 'every'
  how?: string
  sortOrder: number
  archived?: boolean
  createdAt: number
  updatedAt: number
}

/** Daily care check-ins + optional skin tags */
export type CareDayEntry = {
  id: string
  date: string
  /** Product ids checked in the morning */
  morning: string[]
  /** Product ids checked in the evening */
  evening: string[]
  skin?: CareSkinTags
  note?: string
  createdAt: number
  updatedAt: number
}

export type FoodRef = {
  id: string
  name: string
  aliases: string[]
  per100g: MacroSet
  kind?: FoodKind
  /** Typical serving — used when meal text has no grams */
  portionGrams?: number
}

/** How the draft was produced — shown in UI after «Рассчитать». */
export type MealParseSource = 'library' | 'deepseek' | 'local' | 'cloud'

export type ParsedMealDraft = {
  mealType: MealType
  items: MealItem[]
  totals: MacroSet
  isApproximate: boolean
  eatingOut: boolean
  parseSource: MealParseSource
  notes?: string
}

export type AppData = {
  foods: FoodItem[]
  meals: Meal[]
  weights: WeightEntry[]
  measurements: MeasurementEntry[]
  steps: StepsEntry[]
  dayNotes: DayNote[]
  periodStarts: PeriodStart[]
  medDays: MedDayEntry[]
  careProducts: CareProduct[]
  careDays: CareDayEntry[]
}
