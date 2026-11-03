<template>
  <div class="budget-dashboard">
    <div v-if="!hasData" class="bd-empty">
      <a-empty :description="t('result.budgetDashboard.empty')" />
    </div>

    <template v-else>
      <div class="bd-kpi-grid">
        <div v-for="kpi in kpis" :key="kpi.key" class="bd-kpi">
          <div class="bd-kpi-label">{{ kpi.label }}</div>
          <div class="bd-kpi-value">{{ kpi.value }}</div>
          <div class="bd-kpi-hint">{{ kpi.hint }}</div>
        </div>
      </div>

      <div class="bd-chart-grid">
        <section class="bd-panel">
          <header class="bd-panel-title">{{ t('result.budgetDashboard.categoryTitle') }}</header>
          <div ref="pieRef" class="bd-chart"></div>
        </section>

        <section class="bd-panel">
          <header class="bd-panel-title">{{ t('result.budgetDashboard.dailyTitle') }}</header>
          <div ref="barRef" class="bd-chart"></div>
        </section>
      </div>

      <section class="bd-panel bd-limit">
        <div class="bd-limit-head">
          <span class="bd-panel-title">{{ t('result.budgetDashboard.limitTitle') }}</span>
          <a-input-number
            v-model:value="limitValue"
            :min="0"
            :step="100"
            :placeholder="t('result.budgetDashboard.limitPlaceholder')"
            class="bd-limit-input"
          />
        </div>

        <div class="bd-limit-bar">
          <div
            class="bd-limit-fill"
            :class="{ 'is-over': overspend > 0 }"
            :style="{ width: `${usagePercent}%` }"
          ></div>
        </div>

        <div class="bd-limit-meta">
          <span v-if="!limitValue">{{ t('result.budgetDashboard.limitUnset') }}</span>
          <template v-else>
            <span>{{ t('result.budgetDashboard.limitUsage', { percent: usagePercent.toFixed(0) }) }}</span>
            <span v-if="overspend > 0" class="bd-limit-over">
              {{ t('result.budgetDashboard.limitOver', { amount: formatBudgetAmount(overspend) }) }}
            </span>
            <span v-else class="bd-limit-remain">
              {{ t('result.budgetDashboard.limitRemaining', { amount: formatBudgetAmount(remaining) }) }}
            </span>
          </template>
        </div>
      </section>

      <section class="bd-panel">
        <header class="bd-panel-title">{{ t('result.budgetDashboard.topTitle') }}</header>
        <ul class="bd-top-list">
          <li v-for="(item, index) in summary.topItems" :key="item.id" class="bd-top-item">
            <span class="bd-top-rank">{{ index + 1 }}</span>
            <span class="bd-top-name">{{ item.name }}</span>
            <span class="bd-top-day">{{ t('result.budgetDashboard.dayLabel', { day: item.dayNumber }) }}</span>
            <span class="bd-top-type">{{ categoryLabel(item.type) }}</span>
            <span class="bd-top-amount">¥{{ formatBudgetAmount(item.amount) }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as echarts from 'echarts'
import type { BudgetCategory, TripPlan } from '@/types'
import {
  BUDGET_CATEGORY_COLORS,
  collectBudgetLines,
  formatBudgetAmount,
  summarizeBudget,
} from '@/utils/budget'

const props = defineProps<{
  plan: TripPlan
  planId?: string
}>()

const { t, locale } = useI18n()

const mealLabel = (type: string): string => {
  const labels: Record<string, string> = {
    breakfast: t('result.meals.breakfast'),
    lunch: t('result.meals.lunch'),
    dinner: t('result.meals.dinner'),
    snack: t('result.meals.snack'),
  }
  return labels[type] || type
}

const lines = computed(() => collectBudgetLines(props.plan, { mealLabel }))
const summary = computed(() => summarizeBudget(lines.value, props.plan))
const hasData = computed(() => summary.value.itemCount > 0)

const categoryLabel = (type: BudgetCategory): string => t(`result.budgetDashboard.${type}`)

const kpis = computed(() => {
  const maxDay = summary.value.maxDay
  const maxItem = summary.value.maxItem

  return [
    {
      key: 'total',
      label: t('result.budgetDashboard.kpiTotal'),
      value: `¥${formatBudgetAmount(summary.value.total)}`,
      hint: t('result.budgetDashboard.hintItems', { count: summary.value.itemCount }),
    },
    {
      key: 'daily',
      label: t('result.budgetDashboard.kpiDaily'),
      value: `¥${formatBudgetAmount(summary.value.dailyAverage)}`,
      hint: t('result.budgetDashboard.hintDays', { days: summary.value.byDay.length }),
    },
    {
      key: 'maxDay',
      label: t('result.budgetDashboard.kpiMaxDay'),
      value: maxDay ? `¥${formatBudgetAmount(maxDay.total)}` : '--',
      hint: maxDay ? t('result.budgetDashboard.dayLabel', { day: maxDay.dayNumber }) : '--',
    },
    {
      key: 'maxItem',
      label: t('result.budgetDashboard.kpiMaxItem'),
      value: maxItem ? `¥${formatBudgetAmount(maxItem.amount)}` : '--',
      hint: maxItem ? `${categoryLabel(maxItem.type)} · ${maxItem.name}` : '--',
    },
  ]
})

const limitKey = computed(() => `tripstar.budget.limit.${props.planId || 'default'}`)
const limitValue = ref<number | null>(null)

const loadLimit = () => {
  try {
    const raw = localStorage.getItem(limitKey.value)
    const numeric = raw === null ? NaN : Number(raw)
    limitValue.value = Number.isFinite(numeric) && numeric > 0 ? numeric : null
  } catch {
    limitValue.value = null
  }
}

const persistLimit = () => {
  try {
    if (limitValue.value && limitValue.value > 0) {
      localStorage.setItem(limitKey.value, String(limitValue.value))
    } else {
      localStorage.removeItem(limitKey.value)
    }
  } catch {
    // localStorage 不可用时忽略
  }
}

watch(limitKey, loadLimit)
watch(limitValue, persistLimit)

const usagePercent = computed(() => {
  const limit = limitValue.value
  if (!limit || limit <= 0) return 0
  return Math.min(100, (summary.value.total / limit) * 100)
})

const remaining = computed(() => Math.max(0, (limitValue.value ?? 0) - summary.value.total))
const overspend = computed(() => Math.max(0, summary.value.total - (limitValue.value ?? 0)))

const pieRef = ref<HTMLDivElement | null>(null)
const barRef = ref<HTMLDivElement | null>(null)
let pieChart: ReturnType<typeof echarts.init> | null = null
let barChart: ReturnType<typeof echarts.init> | null = null

const axisTextStyle = { color: 'rgba(255, 255, 255, 0.68)', fontSize: 11 }
const splitLineStyle = { lineStyle: { color: 'rgba(255, 255, 255, 0.08)' } }

const renderPie = () => {
  if (!pieRef.value) return
  if (!pieChart) pieChart = echarts.init(pieRef.value)

  const categories: BudgetCategory[] = ['attraction', 'hotel', 'meal', 'transport']
  const data = categories
    .map((type) => ({
      name: categoryLabel(type),
      value: summary.value.byCategory[type],
      itemStyle: { color: BUDGET_CATEGORY_COLORS[type] },
    }))
    .filter((item) => item.value > 0)

  pieChart.setOption(
    {
      tooltip: {
        trigger: 'item',
        formatter: (params: { name: string; value: number; percent: number }) =>
          `${params.name}: ¥${formatBudgetAmount(params.value)} (${params.percent}%)`,
      },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: 'rgba(255, 255, 255, 0.72)', fontSize: 12 },
      },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: 'rgba(3, 10, 15, 0.9)',
            borderWidth: 2,
          },
          label: {
            color: 'rgba(255, 255, 255, 0.8)',
            fontSize: 11,
            formatter: '{b}\n{d}%',
          },
          labelLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.28)' } },
          data,
        },
      ],
    },
    true
  )
}

const renderBar = () => {
  if (!barRef.value) return
  if (!barChart) barChart = echarts.init(barRef.value)

  const categories: BudgetCategory[] = ['attraction', 'hotel', 'meal', 'transport']
  const series = categories.map((type) => ({
    name: categoryLabel(type),
    type: 'bar' as const,
    stack: 'budget',
    barMaxWidth: 36,
    itemStyle: { color: BUDGET_CATEGORY_COLORS[type], borderRadius: [3, 3, 0, 0] },
    data: summary.value.byDay.map((day) => day.byCategory[type]),
  }))

  barChart.setOption(
    {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: number) => `¥${formatBudgetAmount(value)}`,
      },
      legend: {
        top: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: 'rgba(255, 255, 255, 0.72)', fontSize: 12 },
      },
      grid: { left: 44, right: 16, top: 44, bottom: 28 },
      xAxis: {
        type: 'category',
        data: summary.value.byDay.map((day) => `D${day.dayNumber}`),
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.18)' } },
        axisTick: { show: false },
        axisLabel: axisTextStyle,
      },
      yAxis: {
        type: 'value',
        axisLabel: axisTextStyle,
        splitLine: splitLineStyle,
      },
      series,
    },
    true
  )
}

const renderCharts = () => {
  renderPie()
  renderBar()
}

const handleResize = () => {
  pieChart?.resize()
  barChart?.resize()
}

onMounted(() => {
  loadLimit()
  void nextTick(renderCharts)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  pieChart?.dispose()
  barChart?.dispose()
  pieChart = null
  barChart = null
})

watch(
  () => props.plan,
  () => void nextTick(renderCharts),
  { deep: true }
)

watch(locale, () => void nextTick(renderCharts))
</script>

<style scoped>
.budget-dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: rgba(255, 255, 255, 0.86);
}

.bd-empty {
  padding: 40px 0;
}

.bd-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.bd-kpi {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(3, 10, 15, 0.88);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 104px;
}

.bd-kpi-label {
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}

.bd-kpi-value {
  font-family: 'Outfit', 'Segoe UI', sans-serif;
  font-size: 28px;
  font-weight: 700;
  color: #ffd5c6;
  line-height: 1.1;
}

.bd-kpi-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.56);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bd-chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.bd-panel {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(3, 10, 15, 0.88);
  padding: 18px;
}

.bd-panel-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.86);
  margin-bottom: 10px;
}

.bd-chart {
  width: 100%;
  height: 300px;
}

.bd-limit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bd-limit-head .bd-panel-title {
  margin-bottom: 0;
}

.bd-limit-input {
  width: 200px;
}

.bd-limit-bar {
  margin-top: 16px;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.bd-limit-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #a14625, #d76e42, #f2a65a);
  transition: width 0.35s ease;
}

.bd-limit-fill.is-over {
  background: linear-gradient(90deg, #b42318, #ff6b6b);
}

.bd-limit-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.68);
}

.bd-limit-over {
  color: #ff8a80;
  font-weight: 600;
}

.bd-limit-remain {
  color: #8be0b0;
  font-weight: 600;
}

.bd-top-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.bd-top-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 88px 96px 110px;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 13px;
}

.bd-top-item:last-child {
  border-bottom: none;
}

.bd-top-rank {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(215, 110, 66, 0.22);
  color: #ffd5c6;
  font-weight: 700;
  font-size: 12px;
}

.bd-top-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bd-top-day,
.bd-top-type {
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
}

.bd-top-amount {
  text-align: right;
  font-weight: 600;
  color: #ffd5c6;
}

@media (max-width: 1100px) {
  .bd-chart-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .bd-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .bd-kpi-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .bd-top-item {
    grid-template-columns: 24px minmax(0, 1fr) 96px;
  }

  .bd-top-day,
  .bd-top-type {
    display: none;
  }

  .bd-chart {
    height: 260px;
  }
}
</style>