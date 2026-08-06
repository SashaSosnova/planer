import type { FoodItem, RecipeIngredientLine } from '../types'

/** Grocery-aisle groups for ingredients. */
export type FoodCategoryId =
  | 'dairy'
  | 'meat'
  | 'fish'
  | 'eggs'
  | 'vegetables'
  | 'fruit'
  | 'grocery'
  | 'bread'
  | 'oils'
  | 'spices'
  | 'sweets'
  | 'drinks'
  | 'ready'
  | 'other'

/** Dish-style groups for recipes. */
export type DishCategoryId =
  | 'meat_dish'
  | 'poultry_dish'
  | 'fish_dish'
  | 'veg_side'
  | 'grains'
  | 'soups'
  | 'salads'
  | 'breakfast'
  | 'desserts'
  | 'other'

export type FoodCategoryDef = { id: FoodCategoryId; label: string }
export type DishCategoryDef = { id: DishCategoryId; label: string }

export const FOOD_CATEGORIES: FoodCategoryDef[] = [
  { id: 'dairy', label: 'Молочное' },
  { id: 'meat', label: 'Мясо и птица' },
  { id: 'fish', label: 'Рыба и морепродукты' },
  { id: 'eggs', label: 'Яйца' },
  { id: 'vegetables', label: 'Овощи и зелень' },
  { id: 'fruit', label: 'Фрукты и ягоды' },
  { id: 'grocery', label: 'Бакалея' },
  { id: 'bread', label: 'Хлеб и выпечка' },
  { id: 'oils', label: 'Масла и соусы' },
  { id: 'spices', label: 'Специи и приправы' },
  { id: 'sweets', label: 'Сладости' },
  { id: 'drinks', label: 'Напитки' },
  { id: 'ready', label: 'Готовое / кафе' },
  { id: 'other', label: 'Другое' },
]

export const DISH_CATEGORIES: DishCategoryDef[] = [
  { id: 'meat_dish', label: 'Из мяса' },
  { id: 'poultry_dish', label: 'Из курицы / птицы' },
  { id: 'fish_dish', label: 'Из рыбы' },
  { id: 'veg_side', label: 'Овощной гарнир' },
  { id: 'grains', label: 'Крупа' },
  { id: 'soups', label: 'Супы' },
  { id: 'salads', label: 'Салаты' },
  { id: 'breakfast', label: 'Завтраки' },
  { id: 'desserts', label: 'Десерты' },
  { id: 'other', label: 'Другое' },
]

const FOOD_IDS = new Set<string>(FOOD_CATEGORIES.map((c) => c.id))
const DISH_IDS = new Set<string>(DISH_CATEGORIES.map((c) => c.id))

function normalize(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е').trim()
}

export function isFoodCategoryId(value: string | undefined | null): value is FoodCategoryId {
  return Boolean(value && FOOD_IDS.has(value))
}

export function isDishCategoryId(value: string | undefined | null): value is DishCategoryId {
  return Boolean(value && DISH_IDS.has(value))
}

export function foodCategoryLabel(id: FoodCategoryId): string {
  return FOOD_CATEGORIES.find((c) => c.id === id)?.label ?? 'Другое'
}

export function dishCategoryLabel(id: DishCategoryId): string {
  return DISH_CATEGORIES.find((c) => c.id === id)?.label ?? 'Другое'
}

type Rule = { id: FoodCategoryId; re: RegExp }

/** First match wins — more specific aisles first. */
const FOOD_RULES: Rule[] = [
  {
    id: 'spices',
    re: /соль|перец(?!\s*(?:болгар|сладк))|паприк|специ|приправ|куркум|кориандр|зира|тмин|базилик\s*суш|орегано|лавровый|ванилин|разрыхлител|сода\s*пищев|кориц|имбирь\s*молот|чеснок\s*суш|хмели|уцхо|карри|мускат/,
  },
  {
    id: 'dairy',
    re: /молоко|сливки|сметан|творог|йогурт|кефир|ряженк|простокваш|сырок|сыр(?:$|[^а-я])|масло\s*сливоч|сливочн\w*\s*масло|сгущен|сгущ[её]н|айран|тан(?:$|[^а-я])|катык|снежок/,
  },
  {
    id: 'oils',
    re: /масло|маргарин|майонез|кетчуп|соус|уксус|горчиц|аджик|pesto|песто|заправк/,
  },
  {
    id: 'eggs',
    re: /яйц|яичн|меланж|омлет/,
  },
  {
    id: 'fish',
    re: /рыб|лосос|форел|семг|тунец|треск|сельдь|скумбр|минтай|хек|креветк|кальмар|мидии|морепродукт|икра|краб|устриц|угорь|судак|карп|щук/,
  },
  {
    id: 'meat',
    re: /говядин|свинин|баранин|телятин|курин|куриц|индейк|утка|гусь|фарш|колбас|сосиск|ветчин|бекон|грудинк|окорок|мясо|стейк|котлет|крыл|голень|филе\s*кур|печень|сердце|язык/,
  },
  {
    id: 'fruit',
    re: /яблок|груш|банан|апельсин|мандарин|лимон|лайм|киви|виноград|клубник|малин|черник|голубик|ежевик|вишн|черешн|персик|абрикос|слив(?:а|ы|овый)|дыня|арбуз|ананас|манго|хурма|гранат|смородин|крыжовник|фрукты|ягод/,
  },
  {
    id: 'vegetables',
    re: /овощ|огурец|помидор|томат|капуст|морков|свекл|кабачок|цукини|баклажан|брокколи|салат|шпинат|фасоль|стручков|горош|кукуруз|редис|репа|тыква|сельдерей|лук(?:$|[^а-я])|чеснок|руккол|латук|петрушк|укроп|зелень|перец\s*(болгар|сладк)|картофел|картошк/,
  },
  {
    id: 'bread',
    re: /хлеб|батон|булк|лаваш|лепешк|багет|чиабатт|тортиль|выпечк|сдоб|круассан|слойк|пирожк|пита(?:$|[^а-я])/,
  },
  {
    id: 'grocery',
    re: /гречк|рис(?:$|[^а-я])|овсян|овес|перлов|пшен|киноа|булгур|кус-кус|кускус|макарон|паста|лапш|спагетт|мука|крупа|хлопья|мюсли|нут(?:$|[^а-я])|чечевиц|горох\s*сух|сахар|мёд|мед(?:$|[^а-я])|крахмал|панировоч|сухар/,
  },
  {
    id: 'sweets',
    re: /шоколад|конфет|печенье|торт|пирожн|вафл|зефир|мармелад|пастил|халв|мороженое|пудинг|десерт|варен|джем|нутелл|сникерс|батончик/,
  },
  {
    id: 'drinks',
    re: /сок(?:$|[^а-я])|компот|морс|чай(?:$|[^а-я])|кофе|какао|вода|напиток|лимонад|квас|смузи|коктейль|пиво|вино|кола|газиров/,
  },
  {
    id: 'ready',
    re: /бургер|воппер|пицца|ролл|суши|шаурма|донер|наггетс|картофель\s*фри|wok|вок|лапша\s*быстр/,
  },
]

export function inferFoodCategory(name: string): FoodCategoryId {
  const n = normalize(name)
  if (!n) return 'other'
  // «Перец чёрный» is a spice; «перец болгарский» is a vegetable (vegetables rule has болгар/сладк)
  for (const rule of FOOD_RULES) {
    if (rule.re.test(n)) return rule.id
  }
  return 'other'
}

export function resolveFoodCategory(food: Pick<FoodItem, 'name' | 'category'>): FoodCategoryId {
  if (isFoodCategoryId(food.category)) return food.category
  return inferFoodCategory(food.name)
}

const POULTRY_RE =
  /куриц|курин|индейк|утка|гусь|цыпл|птиц|крыл(?:ья|о)|голень\s*кур|филе\s*кур/
const FISH_RE =
  /рыб|лосос|форел|семг|тунец|треск|сельдь|скумбр|минтай|хек|креветк|кальмар|мидии|морепродукт|икра|судак|щук/
const MEAT_RE =
  /говядин|свинин|баранин|телятин|фарш|колбас|сосиск|ветчин|бекон|мясо|стейк|котлет|печень\s*говя|язык/
const GRAINS_RE =
  /гречк|рис(?:$|[^а-я])|каш[аи]|булгур|киноа|кус-кус|кускус|макарон|паста|пшен|перлов|овсянк|крупа|спагетт|лапш/
const VEG_SIDE_RE =
  /овощн\w*\s*гарнир|гарнир\s*овощ|пюре|картофел|картошк|овощ|брокколи|цветн\w*\s*капуст|кабачок|цукини|баклажан|стручков|запеч[её]нн\w*\s*овощ|туш[её]н\w*\s*овощ|рагу\s*овощ|фасоль\s*струч/
const SOUP_RE = /суп|борщ|щи(?:$|[^а-я])|солянка|бульон|харчо|окрошка|уха(?:$|[^а-я])|рассольник|крем-суп/
const SALAD_RE = /салат|винегрет|цезарь/
const BREAKFAST_RE =
  /завтрак|омлет|яичниц|сырник|блин|овсянк|каша\s*овсян|гранол|тост|яйц[ао]\s*пашот|скрэмбл/
const DESSERT_RE =
  /десерт|торт|пирог|печенье|шоколад|мороженое|чизкейк|брауни|мусс|пудинг|панкейк|вафл|тирамису/

function textBlob(name: string, ingredients?: Array<Pick<RecipeIngredientLine, 'name'>>): string {
  const parts = [name, ...(ingredients?.map((i) => i.name) ?? [])]
  return normalize(parts.join(' '))
}

export function inferDishCategory(
  name: string,
  ingredients?: Array<Pick<RecipeIngredientLine, 'name'>>,
): DishCategoryId {
  const title = normalize(name)
  const blob = textBlob(name, ingredients)

  // Name-first structural types
  if (SOUP_RE.test(title)) return 'soups'
  if (SALAD_RE.test(title)) return 'salads'
  if (DESSERT_RE.test(title)) return 'desserts'
  if (BREAKFAST_RE.test(title)) return 'breakfast'

  // Protein from name or ingredients — poultry before generic meat
  if (POULTRY_RE.test(blob)) return 'poultry_dish'
  if (FISH_RE.test(blob)) return 'fish_dish'
  if (MEAT_RE.test(blob)) return 'meat_dish'

  if (GRAINS_RE.test(title) || GRAINS_RE.test(blob)) return 'grains'
  if (VEG_SIDE_RE.test(title) || VEG_SIDE_RE.test(blob)) return 'veg_side'
  if (/гарнир/.test(title) || /гарнир/.test(blob)) {
    if (GRAINS_RE.test(blob)) return 'grains'
    return 'veg_side'
  }

  // Broader name cues if ingredients were empty
  if (SOUP_RE.test(blob)) return 'soups'
  if (SALAD_RE.test(blob)) return 'salads'
  if (BREAKFAST_RE.test(blob)) return 'breakfast'
  if (DESSERT_RE.test(blob)) return 'desserts'

  return 'other'
}

export function resolveDishCategory(
  food: Pick<FoodItem, 'name' | 'category' | 'recipe'>,
): DishCategoryId {
  if (isDishCategoryId(food.category)) return food.category
  // Legacy «sides» / missing category → infer veg_side / grains / salads…
  return inferDishCategory(food.name, food.recipe?.ingredients)
}

export type CatalogGroup<T> = {
  id: string
  label: string
  items: T[]
}

/** Group items by resolved category, preserving category order; empty groups omitted. */
export function groupByFoodCategory<T extends Pick<FoodItem, 'name' | 'category'>>(
  items: T[],
): CatalogGroup<T>[] {
  const buckets = new Map<FoodCategoryId, T[]>()
  for (const item of items) {
    const id = resolveFoodCategory(item)
    const list = buckets.get(id)
    if (list) list.push(item)
    else buckets.set(id, [item])
  }
  return FOOD_CATEGORIES.flatMap((c) => {
    const groupItems = buckets.get(c.id)
    if (!groupItems?.length) return []
    return [{ id: c.id, label: c.label, items: groupItems }]
  })
}

export function groupByDishCategory<
  T extends Pick<FoodItem, 'name' | 'category' | 'recipe'>,
>(items: T[]): CatalogGroup<T>[] {
  const buckets = new Map<DishCategoryId, T[]>()
  for (const item of items) {
    const id = resolveDishCategory(item)
    const list = buckets.get(id)
    if (list) list.push(item)
    else buckets.set(id, [item])
  }
  return DISH_CATEGORIES.flatMap((c) => {
    const groupItems = buckets.get(c.id)
    if (!groupItems?.length) return []
    return [{ id: c.id, label: c.label, items: groupItems }]
  })
}
