import { daysInMonth, monthKeyOf, shiftMonth, summarizeMonth } from './analytics';
import { addDays } from './format';

/**
 * Rachas e insignias a partir de estadísticas agregadas (fechas con registros,
 * gasto por día y conteo por origen) que calcula la base.
 *
 * Una insignia se gana al llegar al 100 % y queda guardada (badge_unlocks): sigue
 * desbloqueada aunque después se rompa la racha o baje el progreso.
 */

/** Días de actividad que se consultan para rachas e insignias. */
export const ACTIVITY_WINDOW_DAYS = 120;

/** Ingresos y gastos del mes anterior (para la insignia "Mes en verde"). */
export function lastMonthTotals(monthlyTotals, todayIso) {
  const summary = summarizeMonth(monthlyTotals, shiftMonth(monthKeyOf(todayIso), -1));
  return { income: summary.income, expense: summary.spent };
}

/** Filas de badge_unlocks -> Map(id, fecha en milisegundos). */
export const unlocksById = rows => new Map(rows.map(row => [row.badge_id, row.unlocked_at]));

/** Insignias que llegaron al 100 % y todavía no están guardadas. */
export const newlyEarned = badges => badges.filter(b => b.progress >= 1 && b.unlockedAt == null).map(b => b.id);

/** Días consecutivos (terminando hoy o ayer) con al menos un registro. */
export function loggingStreak(recordDates, todayIso) {
  const days = new Set(recordDates);
  let cursor = days.has(todayIso) ? todayIso : addDays(todayIso, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * Días consecutivos, hasta ayer, sin superar el presupuesto diario. `floorDate`
 * es la fecha más antigua con datos disponibles (primer registro o inicio de la consulta).
 */
export function underBudgetStreak(dailyExpenses, { todayIso, budget, floorDate }) {
  if (!(budget > 0) || !floorDate) {
    return 0;
  }
  const spentByDay = Object.fromEntries(dailyExpenses.map(day => [day.date, day.total]));
  let cursor = addDays(todayIso, -1);
  let streak = 0;
  while (cursor >= floorDate) {
    if ((spentByDay[cursor] || 0) > budget / daysInMonth(cursor)) {
      break;
    }
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

const ratio = (value, target) => Math.max(0, Math.min(1, value / target));

/**
 * @param stats { recordDates, dailyExpenses, sourceCounts, dateRange }
 * @param lastMonth { income, expense } del mes anterior
 * @param unlocks Map(id, fecha) de las insignias ya guardadas
 */
export function evaluateBadges(stats, goals, { todayIso, budget, sinceDate, lastMonth, unlocks = new Map() }) {
  const sources = stats.sourceCounts || {};
  const confirmedCount = Object.values(sources).reduce((sum, n) => sum + n, 0);
  const firstRecord = stats.dateRange?.first || null;
  const floorDate = firstRecord && sinceDate && firstRecord < sinceDate ? sinceDate : firstRecord;

  const logging = loggingStreak(stats.recordDates || [], todayIso);
  const underBudget = underBudgetStreak(stats.dailyExpenses || [], { todayIso, budget, floorDate });
  const aiCount = (sources.ai || 0) + (sources.voice || 0);
  const receipts = sources.receipt || 0;
  const automated = (sources.sms || 0) + (sources.notification || 0);
  const bestGoal = goals.reduce((best, g) => Math.max(best, g.target > 0 ? g.saved / g.target : 0), 0);
  const greenMonth = lastMonth && lastMonth.income > 0 && lastMonth.income > lastMonth.expense;

  const badges = [
    { id: 'first-step', title: 'Primer paso', description: 'Registra tu primer movimiento', tier: 'bronze', progress: ratio(confirmedCount, 1) },
    { id: 'streak-7', title: 'Constancia', description: '7 días seguidos registrando', tier: 'silver', progress: ratio(logging, 7) },
    { id: 'streak-30', title: 'Hábito de acero', description: '30 días seguidos registrando', tier: 'gold', progress: ratio(logging, 30) },
    { id: 'budget-14', title: 'Guardián', description: '14 días sin pasarte del presupuesto diario', tier: 'silver', progress: ratio(underBudget, 14) },
    { id: 'green-month', title: 'Mes en verde', description: 'Cierra un mes con más ingresos que gastos', tier: 'gold', progress: greenMonth ? 1 : 0 },
    { id: 'goal-done', title: 'Meta cumplida', description: 'Completa una meta de ahorro', tier: 'gold', progress: ratio(bestGoal, 1) },
    { id: 'ai-scribe', title: 'Escriba IA', description: '10 registros por voz o texto natural', tier: 'bronze', progress: ratio(aiCount, 10) },
    { id: 'receipt-hunter', title: 'Cazarrecibos', description: 'Escanea 5 recibos', tier: 'silver', progress: ratio(receipts, 5) },
    { id: 'autopilot', title: 'Piloto automático', description: 'Confirma un movimiento detectado automáticamente', tier: 'bronze', progress: ratio(automated, 1) },
  ];
  return {
    loggingStreak: logging,
    underBudgetStreak: underBudget,
    badges: badges.map(badge => {
      const unlockedAt = unlocks.get(badge.id) ?? null;
      return { ...badge, unlocked: badge.progress >= 1 || unlockedAt != null, unlockedAt };
    }),
  };
}
