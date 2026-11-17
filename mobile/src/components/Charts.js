import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { formatCompact, formatMoney } from '../lib/format';
import { arcPath, areaPath, donutSegments, smoothPath } from '../lib/geometry';
import { haptic } from '../services/device';
import { categoryMeta, colors, type } from '../theme';

const MAX_SLICES = 6;

function useEntrance(deps) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.setValue(0);
    Animated.timing(value, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/** Dona de gastos por categoría: tocar un segmento (o su leyenda) lo desglosa. */
export const DonutChart = memo(function DonutChart({ data, currency, size = 230, stroke = 26 }) {
  const [selected, setSelected] = useState(null);
  const slices = useMemo(() => {
    const top = data.slice(0, MAX_SLICES - 1);
    const rest = data.slice(MAX_SLICES - 1).reduce((sum, d) => sum + d.total, 0);
    const merged = rest > 0 ? [...top, { category: 'other', total: rest, grouped: true }] : top;
    const total = merged.reduce((sum, d) => sum + d.total, 0);
    return donutSegments(merged.map(d => d.total)).map((segment, i) => ({
      ...merged[i],
      ...segment,
      share: merged[i].total / total,
    }));
  }, [data]);
  const entrance = useEntrance([slices.length]);

  if (slices.length === 0) {
    return <Text style={[type.caption, styles.empty]}>Aún no hay gastos este mes.</Text>;
  }
  const total = slices.reduce((sum, s) => sum + s.total, 0);
  const active = selected !== null ? slices[selected] : null;
  const c = size / 2;
  const r = c - stroke / 2 - 6;
  const toggle = i => {
    haptic();
    setSelected(current => (current === i ? null : i));
  };

  return (
    <View style={styles.donutWrap}>
      <Animated.View style={{ opacity: entrance, transform: [{ rotate: entrance.interpolate({ inputRange: [0, 1], outputRange: ['-40deg', '0deg'] }) }] }}>
        <Svg width={size} height={size}>
          {slices.map((slice, i) => {
            const meta = categoryMeta(slice.category);
            const isActive = selected === i;
            return (
              <G key={`${slice.category}-${i}`} opacity={selected === null || isActive ? 1 : 0.3}>
                {isActive && (
                  <Path d={arcPath(c, c, r, slice.start, slice.end)} stroke={meta.color} strokeOpacity={0.35} strokeWidth={stroke + 16} strokeLinecap="round" fill="none" />
                )}
                <Path
                  d={arcPath(c, c, r, slice.start, slice.end)}
                  stroke={meta.color}
                  strokeWidth={isActive ? stroke + 6 : stroke}
                  strokeLinecap="round"
                  fill="none"
                  onPressIn={() => toggle(i)}
                />
              </G>
            );
          })}
        </Svg>
      </Animated.View>
      <View style={[styles.donutCenter, { width: size, height: size }]} pointerEvents="none">
        <Text style={type.overline}>{active ? (active.grouped ? 'Otras' : categoryMeta(active.category).label) : 'Gasto del mes'}</Text>
        <Text style={styles.donutValue}>{formatMoney(active ? active.total : total, currency)}</Text>
        {active && <Text style={type.caption}>{Math.round(active.share * 100)}% del total</Text>}
      </View>
      <View style={styles.legend}>
        {slices.map((slice, i) => {
          const meta = categoryMeta(slice.category);
          return (
            <Pressable key={`legend-${i}`} onPress={() => toggle(i)} style={[styles.legendItem, selected === i && styles.legendActive]}>
              <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
              <Text style={[type.caption, styles.legendLabel]} numberOfLines={1}>
                {slice.grouped ? 'Otras' : meta.label}
              </Text>
              <Text style={styles.legendShare}>{Math.round(slice.share * 100)}%</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

/** Ingresos vs. egresos por mes con curvas Bézier; tocar un mes muestra el detalle. */
export const IncomeExpenseChart = memo(function IncomeExpenseChart({ series, currency, height = 210 }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(series.length - 1);
  const entrance = useEntrance([series.length, width > 0]);

  const pad = { top: 16, right: 12, bottom: 28, left: 44 };
  const innerW = Math.max(width - pad.left - pad.right, 1);
  const innerH = height - pad.top - pad.bottom;
  const maxY = Math.max(1, ...series.flatMap(m => [m.income, m.expense])) * 1.15;
  const x = i => pad.left + (series.length > 1 ? (i / (series.length - 1)) * innerW : innerW / 2);
  const y = v => pad.top + innerH - (v / maxY) * innerH;
  const incomePts = series.map((m, i) => ({ x: x(i), y: y(m.income) }));
  const expensePts = series.map((m, i) => ({ x: x(i), y: y(m.expense) }));
  const baseline = pad.top + innerH;
  const month = series[selected];

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.lineLegend}>
        <LegendPill color={colors.neonGreen} label="Ingresos" value={month && formatMoney(month.income, currency)} />
        <LegendPill color={colors.softRed} label="Egresos" value={month && formatMoney(month.expense, currency)} />
      </View>
      {width > 0 && (
        <Animated.View style={{ opacity: entrance }}>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="incomeArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.neonGreen} stopOpacity="0.35" />
                <Stop offset="1" stopColor={colors.neonGreen} stopOpacity="0" />
              </LinearGradient>
              <LinearGradient id="expenseArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.softRed} stopOpacity="0.3" />
                <Stop offset="1" stopColor={colors.softRed} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            {[0, 0.5, 1].map(f => (
              <G key={f}>
                <Line x1={pad.left} x2={width - pad.right} y1={y(maxY * f)} y2={y(maxY * f)} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 6" />
                <SvgText x={pad.left - 8} y={y(maxY * f) + 4} fill={colors.textFaint} fontSize="10" textAnchor="end">
                  {formatCompact(maxY * f)}
                </SvgText>
              </G>
            ))}
            <Line x1={x(selected)} x2={x(selected)} y1={pad.top} y2={baseline} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
            <Path d={areaPath(incomePts, baseline)} fill="url(#incomeArea)" />
            <Path d={areaPath(expensePts, baseline)} fill="url(#expenseArea)" />
            <Path d={smoothPath(incomePts)} stroke={colors.neonGreen} strokeWidth={3} fill="none" strokeLinecap="round" />
            <Path d={smoothPath(expensePts)} stroke={colors.softRed} strokeWidth={3} fill="none" strokeLinecap="round" />
            {[incomePts[selected], expensePts[selected]].map((p, i) =>
              p ? <Circle key={i} cx={p.x} cy={p.y} r={5.5} fill={colors.night} stroke={i ? colors.softRed : colors.neonGreen} strokeWidth={3} /> : null,
            )}
            {series.map((m, i) => (
              <G key={m.key}>
                <SvgText x={x(i)} y={height - 8} fill={i === selected ? colors.text : colors.textFaint} fontSize="11" fontWeight="600" textAnchor="middle">
                  {m.label}
                </SvgText>
                <Rect
                  x={x(i) - innerW / Math.max(series.length - 1, 1) / 2}
                  y={0}
                  width={innerW / Math.max(series.length - 1, 1)}
                  height={height}
                  fill="transparent"
                  onPressIn={() => {
                    haptic();
                    setSelected(i);
                  }}
                />
              </G>
            ))}
          </Svg>
        </Animated.View>
      )}
    </View>
  );
});

function LegendPill({ color, label, value }) {
  return (
    <View style={styles.pill}>
      <View style={[styles.legendDot, { backgroundColor: color, shadowColor: color }]} />
      <View>
        <Text style={type.overline}>{label}</Text>
        <Text style={[type.heading, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', paddingVertical: 32 },
  donutWrap: { alignItems: 'center' },
  donutCenter: { position: 'absolute', top: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  donutValue: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'transparent' },
  legendActive: { borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.16)' },
  legendDot: { width: 9, height: 9, borderRadius: 5, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  legendLabel: { maxWidth: 110 },
  legendShare: { fontSize: 12, fontWeight: '700', color: colors.text },
  lineLegend: { flexDirection: 'row', gap: 24, marginBottom: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
