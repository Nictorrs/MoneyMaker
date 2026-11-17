import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

import { DEFAULT_CURRENCY, DEV_ALLOW_SCREENSHOTS } from '../config';
import { buildInsights, buildOverviewModel, EMPTY_OVERVIEW, monthBounds, monthKeyOf, shiftMonth } from '../lib/analytics';
import { buildDemoData } from '../lib/demoData';
import { addDays, toISODate } from '../lib/format';
import { ACTIVITY_WINDOW_DAYS, evaluateBadges, lastMonthTotals, newlyEarned, unlocksById } from '../lib/gamification';
import { buildPreferences, feedbackRecord } from '../lib/personalization';
import { onTransactionDetected, setSecureScreen } from '../services/device';
import { store } from '../services/storage';

/**
 * Estado global con carga perezosa:
 *  - Al abrir la app solo se pide un snapshot (balance, totales del mes, recientes y pendientes).
 *  - Cada pestaña pide sus datos al montarse mediante consultas agregadas y cacheadas.
 *  - La caché se invalida únicamente cuando algo escribe en la base (dataVersion).
 */
const FinanceContext = createContext(null);
const EffectsContext = createContext(false);

const SETTING_KEYS = ['currency', 'budget', 'onboarded', 'secureScreen', 'reduceEffects'];
const DEFAULT_SETTINGS = {
  currency: DEFAULT_CURRENCY,
  budget: 0,
  onboarded: false,
  secureScreen: false,
  reduceEffects: false,
};
const STREAK_WINDOW_DAYS = 60;
const RESUME_REFRESH_MS = 30000;

async function loadSettings() {
  const [currency, budget, onboarded, secureScreen, reduceEffects] = await Promise.all(
    SETTING_KEYS.map(key => store.getSetting(key)),
  );
  return {
    currency: currency || DEFAULT_SETTINGS.currency,
    budget: Number(budget) || 0,
    onboarded: onboarded === 'true',
    secureScreen: secureScreen === 'true',
    reduceEffects: reduceEffects === 'true',
  };
}

/** Estadísticas de rachas e insignias; Metas y la revisión de insignias comparten la caché. */
function activityQuery(currency, todayIso) {
  const sinceDate = addDays(todayIso, -ACTIVITY_WINDOW_DAYS);
  return {
    key: `activity|${currency}|${sinceDate}`,
    sinceDate,
    load: () => store.getActivityStats({ currency, sinceDate }),
  };
}

function overviewQuery(currency, todayIso) {
  const month = monthKeyOf(todayIso);
  return {
    currency,
    historyStart: monthBounds(shiftMonth(month, -3)).start,
    monthEnd: monthBounds(month).end,
    recentLimit: 4,
    pendingLimit: 20,
    recordsSince: addDays(todayIso, -STREAK_WINDOW_DAYS),
  };
}

export function FinanceProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [todayIso, setTodayIso] = useState(() => toISODate());
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [goals, setGoals] = useState([]);
  const [badgeUnlocks, setBadgeUnlocks] = useState(() => new Map());
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [preferences, setPreferences] = useState(() => new Map());
  const [dataVersion, setDataVersion] = useState(0);
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);

  const cache = useRef(new Map());
  const latest = useRef({ settings, todayIso });
  latest.current = { settings, todayIso };

  /** Recalcula el snapshot y descarta las consultas cacheadas de las pestañas. */
  const invalidate = useCallback(async (currency = latest.current.settings.currency) => {
    cache.current.clear();
    const today = toISODate();
    const next = await store.getOverview(overviewQuery(currency, today));
    setOverview(next);
    setTodayIso(today);
    setDataVersion(version => version + 1);
  }, []);

  const reload = useCallback(async () => {
    const [saved, savedGoals, feedback, unlocks] = await Promise.all([
      loadSettings(),
      store.listGoals(),
      store.listCategoryFeedback({ limit: 200 }),
      store.listBadgeUnlocks(),
    ]);
    setSettings(saved);
    setGoals(savedGoals);
    setPreferences(buildPreferences(feedback));
    setBadgeUnlocks(unlocksById(unlocks));
    await invalidate(saved.currency);
    setReady(true);
    // Fotos de recibo de movimientos borrados (se conservan para poder deshacer el borrado).
    store.pruneReceipts().catch(() => {});
  }, [invalidate]);

  useEffect(() => {
    reload();
    let backgroundedAt = 0;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') {
        backgroundedAt = Date.now();
      } else if (state === 'active' && backgroundedAt && Date.now() - backgroundedAt > RESUME_REFRESH_MS) {
        // Movimientos detectados con la app en segundo plano o cambio de día.
        invalidate();
      }
    });
    return () => sub.remove();
  }, [reload, invalidate]);

  useEffect(() => onTransactionDetected(() => invalidate()), [invalidate]);

  useEffect(() => setSecureScreen(settings.secureScreen && !DEV_ALLOW_SCREENSHOTS), [settings.secureScreen]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setSystemReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setSystemReduceMotion);
    return () => sub?.remove();
  }, []);

  const fetchCached = useCallback((key, loader) => {
    const hit = cache.current.get(key);
    if (hit) {
      return hit;
    }
    const promise = loader().catch(error => {
      cache.current.delete(key);
      throw error;
    });
    cache.current.set(key, promise);
    return promise;
  }, []);

  const saveTransaction = useCallback(
    async tx => {
      const saved = await store.upsertTransaction({ status: 'confirmed', ...tx });
      await invalidate();
      return saved;
    },
    [invalidate],
  );

  const deleteTransaction = useCallback(
    async id => {
      await store.deleteTransaction(id);
      await invalidate();
    },
    [invalidate],
  );

  /**
   * Guarda borradores confirmados por el usuario. Si cambió la categoría sugerida,
   * la corrección queda etiquetada y ajusta de inmediato las próximas sugerencias.
   */
  const confirmDrafts = useCallback(
    async (entries, capture) => {
      let corrections = 0;
      const saved = [];
      for (const { draft, finalTx } of entries) {
        const tx = await store.upsertTransaction({ ...finalTx, status: 'confirmed' });
        saved.push(tx);
        const record = feedbackRecord(draft, tx, { capture, todayIso: latest.current.todayIso });
        if (record) {
          await store.recordCategoryFeedback(record);
          corrections += 1;
        }
      }
      if (corrections > 0) {
        setPreferences(buildPreferences(await store.listCategoryFeedback({ limit: 200 })));
      }
      await invalidate();
      return { saved, corrections };
    },
    [invalidate],
  );

  /** `contributions`: aportes rápidos de esta edición; si `goal.saved` cambió aparte, queda como ajuste. */
  const saveGoal = useCallback(
    async (goal, contributions = []) => {
      await store.upsertGoal(goal, contributions);
      setGoals(await store.listGoals());
      await invalidate(); // el historial de la meta cambió
    },
    [invalidate],
  );

  const deleteGoal = useCallback(async id => {
    setGoals(prev => prev.filter(g => g.id !== id));
    await store.deleteGoal(id);
  }, []);

  const updateSettings = useCallback(
    async patch => {
      await Promise.all(Object.entries(patch).map(([key, value]) => store.setSetting(key, String(value))));
      setSettings(prev => ({ ...prev, ...patch }));
      if ('currency' in patch) {
        await invalidate(patch.currency);
      }
    },
    [invalidate],
  );

  const loadDemoData = useCallback(async () => {
    const demo = buildDemoData(toISODate(), latest.current.settings.currency);
    await store.bulkInsertTransactions(demo.transactions);
    for (const goal of demo.goals) {
      await store.upsertGoal(goal);
    }
    await store.setSetting('budget', String(demo.budget));
    await reload();
  }, [reload]);

  const wipeAllData = useCallback(async () => {
    await store.wipeAll();
    await reload();
  }, [reload]);

  const model = useMemo(
    () => buildOverviewModel(overview, { todayIso, budget: settings.budget }),
    [overview, todayIso, settings.budget],
  );
  const insights = useMemo(
    () => buildInsights(model, overview.monthlyTotals, { todayIso, budget: settings.budget, currency: settings.currency }),
    [model, overview.monthlyTotals, todayIso, settings.budget, settings.currency],
  );

  // Las insignias se revisan después de cada cambio de datos, no solo al abrir Metas: una
  // racha puede cumplirse y romperse sin pasar por esa pestaña. Las ganadas se guardan y
  // ya no se pierden.
  const unlocksRef = useRef(badgeUnlocks);
  unlocksRef.current = badgeUnlocks;
  useEffect(() => {
    if (!ready) {
      return undefined;
    }
    let active = true;
    const query = activityQuery(settings.currency, todayIso);
    fetchCached(query.key, query.load)
      .then(async stats => {
        const { badges } = evaluateBadges(stats, goals, {
          todayIso,
          budget: settings.budget,
          sinceDate: query.sinceDate,
          lastMonth: lastMonthTotals(overview.monthlyTotals, todayIso),
          unlocks: unlocksRef.current,
        });
        const earned = newlyEarned(badges);
        if (earned.length > 0) {
          await store.unlockBadges(earned);
          const rows = await store.listBadgeUnlocks();
          if (active) {
            setBadgeUnlocks(unlocksById(rows));
          }
        }
      })
      .catch(() => {}); // se reintenta con el próximo cambio de datos
    return () => {
      active = false;
    };
  }, [ready, dataVersion, goals, todayIso, settings.currency, settings.budget, overview.monthlyTotals, fetchCached]);

  const value = useMemo(
    () => ({
      ready,
      todayIso,
      settings,
      goals,
      badgeUnlocks,
      overview,
      model,
      insights,
      preferences,
      dataVersion,
      fetchCached,
      reload,
      saveTransaction,
      deleteTransaction,
      confirmDrafts,
      saveGoal,
      deleteGoal,
      updateSettings,
      loadDemoData,
      wipeAllData,
    }),
    [
      ready, todayIso, settings, goals, badgeUnlocks, overview, model, insights, preferences, dataVersion, fetchCached, reload,
      saveTransaction, deleteTransaction, confirmDrafts, saveGoal, deleteGoal, updateSettings, loadDemoData, wipeAllData,
    ],
  );

  return (
    <EffectsContext.Provider value={settings.reduceEffects || systemReduceMotion}>
      <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
    </EffectsContext.Provider>
  );
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance debe usarse dentro de FinanceProvider');
  }
  return context;
}

/** true cuando el usuario (o el sistema) pide menos efectos: sin blur ni animaciones de fondo. */
export const useReducedEffects = () => useContext(EffectsContext);

/** Consulta perezosa y cacheada: corre al montar la pantalla y cuando cambian los datos. */
export function useFinanceQuery(key, loader) {
  const { fetchCached, dataVersion } = useFinance();
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let active = true;
    setState(prev => ({ ...prev, loading: true, error: null }));
    fetchCached(key, () => loaderRef.current()).then(
      data => active && setState({ data, loading: false, error: null }),
      error => active && setState(prev => ({ ...prev, loading: false, error })),
    );
    return () => {
      active = false;
    };
  }, [key, dataVersion, fetchCached]);

  return state;
}

/** Rachas e insignias de los últimos ACTIVITY_WINDOW_DAYS días (misma caché que la revisión de insignias). */
export function useActivityStats() {
  const { settings, todayIso } = useFinance();
  const query = activityQuery(settings.currency, todayIso);
  return { ...useFinanceQuery(query.key, query.load), sinceDate: query.sinceDate };
}

/** Movimientos paginados con cursor; solo se piden más al acercarse al final de la lista. */
export function useTransactionPages(filter, pageSize = 30) {
  const { dataVersion } = useFinance();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const cursor = useRef(null);
  const request = useRef(0);
  const busy = useRef(false);

  const load = useCallback(
    async reset => {
      if (!reset && (busy.current || !cursor.current)) {
        return;
      }
      const id = reset ? ++request.current : request.current;
      busy.current = true;
      setLoading(true);
      try {
        const page = await store.listTransactionsPage({ filter, cursor: reset ? null : cursor.current, limit: pageSize });
        if (id !== request.current) {
          return; // llegó una consulta más nueva (cambio de filtro o de datos)
        }
        cursor.current = page.nextCursor;
        setHasMore(Boolean(page.nextCursor));
        setItems(prev => (reset ? page.items : [...prev, ...page.items]));
      } finally {
        if (id === request.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [filter, pageSize],
  );

  useEffect(() => {
    load(true);
  }, [load, dataVersion]);

  const loadMore = useCallback(() => load(false), [load]);
  return { items, loading, hasMore, loadMore };
}
