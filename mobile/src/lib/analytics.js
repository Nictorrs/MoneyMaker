import { CATEGORIES } from '../theme';
import { formatMoney, MONTHS_SHORT } from './format';

/**
 * Lógica analítica sobre totales agregados por mes, tipo y categoría
 * ({ month: 'YYYY-MM', type, category, total, count }), que la base local
 * calcula en SQL. Nada aquí recorre la lista completa de movimientos.
 */

export const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const EMPTY_OVERVIEW = { balance: 0, monthlyTotals: [], recent: [], pending: [], pendingCount: 0, recordDates: [] };

export const monthKeyOf = iso => iso.slice(0, 7);

export function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Acepta 'YYYY-MM' o 'YYYY-MM-DD'. */
export function daysInMonth(isoOrMonth) {
  const [year, month] = isoOrMonth.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

export function monthBounds(monthKey) {
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, '0')}` };
}

export function monthLabel(monthKey, { short = false } = {}) {
  const [year, month] = monthKey.split('-').map(Number);
  return `${(short ? MONTHS_SHORT : MONTHS_LONG)[month - 1]} ${year}`;
}

export function projectMonth({ spent, budget, todayIso }) {
  const days = daysInMonth(todayIso);
  const elapsed = Number(todayIso.slice(8, 10));
  const dailyRate = spent / elapsed;
  const projected = dailyRate * days;
  const remaining = budget - spent;
  let overdraftDay = null;
  if (budget > 0 && dailyRate > 0 && projected > budget) {
    overdraftDay = Math.min(days, Math.max(elapsed, Math.ceil(budget / dailyRate)));
  }
  const daysLeft = days - elapsed;
  return {
    daysInMonth: days,
    daysLeft,
    dailyRate,
    projected,
    remaining,
    overdraftDay,
    dailyLimit: Math.max(remaining, 0) / Math.max(daysLeft, 1),
  };
}

/**
 * Resumen de un mes. El promedio diario del mes en curso usa los días transcurridos;
 * `days` fuerza el divisor (comparaciones sobre el mismo periodo).
 */
export function summarizeMonth(totals, monthKey, { todayIso, days: daysOverride } = {}) {
  let spent = 0;
  let income = 0;
  let count = 0;
  const byCategoryMap = {};
  for (const row of totals) {
    if (row.month !== monthKey) {
      continue;
    }
    count += row.count || 0;
    if (row.type === 'income') {
      income += row.total;
    } else {
      spent += row.total;
      byCategoryMap[row.category] = (byCategoryMap[row.category] || 0) + row.total;
    }
  }
  const byCategory = Object.entries(byCategoryMap)
    .map(([category, total]) => ({ category, total, share: spent ? total / spent : 0 }))
    .sort((a, b) => b.total - a.total);
  const isCurrent = Boolean(todayIso) && monthKeyOf(todayIso) === monthKey;
  const days = daysOverride || (isCurrent ? Number(todayIso.slice(8, 10)) : daysInMonth(monthKey));
  return { month: monthKey, spent, income, net: income - spent, count, byCategory, dailyAverage: spent / days, isCurrent };
}

/** Modelo del Centro de mando a partir del snapshot que entrega la base. */
export function buildOverviewModel(overview, { todayIso, budget }) {
  const month = summarizeMonth(overview.monthlyTotals, monthKeyOf(todayIso), { todayIso });
  return {
    balance: overview.balance,
    spent: month.spent,
    income: month.income,
    budget,
    remaining: budget - month.spent,
    progress: budget > 0 ? month.spent / budget : 0,
    byCategory: month.byCategory,
    projection: projectMonth({ spent: month.spent, budget, todayIso }),
    recent: overview.recent,
    pending: overview.pending,
    pendingCount: overview.pendingCount,
  };
}

/** Ingresos y egresos de los `months` meses que terminan en `anchorMonth`. */
export function monthlySeries(totals, { anchorMonth, months = 6 }) {
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const key = shiftMonth(anchorMonth, -i);
    buckets.push({ key, label: MONTHS_SHORT[Number(key.slice(5, 7)) - 1], income: 0, expense: 0 });
  }
  const index = Object.fromEntries(buckets.map((bucket, i) => [bucket.key, i]));
  for (const row of totals) {
    const i = index[row.month];
    if (i !== undefined) {
      buckets[i][row.type === 'income' ? 'income' : 'expense'] += row.total;
    }
  }
  return buckets;
}

/**
 * Diferencia entre A (periodo analizado) y B (referencia). La tendencia es
 * 'flat' si el cambio es menor al 0,5%; el color lo decide la UI según si
 * subir es bueno (ingresos) o malo (gastos).
 */
export function deltaOf(a, b) {
  const delta = a - b;
  const base = Math.max(Math.abs(a), Math.abs(b));
  const trend = base === 0 || Math.abs(delta) <= base * 0.005 ? 'flat' : delta > 0 ? 'up' : 'down';
  return { a, b, delta, pct: b !== 0 ? delta / Math.abs(b) : null, trend };
}

/**
 * Comparativa A/B de dos meses: totales, promedio diario y gasto por categoría.
 *
 * Si uno de los meses está en curso, `dayCutoff` compara ambos sobre el mismo
 * periodo (días 1..dayCutoff); `totalsB` permite pasar los totales de B ya recortados.
 */
export function compareMonths(totals, { monthA, monthB, todayIso, dayCutoff = null, totalsB = totals }) {
  const daysFor = month => (dayCutoff ? Math.min(dayCutoff, daysInMonth(month)) : undefined);
  const a = summarizeMonth(totals, monthA, { todayIso, days: daysFor(monthA) });
  const b = summarizeMonth(totalsB, monthB, { todayIso, days: daysFor(monthB) });
  const amountFor = (summary, category) => summary.byCategory.find(c => c.category === category)?.total || 0;
  const categories = new Set([...a.byCategory, ...b.byCategory].map(c => c.category));
  const rows = [...categories]
    .map(category => ({ category, ...deltaOf(amountFor(a, category), amountFor(b, category)) }))
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));

  return {
    a,
    b,
    rows,
    maxValue: rows.reduce((max, row) => Math.max(max, row.a, row.b), 0),
    spent: deltaOf(a.spent, b.spent),
    income: deltaOf(a.income, b.income),
    net: deltaOf(a.net, b.net),
    dailyAverage: deltaOf(a.dailyAverage, b.dailyAverage),
    samePeriod: Boolean(dayCutoff),
    headline: comparisonHeadline(rows, monthA, monthB, { samePeriod: Boolean(dayCutoff) }),
  };
}

/** La categoría con el mayor cambio absoluto, redactada en lenguaje natural. */
export function comparisonHeadline(rows, monthA, monthB, { samePeriod = false } = {}) {
  const changed = rows.filter(row => row.trend !== 'flat');
  if (changed.length === 0) {
    return null;
  }
  const top = changed.reduce((best, row) => (Math.abs(row.delta) > Math.abs(best.delta) ? row : best));
  const label = CATEGORIES[top.category]?.label || 'Otros';
  const [la, lb] = [monthLabel(monthA), monthLabel(monthB)];
  const reference = samePeriod ? `el mismo periodo de ${lb}` : lb;
  if (top.pct === null) {
    return { ...top, text: `Empezaste a gastar en ${label} en ${la}; en ${reference} no tenías gastos ahí.` };
  }
  const pct = Math.round(Math.abs(top.pct) * 100);
  const connector = samePeriod ? 'que en' : 'comparado con';
  return {
    ...top,
    text: `Gastaste ${pct}% ${top.delta > 0 ? 'más' : 'menos'} en ${label} en ${la} ${connector} ${reference}.`,
  };
}

/** Alertas predictivas del Copilot calculadas en el dispositivo. */
export function buildInsights(model, totals, { todayIso, budget, currency }) {
  const money = value => formatMoney(value, currency);
  const { projection } = model;
  const insights = [];

  if (model.pendingCount > 0) {
    insights.push({
      id: 'pending',
      tone: 'info',
      title: `${model.pendingCount} movimiento${model.pendingCount > 1 ? 's' : ''} por confirmar`,
      body: 'Detecté alertas bancarias nuevas. Revísalas en Movimientos.',
    });
  }

  if (budget > 0 && model.remaining < 0) {
    insights.push({
      id: 'over-budget',
      tone: 'warning',
      title: 'Presupuesto superado',
      body: `Te pasaste por ${money(-model.remaining)}. A este ritmo cerrarías el mes en ${money(projection.projected)}: frena los gastos variables.`,
    });
  } else if (budget > 0 && projection.overdraftDay) {
    insights.push({
      id: 'overdraft',
      tone: 'warning',
      title: 'Sobregiro proyectado',
      body:
        `A este ritmo agotas el presupuesto hacia el día ${projection.overdraftDay} ` +
        `y cierras en ${money(projection.projected)}. Límite diario sugerido: ${money(projection.dailyLimit)}.`,
    });
  } else if (budget > 0 && model.spent > 0) {
    insights.push({
      id: 'on-track',
      tone: 'positive',
      title: 'Vas dentro del presupuesto',
      body: `Proyección de cierre: ${money(projection.projected)}. Te quedan ${money(model.remaining)}.`,
    });
  }

  const spike = categorySpike(totals, model, todayIso);
  if (spike) {
    insights.push({
      id: `spike-${spike.category}`,
      tone: 'warning',
      title: `${CATEGORIES[spike.category]?.label || 'Una categoría'} viene al alza`,
      body: `Llevas ${money(spike.current)}, ${Math.round((spike.ratio - 1) * 100)}% más que tu promedio de los últimos meses.`,
    });
  }

  const subscriptions = model.byCategory.find(c => c.category === 'subscriptions');
  if (subscriptions && subscriptions.total > 0) {
    insights.push({
      id: 'subscriptions',
      tone: 'info',
      title: 'Suscripciones del mes',
      body: `${money(subscriptions.total)} en cobros recurrentes. ¿Todas siguen valiendo la pena?`,
    });
  }
  return insights;
}

function categorySpike(totals, model, todayIso) {
  const current = monthKeyOf(todayIso);
  const previous = [1, 2, 3].map(i => shiftMonth(current, -i));
  const history = {};
  for (const row of totals) {
    if (row.type === 'expense' && previous.includes(row.month)) {
      history[row.category] = (history[row.category] || 0) + row.total;
    }
  }
  let best = null;
  for (const { category, total, share } of model.byCategory) {
    const average = (history[category] || 0) / previous.length;
    if (average <= 0 || share < 0.1) {
      continue;
    }
    const ratio = total / average;
    if (ratio >= 1.3 && (!best || ratio > best.ratio)) {
      best = { category, current: total, ratio };
    }
  }
  return best;
}
