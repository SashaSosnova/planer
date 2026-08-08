import type { Meal } from '../types'

/** Cyrillic-safe “word” chars — JS \\w is ASCII-only. */
const W = '[а-яa-z0-9]'

/**
 * Treats / sweets — tasty, not a meal.
 * Shared with cycle calorie insights.
 *
 * Matching is name-only (substring / short stems). Prefer stems that cover
 * inflections (бисквит → бисквитный) and avoid bare words that hit savory food.
 */
const SWEET_PARTS = [
  // Chocolate & candy
  'шоколад',
  'какао',
  'конфет',
  'леденц',
  'чупа',
  'драже',
  'карамел',
  'ирис(?:[^а-я]|$)',
  'тоффи',
  'нуга',
  'грильяж',
  'козинак',
  'щербет',
  'шербет',
  'лукум',
  'рахат',
  'халв',
  'зефир',
  'пастил',
  'мармелад',
  'суфле',
  'трюфель',
  'пралине',
  'птичье\\s*молоко',
  `глазированн${W}*\\s*сырок`,
  'сырок(?:[^а-я]|$)',

  // Cakes & plated desserts
  'торт',
  'пирожное',
  'эклер',
  'профитрол',
  'тирамису',
  'чизкейк',
  'брауни',
  'brownie',
  'бисквит',
  'медовик',
  'наполеон',
  'птифур',
  'безе(?:[^а-я]|$)',
  'меренг',
  'мусс(?:[^а-я]|$)',
  'пудинг',
  'панна\\s*котт',
  'паннакотт',
  'крем.?брюле',
  'шарлотк',
  'штрудел',
  'пахлав',
  'баклав',
  'baklava',
  'флан(?:[^а-я]|$)',
  'клафути',
  'десерт',
  'желе(?:[^а-я]|$)',
  'канноли',
  'cannoli',

  // Cookies & pastry (plain bakery like круассан/слойка — not treats)
  'печен(?:ье|ья|ьк|юш)',
  'пряник',
  'коврижк',
  'вафл',
  `круассан${W}*\\s+(?:с\\s*)?(?:шокол|крем|варен|джем|сгущ|яблок|миндал|нутелл|карамел|ягод|вишн|клубник)`,
  `(?:шокол|миндальн|карамельн)${W}*\\s*круассан`,
  `слойк${W}*\\s+(?:с\\s*)?(?:шокол|крем|варен|джем|сгущ|яблок|творож|вишн|ягод)`,
  `рогалик${W}*\\s+(?:с\\s*)?(?:шокол|мак|изюм|варен|джем|сгущ|крем)`,
  'донат',
  'пончик',
  'muffin',
  'маффин',
  'кекс(?:[^а-я]|$)',
  'кулич',
  `ромов${W}*\\s*баба`,
  'баба\\s*ромов',
  'штоллен',
  'stollen',
  'тарт(?:[^а-я]|$)',
  'тарталет',
  'синнабон',
  'cinnabon',
  'чуррос',
  'churros',
  `заварн${W}*\\s*(?:крем|трубоч|пираж)`,
  `трубочк${W}*\\s*(?:с\\s*)?крем`,
  `корзинк${W}*\\s*(?:с\\s*)?крем`,
  'мазурк',
  `булочк${W}*\\s*(?:с\\s*)?(?:кориц|мак|изюм|варен|джем|сгущ|крем|шокол|яблок)`,
  `сладк${W}*\\s*(?:круассан|слойк|рогалик|булочк|выпечк)`,

  // Sweet rolls / pies (narrow — avoid мясной рулет / пирог с капустой)
  `бисквитн${W}*\\s*рулет`,
  `сладк${W}*\\s*рулет`,
  'рулет\\s*(?:с\\s*)?(?:маком|орех|варен|джем|сгущ|крем|шокол|изюм|кокос|яблок|вишн|черник)',
  `яблочн${W}*\\s*пирог`,
  'пирог\\s*(?:с\\s*)?(?:яблок|вишн|черник|творож|малин|клубник|груш|слив|кураг|изюм)',
  `открыт${W}*\\s*пирог\\s*(?:с\\s*)?(?:ягод|фрукт|яблок|творож)`,

  // Ice cream & frozen
  'мороже',
  'пломбир',
  'эскимо',
  'сорбет',
  'sundae',
  'милкшейк',
  'milkshake',
  'айс.?крим',
  'ice\\s*cream',

  // Spreads & sweet toppings
  'сгущен',
  'варень',
  'джем(?:[^а-я]|$)',
  'повидл',
  'конфитюр',
  'нутелл',
  'nutella',
  'сироп',
  '(?:^|[^а-яa-z])мед(?:[^а-яa-z]|$)',
  `шоколадн${W}*\\s*паста`,
  `орехов${W}*\\s*паста`,

  // Dairy dessert snacks
  'сырник',
  'даниссимо',
  'danissimo',
  'чудо\\s*творож',
  `творож${W}*\\s*десерт`,
  `десерт${W}*\\s*творож`,

  // Cotton candy / caramel popcorn
  'сладкая\\s*вата',
  'сахарная\\s*вата',
  'cotton\\s*candy',
  `попкорн${W}*\\s*(?:сладк|карамел)`,
  `карамельн${W}*\\s*попкорн`,

  // Generic “treat” wording
  'сладкое(?:[^а-я]|$)',
  'сладости',
  'лакомств',
  'выпечка\\s*сладк',
  'сладкая\\s*выпечк',

  // Brands & bars
  'киндер',
  'kinder',
  'м&m',
  'm&m',
  'батончик',
  'bueno',
  'kitkat',
  'kit.?kat',
  'snickers',
  'сникерс',
  'twix',
  'твикс',
  'oreo',
  'орео',
  'mars(?:[^a-z]|$)',
  'батончик\\s*марс',
  'bounty',
  'баунти',
  'milky\\s*way',
  'милки\\s*вей',
  'raffaello',
  'рафаэлло',
  'ferrero',
  'ферреро',
  'toblerone',
  'тоблерон',
  'lindt',
  'линдт',
  'milka',
  'милка',
  'alpen\\s*gold',
  'альпен\\s*гольд',
  'picnic',
  'батончик\\s*пикник',
  'батончик\\s*lion',
  'lion\\s*батончик',
  'скиттлс',
  'skittles',
  'haribo',
  'харибо',
  'mentos',
  'ментос',
  'biscoff',
  'roshen',
  'рошен',
  'candy',
  'sweets?',
  'dessert',
]

export const SWEET_RE = new RegExp(SWEET_PARTS.join('|'), 'i')

/** Savory / cooking uses that should not count as treats. */
const SWEET_EXCLUDE = new RegExp(
  [
    'перец\\s*сладк',
    'сладк(?:ий|ого|ая|ую)?\\s*перец',
    'паприк',
    'томатн',
    'соус\\s*сладк',
    'кисло.?сладк',
    'салат',
    'куриц',
    'говяд',
    'рыб',
    'суп',
    'борщ',
    `мясн${W}*\\s*рулет`,
    `капустн${W}*\\s*рулет`,
    'рулет\\s*(?:из\\s*)?(?:мяса|куриц|говяд|свинин|индейк|капуст)',
    `сладк${W}*\\s*(?:картоф|лук|рис|горох)`,
    'батат',
    'какао.?порошок',
    'какао\\s*для\\s*выпечк',
  ].join('|'),
  'i',
)

/** Fixed daily treat budget — independent of calorie goal. */
export const SWEET_BUDGET_KCAL = 300

function normalize(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е')
}

export function isSweetName(name: string): boolean {
  const n = normalize(name)
  if (!n.trim()) return false
  if (SWEET_EXCLUDE.test(n)) return false
  return SWEET_RE.test(n)
}

/** Daily sweets budget in kcal (fixed). */
export function calcSweetBudgetKcal(_dailyKcalGoal?: number): number {
  return SWEET_BUDGET_KCAL
}

/**
 * Sum kcal of sweet-like items. If a meal has no matching items but the
 * free-text looks like a pure treat snack, count the whole meal.
 */
export function sweetKcalFromMeals(meals: Meal[]): number {
  let total = 0
  for (const meal of meals) {
    let fromItems = 0
    for (const item of meal.items) {
      if (isSweetName(item.name)) fromItems += Number(item.kcal) || 0
    }
    if (fromItems > 0) {
      total += fromItems
      continue
    }
    const blob = `${meal.rawText} ${meal.items.map((i) => i.name).join(' ')}`
    if (isSweetName(blob) && meal.items.length <= 2) {
      total += Number(meal.totals?.kcal) || 0
    }
  }
  return Math.round(total)
}

export function sweetScaleZone(
  sweetKcal: number,
  budgetKcal: number,
): 'ok' | 'warn' | 'over' {
  const budget = budgetKcal > 0 ? budgetKcal : 1
  if (sweetKcal > budget * 1.15) return 'over'
  if (sweetKcal > budget) return 'warn'
  return 'ok'
}
