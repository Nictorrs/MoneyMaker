import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '../lib/format';
import { categoryMeta, colors, radii, type } from '../theme';
import { CategoryBubble } from './TransactionRow';
import { TrendBadge } from './TrendBadge';

const ComparisonRow = memo(function ComparisonRow({ row, maxValue, labelB, currency }) {
  const meta = categoryMeta(row.category);
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [grow, row.a, row.b]);

  const width = value => `${maxValue > 0 ? Math.max(value > 0 ? 2 : 0, (value / maxValue) * 100) : 0}%`;
  const growStyle = { transform: [{ scaleX: grow }], transformOrigin: 'left center' };

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <CategoryBubble category={row.category} size={30} />
        <Text style={[type.body, styles.flex]} numberOfLines={1}>
          {meta.label}
        </Text>
        <Text style={styles.amount}>{formatMoney(row.a, currency)}</Text>
        <TrendBadge delta={row} goodWhen="down" compact />
      </View>
      <View style={styles.track}>
        {/* Mes B: contorno de referencia; mes A: barra sólida superpuesta. */}
        <Animated.View style={[styles.barB, { width: width(row.b) }, growStyle]} />
        <Animated.View
          style={[styles.barA, { width: width(row.a), backgroundColor: meta.color, shadowColor: meta.color }, growStyle]}
        />
      </View>
      <Text style={styles.reference}>
        {labelB}: {row.b > 0 ? formatMoney(row.b, currency) : 'sin gastos'}
      </Text>
    </View>
  );
});

/** Gasto por categoría del mes A frente al mes B, con barras superpuestas y tendencia. */
export const CategoryComparisonChart = memo(function CategoryComparisonChart({ comparison, labelA, labelB, currency }) {
  if (comparison.rows.length === 0) {
    return <Text style={[type.caption, styles.empty]}>No hay gastos en ninguno de los dos meses.</Text>;
  }
  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.swatchA]} />
          <Text style={type.caption}>{labelA}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.swatchB]} />
          <Text style={type.caption}>{labelB}</Text>
        </View>
      </View>
      {comparison.rows.map(row => (
        <ComparisonRow key={row.category} row={row} maxValue={comparison.maxValue} labelB={labelB} currency={currency} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: 16 },
  empty: { textAlign: 'center', paddingVertical: 24 },
  legend: { flexDirection: 'row', gap: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 10, borderRadius: 3 },
  swatchA: { backgroundColor: colors.violet },
  swatchB: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  row: { gap: 8 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amount: { fontSize: 14, fontWeight: '700', color: colors.text },
  track: { height: 16, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center' },
  barB: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 16,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  barA: {
    position: 'absolute',
    left: 0,
    top: 4,
    height: 8,
    borderRadius: radii.pill,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  reference: { fontSize: 11.5, color: colors.textFaint },
});
