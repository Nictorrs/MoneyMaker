import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DonutChart, IncomeExpenseChart } from '../components/Charts';
import { CategoryComparisonChart } from '../components/ComparisonChart';
import { GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { MonthPickerSheet } from '../components/MonthPicker';
import { TrendBadge } from '../components/TrendBadge';
import { compareMonths, daysInMonth, monthBounds, monthKeyOf, monthLabel, monthlySeries, shiftMonth } from '../lib/analytics';
import { formatMoney } from '../lib/format';
import { haptic } from '../services/device';
import { store } from '../services/storage';
import { useFinance, useFinanceQuery } from '../state/FinanceContext';
import { colors, fitFontSize, radii, type } from '../theme';
import { SectionTitle, useScreenPadding } from './Screen';

const NO_TOTALS = [];
const clamp = (key, min, max) => (key < min ? min : key > max ? max : key);

function Stat({ label, value, color = colors.text, delta, goodWhen, reference }) {
  return (
    <GlassCard blur={false} style={styles.stat} radius={radii.md} contentStyle={styles.statBody}>
      <Text style={type.overline}>{label}</Text>
      <Text style={[styles.statValue, { color, fontSize: fitFontSize(value, 20, 13) }]} numberOfLines={1}>
        {value}
      </Text>
      {delta && (
        <View style={styles.statTrend}>
          <TrendBadge delta={delta} goodWhen={goodWhen} compact />
          <Text style={styles.statReference} numberOfLines={1}>{`vs ${reference}`}</Text>
        </View>
      )}
    </GlassCard>
  );
}

function PeriodPill({ tag, label, color, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tag}: ${label}. Toca para elegir otro mes`}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={[styles.pill, { borderColor: `${color}AA` }]}>
      <View style={[styles.pillTag, { backgroundColor: color }]}>
        <Text style={styles.pillTagText}>{tag}</Text>
      </View>
      <Text style={styles.pillLabel} numberOfLines={1}>
        {label}
      </Text>
      <Icon name="chevron" size={14} color={colors.textMuted} />
    </Pressable>
  );
}

/** Analítica visual con filtros de mes a mes y comparativa A/B (time-travel filtering). */
export function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const padding = useScreenPadding();
  const { todayIso, settings } = useFinance();
  const currency = settings.currency;
  const currentMonth = monthKeyOf(todayIso);
  const todayDay = Number(todayIso.slice(8, 10));

  const [monthA, setMonthA] = useState(currentMonth);
  const [monthB, setMonthB] = useState(shiftMonth(currentMonth, -1));
  const [compare, setCompare] = useState(true);
  const [picker, setPicker] = useState(null);
  const [barHeight, setBarHeight] = useState(120);

  const range = useFinanceQuery('date-range', () => store.getDateRange());
  const minMonth = range.data?.first ? monthKeyOf(range.data.first) : shiftMonth(currentMonth, -11);

  // Si un mes está en curso, ambos se comparan sobre los mismos días para no inflar la diferencia.
  const dayCutoff = compare && (monthA === currentMonth || monthB === currentMonth) ? todayDay : null;
  const periodRange = month => ({
    fromDate: monthBounds(month).start,
    toDate: dayCutoff ? `${month}-${String(Math.min(dayCutoff, daysInMonth(month))).padStart(2, '0')}` : monthBounds(month).end,
  });

  const queryA = useFinanceQuery(`period|${currency}|${monthA}|${dayCutoff}`, () =>
    store.getMonthlyTotals({ currency, ...periodRange(monthA) }),
  );
  const queryB = useFinanceQuery(`period|${currency}|${monthB}|${dayCutoff}`, () =>
    store.getMonthlyTotals({ currency, ...periodRange(monthB) }),
  );
  const seriesQuery = useFinanceQuery(`series|${currency}|${monthA}`, () =>
    store.getMonthlyTotals({ currency, fromDate: monthBounds(shiftMonth(monthA, -5)).start, toDate: monthBounds(monthA).end }),
  );
  const merchantsQuery = useFinanceQuery(`merchants|${currency}|${monthA}`, () =>
    store.getMerchantTotals({ currency, month: monthA, limit: 5 }),
  );

  const comparison = useMemo(
    () =>
      compareMonths(queryA.data || NO_TOTALS, {
        monthA,
        monthB,
        todayIso,
        dayCutoff,
        totalsB: queryB.data || NO_TOTALS,
      }),
    [queryA.data, queryB.data, monthA, monthB, todayIso, dayCutoff],
  );
  const series = useMemo(() => monthlySeries(seriesQuery.data || NO_TOTALS, { anchorMonth: monthA }), [seriesQuery.data, monthA]);
  const summary = comparison.a;
  const money = value => formatMoney(value, currency);
  const periodSuffix = month => (dayCutoff ? ` (1–${Math.min(dayCutoff, daysInMonth(month))})` : '');
  const labelA = `${monthLabel(monthA)}${periodSuffix(monthA)}`;
  const labelB = `${monthLabel(monthB)}${periodSuffix(monthB)}`;
  const referenceB = `${monthLabel(monthB, { short: true })}${periodSuffix(monthB)}`;

  const selectA = key => {
    setMonthA(key);
    if (key === monthB) {
      setMonthB(clamp(shiftMonth(key, -1), minMonth, currentMonth));
    }
  };
  const swap = () => {
    haptic();
    setMonthA(monthB);
    setMonthB(monthA);
  };

  const shortcuts = (picker === 'A'
    ? [
        { key: currentMonth, label: 'Mes actual' },
        { key: shiftMonth(currentMonth, -1), label: 'Mes anterior' },
      ]
    : [
        { key: shiftMonth(monthA, -1), label: 'Mes previo a A' },
        { key: shiftMonth(monthA, -12), label: 'Mismo mes, año anterior' },
      ]
  ).filter(s => s.key >= minMonth && s.key <= currentMonth);

  const loadingFirstTime = (queryA.loading && !queryA.data) || (compare && queryB.loading && !queryB.data);

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[padding, styles.content, { paddingTop: insets.top + barHeight + 18 }]}
        showsVerticalScrollIndicator={false}>
        {loadingFirstTime ? (
          <GlassCard blur={false} contentStyle={styles.loading}>
            <ActivityIndicator color={colors.text} />
            <Text style={type.caption}>Calculando tu historial…</Text>
          </GlassCard>
        ) : (
          <>
            {compare && comparison.headline && (
              <GlassCard blur={false} radius={radii.md} contentStyle={styles.headline}>
                <View
                  style={[
                    styles.headlineIcon,
                    { backgroundColor: comparison.headline.trend === 'up' ? `${colors.softRed}26` : `${colors.neonGreen}26` },
                  ]}>
                  <Icon
                    name={comparison.headline.trend === 'up' ? 'arrowUp' : 'arrowDown'}
                    size={20}
                    strokeWidth={2.6}
                    color={comparison.headline.trend === 'up' ? colors.softRed : colors.neonGreen}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={type.body}>{comparison.headline.text}</Text>
                  {comparison.samePeriod && (
                    <Text style={styles.periodNote}>{`Mes en curso: se comparan los días 1 a ${dayCutoff} de cada mes.`}</Text>
                  )}
                </View>
              </GlassCard>
            )}

            <View style={styles.stats}>
              <Stat label="Gastado" value={money(summary.spent)} color={colors.softRed} delta={compare && comparison.spent} goodWhen="down" reference={referenceB} />
              <Stat label="Ingresado" value={money(summary.income)} color={colors.neonGreen} delta={compare && comparison.income} goodWhen="up" reference={referenceB} />
            </View>
            <View style={styles.stats}>
              <Stat
                label="Flujo neto"
                value={money(summary.net)}
                color={summary.net >= 0 ? colors.neonGreen : colors.softRed}
                delta={compare && comparison.net}
                goodWhen="up"
                reference={referenceB}
              />
              <Stat label="Promedio diario" value={money(summary.dailyAverage)} delta={compare && comparison.dailyAverage} goodWhen="down" reference={referenceB} />
            </View>

            {compare && (
              <>
                <SectionTitle title="Gasto por categoría: A vs. B" />
                <GlassCard blur={false} contentStyle={styles.card}>
                  <CategoryComparisonChart comparison={comparison} labelA={labelA} labelB={labelB} currency={currency} />
                </GlassCard>
              </>
            )}

            <SectionTitle title={`Distribución de ${labelA}`} />
            <GlassCard blur={false} contentStyle={styles.card}>
              <DonutChart data={summary.byCategory} currency={currency} />
            </GlassCard>

            <SectionTitle title="Ingresos vs. egresos (6 meses)" />
            <GlassCard blur={false} contentStyle={styles.card}>
              <IncomeExpenseChart key={monthA} series={series} currency={currency} />
            </GlassCard>

            {merchantsQuery.data?.length > 0 && (
              <>
                <SectionTitle title={`Dónde más gastaste en ${monthLabel(monthA)}`} />
                <GlassCard blur={false} contentStyle={styles.merchants}>
                  {merchantsQuery.data.map(({ merchant, total }, i) => (
                    <View key={merchant} style={styles.merchantRow}>
                      <Text style={styles.rank}>{i + 1}</Text>
                      <Text style={[type.body, styles.flex]} numberOfLines={1}>
                        {merchant}
                      </Text>
                      <Text style={type.heading}>{money(total)}</Text>
                    </View>
                  ))}
                </GlassCard>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Selector de periodo flotante, siempre visible sobre el contenido. */}
      <View style={[styles.periodBar, { top: insets.top + 6 }]} onLayout={e => setBarHeight(e.nativeEvent.layout.height)}>
        <GlassCard radius={radii.lg} contentStyle={styles.periodContent}>
          <View style={styles.periodHeader}>
            <View style={styles.flex}>
              <Text style={type.overline}>Comparativa histórica</Text>
              <Text style={type.title}>Analítica</Text>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: compare }}
              onPress={() => {
                haptic();
                setCompare(value => !value);
              }}
              style={[styles.compareToggle, compare && styles.compareToggleOn]}>
              <Icon name="swap" size={14} color={compare ? colors.night : colors.text} strokeWidth={2.2} />
              <Text style={[styles.compareText, compare && styles.compareTextOn]}>A/B</Text>
            </Pressable>
          </View>
          <View style={styles.periodRow}>
            <PeriodPill tag="A" label={monthLabel(monthA, { short: true })} color={colors.violet} onPress={() => setPicker('A')} />
            {compare && (
              <>
                <Pressable onPress={swap} hitSlop={8} accessibilityLabel="Intercambiar meses" style={styles.swap}>
                  <Icon name="swap" size={16} color={colors.textMuted} />
                </Pressable>
                <PeriodPill tag="B" label={monthLabel(monthB, { short: true })} color={colors.cyan} onPress={() => setPicker('B')} />
              </>
            )}
          </View>
        </GlassCard>
      </View>

      <MonthPickerSheet
        visible={picker !== null}
        title={picker === 'A' ? 'Mes a analizar (A)' : 'Mes de referencia (B)'}
        value={picker === 'B' ? monthB : monthA}
        minMonth={minMonth}
        maxMonth={currentMonth}
        shortcuts={shortcuts}
        onClose={() => setPicker(null)}
        onSelect={key => (picker === 'A' ? selectA(key) : setMonthB(key))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 16 },
  loading: { padding: 24, alignItems: 'center', gap: 10 },
  headline: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  headlineIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  periodNote: { fontSize: 11.5, color: colors.textFaint, marginTop: 4 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1 },
  statBody: { padding: 14, gap: 6 },
  statValue: { fontWeight: '700', letterSpacing: -0.4 },
  statTrend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statReference: { fontSize: 11, color: colors.textFaint, flexShrink: 1 },
  card: { padding: 16 },
  merchants: { padding: 16, gap: 12 },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '700', color: colors.night, backgroundColor: colors.cyan, overflow: 'hidden' },
  periodBar: { position: 'absolute', left: 12, right: 12 },
  periodContent: { padding: 14, gap: 12 },
  periodHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  compareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  compareToggleOn: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  compareText: { fontSize: 13, fontWeight: '700', color: colors.text },
  compareTextOn: { color: colors.night },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pillTag: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pillTagText: { fontSize: 12, fontWeight: '800', color: colors.night },
  pillLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  swap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
});
