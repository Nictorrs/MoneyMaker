import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { haptic } from '../services/device';
import { CATEGORIES, colors, EXPENSE_CATEGORY_IDS, INCOME_CATEGORY_IDS, radii, type } from '../theme';
import { Chip } from './Glass';

export function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={type.overline}>{label}</Text>
      {children}
    </View>
  );
}

export const GlassInput = React.forwardRef(function GlassInput({ style, inputStyle, right, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.inputBox, focused && styles.inputFocused, style]}>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.violet}
        {...props}
        onFocus={e => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.input, props.multiline && styles.multiline, inputStyle]}
      />
      {right}
    </View>
  );
});

export function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.segmented}>
      {options.map(option => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptic();
              onChange(option.id);
            }}
            style={[styles.segment, active && { backgroundColor: `${option.color || colors.purple}55`, borderColor: option.color || colors.violet }]}>
            <Text style={[type.heading, !active && { color: colors.textMuted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function CategoryPicker({ txType, value, onChange }) {
  const ids = txType === 'income' ? INCOME_CATEGORY_IDS : EXPENSE_CATEGORY_IDS;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
      {ids.map(id => (
        <Chip key={id} label={CATEGORIES[id].label} color={CATEGORIES[id].color} active={value === id} onPress={() => onChange(id)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  inputBox: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 14 },
  inputFocused: { borderColor: colors.glassBorderPressed, backgroundColor: 'rgba(255,255,255,0.13)' },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 12 },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  segmented: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: 'rgba(255,255,255,0.06)' },
  categories: { gap: 8, paddingRight: 8 },
});
