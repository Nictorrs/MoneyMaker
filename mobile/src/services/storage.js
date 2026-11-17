import { NativeModules } from 'react-native';

import { lockMillisFor } from '../lib/auth';

/**
 * Acceso a la base local. En Android usa el módulo nativo (SQLite en Java), que
 * resuelve agregados y páginas en SQL; donde no existe (iOS por ahora, tests)
 * un almacén en memoria implementa la misma API.
 *
 * Las pantallas nunca cargan la tabla completa: piden el resumen, una página o
 * los totales por mes que necesitan.
 */
const Native = NativeModules.MoneyMaker;

export const hasNativeStore = Boolean(Native);

const TX_FIELDS = [
  'id', 'type', 'amount', 'currency', 'date', 'merchant', 'description', 'category', 'source', 'status',
];
const GOAL_FIELDS = ['id', 'name', 'emoji', 'target', 'saved', 'deadline'];
const FEEDBACK_FIELDS = [
  'day', 'transaction_id', 'capture', 'model', 'merchant', 'description', 'suggested_category', 'final_category', 'confidence',
];

const pick = (object, fields) =>
  Object.fromEntries(fields.filter(f => object[f] !== undefined).map(f => [f, object[f]]));

/** Orden total y estable: fecha, creación, id (del más nuevo al más antiguo). */
export function byNewest(a, b) {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1;
  }
  if ((a.created_at || 0) !== (b.created_at || 0)) {
    return (b.created_at || 0) - (a.created_at || 0);
  }
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}

const matchesFilter = filter => tx =>
  filter === 'pending'
    ? tx.status === 'pending'
    : filter === 'expense' || filter === 'income'
      ? tx.status !== 'pending' && tx.type === filter
      : true;

const round2 = value => Math.round(value * 100) / 100;

export function createMemoryStore() {
  const state = { transactions: [], goals: [], contributions: [], badgeUnlocks: [], settings: {}, feedback: [], auth: null, receipts: {} };
  const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  // Como los triggers de la base: el ahorro de una meta es la suma de su historial.
  const addContribution = (goal, kind, amount, createdAt) => {
    if (goal.saved + amount < 0) {
      throw new Error('Una meta no puede quedar con ahorro negativo');
    }
    state.contributions.push({ id: newId(), goal_id: goal.id, kind, amount, created_at: createdAt });
    goal.saved = round2(goal.saved + amount);
  };
  const confirmed = currency => state.transactions.filter(tx => tx.status !== 'pending' && tx.currency === currency);
  const copy = rows => rows.map(row => ({ ...row }));

  const monthlyTotals = (currency, fromDate, toDate) => {
    const groups = new Map();
    for (const tx of confirmed(currency)) {
      if (tx.date < fromDate || tx.date > toDate) {
        continue;
      }
      const key = `${tx.date.slice(0, 7)}|${tx.type}|${tx.category}`;
      const group = groups.get(key) || { month: tx.date.slice(0, 7), type: tx.type, category: tx.category, total: 0, count: 0 };
      group.total += tx.amount;
      group.count += 1;
      groups.set(key, group);
    }
    return [...groups.values()];
  };

  const page = (filter, cursor, limit) => {
    const sorted = state.transactions.filter(matchesFilter(filter)).sort(byNewest);
    const start = cursor ? sorted.findIndex(tx => byNewest(tx, cursor) > 0) : 0;
    return start < 0 ? [] : copy(sorted.slice(start, start + limit));
  };

  const authState = () => ({
    configured: Boolean(state.auth),
    username: state.auth?.username ?? null,
    failedAttempts: state.auth?.failedAttempts ?? 0,
    lockedUntil: state.auth?.lockedUntil ?? 0,
    updatedAt: state.auth?.updatedAt ?? 0,
  });

  const dateRange = () => {
    const dates = state.transactions.filter(tx => tx.status !== 'pending').map(tx => tx.date).sort();
    return { first: dates[0] ?? null, last: dates[dates.length - 1] ?? null };
  };

  return {
    async listTransactionsPage({ filter = 'all', cursor = null, limit = 40 }) {
      const items = page(filter, cursor, limit);
      const last = items[items.length - 1];
      return {
        items,
        nextCursor: items.length === limit ? { date: last.date, created_at: last.created_at, id: last.id } : null,
      };
    },
    async getOverview({ currency, historyStart, monthEnd, recentLimit = 4, pendingLimit = 20, recordsSince = null }) {
      const recordDates = recordsSince
        ? [...new Set(state.transactions.filter(tx => tx.status !== 'pending' && tx.date >= recordsSince).map(tx => tx.date))]
            .sort()
            .reverse()
        : [];
      return {
        recordDates,
        balance: confirmed(currency).reduce((sum, tx) => sum + (tx.type === 'income' ? tx.amount : -tx.amount), 0),
        monthlyTotals: monthlyTotals(currency, historyStart, monthEnd),
        recent: page('all', null, recentLimit),
        pending: page('pending', null, pendingLimit),
        pendingCount: state.transactions.filter(tx => tx.status === 'pending').length,
      };
    },
    async getMonthlyTotals({ currency, fromDate, toDate }) {
      return monthlyTotals(currency, fromDate, toDate);
    },
    async getMerchantTotals({ currency, month, limit = 5 }) {
      const totals = {};
      for (const tx of confirmed(currency)) {
        if (tx.type === 'expense' && tx.merchant && tx.date.startsWith(month)) {
          totals[tx.merchant] = (totals[tx.merchant] || 0) + tx.amount;
        }
      }
      return Object.entries(totals)
        .map(([merchant, total]) => ({ merchant, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);
    },
    async getActivityStats({ currency, sinceDate }) {
      const dailyExpenses = {};
      const recordDates = new Set();
      const sourceCounts = {};
      for (const tx of state.transactions) {
        if (tx.status === 'pending') {
          continue;
        }
        sourceCounts[tx.source] = (sourceCounts[tx.source] || 0) + 1;
        if (tx.date >= sinceDate) {
          recordDates.add(tx.date);
          if (tx.type === 'expense' && tx.currency === currency) {
            dailyExpenses[tx.date] = (dailyExpenses[tx.date] || 0) + tx.amount;
          }
        }
      }
      return {
        dailyExpenses: Object.entries(dailyExpenses).map(([date, total]) => ({ date, total })),
        recordDates: [...recordDates].sort().reverse(),
        sourceCounts,
        dateRange: dateRange(),
      };
    },
    async getDateRange() {
      return dateRange();
    },
    // Fotos de recibo como evidencia: una por movimiento, guardadas aparte de la base.
    async saveReceipt(transactionId, uri) {
      state.receipts[transactionId] = uri;
      return uri;
    },
    async getReceipt(transactionId) {
      return state.receipts[transactionId] || null;
    },
    async deleteReceipt(transactionId) {
      return delete state.receipts[transactionId];
    },
    async pruneReceipts() {
      const ids = new Set(state.transactions.map(tx => tx.id));
      const orphans = Object.keys(state.receipts).filter(id => !ids.has(id));
      orphans.forEach(id => delete state.receipts[id]);
      return orphans.length;
    },
    async upsertTransaction(input) {
      const now = Date.now();
      const tx = pick(input, TX_FIELDS);
      const index = state.transactions.findIndex(t => t.id === tx.id);
      if (index >= 0) {
        state.transactions[index] = { ...state.transactions[index], ...tx, updated_at: now };
        return { ...state.transactions[index] };
      }
      const saved = { status: 'confirmed', ...tx, id: tx.id || newId(), created_at: now, updated_at: now };
      state.transactions.push(saved);
      return { ...saved };
    },
    async bulkInsertTransactions(list) {
      const now = Date.now();
      list.forEach((input, i) => {
        state.transactions.push({ status: 'confirmed', ...pick(input, TX_FIELDS), id: input.id || newId(), created_at: now - i, updated_at: now });
      });
      return list.length;
    },
    async deleteTransaction(id) {
      const before = state.transactions.length;
      state.transactions = state.transactions.filter(tx => tx.id !== id);
      return state.transactions.length < before;
    },
    async listGoals() {
      return copy(state.goals);
    },
    /** Igual que FinanceDatabase.upsertGoal: aportes rápidos y, si el total cambió, un ajuste. */
    async upsertGoal(input, contributions = []) {
      const { saved, ...fields } = pick(input, GOAL_FIELDS);
      const now = Date.now();
      let goal = fields.id ? state.goals.find(g => g.id === fields.id) : null;
      if (fields.id && !goal) {
        throw new Error('La meta no existe');
      }
      const created = !goal;
      if (created) {
        goal = { ...fields, id: newId(), saved: 0, created_at: now };
        state.goals.push(goal);
      } else {
        Object.assign(goal, fields);
      }
      let order = 0;
      for (const amount of contributions) {
        if (amount > 0) {
          addContribution(goal, 'contribution', amount, now + order++);
        }
      }
      if (saved != null) {
        const delta = round2(saved - goal.saved);
        if (Math.abs(delta) >= 0.005) {
          addContribution(goal, created ? 'initial' : 'adjustment', delta, now + order);
        }
      }
      return goal.id;
    },
    async deleteGoal(id) {
      state.goals = state.goals.filter(g => g.id !== id);
      state.contributions = state.contributions.filter(c => c.goal_id !== id);
      return true;
    },
    async listGoalContributions(goalId, { limit = 50 } = {}) {
      return copy(
        state.contributions
          .filter(c => c.goal_id === goalId)
          .reverse() // a igual fecha, el último registrado primero
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, limit),
      );
    },
    async listBadgeUnlocks() {
      return copy(state.badgeUnlocks);
    },
    async unlockBadges(ids) {
      const now = Date.now();
      let added = 0;
      for (const id of ids) {
        if (!state.badgeUnlocks.some(u => u.badge_id === id)) {
          state.badgeUnlocks.push({ badge_id: id, unlocked_at: now });
          added += 1;
        }
      }
      return added;
    },
    async getSetting(key) {
      return state.settings[key] ?? null;
    },
    async setSetting(key, value) {
      state.settings[key] = value;
    },
    async recordCategoryFeedback(record) {
      const id = newId();
      state.feedback.push({ ...pick(record, FEEDBACK_FIELDS), id, created_at: Date.now(), shared: 0 });
      return id;
    },
    async listCategoryFeedback({ limit = 200, onlyUnshared = false } = {}) {
      return copy(
        state.feedback
          .filter(row => !onlyUnshared || !row.shared)
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, limit),
      );
    },
    async markCategoryFeedbackShared(ids) {
      let updated = 0;
      for (const row of state.feedback) {
        if (ids.includes(row.id)) {
          row.shared = 1;
          updated += 1;
        }
      }
      return updated;
    },
    // Acceso: en el teléfono lo resuelve Java derivando la contraseña con PBKDF2.
    // Este almacén vive solo en memoria (pruebas y iOS), así que no persiste nada.
    async getAuthState() {
      return authState();
    },
    async setCredentials({ username, password, currentPassword }) {
      if (state.auth && state.auth.password !== currentPassword) {
        throw new Error('La contraseña actual no coincide');
      }
      const name = (username ?? state.auth?.username ?? '').trim();
      if (name.length < 3 || !password || password.length < 8) {
        throw new Error('Usuario o contraseña demasiado cortos');
      }
      state.auth = { username: name, password, failedAttempts: 0, lockedUntil: 0, updatedAt: Date.now() };
      return authState();
    },
    async verifyPassword({ username, password }) {
      const auth = state.auth;
      if (!auth) {
        return { ok: false, reason: 'not-configured' };
      }
      const now = Date.now();
      if (auth.lockedUntil > now) {
        return { ok: false, reason: 'locked', lockedUntil: auth.lockedUntil, failedAttempts: auth.failedAttempts };
      }
      if (auth.username.toLowerCase() === (username || '').trim().toLowerCase() && auth.password === password) {
        auth.failedAttempts = 0;
        auth.lockedUntil = 0;
        return { ok: true, username: auth.username };
      }
      auth.failedAttempts += 1;
      const wait = lockMillisFor(auth.failedAttempts);
      auth.lockedUntil = wait > 0 ? now + wait : 0;
      return {
        ok: false,
        reason: wait > 0 ? 'locked' : 'invalid',
        lockedUntil: auth.lockedUntil,
        failedAttempts: auth.failedAttempts,
      };
    },
    async clearCredentials({ password } = {}) {
      if (state.auth && state.auth.password !== password) {
        throw new Error('La contraseña no coincide');
      }
      state.auth = null;
      return authState();
    },
    async wipeAll() {
      state.transactions = [];
      state.goals = [];
      state.contributions = [];
      state.badgeUnlocks = [];
      state.settings = {};
      state.feedback = [];
      state.auth = null;
      state.receipts = {};
    },
  };
}

const nativeStore = Native && {
  listTransactionsPage: ({ filter = 'all', cursor = null, limit = 40 }) =>
    Native.listTransactionsPage({ filter, cursor, limit }),
  getOverview: options => Native.getOverview({ recentLimit: 4, pendingLimit: 20, ...options }),
  getMonthlyTotals: options => Native.getMonthlyTotals(options),
  getMerchantTotals: ({ currency, month, limit = 5 }) => Native.getMerchantTotals({ currency, month, limit }),
  getActivityStats: options => Native.getActivityStats(options),
  getDateRange: () => Native.getDateRange(),
  saveReceipt: (transactionId, uri) => Native.saveReceipt(transactionId, uri),
  getReceipt: transactionId => Native.getReceipt(transactionId),
  deleteReceipt: transactionId => Native.deleteReceipt(transactionId),
  pruneReceipts: () => Native.pruneReceipts(),
  upsertTransaction: tx => Native.upsertTransaction(pick(tx, TX_FIELDS)),
  bulkInsertTransactions: list => Native.bulkInsertTransactions(list.map(tx => pick(tx, TX_FIELDS))),
  deleteTransaction: id => Native.deleteTransaction(id),
  listGoals: () => Native.listGoals(),
  upsertGoal: (goal, contributions = []) => Native.upsertGoal(pick(goal, GOAL_FIELDS), contributions),
  deleteGoal: id => Native.deleteGoal(id),
  listGoalContributions: (goalId, { limit = 50 } = {}) => Native.listGoalContributions(goalId, limit),
  listBadgeUnlocks: () => Native.listBadgeUnlocks(),
  unlockBadges: ids => Native.unlockBadges(ids),
  getSetting: key => Native.getSetting(key),
  setSetting: (key, value) => Native.setSetting(key, value == null ? null : String(value)),
  recordCategoryFeedback: record => Native.recordCategoryFeedback(pick(record, FEEDBACK_FIELDS)),
  listCategoryFeedback: ({ limit = 200, onlyUnshared = false } = {}) => Native.listCategoryFeedback({ limit, onlyUnshared }),
  markCategoryFeedbackShared: ids => Native.markCategoryFeedbackShared(ids),
  getAuthState: () => Native.getAuthState(),
  setCredentials: ({ username, password, currentPassword = null }) =>
    Native.setCredentials({ username: username ?? null, password, currentPassword }),
  verifyPassword: ({ username, password }) => Native.verifyPassword({ username, password }),
  clearCredentials: ({ password } = {}) => Native.clearCredentials({ password: password ?? null }),
  wipeAll: () => Native.wipeAllData(),
};

export const store = nativeStore || createMemoryStore();
