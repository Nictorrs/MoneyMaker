import fs from 'fs';
import path from 'path';

import {
  buildInsights,
  buildOverviewModel,
  compareMonths,
  deltaOf,
  EMPTY_OVERVIEW,
  monthBounds,
  monthlySeries,
  projectMonth,
  shiftMonth,
  summarizeMonth,
} from '../src/lib/analytics';
import {
  attemptsLeft,
  formatWait,
  lockMessage,
  lockMillisFor,
  validatePassword,
  validateUsername,
} from '../src/lib/auth';
import { buildDemoData } from '../src/lib/demoData';
import { formatAmountInput, formatCompact, formatDayLabel, formatMoney, parseAmountInput, textFieldError } from '../src/lib/format';
import { evaluateBadges, loggingStreak, newlyEarned, underBudgetStreak, unlocksById } from '../src/lib/gamification';
import { donutSegments, smoothPath } from '../src/lib/geometry';
import { answerCopilot, COPILOT_QUESTIONS } from '../src/lib/copilot';
import { buildPreferences, feedbackRecord, toDraft } from '../src/lib/personalization';
import { createMemoryStore } from '../src/services/storage';
import { CATEGORIES, EXPENSE_CATEGORY_IDS, fitCategory, INCOME_CATEGORY_IDS } from '../src/theme';

const TODAY = '2026-09-13';
const tx = (date, amount, extra = {}) => ({
  date, amount, type: 'expense', category: 'food', currency: 'COP', status: 'confirmed', source: 'manual', description: 'Gasto', ...extra,
});

const TOTALS = [
  { month: '2026-09', type: 'expense', category: 'food', total: 115000, count: 5 },
  { month: '2026-09', type: 'expense', category: 'transport', total: 40000, count: 2 },
  { month: '2026-09', type: 'expense', category: 'entertainment', total: 30000, count: 1 },
  { month: '2026-09', type: 'income', category: 'salary', total: 3000000, count: 1 },
  { month: '2026-08', type: 'expense', category: 'food', total: 100000, count: 4 },
  { month: '2026-08', type: 'expense', category: 'transport', total: 80000, count: 3 },
];

describe('format', () => {
  test('money uses es-CO separators', () => {
    expect(formatMoney(45000)).toBe('$45.000');
    expect(formatMoney(12.5, 'USD')).toBe('US$12,50');
    expect(formatMoney(-1500, 'COP')).toBe('−$1.500');
    expect(formatMoney(2000, 'COP', { sign: true })).toBe('+$2.000');
    expect(formatCompact(1250000)).toBe('$1,3M');
    expect(formatCompact(45000)).toBe('$45k');
  });

  test('amount input and day labels', () => {
    expect(parseAmountInput('45.000')).toBe(45000);
    expect(parseAmountInput('12,5')).toBe(12.5);
    expect(parseAmountInput('$1.250.000')).toBe(1250000);
    expect(formatAmountInput(5500000)).toBe('5.500.000');
    expect(formatAmountInput(1234.5)).toBe('1.234,5');
    [5500000, 1234.5, 25000, 0.75].forEach(n => expect(parseAmountInput(formatAmountInput(n))).toBe(n));
    expect(formatDayLabel(TODAY, TODAY)).toBe('Hoy');
    expect(formatDayLabel('2026-09-12', TODAY)).toBe('Ayer');
    expect(formatDayLabel('2026-09-01', TODAY)).toBe('1 sep');
    expect(formatDayLabel('2025-12-25', TODAY)).toBe('25 dic 2025');
  });

  test('free-text fields need real words', () => {
    ['Almuerzo', 'Uber al trabajo', '2 cafés', 'Pago cuota 3/12', 'Ñame'].forEach(t => expect(textFieldError(t)).toBeNull());
    expect(textFieldError('333333333333333333')).toMatch(/no solo números/);
    expect(textFieldError('12.500 $$')).toMatch(/no solo números/);
    expect(textFieldError('a1')).toMatch(/no solo números/);
    expect(textFieldError('aaaaaaaaaaaaaaaa')).toMatch(/repetido/);
    expect(textFieldError('aaaaaaaaaa', { label: 'El comercio', minLetters: 1 })).toMatch(/^El comercio .*repetido/);
    expect(textFieldError('D1', { label: 'El comercio', minLetters: 1 })).toBeNull();
  });
});

describe('analytics on aggregated totals', () => {
  test('month helpers', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-09', 4)).toBe('2027-01');
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  test('projection matches the backend rule engine', () => {
    const p = projectMonth({ spent: 1500000, budget: 2000000, todayIso: TODAY });
    expect(p.overdraftDay).toBe(18);
    expect(Math.round(p.projected)).toBe(3461538);
    expect(p.daysLeft).toBe(17);
  });

  test('month summary and series', () => {
    const sept = summarizeMonth(TOTALS, '2026-09', { todayIso: TODAY });
    expect(sept).toMatchObject({ spent: 185000, income: 3000000, count: 9, isCurrent: true });
    expect(sept.dailyAverage).toBeCloseTo(185000 / 13);
    expect(sept.byCategory[0]).toEqual({ category: 'food', total: 115000, share: 115000 / 185000 });
    expect(summarizeMonth(TOTALS, '2026-08', { todayIso: TODAY }).dailyAverage).toBeCloseTo(180000 / 31);
    expect(monthlySeries(TOTALS, { anchorMonth: '2026-09', months: 2 }).map(m => [m.label, m.expense])).toEqual([
      ['ago', 180000],
      ['sep', 185000],
    ]);
  });

  test('A/B comparison with trends and headline', () => {
    const comparison = compareMonths(TOTALS, { monthA: '2026-09', monthB: '2026-08', todayIso: TODAY });
    expect(comparison.rows.map(r => [r.category, r.trend])).toEqual([
      ['food', 'up'],
      ['transport', 'down'],
      ['entertainment', 'up'],
    ]);
    expect(comparison.rows[0].pct).toBeCloseTo(0.15);
    expect(comparison.rows[2].pct).toBeNull();
    expect(comparison.maxValue).toBe(115000);
    expect(comparison.spent).toMatchObject({ delta: 5000, trend: 'up' });
    expect(comparison.headline.text).toBe('Gastaste 50% menos en Transporte en septiembre 2026 comparado con agosto 2026.');

    const foodOnly = compareMonths(TOTALS.filter(r => r.category === 'food'), { monthA: '2026-09', monthB: '2026-08' });
    expect(foodOnly.headline.text).toBe('Gastaste 15% más en Comida en septiembre 2026 comparado con agosto 2026.');
    expect(deltaOf(100, 100).trend).toBe('flat');

    // Mes en curso: B llega ya recortado a los mismos días y el promedio usa esos días.
    const augustToDay13 = [{ month: '2026-08', type: 'expense', category: 'food', total: 50000, count: 2 }];
    const samePeriod = compareMonths(TOTALS.filter(r => r.category === 'food'), {
      monthA: '2026-09', monthB: '2026-08', todayIso: TODAY, dayCutoff: 13, totalsB: augustToDay13,
    });
    expect(samePeriod.samePeriod).toBe(true);
    expect(samePeriod.b.dailyAverage).toBeCloseTo(50000 / 13);
    expect(samePeriod.headline.text).toBe('Gastaste 130% más en Comida en septiembre 2026 que en el mismo periodo de agosto 2026.');
    expect(compareMonths([], { monthA: '2026-09', monthB: '2026-08' }).headline).toBeNull();
  });

  test('overview model, insights and fixed copilot answers', () => {
    const overview = { ...EMPTY_OVERVIEW, balance: 10, monthlyTotals: [{ month: '2026-09', type: 'expense', category: 'food', total: 1500000, count: 1 }] };
    const model = buildOverviewModel(overview, { todayIso: TODAY, budget: 2000000 });
    expect(model).toMatchObject({ spent: 1500000, remaining: 500000, progress: 0.75 });
    const options = { todayIso: TODAY, budget: 2000000, currency: 'COP' };
    expect(buildInsights(model, overview.monthlyTotals, options).map(i => i.id)).toContain('overdraft');
    const over = buildOverviewModel(overview, { todayIso: TODAY, budget: 1000000 });
    expect(buildInsights(over, overview.monthlyTotals, { ...options, budget: 1000000 }).map(i => i.id)).toContain('over-budget');

    for (const { id } of COPILOT_QUESTIONS) {
      expect(answerCopilot(id, model, options).length).toBeGreaterThan(20);
    }
    expect(answerCopilot('budget', model, options)).toContain('agotarías el presupuesto');
    expect(answerCopilot('budget', over, options)).toContain('Ya superaste tu presupuesto por $500.000');
    expect(answerCopilot('top', model, options)).toBe('Este mes tu gasto más alto es comida con $1.500.000 (100%).');
    const empty = buildOverviewModel(EMPTY_OVERVIEW, { todayIso: TODAY, budget: 0 });
    expect(answerCopilot('budget', empty, options)).toContain('Aún no tienes un presupuesto');
    expect(answerCopilot('save', empty, options)).toContain('Registra tus gastos');
  });
});

describe('memory store (same API as the native module)', () => {
  test('pages with a stable cursor and filters', async () => {
    const store = createMemoryStore();
    await store.bulkInsertTransactions(Array.from({ length: 7 }, (_, i) => tx(`2026-09-0${i + 1}`, 1000 * (i + 1))));
    await store.upsertTransaction(tx('2026-09-10', 99, { status: 'pending' }));

    const seen = [];
    let cursor = null;
    do {
      const page = await store.listTransactionsPage({ filter: 'all', cursor, limit: 3 });
      seen.push(...page.items.map(t => t.date));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(['2026-09-10', '2026-09-07', '2026-09-06', '2026-09-05', '2026-09-04', '2026-09-03', '2026-09-02', '2026-09-01']);
    expect((await store.listTransactionsPage({ filter: 'pending', limit: 10 })).items).toHaveLength(1);
    expect((await store.listTransactionsPage({ filter: 'expense', limit: 10 })).items).toHaveLength(7);

    const overview = await store.getOverview({ currency: 'COP', historyStart: '2026-06-01', monthEnd: '2026-09-30', recentLimit: 2 });
    expect(overview).toMatchObject({ balance: -28000, pendingCount: 1 });
    expect(overview.recent).toHaveLength(2);
    expect(overview.monthlyTotals).toEqual([{ month: '2026-09', type: 'expense', category: 'food', total: 28000, count: 7 }]);

    const stats = await store.getActivityStats({ currency: 'COP', sinceDate: '2026-09-01' });
    expect(stats.recordDates).toHaveLength(7);
    expect(stats.sourceCounts).toEqual({ manual: 7 });
    expect(stats.dateRange).toEqual({ first: '2026-09-01', last: '2026-09-07' });
  });

  test('receipt photos stay until their transaction is gone', async () => {
    const store = createMemoryStore();
    const saved = await store.upsertTransaction(tx(TODAY, 5000, { source: 'receipt' }));
    await store.saveReceipt(saved.id, 'file:///recibo.jpg');
    await store.saveReceipt('borrado', 'file:///viejo.jpg');
    expect(await store.getReceipt(saved.id)).toBe('file:///recibo.jpg');
    expect(await store.pruneReceipts()).toBe(1);
    expect(await store.getReceipt('borrado')).toBeNull();
    await store.wipeAll();
    expect(await store.getReceipt(saved.id)).toBeNull();
  });

  test('category feedback is stored, listed and marked as shared', async () => {
    const store = createMemoryStore();
    const id = await store.recordCategoryFeedback({ day: TODAY, capture: 'ai', model: 'claude', description: 'Apple', suggested_category: 'entertainment', final_category: 'shopping' });
    expect(await store.listCategoryFeedback({ onlyUnshared: true })).toHaveLength(1);
    expect(await store.markCategoryFeedbackShared([id])).toBe(1);
    expect(await store.listCategoryFeedback({ onlyUnshared: true })).toHaveLength(0);
  });

  test('a goal saves its history and its total is always the sum', async () => {
    const store = createMemoryStore();
    const id = await store.upsertGoal({ name: 'Moto', emoji: '🏍️', target: 9000000, saved: 1000000 });
    const goal = () => store.listGoals().then(goals => goals.find(g => g.id === id));
    // Dos aportes rápidos y, además, el total corregido a mano: la diferencia es un ajuste.
    await store.upsertGoal({ ...(await goal()), saved: 1200000 }, [250000, 100000]);
    const history = await store.listGoalContributions(id);
    expect(history.map(c => [c.kind, c.amount]).reverse()).toEqual([
      ['initial', 1000000], ['contribution', 250000], ['contribution', 100000], ['adjustment', -150000],
    ]);
    expect((await goal()).saved).toBe(1200000);
    // Editar sin cambiar el ahorro no añade registros; no se puede quedar en negativo.
    await store.upsertGoal({ ...(await goal()), name: 'Moto nueva' });
    expect(await store.listGoalContributions(id)).toHaveLength(4);
    await expect(store.upsertGoal({ ...(await goal()), saved: -1 })).rejects.toThrow('negativo');
    await store.deleteGoal(id);
    expect(await store.listGoalContributions(id)).toHaveLength(0);
  });

  test('badge unlocks keep their first date', async () => {
    const store = createMemoryStore();
    expect(await store.unlockBadges(['first-step', 'streak-7'])).toBe(2);
    const [first] = await store.listBadgeUnlocks();
    expect(await store.unlockBadges(['first-step'])).toBe(0);
    expect((await store.listBadgeUnlocks())[0]).toEqual(first);
    await store.wipeAll();
    expect(await store.listBadgeUnlocks()).toEqual([]);
  });
});

describe('gamification', () => {
  test('streaks', () => {
    expect(loggingStreak(['2026-09-13', '2026-09-12', '2026-09-11', '2026-09-09'], TODAY)).toBe(3);
    expect(loggingStreak(['2026-09-12', '2026-09-11'], TODAY)).toBe(2);
    const spend = [{ date: '2026-09-08', total: 500000 }, { date: '2026-09-10', total: 10000 }, { date: '2026-09-12', total: 20000 }];
    // presupuesto diario = 900.000 / 30 = 30.000: el 8 rompe la racha.
    expect(underBudgetStreak(spend, { todayIso: TODAY, budget: 900000, floorDate: '2026-09-01' })).toBe(4);
    expect(underBudgetStreak(spend, { todayIso: TODAY, budget: 900000, floorDate: '2026-09-11' })).toBe(2);
  });

  test('badges unlock from demo data', async () => {
    const store = createMemoryStore();
    const demo = buildDemoData(TODAY);
    await store.bulkInsertTransactions(demo.transactions);
    const stats = await store.getActivityStats({ currency: 'COP', sinceDate: '2026-05-01' });
    const goals = [...demo.goals, { name: 'Lista', target: 100, saved: 100 }];
    const { badges } = evaluateBadges(stats, goals, {
      todayIso: TODAY, budget: demo.budget, sinceDate: '2026-05-01', lastMonth: { income: 2, expense: 1 },
    });
    const unlocked = badges.filter(b => b.unlocked).map(b => b.id);
    expect(unlocked).toEqual(expect.arrayContaining(['first-step', 'goal-done', 'autopilot', 'green-month']));
  });

  test('a saved badge stays unlocked when its streak breaks', () => {
    const stats = { recordDates: [], dailyExpenses: [], sourceCounts: {}, dateRange: {} };
    const options = { todayIso: TODAY, budget: 0, sinceDate: '2026-05-01', lastMonth: null };
    const fresh = evaluateBadges(stats, [], options).badges.find(b => b.id === 'streak-7');
    expect(fresh).toMatchObject({ unlocked: false, unlockedAt: null, progress: 0 });
    const unlocks = unlocksById([{ badge_id: 'streak-7', unlocked_at: 1789000000000 }]);
    const kept = evaluateBadges(stats, [], { ...options, unlocks }).badges.find(b => b.id === 'streak-7');
    expect(kept).toMatchObject({ unlocked: true, unlockedAt: 1789000000000, progress: 0 });
  });

  test('only badges at 100% that are not saved yet are newly earned', () => {
    const badges = [
      { id: 'a', progress: 1, unlockedAt: null },
      { id: 'b', progress: 1, unlockedAt: 5 },
      { id: 'c', progress: 0.5, unlockedAt: null },
    ];
    expect(newlyEarned(badges)).toEqual(['a']);
  });
});

describe('el esquema SQLite (database/esquema.sql) coincide con la app', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'esquema.sql'), 'utf8');

  test('categories', () => {
    const rows = [...schema.matchAll(/\('([a-z]+)',\s+'([^']+)',\s+'(#[0-9A-F]{6})',\s+'([a-z]+)',\s+([01]),\s+([01]),\s+\d+\)/g)];
    expect(rows.map(r => r[1]).sort()).toEqual(Object.keys(CATEGORIES).sort());
    for (const [, id, label, color, icon, forExpense, forIncome] of rows) {
      expect({ label, color, icon }).toEqual(CATEGORIES[id]);
      expect(forExpense === '1').toBe(EXPENSE_CATEGORY_IDS.includes(id));
      expect(forIncome === '1').toBe(INCOME_CATEGORY_IDS.includes(id));
    }
  });

  test('badges', () => {
    const rows = [...schema.matchAll(/\('([a-z0-9-]+)',\s+'([^']+)',\s+'([^']+)',\s+'(bronze|silver|gold)',\s+\d+\)/g)];
    const stats = { recordDates: [], dailyExpenses: [], sourceCounts: {}, dateRange: {} };
    const badges = evaluateBadges(stats, [], { todayIso: TODAY, budget: 0, sinceDate: TODAY, lastMonth: null }).badges;
    expect(rows.map(([, id, title, description, tier]) => ({ id, title, description, tier }))).toEqual(
      badges.map(({ id, title, description, tier }) => ({ id, title, description, tier })),
    );
  });
});

describe('personalization (feedback loop)', () => {
  const preferences = buildPreferences([
    { merchant: 'Apple', description: 'Compra en Apple', final_category: 'shopping', created_at: 2 },
    { merchant: 'Apple', description: 'Compra en Apple', final_category: 'entertainment', created_at: 1 },
    { merchant: null, description: 'Ara', final_category: 'groceries', created_at: 3 },
  ]);

  test('the most recent correction wins', () => {
    expect(preferences.get('apple').category).toBe('shopping');
    expect(preferences.get('ara').category).toBe('groceries');
  });

  test('learned preferences adjust suggestions without false positives', () => {
    const draft = toDraft({ type: 'expense', category: 'entertainment', merchant: 'APPLE', description: 'Compra', confidence: 0.6 }, preferences, 'claude');
    expect(draft).toMatchObject({ category: 'shopping', suggestedCategory: 'shopping', aiCategory: 'entertainment', suggestionSource: 'learned' });
    expect(toDraft({ type: 'expense', category: 'transport', description: 'Taxi para el aeropuerto' }, preferences, 'rules').suggestionSource).toBe('rules');
    expect(toDraft({ type: 'income', category: 'salary', merchant: 'Apple', description: 'Pago' }, preferences, 'claude').category).toBe('salary');
  });

  test('only a changed category produces a labeled correction', () => {
    const draft = toDraft({ type: 'expense', category: 'entertainment', merchant: 'Apple', description: 'Compra en Apple', confidence: 0.6 }, new Map(), 'claude');
    expect(feedbackRecord(draft, { ...draft, id: 'tx1' }, { capture: 'ai', todayIso: TODAY })).toBeNull();
    const record = feedbackRecord(draft, { ...draft, id: 'tx1', category: 'shopping' }, { capture: 'ai', todayIso: TODAY });
    expect(record).toMatchObject({ suggested_category: 'entertainment', final_category: 'shopping', model: 'claude', capture: 'ai', transaction_id: 'tx1', confidence: 0.6, day: TODAY });
  });

  test('a category that does not fit the type is suggested as Otros', () => {
    const draft = toDraft({ type: 'income', category: 'food', description: 'Me pagaron el almuerzo' }, new Map(), 'claude');
    expect(draft).toMatchObject({ category: 'other', suggestedCategory: 'other', aiCategory: 'food' });
    // Aceptar la sugerencia no genera una corrección falsa.
    expect(feedbackRecord(draft, { ...draft, id: 'tx2' }, { capture: 'ai', todayIso: TODAY })).toBeNull();
  });
});

describe('categorías válidas para cada tipo (la base rechaza las demás)', () => {
  test('fitCategory keeps valid categories and replaces the rest', () => {
    expect(fitCategory('expense', 'food')).toBe('food');
    expect(fitCategory('income', 'transfer')).toBe('transfer');
    // Cambiar de ingreso a gasto ya no conserva Salario.
    expect(fitCategory('expense', 'salary')).toBe('food');
    expect(fitCategory('income', 'food')).toBe('salary');
    expect(fitCategory('income', 'food', 'other')).toBe('other');
  });

  test('every category fits at least one type', () => {
    for (const id of Object.keys(CATEGORIES)) {
      expect(EXPENSE_CATEGORY_IDS.includes(id) || INCOME_CATEGORY_IDS.includes(id)).toBe(true);
    }
  });

  test('demo data only uses categories that fit their type', () => {
    const demo = buildDemoData(TODAY);
    expect(demo.transactions.filter(t => fitCategory(t.type, t.category, null) !== t.category)).toEqual([]);
  });
});

describe('acceso con usuario y contraseña', () => {
  test('validates the username and the password', () => {
    expect(validateUsername('nicolas')).toBeNull();
    expect(validateUsername('ni')).toMatch(/al menos 3/);
    expect(validateUsername('nico las')).toMatch(/espacios/);
    expect(validatePassword('caballo-9x', { username: 'nicolas' })).toBeNull();
    expect(validatePassword('corta', { username: 'nicolas' })).toMatch(/al menos 8/);
    expect(validatePassword('Nicolas', { username: 'nicolas' })).toMatch(/al menos 8/);
    expect(validatePassword('nicolas1', { username: ' Nicolas1 ' })).toMatch(/igual al usuario/);
    expect(validatePassword('12345678')).toMatch(/más usadas/);
  });

  test('the wait after failed attempts doubles up to 15 minutes', () => {
    expect(lockMillisFor(4)).toBe(0);
    expect(lockMillisFor(5)).toBe(30_000);
    expect(lockMillisFor(6)).toBe(60_000);
    expect(lockMillisFor(12)).toBe(900_000);
    expect(attemptsLeft(3)).toBe(2);
    expect(formatWait(29_000)).toBe('29 s');
    expect(formatWait(90_000)).toBe('2 min');
    expect(lockMessage(1_000, 5_000)).toBeNull();
    expect(lockMessage(35_000, 5_000)).toMatch(/30 s/);
  });

  test('a wrong password locks the app and the right one opens it', async () => {
    const store = createMemoryStore();
    expect(await store.getAuthState()).toMatchObject({ configured: false, username: null });

    await store.setCredentials({ username: ' Nicolas ', password: 'caballo-bateria-9' });
    expect(await store.getAuthState()).toMatchObject({ configured: true, username: 'Nicolas' });

    expect(await store.verifyPassword({ username: 'NICOLAS', password: 'caballo-bateria-9' })).toMatchObject({ ok: true });
    expect(await store.verifyPassword({ username: 'nicolas', password: 'otra' })).toMatchObject({ ok: false, reason: 'invalid', failedAttempts: 1 });
    expect(await store.verifyPassword({ username: 'otro', password: 'caballo-bateria-9' })).toMatchObject({ ok: false, reason: 'invalid' });

    for (let i = 0; i < 3; i++) {
      await store.verifyPassword({ username: 'nicolas', password: 'otra' });
    }
    const locked = await store.verifyPassword({ username: 'nicolas', password: 'caballo-bateria-9' });
    expect(locked).toMatchObject({ ok: false, reason: 'locked' });
    expect(lockMessage(locked.lockedUntil)).toMatch(/Demasiados intentos/);
  });

  test('changing or removing the password needs the current one', async () => {
    const store = createMemoryStore();
    await store.setCredentials({ username: 'nicolas', password: 'caballo-bateria-9' });
    await expect(store.setCredentials({ password: 'nueva-contrasena', currentPassword: 'mala' })).rejects.toThrow(/actual/);

    await store.setCredentials({ password: 'nueva-contrasena', currentPassword: 'caballo-bateria-9' });
    expect(await store.verifyPassword({ username: 'nicolas', password: 'nueva-contrasena' })).toMatchObject({ ok: true });

    await expect(store.clearCredentials({ password: 'mala' })).rejects.toThrow();
    expect(await store.clearCredentials({ password: 'nueva-contrasena' })).toMatchObject({ configured: false });
    expect(await store.verifyPassword({ username: 'nicolas', password: 'nueva-contrasena' })).toMatchObject({ reason: 'not-configured' });
  });

  test('wiping everything also removes the access', async () => {
    const store = createMemoryStore();
    await store.setCredentials({ username: 'nicolas', password: 'caballo-bateria-9' });
    await store.wipeAll();
    expect(await store.getAuthState()).toMatchObject({ configured: false });
  });
});

describe('geometry', () => {
  test('donut segments cover the circle minus gaps', () => {
    const segments = donutSegments([1, 1, 2], 3);
    const sweep = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
    expect(sweep).toBeCloseTo(351);
    expect(segments[2].share).toBe(0.5);
  });

  test('smooth path passes through every point', () => {
    const d = smoothPath([{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 5 }]);
    expect(d.startsWith('M0,10')).toBe(true);
    expect(d.endsWith('20,5')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
  });
});
