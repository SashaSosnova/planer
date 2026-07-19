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

/** 1 — тяжело … 5 — отлично */
export type MoodLevel = 1 | 2 | 3 | 4 | 5

/** Mood + sleep for one calendar day */
export type DayCheckIn = {
  id: string
  date: string
  mood?: MoodLevel
  /** Hours slept the night before this date */
  sleepHours?: number
  createdAt: number
}

/** First day of a menstrual period */
export type PeriodStart = {
  id: string
  date: string
  createdAt: number
}

export type FoodRef = {
  id: string
  name: string
  aliases: string[]
  per100g: MacroSet
  kind?: FoodKind
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
  checkIns: DayCheckIn[]
  periodStarts: PeriodStart[]
}
