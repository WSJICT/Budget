import type {
  BudgetCategory,
  BudgetCategoryTotals,
  BudgetDaySummary,
  BudgetLine,
  BudgetSummary,
  TripPlan,
} from '@/types'

export const toBudgetNumber = (value: unknown): number => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return numeric
}

export const roundBudgetAmount = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export const formatBudgetAmount = (value: number): string => {
  const rounded = roundBudgetAmount(value)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

export const emptyCategoryTotals = (): BudgetCategoryTotals => ({
  attraction: 0,
  hotel: 0,
  meal: 0,
  transport: 0,
})

export interface CollectBudgetOptions {
  mealLabel?: (type: string) => string
}

export function collectBudgetLines(
  plan: TripPlan,
  options: CollectBudgetOptions = {}
): BudgetLine[] {
  const items: BudgetLine[] = []
  const mealLabel = options.mealLabel ?? ((type: string) => type)

  plan.days.forEach((day, dayIndex) => {
    const dayNumber = dayIndex + 1

    day.attractions.forEach((attraction, attractionIndex) => {
      const amount = roundBudgetAmount(toBudgetNumber(attraction.ticket_price))
      if (amount <= 0) return
      items.push({
        id: `attraction-${dayIndex}-${attractionIndex}`,
        type: 'attraction',
        dayIndex,
        dayNumber,
        name: attraction.name,
        amount,
        sourceIndex: attractionIndex,
      })
    })

    if (day.hotel) {
      const amount = roundBudgetAmount(toBudgetNumber(day.hotel.estimated_cost))
      if (amount > 0) {
        items.push({
          id: `hotel-${dayIndex}`,
          type: 'hotel',
          dayIndex,
          dayNumber,
          name: day.hotel.name,
          amount,
        })
      }
    }

    day.meals.forEach((meal, mealIndex) => {
      const amount = roundBudgetAmount(toBudgetNumber(meal.estimated_cost))
      if (amount <= 0) return
      items.push({
        id: `meal-${dayIndex}-${mealIndex}`,
        type: 'meal',
        dayIndex,
        dayNumber,
        name: `${mealLabel(meal.type)} · ${meal.name}`,
        amount,
        sourceIndex: mealIndex,
      })
    })
  })

  const transportTotal = roundBudgetAmount(toBudgetNumber(plan.budget?.total_transportation))
  const transportDays = plan.days
    .map((day, dayIndex) => ({ day, dayIndex }))
    .filter(({ day }) => Boolean(day.transportation && day.transportation.trim()))

  if (transportTotal > 0 && transportDays.length > 0) {
    const avg = roundBudgetAmount(transportTotal / transportDays.length)
    let remaining = transportTotal

    transportDays.forEach(({ day, dayIndex }, index) => {
      const amount = index === transportDays.length - 1 ? remaining : Math.min(avg, remaining)
      remaining = roundBudgetAmount(remaining - amount)
      items.push({
        id: `transport-${dayIndex}`,
        type: 'transport',
        dayIndex,
        dayNumber: day.day_index + 1,
        name: day.transportation,
        amount: roundBudgetAmount(amount),
      })
    })
  }

  return items
}

export function summarizeBudget(lines: BudgetLine[], plan: TripPlan): BudgetSummary {
  const byCategory = emptyCategoryTotals()
  const dayMap = new Map<number, BudgetDaySummary>()

  plan.days.forEach((day, index) => {
    dayMap.set(index + 1, {
      dayNumber: index + 1,
      date: day.date,
      total: 0,
      byCategory: emptyCategoryTotals(),
    })
  })

  lines.forEach((line) => {
    byCategory[line.type] = roundBudgetAmount(byCategory[line.type] + line.amount)

    const day = dayMap.get(line.dayNumber)
    if (!day) return
    day.total = roundBudgetAmount(day.total + line.amount)
    day.byCategory[line.type] = roundBudgetAmount(day.byCategory[line.type] + line.amount)
  })

  const byDay = Array.from(dayMap.values())
  const total = roundBudgetAmount(lines.reduce((sum, line) => sum + line.amount, 0))
  const maxDay = byDay.reduce<BudgetDaySummary | null>(
    (best, day) => (!best || day.total > best.total ? day : best),
    null
  )
  const maxItem = lines.reduce<BudgetLine | null>(
    (best, line) => (!best || line.amount > best.amount ? line : best),
    null
  )
  const topItems = [...lines].sort((a, b) => b.amount - a.amount).slice(0, 5)
  const dayCount = Math.max(byDay.length, 1)

  return {
    total,
    byCategory,
    byDay,
    topItems,
    dailyAverage: roundBudgetAmount(total / dayCount),
    maxDay,
    maxItem,
    itemCount: lines.length,
  }
}

export const BUDGET_CATEGORY_COLORS: Record<BudgetCategory, string> = {
  attraction: '#f2a65a',
  hotel: '#7aa2f7',
  meal: '#6fcf97',
  transport: '#d76e42',
}