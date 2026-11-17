import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../theme';
import { Icon } from './Icon';

/**
 * Indicador de tendencia. Para gastos (goodWhen="down") bajar es ahorro (flecha
 * verde hacia abajo) y subir es incremento (flecha roja hacia arriba); para
 * ingresos o flujo neto (goodWhen="up") es al revés.
 */
export const TrendBadge = memo(function TrendBadge({ delta, goodWhen = 'down', compact = false }) {
  if (delta.trend === 'flat') {
    return (
      <View style={[styles.badge, compact && styles.compact, styles.flat]}>
        <Text style={[styles.text, styles.flatText]}>= igual</Text>
      </View>
    );
  }
  const good = delta.trend === goodWhen;
  const color = good ? colors.neonGreen : colors.softRed;
  const label = delta.pct === null ? 'nuevo' : `${Math.round(Math.abs(delta.pct) * 100)}%`;
  return (
    <View
      accessibilityLabel={`${delta.trend === 'up' ? 'Subió' : 'Bajó'} ${label}`}
      style={[styles.badge, compact && styles.compact, { backgroundColor: `${color}1F`, borderColor: `${color}66` }]}>
      <Icon name={delta.trend === 'up' ? 'arrowUp' : 'arrowDown'} size={compact ? 12 : 14} color={color} strokeWidth={2.8} />
      <Text style={[styles.text, compact && styles.compactText, { color }]}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  compact: { paddingHorizontal: 6, paddingVertical: 2 },
  text: { fontSize: 12.5, fontWeight: '700' },
  compactText: { fontSize: 11.5 },
  flat: { borderColor: colors.glassBorder, backgroundColor: 'rgba(255,255,255,0.06)' },
  flatText: { color: colors.textMuted },
});
