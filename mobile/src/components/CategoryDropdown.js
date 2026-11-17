import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { haptic } from '../services/device';
import { CATEGORIES, categoryMeta, colors, EXPENSE_CATEGORY_IDS, INCOME_CATEGORY_IDS, radii, type } from '../theme';
import { Icon } from './Icon';
import { CategoryBubble } from './TransactionRow';

const SOURCE_BADGES = {
  claude: 'Sugerida por IA',
  rules: 'Sugerida automáticamente',
  'bank-parser': 'Sugerida por el lector bancario',
  learned: 'Aprendida de tus correcciones',
};

/**
 * Menú desplegable de categoría. Muestra de dónde viene la sugerencia y deja
 * claro cuándo el usuario la corrigió (esa corrección alimenta el feedback loop).
 */
export const CategoryDropdown = memo(function CategoryDropdown({ txType, value, suggested, suggestionSource, onChange }) {
  const [open, setOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const ids = txType === 'income' ? INCOME_CATEGORY_IDS : EXPENSE_CATEGORY_IDS;
  const meta = categoryMeta(value);
  const corrected = Boolean(suggested) && value !== suggested;
  const badge = corrected
    ? { text: 'Corregida por ti · la app lo recordará', color: colors.amber, icon: 'edit' }
    : { text: SOURCE_BADGES[suggestionSource] || SOURCE_BADGES.rules, color: suggestionSource === 'learned' ? colors.cyan : colors.violet, icon: 'sparkles' };

  const select = id => {
    haptic();
    onChange(id);
    setOpen(false);
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Categoría: ${meta.label}. Toca para cambiarla`}
        onPress={() => {
          haptic();
          setOpen(current => !current);
        }}
        style={[styles.trigger, open && styles.triggerOpen]}>
        <CategoryBubble category={value} size={40} />
        <View style={styles.flex}>
          <Text style={type.heading}>{meta.label}</Text>
          <View style={styles.badgeRow}>
            <Icon name={badge.icon} size={12} color={badge.color} strokeWidth={2.2} />
            <Text style={[styles.badge, { color: badge.color }]} numberOfLines={1}>
              {badge.text}
            </Text>
          </View>
        </View>
        <Animated.View
          style={{ transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '270deg'] }) }] }}>
          <Icon name="chevron" size={18} color={colors.textMuted} />
        </Animated.View>
      </Pressable>

      {open && (
        <Animated.View
          style={[
            styles.menu,
            { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] },
          ]}>
          {ids.map(id => {
            const option = CATEGORIES[id];
            const selected = id === value;
            return (
              <Pressable
                key={id}
                accessibilityRole="menuitem"
                accessibilityState={{ selected }}
                onPress={() => select(id)}
                style={[styles.option, selected && styles.optionSelected]}>
                <Icon name={option.icon} size={18} color={option.color} strokeWidth={2} />
                <Text style={[type.body, styles.flex]}>{option.label}</Text>
                {id === suggested && <Text style={styles.suggestedTag}>Sugerida</Text>}
                {selected && <Icon name="check" size={16} color={colors.neonGreen} strokeWidth={2.6} />}
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  triggerOpen: { borderColor: colors.glassBorderPressed, backgroundColor: 'rgba(255,255,255,0.13)' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  badge: { fontSize: 11.5, fontWeight: '600' },
  menu: {
    marginTop: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: 'rgba(18,10,44,0.92)',
    paddingVertical: 6,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14 },
  optionSelected: { backgroundColor: 'rgba(255,255,255,0.1)' },
  suggestedTag: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.violet,
    borderWidth: 1,
    borderColor: `${colors.violet}88`,
    borderRadius: radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
});
